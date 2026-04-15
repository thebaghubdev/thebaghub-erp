import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsignmentScheduleItem } from '../consignment-schedules/entities/consignment-schedule.entities';
import { Client } from '../clients/entities/client.entity';
import { ClientConsignmentInquiryController } from './client-consignment-inquiry.controller';
import { Inquiry } from './entities/inquiry.entity';
import { InquiriesController } from './inquiries.controller';
import { InquiriesService } from './inquiries.service';
import { S3StorageService } from './s3-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inquiry, Client, ConsignmentScheduleItem]),
  ],
  controllers: [InquiriesController, ClientConsignmentInquiryController],
  providers: [InquiriesService, S3StorageService],
})
export class InquiriesModule {}
