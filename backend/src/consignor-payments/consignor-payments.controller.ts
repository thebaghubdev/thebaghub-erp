import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { ConsignorPaymentsService } from './consignor-payments.service';

@Controller('consignor-payments')
@UseGuards(StaffOnlyGuard)
export class ConsignorPaymentsController {
  constructor(
    private readonly consignorPaymentsService: ConsignorPaymentsService,
  ) {}

  @Get()
  findAll() {
    return this.consignorPaymentsService.findAllForStaff();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.consignorPaymentsService.findOneForStaff(id);
  }
}
