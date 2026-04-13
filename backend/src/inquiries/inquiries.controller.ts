import { Controller, Get, UseGuards } from '@nestjs/common';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { InquiriesService } from './inquiries.service';

@Controller('inquiries')
@UseGuards(StaffOnlyGuard)
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Get()
  findAll() {
    return this.inquiriesService.findAll();
  }
}
