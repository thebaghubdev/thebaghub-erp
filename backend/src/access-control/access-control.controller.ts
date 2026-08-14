import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { UpdateAccessMatrixDto } from './dto/update-access-matrix.dto';
import { FeatureAccessGuard } from './feature-access.guard';
import { FeatureAccessService } from './feature-access.service';
import { RequireFeature } from './require-feature.decorator';

@Controller('access-control')
@UseGuards(StaffOnlyGuard, FeatureAccessGuard)
export class AccessControlController {
  constructor(private readonly featureAccessService: FeatureAccessService) {}

  @Get('me')
  getMe(@Req() req: { user: JwtUser }) {
    return this.featureAccessService.getMyAccess(
      req.user.userId,
      req.user.isAdmin,
    );
  }

  @Get('matrix')
  @RequireFeature('access-management', 'view')
  getMatrix() {
    return this.featureAccessService.getMatrix();
  }

  @Put('matrix')
  @RequireFeature('access-management', 'edit')
  putMatrix(
    @Req() req: { user: JwtUser },
    @Body() dto: UpdateAccessMatrixDto,
  ) {
    return this.featureAccessService.replaceMatrix(dto, req.user.userId);
  }
}
