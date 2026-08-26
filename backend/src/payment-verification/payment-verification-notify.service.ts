import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureAccessService } from '../access-control/feature-access.service';
import { portalPageUrl } from '../common/frontend-url.util';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from '../tasks/tasks.service';

export type PaymentVerificationNotifyInput = {
  title: string;
  message: string;
  portalPath: string;
  orderId?: string | null;
  inquiryId?: string | null;
  walkInAuthenticationId?: string | null;
};

@Injectable()
export class PaymentVerificationNotifyService {
  private readonly logger = new Logger(PaymentVerificationNotifyService.name);

  constructor(
    private readonly featureAccess: FeatureAccessService,
    private readonly notifications: NotificationsService,
    private readonly tasks: TasksService,
    private readonly config: ConfigService,
  ) {}

  async notifyVerifiers(input: PaymentVerificationNotifyInput): Promise<void> {
    const verifierIds = await this.featureAccess.findEmployeeIdsWithEditAccess(
      'payment-verification',
    );
    if (verifierIds.length === 0) {
      return;
    }

    const description = portalPageUrl(this.config, input.portalPath);

    for (const assigneeId of verifierIds) {
      void this.notifications
        .notify({
          message: input.message,
          receiverId: assigneeId,
          orderId: input.orderId ?? null,
          inquiryId: input.inquiryId ?? null,
          walkInAuthenticationId: input.walkInAuthenticationId ?? null,
        })
        .catch((err: unknown) =>
          this.logger.error(
            'Failed to notify payment verifier',
            err instanceof Error ? err.stack : err,
          ),
        );
      void this.tasks
        .createAssigned({
          assigneeId,
          title: input.title,
          description,
          severity: 'moderate',
          dueDate: null,
        })
        .catch((err: unknown) =>
          this.logger.error(
            'Failed to create payment verification task',
            err instanceof Error ? err.stack : err,
          ),
        );
    }
  }
}
