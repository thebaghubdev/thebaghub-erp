import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { Employee } from '../employees/entities/employee.entity';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { Voucher } from './entities/voucher.entity';
import {
  VOUCHER_STATUS_ACTIVE,
  VOUCHER_STATUS_FORFEITED,
} from './voucher-status.constants';

export type VoucherListRow = {
  id: string;
  clientId: string;
  clientName: string;
  amount: string;
  expirationDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
  updatedByName: string;
};

function formatDateOnly(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatAmount(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new BadRequestException('Amount must be a positive number');
  }
  return n.toFixed(2);
}

function clientDisplayName(client: Client): string {
  const name = [client.firstName, client.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || client.email;
}

@Injectable()
export class VouchersService {
  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepo: Repository<Voucher>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
  ) {}

  async findAllForStaff(): Promise<VoucherListRow[]> {
    const rows = await this.voucherRepo.find({
      relations: { client: true },
      order: { createdAt: 'DESC' },
    });
    const userIds = [
      ...new Set(
        rows
          .flatMap((r) => [r.createdById, r.updatedById])
          .filter((id): id is string => id != null && id !== ''),
      ),
    ];
    const nameByUserId = await this.employeeNamesByUserIds(userIds);
    return rows.map((row) => this.mapToListRow(row, nameByUserId));
  }

  async createForStaff(
    userId: string,
    dto: CreateVoucherDto,
  ): Promise<VoucherListRow> {
    const client = await this.clientRepo.findOne({
      where: { id: dto.clientId },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const voucher = this.voucherRepo.create({
      clientId: dto.clientId,
      amount: formatAmount(dto.amount),
      expirationDate: dto.expirationDate as unknown as Date,
      status: VOUCHER_STATUS_ACTIVE,
      createdById: userId,
      updatedById: userId,
    });
    const saved = await this.voucherRepo.save(voucher);
    const withClient = await this.voucherRepo.findOne({
      where: { id: saved.id },
      relations: { client: true },
    });
    if (!withClient) {
      throw new NotFoundException('Voucher not found');
    }
    const nameByUserId = await this.employeeNamesByUserIds([userId]);
    return this.mapToListRow(withClient, nameByUserId);
  }

  async forfeitForStaff(id: string, userId: string): Promise<VoucherListRow> {
    const voucher = await this.voucherRepo.findOne({
      where: { id },
      relations: { client: true },
    });
    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }
    if (voucher.status === VOUCHER_STATUS_FORFEITED) {
      const nameByUserId = await this.employeeNamesByUserIds(
        [voucher.createdById, voucher.updatedById].filter(
          (uid): uid is string => uid != null && uid !== '',
        ),
      );
      return this.mapToListRow(voucher, nameByUserId);
    }
    if (voucher.status !== VOUCHER_STATUS_ACTIVE) {
      throw new BadRequestException('Only active vouchers can be forfeited');
    }

    voucher.status = VOUCHER_STATUS_FORFEITED;
    voucher.updatedById = userId;
    await this.voucherRepo.save(voucher);

    const nameByUserId = await this.employeeNamesByUserIds(
      [voucher.createdById, voucher.updatedById].filter(
        (uid): uid is string => uid != null && uid !== '',
      ),
    );
    return this.mapToListRow(voucher, nameByUserId);
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
    row: Voucher,
    nameByUserId: Map<string, string>,
  ): VoucherListRow {
    return {
      id: row.id,
      clientId: row.clientId,
      clientName: row.client ? clientDisplayName(row.client) : 'Client',
      amount: String(row.amount),
      expirationDate: formatDateOnly(row.expirationDate),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdByName:
        (row.createdById && nameByUserId.get(row.createdById)) || 'Staff',
      updatedByName:
        (row.updatedById && nameByUserId.get(row.updatedById)) || 'Staff',
    };
  }
}
