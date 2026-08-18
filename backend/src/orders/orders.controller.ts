import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import type { MulterFile } from '../inquiries/multer-file.type';
import { ApproveLayawayOrderDto } from './dto/approve-layaway-order.dto';
import { BatchAssignSalesAssociateDto } from './dto/batch-assign-sales-associate.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { ConvertToLayawayDto } from './dto/convert-to-layaway.dto';
import { DeclineLayawayOrderDto } from './dto/decline-layaway-order.dto';
import { MarkInstallmentPaidDto } from './dto/mark-installment-paid.dto';
import { MarkOrderPaymentPaidDto } from './dto/mark-order-payment-paid.dto';
import { UpdateInstallmentAmountPaidDto } from './dto/update-installment-amount-paid.dto';
import { UpdateInstallmentDueDateDto } from './dto/update-installment-due-date.dto';
import { UpdateInstallmentPaymentDateDto } from './dto/update-installment-payment-date.dto';
import { UpdateLayawayTermsDto } from './dto/update-layaway-terms.dto';
import { UpdateOrderPaymentAmountPaidDto } from './dto/update-order-payment-amount-paid.dto';
import { UpdateOrderPaymentDateDto } from './dto/update-order-payment-date.dto';
import { UpdateOrderTotalPriceDto } from './dto/update-order-total-price.dto';
import { ApplyVoucherDto } from './dto/apply-voucher.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(StaffOnlyGuard, FeatureAccessGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequireFeature('orders', 'view')
  findAll() {
    return this.ordersService.findAllForStaff();
  }

  @Get('sales-associates')
  @RequireFeature('orders', 'view')
  listSalesAssociates() {
    return this.ordersService.listSalesAssociates();
  }

  @Get('dashboard/daily-sales-by-price-tier')
  dailySalesByPriceTier(
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.ordersService.getDailySalesByPriceTierForStaff(year, month);
  }

  @Post('batch-assign-sales-associate')
  @RequireFeature('orders', 'edit')
  @HttpCode(HttpStatus.OK)
  batchAssignSalesAssociate(
    @Body() dto: BatchAssignSalesAssociateDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.ordersService.batchAssignSalesAssociate(
      dto,
      req.user,
    );
  }

  @Post()
  @RequireFeature('orders', 'edit')
  @UseInterceptors(
    FileInterceptor('signature', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  createOrder(
    @Req() req: { user: JwtUser },
    @Body('payload') payload: string,
    @UploadedFile() signature: MulterFile | undefined,
  ) {
    return this.ordersService.createOrderForStaff(
      req.user,
      payload,
      signature,
    );
  }

  @Get(':id')
  @RequireFeature('orders', 'view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOneForStaff(id);
  }

  @Post(':id/approve-layaway')
  @RequireFeature('orders', 'edit')
  approveLayaway(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveLayawayOrderDto,
  ) {
    return this.ordersService.approveLayawayForStaff(req.user, id, dto);
  }

  @Post(':id/decline-layaway')
  @RequireFeature('orders', 'edit')
  declineLayaway(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeclineLayawayOrderDto,
  ) {
    return this.ordersService.declineLayawayForStaff(req.user, id, dto);
  }

  @Post(':id/update-layaway-terms')
  @RequireFeature('orders', 'edit')
  updateLayawayTerms(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLayawayTermsDto,
  ) {
    return this.ordersService.updateLayawayTermsForStaff(req.user, id, dto);
  }

  @Post(':id/convert-to-layaway')
  @RequireFeature('orders', 'edit')
  convertToLayaway(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertToLayawayDto,
  ) {
    return this.ordersService.convertToLayawayForStaff(req.user, id, dto);
  }

  @Post(':id/cancel')
  @RequireFeature('orders', 'edit')
  cancelOrder(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrderForStaff(req.user, id, dto);
  }

  @Post(':id/mark-paid')
  @RequireFeature('orders', 'edit')
  markPaid(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.markPaidForStaff(req.user, id);
  }

  @Post(':id/item-received')
  @RequireFeature('orders', 'edit')
  markItemReceived(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.markItemReceivedForStaff(req.user, id);
  }

  @Post(':id/for-pick-up')
  @RequireFeature('orders', 'edit')
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  markForPickup(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('pickupOption') pickupOption: string | undefined,
    @Body('pickupBranch') pickupBranch: string | undefined,
    @Body('courierService') courierService: string | undefined,
    @Body('shippingFeeCareOf') shippingFeeCareOf: string | undefined,
    @UploadedFile() proof: MulterFile | undefined,
  ) {
    return this.ordersService.markForPickupForStaff(
      req.user,
      id,
      pickupOption,
      pickupBranch,
      courierService,
      shippingFeeCareOf,
      proof,
    );
  }

  @Post(':id/full-payment-proof')
  @RequireFeature('orders', 'edit')
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
  @RequireFeature('orders', 'edit')
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
  @RequireFeature('orders', 'edit')
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

  @Post(':id/installments/:installmentNumber/penalty/waive-request')
  @RequireFeature('orders', 'edit')
  @HttpCode(HttpStatus.OK)
  requestInstallmentPenaltyWaive(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('installmentNumber', ParseIntPipe) installmentNumber: number,
  ) {
    return this.ordersService.requestInstallmentPenaltyWaiveForStaff(
      req.user,
      id,
      installmentNumber,
    );
  }

  @Post(':id/installments/:installmentNumber/penalty/waive-approve')
  @RequireFeature('orders', 'view')
  @HttpCode(HttpStatus.OK)
  approveInstallmentPenaltyWaive(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('installmentNumber', ParseIntPipe) installmentNumber: number,
  ) {
    return this.ordersService.approveInstallmentPenaltyWaiveForStaff(
      req.user,
      id,
      installmentNumber,
    );
  }

  @Post(':id/installments/:installmentNumber/penalty/waive-reject')
  @RequireFeature('orders', 'view')
  @HttpCode(HttpStatus.OK)
  rejectInstallmentPenaltyWaive(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('installmentNumber', ParseIntPipe) installmentNumber: number,
  ) {
    return this.ordersService.rejectInstallmentPenaltyWaiveForStaff(
      req.user,
      id,
      installmentNumber,
    );
  }

  @Patch(':id/installments/:installmentNumber/due-date')
  @RequireFeature('orders', 'edit')
  setInstallmentDueDate(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('installmentNumber', ParseIntPipe) installmentNumber: number,
    @Body() dto: UpdateInstallmentDueDateDto,
  ) {
    return this.ordersService.setInstallmentDueDateForStaff(
      req.user,
      id,
      installmentNumber,
      dto,
    );
  }

  @Patch(':id/installments/:installmentNumber/payment-date')
  @RequireFeature('orders', 'edit')
  setInstallmentPaymentDate(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('installmentNumber', ParseIntPipe) installmentNumber: number,
    @Body() dto: UpdateInstallmentPaymentDateDto,
  ) {
    return this.ordersService.setInstallmentPaymentDateForStaff(
      req.user,
      id,
      installmentNumber,
      dto,
    );
  }

  @Post(':id/installments/:installmentNumber/mark-paid')
  @RequireFeature('orders', 'edit')
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  markInstallmentPaid(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('installmentNumber', ParseIntPipe) installmentNumber: number,
    @Body() dto: MarkInstallmentPaidDto,
    @UploadedFile() proof: MulterFile | undefined,
  ) {
    return this.ordersService.markInstallmentPaidForStaff(
      req.user,
      id,
      installmentNumber,
      dto,
      proof,
    );
  }

  @Post(':id/installments/:installmentNumber/proof')
  @RequireFeature('orders', 'edit')
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

  @Post(':id/apply-voucher')
  @RequireFeature('orders', 'edit')
  applyVoucher(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyVoucherDto,
  ) {
    return this.ordersService.applyVoucherForStaff(req.user, id, dto);
  }

  @Post(':id/payments')
  @RequireFeature('orders', 'edit')
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadOrderPaymentProof(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('amountPaid') amountPaid: string | undefined,
    @Body('paymentDate') paymentDate: string | undefined,
    @Body('modeOfPayment') modeOfPayment: string | undefined,
    @UploadedFile() proof: MulterFile | undefined,
  ) {
    return this.ordersService.uploadOrderPaymentProofForStaff(
      req.user,
      id,
      proof,
      amountPaid,
      paymentDate,
      modeOfPayment,
    );
  }

  @Post(':id/payments/:paymentId/mark-paid')
  @RequireFeature('orders', 'edit')
  markOrderPaymentPaid(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: MarkOrderPaymentPaidDto,
  ) {
    return this.ordersService.markOrderPaymentPaidForStaff(
      req.user,
      id,
      paymentId,
      dto,
    );
  }

  @Patch(':id/payments/:paymentId/amount-paid')
  @RequireFeature('orders', 'edit')
  setOrderPaymentAmountPaid(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: UpdateOrderPaymentAmountPaidDto,
  ) {
    return this.ordersService.setOrderPaymentAmountPaidForStaff(
      req.user,
      id,
      paymentId,
      dto,
    );
  }

  @Patch(':id/payments/:paymentId/payment-date')
  @RequireFeature('orders', 'edit')
  setOrderPaymentPaymentDate(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: UpdateOrderPaymentDateDto,
  ) {
    return this.ordersService.setOrderPaymentPaymentDateForStaff(
      req.user,
      id,
      paymentId,
      dto,
    );
  }

  @Patch(':id/order-total-price')
  @RequireFeature('orders', 'edit')
  setOrderTotalPrice(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderTotalPriceDto,
  ) {
    return this.ordersService.setOrderTotalPriceForStaff(req.user, id, dto);
  }
}
