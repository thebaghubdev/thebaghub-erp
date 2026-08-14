import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuthenticationMetric } from '../authentication-metrics/entities/authentication-metric.entity';
import { Client } from '../clients/entities/client.entity';
import { Employee } from '../employees/entities/employee.entity';
import { InquiriesModule } from '../inquiries/inquiries.module';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Waitlist } from '../orders/entities/waitlist.entity';
import { ShopifyModule } from '../shopify/shopify.module';
import { InventoryItem } from './entities/inventory-item.entity';
import { ItemAuthentication } from './entities/item-authentication.entity';
import { ItemAuthenticationMetric } from './entities/item-authentication-metric.entity';
import { ItemPosting } from './entities/item-posting.entity';
import { ItemPhotoshoot } from './entities/item-photoshoot.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { SoldWarrantyFinalizeCron } from './sold-warranty-finalize.cron';

@Module({
  imports: [
    AccessControlModule,
    forwardRef(() => InquiriesModule),
    MediaModule,
    NotificationsModule,
    ShopifyModule,
    TypeOrmModule.forFeature([
      Client,
      InventoryItem,
      ItemAuthentication,
      ItemAuthenticationMetric,
      ItemPosting,
      ItemPhotoshoot,
      AuthenticationMetric,
      Employee,
      Waitlist,
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService, SoldWarrantyFinalizeCron],
  exports: [InventoryService, TypeOrmModule],
})
export class InventoryModule {}
