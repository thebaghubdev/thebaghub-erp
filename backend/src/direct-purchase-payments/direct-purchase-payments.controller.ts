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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { FeatureAccessGuard } from '../access-control/feature-access.guard';
import { RequireFeature } from '../access-control/require-feature.decorator';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { DIRECT_PURCHASE_PAYMENT_PHOTO_MAX_BYTES } from './direct-purchase-payment-image.util';
import { UpdateDirectPurchasePaymentStatusDto } from './dto/update-direct-purchase-payment-status.dto';
import { DirectPurchasePaymentsService } from './direct-purchase-payments.service';
import type { MulterFile } from '../inquiries/multer-file.type';

@Controller('direct-purchase-payments')
@UseGuards(StaffOnlyGuard, FeatureAccessGuard)
export class DirectPurchasePaymentsController {
  constructor(
    private readonly directPurchasePaymentsService: DirectPurchasePaymentsService,
  ) {}

  @Get()
  @RequireFeature('direct-purchase-payments', 'view')
  findAll() {
    return this.directPurchasePaymentsService.findAllForStaff();
  }

  @Get(':id')
  @RequireFeature('direct-purchase-payments', 'view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.directPurchasePaymentsService.findOneForStaff(id);
  }

  @Patch(':id/status')
  @RequireFeature('direct-purchase-payments', 'edit')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDirectPurchasePaymentStatusDto,
  ) {
    return this.directPurchasePaymentsService.updateStatusForStaff(id, body);
  }

  @Post(':id/check')
  @RequireFeature('direct-purchase-payments', 'edit')
  @UseInterceptors(
    FilesInterceptor('photos', 20, {
      limits: { fileSize: DIRECT_PURCHASE_PAYMENT_PHOTO_MAX_BYTES },
    }),
  )
  saveCheck(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('checkNumber') checkNumber: string,
    @Body('retainedKeys') retainedKeys: string | undefined,
    @UploadedFiles() files: MulterFile[],
  ) {
    return this.directPurchasePaymentsService.saveCheckForStaff(
      id,
      req.user,
      checkNumber,
      retainedKeys,
      files ?? [],
    );
  }

  @Post(':id/deposit-slip')
  @RequireFeature('direct-purchase-payments', 'edit')
  @UseInterceptors(
    FilesInterceptor('photos', 20, {
      limits: { fileSize: DIRECT_PURCHASE_PAYMENT_PHOTO_MAX_BYTES },
    }),
  )
  saveDepositSlip(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('retainedKeys') retainedKeys: string | undefined,
    @UploadedFiles() files: MulterFile[],
  ) {
    return this.directPurchasePaymentsService.saveDepositSlipForStaff(
      id,
      req.user,
      retainedKeys,
      files ?? [],
    );
  }

  @Post(':id/unable-to-send')
  @RequireFeature('direct-purchase-payments', 'edit')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: DIRECT_PURCHASE_PAYMENT_PHOTO_MAX_BYTES },
    }),
  )
  markUnableToSend(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
    @UploadedFile() photo: MulterFile | undefined,
  ) {
    return this.directPurchasePaymentsService.markUnableToSendForStaff(
      id,
      req.user,
      reason,
      photo,
    );
  }
}
