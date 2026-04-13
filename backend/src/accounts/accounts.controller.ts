import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { JwtUser } from '../auth/jwt-user';
import { AccountsService } from './accounts.service';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Controller('accounts')
@UseGuards(AdminGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('employees')
  findEmployees() {
    return this.accountsService.findAllEmployees();
  }

  @Get('clients')
  findClients() {
    return this.accountsService.findAllClients();
  }

  @Patch('employees/:id')
  updateEmployee(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @Req() req: { user: JwtUser },
  ) {
    return this.accountsService.updateEmployee(id, dto, req.user.userId);
  }
}
