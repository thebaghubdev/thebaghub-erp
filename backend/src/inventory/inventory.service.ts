import { Injectable } from '@nestjs/common';
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
}
