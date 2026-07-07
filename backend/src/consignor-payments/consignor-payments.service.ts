import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import {
  Inquiry,
  type InquiryItemSnapshot,
} from '../inquiries/entities/inquiry.entity';
import { CONSIGNOR_PAYMENT_STATUS_PENDING } from './consignor-payment.constants';
import {
  ConsignorPayment,
  ConsignorPaymentGroup,
  ConsignorPaymentItem,
} from './entities/consignor-payment.entities';

export type RecordConsignorPaymentItemParams = {
  inquiryId: string;
  consignorClientId: string;
  /** YYYY-MM-DD in app calendar timezone. */
  auditDate: string;
};

export type ConsignorPaymentListRow = {
  id: string;
  auditDate: string;
  status: string;
  groupCount: number;
  itemCount: number;
};

export type ConsignorPaymentItemRow = {
  id: string;
  inquiryId: string;
  inquirySku: string;
  itemLabel: string;
  offerPrice: string | null;
  inventorySku: string | null;
};

export type ConsignorPaymentGroupRow = {
  id: string;
  clientId: string;
  consignorName: string;
  consignorEmail: string;
  preferredPaymentMethod:
    | 'check_pickup'
    | 'cash_pickup'
    | 'direct_deposit'
    | null;
  preferredPaymentBranch: 'pasig' | 'makati' | null;
  items: ConsignorPaymentItemRow[];
};

export type ConsignorPaymentDetail = {
  id: string;
  auditDate: string;
  status: string;
  groups: ConsignorPaymentGroupRow[];
};

function formatPgDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function itemLabelFromSnapshot(
  snapshot: InquiryItemSnapshot | null | undefined,
): string {
  if (!snapshot?.form) return 'Item';
  const form = snapshot.form as { brand?: string; itemModel?: string };
  const brand = (form.brand ?? '').trim();
  const model = (form.itemModel ?? '').trim();
  if (!brand && !model) return 'Item';
  if (!brand) return model;
  if (!model) return brand;
  return `${brand} — ${model}`;
}

function clientDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string | null | undefined,
): string {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || email?.trim() || 'Consignor';
}

@Injectable()
export class ConsignorPaymentsService {
  constructor(
    @InjectRepository(ConsignorPayment)
    private readonly paymentsRepo: Repository<ConsignorPayment>,
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
  ) {}

  async findAllForStaff(): Promise<ConsignorPaymentListRow[]> {
    const payments = await this.paymentsRepo.find({
      relations: { groups: { items: true } },
      order: { auditDate: 'DESC' },
    });

    return payments.map((payment) => ({
      id: payment.id,
      auditDate: formatPgDate(payment.auditDate),
      status: payment.status,
      groupCount: payment.groups?.length ?? 0,
      itemCount:
        payment.groups?.reduce(
          (sum, group) => sum + (group.items?.length ?? 0),
          0,
        ) ?? 0,
    }));
  }

  async findOneForStaff(id: string): Promise<ConsignorPaymentDetail> {
    const payment = await this.paymentsRepo.findOne({
      where: { id },
      relations: {
        groups: {
          client: true,
          items: { inquiry: true },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException('Consignor payment not found');
    }

    const inquiryIds =
      payment.groups?.flatMap((group) =>
        (group.items ?? []).map((item) => item.inquiryId),
      ) ?? [];
    const inventoryByInquiry = new Map<string, string>();
    if (inquiryIds.length > 0) {
      const inventoryRows = await this.inventoryRepo.find({
        where: { inquiryId: In(inquiryIds) },
        select: { id: true, inquiryId: true, sku: true },
      });
      for (const row of inventoryRows) {
        if (row.inquiryId) {
          inventoryByInquiry.set(row.inquiryId, row.sku);
        }
      }
    }

    const groups: ConsignorPaymentGroupRow[] = (payment.groups ?? [])
      .map((group) => {
        const client = group.client;
        const items: ConsignorPaymentItemRow[] = (group.items ?? []).map(
          (item) => {
            const inquiry = item.inquiry;
            return {
              id: item.id,
              inquiryId: item.inquiryId,
              inquirySku: inquiry?.sku ?? '—',
              itemLabel: itemLabelFromSnapshot(inquiry?.itemSnapshot),
              offerPrice:
                inquiry?.offerPrice != null &&
                String(inquiry.offerPrice).trim() !== ''
                  ? String(inquiry.offerPrice)
                  : null,
              inventorySku: inventoryByInquiry.get(item.inquiryId) ?? null,
            };
          },
        );
        items.sort((a, b) => a.inquirySku.localeCompare(b.inquirySku));

        return {
          id: group.id,
          clientId: group.clientId,
          consignorName: clientDisplayName(
            client?.firstName,
            client?.lastName,
            client?.email,
          ),
          consignorEmail: client?.email?.trim() ?? '',
          preferredPaymentMethod: client?.preferredPaymentMethod ?? null,
          preferredPaymentBranch: client?.preferredPaymentBranch ?? null,
          items,
        };
      })
      .sort((a, b) => a.consignorName.localeCompare(b.consignorName));

    return {
      id: payment.id,
      auditDate: formatPgDate(payment.auditDate),
      status: payment.status,
      groups,
    };
  }

  async recordItemForSoldFinalConsignment(
    manager: EntityManager,
    params: RecordConsignorPaymentItemParams,
  ): Promise<void> {
    const existingItem = await manager.findOne(ConsignorPaymentItem, {
      where: { inquiryId: params.inquiryId },
    });
    if (existingItem) {
      return;
    }

    const payment = await this.findOrCreatePayment(manager, params.auditDate);
    const group = await this.findOrCreateGroup(
      manager,
      payment.id,
      params.consignorClientId,
    );

    await manager.save(
      ConsignorPaymentItem,
      manager.create(ConsignorPaymentItem, {
        inquiryId: params.inquiryId,
        consignorPaymentGroup: group,
      }),
    );
  }

  private async findOrCreatePayment(
    manager: EntityManager,
    auditDate: string,
  ): Promise<ConsignorPayment> {
    const existing = await manager.findOne(ConsignorPayment, {
      where: { auditDate: auditDate as unknown as Date },
    });
    if (existing) {
      return existing;
    }

    try {
      return await manager.save(
        ConsignorPayment,
        manager.create(ConsignorPayment, {
          auditDate: auditDate as unknown as Date,
          status: CONSIGNOR_PAYMENT_STATUS_PENDING,
        }),
      );
    } catch {
      const raced = await manager.findOne(ConsignorPayment, {
        where: { auditDate: auditDate as unknown as Date },
      });
      if (raced) {
        return raced;
      }
      throw new Error(
        `Failed to find or create consignor payment for audit date ${auditDate}`,
      );
    }
  }

  private async findOrCreateGroup(
    manager: EntityManager,
    consignorPaymentsId: string,
    clientId: string,
  ): Promise<ConsignorPaymentGroup> {
    const existing = await manager.findOne(ConsignorPaymentGroup, {
      where: { consignorPaymentsId, clientId },
    });
    if (existing) {
      return existing;
    }

    try {
      return await manager.save(
        ConsignorPaymentGroup,
        manager.create(ConsignorPaymentGroup, {
          consignorPaymentsId,
          clientId,
        }),
      );
    } catch {
      const raced = await manager.findOne(ConsignorPaymentGroup, {
        where: { consignorPaymentsId, clientId },
      });
      if (raced) {
        return raced;
      }
      throw new Error(
        `Failed to find or create consignor payment group for client ${clientId}`,
      );
    }
  }
}
