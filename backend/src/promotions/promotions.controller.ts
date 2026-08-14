import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FeatureAccessGuard } from '../access-control/feature-access.guard';
import { RequireFeature } from '../access-control/require-feature.decorator';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import {
  CreatePromotionDto,
  UpdatePromotionDto,
} from './dto/create-promotion.dto';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
@UseGuards(StaffOnlyGuard, FeatureAccessGuard)
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  @RequireFeature('promotions', 'view')
  findAll() {
    return this.promotionsService.findAllForStaff();
  }

  @Get('available-inventory')
  @RequireFeature('promotions', 'view')
  findAvailableInventory(
    @Query('excludePromotionId') excludePromotionId?: string,
  ) {
    return this.promotionsService.findAvailableInventoryForWizard(
      excludePromotionId?.trim() || undefined,
    );
  }

  @Get('reserved-inventory-ids')
  @RequireFeature('promotions', 'view')
  findReservedInventoryIds(
    @Query('excludePromotionId') excludePromotionId?: string,
  ) {
    return this.promotionsService.findReservedInventoryItemIds(
      excludePromotionId?.trim() || undefined,
    );
  }

  @Get(':id')
  @RequireFeature('promotions', 'view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.promotionsService.findOneForStaff(id);
  }

  @Post()
  @RequireFeature('promotions', 'edit')
  create(@Req() req: { user: JwtUser }, @Body() body: CreatePromotionDto) {
    return this.promotionsService.createForStaff(req.user.userId, body);
  }

  @Patch(':id')
  @RequireFeature('promotions', 'edit')
  update(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePromotionDto,
  ) {
    return this.promotionsService.updateForStaff(id, req.user.userId, body);
  }

  @Post(':id/cancel')
  @RequireFeature('promotions', 'edit')
  cancel(@Req() req: { user: JwtUser }, @Param('id', ParseUUIDPipe) id: string) {
    return this.promotionsService.cancelForStaff(id, req.user.userId);
  }
}
