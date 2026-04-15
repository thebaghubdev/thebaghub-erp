import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { CreateConsignmentScheduleDto } from './dto/create-consignment-schedule.dto';
import { RescheduleConsignmentScheduleDto } from './dto/reschedule-consignment-schedule.dto';
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.consignmentSchedulesService.findOneForStaff(id);
  }

  @Patch(':id')
  reschedule(
    @Param('id') id: string,
    @Body() body: RescheduleConsignmentScheduleDto,
  ) {
    return this.consignmentSchedulesService.rescheduleForStaff(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.consignmentSchedulesService.removeForStaff(id);
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
