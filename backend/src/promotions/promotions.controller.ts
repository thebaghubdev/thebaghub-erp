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
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import {
  CreatePromotionDto,
  UpdatePromotionDto,
} from './dto/create-promotion.dto';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
@UseGuards(StaffOnlyGuard)
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  findAll() {
    return this.promotionsService.findAllForStaff();
  }

  @Get('available-inventory')
  findAvailableInventory(
    @Query('excludePromotionId') excludePromotionId?: string,
  ) {
    return this.promotionsService.findAvailableInventoryForWizard(
      excludePromotionId?.trim() || undefined,
    );
  }

  @Get('reserved-inventory-ids')
  findReservedInventoryIds(
    @Query('excludePromotionId') excludePromotionId?: string,
  ) {
    return this.promotionsService.findReservedInventoryItemIds(
      excludePromotionId?.trim() || undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.promotionsService.findOneForStaff(id);
  }

  @Post()
  create(@Req() req: { user: JwtUser }, @Body() body: CreatePromotionDto) {
    return this.promotionsService.createForStaff(req.user.userId, body);
  }

  @Patch(':id')
  update(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePromotionDto,
  ) {
    return this.promotionsService.updateForStaff(id, req.user.userId, body);
  }

  @Post(':id/cancel')
  cancel(@Req() req: { user: JwtUser }, @Param('id', ParseUUIDPipe) id: string) {
    return this.promotionsService.cancelForStaff(id, req.user.userId);
  }
}
