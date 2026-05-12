import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsignmentScheduleItem } from '../consignment-schedules/entities/consignment-schedule.entities';
import { Client } from '../clients/entities/client.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { ItemAuthentication } from '../inventory/entities/item-authentication.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { Employee } from '../employees/entities/employee.entity';
import { Setting } from '../settings/entities/setting.entity';
import { ClientConsignmentInquiryController } from './client-consignment-inquiry.controller';
import { InquiryAuditEntry } from './entities/inquiry-audit-entry.entity';
import { Inquiry } from './entities/inquiry.entity';
import { InquiriesController } from './inquiries.controller';
import { InquiriesService } from './inquiries.service';
import { InquiryAuditService } from './inquiry-audit.service';
import { S3StorageService } from './s3-storage.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    forwardRef(() => InventoryModule),
    NotificationsModule,
    MailModule,
    TypeOrmModule.forFeature([
      Inquiry,
      InquiryAuditEntry,
      Client,
      ConsignmentScheduleItem,
      Employee,
      Setting,
      InventoryItem,
      ItemAuthentication,
    ]),
  ],
  controllers: [InquiriesController, ClientConsignmentInquiryController],
  providers: [InquiriesService, S3StorageService, InquiryAuditService],
  exports: [InquiryAuditService, InquiriesService, S3StorageService],
})
export class InquiriesModule {}
