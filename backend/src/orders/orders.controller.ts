import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
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
}
