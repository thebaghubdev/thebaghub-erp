import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { ItemAuthentication } from '../inventory/entities/item-authentication.entity';
import { InquiriesModule } from '../inquiries/inquiries.module';
import { Inquiry } from '../inquiries/entities/inquiry.entity';
import { ConsignmentSchedulesController } from './consignment-schedules.controller';
import { ConsignmentSchedulesService } from './consignment-schedules.service';
import {
  ConsignmentSchedule,
  ConsignmentScheduleItem,
} from './entities/consignment-schedule.entities';

@Module({
  imports: [
    InquiriesModule,
    TypeOrmModule.forFeature([
      ConsignmentSchedule,
      ConsignmentScheduleItem,
      Employee,
      Inquiry,
      InventoryItem,
      ItemAuthentication,
    ]),
  ],
  controllers: [ConsignmentSchedulesController],
  providers: [ConsignmentSchedulesService],
  exports: [ConsignmentSchedulesService, TypeOrmModule],
})
export class ConsignmentSchedulesModule {}
