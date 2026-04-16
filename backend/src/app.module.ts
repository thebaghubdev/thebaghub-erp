import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AuthenticationMetric } from './authentication-metrics/entities/authentication-metric.entity';
import { Client } from './clients/entities/client.entity';
import { DatabaseModule } from './database/database.module';
import { Employee } from './employees/entities/employee.entity';
import { InquiryAuditEntry } from './inquiries/entities/inquiry-audit-entry.entity';
import { Inquiry } from './inquiries/entities/inquiry.entity';
import { InquiriesModule } from './inquiries/inquiries.module';
import { User } from './users/entities/user.entity';
import { SettingsModule } from './settings/settings.module';
import { Setting } from './settings/entities/setting.entity';
import { AccountsModule } from './accounts/accounts.module';
import { ClientsModule } from './clients/clients.module';
import { ConsignmentSchedulesModule } from './consignment-schedules/consignment-schedules.module';
import {
  ConsignmentSchedule,
  ConsignmentScheduleItem,
} from './consignment-schedules/entities/consignment-schedule.entities';
import { InventoryModule } from './inventory/inventory.module';
import { InventoryItem } from './inventory/entities/inventory-item.entity';
import { AuthenticationMetricsModule } from './authentication-metrics/authentication-metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'baghub'),
        password: config.get<string>('DB_PASSWORD', 'baghub'),
        database: config.get<string>('DB_DATABASE', 'baghub'),
        entities: [
          Inquiry,
          InquiryAuditEntry,
          User,
          Employee,
          Client,
          Setting,
          AuthenticationMetric,
          ConsignmentSchedule,
          ConsignmentScheduleItem,
          InventoryItem,
        ],
        synchronize:
          config.get<string>('NODE_ENV', 'development') !== 'production',
      }),
    }),
    DatabaseModule,
    AuthModule,
    ClientsModule,
    InquiriesModule,
    SettingsModule,
    AccountsModule,
    ConsignmentSchedulesModule,
    InventoryModule,
    AuthenticationMetricsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
