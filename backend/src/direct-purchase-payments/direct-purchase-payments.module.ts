import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { Client } from '../clients/entities/client.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { Inquiry } from '../inquiries/entities/inquiry.entity';
import { Order } from '../orders/entities/order.entity';
import { MediaModule } from '../media/media.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DirectPurchasePaymentsController } from './direct-purchase-payments.controller';
import { DirectPurchasePaymentsService } from './direct-purchase-payments.service';
import {
  DirectPurchasePayment,
  DirectPurchasePaymentItem,
} from './entities/direct-purchase-payment.entities';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([
      DirectPurchasePayment,
      DirectPurchasePaymentItem,
      Client,
      Inquiry,
      InventoryItem,
      Order,
    ]),
    MediaModule,
    MailModule,
    NotificationsModule,
  ],
  controllers: [DirectPurchasePaymentsController],
  providers: [DirectPurchasePaymentsService],
  exports: [DirectPurchasePaymentsService, TypeOrmModule],
})
export class DirectPurchasePaymentsModule {}
