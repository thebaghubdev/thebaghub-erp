import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FeatureAccessGuard } from '../access-control/feature-access.guard';
import { RequireFeature } from '../access-control/require-feature.decorator';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { CreateLogisticsDto } from './dto/create-logistics.dto';
import { LogisticsService } from './logistics.service';

@Controller('logistics')
@UseGuards(StaffOnlyGuard, FeatureAccessGuard)
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Get()
  @RequireFeature('logistics', 'view')
  findAll() {
    return this.logisticsService.findAllForStaff();
  }

  @Get('reserved-item-ids')
  @RequireFeature('logistics', 'view')
  findReservedInventoryItemIds() {
    return this.logisticsService.findInventoryIdsOnOpenTransfers();
  }

  @Get(':id')
  @RequireFeature('logistics', 'view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.logisticsService.findOneForStaff(id);
  }

  @Post()
  @RequireFeature('logistics', 'edit')
  create(@Req() req: { user: JwtUser }, @Body() body: CreateLogisticsDto) {
    return this.logisticsService.createForStaff(req.user.userId, body);
  }

  @Post(':id/dispatch')
  @RequireFeature('logistics', 'edit')
  dispatch(@Req() req: { user: JwtUser }, @Param('id', ParseUUIDPipe) id: string) {
    return this.logisticsService.dispatchForStaff(id, req.user.userId);
  }

  @Post(':id/cancel')
  @RequireFeature('logistics', 'edit')
  cancel(@Req() req: { user: JwtUser }, @Param('id', ParseUUIDPipe) id: string) {
    return this.logisticsService.cancelForStaff(id, req.user.userId);
  }

  @Post(':id/complete')
  @RequireFeature('logistics', 'edit')
  complete(@Req() req: { user: JwtUser }, @Param('id', ParseUUIDPipe) id: string) {
    return this.logisticsService.completeForStaff(id, req.user.userId);
  }
}
