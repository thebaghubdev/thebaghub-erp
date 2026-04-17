import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { InquiryStatus } from '../enums/inquiry-status.enum';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { ItemAuthentication } from '../inventory/entities/item-authentication.entity';
import {
  Inquiry,
  type InquiryItemSnapshot,
} from '../inquiries/entities/inquiry.entity';
import {
  InquiryAuditService,
  cloneInquiryForAudit,
} from '../inquiries/inquiry-audit.service';
import { CreateConsignmentScheduleDto } from './dto/create-consignment-schedule.dto';
import type { ReceiveItemFormDto } from './dto/receive-item-form.dto';
import { ReceiveScheduleItemsDto } from './dto/receive-schedule-items.dto';
import { RescheduleConsignmentScheduleDto } from './dto/reschedule-consignment-schedule.dto';
import {
  ConsignmentSchedule,
  ConsignmentScheduleItem,
} from './entities/consignment-schedule.entities';

export type ConsignmentScheduleListRow = {
  id: string;
  deliveryDate: string;
  status: string;
  type: string;
  modeOfTransfer: string;
  branch: string;
  createdAt: string;
  createdByName: string;
  inquiryCount: number;
  /** Present when the schedule was rescheduled at least once. */
  rescheduleReason: string | null;
};

export type ConsignmentScheduleInquiryRow = {
  id: string;
  sku: string;
  status: string;
  itemLabel: string;
  inclusions: string;
};

export type ConsignmentScheduleDetail = ConsignmentScheduleListRow & {
  inquiries: ConsignmentScheduleInquiryRow[];
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

/** UTC calendar day bounds for `d`. */
function utcDayRange(d: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  return { start, end };
}

/** Distinct from inquiry lock keys — serializes inventory SKU allocation per UTC day. */
function utcInventoryDayLockKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `inv-${y}-${m}-${day}`;
}

/**
 * Inventory SKU: same date + sequence shape as inquiries, without the INQ- prefix.
 * Example: 2026-0414-01
 */
function formatInventorySku(ref: Date, sequence: number): string {
  const y = ref.getUTCFullYear();
  const mm = String(ref.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ref.getUTCDate()).padStart(2, '0');
  const mmdd = `${mm}${dd}`;
  const seq =
    sequence < 100
      ? String(sequence).padStart(2, '0')
      : String(sequence);
  return `${y}-${mmdd}-${seq}`;
}

function mergeItemFormFromReceive(
  snapshot: InquiryItemSnapshot,
  form: ReceiveItemFormDto,
): InquiryItemSnapshot {
  const prev = { ...(snapshot.form ?? {}) };
  const next: Record<string, unknown> = {
    ...prev,
    itemModel: form.itemModel,
    brand: form.brand,
    category: form.category,
    serialNumber: form.serialNumber,
    color: form.color,
    material: form.material,
    condition: form.condition,
    inclusions: form.inclusions,
    sourceOfPurchase: form.sourceOfPurchase,
  };
  const dp = form.datePurchased.trim();
  if (dp !== '') {
    next['datePurchased'] = dp;
  }
  return {
    clientItemId: snapshot.clientItemId,
    images: Array.isArray(snapshot.images) ? snapshot.images : [],
    form: next,
  };
}

@Injectable()
export class ConsignmentSchedulesService {
  constructor(
    @InjectRepository(ConsignmentSchedule)
    private readonly scheduleRepo: Repository<ConsignmentSchedule>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    private readonly inquiryAudit: InquiryAuditService,
  ) {}

  async findAllForStaff(): Promise<ConsignmentScheduleListRow[]> {
    const list = await this.scheduleRepo.find({
      relations: { createdBy: true, items: true },
      order: { deliveryDate: 'ASC' },
    });
    return list.map((s) => this.mapScheduleToListRow(s));
  }

  async findOneForStaff(id: string): Promise<ConsignmentScheduleDetail> {
    const s = await this.scheduleRepo.findOne({
      where: { id },
      relations: { createdBy: true, items: { inquiry: true } },
    });
    if (!s) {
      throw new NotFoundException('Schedule not found');
    }
    const base = this.mapScheduleToListRow(s);
    const inquiries: ConsignmentScheduleInquiryRow[] = (s.items ?? []).map(
      (it) => ({
        id: it.inquiry.id,
        sku: it.inquiry.sku,
        status: String(it.inquiry.status),
        itemLabel: itemLabelFromSnapshot(it.inquiry.itemSnapshot),
        inclusions: inclusionsFromSnapshot(it.inquiry.itemSnapshot),
      }),
    );
    inquiries.sort((a, b) => a.sku.localeCompare(b.sku));
    return { ...base, inquiries };
  }

  async rescheduleForStaff(
    id: string,
    dto: RescheduleConsignmentScheduleDto,
  ): Promise<ConsignmentScheduleDetail> {
    const deliveryDate = new Date(`${dto.deliveryDate}T12:00:00.000Z`);
    const s = await this.scheduleRepo.findOne({ where: { id } });
    if (!s) {
      throw new NotFoundException('Schedule not found');
    }
    s.deliveryDate = deliveryDate;
    s.status = 'rescheduled';
    s.rescheduleReason = dto.rescheduleReason.trim();
    await this.scheduleRepo.save(s);
    return this.findOneForStaff(id);
  }

  async removeForStaff(id: string, staffUserId: string): Promise<void> {
    await this.scheduleRepo.manager.transaction(async (em) => {
      const schedule = await em.findOne(ConsignmentSchedule, {
        where: { id },
        relations: { items: { inquiry: true } },
      });
      if (!schedule) {
        throw new NotFoundException('Schedule not found');
      }

      const label = await this.inquiryAudit.staffActorLabel(staffUserId);
      const actor = { userId: staffUserId, label };

      for (const item of schedule.items ?? []) {
        const inv = item.inquiry;
        if (schedule.type === 'delivery') {
          if (inv.status === InquiryStatus.FOR_DELIVERY_SCHEDULED) {
            const before = cloneInquiryForAudit(inv);
            inv.status = InquiryStatus.FOR_DELIVERY;
            await em.save(inv);
            await this.inquiryAudit.recordDiff(inv.id, before, inv, actor, em);
          }
        } else if (schedule.type === 'pullout') {
          if (inv.status === InquiryStatus.FOR_PULLOUT_SCHEDULED) {
            const before = cloneInquiryForAudit(inv);
            inv.status = InquiryStatus.FOR_PULLOUT;
            await em.save(inv);
            await this.inquiryAudit.recordDiff(inv.id, before, inv, actor, em);
          }
        }
      }

      await em.remove(schedule);
    });
  }

  async createForStaff(
    userId: string,
    dto: CreateConsignmentScheduleDto,
  ): Promise<ConsignmentScheduleListRow> {
    const employee = await this.employeesRepo.findOne({
      where: { userId },
    });
    if (!employee) {
      throw new BadRequestException('Employee profile not found');
    }

    const expectedPrior: InquiryStatus =
      dto.type === 'delivery'
        ? InquiryStatus.FOR_DELIVERY
        : InquiryStatus.FOR_PULLOUT;
    const nextStatus: InquiryStatus =
      dto.type === 'delivery'
        ? InquiryStatus.FOR_DELIVERY_SCHEDULED
        : InquiryStatus.FOR_PULLOUT_SCHEDULED;

    const deliveryDate = new Date(`${dto.deliveryDate}T12:00:00.000Z`);

    return await this.scheduleRepo.manager.transaction(async (em) => {
      const schedule = em.create(ConsignmentSchedule, {
        deliveryDate,
        status: 'scheduled',
        type: dto.type,
        modeOfTransfer: dto.modeOfTransfer,
        branch: dto.branch,
        createdBy: employee,
      });
      await em.save(schedule);

      const staffLabel = await this.inquiryAudit.staffActorLabel(userId);
      const staffActor = { userId, label: staffLabel };

      for (const inquiryId of dto.inquiryIds) {
        const inquiry = await em.findOne(Inquiry, {
          where: { id: inquiryId },
        });
        if (!inquiry) {
          throw new NotFoundException(`Inquiry not found: ${inquiryId}`);
        }
        if (inquiry.status !== expectedPrior) {
          throw new BadRequestException(
            `Inquiry ${inquiry.sku} must be in status "${expectedPrior}" to add to this schedule`,
          );
        }
        const before = cloneInquiryForAudit(inquiry);
        inquiry.status = nextStatus;
        await em.save(inquiry);
        await this.inquiryAudit.recordDiff(
          inquiry.id,
          before,
          inquiry,
          staffActor,
          em,
        );

        const link = em.create(ConsignmentScheduleItem, {
          consignmentSchedule: schedule,
          inquiry,
        });
        await em.save(link);
      }

      const saved = await em.findOneOrFail(ConsignmentSchedule, {
        where: { id: schedule.id },
        relations: { createdBy: true, items: true },
      });
      return this.mapScheduleToListRow(saved);
    });
  }

  /**
   * Receives all inquiries on a schedule: merges item forms, sets inquiry status to
   * for_processing, creates inventory rows, and removes the schedule.
   */
  async receiveItemsForStaff(
    scheduleId: string,
    dto: ReceiveScheduleItemsDto,
    staffUserId: string,
  ): Promise<{ received: number }> {
    return await this.scheduleRepo.manager.transaction(async (em) => {
      const schedule = await em.findOne(ConsignmentSchedule, {
        where: { id: scheduleId },
        relations: { items: { inquiry: true } },
      });
      if (!schedule) {
        throw new NotFoundException('Schedule not found');
      }
      const links = schedule.items ?? [];
      if (links.length === 0) {
        throw new BadRequestException('Schedule has no inquiries');
      }

      const expectedIds = new Set(links.map((l) => l.inquiry.id));
      if (dto.items.length !== expectedIds.size) {
        throw new BadRequestException(
          `Expected ${String(expectedIds.size)} item(s), got ${String(dto.items.length)}`,
        );
      }
      const byInquiryId = new Map(
        dto.items.map((row) => [row.inquiryId, row] as const),
      );
      if (byInquiryId.size !== dto.items.length) {
        throw new BadRequestException('Duplicate inquiry ids in payload');
      }
      for (const id of expectedIds) {
        if (!byInquiryId.has(id)) {
          throw new BadRequestException(
            `Missing form data for inquiry ${id}`,
          );
        }
      }

      const refDate = new Date();

      await em.query(
        `SELECT pg_advisory_xact_lock(hashtext($1::text)::bigint)`,
        [utcInventoryDayLockKey(refDate)],
      );

      const bounds = utcDayRange(refDate);
      const countToday = await em.count(InventoryItem, {
        where: { dateReceived: Between(bounds.start, bounds.end) },
      });

      const staffLabel = await this.inquiryAudit.staffActorLabel(staffUserId);
      const staffActor = { userId: staffUserId, label: staffLabel };

      let seq = countToday;
      for (const link of links) {
        const inv = link.inquiry;
        const row = byInquiryId.get(inv.id);
        if (!row) {
          throw new BadRequestException(`Missing form data for inquiry ${inv.id}`);
        }

        const scheduled =
          inv.status === InquiryStatus.FOR_DELIVERY_SCHEDULED ||
          inv.status === InquiryStatus.FOR_PULLOUT_SCHEDULED;
        if (!scheduled) {
          throw new BadRequestException(
            `Inquiry ${inv.sku} is not in a scheduled delivery or pullout state`,
          );
        }

        const before = cloneInquiryForAudit(inv);
        const merged = mergeItemFormFromReceive(inv.itemSnapshot, row.form);
        inv.itemSnapshot = merged;
        inv.status = InquiryStatus.FOR_PROCESSING;
        await em.save(inv);
        await this.inquiryAudit.recordDiff(inv.id, before, inv, staffActor, em);

        seq += 1;
        const sku = formatInventorySku(refDate, seq);
        const transactionType =
          inv.offerTransactionType === 'direct_purchase' ||
          inv.offerTransactionType === 'consignment'
            ? inv.offerTransactionType
            : null;

        const inventoryRow = em.create(InventoryItem, {
          sku,
          dateReceived: refDate,
          inquiryId: inv.id,
          consignorId: inv.consignorId,
          status: 'For Authentication',
          transactionType,
          currentBranch: schedule.branch,
          itemSnapshot: merged,
          createdById: null,
          updatedById: null,
        });
        await em.save(inventoryRow);

        const itemAuth = em.create(ItemAuthentication, {
          inventoryItemId: inventoryRow.id,
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
        await em.save(itemAuth);
      }

      await em.remove(schedule);

      return { received: links.length };
    });
  }

  private mapScheduleToListRow(s: ConsignmentSchedule): ConsignmentScheduleListRow {
    const rr = s.rescheduleReason?.trim();
    return {
      id: s.id,
      deliveryDate: s.deliveryDate.toISOString(),
      status: s.status,
      type: s.type,
      modeOfTransfer: s.modeOfTransfer,
      branch: s.branch,
      createdAt: s.createdAt.toISOString(),
      createdByName: [s.createdBy.firstName, s.createdBy.lastName]
        .filter(Boolean)
        .join(' ')
        .trim(),
      inquiryCount: s.items?.length ?? 0,
      rescheduleReason: rr && rr.length > 0 ? rr : null,
    };
  }
}
