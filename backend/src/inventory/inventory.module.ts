import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthenticationMetric } from '../authentication-metrics/entities/authentication-metric.entity';
import { Employee } from '../employees/entities/employee.entity';
import { InquiriesModule } from '../inquiries/inquiries.module';
import { InventoryItem } from './entities/inventory-item.entity';
import { ItemAuthentication } from './entities/item-authentication.entity';
import { ItemAuthenticationMetric } from './entities/item-authentication-metric.entity';
import { ItemPhotoshoot } from './entities/item-photoshoot.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [
    forwardRef(() => InquiriesModule),
    TypeOrmModule.forFeature([
      InventoryItem,
      ItemAuthentication,
      ItemAuthenticationMetric,
      ItemPhotoshoot,
      AuthenticationMetric,
      Employee,
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService, TypeOrmModule],
})
export class InventoryModule {}
