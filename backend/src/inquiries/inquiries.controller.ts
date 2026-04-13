import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { InquiriesService } from './inquiries.service';

@Controller('inquiries')
@UseGuards(StaffOnlyGuard)
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Get()
  findAll() {
    return this.inquiriesService.findAllForStaff();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.inquiriesService.findOneForStaff(id);
  }
}
