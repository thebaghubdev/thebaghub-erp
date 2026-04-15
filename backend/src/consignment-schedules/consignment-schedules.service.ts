import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { InquiryStatus } from '../enums/inquiry-status.enum';
import {
  Inquiry,
  type InquiryItemSnapshot,
} from '../inquiries/entities/inquiry.entity';
import { CreateConsignmentScheduleDto } from './dto/create-consignment-schedule.dto';
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

@Injectable()
export class ConsignmentSchedulesService {
  constructor(
    @InjectRepository(ConsignmentSchedule)
    private readonly scheduleRepo: Repository<ConsignmentSchedule>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
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

  async removeForStaff(id: string): Promise<void> {
    await this.scheduleRepo.manager.transaction(async (em) => {
      const schedule = await em.findOne(ConsignmentSchedule, {
        where: { id },
        relations: { items: { inquiry: true } },
      });
      if (!schedule) {
        throw new NotFoundException('Schedule not found');
      }

      for (const item of schedule.items ?? []) {
        const inv = item.inquiry;
        if (schedule.type === 'delivery') {
          if (inv.status === InquiryStatus.FOR_DELIVERY_SCHEDULED) {
            inv.status = InquiryStatus.FOR_DELIVERY;
            await em.save(inv);
          }
        } else if (schedule.type === 'pullout') {
          if (inv.status === InquiryStatus.FOR_PULLOUT_SCHEDULED) {
            inv.status = InquiryStatus.FOR_PULLOUT;
            await em.save(inv);
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
        inquiry.status = nextStatus;
        await em.save(inquiry);

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
