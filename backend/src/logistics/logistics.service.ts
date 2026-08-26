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
import type { InquiryItemSnapshot } from '../inquiries/entities/inquiry.entity';
import { CreateLogisticsDto } from './dto/create-logistics.dto';
import { Logistics, LogisticsItem } from './entities/logistics.entities';
import {
  INVENTORY_LOGISTICS_STATUS_IN_STOCK,
  INVENTORY_LOGISTICS_STATUS_IN_TRANSIT,
  LOGISTICS_MODE_OF_TRANSFER_OPTIONS,
  LOGISTICS_OPEN_TRANSFER_STATUSES,
  LOGISTICS_STATUS_COMPLETED,
  LOGISTICS_STATUS_IN_TRANSIT,
  LOGISTICS_STATUS_PENDING_DISPATCH,
  LOGISTICS_STATUS_CANCELLED,
  isBlockedInventoryStatusForLogistics,
  isLogisticsBranchCode,
  normalizeLogisticsBranch,
} from './logistics.constants';

export type LogisticsItemRow = {
  id: string;
  inventoryItemId: string;
  sku: string;
  itemLabel: string;
  status: string;
  currentBranch: string;
  logisticsStatus: string;
};

export type LogisticsListRow = {
  id: string;
  transferDate: string;
  sendingBranch: string;
  receivingBranch: string;
  modeOfTransfer: string;
  status: string;
  itemCount: number;
  createdAt: string;
  createdByName: string;
  trackingName: string;
  trackingNumber: string;
};

export type LogisticsDetail = LogisticsListRow & {
  reasonForTransfer: string;
  notes: string | null;
  items: LogisticsItemRow[];
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

@Injectable()
export class LogisticsService {
  constructor(
    @InjectRepository(Logistics)
    private readonly logisticsRepo: Repository<Logistics>,
    @InjectRepository(LogisticsItem)
    private readonly logisticsItemRepo: Repository<LogisticsItem>,
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    private readonly inventoryAudit: InventoryAuditService,
  ) {}

  async findInventoryIdsOnOpenTransfers(): Promise<string[]> {
    const links = await this.logisticsItemRepo
      .createQueryBuilder('li')
      .innerJoin('li.logistics', 'l')
      .where('l.status IN (:...statuses)', {
        statuses: [...LOGISTICS_OPEN_TRANSFER_STATUSES],
      })
      .getMany();
    return links.map((r) => r.inventoryItemId);
  }

  async findAllForStaff(): Promise<LogisticsListRow[]> {
    const rows = await this.logisticsRepo.find({
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
    const userIds = [
      ...new Set(
        rows
          .map((r) => r.createdById)
          .filter((id): id is string => id != null && id !== ''),
      ),
    ];
    const nameByUserId = await this.employeeNamesByUserIds(userIds);
    return rows.map((r) => this.mapToListRow(r, nameByUserId));
  }

  async findOneForStaff(id: string): Promise<LogisticsDetail> {
    const row = await this.logisticsRepo.findOne({
      where: { id },
      relations: { items: { inventoryItem: true } },
    });
    if (!row) {
      throw new NotFoundException('Logistics transfer not found');
    }
    const nameByUserId = await this.employeeNamesByUserIds(
      row.createdById ? [row.createdById] : [],
    );
    const base = this.mapToListRow(row, nameByUserId);
    const items: LogisticsItemRow[] = (row.items ?? []).map((link) => {
      const inv = link.inventoryItem;
      return {
        id: link.id,
        inventoryItemId: link.inventoryItemId,
        sku: inv?.sku ?? '—',
        itemLabel: itemLabelFromSnapshot(inv?.itemSnapshot),
        status: inv?.status ?? '—',
        currentBranch: inv?.currentBranch ?? '—',
        logisticsStatus: inv?.logisticsStatus ?? INVENTORY_LOGISTICS_STATUS_IN_STOCK,
      };
    });
    return {
      ...base,
      reasonForTransfer: row.reasonForTransfer,
      notes: row.notes,
      items,
    };
  }

  async createForStaff(
    userId: string,
    dto: CreateLogisticsDto,
  ): Promise<LogisticsDetail> {
    const sendingBranch = normalizeLogisticsBranch(dto.sendingBranch);
    const receivingBranch = normalizeLogisticsBranch(dto.receivingBranch);

    if (!isLogisticsBranchCode(sendingBranch)) {
      throw new BadRequestException('Invalid sending branch');
    }
    if (!isLogisticsBranchCode(receivingBranch)) {
      throw new BadRequestException('Invalid receiving branch');
    }
    if (sendingBranch === receivingBranch) {
      throw new BadRequestException(
        'Sending and receiving branch must be different',
      );
    }

    const mode = dto.modeOfTransfer.trim();
    if (
      !(LOGISTICS_MODE_OF_TRANSFER_OPTIONS as readonly string[]).includes(mode)
    ) {
      throw new BadRequestException('Invalid mode of transfer');
    }

    const uniqueIds = [...new Set(dto.inventoryItemIds)];
    if (uniqueIds.length !== dto.inventoryItemIds.length) {
      throw new BadRequestException('Duplicate inventory items in selection');
    }

    const transferDate = new Date(`${dto.transferDate}T12:00:00.000Z`);
    if (Number.isNaN(transferDate.getTime())) {
      throw new BadRequestException('Invalid transfer date');
    }

    const notesTrimmed = dto.notes?.trim() ?? '';
    const reasonTrimmed = dto.reasonForTransfer.trim();
    const trackingName = dto.trackingName.trim();
    const trackingNumber = dto.trackingNumber.trim();

    if (!reasonTrimmed) {
      throw new BadRequestException('Reason for transfer is required');
    }
    if (!trackingName) {
      throw new BadRequestException('Driver/courier name is required');
    }
    if (!trackingNumber) {
      throw new BadRequestException('Vehicle plate / tracking number is required');
    }

    return await this.logisticsRepo.manager.transaction(async (em) => {
      const inventoryRows = await em.find(InventoryItem, {
        where: { id: In(uniqueIds) },
      });
      if (inventoryRows.length !== uniqueIds.length) {
        throw new BadRequestException('One or more inventory items were not found');
      }

      const openTransferLinks = await em
        .createQueryBuilder(LogisticsItem, 'li')
        .innerJoin('li.logistics', 'l')
        .where('li.inventory_item_id IN (:...ids)', { ids: uniqueIds })
        .andWhere('l.status IN (:...statuses)', {
          statuses: [...LOGISTICS_OPEN_TRANSFER_STATUSES],
        })
        .getMany();

      if (openTransferLinks.length > 0) {
        throw new BadRequestException(
          'One or more items are already assigned to an open transfer',
        );
      }

      for (const item of inventoryRows) {
        const branch = normalizeLogisticsBranch(item.currentBranch);
        if (branch !== sendingBranch) {
          throw new BadRequestException(
            `Item ${item.sku} is not at the sending branch`,
          );
        }
        if (
          item.logisticsStatus.trim() === INVENTORY_LOGISTICS_STATUS_IN_TRANSIT
        ) {
          throw new BadRequestException(
            `Item ${item.sku} is already in transit`,
          );
        }
        if (isBlockedInventoryStatusForLogistics(item.status)) {
          throw new BadRequestException(
            `Item ${item.sku} cannot be transferred in its current status`,
          );
        }
      }

      const logistics = em.create(Logistics, {
        status: LOGISTICS_STATUS_PENDING_DISPATCH,
        transferDate,
        sendingBranch,
        receivingBranch,
        modeOfTransfer: mode,
        reasonForTransfer: reasonTrimmed,
        trackingName,
        trackingNumber,
        notes: notesTrimmed.length > 0 ? notesTrimmed : null,
        createdById: userId,
        updatedById: userId,
      });
      await em.save(logistics);

      for (const item of inventoryRows) {
        const link = em.create(LogisticsItem, {
          logisticsId: logistics.id,
          inventoryItemId: item.id,
        });
        await em.save(link);
      }

      const saved = await em.findOneOrFail(Logistics, {
        where: { id: logistics.id },
        relations: { items: { inventoryItem: true } },
      });

      const nameByUserId = await this.employeeNamesByUserIds([userId]);
      const base = this.mapToListRow(saved, nameByUserId);
      const items: LogisticsItemRow[] = (saved.items ?? []).map((link) => {
        const inv = link.inventoryItem;
        return {
          id: link.id,
          inventoryItemId: link.inventoryItemId,
          sku: inv?.sku ?? '—',
          itemLabel: itemLabelFromSnapshot(inv?.itemSnapshot),
          status: inv?.status ?? '—',
          currentBranch: inv?.currentBranch ?? '—',
          logisticsStatus:
            inv?.logisticsStatus ?? INVENTORY_LOGISTICS_STATUS_IN_STOCK,
        };
      });

      return {
        ...base,
        reasonForTransfer: saved.reasonForTransfer,
        notes: saved.notes,
        items,
      };
    });
  }

  async dispatchForStaff(id: string, userId: string): Promise<LogisticsDetail> {
    return await this.logisticsRepo.manager.transaction(async (em) => {
      const row = await em.findOne(Logistics, {
        where: { id },
        relations: { items: { inventoryItem: true } },
      });
      if (!row) {
        throw new NotFoundException('Logistics transfer not found');
      }
      if (row.status !== LOGISTICS_STATUS_PENDING_DISPATCH) {
        throw new BadRequestException(
          'Only pending-dispatch transfers can be confirmed for dispatch',
        );
      }

      const sendingBranch = normalizeLogisticsBranch(row.sendingBranch);
      const itemIds = (row.items ?? []).map((l) => l.inventoryItemId);

      for (const link of row.items ?? []) {
        const item = link.inventoryItem;
        if (!item) {
          throw new BadRequestException('Transfer item inventory record missing');
        }
        const branch = normalizeLogisticsBranch(item.currentBranch);
        if (branch !== sendingBranch) {
          throw new BadRequestException(
            `Item ${item.sku} is no longer at the sending branch`,
          );
        }
        if (
          item.logisticsStatus.trim() === INVENTORY_LOGISTICS_STATUS_IN_TRANSIT
        ) {
          throw new BadRequestException(`Item ${item.sku} is already in transit`);
        }
        if (isBlockedInventoryStatusForLogistics(item.status)) {
          throw new BadRequestException(
            `Item ${item.sku} cannot be dispatched in its current status`,
          );
        }
      }

      if (itemIds.length > 0) {
        const conflictLinks = await em
          .createQueryBuilder(LogisticsItem, 'li')
          .innerJoin('li.logistics', 'l')
          .where('li.inventory_item_id IN (:...ids)', { ids: itemIds })
          .andWhere('l.id != :transferId', { transferId: row.id })
          .andWhere('l.status IN (:...statuses)', {
            statuses: [...LOGISTICS_OPEN_TRANSFER_STATUSES],
          })
          .getMany();
        if (conflictLinks.length > 0) {
          throw new BadRequestException(
            'One or more items are assigned to another open transfer',
          );
        }
      }

      row.status = LOGISTICS_STATUS_IN_TRANSIT;
      row.updatedById = userId;
      await em.save(row);

      const actor = await this.inventoryAudit.staffActor(userId);
      for (const link of row.items ?? []) {
        const item = link.inventoryItem;
        if (!item) continue;
        const beforeItem = cloneInventoryItemForAudit(item);
        item.logisticsStatus = INVENTORY_LOGISTICS_STATUS_IN_TRANSIT;
        item.updatedById = userId;
        await em.save(item);
        await this.inventoryAudit.recordDiff(
          item.id,
          beforeItem,
          item,
          actor,
          em,
        );
      }

      const nameByUserId = await this.employeeNamesByUserIds(
        row.createdById ? [row.createdById] : [],
      );
      const base = this.mapToListRow(row, nameByUserId);
      const items: LogisticsItemRow[] = (row.items ?? []).map((link) => {
        const inv = link.inventoryItem;
        return {
          id: link.id,
          inventoryItemId: link.inventoryItemId,
          sku: inv?.sku ?? '—',
          itemLabel: itemLabelFromSnapshot(inv?.itemSnapshot),
          status: inv?.status ?? '—',
          currentBranch: inv?.currentBranch ?? '—',
          logisticsStatus: INVENTORY_LOGISTICS_STATUS_IN_TRANSIT,
        };
      });

      return {
        ...base,
        reasonForTransfer: row.reasonForTransfer,
        notes: row.notes,
        items,
      };
    });
  }

  async cancelForStaff(id: string, userId: string): Promise<LogisticsDetail> {
    return await this.logisticsRepo.manager.transaction(async (em) => {
      const row = await em.findOne(Logistics, {
        where: { id },
        relations: { items: { inventoryItem: true } },
      });
      if (!row) {
        throw new NotFoundException('Logistics transfer not found');
      }
      if (row.status === LOGISTICS_STATUS_CANCELLED) {
        throw new BadRequestException('This transfer is already cancelled');
      }
      if (row.status === LOGISTICS_STATUS_COMPLETED) {
        throw new BadRequestException('Completed transfers cannot be cancelled');
      }
      if (
        row.status !== LOGISTICS_STATUS_PENDING_DISPATCH &&
        row.status !== LOGISTICS_STATUS_IN_TRANSIT
      ) {
        throw new BadRequestException('This transfer cannot be cancelled');
      }

      row.status = LOGISTICS_STATUS_CANCELLED;
      row.updatedById = userId;
      await em.save(row);

      const actor = await this.inventoryAudit.staffActor(userId);
      for (const link of row.items ?? []) {
        const item = link.inventoryItem;
        if (!item) continue;
        const beforeItem = cloneInventoryItemForAudit(item);
        item.logisticsStatus = INVENTORY_LOGISTICS_STATUS_IN_STOCK;
        item.updatedById = userId;
        await em.save(item);
        await this.inventoryAudit.recordDiff(
          item.id,
          beforeItem,
          item,
          actor,
          em,
        );
      }

      const nameByUserId = await this.employeeNamesByUserIds(
        row.createdById ? [row.createdById] : [],
      );
      const base = this.mapToListRow(row, nameByUserId);
      const items: LogisticsItemRow[] = (row.items ?? []).map((link) => {
        const inv = link.inventoryItem;
        return {
          id: link.id,
          inventoryItemId: link.inventoryItemId,
          sku: inv?.sku ?? '—',
          itemLabel: itemLabelFromSnapshot(inv?.itemSnapshot),
          status: inv?.status ?? '—',
          currentBranch: inv?.currentBranch ?? '—',
          logisticsStatus: INVENTORY_LOGISTICS_STATUS_IN_STOCK,
        };
      });

      return {
        ...base,
        reasonForTransfer: row.reasonForTransfer,
        notes: row.notes,
        items,
      };
    });
  }

  async completeForStaff(id: string, userId: string): Promise<LogisticsDetail> {
    return await this.logisticsRepo.manager.transaction(async (em) => {
      const row = await em.findOne(Logistics, {
        where: { id },
        relations: { items: { inventoryItem: true } },
      });
      if (!row) {
        throw new NotFoundException('Logistics transfer not found');
      }
      if (row.status !== LOGISTICS_STATUS_IN_TRANSIT) {
        throw new BadRequestException(
          'Only in-transit transfers can be marked as received',
        );
      }

      row.status = LOGISTICS_STATUS_COMPLETED;
      row.updatedById = userId;
      await em.save(row);

      const receivingBranch = row.receivingBranch;
      const actor = await this.inventoryAudit.staffActor(userId);
      for (const link of row.items ?? []) {
        const item = link.inventoryItem;
        if (!item) continue;
        const beforeItem = cloneInventoryItemForAudit(item);
        item.currentBranch = receivingBranch;
        item.logisticsStatus = INVENTORY_LOGISTICS_STATUS_IN_STOCK;
        item.updatedById = userId;
        await em.save(item);
        await this.inventoryAudit.recordDiff(
          item.id,
          beforeItem,
          item,
          actor,
          em,
        );
      }

      const nameByUserId = await this.employeeNamesByUserIds(
        row.createdById ? [row.createdById] : [],
      );
      const base = this.mapToListRow(row, nameByUserId);
      const items: LogisticsItemRow[] = (row.items ?? []).map((link) => {
        const inv = link.inventoryItem;
        return {
          id: link.id,
          inventoryItemId: link.inventoryItemId,
          sku: inv?.sku ?? '—',
          itemLabel: itemLabelFromSnapshot(inv?.itemSnapshot),
          status: inv?.status ?? '—',
          currentBranch: inv?.currentBranch ?? receivingBranch,
          logisticsStatus: INVENTORY_LOGISTICS_STATUS_IN_STOCK,
        };
      });

      return {
        ...base,
        reasonForTransfer: row.reasonForTransfer,
        notes: row.notes,
        items,
      };
    });
  }

  private mapToListRow(
    r: Logistics,
    nameByUserId: Map<string, string>,
  ): LogisticsListRow {
    const createdByName =
      (r.createdById && nameByUserId.get(r.createdById)) || 'Staff';
    return {
      id: r.id,
      transferDate: formatDateOnly(r.transferDate),
      sendingBranch: r.sendingBranch,
      receivingBranch: r.receivingBranch,
      modeOfTransfer: r.modeOfTransfer,
      status: r.status,
      itemCount: r.items?.length ?? 0,
      createdAt: r.createdAt.toISOString(),
      createdByName,
      trackingName: r.trackingName,
      trackingNumber: r.trackingNumber,
    };
  }

  private async employeeNamesByUserIds(
    userIds: string[],
  ): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const employees = await this.employeesRepo.find({
      where: { userId: In(userIds) },
    });
    const map = new Map<string, string>();
    for (const e of employees) {
      const name = [e.firstName, e.lastName].filter(Boolean).join(' ').trim();
      map.set(e.userId, name || 'Staff');
    }
    return map;
  }
}
