import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/entities/client.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { InquiriesModule } from '../inquiries/inquiries.module';
import { ClientOrdersController } from './client-orders.controller';
import { OrdersController } from './orders.controller';
import { OrderInstallment } from './entities/order-installment.entity';
import { Order } from './entities/order.entity';
import { OrdersExpiryCron } from './orders-expiry.cron';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    InquiriesModule,
    TypeOrmModule.forFeature([Order, OrderInstallment, Client, InventoryItem]),
  ],
  controllers: [ClientOrdersController, OrdersController],
  providers: [OrdersService, OrdersExpiryCron],
  exports: [OrdersService],
})
export class OrdersModule {}
