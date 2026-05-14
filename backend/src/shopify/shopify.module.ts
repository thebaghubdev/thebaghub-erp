import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShopifyShopSession } from './entities/shopify-shop-session.entity';
import { ShopifyAdminService } from './shopify-admin.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyController } from './shopify.controller';
import { ShopifyOAuthService } from './shopify-oauth.service';

@Module({
  imports: [TypeOrmModule.forFeature([ShopifyShopSession])],
  controllers: [ShopifyController],
  providers: [
    ShopifyConnectionService,
    ShopifyOAuthService,
    ShopifyAdminService,
  ],
})
export class ShopifyModule {}
