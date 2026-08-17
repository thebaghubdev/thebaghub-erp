import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FeatureAccessGuard } from '../access-control/feature-access.guard';
import { RequireFeature } from '../access-control/require-feature.decorator';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { MulterFile } from '../inquiries/multer-file.type';
import { BatchAssignWalkInAuthenticatorDto } from './dto/batch-assign-walk-in-authenticator.dto';
import { CompleteWalkInAuthenticationDto } from './dto/complete-walk-in-authentication.dto';
import { CreateWalkInAuthenticationDto } from './dto/create-walk-in-authentication.dto';
import { SaveWalkInAuthenticationDto } from './dto/save-walk-in-authentication.dto';
import { WalkInAuthenticationService } from './walk-in-authentication.service';

@Controller('walk-in-authentication')
@UseGuards(StaffOnlyGuard, FeatureAccessGuard)
export class WalkInAuthenticationController {
  constructor(private readonly service: WalkInAuthenticationService) {}

  @Get('authenticators')
  @RequireFeature('walk-in-authentication', 'view')
  listAuthenticators() {
    return this.service.listAuthenticators();
  }

  @Get()
  @RequireFeature('walk-in-authentication', 'view')
  listAll() {
    return this.service.listAll();
  }

  @Post()
  @RequireFeature('walk-in-authentication', 'edit')
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  create(
    @Req() req: { user: JwtUser },
    @Body() body: CreateWalkInAuthenticationDto,
    @UploadedFile() proof: MulterFile | undefined,
  ) {
    return this.service.create(body, proof, req.user);
  }

  @Post('batch-assign-authenticator')
  @RequireFeature('walk-in-authentication', 'edit')
  batchAssign(
    @Req() req: { user: JwtUser },
    @Body() body: BatchAssignWalkInAuthenticatorDto,
  ) {
    return this.service.batchAssign(body, req.user);
  }

  @Get(':id')
  @RequireFeature('walk-in-authentication', 'view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequireFeature('walk-in-authentication', 'edit')
  save(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveWalkInAuthenticationDto,
  ) {
    return this.service.save(id, body, {
      userId: req.user.userId,
      isAdmin: req.user.isAdmin,
    });
  }

  @Post(':id/complete')
  @RequireFeature('walk-in-authentication', 'edit')
  complete(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CompleteWalkInAuthenticationDto,
  ) {
    return this.service.complete(id, body, {
      userId: req.user.userId,
      isAdmin: req.user.isAdmin,
    });
  }
}
