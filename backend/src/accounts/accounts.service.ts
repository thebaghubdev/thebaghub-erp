import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
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
  createdAt: string;
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
    return rows.map((c) => ({
      id: c.id,
      userId: c.userId,
      username: c.user.username,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      contactNumber: c.contactNumber,
      createdAt: c.createdAt.toISOString(),
    }));
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
