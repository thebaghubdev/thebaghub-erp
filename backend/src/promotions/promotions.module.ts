import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { Promotion, PromotionItem } from './entities/promotion.entities';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { PromotionsSyncCron } from './promotions-sync.cron';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Promotion,
      PromotionItem,
      InventoryItem,
      Employee,
    ]),
  ],
  controllers: [PromotionsController],
  providers: [PromotionsService, PromotionsSyncCron],
  exports: [PromotionsService],
})
export class PromotionsModule {}
