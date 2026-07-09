import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/entities/client.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { Inquiry } from '../inquiries/entities/inquiry.entity';
import { Order } from '../orders/entities/order.entity';
import { MediaModule } from '../media/media.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConsignorPaymentsController } from './consignor-payments.controller';
import { ConsignorPaymentsService } from './consignor-payments.service';
import {
  ConsignorPayment,
  ConsignorPaymentGroup,
  ConsignorPaymentItem,
} from './entities/consignor-payment.entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConsignorPayment,
      ConsignorPaymentGroup,
      ConsignorPaymentItem,
      Client,
      Inquiry,
      InventoryItem,
      Order,
    ]),
    MediaModule,
    MailModule,
    NotificationsModule,
  ],
  controllers: [ConsignorPaymentsController],
  providers: [ConsignorPaymentsService],
  exports: [ConsignorPaymentsService, TypeOrmModule],
})
export class ConsignorPaymentsModule {}
