import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { ItemPosting } from '../inventory/entities/item-posting.entity';
import { ClientCatalogController } from './client-catalog.controller';
import { ClientCatalogService } from './client-catalog.service';
import { ClientProfileController } from './client-profile.controller';
import { ClientProfileService } from './client-profile.service';
import { Client } from './entities/client.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Client, InventoryItem, ItemPosting]), AuthModule],
  controllers: [ClientProfileController, ClientCatalogController],
  providers: [ClientProfileService, ClientCatalogService],
})
export class ClientsModule {}
