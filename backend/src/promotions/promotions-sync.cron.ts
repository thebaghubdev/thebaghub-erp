import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_CALENDAR_TIME_ZONE } from '../orders/order-status.constants';
import { PromotionsService } from './promotions.service';

@Injectable()
export class PromotionsSyncCron {
  private readonly logger = new Logger(PromotionsSyncCron.name);

  constructor(private readonly promotionsService: PromotionsService) {}

  @Cron('0 6 * * *', { timeZone: APP_CALENDAR_TIME_ZONE })
  async handleDailyPromotionSync(): Promise<void> {
    const result = await this.promotionsService.syncPromotionInventoryFlags();
    if (result.prunedItemCount > 0 || result.updatedInventoryCount > 0) {
      this.logger.log(
        `Promotion sync: pruned ${result.prunedItemCount} line(s), updated ${result.updatedInventoryCount} inventory item(s)`,
      );
    }
  }
}
