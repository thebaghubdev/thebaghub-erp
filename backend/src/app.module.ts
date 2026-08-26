import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { DatabaseModule } from './database/database.module';
import { typeOrmDataSourceOptions } from './database/typeorm.options';
import { InquiriesModule } from './inquiries/inquiries.module';
import { SettingsModule } from './settings/settings.module';
import { AccountsModule } from './accounts/accounts.module';
import { ClientsModule } from './clients/clients.module';
import { ConsignmentSchedulesModule } from './consignment-schedules/consignment-schedules.module';
import { ConsignorPaymentsModule } from './consignor-payments/consignor-payments.module';
import { DirectPurchasePaymentsModule } from './direct-purchase-payments/direct-purchase-payments.module';
import { InventoryModule } from './inventory/inventory.module';
import { AuthenticationMetricsModule } from './authentication-metrics/authentication-metrics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ShopifyModule } from './shopify/shopify.module';
import { TablePreferencesModule } from './table-preferences/table-preferences.module';
import { OrdersModule } from './orders/orders.module';
import { MediaModule } from './media/media.module';
import { LogisticsModule } from './logistics/logistics.module';
import { PromotionsModule } from './promotions/promotions.module';
import { VouchersModule } from './vouchers/vouchers.module';
import { WalkInAuthenticationModule } from './walk-in-authentication/walk-in-authentication.module';
import { AccessControlModule } from './access-control/access-control.module';
import { TasksModule } from './tasks/tasks.module';
import { MessagingModule } from './messaging/messaging.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => typeOrmDataSourceOptions(),
    }),
    DatabaseModule,
    AuthModule,
    AccessControlModule,
    ClientsModule,
    InquiriesModule,
    SettingsModule,
    AccountsModule,
    ConsignmentSchedulesModule,
    ConsignorPaymentsModule,
    DirectPurchasePaymentsModule,
    InventoryModule,
    AuthenticationMetricsModule,
    NotificationsModule,
    ShopifyModule,
    TablePreferencesModule,
    OrdersModule,
    MediaModule,
    LogisticsModule,
    PromotionsModule,
    VouchersModule,
    WalkInAuthenticationModule,
    TasksModule,
    MessagingModule,
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
