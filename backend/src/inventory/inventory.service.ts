import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { InquiryItemSnapshot } from '../inquiries/entities/inquiry.entity';
import { InventoryItem } from './entities/inventory-item.entity';

export type InventoryListRow = {
  id: string;
  sku: string;
  dateReceived: string;
  inquiryId: string | null;
  consignorName: string | null;
  status: string;
  transactionType: string | null;
  currentBranch: string;
  itemLabel: string;
  inclusions: string;
};

export type InventoryDetailForStaff = {
  id: string;
  sku: string;
  dateReceived: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  transactionType: string | null;
  currentBranch: string;
  inquiryId: string | null;
  inquirySku: string | null;
  consignorId: string | null;
  consignorName: string | null;
  consignorEmail: string | null;
  consignorPhone: string | null;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
  };
};

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

function inclusionsFromSnapshot(
  snapshot: InquiryItemSnapshot | null | undefined,
): string {
  if (!snapshot?.form) return '—';
  const v = snapshot.form['inclusions'];
  if (v == null) return '—';
  const s = String(v).trim();
  return s.length > 0 ? s : '—';
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
  ) {}

  async findAllForStaff(): Promise<InventoryListRow[]> {
    const rows = await this.inventoryRepo.find({
      relations: { inquiry: true, consignor: true },
      order: { dateReceived: 'DESC' },
    });
    return rows.map((r) => {
      const name = r.consignor
        ? [r.consignor.firstName, r.consignor.lastName].filter(Boolean).join(' ').trim()
        : '';
      return {
        id: r.id,
        sku: r.sku,
        dateReceived: r.dateReceived.toISOString(),
        inquiryId: r.inquiryId,
        consignorName: name || null,
        status: r.status,
        transactionType: r.transactionType,
        currentBranch: r.currentBranch,
        itemLabel: itemLabelFromSnapshot(r.itemSnapshot),
        inclusions: inclusionsFromSnapshot(r.itemSnapshot),
      };
    });
  }

  async findOneForStaff(id: string): Promise<InventoryDetailForStaff> {
    const r = await this.inventoryRepo.findOne({
      where: { id },
      relations: { inquiry: true, consignor: true },
    });
    if (!r) {
      throw new NotFoundException('Inventory item not found');
    }
    const c = r.consignor;
    const name = c
      ? [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
      : '';
    return {
      id: r.id,
      sku: r.sku,
      dateReceived: r.dateReceived.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      status: r.status,
      transactionType: r.transactionType,
      currentBranch: r.currentBranch,
      inquiryId: r.inquiryId,
      inquirySku: r.inquiry?.sku ?? null,
      consignorId: r.consignorId,
      consignorName: name || null,
      consignorEmail: c?.email?.trim() ?? null,
      consignorPhone: c?.contactNumber?.trim() ?? null,
      itemSnapshot: {
        clientItemId: r.itemSnapshot.clientItemId,
        form: (r.itemSnapshot.form ?? {}) as Record<string, unknown>,
      },
    };
  }
}
