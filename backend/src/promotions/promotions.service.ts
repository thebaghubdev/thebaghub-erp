import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import {
  InventoryAuditService,
  cloneInventoryItemForAudit,
} from '../inventory/inventory-audit.service';
import { parseInventoryUnitPrice } from '../inventory/inventory-effective-price.util';
import { calendarDateStringInTimeZone } from '../inventory/sold-warranty.util';
import type { InquiryItemSnapshot } from '../inquiries/entities/inquiry.entity';
import {
  CreatePromotionDto,
  UpdatePromotionDto,
} from './dto/create-promotion.dto';
import { Promotion, PromotionItem } from './entities/promotion.entities';
import {
  assertValidPromoPriceAgainstSelling,
  compareDateOnly,
  formatPromotionMoney,
  parsePromotionMoney,
} from './promotion-pricing.util';

const AVAILABLE_FOR_PURCHASE_STATUS = 'Available For Purchase';

export type PromotionLifecycleStatus =
  | 'scheduled'
  | 'active'
  | 'ended'
  | 'cancelled';

export type PromotionListRow = {
  id: string;
  promotionName: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  createdByName: string;
  itemCount: number;
  lifecycleStatus: PromotionLifecycleStatus;
};

export type PromotionItemRow = {
  id: string;
  inventoryItemId: string;
  sku: string;
  itemLabel: string;
  currentBranch: string;
  tbhSellingPrice: string | null;
  promoPrice: string | null;
};

export type PromotionDetail = PromotionListRow & {
  items: PromotionItemRow[];
};

export type PromotionInventoryPickerRow = {
  id: string;
  sku: string;
  itemLabel: string;
  status: string;
  currentBranch: string;
  tbhSellingPrice: string | null;
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

function formatDateOnly(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolvePromotionLifecycleStatus(
  promotion: Pick<Promotion, 'startDate' | 'endDate' | 'cancelledAt'>,
  today: string,
): PromotionLifecycleStatus {
  if (promotion.cancelledAt != null) return 'cancelled';
  const startDate = formatDateOnly(promotion.startDate);
  const endDate = formatDateOnly(promotion.endDate);
  if (compareDateOnly(today, endDate) > 0) return 'ended';
  if (compareDateOnly(today, startDate) < 0) return 'scheduled';
  return 'active';
}

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion)
    private readonly promotionRepo: Repository<Promotion>,
    @InjectRepository(PromotionItem)
    private readonly promotionItemRepo: Repository<PromotionItem>,
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    private readonly inventoryAudit: InventoryAuditService,
  ) {}

  async findAllForStaff(): Promise<PromotionListRow[]> {
    const rows = await this.promotionRepo.find({
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
    const today = calendarDateStringInTimeZone(new Date());
    const userIds = [
      ...new Set(
        rows
          .map((r) => r.createdById)
          .filter((id): id is string => id != null && id !== ''),
      ),
    ];
    const nameByUserId = await this.employeeNamesByUserIds(userIds);
    return rows.map((r) =>
      this.mapToListRow(r, nameByUserId, today),
    );
  }

  async findOneForStaff(id: string): Promise<PromotionDetail> {
    const row = await this.promotionRepo.findOne({
      where: { id },
      relations: { items: { inventoryItem: true } },
    });
    if (!row) {
      throw new NotFoundException('Promotion not found');
    }
    const today = calendarDateStringInTimeZone(new Date());
    const nameByUserId = await this.employeeNamesByUserIds(
      row.createdById ? [row.createdById] : [],
    );
    return this.mapToDetail(row, nameByUserId, today);
  }

  async findReservedInventoryItemIds(
    excludePromotionId?: string,
  ): Promise<string[]> {
    const today = calendarDateStringInTimeZone(new Date());
    const links = await this.promotionItemRepo.find({
      relations: { promotion: true },
    });
    const ids = new Set<string>();
    for (const link of links) {
      if (excludePromotionId && link.promotionId === excludePromotionId) {
        continue;
      }
      if (link.promotion.cancelledAt != null) {
        continue;
      }
      const end = formatDateOnly(link.promotion.endDate);
      if (compareDateOnly(end, today) >= 0) {
        ids.add(link.inventoryItemId);
      }
    }
    return [...ids];
  }

  async findAvailableInventoryForWizard(
    excludePromotionId?: string,
  ): Promise<PromotionInventoryPickerRow[]> {
    const reserved = new Set(
      await this.findReservedInventoryItemIds(excludePromotionId),
    );
    const rows = await this.inventoryRepo.find({
      where: { status: AVAILABLE_FOR_PURCHASE_STATUS },
      order: { sku: 'ASC' },
    });
    return rows
      .filter((r) => !reserved.has(r.id))
      .map((r) => ({
        id: r.id,
        sku: r.sku,
        itemLabel: itemLabelFromSnapshot(r.itemSnapshot),
        status: r.status,
        currentBranch: r.currentBranch,
        tbhSellingPrice:
          r.tbhSellingPrice != null && String(r.tbhSellingPrice).trim() !== ''
            ? String(r.tbhSellingPrice)
            : null,
      }));
  }

  async createForStaff(
    userId: string,
    dto: CreatePromotionDto,
  ): Promise<PromotionDetail> {
    this.assertValidDateRange(dto.startDate, dto.endDate);
    await this.validatePromotionItemsForCreate(dto.items, dto.startDate);

    const promotion = this.promotionRepo.create({
      promotionName: dto.promotionName.trim(),
      startDate: dto.startDate,
      endDate: dto.endDate,
      createdById: userId,
      updatedById: userId,
    });
    const saved = await this.promotionRepo.save(promotion);

    const lines = dto.items.map((item) =>
      this.promotionItemRepo.create({
        promotionId: saved.id,
        inventoryItemId: item.inventoryItemId,
        promoPrice: formatPromotionMoney(
          parsePromotionMoney(item.promoPrice)!,
        ),
      }),
    );
    await this.promotionItemRepo.save(lines);

    await this.syncPromotionInventoryFlags();
    return this.findOneForStaff(saved.id);
  }

  async updateForStaff(
    id: string,
    userId: string,
    dto: UpdatePromotionDto,
  ): Promise<PromotionDetail> {
    const promotion = await this.promotionRepo.findOne({
      where: { id },
      relations: { items: true },
    });
    if (!promotion) {
      throw new NotFoundException('Promotion not found');
    }
    if (promotion.cancelledAt != null) {
      throw new BadRequestException('Cancelled promotions cannot be edited');
    }

    const today = calendarDateStringInTimeZone(new Date());
    const start = formatDateOnly(promotion.startDate);
    const end = formatDateOnly(promotion.endDate);
    const lifecycle = resolvePromotionLifecycleStatus(promotion, today);

    if (lifecycle === 'ended') {
      throw new BadRequestException('Ended promotions cannot be edited');
    }

    this.assertValidDateRange(dto.startDate, dto.endDate);

    if (lifecycle === 'scheduled') {
      await this.validatePromotionItemsForCreate(
        dto.items,
        dto.startDate,
        id,
      );
      promotion.promotionName = dto.promotionName.trim();
      promotion.startDate = dto.startDate as unknown as Date;
      promotion.endDate = dto.endDate as unknown as Date;
      promotion.updatedById = userId;
      await this.promotionRepo.save(promotion);
      await this.promotionItemRepo.delete({ promotionId: id });
      const lines = dto.items.map((item) =>
        this.promotionItemRepo.create({
          promotionId: id,
          inventoryItemId: item.inventoryItemId,
          promoPrice: formatPromotionMoney(
            parsePromotionMoney(item.promoPrice)!,
          ),
        }),
      );
      await this.promotionItemRepo.save(lines);
    } else {
      const existingIds = new Set(
        promotion.items.map((i) => i.inventoryItemId),
      );
      const dtoIds = new Set(dto.items.map((i) => i.inventoryItemId));
      if (
        existingIds.size !== dtoIds.size ||
        [...existingIds].some((invId) => !dtoIds.has(invId))
      ) {
        throw new BadRequestException(
          'Active promotions cannot add or remove items',
        );
      }
      if (compareDateOnly(dto.startDate, start) !== 0) {
        throw new BadRequestException(
          'Start date cannot be changed while a promotion is active',
        );
      }
      if (compareDateOnly(dto.endDate, today) < 0) {
        throw new BadRequestException('End date cannot be before today');
      }
      promotion.promotionName = dto.promotionName.trim();
      promotion.endDate = dto.endDate as unknown as Date;
      promotion.updatedById = userId;
      await this.promotionRepo.save(promotion);

      const priceByInventoryId = new Map(
        dto.items.map((i) => [i.inventoryItemId, i.promoPrice]),
      );
      for (const line of promotion.items) {
        const raw = priceByInventoryId.get(line.inventoryItemId);
        if (raw == null) continue;
        const inventory = await this.inventoryRepo.findOne({
          where: { id: line.inventoryItemId },
        });
        if (!inventory) continue;
        const selling = parseInventoryUnitPrice(inventory.tbhSellingPrice);
        const promo = parsePromotionMoney(raw);
        if (selling == null || promo == null) {
          throw new BadRequestException('Invalid promo price');
        }
        try {
          assertValidPromoPriceAgainstSelling(selling, promo);
        } catch (e) {
          throw new BadRequestException(
            e instanceof Error ? e.message : 'Invalid promo price',
          );
        }
        line.promoPrice = formatPromotionMoney(promo);
      }
      await this.promotionItemRepo.save(promotion.items);
    }

    await this.syncPromotionInventoryFlags();
    return this.findOneForStaff(id);
  }

  async cancelForStaff(id: string, userId: string): Promise<void> {
    const promotion = await this.promotionRepo.findOne({ where: { id } });
    if (!promotion) {
      throw new NotFoundException('Promotion not found');
    }
    if (promotion.cancelledAt != null) {
      return;
    }
    promotion.cancelledAt = new Date();
    promotion.updatedById = userId;
    await this.promotionRepo.save(promotion);
    await this.syncPromotionInventoryFlags();
  }

  async syncPromotionInventoryFlags(referenceDate = new Date()): Promise<{
    prunedItemCount: number;
    updatedInventoryCount: number;
  }> {
    const today = calendarDateStringInTimeZone(referenceDate);
    let prunedItemCount = 0;

    const allLinks = await this.promotionItemRepo.find({
      relations: { promotion: true, inventoryItem: true },
    });

    const toDelete: string[] = [];
    for (const link of allLinks) {
      const item = link.inventoryItem;
      if (!item || item.status !== AVAILABLE_FOR_PURCHASE_STATUS) {
        toDelete.push(link.id);
      }
    }
    if (toDelete.length > 0) {
      await this.promotionItemRepo.delete({ id: In(toDelete) });
      prunedItemCount = toDelete.length;
    }

    const promotions = await this.promotionRepo.find({
      relations: { items: { inventoryItem: true } },
    });

    const activePromoPriceByInventoryId = new Map<string, string>();
    for (const promo of promotions) {
      if (promo.cancelledAt != null) continue;
      const start = formatDateOnly(promo.startDate);
      const end = formatDateOnly(promo.endDate);
      const isActive =
        compareDateOnly(start, today) <= 0 &&
        compareDateOnly(today, end) <= 0;
      if (!isActive) continue;
      for (const line of promo.items) {
        if (
          !line.inventoryItem ||
          line.inventoryItem.status !== AVAILABLE_FOR_PURCHASE_STATUS
        ) {
          continue;
        }
        if (line.promoPrice == null || String(line.promoPrice).trim() === '') {
          continue;
        }
        activePromoPriceByInventoryId.set(
          line.inventoryItemId,
          String(line.promoPrice),
        );
      }
    }

    const candidateIds = new Set<string>([
      ...activePromoPriceByInventoryId.keys(),
    ]);
    const currentlyOnPromo = await this.inventoryRepo.find({
      where: { onPromo: true },
    });
    for (const row of currentlyOnPromo) {
      candidateIds.add(row.id);
    }

    let updatedInventoryCount = 0;
    const systemActor = this.inventoryAudit.systemActor();
    for (const inventoryId of candidateIds) {
      const promoPrice = activePromoPriceByInventoryId.get(inventoryId);
      const row = await this.inventoryRepo.findOne({
        where: { id: inventoryId },
      });
      if (!row) continue;
      const nextOnPromo = promoPrice != null;
      const nextPromoPrice = promoPrice ?? null;
      if (row.onPromo === nextOnPromo && String(row.promoPrice ?? '') === String(nextPromoPrice ?? '')) {
        updatedInventoryCount += 1;
        continue;
      }
      const before = cloneInventoryItemForAudit(row);
      row.onPromo = nextOnPromo;
      row.promoPrice = nextPromoPrice;
      await this.inventoryRepo.save(row);
      await this.inventoryAudit.recordDiff(row.id, before, row, systemActor);
      updatedInventoryCount += 1;
    }

    return { prunedItemCount, updatedInventoryCount };
  }

  private assertValidDateRange(startDate: string, endDate: string): void {
    if (compareDateOnly(endDate, startDate) < 0) {
      throw new BadRequestException('End date must be on or after start date');
    }
  }

  private async validatePromotionItemsForCreate(
    items: CreatePromotionDto['items'],
    startDate: string,
    excludePromotionId?: string,
  ): Promise<void> {
    const seen = new Set<string>();
    const reserved = new Set(
      await this.findReservedInventoryItemIds(excludePromotionId),
    );

    for (const item of items) {
      if (seen.has(item.inventoryItemId)) {
        throw new BadRequestException('Duplicate items in promotion');
      }
      seen.add(item.inventoryItemId);

      if (reserved.has(item.inventoryItemId)) {
        throw new BadRequestException(
          'One or more items are already included in another promotion',
        );
      }

      const inventory = await this.inventoryRepo.findOne({
        where: { id: item.inventoryItemId },
      });
      if (!inventory || inventory.status !== AVAILABLE_FOR_PURCHASE_STATUS) {
        throw new BadRequestException(
          'All items must be Available For Purchase',
        );
      }

      const selling = parseInventoryUnitPrice(inventory.tbhSellingPrice);
      const promo = parsePromotionMoney(item.promoPrice);
      if (selling == null) {
        throw new BadRequestException(
          'All items must have a TBH selling price',
        );
      }
      if (promo == null) {
        throw new BadRequestException('Invalid promo price');
      }
      try {
        assertValidPromoPriceAgainstSelling(selling, promo);
      } catch (e) {
        throw new BadRequestException(
          e instanceof Error ? e.message : 'Invalid promo price',
        );
      }
    }
  }

  private async employeeNamesByUserIds(
    userIds: string[],
  ): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const employees = await this.employeesRepo.find({
      where: { userId: In(userIds) },
    });
    return new Map(
      employees.map((e) => [
        e.userId,
        [e.firstName, e.lastName].filter(Boolean).join(' ').trim() || 'Staff',
      ]),
    );
  }

  private mapToListRow(
    row: Promotion,
    nameByUserId: Map<string, string>,
    today: string,
  ): PromotionListRow {
    const startDate = formatDateOnly(row.startDate);
    const endDate = formatDateOnly(row.endDate);
    return {
      id: row.id,
      promotionName: row.promotionName,
      startDate,
      endDate,
      createdAt: row.createdAt.toISOString(),
      createdByName:
        (row.createdById && nameByUserId.get(row.createdById)) || 'Staff',
      itemCount: row.items?.length ?? 0,
      lifecycleStatus: resolvePromotionLifecycleStatus(row, today),
    };
  }

  private mapToDetail(
    row: Promotion,
    nameByUserId: Map<string, string>,
    today: string,
  ): PromotionDetail {
    const list = this.mapToListRow(row, nameByUserId, today);
    const items: PromotionItemRow[] = (row.items ?? [])
      .map((line) => {
        const inv = line.inventoryItem;
        if (!inv) return null;
        return {
          id: line.id,
          inventoryItemId: line.inventoryItemId,
          sku: inv.sku,
          itemLabel: itemLabelFromSnapshot(inv.itemSnapshot),
          currentBranch: inv.currentBranch,
          tbhSellingPrice:
            inv.tbhSellingPrice != null &&
            String(inv.tbhSellingPrice).trim() !== ''
              ? String(inv.tbhSellingPrice)
              : null,
          promoPrice:
            line.promoPrice != null && String(line.promoPrice).trim() !== ''
              ? String(line.promoPrice)
              : null,
        };
      })
      .filter((r): r is PromotionItemRow => r != null)
      .sort((a, b) => a.sku.localeCompare(b.sku));
    return { ...list, items };
  }
}
