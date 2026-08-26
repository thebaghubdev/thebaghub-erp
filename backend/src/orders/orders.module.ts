import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { ClientsModule } from '../clients/clients.module';
import { Client } from '../clients/entities/client.entity';
import { Employee } from '../employees/entities/employee.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { ItemAuthentication } from '../inventory/entities/item-authentication.entity';
import { ConsignorPaymentsModule } from '../consignor-payments/consignor-payments.module';
import { InquiriesModule } from '../inquiries/inquiries.module';
import { MailModule } from '../mail/mail.module';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { ClientOrdersController } from './client-orders.controller';
import { OrdersController } from './orders.controller';
import { OrderAuditEntry } from './entities/order-audit-entry.entity';
import { OrderInstallment } from './entities/order-installment.entity';
import { OrderPayment } from './entities/order-payment.entity';
import { Order } from './entities/order.entity';
import { Waitlist } from './entities/waitlist.entity';
import { Voucher } from '../vouchers/entities/voucher.entity';
import { InstallmentPenaltyCron } from './installment-penalty.cron';
import { OrderAuditService } from './order-audit.service';
import { OrdersExpiryCron } from './orders-expiry.cron';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    AccessControlModule,
    ClientsModule,
    ConsignorPaymentsModule,
    InquiriesModule,
    InventoryModule,
    MailModule,
    MediaModule,
    NotificationsModule,
    TasksModule,
    TypeOrmModule.forFeature([
      Order,
      OrderAuditEntry,
      OrderInstallment,
      OrderPayment,
      Waitlist,
      Client,
      Employee,
      InventoryItem,
      ItemAuthentication,
      Voucher,
    ]),
  ],
  controllers: [ClientOrdersController, OrdersController],
  providers: [OrdersService, OrderAuditService, OrdersExpiryCron, InstallmentPenaltyCron],
  exports: [OrdersService],
})
export class OrdersModule {}
