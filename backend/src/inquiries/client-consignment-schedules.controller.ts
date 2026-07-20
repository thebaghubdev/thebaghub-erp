import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtUser } from '../auth/jwt-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClientOnlyGuard } from '../auth/client-only.guard';
import { InquiriesService } from './inquiries.service';
import { CreateClientDeliveryScheduleDto } from './dto/create-client-delivery-schedule.dto';
import { RescheduleClientDeliveryScheduleDto } from './dto/reschedule-client-delivery-schedule.dto';

@Controller('client/consignment-schedules')
@UseGuards(JwtAuthGuard, ClientOnlyGuard)
export class ClientConsignmentSchedulesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  /** Delivery schedules that include the logged-in client's inquiries (client- or staff-created). */
  @Get()
  listMine(@Req() req: { user: JwtUser }) {
    return this.inquiriesService.listClientSchedules(req.user);
  }

  /** Inquiries ready for client delivery scheduling (for_delivery, not yet linked). */
  @Get('for-delivery-inquiries')
  listForDeliveryInquiries(@Req() req: { user: JwtUser }) {
    return this.inquiriesService.findForDeliveryForClient(req.user);
  }

  /** Delivery date availability; `itemCount` is how many inquiries the client will book. */
  @Get('delivery-availability')
  getDeliveryAvailability(
    @Query('branch') branch: string,
    @Query('itemCount') itemCount?: string,
  ) {
    return this.inquiriesService.getClientDeliveryAvailability(branch, itemCount);
  }

  /** Batch schedule: one delivery row, multiple inquiry items. */
  @Post()
  create(
    @Req() req: { user: JwtUser },
    @Body() body: CreateClientDeliveryScheduleDto,
  ) {
    return this.inquiriesService.createClientDeliverySchedule(req.user, body);
  }

  /** One-time client reschedule for an owned delivery schedule. */
  @Patch(':id')
  reschedule(
    @Req() req: { user: JwtUser },
    @Param('id') id: string,
    @Body() body: RescheduleClientDeliveryScheduleDto,
  ) {
    return this.inquiriesService.rescheduleClientDeliverySchedule(
      req.user,
      id,
      body,
    );
  }
}
