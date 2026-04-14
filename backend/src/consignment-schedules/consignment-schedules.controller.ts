import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { CreateConsignmentScheduleDto } from './dto/create-consignment-schedule.dto';
import { ConsignmentSchedulesService } from './consignment-schedules.service';

@Controller('consignment-schedules')
@UseGuards(StaffOnlyGuard)
export class ConsignmentSchedulesController {
  constructor(
    private readonly consignmentSchedulesService: ConsignmentSchedulesService,
  ) {}

  @Get()
  findAll() {
    return this.consignmentSchedulesService.findAllForStaff();
  }

  @Post()
  create(
    @Req() req: { user: JwtUser },
    @Body() body: CreateConsignmentScheduleDto,
  ) {
    return this.consignmentSchedulesService.createForStaff(
      req.user.userId,
      body,
    );
  }
}
