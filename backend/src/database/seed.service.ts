import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { UserType } from '../enums/user-type.enum';
import { User } from '../users/entities/user.entity';

const ADMIN_USERNAME = 'tbh-administrator';
const ADMIN_PASSWORD = 'Thebaghub@2026';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
  ) {}

  async onModuleInit() {
    await this.ensureAdministrator();
  }

  private async ensureAdministrator() {
    const existing = await this.usersRepo.findOne({
      where: { username: ADMIN_USERNAME },
    });
    if (existing) {
      return;
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    await this.usersRepo.manager.transaction(async (em) => {
      const user = em.create(User, {
        username: ADMIN_USERNAME,
        passwordHash,
        userType: UserType.EMPLOYEE,
        isAdmin: true,
        createdById: null,
        updatedById: null,
      });
      await em.save(user);

      const employee = em.create(Employee, {
        userId: user.id,
        firstName: 'System',
        lastName: 'Administrator',
        email: 'admin@thebaghub.local',
        contactNumber: '—',
        hireDate: new Date('2026-01-01'),
        position: 'Administrator',
        createdById: null,
        updatedById: null,
      });
      await em.save(employee);
    });

    this.logger.log(`Seeded administrator user "${ADMIN_USERNAME}".`);
  }
}
