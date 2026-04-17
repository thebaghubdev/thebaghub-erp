import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { InventoryModule } from '../inventory/inventory.module';
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
    InventoryModule,
    TypeOrmModule.forFeature([
      ConsignmentSchedule,
      ConsignmentScheduleItem,
      Employee,
      Inquiry,
    ]),
  ],
  controllers: [ConsignmentSchedulesController],
  providers: [ConsignmentSchedulesService],
  exports: [ConsignmentSchedulesService, TypeOrmModule],
})
export class ConsignmentSchedulesModule {}
