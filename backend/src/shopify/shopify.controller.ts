import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { FeatureAccessGuard } from '../access-control/feature-access.guard';
import { RequireFeature } from '../access-control/require-feature.decorator';
import { Public } from '../decorators/public.decorator';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { ShopifyAdminService } from './shopify-admin.service';
import { ShopifyOAuthService } from './shopify-oauth.service';

@Controller('shopify')
export class ShopifyController {
  constructor(
    private readonly shopifyAdmin: ShopifyAdminService,
    private readonly shopifyOAuth: ShopifyOAuthService,
  ) {}

  @Public()
  @Get('oauth/callback')
  async oauthCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.shopifyOAuth.finishOAuthRedirect(req);
    res.redirect(302, url);
  }

  @Get('oauth/install')
  @UseGuards(StaffOnlyGuard)
  oauthInstall() {
    return { authorizeUrl: this.shopifyOAuth.buildAuthorizeUrl() };
  }

  @Get('oauth/status')
  @UseGuards(StaffOnlyGuard)
  async oauthStatus() {
    return this.shopifyAdmin.getOAuthConnectionDetail();
  }

  @Get('collections')
  @UseGuards(StaffOnlyGuard, FeatureAccessGuard)
  @RequireFeature('posting', 'view', { orFeatureKeys: ['editing'] })
  listCollections() {
    return this.shopifyAdmin.listCollections();
  }
}
