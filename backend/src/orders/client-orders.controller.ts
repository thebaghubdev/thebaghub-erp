import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { JwtUser } from '../auth/jwt-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClientOnlyGuard } from '../auth/client-only.guard';
import type { MulterFile } from '../inquiries/multer-file.type';
import { OrdersService } from './orders.service';

@Controller('client/orders')
@UseGuards(JwtAuthGuard, ClientOnlyGuard)
export class ClientOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  listMine(@Req() req: { user: JwtUser }) {
    return this.ordersService.findMineForClient(req.user);
  }

  @Get('waitlists')
  listWaitlists(@Req() req: { user: JwtUser }) {
    return this.ordersService.findWaitlistsForClient(req.user);
  }

  @Get(':id')
  getOne(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.findOneForClient(req.user, id);
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
    return this.ordersService.createOrderForClient(
      req.user,
      payload,
      signature,
    );
  }

  @Post('reservations')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'proof', maxCount: 1 },
      { name: 'signature', maxCount: 1 },
    ], {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  createReservation(
    @Req() req: { user: JwtUser },
    @Body('payload') payload: string,
    @UploadedFiles()
    files:
      | {
          proof?: MulterFile[];
          signature?: MulterFile[];
        }
      | undefined,
  ) {
    return this.ordersService.createReservationForClient(
      req.user,
      payload,
      files?.proof?.[0],
      files?.signature?.[0],
    );
  }

  @Post(':id/item-received')
  markItemReceived(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.markItemReceivedForClient(req.user, id);
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
    return this.ordersService.uploadFullPaymentProofForClient(
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
    return this.ordersService.uploadReservationPaymentProofForClient(
      req.user,
      id,
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
    return this.ordersService.uploadInstallmentProofForClient(
      req.user,
      id,
      installmentNumber,
      proof,
    );
  }
}
