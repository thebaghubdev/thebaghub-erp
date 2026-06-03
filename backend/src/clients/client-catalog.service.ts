import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';

const AVAILABLE_FOR_PURCHASE_STATUS = 'Available For Purchase';
const ON_HOLD_STATUS = 'On Hold';

const CLIENT_CATALOG_STATUSES = [
  AVAILABLE_FOR_PURCHASE_STATUS,
  ON_HOLD_STATUS,
];

export type ClientCatalogItem = {
  id: string;
  sku: string;
  itemLabel: string;
  brand: string | null;
  category: string | null;
  productName: string;
  price: string | null;
  priceComparison: string | null;
  productDescription: string | null;
  imageUrl: string | null;
  status: string;
};

export type ClientCatalogItemDetail = ClientCatalogItem & {
  dateReceived: string;
  status: string;
  transactionType: string | null;
  currentBranch: string;
  enableDiscount: boolean;
  collections: string[];
  tags: string[];
  photos: Array<{ key: string; url: string; position: number | null }>;
  itemDetails: Record<string, unknown>;
};

function snapshotFormString(
  form: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = form?.[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function itemLabelFromSnapshot(item: InventoryItem): string {
  const form = item.itemSnapshot?.form as Record<string, unknown> | undefined;
  const brand = snapshotFormString(form, 'brand');
  const model = snapshotFormString(form, 'itemModel');
  if (brand && model) return `${brand} — ${model}`;
  return brand ?? model ?? 'Item';
}

function firstPhotoUrl(snapshot: Array<Record<string, unknown>>): string | null {
  const sorted = [...snapshot].sort(
    (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
  );
  for (const photo of sorted) {
    const url = photo.url;
    if (typeof url !== 'string') continue;
    const trimmed = url.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function photosFromSnapshot(
  snapshot: Array<Record<string, unknown>>,
): Array<{ key: string; url: string; position: number | null }> {
  return [...snapshot]
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .flatMap((photo) => {
      const key = typeof photo.key === 'string' ? photo.key.trim() : '';
      const url = typeof photo.url === 'string' ? photo.url.trim() : '';
      if (!key || !url) return [];
      const rawPosition = Number(photo.position);
      return [
        {
          key,
          url,
          position: Number.isFinite(rawPosition) ? rawPosition : null,
        },
      ];
    });
}

@Injectable()
export class ClientCatalogService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
  ) {}

  async findAvailableItems(): Promise<ClientCatalogItem[]> {
    const rows = await this.inventoryRepo.find({
      where: { status: In(CLIENT_CATALOG_STATUSES) },
      relations: { itemPosting: true },
      order: { updatedAt: 'DESC' },
    });

    return rows.map((item) => {
      const form = item.itemSnapshot?.form as Record<string, unknown> | undefined;
      const posting = item.itemPosting;
      const photos = Array.isArray(posting?.selectedPhotosSnapshot)
        ? posting.selectedPhotosSnapshot
        : [];
      return {
        id: item.id,
        sku: item.sku,
        itemLabel: itemLabelFromSnapshot(item),
        brand: snapshotFormString(form, 'brand'),
        category: snapshotFormString(form, 'category'),
        productName: posting?.productName?.trim() || itemLabelFromSnapshot(item),
        price:
          item.tbhSellingPrice != null &&
          String(item.tbhSellingPrice).trim() !== ''
            ? String(item.tbhSellingPrice)
            : null,
        priceComparison:
          posting?.priceComparison != null &&
          String(posting.priceComparison).trim() !== ''
            ? String(posting.priceComparison)
            : null,
        productDescription:
          posting?.productDescription != null &&
          String(posting.productDescription).trim() !== ''
            ? String(posting.productDescription).trim()
            : null,
        imageUrl: firstPhotoUrl(photos),
        status: item.status,
      };
    });
  }

  async findAvailableItemDetail(id: string): Promise<ClientCatalogItemDetail> {
    const item = await this.inventoryRepo.findOne({
      where: { id, status: AVAILABLE_FOR_PURCHASE_STATUS },
      relations: { itemPosting: true },
    });
    if (!item) {
      throw new NotFoundException('Catalog item not found');
    }

    const form = item.itemSnapshot?.form as Record<string, unknown> | undefined;
    const posting = item.itemPosting;
    const photos = Array.isArray(posting?.selectedPhotosSnapshot)
      ? posting.selectedPhotosSnapshot
      : [];
    const itemLabel = itemLabelFromSnapshot(item);
    return {
      id: item.id,
      sku: item.sku,
      itemLabel,
      brand: snapshotFormString(form, 'brand'),
      category: snapshotFormString(form, 'category'),
      productName: posting?.productName?.trim() || itemLabel,
      price:
        item.tbhSellingPrice != null &&
        String(item.tbhSellingPrice).trim() !== ''
          ? String(item.tbhSellingPrice)
          : null,
      priceComparison:
        posting?.priceComparison != null &&
        String(posting.priceComparison).trim() !== ''
          ? String(posting.priceComparison)
          : null,
      productDescription:
        posting?.productDescription != null &&
        String(posting.productDescription).trim() !== ''
          ? String(posting.productDescription).trim()
          : null,
      imageUrl: firstPhotoUrl(photos),
      dateReceived: item.dateReceived.toISOString(),
      status: item.status,
      transactionType: item.transactionType,
      currentBranch: item.currentBranch,
      enableDiscount: item.enableDiscount,
      collections: posting?.collections ?? [],
      tags: posting?.tags ?? [],
      photos: photosFromSnapshot(photos),
      itemDetails: { ...(form ?? {}) },
    };
  }
}
