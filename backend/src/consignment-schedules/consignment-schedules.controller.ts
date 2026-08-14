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
import { FeatureAccessGuard } from '../access-control/feature-access.guard';
import { RequireFeature } from '../access-control/require-feature.decorator';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { CreateConsignmentScheduleDto } from './dto/create-consignment-schedule.dto';
import { ReceiveScheduleItemsDto } from './dto/receive-schedule-items.dto';
import { RescheduleConsignmentScheduleDto } from './dto/reschedule-consignment-schedule.dto';
import { ConsignmentSchedulesService } from './consignment-schedules.service';

@Controller('consignment-schedules')
@UseGuards(StaffOnlyGuard, FeatureAccessGuard)
export class ConsignmentSchedulesController {
  constructor(
    private readonly consignmentSchedulesService: ConsignmentSchedulesService,
  ) {}

  @Get()
  @RequireFeature('consignment-scheduling', 'view')
  findAll() {
    return this.consignmentSchedulesService.findAllForStaff();
  }

  @Get(':id')
  @RequireFeature('consignment-scheduling', 'view')
  findOne(@Param('id') id: string) {
    return this.consignmentSchedulesService.findOneForStaff(id);
  }

  @Patch(':id')
  @RequireFeature('consignment-scheduling', 'edit')
  reschedule(
    @Param('id') id: string,
    @Body() body: RescheduleConsignmentScheduleDto,
  ) {
    return this.consignmentSchedulesService.rescheduleForStaff(id, body);
  }

  @Post(':id/receive-items')
  @RequireFeature('consignment-scheduling', 'edit')
  receiveItems(
    @Req() req: { user: JwtUser },
    @Param('id') id: string,
    @Body() body: ReceiveScheduleItemsDto,
  ) {
    return this.consignmentSchedulesService.receiveItemsForStaff(
      id,
      body,
      req.user.userId,
    );
  }

  @Post(':id/complete-pullout')
  @RequireFeature('consignment-scheduling', 'edit')
  completePullout(
    @Req() req: { user: JwtUser },
    @Param('id') id: string,
  ) {
    return this.consignmentSchedulesService.completePulloutForStaff(
      id,
      req.user.userId,
    );
  }

  @Delete(':id')
  @RequireFeature('consignment-scheduling', 'edit')
  remove(@Req() req: { user: JwtUser }, @Param('id') id: string) {
    return this.consignmentSchedulesService.removeForStaff(id, req.user.userId);
  }

  @Post()
  @RequireFeature('consignment-scheduling', 'edit')
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
