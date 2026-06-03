import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

@Injectable()
export class OrdersExpiryCron {
  private readonly logger = new Logger(OrdersExpiryCron.name);

  constructor(private readonly ordersService: OrdersService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredOrders(): Promise<void> {
    const expiredCount =
      await this.ordersService.expireOrdersPastHoldingPeriod();
    if (expiredCount > 0) {
      this.logger.log(`Expired ${expiredCount} order(s) past holding period`);
    }
  }
}
