import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { InquiryItemSnapshot } from '../inquiries/entities/inquiry.entity';
import { Employee } from '../employees/entities/employee.entity';
import { InventoryItem } from './entities/inventory-item.entity';
import { ItemAuthentication } from './entities/item-authentication.entity';
import { ItemAuthenticationMetric } from './entities/item-authentication-metric.entity';
import { BatchAssignAuthenticatorDto } from './dto/batch-assign-authenticator.dto';
import { SaveItemAuthenticationMetricsDto } from './dto/save-item-authentication-metrics.dto';

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

const FOR_AUTHENTICATION_INVENTORY_STATUS = 'For Authentication';

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
  ) {}

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
    let auth = await this.itemAuthRepo.findOne({
      where: { inventoryItemId },
    });
    if (!auth) {
      auth = this.itemAuthRepo.create({
        inventoryItemId,
        assignedToId: null,
        authenticationStatus: 'Pending',
        rating: null,
        authenticatorNotes: null,
        marketResearchNotes: null,
        marketResearchLink: null,
        marketPrice: null,
        retailPrice: null,
        dimensions: null,
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
            'Only the assigned authenticator can save metric results.',
          );
        }
      }
    }
    await this.itemAuthMetricRepo.manager.transaction(async (em) => {
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
            rating: null,
            authenticatorNotes: null,
            marketResearchNotes: null,
            marketResearchLink: null,
            marketPrice: null,
            retailPrice: null,
            dimensions: null,
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
