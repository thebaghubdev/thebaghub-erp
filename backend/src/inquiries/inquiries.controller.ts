import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { UpdateInquiryNotesDto } from './dto/update-inquiry-notes.dto';
import { SubmitOfferDto } from './dto/submit-offer.dto';
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

  @Post(':id/decline')
  decline(@Param('id', ParseUUIDPipe) id: string) {
    return this.inquiriesService.declineInquiry(id);
  }

  @Post(':id/offer')
  submitOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubmitOfferDto,
  ) {
    return this.inquiriesService.submitOffer(id, body);
  }

  @Patch(':id/notes')
  updateNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateInquiryNotesDto,
  ) {
    return this.inquiriesService.updateNotes(id, body);
  }
}
