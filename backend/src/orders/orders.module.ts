import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { Client } from '../clients/entities/client.entity';
import { Employee } from '../employees/entities/employee.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { ItemAuthentication } from '../inventory/entities/item-authentication.entity';
import { ConsignorPaymentsModule } from '../consignor-payments/consignor-payments.module';
import { InquiriesModule } from '../inquiries/inquiries.module';
import { MailModule } from '../mail/mail.module';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClientOrdersController } from './client-orders.controller';
import { OrdersController } from './orders.controller';
import { OrderInstallment } from './entities/order-installment.entity';
import { OrderPayment } from './entities/order-payment.entity';
import { Order } from './entities/order.entity';
import { Waitlist } from './entities/waitlist.entity';
import { Voucher } from '../vouchers/entities/voucher.entity';
import { InstallmentPenaltyCron } from './installment-penalty.cron';
import { OrdersExpiryCron } from './orders-expiry.cron';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    AccessControlModule,
    ConsignorPaymentsModule,
    InquiriesModule,
    MailModule,
    MediaModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      Order,
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
  providers: [OrdersService, OrdersExpiryCron, InstallmentPenaltyCron],
  exports: [OrdersService],
})
export class OrdersModule {}
