import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { Notification } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';

export type NotificationApiRow = {
  id: string;
  message: string;
  isRead: boolean;
  receiverId: string;
  receiverRole: string | null;
  inquiryId: string | null;
  createdAt: string;
};

export type NotifyParams = {
  message: string;
  /** When set, only this employee receives a row. Mutually exclusive with `receiverRole`. */
  receiverId?: string;
  /** When set, one row per employee with this `employees.position`. */
  receiverRole?: string;
  inquiryId?: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Persists notification(s) and pushes to connected staff in real time.
   * Provide either `receiverId` or `receiverRole` (not both, not neither).
   */
  async notify(params: NotifyParams): Promise<Notification[]> {
    const message = params.message?.trim();
    if (!message) {
      throw new BadRequestException('message is required');
    }
    const rid = params.receiverId?.trim();
    const role = params.receiverRole?.trim();
    if (rid && role) {
      throw new BadRequestException(
        'Specify only one of receiverId or receiverRole',
      );
    }
    if (!rid && !role) {
      throw new BadRequestException('receiverId or receiverRole is required');
    }

    const inquiryId = params.inquiryId ?? null;

    if (rid) {
      const emp = await this.employeesRepo.findOne({ where: { id: rid } });
      if (!emp) {
        throw new BadRequestException('receiverId does not match an employee');
      }
      const row = await this.saveAndEmitOne({
        message,
        receiverId: emp.id,
        receiverRole: null,
        inquiryId,
      });
      return [row];
    }

    const roleValue = role as string;
    const staff = await this.employeesRepo.find({
      where: { position: roleValue },
    });
    if (staff.length === 0) {
      return [];
    }
    const rows: Notification[] = [];
    for (const emp of staff) {
      rows.push(
        await this.saveAndEmitOne({
          message,
          receiverId: emp.id,
          receiverRole: roleValue,
          inquiryId,
        }),
      );
    }
    return rows;
  }

  private async saveAndEmitOne(data: {
    message: string;
    receiverId: string;
    receiverRole: string | null;
    inquiryId: string | null;
  }): Promise<Notification> {
    const row = this.notificationsRepo.create({
      message: data.message,
      isRead: false,
      receiverId: data.receiverId,
      receiverRole: data.receiverRole,
      inquiryId: data.inquiryId,
      createdById: null,
      updatedById: null,
    });
    const saved = await this.notificationsRepo.save(row);
    this.gateway.emitToEmployee(
      data.receiverId,
      'notification',
      this.toApiRow(saved),
    );
    return saved;
  }

  private toApiRow(n: Notification): NotificationApiRow {
    return {
      id: n.id,
      message: n.message,
      isRead: n.isRead,
      receiverId: n.receiverId,
      receiverRole: n.receiverRole,
      inquiryId: n.inquiryId,
      createdAt: n.createdAt.toISOString(),
    };
  }

  async listForReceiver(
    employeeId: string,
    take = 80,
  ): Promise<NotificationApiRow[]> {
    const rows = await this.notificationsRepo.find({
      where: { receiverId: employeeId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(take, 1), 200),
    });
    return rows.map((n) => this.toApiRow(n));
  }

  async unreadCountForReceiver(employeeId: string): Promise<number> {
    return this.notificationsRepo.count({
      where: { receiverId: employeeId, isRead: false },
    });
  }

  async markRead(
    employeeId: string,
    notificationId: string,
  ): Promise<NotificationApiRow> {
    const row = await this.notificationsRepo.findOne({
      where: { id: notificationId, receiverId: employeeId },
    });
    if (!row) {
      throw new NotFoundException();
    }
    if (!row.isRead) {
      row.isRead = true;
      row.updatedById = null;
      await this.notificationsRepo.save(row);
    }
    return this.toApiRow(row);
  }

  async markAllRead(employeeId: string): Promise<{ updated: number }> {
    const res = await this.notificationsRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true })
      .where('receiver_id = :eid', { eid: employeeId })
      .andWhere('is_read = false')
      .execute();
    return { updated: res.affected ?? 0 };
  }

  /** Resolves portal user to employee id; throws if not staff with a profile. */
  async requireEmployeeIdForUser(userId: string): Promise<string> {
    const emp = await this.employeesRepo.findOne({ where: { userId } });
    if (!emp) {
      throw new ForbiddenException('Employee profile required');
    }
    return emp.id;
  }
}
