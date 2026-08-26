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
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { FeatureAccessGuard } from '../access-control/feature-access.guard';
import { RequireFeature } from '../access-control/require-feature.decorator';
import { JwtUser } from '../auth/jwt-user';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import type { MulterFile } from './multer-file.type';
import { UpdateInquiryNotesDto } from './dto/update-inquiry-notes.dto';
import { UpdateReauthenticationNotesDto } from './dto/update-reauthentication-notes.dto';
import { SubmitAuthenticatedReturnNewOfferDto } from './dto/submit-authenticated-return-new-offer.dto';
import { SubmitOfferDto } from './dto/submit-offer.dto';
import { RequestDirectPurchaseApprovalDto } from './dto/request-direct-purchase-approval.dto';
import { RejectDirectPurchaseApprovalDto } from './dto/reject-direct-purchase-approval.dto';
import { InquiriesService } from './inquiries.service';
import { InquiryAuditService } from './inquiry-audit.service';

@Controller('inquiries')
@UseGuards(StaffOnlyGuard, FeatureAccessGuard)
export class InquiriesController {
  constructor(
    private readonly inquiriesService: InquiriesService,
    private readonly inquiryAuditService: InquiryAuditService,
  ) {}

  @Get()
  @RequireFeature('inquiries', 'view')
  findAll(@Query('status') status?: string) {
    return this.inquiriesService.findAllForStaff(status);
  }

  /** Walk-in consignment: staff submits on behalf of a selected client (multipart like client flow). */
  @Post('walk-in')
  @RequireFeature('inquiries', 'edit')
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
  @RequireFeature('inquiries', 'view', {
    orFeatureKeys: ['payment-verification'],
  })
  getAudit(@Param('id', ParseUUIDPipe) id: string) {
    return this.inquiryAuditService.findForInquiry(id);
  }

  @Get(':id')
  @RequireFeature('inquiries', 'view', {
    orFeatureKeys: ['payment-verification'],
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.inquiriesService.findOneForStaff(id);
  }

  @Post(':id/decline')
  @RequireFeature('inquiries', 'edit')
  decline(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inquiriesService.declineInquiry(id, req.user);
  }

  @Post(':id/pullout')
  @RequireFeature('inquiries', 'edit')
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  pullout(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('pulloutFee') pulloutFee: string,
    @Body('pulloutReason') pulloutReason: string,
    @UploadedFile() proof: MulterFile | undefined,
  ) {
    return this.inquiriesService.pulloutInquiryForStaff(
      id,
      pulloutFee,
      pulloutReason,
      proof,
      req.user,
    );
  }

  @Post(':id/pullout-payment-verify')
  @RequireFeature('payment-verification', 'edit')
  confirmPulloutPayment(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inquiriesService.confirmPulloutPaymentForStaff(id, req.user);
  }

  @Post(':id/offer')
  @RequireFeature('inquiries', 'edit')
  submitOffer(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubmitOfferDto,
  ) {
    return this.inquiriesService.submitOffer(id, body, req.user);
  }

  @Post(':id/direct-purchase-approval')
  @RequireFeature('inquiries', 'edit')
  requestDirectPurchaseApproval(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RequestDirectPurchaseApprovalDto,
  ) {
    return this.inquiriesService.requestDirectPurchaseApproval(
      id,
      body,
      req.user,
    );
  }

  @Patch(':id/direct-purchase-approval')
  @RequireFeature('inquiries', 'edit')
  updateDirectPurchaseApproval(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RequestDirectPurchaseApprovalDto,
  ) {
    return this.inquiriesService.updateDirectPurchaseApprovalRequest(
      id,
      body,
      req.user,
    );
  }

  @Post(':id/direct-purchase-approval/withdraw')
  @RequireFeature('inquiries', 'edit')
  withdrawDirectPurchaseApproval(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inquiriesService.withdrawDirectPurchaseApprovalRequest(
      id,
      req.user,
    );
  }

  @Post(':id/direct-purchase-approval/approve')
  @RequireFeature('inquiries', 'edit')
  approveDirectPurchaseApproval(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inquiriesService.approveDirectPurchaseApproval(id, req.user);
  }

  @Post(':id/direct-purchase-approval/reject')
  @RequireFeature('inquiries', 'edit')
  rejectDirectPurchaseApproval(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectDirectPurchaseApprovalDto,
  ) {
    return this.inquiriesService.rejectDirectPurchaseApproval(
      id,
      body,
      req.user,
    );
  }

  @Post(':id/authenticated-return-new-offer')
  @RequireFeature('inquiries', 'edit')
  submitAuthenticatedReturnNewOffer(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubmitAuthenticatedReturnNewOfferDto,
  ) {
    return this.inquiriesService.submitAuthenticatedReturnNewOffer(
      id,
      body,
      req.user,
    );
  }

  @Post(':id/consignment-price')
  @RequireFeature('inquiries', 'edit')
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  updateConsignmentPrice(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('offerPrice') offerPrice: string,
    @UploadedFile() proof: MulterFile | undefined,
  ) {
    return this.inquiriesService.updateConsignmentPrice(
      id,
      offerPrice,
      proof,
      req.user,
    );
  }

  @Post(':id/contract-renewal')
  @RequireFeature('inquiries', 'edit')
  renewContract(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubmitAuthenticatedReturnNewOfferDto,
  ) {
    return this.inquiriesService.renewContract(id, body, req.user);
  }

  @Post(':id/contract-renewal/cancel')
  @RequireFeature('inquiries', 'edit')
  cancelContractRenewal(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inquiriesService.cancelContractRenewal(id, req.user);
  }

  @Patch(':id/notes')
  @RequireFeature('inquiries', 'edit')
  updateNotes(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateInquiryNotesDto,
  ) {
    return this.inquiriesService.updateNotes(id, body, req.user);
  }

  @Patch(':id/reauthentication-notes')
  @RequireFeature('inquiries', 'edit')
  updateReauthenticationNotes(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateReauthenticationNotesDto,
  ) {
    return this.inquiriesService.updateReauthenticationNotes(
      id,
      body,
      req.user,
    );
  }

  @Post(':id/third-party-payment-proof')
  @RequireFeature('inquiries', 'edit')
  @UseInterceptors(
    FilesInterceptor('photos', 20, {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  uploadThirdPartyPaymentProof(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: MulterFile[],
  ) {
    return this.inquiriesService.uploadThirdPartyPaymentProof(
      id,
      files,
      req.user,
    );
  }

  @Post(':id/third-party-payment-paid')
  @RequireFeature('payment-verification', 'edit')
  markThirdPartyPaymentPaid(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inquiriesService.markThirdPartyAuthenticationFeePaid(
      id,
      req.user,
    );
  }
}
