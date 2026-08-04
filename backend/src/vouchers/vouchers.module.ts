import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/entities/client.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Voucher } from './entities/voucher.entity';
import { VouchersController } from './vouchers.controller';
import { ClientVouchersController } from './client-vouchers.controller';
import { VouchersService } from './vouchers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Voucher, Client, Employee])],
  controllers: [VouchersController, ClientVouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}
