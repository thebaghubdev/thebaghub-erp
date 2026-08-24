import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { Employee } from '../employees/entities/employee.entity';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { Voucher } from './entities/voucher.entity';
import {
  VOUCHER_NUMBER_OFFSET,
  VOUCHER_STATUS_ACTIVE,
  VOUCHER_STATUS_FORFEITED,
} from './voucher-status.constants';

export type VoucherListRow = {
  id: string;
  voucherNumber: number | null;
  clientId: string;
  clientName: string;
  amount: string;
  expirationDate: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
  updatedByName: string;
};

export type ClientVoucherViewRow = {
  id: string;
  voucherNumber: number | null;
  amount: string;
  expirationDate: string;
  status: string;
  createdAt: string;
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

function trimToNull(value: string | undefined | null): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === '' ? null : t;
}

function clientDisplayName(client: Client): string {
  const name = [client.firstName, client.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || client.email;
}

function nextVoucherNumber(currentMax: number | null): number {
  if (currentMax == null || currentMax < VOUCHER_NUMBER_OFFSET) {
    return VOUCHER_NUMBER_OFFSET + 1;
  }
  return currentMax + 1;
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
    private readonly dataSource: DataSource,
  ) {}

  async findAllForStaff(): Promise<VoucherListRow[]> {
    const rows = await this.voucherRepo.find({
      relations: { client: true },
      order: { createdAt: 'DESC' },
    });
    return await this.mapRowsToList(rows);
  }

  async findByClientForStaff(clientId: string): Promise<VoucherListRow[]> {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const rows = await this.voucherRepo.find({
      where: { clientId },
      relations: { client: true },
      order: { createdAt: 'DESC' },
    });
    return await this.mapRowsToList(rows);
  }

  async findMineForClient(userId: string): Promise<ClientVoucherViewRow[]> {
    const client = await this.clientRepo.findOne({ where: { userId } });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const rows = await this.voucherRepo.find({
      where: { clientId: client.id },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.mapToClientViewRow(row));
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

    const saved = await this.dataSource.transaction(async (em) => {
      await em.query('SELECT pg_advisory_xact_lock($1)', [834729206]);

      const maxRow = await em
        .createQueryBuilder(Voucher, 'v')
        .select('MAX(v.voucherNumber)', 'max')
        .getRawOne<{ max: string | null }>();
      const voucherNumber = nextVoucherNumber(
        maxRow?.max ? Number(maxRow.max) : null,
      );

      const voucher = em.create(Voucher, {
        clientId: dto.clientId,
        amount: formatAmount(dto.amount),
        expirationDate: dto.expirationDate as unknown as Date,
        status: VOUCHER_STATUS_ACTIVE,
        notes: trimToNull(dto.notes),
        voucherNumber,
        createdById: userId,
        updatedById: userId,
      });
      return await em.save(voucher);
    });
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

  private async mapRowsToList(rows: Voucher[]): Promise<VoucherListRow[]> {
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

  private mapToClientViewRow(row: Voucher): ClientVoucherViewRow {
    return {
      id: row.id,
      voucherNumber: row.voucherNumber ?? null,
      amount: String(row.amount),
      expirationDate: formatDateOnly(row.expirationDate),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapToListRow(
    row: Voucher,
    nameByUserId: Map<string, string>,
  ): VoucherListRow {
    return {
      id: row.id,
      voucherNumber: row.voucherNumber ?? null,
      clientId: row.clientId,
      clientName: row.client ? clientDisplayName(row.client) : 'Client',
      amount: String(row.amount),
      expirationDate: formatDateOnly(row.expirationDate),
      status: row.status,
      notes: row.notes?.trim() ? row.notes.trim() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdByName:
        (row.createdById && nameByUserId.get(row.createdById)) || 'Staff',
      updatedByName:
        (row.updatedById && nameByUserId.get(row.updatedById)) || 'Staff',
    };
  }
}
