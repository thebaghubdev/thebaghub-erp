import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtUser } from '../auth/jwt-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClientOnlyGuard } from '../auth/client-only.guard';
import { VouchersService } from './vouchers.service';

@Controller('client/vouchers')
@UseGuards(JwtAuthGuard, ClientOnlyGuard)
export class ClientVouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Get()
  findMine(@Req() req: { user: JwtUser }) {
    return this.vouchersService.findMineForClient(req.user.userId);
  }
}
