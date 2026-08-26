import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { SettingsModule } from '../settings/settings.module';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { ItemAuthentication } from '../inventory/entities/item-authentication.entity';
import { ItemPosting } from '../inventory/entities/item-posting.entity';
import { Waitlist } from '../orders/entities/waitlist.entity';
import { ClientActivityTotalsService } from './client-activity-totals.service';
import { ClientCatalogController } from './client-catalog.controller';
import { ClientCatalogService } from './client-catalog.service';
import { ClientProfileController } from './client-profile.controller';
import { ClientProfileService } from './client-profile.service';
import { Client } from './entities/client.entity';
import { VipPricingService } from './vip-pricing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, InventoryItem, ItemAuthentication, ItemPosting, Waitlist]),
    AuthModule,
    MediaModule,
    SettingsModule,
  ],
  controllers: [ClientProfileController, ClientCatalogController],
  providers: [
    ClientProfileService,
    ClientCatalogService,
    ClientActivityTotalsService,
    VipPricingService,
  ],
  exports: [ClientProfileService, ClientActivityTotalsService, VipPricingService],
})
export class ClientsModule {}
