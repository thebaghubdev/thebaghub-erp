import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import type { MulterFile } from '../inquiries/multer-file.type';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { DeclineLayawayOrderDto } from './dto/decline-layaway-order.dto';
import { UpdateInstallmentAmountPaidDto } from './dto/update-installment-amount-paid.dto';
import { UpdateLayawayTermsDto } from './dto/update-layaway-terms.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(StaffOnlyGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll() {
    return this.ordersService.findAllForStaff();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOneForStaff(id);
  }

  @Post(':id/approve-layaway')
  approveLayaway(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.approveLayawayForStaff(req.user, id);
  }

  @Post(':id/decline-layaway')
  declineLayaway(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeclineLayawayOrderDto,
  ) {
    return this.ordersService.declineLayawayForStaff(req.user, id, dto);
  }

  @Post(':id/update-layaway-terms')
  updateLayawayTerms(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLayawayTermsDto,
  ) {
    return this.ordersService.updateLayawayTermsForStaff(req.user, id, dto);
  }

  @Post(':id/cancel')
  cancelOrder(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrderForStaff(req.user, id, dto);
  }

  @Post(':id/mark-paid')
  markPaid(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.markPaidForStaff(req.user, id);
  }

  @Post(':id/out-for-delivery')
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  markOutForDelivery(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('shippingFeeCareOf') shippingFeeCareOf: string | undefined,
    @UploadedFile() proof: MulterFile | undefined,
  ) {
    return this.ordersService.markOutForDeliveryForStaff(
      req.user,
      id,
      shippingFeeCareOf,
      proof,
    );
  }

  @Post(':id/full-payment-proof')
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadFullPaymentProof(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() proof: MulterFile | undefined,
  ) {
    return this.ordersService.uploadFullPaymentProofForStaff(
      req.user,
      id,
      proof,
    );
  }

  @Post(':id/reservation-payment-proof')
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadReservationPaymentProof(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() proof: MulterFile | undefined,
  ) {
    return this.ordersService.uploadReservationPaymentProofForStaff(
      req.user,
      id,
      proof,
    );
  }

  @Patch(':id/installments/:installmentNumber/amount-paid')
  setInstallmentAmountPaid(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('installmentNumber', ParseIntPipe) installmentNumber: number,
    @Body() dto: UpdateInstallmentAmountPaidDto,
  ) {
    return this.ordersService.setInstallmentAmountPaidForStaff(
      req.user,
      id,
      installmentNumber,
      dto,
    );
  }

  @Post(':id/installments/:installmentNumber/proof')
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadInstallmentProof(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('installmentNumber', ParseIntPipe) installmentNumber: number,
    @UploadedFile() proof: MulterFile | undefined,
  ) {
    return this.ordersService.uploadInstallmentProofForStaff(
      req.user,
      id,
      installmentNumber,
      proof,
    );
  }
}
