import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { Employee } from '../employees/entities/employee.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { LogisticsController } from './logistics.controller';
import { Logistics, LogisticsItem } from './entities/logistics.entities';
import { LogisticsService } from './logistics.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([
      Logistics,
      LogisticsItem,
      InventoryItem,
      Employee,
    ]),
  ],
  controllers: [LogisticsController],
  providers: [LogisticsService],
  exports: [LogisticsService],
})
export class LogisticsModule {}
