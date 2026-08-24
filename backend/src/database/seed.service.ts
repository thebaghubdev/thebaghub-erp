import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AuthenticationMetric } from '../authentication-metrics/entities/authentication-metric.entity';
import { Client } from '../clients/entities/client.entity';
import { Employee } from '../employees/entities/employee.entity';
import { UserType } from '../enums/user-type.enum';
import {
  AUTHENTICATION_RATINGS_KEY,
  BRANDS_WE_CONSIGN_KEY,
  CONSIGNMENT_LIMIT_PER_DAY_KEY,
  CONTRACT_EXPIRATION_DAYS_KEY,
  ITEM_CATEGORIES_KEY,
  POSITIONS_KEY,
  VIP_DIAMOND_DISCOUNT_CAP_PHP_KEY,
  VIP_DIAMOND_DISCOUNT_PERCENT_KEY,
  VIP_DIAMOND_THRESHOLD_PHP_KEY,
  VIP_GOLD_DISCOUNT_CAP_PHP_KEY,
  VIP_GOLD_DISCOUNT_PERCENT_KEY,
  VIP_GOLD_THRESHOLD_PHP_KEY,
  VIP_TIER_INACTIVITY_MONTHS_KEY,
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
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
  ) {}

  async onModuleInit() {
    await this.ensureInquiryDirectPurchaseSchema();
    await this.ensureDirectPurchasePaymentsSchema();
    await this.ensurePenaltyWaiveSchema();
    await this.ensurePaymentVerificationStatuses();
    await this.ensureClientVipStatusBackfill();
    await this.ensureAdministrator();
    await this.ensureConsignmentFormSettings();
    await this.ensureAuthenticationMetrics();
  }

  /** Tables TypeORM synchronize may skip (especially in production). */
  private async ensureDirectPurchasePaymentsSchema() {
    try {
      await this.employeesRepo.query(`
        CREATE TABLE IF NOT EXISTS direct_purchase_payments (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          status varchar(128) NOT NULL DEFAULT 'Unpaid',
          check_number varchar(64),
          unable_to_send_reason text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await this.employeesRepo.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "UQ_direct_purchase_payments_unpaid_client"
          ON direct_purchase_payments (client_id)
          WHERE "status" = 'Unpaid'
      `);
      await this.employeesRepo.query(`
        CREATE TABLE IF NOT EXISTS direct_purchase_payments_item (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          inquiry_id uuid NOT NULL UNIQUE REFERENCES inquiries(id) ON DELETE CASCADE,
          direct_purchase_payment_id uuid NOT NULL REFERENCES direct_purchase_payments(id) ON DELETE CASCADE
        )
      `);
    } catch (err) {
      this.logger.warn(
        `Could not ensure direct purchase payments schema: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Columns + enum value TypeORM synchronize may skip (especially in production). */
  private async ensureInquiryDirectPurchaseSchema() {
    try {
      await this.employeesRepo.query(`
        ALTER TABLE inquiries
          ADD COLUMN IF NOT EXISTS direct_purchase_requested_price numeric(12,2),
          ADD COLUMN IF NOT EXISTS direct_purchase_approver_notes text,
          ADD COLUMN IF NOT EXISTS direct_purchase_reject_reason text
      `);
      const enumTypes: Array<{ typname: string }> = await this.employeesRepo.query(
        `
        SELECT DISTINCT t.typname
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE e.enumlabel = 'for_offer_confirmation'
        `,
      );
      for (const row of enumTypes) {
        const name = String(row.typname ?? '').trim();
        if (!/^[a-zA-Z0-9_]+$/.test(name)) continue;
        await this.employeesRepo.query(
          `ALTER TYPE "${name}" ADD VALUE IF NOT EXISTS 'for_direct_purchase_approval'`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Could not ensure inquiry direct-purchase schema: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async ensurePenaltyWaiveSchema() {
    try {
      await this.employeesRepo.query(`
        ALTER TABLE order_installments
          ADD COLUMN IF NOT EXISTS penalty_waive_status varchar(32)
      `);
      await this.employeesRepo.query(`
        ALTER TABLE notifications
          ADD COLUMN IF NOT EXISTS order_id uuid
      `);
    } catch (err) {
      this.logger.warn(
        `Could not ensure penalty waive schema: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async ensurePaymentVerificationStatuses() {
    try {
      await this.employeesRepo.query(`
        UPDATE order_payments
        SET status = 'For payment verification'
        WHERE status = 'Pending'
      `);
      await this.employeesRepo.query(`
        UPDATE order_installments
        SET status = 'For payment verification'
        WHERE status = 'Unpaid'
          AND proof_uploaded_at IS NOT NULL
      `);
    } catch (err) {
      this.logger.warn(
        `Could not backfill payment verification statuses: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async ensureClientVipStatusBackfill() {
    await this.clientsRepo
      .createQueryBuilder()
      .update(Client)
      .set({ vipStatus: 'Regular' })
      .where('vip_status IS NULL')
      .execute();
    await this.clientsRepo.query(
      `UPDATE clients SET vip_status = 'Gold' WHERE vip_status = 'gold'`,
    );
    await this.clientsRepo.query(
      `UPDATE clients SET vip_status = 'Diamond' WHERE vip_status = 'diamond'`,
    );
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
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
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
      {
        key: CONTRACT_EXPIRATION_DAYS_KEY,
        title: 'Contract expiration days',
        description: 'Number of days after which a contract will expire.',
        category: 'Consignment',
        type: 'number',
        value: '60',
      },
      {
        key: VIP_GOLD_THRESHOLD_PHP_KEY,
        title: 'VIP Gold — qualification threshold (PHP)',
        description:
          'Total cumulative purchases plus consignments (PHP, whole pesos) at or above which a client qualifies for VIP Gold.',
        category: 'VIP',
        type: 'number',
        value: '300000',
      },
      {
        key: VIP_DIAMOND_THRESHOLD_PHP_KEY,
        title: 'VIP Diamond — qualification threshold (PHP)',
        description:
          'Total cumulative purchases plus consignments (PHP, whole pesos) at or above which a client qualifies for VIP Diamond.',
        category: 'VIP',
        type: 'number',
        value: '600000',
      },
      {
        key: VIP_GOLD_DISCOUNT_PERCENT_KEY,
        title: 'VIP Gold — discount (% of selling price)',
        description:
          'Percent of selling price for VIP Gold benefits. Effective discount should be min(percent of selling price, cap in PHP).',
        category: 'VIP',
        type: 'number',
        value: '3',
      },
      {
        key: VIP_GOLD_DISCOUNT_CAP_PHP_KEY,
        title: 'VIP Gold — discount cap (PHP)',
        description:
          'Maximum discount amount in pesos for VIP Gold when applying the capped branch (min vs percent-off).',
        category: 'VIP',
        type: 'number',
        value: '3000',
      },
      {
        key: VIP_DIAMOND_DISCOUNT_PERCENT_KEY,
        title: 'VIP Diamond — discount (% of selling price)',
        description:
          'Percent of selling price for VIP Diamond benefits. Effective discount should be min(percent of selling price, cap in PHP).',
        category: 'VIP',
        type: 'number',
        value: '5',
      },
      {
        key: VIP_DIAMOND_DISCOUNT_CAP_PHP_KEY,
        title: 'VIP Diamond — discount cap (PHP)',
        description:
          'Maximum discount amount in pesos for VIP Diamond when applying the capped branch (min vs percent-off).',
        category: 'VIP',
        type: 'number',
        value: '5000',
      },
      {
        key: VIP_TIER_INACTIVITY_MONTHS_KEY,
        title: 'VIP — inactivity before tier downgrade',
        description:
          'If a VIP client has no qualifying purchase or consignment within this many calendar months, their tier drops by one step (e.g. Diamond → Gold → regular client).',
        category: 'VIP',
        type: 'number',
        value: '12',
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
