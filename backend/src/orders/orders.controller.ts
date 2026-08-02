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
import { UpdateInstallmentPenaltyDto } from './dto/update-installment-penalty.dto';
import { UpdateLayawayTermsDto } from './dto/update-layaway-terms.dto';
import { UpdateOrderPaymentAmountPaidDto } from './dto/update-order-payment-amount-paid.dto';
import { UpdateOrderPaymentDateDto } from './dto/update-order-payment-date.dto';
import { UpdateOrderTotalPriceDto } from './dto/update-order-total-price.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(StaffOnlyGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll() {
    return this.ordersService.findAllForStaff();
  }

  @Get('sales-associates')
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
  @HttpCode(HttpStatus.OK)
  batchAssignSalesAssociate(
    @Body() dto: BatchAssignSalesAssociateDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.ordersService.batchAssignSalesAssociate(
      dto,
      req.user.userId,
    );
  }

  @Post()
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
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOneForStaff(id);
  }

  @Post(':id/approve-layaway')
  approveLayaway(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveLayawayOrderDto,
  ) {
    return this.ordersService.approveLayawayForStaff(req.user, id, dto);
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

  @Post(':id/convert-to-layaway')
  convertToLayaway(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertToLayawayDto,
  ) {
    return this.ordersService.convertToLayawayForStaff(req.user, id, dto);
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

  @Post(':id/item-received')
  markItemReceived(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.markItemReceivedForStaff(req.user, id);
  }

  @Post(':id/for-pick-up')
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

  @Patch(':id/installments/:installmentNumber/penalty')
  setInstallmentPenalty(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('installmentNumber', ParseIntPipe) installmentNumber: number,
    @Body() dto: UpdateInstallmentPenaltyDto,
  ) {
    return this.ordersService.setInstallmentPenaltyForStaff(
      req.user,
      id,
      installmentNumber,
      dto,
    );
  }

  @Patch(':id/installments/:installmentNumber/due-date')
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

  @Post(':id/payments')
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
  setOrderTotalPrice(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderTotalPriceDto,
  ) {
    return this.ordersService.setOrderTotalPriceForStaff(req.user, id, dto);
  }
}
