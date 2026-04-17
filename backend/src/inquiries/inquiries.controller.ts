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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import type { MulterFile } from './multer-file.type';
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

  /** Walk-in consignment: staff submits on behalf of a selected client (multipart like client flow). */
  @Post('walk-in')
  @UseInterceptors(
    FilesInterceptor('file', 100, {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  submitWalkIn(
    @Req() req: { user: JwtUser },
    @UploadedFiles() files: MulterFile[],
    @Body('payload') payload: string,
  ) {
    return this.inquiriesService.submitWalkInConsignmentInquiry(
      req.user,
      payload,
      files,
    );
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
