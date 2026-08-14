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
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { VouchersService } from './vouchers.service';

@Controller('vouchers')
@UseGuards(StaffOnlyGuard, FeatureAccessGuard)
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Get('by-client/:clientId')
  @RequireFeature('vouchers', 'view')
  findByClient(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.vouchersService.findByClientForStaff(clientId);
  }

  @Get()
  @RequireFeature('vouchers', 'view')
  findAll() {
    return this.vouchersService.findAllForStaff();
  }

  @Post()
  @RequireFeature('vouchers', 'edit')
  create(@Req() req: { user: JwtUser }, @Body() body: CreateVoucherDto) {
    return this.vouchersService.createForStaff(req.user.userId, body);
  }

  @Post(':id/forfeit')
  @RequireFeature('vouchers', 'edit')
  forfeit(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vouchersService.forfeitForStaff(id, req.user.userId);
  }
}
