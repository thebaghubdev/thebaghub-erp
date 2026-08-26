import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { PaymentVerificationNotifyService } from './payment-verification-notify.service';

@Module({
  imports: [AccessControlModule, NotificationsModule, TasksModule],
  providers: [PaymentVerificationNotifyService],
  exports: [PaymentVerificationNotifyService],
})
export class PaymentVerificationModule {}
