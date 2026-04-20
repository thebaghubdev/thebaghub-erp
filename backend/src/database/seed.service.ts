import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AuthenticationMetric } from '../authentication-metrics/entities/authentication-metric.entity';
import { Employee } from '../employees/entities/employee.entity';
import { UserType } from '../enums/user-type.enum';
import {
  AUTHENTICATION_RATINGS_KEY,
  BRANDS_WE_CONSIGN_KEY,
  CONSIGNMENT_LIMIT_PER_DAY_KEY,
  ITEM_CATEGORIES_KEY,
  POSITIONS_KEY,
} from '../settings/consignment-setting-keys';
import { Setting } from '../settings/entities/setting.entity';
import { User } from '../users/entities/user.entity';
import { AUTHENTICATION_METRICS_SEED } from './authentication-metrics.seed-data';

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
    @InjectRepository(AuthenticationMetric)
    private readonly authenticationMetricsRepo: Repository<AuthenticationMetric>,
  ) {}

  async onModuleInit() {
    await this.ensureAdministrator();
    await this.ensureConsignmentFormSettings();
    await this.ensureAuthenticationMetrics();
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
        key: POSITIONS_KEY,
        title: 'Positions',
        description:
          'Positions available for employees. Used for position options on the register page.',
        category: 'General',
        type: 'string[]',
        value:
          '["CEO","General Manager","Supervisor","Executive Assistant","Authenticator","Consignment Coordinator","Consignment Admin","Finance Admin","Sales Associate","Sales Admin","Marketing Admin", "Photographer"]',
      },
      {
        key: BRANDS_WE_CONSIGN_KEY,
        title: 'Brands we consign',
        description:
          'Brands accepted for consignment. Used for brand options on the client consign form.',
        category: 'Consignment',
        type: 'string[]',
        value:
          '["Bottega Veneta","Balenciaga","Hermès","Louis Vuitton","Fauré Le Page","Chanel","Moynat","Dior","Moreau","Valentino Garavani","Prada","Loro Piana","Chloé","Loewe","Delvaux","Celine","Goyard","The Row","Givenchy","Saint Laurent","Fendi","Miu Miu","Gucci","Alaïa","Jacquemus","Versace","Issey Miyake","Balmain","Alexander McQueen","Dolce & Gabbana","Rimowa","Maison Margiela","Gentle Monster","Amina Muaddi","Christian Louboutin","Manolo Blahnik","Tiffany & Co.","Bvlgari","Chopard","Van Cleef & Arpels","Cartier","IWC Schaffhausen","Rolex","Patek Philippe","Audemars Piguet","Panerai","Omega","Jaeger-LeCoultre","Franck Muller"]',
      },
      {
        key: ITEM_CATEGORIES_KEY,
        title: 'Item categories',
        description:
          'Categories for consigned items. Used for category options on the client consign form.',
        category: 'Consignment',
        type: 'string[]',
        value:
          '["Bag","Wallets/SLGs","Shoes","Belts","Shades","Watch","Scarves/Twillies","Hats/Caps","High End Jewelry","Designer Costumes Accessories","Designer Clothes"]',
      },
      {
        key: AUTHENTICATION_RATINGS_KEY,
        title: 'Authentication ratings',
        description:
          'Condition and grade labels used when authenticating inventory (e.g. Pristine, Excellent). Shown as the rating dropdown on item authentication.',
        category: 'Authentication',
        type: 'string[]',
        value:
          '["Brand new","Unused","Pristine (10)","Excellent (9.9)","Very good (9.8)","Good (9.7)","Fair (9.6)"]',
      },
      {
        key: CONSIGNMENT_LIMIT_PER_DAY_KEY,
        title: 'Consignment limit per day',
        description:
          'Maximum number of consignments we can accommodate per day.',
        category: 'Consignment',
        type: 'number',
        value: '10',
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

  private async ensureAuthenticationMetrics() {
    const existing = await this.authenticationMetricsRepo.count();
    if (existing > 0) {
      return;
    }

    const rows = AUTHENTICATION_METRICS_SEED.map(
      ([category, metricCategory, metric, description]) =>
        this.authenticationMetricsRepo.create({
          category,
          metricCategory,
          metric,
          description,
          isCustom: false,
          brand: null,
          model: null,
        }),
    );
    await this.authenticationMetricsRepo.save(rows);
    this.logger.log(`Seeded ${rows.length} authentication metric rows.`);
  }
}
