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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
