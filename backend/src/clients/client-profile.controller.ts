import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtUser } from '../auth/jwt-user';
import { ClientOnlyGuard } from '../auth/client-only.guard';
import { SaveConsignmentFormSnapshotDto } from './dto/save-consignment-form-snapshot.dto';
import { UpdateClientBankDto } from './dto/update-client-bank.dto';
import { ClientProfileService } from './client-profile.service';

@Controller('client')
@UseGuards(ClientOnlyGuard)
export class ClientProfileController {
  constructor(private readonly clientProfileService: ClientProfileService) {}

  @Get('consignment-form-snapshot')
  getConsignmentFormSnapshot(@Req() req: { user: JwtUser }) {
    return this.clientProfileService.getConsignmentFormSnapshot(
      req.user.userId,
    );
  }

  @Patch('consignment-form-snapshot')
  saveConsignmentFormSnapshot(
    @Req() req: { user: JwtUser },
    @Body() body: SaveConsignmentFormSnapshotDto,
  ) {
    return this.clientProfileService.saveConsignmentFormSnapshot(
      req.user.userId,
      body,
    );
  }

  /** Update saved bank details for direct deposit (also used when confirming offers). */
  @Patch('profile')
  updateProfile(
    @Req() req: { user: JwtUser },
    @Body() body: UpdateClientBankDto,
  ) {
    return this.clientProfileService.updateBankDetails(req.user.userId, body);
  }
}
