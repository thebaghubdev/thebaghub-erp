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
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { VouchersService } from './vouchers.service';

@Controller('vouchers')
@UseGuards(StaffOnlyGuard)
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Get()
  findAll() {
    return this.vouchersService.findAllForStaff();
  }

  @Post()
  create(@Req() req: { user: JwtUser }, @Body() body: CreateVoucherDto) {
    return this.vouchersService.createForStaff(req.user.userId, body);
  }

  @Post(':id/forfeit')
  forfeit(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vouchersService.forfeitForStaff(id, req.user.userId);
  }
}
