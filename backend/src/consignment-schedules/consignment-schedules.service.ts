import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { InquiryStatus } from '../enums/inquiry-status.enum';
import { Inquiry } from '../inquiries/entities/inquiry.entity';
import { CreateConsignmentScheduleDto } from './dto/create-consignment-schedule.dto';
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
};

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
    };
  }
}
