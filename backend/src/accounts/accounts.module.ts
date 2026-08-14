import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { ClientsModule } from '../clients/clients.module';
import { Client } from '../clients/entities/client.entity';
import { Employee } from '../employees/entities/employee.entity';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  imports: [
    AccessControlModule,
    TypeOrmModule.forFeature([Employee, Client]),
    ClientsModule,
  ],
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
