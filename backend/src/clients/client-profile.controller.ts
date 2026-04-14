import { Body, Controller, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtUser } from '../auth/jwt-user';
import { ClientOnlyGuard } from '../auth/client-only.guard';
import { UpdateClientBankDto } from './dto/update-client-bank.dto';
import { ClientProfileService } from './client-profile.service';

@Controller('client')
@UseGuards(ClientOnlyGuard)
export class ClientProfileController {
  constructor(private readonly clientProfileService: ClientProfileService) {}

  /** Update saved bank details for direct deposit (also used when confirming offers). */
  @Patch('profile')
  updateProfile(
    @Req() req: { user: JwtUser },
    @Body() body: UpdateClientBankDto,
  ) {
    return this.clientProfileService.updateBankDetails(req.user.userId, body);
  }
}
