import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, In, Repository } from 'typeorm';
import {
  Inquiry,
  type InquiryItemSnapshot,
} from '../inquiries/entities/inquiry.entity';
import {
  formatInventorySku,
  utcDayRange,
  utcInventoryDayLockKey,
} from './inventory-sku.util';
import { Employee } from '../employees/entities/employee.entity';
import { InventoryItem } from './entities/inventory-item.entity';
import { ItemAuthentication } from './entities/item-authentication.entity';
import { ItemAuthenticationMetric } from './entities/item-authentication-metric.entity';
import { BatchAssignAuthenticatorDto } from './dto/batch-assign-authenticator.dto';
import { ItemAuthenticationSnapshotFormDto } from './dto/item-authentication-snapshot-form.dto';
import { SaveItemAuthenticationMetricsDto } from './dto/save-item-authentication-metrics.dto';
import { InquiriesService } from '../inquiries/inquiries.service';

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
  /** Display name of assigned authenticator, if any. */
  assignedToName: string | null;
  /** From item_authentication row; defaults to Pending when missing. */
  authenticationStatus: string;
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
  /** Employee id when an authenticator is assigned (item_authentication.assigned_to_id). */
  assignedToEmployeeId: string | null;
  assignedToName: string | null;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
  };
};

export type ItemAuthenticationMetricApiRow = {
  authenticationMetricId: string;
  notes: string | null;
  metricStatus: string | null;
  photos: string[] | null;
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

function formatEmployeeName(
  e: Pick<Employee, 'firstName' | 'lastName'> | null | undefined,
): string | null {
  if (!e) return null;
  const name = [e.firstName, e.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : null;
}

function isAuthenticatorPosition(position: string): boolean {
  return position.trim().toLowerCase() === 'authenticator';
}

function mergeItemAuthenticationFormIntoSnapshot(
  item: InventoryItem,
  patch: ItemAuthenticationSnapshotFormDto,
): void {
  const base = item.itemSnapshot;
  const form: Record<string, unknown> = {
    ...(base.form ? { ...base.form } : {}),
  };
  const set = (key: keyof ItemAuthenticationSnapshotFormDto) => {
    const v = patch[key];
    if (v === undefined) return;
    form[key] = String(v).trim();
  };
  set('itemModel');
  set('brand');
  set('category');
  set('serialNumber');
  set('color');
  set('material');
  set('inclusions');
  set('dimensions');
  set('rating');
  set('marketPrice');
  set('retailPrice');
  set('marketResearchNotes');
  set('marketResearchLink');
  set('authenticatorNotes');
  item.itemSnapshot = {
    clientItemId: base.clientItemId,
    images: Array.isArray(base.images) ? [...base.images] : [],
    form,
  };
}

const FOR_AUTHENTICATION_INVENTORY_STATUS = 'For Authentication';
const FOR_PHOTOSHOOT_INVENTORY_STATUS = 'For Photoshoot';
const APPROVED_ITEM_AUTHENTICATION_STATUS = 'Approved';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
    @InjectRepository(ItemAuthentication)
    private readonly itemAuthRepo: Repository<ItemAuthentication>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    @InjectRepository(ItemAuthenticationMetric)
    private readonly itemAuthMetricRepo: Repository<ItemAuthenticationMetric>,
    @Inject(forwardRef(() => InquiriesService))
    private readonly inquiriesService: InquiriesService,
  ) {}

  /**
   * Ensures the actor may edit item-authentication data for this inventory row.
   * Optionally creates a pending `item_authentication` row (save flow).
   */
  private async enforceAuthenticatorAccess(
    inventoryItemId: string,
    actor: { userId: string; isAdmin: boolean },
    options: { createIfMissing: boolean },
  ): Promise<ItemAuthentication> {
    let auth = await this.itemAuthRepo.findOne({
      where: { inventoryItemId },
    });
    if (!auth) {
      if (!options.createIfMissing) {
        throw new BadRequestException('Item authentication record not found.');
      }
      auth = this.itemAuthRepo.create({
        inventoryItemId,
        assignedToId: null,
        authenticationStatus: 'Pending',
        createdById: null,
        updatedById: null,
      });
      await this.itemAuthRepo.save(auth);
    }
    if (!actor.isAdmin) {
      const employee = await this.employeesRepo.findOne({
        where: { userId: actor.userId },
      });
      const assigneeId = auth.assignedToId;
      if (assigneeId != null) {
        if (!employee?.id || employee.id !== assigneeId) {
          throw new ForbiddenException(
            'Only the assigned authenticator can perform this action.',
          );
        }
      }
    }
    return auth;
  }

  /**
   * Creates one inventory row and a pending item_authentication row (same as
   * schedule receive). Caller may wrap in a transaction with other writes.
   */
  async createInventoryAndItemAuthenticationForInquiry(
    em: EntityManager,
    inquiry: Pick<Inquiry, 'id' | 'consignorId' | 'offerTransactionType'>,
    itemSnapshot: InquiryItemSnapshot,
    currentBranch: string,
  ): Promise<void> {
    const refDate = new Date();
    await em.query(
      `SELECT pg_advisory_xact_lock(hashtext($1::text)::bigint)`,
      [utcInventoryDayLockKey(refDate)],
    );
    const bounds = utcDayRange(refDate);
    const countToday = await em.count(InventoryItem, {
      where: { dateReceived: Between(bounds.start, bounds.end) },
    });
    const seq = countToday + 1;
    const sku = formatInventorySku(refDate, seq);
    const transactionType =
      inquiry.offerTransactionType === 'direct_purchase' ||
      inquiry.offerTransactionType === 'consignment'
        ? inquiry.offerTransactionType
        : null;

    const inventoryRow = em.create(InventoryItem, {
      sku,
      dateReceived: refDate,
      inquiryId: inquiry.id,
      consignorId: inquiry.consignorId,
      status: FOR_AUTHENTICATION_INVENTORY_STATUS,
      transactionType,
      currentBranch,
      itemSnapshot,
      createdById: null,
      updatedById: null,
    });
    await em.save(inventoryRow);

    const itemAuth = em.create(ItemAuthentication, {
      inventoryItemId: inventoryRow.id,
      assignedToId: null,
      authenticationStatus: 'Pending',
      createdById: null,
      updatedById: null,
    });
    await em.save(itemAuth);
  }

  async getItemAuthenticationMetricsForInventoryItem(
    inventoryItemId: string,
  ): Promise<ItemAuthenticationMetricApiRow[]> {
    const auth = await this.itemAuthRepo.findOne({
      where: { inventoryItemId },
    });
    if (!auth) {
      return [];
    }
    const rows = await this.itemAuthMetricRepo.find({
      where: { itemAuthenticationId: auth.id },
    });
    return rows.map((row) => ({
      authenticationMetricId: row.authenticationMetricId,
      notes: row.notes,
      metricStatus: row.metricStatus,
      photos: row.photos,
    }));
  }

  async saveItemAuthenticationMetrics(
    inventoryItemId: string,
    dto: SaveItemAuthenticationMetricsDto,
    actor: { userId: string; isAdmin: boolean },
  ): Promise<{ saved: number }> {
    const item = await this.inventoryRepo.findOne({
      where: { id: inventoryItemId },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    const auth = await this.enforceAuthenticatorAccess(inventoryItemId, actor, {
      createIfMissing: true,
    });
    await this.itemAuthMetricRepo.manager.transaction(async (em) => {
      if (dto.itemSnapshotForm) {
        const inv = await em.findOne(InventoryItem, {
          where: { id: inventoryItemId },
        });
        if (!inv) {
          throw new NotFoundException('Inventory item not found');
        }
        mergeItemAuthenticationFormIntoSnapshot(inv, dto.itemSnapshotForm);
        inv.updatedById = actor.userId;
        await em.save(inv);
      }

      const itemAuthId = auth!.id;
      for (const row of dto.rows) {
        const notes =
          row.notes == null || String(row.notes).trim() === ''
            ? null
            : String(row.notes).trim();
        const photos =
          row.photos === undefined
            ? null
            : row.photos === null
              ? null
              : Array.isArray(row.photos) && row.photos.length > 0
                ? row.photos
                : null;
        let existing = await em.findOne(ItemAuthenticationMetric, {
          where: {
            itemAuthenticationId: itemAuthId,
            authenticationMetricId: row.authenticationMetricId,
          },
        });
        if (!existing) {
          existing = em.create(ItemAuthenticationMetric, {
            itemAuthenticationId: itemAuthId,
            authenticationMetricId: row.authenticationMetricId,
            notes,
            metricStatus: row.metricStatus ?? null,
            photos,
          });
        } else {
          existing.notes = notes;
          existing.metricStatus = row.metricStatus ?? null;
          existing.photos = photos;
        }
        await em.save(existing);
      }
    });
    return { saved: dto.rows.length };
  }

  /**
   * Marks inventory as For Photoshoot and sets inquiry contract dates when linked.
   */
  async approveAuthenticationForInventoryItem(
    inventoryItemId: string,
    actor: { userId: string; isAdmin: boolean },
  ): Promise<{ status: string }> {
    const item = await this.inventoryRepo.findOne({
      where: { id: inventoryItemId },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    if (item.status !== FOR_AUTHENTICATION_INVENTORY_STATUS) {
      throw new BadRequestException(
        `Only items in "${FOR_AUTHENTICATION_INVENTORY_STATUS}" status can be approved from authentication.`,
      );
    }
    const auth = await this.enforceAuthenticatorAccess(inventoryItemId, actor, {
      createIfMissing: false,
    });
    auth.authenticationStatus = APPROVED_ITEM_AUTHENTICATION_STATUS;
    auth.updatedById = actor.userId;
    await this.itemAuthRepo.save(auth);

    item.status = FOR_PHOTOSHOOT_INVENTORY_STATUS;
    item.updatedById = actor.userId;
    await this.inventoryRepo.save(item);

    if (item.inquiryId) {
      await this.inquiriesService.populateContractDatesForInquiry(
        item.inquiryId,
      );
    }

    return { status: item.status };
  }

  async listAuthenticators(): Promise<
    { id: string; displayName: string }[]
  > {
    const rows = await this.employeesRepo
      .createQueryBuilder('e')
      .where('LOWER(TRIM(e.position)) = :p', { p: 'authenticator' })
      .orderBy('e.lastName', 'ASC')
      .addOrderBy('e.firstName', 'ASC')
      .getMany();
    return rows.map((e) => ({
      id: e.id,
      displayName: formatEmployeeName(e) ?? e.email,
    }));
  }

  async batchAssignAuthenticator(
    dto: BatchAssignAuthenticatorDto,
    actorUserId: string,
  ): Promise<{ updated: number }> {
    const employee = await this.employeesRepo.findOne({
      where: { id: dto.employeeId },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (!isAuthenticatorPosition(employee.position)) {
      throw new BadRequestException(
        'Selected person is not in the Authenticator position.',
      );
    }
    const uniqueIds = [...new Set(dto.inventoryItemIds)];
    await this.itemAuthRepo.manager.transaction(async (em) => {
      for (const inventoryItemId of uniqueIds) {
        const item = await em.findOne(InventoryItem, {
          where: { id: inventoryItemId },
        });
        if (!item) {
          throw new NotFoundException(
            `Inventory item ${inventoryItemId} not found`,
          );
        }
        if (item.status !== FOR_AUTHENTICATION_INVENTORY_STATUS) {
          throw new BadRequestException(
            `Item ${item.sku} is not in "For Authentication" status.`,
          );
        }
        let auth = await em.findOne(ItemAuthentication, {
          where: { inventoryItemId },
        });
        if (!auth) {
          auth = em.create(ItemAuthentication, {
            inventoryItemId,
            assignedToId: dto.employeeId,
            authenticationStatus: 'Pending',
            createdById: actorUserId,
            updatedById: actorUserId,
          });
        } else {
          auth.assignedToId = dto.employeeId;
          auth.updatedById = actorUserId;
        }
        await em.save(auth);
      }
    });
    return { updated: uniqueIds.length };
  }

  async findAllForStaff(): Promise<InventoryListRow[]> {
    const rows = await this.inventoryRepo.find({
      relations: { inquiry: true, consignor: true },
      order: { dateReceived: 'DESC' },
    });
    const ids = rows.map((r) => r.id);
    let authByItemId = new Map<string, ItemAuthentication>();
    if (ids.length > 0) {
      const auths = await this.itemAuthRepo.find({
        where: { inventoryItemId: In(ids) },
        relations: { assignedTo: true },
      });
      authByItemId = new Map(auths.map((a) => [a.inventoryItemId, a]));
    }
    return rows.map((r) => {
      const name = r.consignor
        ? [r.consignor.firstName, r.consignor.lastName]
            .filter(Boolean)
            .join(' ')
            .trim()
        : '';
      const auth = authByItemId.get(r.id);
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
        assignedToName: formatEmployeeName(auth?.assignedTo ?? null),
        authenticationStatus: auth?.authenticationStatus ?? 'Pending',
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
    const auth = await this.itemAuthRepo.findOne({
      where: { inventoryItemId: id },
      relations: { assignedTo: true },
    });
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
      assignedToEmployeeId: auth?.assignedToId ?? null,
      assignedToName: formatEmployeeName(auth?.assignedTo ?? null),
      itemSnapshot: {
        clientItemId: r.itemSnapshot.clientItemId,
        form: (r.itemSnapshot.form ?? {}) as Record<string, unknown>,
      },
    };
  }
}
