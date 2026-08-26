import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { SettingsService } from '../settings/settings.service';
import {
  VIP_DIAMOND_THRESHOLD_PHP_KEY,
  VIP_GOLD_THRESHOLD_PHP_KEY,
} from '../settings/consignment-setting-keys';
import { Client } from './entities/client.entity';
import {
  clientVipStatusRank,
  deriveClientVipStatus,
  normalizeClientVipStatus,
} from './client-vip-status.util';

const DEFAULT_VIP_GOLD_THRESHOLD_PHP = 300_000;
const DEFAULT_VIP_DIAMOND_THRESHOLD_PHP = 600_000;

export type SoldUnderWarrantyActivityInput = {
  buyerClientId: string;
  purchasePesos: number;
  consignorClientId: string | null;
  consignmentPesos: number;
  actorUserId: string;
};

@Injectable()
export class ClientActivityTotalsService {
  constructor(private readonly settings: SettingsService) {}

  async applySoldUnderWarrantyTotals(
    em: EntityManager,
    input: SoldUnderWarrantyActivityInput,
  ): Promise<void> {
    const purchaseDelta = Math.max(0, Math.round(input.purchasePesos));
    const consignmentDelta =
      input.consignorClientId != null
        ? Math.max(0, Math.round(input.consignmentPesos))
        : 0;

    if (purchaseDelta <= 0 && consignmentDelta <= 0) {
      return;
    }

    const [goldThreshold, diamondThreshold] = await Promise.all([
      this.settings.getNumericValue(
        VIP_GOLD_THRESHOLD_PHP_KEY,
        DEFAULT_VIP_GOLD_THRESHOLD_PHP,
      ),
      this.settings.getNumericValue(
        VIP_DIAMOND_THRESHOLD_PHP_KEY,
        DEFAULT_VIP_DIAMOND_THRESHOLD_PHP,
      ),
    ]);

    const buyerId = input.buyerClientId;
    const consignorId =
      input.consignorClientId != null && consignmentDelta > 0
        ? input.consignorClientId
        : null;

    const idsToLock: string[] = [];
    if (purchaseDelta > 0) {
      idsToLock.push(buyerId);
    }
    if (consignorId && !idsToLock.includes(consignorId)) {
      idsToLock.push(consignorId);
    }
    idsToLock.sort();

    const locked = new Map<string, Client>();
    for (const id of idsToLock) {
      const client = await em.findOne(Client, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (client) {
        locked.set(id, client);
      }
    }

    const buyer = locked.get(buyerId);
    const buyerNeedsUpdate =
      purchaseDelta > 0 || consignorId === buyerId;
    if (buyer && buyerNeedsUpdate) {
      if (purchaseDelta > 0) {
        buyer.totalPurchases = (buyer.totalPurchases ?? 0) + purchaseDelta;
      }
      if (consignorId === buyerId) {
        buyer.totalConsignments =
          (buyer.totalConsignments ?? 0) + consignmentDelta;
      }
      this.applyVipUpgrade(buyer, goldThreshold, diamondThreshold);
      buyer.updatedById = input.actorUserId;
      await em.save(buyer);
    }

    if (consignorId && consignorId !== buyerId) {
      const consignor = locked.get(consignorId);
      if (consignor) {
        consignor.totalConsignments =
          (consignor.totalConsignments ?? 0) + consignmentDelta;
        this.applyVipUpgrade(consignor, goldThreshold, diamondThreshold);
        consignor.updatedById = input.actorUserId;
        await em.save(consignor);
      }
    }
  }

  private applyVipUpgrade(
    client: Client,
    goldThreshold: number,
    diamondThreshold: number,
  ): void {
    const current = normalizeClientVipStatus(client.vipStatus);
    const derived = deriveClientVipStatus(
      (client.totalPurchases ?? 0) + (client.totalConsignments ?? 0),
      goldThreshold,
      diamondThreshold,
    );
    if (clientVipStatusRank(derived) > clientVipStatusRank(current)) {
      client.vipStatus = derived;
    }
  }
}
