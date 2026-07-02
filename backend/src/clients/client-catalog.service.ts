import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JwtUser } from '../auth/jwt-user';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { ItemAuthentication } from '../inventory/entities/item-authentication.entity';
import { Waitlist } from '../orders/entities/waitlist.entity';
import { Client } from './entities/client.entity';

const AVAILABLE_FOR_PURCHASE_STATUS = 'Available For Purchase';
const ON_HOLD_STATUS = 'On Hold';
const FOR_REPRICING_STATUS = 'For Repricing';
const FOR_CONTRACT_RENEWAL_STATUS = 'For Contract Renewal';

const CLIENT_CATALOG_STATUSES = [
  AVAILABLE_FOR_PURCHASE_STATUS,
  ON_HOLD_STATUS,
  FOR_REPRICING_STATUS,
  FOR_CONTRACT_RENEWAL_STATUS,
];

const CLIENT_WAITLISTABLE_STATUSES = [
  ON_HOLD_STATUS,
  FOR_REPRICING_STATUS,
  FOR_CONTRACT_RENEWAL_STATUS,
];

function clientVisibleStatus(status: string): string {
  if (
    status === FOR_REPRICING_STATUS ||
    status === FOR_CONTRACT_RENEWAL_STATUS
  ) {
    return ON_HOLD_STATUS;
  }
  return status;
}

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
  isOwnConsignedItem: boolean;
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

export type ClientWaitlistSummary = {
  id: string;
  inventoryItemId: string;
  clientId: string;
  createdAt: string;
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

function itemDetailsFromSnapshotAndAuth(
  form: Record<string, unknown> | undefined,
  auth: ItemAuthentication | null | undefined,
): Record<string, unknown> {
  const details: Record<string, unknown> = { ...(form ?? {}) };
  if (auth?.rating?.trim()) details.rating = auth.rating.trim();
  if (auth?.dimensions?.trim()) details.dimensions = auth.dimensions.trim();
  if (auth?.marketPrice?.trim()) details.marketPrice = auth.marketPrice.trim();
  if (auth?.retailPrice?.trim()) details.retailPrice = auth.retailPrice.trim();
  if (auth?.marketResearchNotes?.trim()) {
    details.marketResearchNotes = auth.marketResearchNotes.trim();
  }
  if (auth?.marketResearchLink?.trim()) {
    details.marketResearchLink = auth.marketResearchLink.trim();
  }
  if (auth?.authenticatorNotes?.trim()) {
    details.authenticatorNotes = auth.authenticatorNotes.trim();
  }
  return details;
}

@Injectable()
export class ClientCatalogService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
    @InjectRepository(ItemAuthentication)
    private readonly itemAuthRepo: Repository<ItemAuthentication>,
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
    @InjectRepository(Waitlist)
    private readonly waitlistsRepo: Repository<Waitlist>,
  ) {}

  async findAvailableItems(user: JwtUser): Promise<ClientCatalogItem[]> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const rows = await this.inventoryRepo.find({
      where: { status: In(CLIENT_CATALOG_STATUSES) },
      relations: { itemPosting: true },
      order: { updatedAt: 'DESC' },
    });
    const authByItemId = new Map<string, ItemAuthentication>();
    if (rows.length > 0) {
      const auths = await this.itemAuthRepo.find({
        where: { inventoryItemId: In(rows.map((row) => row.id)) },
      });
      for (const auth of auths) {
        authByItemId.set(auth.inventoryItemId, auth);
      }
    }

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
        status: clientVisibleStatus(item.status),
        isOwnConsignedItem: item.consignorId === client.id,
      };
    });
  }

  async findAvailableItemDetail(
    user: JwtUser,
    id: string,
  ): Promise<ClientCatalogItemDetail> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const item = await this.inventoryRepo.findOne({
      where: { id, status: AVAILABLE_FOR_PURCHASE_STATUS },
      relations: { itemPosting: true },
    });
    if (!item) {
      throw new NotFoundException('Catalog item not found');
    }

    const auth = await this.itemAuthRepo.findOne({
      where: { inventoryItemId: item.id },
    });

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
      itemDetails: itemDetailsFromSnapshotAndAuth(form, auth),
      isOwnConsignedItem: item.consignorId === client.id,
    };
  }

  async addToWaitlist(
    user: JwtUser,
    inventoryItemId: string,
  ): Promise<ClientWaitlistSummary> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const item = await this.inventoryRepo.findOne({
      where: { id: inventoryItemId },
    });
    if (!item) {
      throw new NotFoundException('Catalog item not found');
    }
    if (item.consignorId === client.id) {
      throw new BadRequestException('This is your item and you cannot buy it.');
    }
    if (!CLIENT_WAITLISTABLE_STATUSES.includes(item.status)) {
      throw new BadRequestException('Only on-hold items can be waitlisted');
    }

    await this.waitlistsRepo
      .createQueryBuilder()
      .insert()
      .into(Waitlist)
      .values({
        inventoryItemId: item.id,
        clientId: client.id,
        createdById: user.userId,
        updatedById: user.userId,
      })
      .orIgnore()
      .execute();

    const row = await this.waitlistsRepo.findOne({
      where: { inventoryItemId: item.id, clientId: client.id },
    });
    if (!row) {
      throw new BadRequestException('Unable to add item to waitlist');
    }

    return {
      id: row.id,
      inventoryItemId: row.inventoryItemId,
      clientId: row.clientId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
