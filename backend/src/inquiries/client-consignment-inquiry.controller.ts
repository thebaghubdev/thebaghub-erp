import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtUser } from '../auth/jwt-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClientOnlyGuard } from '../auth/client-only.guard';
import type { MulterFile } from './multer-file.type';
import { InquiriesService } from './inquiries.service';

@Controller('client/consignment-inquiry')
@UseGuards(JwtAuthGuard, ClientOnlyGuard)
export class ClientConsignmentInquiryController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  /** List inquiries submitted by the logged-in client (consignor). */
  @Get()
  listMine(@Req() req: { user: JwtUser }) {
    return this.inquiriesService.findMineForClient(req.user);
  }

  /** One inquiry owned by the logged-in client (full snapshot, no staff notes). */
  @Get(':id')
  getOne(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inquiriesService.findOneForClient(req.user, id);
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor('file', 100, {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  submit(
    @Req() req: { user: JwtUser },
    @UploadedFiles() files: MulterFile[],
    @Body('payload') payload: string,
  ) {
    return this.inquiriesService.submitConsignmentInquiry(
      req.user,
      payload,
      files,
    );
  }

  /** Consignor cancels their own inquiry while it is still active. */
  @Post(':id/cancel')
  cancel(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inquiriesService.cancelInquiryForClient(req.user, id);
  }

  /** Append more item photos (multipart field `photos`, active inquiries only). */
  @Post(':id/photos')
  @UseInterceptors(
    FilesInterceptor('photos', 20, {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  appendPhotos(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: MulterFile[],
  ) {
    return this.inquiriesService.appendInquiryPhotosForClient(
      req.user,
      id,
      files,
    );
  }
}
