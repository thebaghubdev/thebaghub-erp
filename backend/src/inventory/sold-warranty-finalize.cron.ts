import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_CALENDAR_TIME_ZONE } from '../orders/order-status.constants';
import { InventoryService } from './inventory.service';

@Injectable()
export class SoldWarrantyFinalizeCron {
  private readonly logger = new Logger(SoldWarrantyFinalizeCron.name);

  constructor(private readonly inventoryService: InventoryService) {}

  @Cron('0 0 * * *', { timeZone: APP_CALENDAR_TIME_ZONE })
  async handleSoldUnderWarrantyFinalization(): Promise<void> {
    const finalizedCount =
      await this.inventoryService.finalizeSoldUnderWarrantyItems();
    if (finalizedCount > 0) {
      this.logger.log(
        `Finalized ${finalizedCount} inventory item(s) from Sold under warranty to Sold final`,
      );
    }
  }
}
