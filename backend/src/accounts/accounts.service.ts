import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { normalizeClientVipStatus } from '../clients/client-vip-status.util';
import type { ClientVipStatus } from '../clients/client-vip-status.util';
import { Employee } from '../employees/entities/employee.entity';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

export type EmployeeAccountRow = {
  id: string;
  userId: string;
  username: string;
  isAdmin: boolean;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  hireDate: string;
  position: string;
  createdAt: string;
};

export type ClientAccountRow = {
  id: string;
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  vipStatus: 'Regular' | 'Gold' | 'Diamond';
  totalConsignments: number;
  totalPurchases: number;
  createdAt: string;
};

export type ClientAccountDetail = ClientAccountRow & {
  completeAddress: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  bankCode: string | null;
  preferredPaymentMethod:
    | 'check_pickup'
    | 'cash_pickup'
    | 'direct_deposit'
    | null;
  preferredPaymentBranch: 'pasig' | 'makati' | null;
  isCreditLine: boolean;
  emailVerifiedAt: string | null;
  updatedAt: string;
};

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
  ) {}

  private mapEmployee(e: Employee): EmployeeAccountRow {
    return {
      id: e.id,
      userId: e.userId,
      username: e.user.username,
      isAdmin: e.user.isAdmin,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      contactNumber: e.contactNumber,
      hireDate:
        e.hireDate instanceof Date
          ? e.hireDate.toISOString().slice(0, 10)
          : String(e.hireDate).slice(0, 10),
      position: e.position,
      createdAt: e.createdAt.toISOString(),
    };
  }

  async findAllEmployees(): Promise<EmployeeAccountRow[]> {
    const rows = await this.employeesRepo.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
    return rows.map((e) => this.mapEmployee(e));
  }

  async findAllClients(): Promise<ClientAccountRow[]> {
    const rows = await this.clientsRepo.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
    return rows.map((c) => this.mapClientRow(c));
  }

  async findClientById(clientId: string): Promise<ClientAccountDetail> {
    const client = await this.clientsRepo.findOne({
      where: { id: clientId },
      relations: ['user'],
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return this.mapClientDetail(client);
  }

  private mapClientRow(c: Client): ClientAccountRow {
    return {
      id: c.id,
      userId: c.userId,
      username: c.user.username,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      contactNumber: c.contactNumber,
      vipStatus: normalizeClientVipStatus(c.vipStatus),
      totalConsignments: c.totalConsignments,
      totalPurchases: c.totalPurchases,
      createdAt: c.createdAt.toISOString(),
    };
  }

  private mapClientDetail(c: Client): ClientAccountDetail {
    return {
      ...this.mapClientRow(c),
      completeAddress: c.completeAddress,
      bankAccountNumber: c.bankAccountNumber,
      bankAccountName: c.bankAccountName,
      bankCode: c.bankCode,
      preferredPaymentMethod: c.preferredPaymentMethod,
      preferredPaymentBranch: c.preferredPaymentBranch,
      isCreditLine: c.isCreditLine,
      emailVerifiedAt: c.user.emailVerifiedAt?.toISOString() ?? null,
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  async updateClientVipStatus(
    clientId: string,
    vipStatus: ClientVipStatus,
    actorUserId: string,
  ): Promise<ClientAccountDetail> {
    const client = await this.clientsRepo.findOne({
      where: { id: clientId },
      relations: ['user'],
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    client.vipStatus = vipStatus;
    client.updatedById = actorUserId;
    await this.clientsRepo.save(client);

    const refreshed = await this.clientsRepo.findOneOrFail({
      where: { id: clientId },
      relations: ['user'],
    });
    return this.mapClientDetail(refreshed);
  }

  async updateClientCreditLine(
    clientId: string,
    isCreditLine: boolean,
    actorUserId: string,
  ): Promise<ClientAccountDetail> {
    const client = await this.clientsRepo.findOne({
      where: { id: clientId },
      relations: ['user'],
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    client.isCreditLine = isCreditLine;
    client.updatedById = actorUserId;
    await this.clientsRepo.save(client);

    const refreshed = await this.clientsRepo.findOneOrFail({
      where: { id: clientId },
      relations: ['user'],
    });
    return this.mapClientDetail(refreshed);
  }

  async updateEmployee(
    employeeId: string,
    dto: UpdateEmployeeDto,
    actorUserId: string,
  ): Promise<EmployeeAccountRow> {
    const employee = await this.employeesRepo.findOne({
      where: { id: employeeId },
      relations: ['user'],
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (employee.user.isAdmin) {
      throw new BadRequestException(
        'Administrator accounts cannot be edited here',
      );
    }

    employee.firstName = dto.firstName.trim();
    employee.lastName = dto.lastName.trim();
    employee.email = dto.email.trim().toLowerCase();
    employee.contactNumber = dto.contactNumber.trim();
    employee.hireDate = new Date(dto.hireDate);
    employee.position = dto.position.trim();
    employee.updatedById = actorUserId;
    await this.employeesRepo.save(employee);

    const refreshed = await this.employeesRepo.findOneOrFail({
      where: { id: employeeId },
      relations: ['user'],
    });
    return this.mapEmployee(refreshed);
  }
}
