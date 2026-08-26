import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { ConsignorPaymentsModule } from './consignor-payments/consignor-payments.module';
import {
  ConsignorPayment,
  ConsignorPaymentGroup,
  ConsignorPaymentItem,
} from './consignor-payments/entities/consignor-payment.entities';
import { DirectPurchasePaymentsModule } from './direct-purchase-payments/direct-purchase-payments.module';
import {
  DirectPurchasePayment,
  DirectPurchasePaymentItem,
} from './direct-purchase-payments/entities/direct-purchase-payment.entities';
import { InventoryModule } from './inventory/inventory.module';
import { InventoryItem } from './inventory/entities/inventory-item.entity';
import { InventoryItemAuditEntry } from './inventory/entities/inventory-item-audit-entry.entity';
import { ItemAuthentication } from './inventory/entities/item-authentication.entity';
import { ItemAuthenticationMetric } from './inventory/entities/item-authentication-metric.entity';
import { ItemPosting } from './inventory/entities/item-posting.entity';
import { ItemPhotoshoot } from './inventory/entities/item-photoshoot.entity';
import { AuthenticationMetricsModule } from './authentication-metrics/authentication-metrics.module';
import { Notification } from './notifications/entities/notification.entity';
import { NotificationsModule } from './notifications/notifications.module';
import { ShopifyModule } from './shopify/shopify.module';
import { ShopifyShopSession } from './shopify/entities/shopify-shop-session.entity';
import { TablePreferencesModule } from './table-preferences/table-preferences.module';
import { TablePreference } from './table-preferences/entities/table-preference.entity';
import { Order } from './orders/entities/order.entity';
import { OrderAuditEntry } from './orders/entities/order-audit-entry.entity';
import { OrderInstallment } from './orders/entities/order-installment.entity';
import { OrderPayment } from './orders/entities/order-payment.entity';
import { Waitlist } from './orders/entities/waitlist.entity';
import { OrdersModule } from './orders/orders.module';
import { Media } from './media/entities/media.entity';
import { MediaModule } from './media/media.module';
import { LogisticsModule } from './logistics/logistics.module';
import {
  Logistics,
  LogisticsItem,
} from './logistics/entities/logistics.entities';
import { PromotionsModule } from './promotions/promotions.module';
import {
  Promotion,
  PromotionItem,
} from './promotions/entities/promotion.entities';
import { VouchersModule } from './vouchers/vouchers.module';
import { Voucher } from './vouchers/entities/voucher.entity';
import { WalkInAuthenticationModule } from './walk-in-authentication/walk-in-authentication.module';
import { WalkInAuthentication } from './walk-in-authentication/entities/walk-in-authentication.entity';
import { WalkInAuthenticationMetric } from './walk-in-authentication/entities/walk-in-authentication-metric.entity';
import { AccessControlModule } from './access-control/access-control.module';
import { FeatureAccess } from './access-control/entities/feature-access.entity';
import { TasksModule } from './tasks/tasks.module';
import { Task } from './tasks/entities/task.entity';
import { MessagingModule } from './messaging/messaging.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
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
          ConsignorPayment,
          ConsignorPaymentGroup,
          ConsignorPaymentItem,
          DirectPurchasePayment,
          DirectPurchasePaymentItem,
          InventoryItem,
          InventoryItemAuditEntry,
          ItemAuthentication,
          ItemAuthenticationMetric,
          ItemPosting,
          ItemPhotoshoot,
          Notification,
          ShopifyShopSession,
          TablePreference,
          Order,
          OrderAuditEntry,
          OrderInstallment,
          OrderPayment,
          Waitlist,
          Media,
          Logistics,
          LogisticsItem,
          Promotion,
          PromotionItem,
          Voucher,
          WalkInAuthentication,
          WalkInAuthenticationMetric,
          FeatureAccess,
          Task,
        ],
        synchronize:
          config.get<string>('NODE_ENV', 'development') !== 'production',
      }),
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
