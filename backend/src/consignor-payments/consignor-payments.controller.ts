import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { CONSIGNOR_PAYMENT_CHECK_PHOTO_MAX_BYTES } from './consignor-payment-image.util';
import { UpdateConsignorPaymentGroupStatusDto } from './dto/update-consignor-payment-group-status.dto';
import { ConsignorPaymentsService } from './consignor-payments.service';
import type { MulterFile } from '../inquiries/multer-file.type';

@Controller('consignor-payments')
@UseGuards(StaffOnlyGuard)
export class ConsignorPaymentsController {
  constructor(
    private readonly consignorPaymentsService: ConsignorPaymentsService,
  ) {}

  @Get()
  findAll() {
    return this.consignorPaymentsService.findAllForStaff();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.consignorPaymentsService.findOneForStaff(id);
  }

  @Patch(':id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.consignorPaymentsService.approveForStaff(id);
  }

  @Patch(':id/groups/:groupId/status')
  updateGroupStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: UpdateConsignorPaymentGroupStatusDto,
  ) {
    return this.consignorPaymentsService.updateGroupStatusForStaff(
      id,
      groupId,
      body,
    );
  }

  @Post(':id/groups/:groupId/check')
  @UseInterceptors(
    FilesInterceptor('photos', 20, {
      limits: { fileSize: CONSIGNOR_PAYMENT_CHECK_PHOTO_MAX_BYTES },
    }),
  )
  saveCheck(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body('checkNumber') checkNumber: string,
    @Body('retainedKeys') retainedKeys: string | undefined,
    @UploadedFiles() files: MulterFile[],
  ) {
    return this.consignorPaymentsService.saveCheckForStaff(
      id,
      groupId,
      req.user,
      checkNumber,
      retainedKeys,
      files ?? [],
    );
  }

  @Post(':id/groups/:groupId/deposit-slip')
  @UseInterceptors(
    FilesInterceptor('photos', 20, {
      limits: { fileSize: CONSIGNOR_PAYMENT_CHECK_PHOTO_MAX_BYTES },
    }),
  )
  saveDepositSlip(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body('retainedKeys') retainedKeys: string | undefined,
    @UploadedFiles() files: MulterFile[],
  ) {
    return this.consignorPaymentsService.saveDepositSlipForStaff(
      id,
      groupId,
      req.user,
      retainedKeys,
      files ?? [],
    );
  }
}
