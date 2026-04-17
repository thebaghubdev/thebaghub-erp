import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { BatchAssignAuthenticatorDto } from './dto/batch-assign-authenticator.dto';
import { SaveItemAuthenticationMetricsDto } from './dto/save-item-authentication-metrics.dto';
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

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.findOneForStaff(id);
  }
}
