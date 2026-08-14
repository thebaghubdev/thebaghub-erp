import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FeatureAccessGuard } from '../access-control/feature-access.guard';
import { RequireFeature } from '../access-control/require-feature.decorator';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { JwtUser } from '../auth/jwt-user';
import { AccountsService } from './accounts.service';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateClientCreditLineDto } from './dto/update-client-credit-line.dto';
import { UpdateClientVipStatusDto } from './dto/update-client-vip-status.dto';
import { UpdateClientBankDto } from '../clients/dto/update-client-bank.dto';

@Controller('accounts')
@UseGuards(StaffOnlyGuard, FeatureAccessGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('employees')
  @RequireFeature('employees', 'view', { orFeatureKeys: ['access-management'] })
  findEmployees() {
    return this.accountsService.findAllEmployees();
  }

  @Get('clients')
  @RequireFeature('clients', 'view')
  findClients() {
    return this.accountsService.findAllClients();
  }

  @Get('clients/:id')
  @RequireFeature('clients', 'view')
  findClient(@Param('id') id: string) {
    return this.accountsService.findClientById(id);
  }

  @Patch('clients/:id/vip-status')
  @RequireFeature('clients', 'edit')
  updateClientVipStatus(
    @Param('id') id: string,
    @Body() dto: UpdateClientVipStatusDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.accountsService.updateClientVipStatus(
      id,
      dto.vipStatus,
      req.user.userId,
    );
  }

  @Patch('clients/:id/credit-line')
  @RequireFeature('clients', 'edit')
  updateClientCreditLine(
    @Param('id') id: string,
    @Body() dto: UpdateClientCreditLineDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.accountsService.updateClientCreditLine(
      id,
      dto.isCreditLine,
      req.user.userId,
    );
  }

  @Patch('clients/:id/payment-profile')
  @RequireFeature('clients', 'edit')
  updateClientPaymentProfile(
    @Param('id') id: string,
    @Body() dto: UpdateClientBankDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.accountsService.updateClientPaymentProfile(
      id,
      dto,
      req.user.userId,
    );
  }

  @Patch('employees/:id')
  @RequireFeature('employees', 'edit')
  updateEmployee(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.accountsService.updateEmployee(id, dto, req.user.userId);
  }
}
