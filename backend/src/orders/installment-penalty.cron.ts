import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

@Injectable()
export class InstallmentPenaltyCron {
  private readonly logger = new Logger(InstallmentPenaltyCron.name);

  constructor(private readonly ordersService: OrdersService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async recalculatePenalties(): Promise<void> {
    const updatedCount =
      await this.ordersService.recalculateInstallmentPenalties();
    if (updatedCount > 0) {
      this.logger.log(
        `Recalculated penalties for ${updatedCount} installment(s)`,
      );
    }
  }
}
