import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/entities/client.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { ItemAuthentication } from '../inventory/entities/item-authentication.entity';
import { ConsignorPaymentsModule } from '../consignor-payments/consignor-payments.module';
import { InquiriesModule } from '../inquiries/inquiries.module';
import { MailModule } from '../mail/mail.module';
import { MediaModule } from '../media/media.module';
import { ClientOrdersController } from './client-orders.controller';
import { OrdersController } from './orders.controller';
import { OrderInstallment } from './entities/order-installment.entity';
import { Order } from './entities/order.entity';
import { Waitlist } from './entities/waitlist.entity';
import { InstallmentPenaltyCron } from './installment-penalty.cron';
import { OrdersExpiryCron } from './orders-expiry.cron';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    ConsignorPaymentsModule,
    InquiriesModule,
    MailModule,
    MediaModule,
    TypeOrmModule.forFeature([
      Order,
      OrderInstallment,
      Waitlist,
      Client,
      InventoryItem,
      ItemAuthentication,
    ]),
  ],
  controllers: [ClientOrdersController, OrdersController],
  providers: [OrdersService, OrdersExpiryCron, InstallmentPenaltyCron],
  exports: [OrdersService],
})
export class OrdersModule {}
