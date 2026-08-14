import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { FeatureAccessGuard } from '../access-control/feature-access.guard';
import { RequireFeature } from '../access-control/require-feature.decorator';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import type { MulterFile } from '../inquiries/multer-file.type';
import { CreateItemPhotoshootsDto } from './dto/create-item-photoshoots.dto';
import { CreateStockInventoryItemDto } from './dto/create-stock-inventory-item.dto';
import { BatchAssignAuthenticatorDto } from './dto/batch-assign-authenticator.dto';
import { SaveItemAuthenticationMetricsDto } from './dto/save-item-authentication-metrics.dto';
import { ForThirdPartyAuthenticationDto } from './dto/for-third-party-authentication.dto';
import { ReturnToCoordinatorDto } from './dto/return-to-coordinator.dto';
import { UpdateInventoryPricingDto } from './dto/update-inventory-pricing.dto';
import { CreateItemPostingDto } from './dto/create-item-posting.dto';
import { ScheduleItemPostingsDto } from './dto/schedule-item-postings.dto';
import { LinkShopifyProductDto } from './dto/link-shopify-product.dto';
import { AddInventoryWaitlistClientDto } from './dto/add-inventory-waitlist-client.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(StaffOnlyGuard, FeatureAccessGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  findAll() {
    return this.inventoryService.findAllForStaff();
  }

  @Post('stock')
  @HttpCode(HttpStatus.CREATED)
  createStockItem(
    @Body() dto: CreateStockInventoryItemDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.createStockInventoryItem(
      dto,
      req.user.userId,
    );
  }

  @Get('authenticators')
  @RequireFeature('authentication', 'view')
  listAuthenticators() {
    return this.inventoryService.listAuthenticators();
  }

  @Get('item-photoshoots')
  @RequireFeature('photoshoot', 'view')
  listItemPhotoshoots() {
    return this.inventoryService.listItemPhotoshootsForStaff();
  }

  @Get('item-photoshoots/:photoshootId')
  @RequireFeature('photoshoot', 'view')
  findOneItemPhotoshoot(
    @Param('photoshootId', ParseUUIDPipe) photoshootId: string,
  ) {
    return this.inventoryService.findOneItemPhotoshootForStaff(photoshootId);
  }

  @Post('item-photoshoots')
  @RequireFeature('photoshoot', 'edit')
  @HttpCode(HttpStatus.CREATED)
  createItemPhotoshoots(
    @Body() dto: CreateItemPhotoshootsDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.createItemPhotoshoots(dto, req.user.userId);
  }

  @Patch('item-photoshoots/:photoshootId/photos')
  @RequireFeature('photoshoot', 'edit')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FilesInterceptor('photos', 50, {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  saveItemPhotoshootPhotos(
    @Param('photoshootId', ParseUUIDPipe) photoshootId: string,
    @UploadedFiles() files: MulterFile[] | undefined,
    @Body('retainKeys') retainKeys: string | undefined,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.saveItemPhotoshootPhotos(
      photoshootId,
      files ?? [],
      retainKeys,
      req.user.userId,
    );
  }

  @Post('item-photoshoots/:photoshootId/finish')
  @RequireFeature('photoshoot', 'edit')
  @HttpCode(HttpStatus.OK)
  finishItemPhotoshoot(
    @Param('photoshootId', ParseUUIDPipe) photoshootId: string,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.finishItemPhotoshoot(
      photoshootId,
      req.user.userId,
    );
  }

  @Get('item-postings')
  @RequireFeature('posting', 'view')
  listItemPostings() {
    return this.inventoryService.listItemPostingsForStaff();
  }

  @Patch('item-postings/schedule')
  @RequireFeature('posting', 'edit')
  @HttpCode(HttpStatus.OK)
  scheduleItemPostings(
    @Body() dto: ScheduleItemPostingsDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.scheduleItemPostings(dto, req.user.userId);
  }

  @Post('batch-assign-authenticator')
  @RequireFeature('authentication', 'edit')
  @HttpCode(HttpStatus.OK)
  batchAssignAuthenticator(
    @Body() dto: BatchAssignAuthenticatorDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.batchAssignAuthenticator(
      dto,
      req.user.userId,
    );
  }

  @Get(':id/item-authentication-metrics')
  @RequireFeature('authentication', 'view')
  getItemAuthenticationMetrics(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventoryService.getItemAuthenticationMetricsForInventoryItem(
      id,
    );
  }

  @Get(':id/waitlists')
  listWaitlists(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.listWaitlistsForInventoryItem(id);
  }

  @Post(':id/waitlists')
  @HttpCode(HttpStatus.OK)
  addWaitlistClient(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddInventoryWaitlistClientDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.addClientToWaitlistForInventoryItem(
      id,
      dto.clientId,
      req.user.userId,
    );
  }

  @Post(':id/item-authentication-metrics')
  @RequireFeature('authentication', 'edit')
  @HttpCode(HttpStatus.OK)
  saveItemAuthenticationMetrics(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveItemAuthenticationMetricsDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.saveItemAuthenticationMetrics(id, dto, {
      userId: req.user.userId,
      isAdmin: req.user.isAdmin,
    });
  }

  @Post(':id/approve-authentication')
  @RequireFeature('authentication', 'edit')
  @HttpCode(HttpStatus.OK)
  approveAuthentication(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.approveAuthenticationForInventoryItem(id, {
      userId: req.user.userId,
      isAdmin: req.user.isAdmin,
    });
  }

  @Post(':id/return-to-coordinator')
  @RequireFeature('authentication', 'edit')
  @HttpCode(HttpStatus.OK)
  returnToCoordinator(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnToCoordinatorDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.returnToCoordinatorForInventoryItem(id, dto, {
      userId: req.user.userId,
      isAdmin: req.user.isAdmin,
    });
  }

  @Post(':id/for-3rd-party-authentication')
  @RequireFeature('authentication', 'edit')
  @HttpCode(HttpStatus.OK)
  forThirdPartyAuthentication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ForThirdPartyAuthenticationDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.markForThirdPartyAuthenticationForInventoryItem(
      id,
      dto,
      {
        userId: req.user.userId,
        isAdmin: req.user.isAdmin,
      },
    );
  }

  @Post(':id/reject-authentication')
  @RequireFeature('authentication', 'edit')
  @HttpCode(HttpStatus.OK)
  rejectAuthentication(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.rejectAuthenticationForInventoryItem(id, {
      userId: req.user.userId,
      isAdmin: req.user.isAdmin,
    });
  }

  @Get(':id/item-photoshoot')
  @RequireFeature('photoshoot', 'view', { orFeatureKeys: ['editing'] })
  async findItemPhotoshootForInventory(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    // Nest omits the body when handlers return `null`; clients then fail on
    // Response.json(). Always send explicit JSON (row or null).
    const row =
      await this.inventoryService.findItemPhotoshootByInventoryItemIdForStaff(
        id,
      );
    res.status(HttpStatus.OK).json(row);
  }

  @Post(':id/item-posting')
  @RequireFeature('editing', 'edit')
  @HttpCode(HttpStatus.CREATED)
  createItemPosting(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateItemPostingDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.createItemPosting(id, dto, req.user.userId);
  }

  @Patch(':id/item-posting')
  @RequireFeature('editing', 'edit')
  @HttpCode(HttpStatus.OK)
  saveItemPosting(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateItemPostingDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.createItemPosting(id, dto, req.user.userId, {
      updateStatus: false,
    });
  }

  @Post(':id/post-to-shopify')
  @RequireFeature('posting', 'edit')
  @HttpCode(HttpStatus.OK)
  postItemToShopify(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.postItemToShopify(id);
  }

  @Post(':id/update-shopify')
  @RequireFeature('posting', 'edit')
  @HttpCode(HttpStatus.OK)
  updateItemOnShopify(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.updateItemOnShopify(id);
  }

  @Post(':id/link-shopify-product')
  @RequireFeature('posting', 'edit')
  @HttpCode(HttpStatus.OK)
  linkShopifyProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkShopifyProductDto,
  ) {
    return this.inventoryService.linkShopifyProduct(id, dto.shopifyProductId);
  }

  @Post(':id/mark-sold-final')
  @HttpCode(HttpStatus.OK)
  markSoldFinal(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.markSoldUnderWarrantyAsFinal(
      id,
      req.user.userId,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.findOneForStaff(id);
  }

  @Patch(':id/pricing')
  @RequireFeature('pricing', 'edit')
  @HttpCode(HttpStatus.OK)
  updatePricing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryPricingDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.updateInventoryPricing(id, dto, req.user.userId);
  }
}
