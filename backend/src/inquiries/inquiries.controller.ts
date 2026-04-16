import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { UpdateInquiryNotesDto } from './dto/update-inquiry-notes.dto';
import { SubmitOfferDto } from './dto/submit-offer.dto';
import { InquiriesService } from './inquiries.service';
import { InquiryAuditService } from './inquiry-audit.service';

@Controller('inquiries')
@UseGuards(StaffOnlyGuard)
export class InquiriesController {
  constructor(
    private readonly inquiriesService: InquiriesService,
    private readonly inquiryAuditService: InquiryAuditService,
  ) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.inquiriesService.findAllForStaff(status);
  }

  @Get(':id/audit')
  getAudit(@Param('id', ParseUUIDPipe) id: string) {
    return this.inquiryAuditService.findForInquiry(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.inquiriesService.findOneForStaff(id);
  }

  @Post(':id/decline')
  decline(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inquiriesService.declineInquiry(id, req.user);
  }

  @Post(':id/offer')
  submitOffer(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubmitOfferDto,
  ) {
    return this.inquiriesService.submitOffer(id, body, req.user);
  }

  @Patch(':id/notes')
  updateNotes(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateInquiryNotesDto,
  ) {
    return this.inquiriesService.updateNotes(id, body, req.user);
  }
}
