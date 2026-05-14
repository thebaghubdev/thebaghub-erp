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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import type { MulterFile } from '../inquiries/multer-file.type';
import { CreateItemPhotoshootsDto } from './dto/create-item-photoshoots.dto';
import { BatchAssignAuthenticatorDto } from './dto/batch-assign-authenticator.dto';
import { SaveItemAuthenticationMetricsDto } from './dto/save-item-authentication-metrics.dto';
import { ForThirdPartyAuthenticationDto } from './dto/for-third-party-authentication.dto';
import { ReturnToCoordinatorDto } from './dto/return-to-coordinator.dto';
import { UpdateInventoryPricingDto } from './dto/update-inventory-pricing.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(StaffOnlyGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  findAll() {
    return this.inventoryService.findAllForStaff();
  }

  @Get('authenticators')
  listAuthenticators() {
    return this.inventoryService.listAuthenticators();
  }

  @Get('item-photoshoots')
  listItemPhotoshoots() {
    return this.inventoryService.listItemPhotoshootsForStaff();
  }

  @Get('item-photoshoots/:photoshootId')
  findOneItemPhotoshoot(
    @Param('photoshootId', ParseUUIDPipe) photoshootId: string,
  ) {
    return this.inventoryService.findOneItemPhotoshootForStaff(photoshootId);
  }

  @Post('item-photoshoots')
  @HttpCode(HttpStatus.CREATED)
  createItemPhotoshoots(
    @Body() dto: CreateItemPhotoshootsDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.createItemPhotoshoots(dto, req.user.userId);
  }

  @Patch('item-photoshoots/:photoshootId/photos')
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

  @Post('batch-assign-authenticator')
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
  getItemAuthenticationMetrics(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventoryService.getItemAuthenticationMetricsForInventoryItem(
      id,
    );
  }

  @Post(':id/item-authentication-metrics')
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
  findItemPhotoshootForInventory(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.findItemPhotoshootByInventoryItemIdForStaff(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.findOneForStaff(id);
  }

  @Patch(':id/pricing')
  @HttpCode(HttpStatus.OK)
  updatePricing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryPricingDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.inventoryService.updateInventoryPricing(id, dto, req.user.userId);
  }
}
