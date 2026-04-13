import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { UserType } from '../enums/user-type.enum';
import {
  BRANDS_WE_CONSIGN_KEY,
  ITEM_CATEGORIES_KEY,
} from '../settings/consignment-setting-keys';
import { Setting } from '../settings/entities/setting.entity';
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
    @InjectRepository(Setting)
    private readonly settingsRepo: Repository<Setting>,
  ) {}

  async onModuleInit() {
    await this.ensureAdministrator();
    await this.ensureConsignmentFormSettings();
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

  private async ensureConsignmentFormSettings() {
    const defaults: Array<{
      key: string;
      title: string;
      description: string;
      category: string;
      type: string;
      value: string;
    }> = [
      {
        key: BRANDS_WE_CONSIGN_KEY,
        title: 'Brands we consign',
        description:
          'Brands accepted for consignment. Used for brand options on the client consign form.',
        category: 'Consignment',
        type: 'string[]',
        value: '[]',
      },
      {
        key: ITEM_CATEGORIES_KEY,
        title: 'Item categories',
        description:
          'Categories for consigned items. Used for category options on the client consign form.',
        category: 'Consignment',
        type: 'string[]',
        value: '[]',
      },
    ];

    for (const row of defaults) {
      const existing = await this.settingsRepo.findOne({
        where: { key: row.key },
      });
      if (existing) continue;
      await this.settingsRepo.save(this.settingsRepo.create(row));
      this.logger.log(`Seeded setting "${row.key}".`);
    }
  }
}
