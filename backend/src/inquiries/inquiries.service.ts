import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Between, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { MailService } from '../mail/mail.service';
import { ConsignmentScheduleItem } from '../consignment-schedules/entities/consignment-schedule.entities';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { ItemAuthentication } from '../inventory/entities/item-authentication.entity';
import { InventoryService } from '../inventory/inventory.service';
import { InquiryStatus } from '../enums/inquiry-status.enum';
import { JwtUser } from '../auth/jwt-user';
import { CONTRACT_EXPIRATION_DAYS_KEY } from '../settings/consignment-setting-keys';
import { Setting } from '../settings/entities/setting.entity';
import {
  InquiryAuditService,
  cloneInquiryForAudit,
} from './inquiry-audit.service';
import { SubmitAuthenticatedReturnNewOfferDto } from './dto/submit-authenticated-return-new-offer.dto';
import { UpdateInquiryNotesDto } from './dto/update-inquiry-notes.dto';
import { UpdateReauthenticationNotesDto } from './dto/update-reauthentication-notes.dto';
import { SubmitOfferDto } from './dto/submit-offer.dto';
import { ConfirmOfferDto } from './dto/confirm-offer.dto';
import { SubmitConsignmentInquiryDto } from './dto/submit-consignment-inquiry.dto';
import { SubmitWalkInConsignmentInquiryDto } from './dto/submit-walk-in-consignment-inquiry.dto';
import {
  ClientOfferConfirmationData,
  Inquiry,
  InquiryItemSnapshot,
} from './entities/inquiry.entity';
import type { MulterFile } from './multer-file.type';
import { S3StorageService } from './s3-storage.service';
import { CONSIGNMENT_COORDINATOR_POSITION } from '../notifications/notification.constants';
import { NotificationsService } from '../notifications/notifications.service';

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m === 'image/jpeg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/heic' || m === 'image/heif') return 'heic';
  return 'bin';
}

const MAX_AUTH_RETURN_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_AUTH_RETURN_PHOTOS = 20;

function parseImageDataUrl(
  dataUrl: string,
): { buffer: Buffer; mime: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl.trim());
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!ALLOWED_IMAGE_MIMES.has(mime)) return null;
  try {
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length === 0 || buffer.length > MAX_AUTH_RETURN_PHOTO_BYTES) {
      return null;
    }
    return { buffer, mime };
  } catch {
    return null;
  }
}

/** UTC calendar day bounds for `d`. */
function utcDayRange(d: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  return { start, end };
}

/** Lock key for pg_advisory_xact_lock (one distinct value per UTC calendar day). */
function utcDayLockKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * INQ-YYYY-MMDD-NN — NN is the 1-based index of inquiries created that UTC day.
 * Sequence is padded to at least 2 digits.
 */
function formatInquirySku(ref: Date, sequence: number): string {
  const y = ref.getUTCFullYear();
  const mm = String(ref.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ref.getUTCDate()).padStart(2, '0');
  const mmdd = `${mm}${dd}`;
  const seq =
    sequence < 100 ? String(sequence).padStart(2, '0') : String(sequence);
  return `INQ-${y}-${mmdd}-${seq}`;
}

function itemLabelFromSnapshot(
  snapshot: InquiryItemSnapshot | null | undefined,
): string {
  if (!snapshot?.form) return 'Item';
  const form = snapshot.form as { brand?: string; itemModel?: string };
  const brand = (form.brand ?? '').trim();
  const model = (form.itemModel ?? '').trim();
  if (!brand && !model) return 'Item';
  if (!brand) return model;
  if (!model) return brand;
  return `${brand} — ${model}`;
}

/** Brand + model for transactional copy (e.g. email); empty string when missing. */
function brandAndModelForEmail(
  snapshot: InquiryItemSnapshot | null | undefined,
): string {
  if (!snapshot?.form) return '';
  const form = snapshot.form as { brand?: string; itemModel?: string };
  const brand = (form.brand ?? '').trim();
  const model = (form.itemModel ?? '').trim();
  if (!brand && !model) return '';
  if (!brand) return model;
  if (!model) return brand;
  return `${brand} ${model}`;
}

function snapshotFormString(
  form: Record<string, unknown>,
  key: string,
): string {
  const v = form[key];
  if (v == null) return '';
  return String(v).trim();
}

/** `YYYY-MM-DD` for API JSON, or null when unset. */
function inquiryDateOnlyToIso(
  d: Date | string | null | undefined,
): string | null {
  if (d == null) return null;
  if (typeof d === 'string') {
    const day = d.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  }
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export type StaffInquiryRow = {
  id: string;
  sku: string;
  itemLabel: string;
  status: InquiryStatus;
  createdAt: Date;
  consignorName: string;
  consignorEmail: string;
  consignorPhone: string;
  brand: string;
  category: string;
  itemModel: string;
  serialNumber: string;
  condition: string;
  inclusions: string;
  consignmentSellingPrice: string;
  directPurchaseSellingPrice: string;
  consentDirectPurchase: boolean;
  consentPriceNomination: boolean;
  photoCount: number;
  offerTransactionType: 'consignment' | 'direct_purchase' | null;
  offerPrice: string | null;
  clientOfferConfirmation: ClientOfferConfirmationView | null;
  notes: string | null;
  isWalkIn: boolean;
  walkInBranch: string | null;
  contractStartDate: string | null;
  contractExpirationDate: string | null;
};

/** Client/staff API shape (public URL for signature image). */
export type ClientOfferConfirmationView = {
  paymentMethod: ClientOfferConfirmationData['paymentMethod'];
  bankDetails: ClientOfferConfirmationData['bankDetails'];
  signatureUrl: string;
};

export type StaffInquiryDetail = StaffInquiryRow & {
  updatedAt: Date;
  /** Set when an `inventory_items` row links to this inquiry (`inquiry_id`). */
  linkedInventoryItemId: string | null;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
    images: Array<{ key: string; url: string }>;
  };
  /** Present when status is authenticated for renegotiation or authenticated new offer (coordinator review). */
  authenticatedReturnDetail?: {
    authenticationSummary: Array<{
      metric: string;
      metricStatus: string | null;
      notes: string | null;
    }>;
    priceRangeMin: string | null;
    priceRangeMax: string | null;
    returnReasons: string | null;
    returnPhotoUrls: string[];
  };
  /**
   * When in 3rd party payment flow: why re-authentication was requested (see `authenticated_requested_for_reauthentication` / legacy `authenticated_for_3rd_party`).
   */
  thirdPartyReauthenticationReasons: string | null;
  thirdPartyPaymentProofUrls: string[];
  /** Issue photos from authenticator when 3rd party re-auth was requested. */
  thirdPartyIssuePhotoUrls: string[];
  /** Staff notes visible to consignor during third-party reauthentication (`item_authentication`). */
  thirdPartyReauthenticationNotes: string | null;
};

/** When status is for_delivery_scheduled, schedule row from staff calendar. */
export type ClientDeliveryScheduleInfo = {
  deliveryDate: string;
  modeOfTransfer: string;
};

/** Client-facing inquiry detail (no internal staff notes). */
export type ClientInquiryDetail = Omit<StaffInquiryRow, 'notes'> & {
  updatedAt: Date;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
    images: Array<{ key: string; url: string }>;
  };
  /** Present when linked to a delivery schedule (for_delivery_scheduled). */
  deliverySchedule: ClientDeliveryScheduleInfo | null;
  /**
   * When in 3rd party payment flow: why re-authentication was requested.
   */
  thirdPartyReauthenticationReasons: string | null;
  thirdPartyPaymentProofUrls: string[];
  thirdPartyIssuePhotoUrls: string[];
  thirdPartyReauthenticationNotes: string | null;
};

@Injectable()
export class InquiriesService {
  private readonly logger = new Logger(InquiriesService.name);

  constructor(
    @InjectRepository(Inquiry)
    private readonly inquiriesRepo: Repository<Inquiry>,
    @InjectRepository(InventoryItem)
    private readonly inventoryItemRepo: Repository<InventoryItem>,
    @InjectRepository(ItemAuthentication)
    private readonly itemAuthRepo: Repository<ItemAuthentication>,
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
    @InjectRepository(ConsignmentScheduleItem)
    private readonly scheduleItemRepo: Repository<ConsignmentScheduleItem>,
    @InjectRepository(Setting)
    private readonly settingsRepo: Repository<Setting>,
    private readonly s3: S3StorageService,
    private readonly inquiryAudit: InquiryAuditService,
    @Inject(forwardRef(() => InventoryService))
    private readonly inventoryService: InventoryService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Client portal URL for this inquiry (consignor reviews / confirms offer). */
  private consignorInquiryUrl(inquiryId: string): string {
    const origin = this.config
      .get<string>('FRONTEND_ORIGIN', 'http://localhost:5173')
      .replace(/\/$/, '');
    return `${origin}/consignments/${inquiryId}`;
  }

  /**
   * Consignor may owe the 3rd party auth fee: initial request, or legacy row still in the paid pipeline.
   */
  private inquiryIsInThirdPartyPaymentFlow(status: InquiryStatus): boolean {
    return (
      status === InquiryStatus.AUTHENTICATED_REQUESTED_FOR_REAUTHENTICATION ||
      status === InquiryStatus.AUTHENTICATED_FOR_3RD_PARTY
    );
  }

  private notifyConsignorOfferEmail(
    inquiryId: string,
    consignor: Client | null | undefined,
  ): void {
    if (!consignor?.email?.trim()) {
      return;
    }
    if (!this.mail.isConfigured()) {
      this.logger.debug(
        'MAIL_* not configured; skipping consignor offer email',
      );
      return;
    }
    const firstName = consignor.firstName?.trim() || 'there';
    const viewOfferUrl = this.consignorInquiryUrl(inquiryId);
    void this.mail
      .sendConsignorInquiryOfferAvailable({
        to: consignor.email.trim(),
        firstName,
        viewOfferUrl,
      })
      .catch((err: unknown) => {
        this.logger.error('Failed to send consignor offer email', err);
      });
  }

  private notifyCoordinatorsConsignorConfirmedOffer(inquiry: {
    id: string;
    sku: string;
  }): void {
    void this.notifications
      .notify({
        message: `The consignor confirmed the offer for inquiry ${inquiry.sku}.`,
        receiverRole: CONSIGNMENT_COORDINATOR_POSITION,
        inquiryId: inquiry.id,
      })
      .catch((err: unknown) => {
        this.logger.error(
          'Failed to notify coordinators of offer confirmation',
          err,
        );
      });
  }

  /**
   * Invoked from inventory when an item is moved into the 3rd party re-auth / payment flow.
   * Notifies consignment coordinators in-app; emails the consignor when mail is configured.
   */
  async onInquirySentForThirdPartyAuthentication(
    inquiryId: string,
  ): Promise<void> {
    const r = await this.inquiriesRepo.findOne({
      where: { id: inquiryId },
      relations: { consignor: true },
    });
    if (!r) {
      this.logger.warn(
        `Inquiry ${inquiryId} not found for 3rd party auth notifications`,
      );
      return;
    }
    void this.notifications
      .notify({
        message: `Inquiry ${r.sku} was requested for 3rd party authentication.`,
        receiverRole: CONSIGNMENT_COORDINATOR_POSITION,
        inquiryId: r.id,
      })
      .catch((err: unknown) => {
        this.logger.error(
          'Failed to notify coordinators of 3rd party authentication',
          err,
        );
      });

    const c = r.consignor;
    if (!c?.email?.trim()) {
      return;
    }
    if (!this.mail.isConfigured()) {
      this.logger.debug(
        'MAIL_* not configured; skipping 3rd party consignor email',
      );
      return;
    }
    const firstName = c.firstName?.trim() || 'there';
    const viewInquiryUrl = this.consignorInquiryUrl(r.id);
    const itemBrandAndModel = brandAndModelForEmail(r.itemSnapshot);
    void this.mail
      .sendConsignorThirdPartyAuthNotice({
        to: c.email.trim(),
        firstName,
        itemBrandAndModel,
        viewInquiryUrl,
      })
      .catch((err: unknown) => {
        this.logger.error(
          'Failed to send 3rd party authentication consignor email',
          err,
        );
      });
  }

  private async loadDeliveryScheduleForInquiry(
    inquiryId: string,
    status: InquiryStatus,
  ): Promise<ClientDeliveryScheduleInfo | null> {
    if (status !== InquiryStatus.FOR_DELIVERY_SCHEDULED) {
      return null;
    }
    const row = await this.scheduleItemRepo.findOne({
      where: { inquiry: { id: inquiryId } },
      relations: { consignmentSchedule: true },
    });
    const sch = row?.consignmentSchedule;
    if (!sch || sch.type !== 'delivery') {
      return null;
    }
    return {
      deliveryDate: sch.deliveryDate.toISOString(),
      modeOfTransfer: sch.modeOfTransfer,
    };
  }

  /** Builds API view from `preferred_payment_method`, `offer_signature_key`, and client bank fields. */
  private mapClientOfferConfirmationForApi(
    r: Inquiry,
  ): ClientOfferConfirmationView | null {
    if (!r.preferredPaymentMethod || !r.offerSignatureKey) {
      return null;
    }
    const consignor = r.consignor;
    let bankDetails: ClientOfferConfirmationData['bankDetails'] = null;
    if (r.preferredPaymentMethod === 'direct_deposit' && consignor) {
      const num = consignor.bankAccountNumber?.trim();
      const name = consignor.bankAccountName?.trim();
      const code = consignor.bankCode?.trim();
      const branch = consignor.bankBranch?.trim();
      if (num && name && code && branch) {
        bankDetails = {
          accountNumber: num,
          accountName: name,
          bank: code as 'bdo' | 'bpi' | 'other',
          branch,
        };
      }
    }
    return {
      paymentMethod: r.preferredPaymentMethod,
      bankDetails,
      signatureUrl: this.s3.getPublicUrl(r.offerSignatureKey),
    };
  }

  private mapInquiryToStaffRow(r: Inquiry): StaffInquiryRow {
    const form = (r.itemSnapshot?.form ?? {}) as Record<string, unknown>;
    const c = r.consignor;
    const name = c ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() : '';
    return {
      id: r.id,
      sku: r.sku,
      itemLabel: itemLabelFromSnapshot(r.itemSnapshot),
      status: r.status,
      createdAt: r.createdAt,
      consignorName: name || '—',
      consignorEmail: c?.email?.trim() ?? '—',
      consignorPhone: c?.contactNumber?.trim() ?? '—',
      brand: snapshotFormString(form, 'brand') || '—',
      category: snapshotFormString(form, 'category') || '—',
      itemModel: snapshotFormString(form, 'itemModel') || '—',
      serialNumber: snapshotFormString(form, 'serialNumber') || '—',
      condition: snapshotFormString(form, 'condition') || '—',
      inclusions: snapshotFormString(form, 'inclusions') || '—',
      consignmentSellingPrice:
        snapshotFormString(form, 'consignmentSellingPrice') || '—',
      directPurchaseSellingPrice:
        snapshotFormString(form, 'directPurchaseSellingPrice') || '—',
      consentDirectPurchase: Boolean(form.consentDirectPurchase),
      consentPriceNomination: Boolean(form.consentPriceNomination),
      photoCount: Array.isArray(r.itemSnapshot?.images)
        ? r.itemSnapshot.images.length
        : 0,
      offerTransactionType: r.offerTransactionType ?? null,
      offerPrice:
        r.offerPrice != null && r.offerPrice !== ''
          ? String(r.offerPrice)
          : null,
      clientOfferConfirmation: this.mapClientOfferConfirmationForApi(r),
      notes: (() => {
        if (r.notes == null) return null;
        const t = String(r.notes).trim();
        return t === '' ? null : t;
      })(),
      isWalkIn: Boolean(r.isWalkIn),
      walkInBranch:
        r.walkInBranch != null && String(r.walkInBranch).trim() !== ''
          ? String(r.walkInBranch).trim()
          : null,
      contractStartDate: inquiryDateOnlyToIso(r.contractStartDate),
      contractExpirationDate: inquiryDateOnlyToIso(r.contractExpirationDate),
    };
  }

  /** Staff list: inquiry row + consignor + item snapshot fields for triage. */
  async findAllForStaff(statusFilter?: string): Promise<StaffInquiryRow[]> {
    const where =
      statusFilter != null && String(statusFilter).trim() !== ''
        ? { status: this.parseInquiryStatusFilter(statusFilter) }
        : {};
    const rows = await this.inquiriesRepo.find({
      where,
      order: { createdAt: 'DESC' },
      relations: { consignor: true },
    });
    return rows.map((r) => this.mapInquiryToStaffRow(r));
  }

  private parseInquiryStatusFilter(raw: string): InquiryStatus {
    const v = raw.trim().toLowerCase();
    const allowed = Object.values(InquiryStatus) as string[];
    if (!allowed.includes(v)) {
      throw new BadRequestException(`Invalid status filter: ${raw}`);
    }
    return v as InquiryStatus;
  }

  /** Full inquiry with snapshot and image URLs (refreshed from stored keys). */
  async findOneForStaff(id: string): Promise<StaffInquiryDetail> {
    const r = await this.inquiriesRepo.findOne({
      where: { id },
      relations: { consignor: true },
    });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    const base = this.mapInquiryToStaffRow(r);
    const rawImages = Array.isArray(r.itemSnapshot?.images)
      ? r.itemSnapshot.images
      : [];
    const images = rawImages.map((img) => ({
      key: img.key,
      url: this.s3.getPublicUrl(img.key),
    }));
    const linkedInv = await this.inventoryItemRepo.findOne({
      where: { inquiryId: r.id },
      select: { id: true },
    });

    const thirdPartyReauthenticationReasons =
      this.inquiryIsInThirdPartyPaymentFlow(r.status) &&
      r.thirdPartyReauthenticationReasons != null &&
      String(r.thirdPartyReauthenticationReasons).trim() !== ''
        ? String(r.thirdPartyReauthenticationReasons).trim()
        : null;
    const thirdPartyPaymentProofUrls =
      this.inquiryIsInThirdPartyPaymentFlow(r.status) &&
      Array.isArray(r.thirdPartyPaymentProofKeys)
        ? r.thirdPartyPaymentProofKeys
            .filter(
              (k): k is string => typeof k === 'string' && k.trim() !== '',
            )
            .map((k) => this.s3.getPublicUrl(k))
        : [];

    const thirdPartyIssuePhotoUrls =
      this.inquiryIsInThirdPartyPaymentFlow(r.status) &&
      Array.isArray(r.returnPhotos)
        ? r.returnPhotos
            .filter(
              (k): k is string => typeof k === 'string' && k.trim() !== '',
            )
            .map((k) => this.s3.getPublicUrl(k))
        : [];

    let thirdPartyReauthenticationNotes: string | null = null;
    if (linkedInv?.id && this.inquiryIsInThirdPartyPaymentFlow(r.status)) {
      const authRow = await this.itemAuthRepo.findOne({
        where: { inventoryItemId: linkedInv.id },
        select: { reauthenticationNotes: true },
      });
      const raw = authRow?.reauthenticationNotes;
      thirdPartyReauthenticationNotes =
        raw != null && String(raw).trim() !== '' ? String(raw).trim() : null;
    }

    const detail: StaffInquiryDetail = {
      ...base,
      updatedAt: r.updatedAt,
      linkedInventoryItemId: linkedInv?.id ?? null,
      itemSnapshot: {
        clientItemId: r.itemSnapshot.clientItemId,
        form: (r.itemSnapshot.form ?? {}) as Record<string, unknown>,
        images,
      },
      thirdPartyReauthenticationReasons,
      thirdPartyPaymentProofUrls,
      thirdPartyIssuePhotoUrls,
      thirdPartyReauthenticationNotes,
    };
    if (
      r.status === InquiryStatus.AUTHENTICATED_RETURNED ||
      r.status === InquiryStatus.AUTHENTICATED_NEW_OFFER
    ) {
      const authenticationSummary =
        await this.inventoryService.getAuthenticationSummaryForInquiry(r.id);
      const rawKeys = Array.isArray(r.returnPhotos)
        ? r.returnPhotos.filter(
            (k): k is string => typeof k === 'string' && k.trim() !== '',
          )
        : [];
      detail.authenticatedReturnDetail = {
        authenticationSummary,
        priceRangeMin:
          r.priceRangeMin != null && String(r.priceRangeMin).trim() !== ''
            ? String(r.priceRangeMin)
            : null,
        priceRangeMax:
          r.priceRangeMax != null && String(r.priceRangeMax).trim() !== ''
            ? String(r.priceRangeMax)
            : null,
        returnReasons:
          r.returnReasons != null && String(r.returnReasons).trim() !== ''
            ? String(r.returnReasons).trim()
            : null,
        returnPhotoUrls: rawKeys.map((key) => this.s3.getPublicUrl(key)),
      };
    }
    return detail;
  }

  async findMineForClient(user: JwtUser): Promise<
    Array<{
      id: string;
      sku: string;
      itemLabel: string;
      status: InquiryStatus;
      createdAt: Date;
      offerTransactionType: 'consignment' | 'direct_purchase' | null;
      offerPrice: string | null;
    }>
  > {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }
    const rows = await this.inquiriesRepo.find({
      where: { consignorId: client.id },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      itemLabel: itemLabelFromSnapshot(r.itemSnapshot),
      status: r.status,
      createdAt: r.createdAt,
      offerTransactionType: r.offerTransactionType ?? null,
      offerPrice:
        r.offerPrice != null && r.offerPrice !== ''
          ? String(r.offerPrice)
          : null,
    }));
  }

  /** Single inquiry for the logged-in consignor (excludes staff-only notes). */
  async findOneForClient(
    user: JwtUser,
    id: string,
  ): Promise<ClientInquiryDetail> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }
    const r = await this.inquiriesRepo.findOne({
      where: { id, consignorId: client.id },
      relations: { consignor: true },
    });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    const base = this.mapInquiryToStaffRow(r);
    const { notes: _notes, ...rest } = base;
    const rawImages = Array.isArray(r.itemSnapshot?.images)
      ? r.itemSnapshot.images
      : [];
    const images = rawImages.map((img) => ({
      key: img.key,
      url: this.s3.getPublicUrl(img.key),
    }));
    const deliverySchedule = await this.loadDeliveryScheduleForInquiry(
      r.id,
      r.status,
    );
    const thirdPartyReauthenticationReasons =
      this.inquiryIsInThirdPartyPaymentFlow(r.status) &&
      r.thirdPartyReauthenticationReasons != null &&
      String(r.thirdPartyReauthenticationReasons).trim() !== ''
        ? String(r.thirdPartyReauthenticationReasons).trim()
        : null;

    const thirdPartyPaymentProofUrls =
      this.inquiryIsInThirdPartyPaymentFlow(r.status) &&
      Array.isArray(r.thirdPartyPaymentProofKeys)
        ? r.thirdPartyPaymentProofKeys
            .filter(
              (k): k is string => typeof k === 'string' && k.trim() !== '',
            )
            .map((k) => this.s3.getPublicUrl(k))
        : [];
    const thirdPartyIssuePhotoUrls =
      this.inquiryIsInThirdPartyPaymentFlow(r.status) &&
      Array.isArray(r.returnPhotos)
        ? r.returnPhotos
            .filter(
              (k): k is string => typeof k === 'string' && k.trim() !== '',
            )
            .map((k) => this.s3.getPublicUrl(k))
        : [];
    const linkedInvClient = await this.inventoryItemRepo.findOne({
      where: { inquiryId: r.id },
      select: { id: true },
    });
    let thirdPartyReauthenticationNotes: string | null = null;
    if (
      linkedInvClient?.id &&
      this.inquiryIsInThirdPartyPaymentFlow(r.status)
    ) {
      const authRow = await this.itemAuthRepo.findOne({
        where: { inventoryItemId: linkedInvClient.id },
        select: { reauthenticationNotes: true },
      });
      const raw = authRow?.reauthenticationNotes;
      thirdPartyReauthenticationNotes =
        raw != null && String(raw).trim() !== '' ? String(raw).trim() : null;
    }
    return {
      ...rest,
      updatedAt: r.updatedAt,
      itemSnapshot: {
        clientItemId: r.itemSnapshot.clientItemId,
        form: (r.itemSnapshot.form ?? {}) as Record<string, unknown>,
        images,
      },
      deliverySchedule,
      thirdPartyReauthenticationReasons,
      thirdPartyPaymentProofUrls,
      thirdPartyIssuePhotoUrls,
      thirdPartyReauthenticationNotes,
    };
  }

  async uploadThirdPartyPaymentProof(
    inquiryId: string,
    files: MulterFile[] | undefined,
    user: JwtUser,
  ): Promise<StaffInquiryDetail> {
    if (!files?.length) {
      throw new BadRequestException('At least one image file is required');
    }
    const maxPerRequest = 20;
    if (files.length > maxPerRequest) {
      throw new BadRequestException(
        `At most ${maxPerRequest} images per request`,
      );
    }
    const r = await this.inquiriesRepo.findOne({ where: { id: inquiryId } });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    if (
      r.status !== InquiryStatus.AUTHENTICATED_REQUESTED_FOR_REAUTHENTICATION
    ) {
      throw new BadRequestException(
        'Proof of payment can only be uploaded while reauthentication payment is pending',
      );
    }
    const existing = Array.isArray(r.thirdPartyPaymentProofKeys)
      ? [...r.thirdPartyPaymentProofKeys]
      : [];
    for (const file of files) {
      const mime = file.mimetype?.toLowerCase() ?? '';
      if (!ALLOWED_IMAGE_MIMES.has(mime)) {
        throw new BadRequestException(
          `Unsupported image type: ${file.mimetype || 'unknown'}`,
        );
      }
      const ext = extFromMime(mime);
      const key = `inquiries/${inquiryId}/third-party-payment/${randomUUID()}.${ext}`;
      await this.s3.putObject(key, file.buffer, mime);
      existing.push(key);
    }
    const before = cloneInquiryForAudit(r);
    r.thirdPartyPaymentProofKeys = existing;
    r.updatedById = user.userId;
    await this.inquiriesRepo.save(r);
    const label = await this.inquiryAudit.staffActorLabel(user.userId);
    await this.inquiryAudit.recordDiff(inquiryId, before, r, {
      userId: user.userId,
      label,
    });
    return this.findOneForStaff(inquiryId);
  }

  async markThirdPartyAuthenticationFeePaid(
    inquiryId: string,
    user: JwtUser,
  ): Promise<StaffInquiryDetail> {
    const r0 = await this.inquiriesRepo.findOne({ where: { id: inquiryId } });
    if (!r0) {
      throw new NotFoundException('Inquiry not found');
    }
    if (
      r0.status !== InquiryStatus.AUTHENTICATED_REQUESTED_FOR_REAUTHENTICATION
    ) {
      throw new BadRequestException(
        'Inquiry is not waiting for reauthentication payment',
      );
    }
    if (
      !Array.isArray(r0.thirdPartyPaymentProofKeys) ||
      r0.thirdPartyPaymentProofKeys.length === 0
    ) {
      throw new BadRequestException(
        'Upload proof of payment before marking this inquiry as paid',
      );
    }
    const notifyPayload = await this.inquiriesRepo.manager.transaction(
      async (em) => {
        const r = await em.findOne(Inquiry, { where: { id: inquiryId } });
        if (!r) {
          throw new NotFoundException('Inquiry not found');
        }
        const inv = await em.findOne(InventoryItem, {
          where: { inquiryId },
        });
        if (!inv) {
          throw new BadRequestException(
            'No linked inventory item was found for this inquiry.',
          );
        }
        const auth = await em.findOneBy(ItemAuthentication, {
          inventoryItemId: inv.id,
        });
        const before = cloneInquiryForAudit(r);
        r.status = InquiryStatus.AUTHENTICATED_FOR_3RD_PARTY;
        r.updatedById = user.userId;
        await em.save(r);
        inv.status = 'Authenticated: For 3rd party authentication';
        inv.updatedById = user.userId;
        await em.save(inv);
        if (auth) {
          auth.authenticationStatus = 'For 3rd party authentication';
          auth.updatedById = user.userId;
          await em.save(auth);
        }
        const label = await this.inquiryAudit.staffActorLabel(user.userId);
        await this.inquiryAudit.recordDiff(inquiryId, before, r, {
          userId: user.userId,
          label,
        });
        return {
          inventorySku: inv.sku,
          assignedAuthenticatorEmployeeId: auth?.assignedToId ?? null,
        };
      },
    );
    if (notifyPayload.assignedAuthenticatorEmployeeId) {
      void this.notifications
        .notify({
          message: `Inventory item ${notifyPayload.inventorySku} is ready for 3rd party authentication.`,
          receiverId: notifyPayload.assignedAuthenticatorEmployeeId,
          inquiryId,
        })
        .catch((err: unknown) => {
          this.logger.error(
            'Failed to notify assigned authenticator for 3rd party authentication',
            err,
          );
        });
    }
    return this.findOneForStaff(inquiryId);
  }

  /** Consignor withdraws the inquiry; only while still active (not terminal). */
  async cancelInquiryForClient(
    user: JwtUser,
    id: string,
  ): Promise<ClientInquiryDetail> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }
    const r = await this.inquiriesRepo.findOne({
      where: { id, consignorId: client.id },
    });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    if (
      r.status !== InquiryStatus.PENDING &&
      r.status !== InquiryStatus.FOR_OFFER_CONFIRMATION
    ) {
      throw new BadRequestException(
        'Only active inquiries can be cancelled by the consignor',
      );
    }
    const before = cloneInquiryForAudit(r);
    r.status = InquiryStatus.CANCELLED;
    await this.inquiriesRepo.save(r);
    await this.inquiryAudit.recordDiff(
      r.id,
      before,
      r,
      this.inquiryAudit.consignorActor(user.userId),
    );
    return this.findOneForClient(user, id);
  }

  /** Append images to an existing inquiry (non-terminal statuses only). */
  async appendInquiryPhotosForClient(
    user: JwtUser,
    inquiryId: string,
    files: MulterFile[] | undefined,
  ): Promise<ClientInquiryDetail> {
    if (!files?.length) {
      throw new BadRequestException('At least one image file is required');
    }
    const maxPerRequest = 20;
    if (files.length > maxPerRequest) {
      throw new BadRequestException(
        `At most ${maxPerRequest} images per request`,
      );
    }

    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }
    const r = await this.inquiriesRepo.findOne({
      where: { id: inquiryId, consignorId: client.id },
    });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    if (InquiriesService.terminalInquiryStatuses.has(r.status)) {
      throw new BadRequestException(
        'Photos can only be added while the inquiry is active',
      );
    }

    const existing = Array.isArray(r.itemSnapshot?.images)
      ? [...r.itemSnapshot.images]
      : [];

    for (const file of files) {
      const mime = file.mimetype?.toLowerCase() ?? '';
      if (!ALLOWED_IMAGE_MIMES.has(mime)) {
        throw new BadRequestException(
          `Unsupported image type: ${file.mimetype || 'unknown'}`,
        );
      }
      const ext = extFromMime(mime);
      const key = `inquiries/${inquiryId}/${randomUUID()}.${ext}`;
      await this.s3.putObject(key, file.buffer, mime);
      existing.push({ key, url: this.s3.getPublicUrl(key) });
    }

    r.itemSnapshot = {
      clientItemId: r.itemSnapshot.clientItemId,
      form: r.itemSnapshot.form ?? {},
      images: existing,
    };
    await this.inquiriesRepo.save(r);
    return this.findOneForClient(user, inquiryId);
  }

  /** Consignor confirms the staff offer, payment preference, and signature image. */
  async confirmOfferForClient(
    user: JwtUser,
    inquiryId: string,
    payloadRaw: string | undefined,
    signatureFile: MulterFile | undefined,
  ): Promise<ClientInquiryDetail> {
    if (payloadRaw == null || payloadRaw.trim() === '') {
      throw new BadRequestException('Missing payload');
    }
    if (!signatureFile?.buffer?.length) {
      throw new BadRequestException('Signature image is required');
    }

    let dto: ConfirmOfferDto;
    try {
      dto = plainToInstance(ConfirmOfferDto, JSON.parse(payloadRaw) as object, {
        enableImplicitConversion: true,
      });
      await validateOrReject(dto);
    } catch {
      throw new BadRequestException('Invalid offer confirmation payload');
    }

    const mime = signatureFile.mimetype?.toLowerCase() ?? '';
    if (!ALLOWED_IMAGE_MIMES.has(mime)) {
      throw new BadRequestException(
        `Signature must be an image file (${signatureFile.mimetype || 'unknown'})`,
      );
    }

    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }
    const r = await this.inquiriesRepo.findOne({
      where: { id: inquiryId, consignorId: client.id },
    });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    if (
      r.status !== InquiryStatus.FOR_OFFER_CONFIRMATION &&
      r.status !== InquiryStatus.AUTHENTICATED_NEW_OFFER
    ) {
      throw new BadRequestException(
        'The offer can only be confirmed while it is awaiting your confirmation',
      );
    }
    if (r.offerPrice == null || String(r.offerPrice).trim() === '') {
      throw new BadRequestException('No offer is available to confirm');
    }

    let bankDetails: ClientOfferConfirmationData['bankDetails'] = null;
    if (dto.paymentMethod === 'direct_deposit') {
      if (!dto.bankDetails) {
        throw new BadRequestException(
          'Bank details are required for direct deposit',
        );
      }
      bankDetails = {
        accountNumber: dto.bankDetails.accountNumber.trim(),
        accountName: dto.bankDetails.accountName.trim(),
        bank: dto.bankDetails.bank,
        branch: dto.bankDetails.branch.trim(),
      };
    }

    const ext = extFromMime(mime);
    const signatureKey = `inquiries/${inquiryId}/offer-signature-${randomUUID()}.${ext}`;
    await this.s3.putObject(signatureKey, signatureFile.buffer, mime);

    if (dto.paymentMethod === 'direct_deposit' && bankDetails) {
      client.bankAccountNumber = bankDetails.accountNumber;
      client.bankAccountName = bankDetails.accountName;
      client.bankCode = bankDetails.bank;
      client.bankBranch = bankDetails.branch;
    } else {
      client.bankAccountNumber = null;
      client.bankAccountName = null;
      client.bankCode = null;
      client.bankBranch = null;
    }
    await this.clientsRepo.save(client);

    const before = cloneInquiryForAudit(r);
    r.preferredPaymentMethod = dto.paymentMethod;
    r.offerSignatureKey = signatureKey;

    const isAuthenticatedNewOfferConfirm =
      r.status === InquiryStatus.AUTHENTICATED_NEW_OFFER;

    if (r.isWalkIn) {
      const branch = r.walkInBranch?.trim();
      if (!branch) {
        throw new BadRequestException(
          'Walk-in inquiry is missing receiving branch',
        );
      }
      await this.inquiriesRepo.manager.transaction(async (em) => {
        const existingInv = await em.findOne(InventoryItem, {
          where: { inquiryId: r.id },
        });
        if (existingInv) {
          if (!isAuthenticatedNewOfferConfirm) {
            throw new BadRequestException(
              'Inventory already exists for this inquiry',
            );
          }
          r.status = InquiryStatus.FOR_PROCESSING;
          await em.save(r);
          await this.inventoryService.finalizeInventoryAfterAuthenticatedNewOfferConfirm(
            em,
            r.id,
            r.offerTransactionType,
          );
          return;
        }
        r.status = InquiryStatus.FOR_PROCESSING;
        await em.save(r);
        await this.inventoryService.createInventoryAndItemAuthenticationForInquiry(
          em,
          r,
          r.itemSnapshot,
          branch,
        );
      });
    } else if (isAuthenticatedNewOfferConfirm) {
      await this.inquiriesRepo.manager.transaction(async (em) => {
        r.status = InquiryStatus.FOR_PROCESSING;
        await em.save(r);
        await this.inventoryService.finalizeInventoryAfterAuthenticatedNewOfferConfirm(
          em,
          r.id,
          r.offerTransactionType,
        );
      });
    } else {
      r.status = InquiryStatus.FOR_DELIVERY;
      await this.inquiriesRepo.save(r);
    }

    if (isAuthenticatedNewOfferConfirm) {
      const withContract = await this.populateContractDatesForInquiry(r.id);
      r.contractStartDate = withContract.contractStartDate;
      r.contractExpirationDate = withContract.contractExpirationDate;
    }

    await this.inquiryAudit.recordDiff(
      r.id,
      before,
      r,
      this.inquiryAudit.consignorActor(user.userId),
    );
    this.notifyCoordinatorsConsignorConfirmedOffer(r);
    return this.findOneForClient(user, inquiryId);
  }

  async submitConsignmentInquiry(
    user: JwtUser,
    payloadRaw: string | undefined,
    files: MulterFile[] | undefined,
  ): Promise<{
    inquiries: Array<{ id: string; sku: string; status: InquiryStatus }>;
  }> {
    if (payloadRaw == null || payloadRaw.trim() === '') {
      throw new BadRequestException('Missing payload');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw) as unknown;
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    const dto = plainToInstance(SubmitConsignmentInquiryDto, parsed, {
      enableImplicitConversion: true,
    });
    try {
      await validateOrReject(dto);
    } catch {
      throw new BadRequestException('Invalid inquiry payload');
    }

    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const expectedFiles = dto.items.reduce((n, it) => n + it.imageCount, 0);
    if (!files || files.length !== expectedFiles) {
      throw new BadRequestException(
        `Expected ${expectedFiles} image file(s), received ${files?.length ?? 0}`,
      );
    }

    let fileIdx = 0;
    const refNow = new Date();

    type Planned = { inquiryId: string; itemSnapshot: InquiryItemSnapshot };
    const planned: Planned[] = [];

    for (let itemIdx = 0; itemIdx < dto.items.length; itemIdx++) {
      const row = dto.items[itemIdx];
      const inquiryId = randomUUID();
      const images: InquiryItemSnapshot['images'] = [];

      for (let j = 0; j < row.imageCount; j++) {
        const file = files[fileIdx++];
        const mime = file.mimetype?.toLowerCase() ?? '';
        if (!ALLOWED_IMAGE_MIMES.has(mime)) {
          throw new BadRequestException(
            `Unsupported image type: ${file.mimetype || 'unknown'}`,
          );
        }
        const ext = extFromMime(mime);
        const key = `inquiries/${inquiryId}/${randomUUID()}.${ext}`;
        await this.s3.putObject(key, file.buffer, mime);
        images.push({ key, url: this.s3.getPublicUrl(key) });
      }

      planned.push({
        inquiryId,
        itemSnapshot: {
          clientItemId: row.clientItemId,
          form: { ...row.form } as unknown as Record<string, unknown>,
          images,
        },
      });
    }

    return await this.inquiriesRepo.manager
      .transaction(async (em) => {
        await em.query(
          `SELECT pg_advisory_xact_lock(hashtext($1::text)::bigint)`,
          [utcDayLockKey(refNow)],
        );

        const bounds = utcDayRange(refNow);
        const countToday = await em.count(Inquiry, {
          where: { createdAt: Between(bounds.start, bounds.end) },
        });

        const results: Array<{
          id: string;
          sku: string;
          status: InquiryStatus;
        }> = [];

        for (let i = 0; i < planned.length; i++) {
          const sku = formatInquirySku(refNow, countToday + i + 1);
          const row = planned[i];
          const inquiry = em.create(Inquiry, {
            id: row.inquiryId,
            consignorId: client.id,
            sku,
            status: InquiryStatus.PENDING,
            itemSnapshot: row.itemSnapshot,
            createdById: null,
            updatedById: null,
          });
          await em.save(inquiry);
          results.push({ id: inquiry.id, sku, status: inquiry.status });
        }

        await em.update(
          Client,
          { id: client.id },
          { consignmentFormSnapshot: null },
        );

        return { inquiries: results };
      })
      .then((out) => {
        const skus = out.inquiries.map((i) => i.sku).join(', ');
        const text =
          out.inquiries.length === 1
            ? `A client submitted a new consignment inquiry (${skus}).`
            : `A client submitted ${out.inquiries.length} new consignment inquiries: ${skus}.`;
        void this.notifications
          .notify({
            message: text,
            receiverRole: CONSIGNMENT_COORDINATOR_POSITION,
            inquiryId: out.inquiries[0]?.id ?? null,
          })
          .catch((err) => {
            this.logger.error('Failed to notify consignment coordinators', err);
          });
        return out;
      });
  }

  /** Staff creates inquiries for a selected consignor (walk-in); sets walk-in flags. */
  async submitWalkInConsignmentInquiry(
    user: JwtUser,
    payloadRaw: string | undefined,
    files: MulterFile[] | undefined,
  ): Promise<{
    inquiries: Array<{ id: string; sku: string; status: InquiryStatus }>;
  }> {
    if (payloadRaw == null || payloadRaw.trim() === '') {
      throw new BadRequestException('Missing payload');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw) as unknown;
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    const dto = plainToInstance(SubmitWalkInConsignmentInquiryDto, parsed, {
      enableImplicitConversion: true,
    });
    try {
      await validateOrReject(dto);
    } catch {
      throw new BadRequestException('Invalid inquiry payload');
    }

    const client = await this.clientsRepo.findOne({
      where: { id: dto.consignorClientId },
    });
    if (!client) {
      throw new NotFoundException('Consignor client not found');
    }

    const expectedFiles = dto.items.reduce((n, it) => n + it.imageCount, 0);
    if (!files || files.length !== expectedFiles) {
      throw new BadRequestException(
        `Expected ${expectedFiles} image file(s), received ${files?.length ?? 0}`,
      );
    }

    let fileIdx = 0;
    const refNow = new Date();

    type Planned = { inquiryId: string; itemSnapshot: InquiryItemSnapshot };
    const planned: Planned[] = [];

    for (let itemIdx = 0; itemIdx < dto.items.length; itemIdx++) {
      const row = dto.items[itemIdx];
      const inquiryId = randomUUID();
      const images: InquiryItemSnapshot['images'] = [];

      for (let j = 0; j < row.imageCount; j++) {
        const file = files[fileIdx++];
        const mime = file.mimetype?.toLowerCase() ?? '';
        if (!ALLOWED_IMAGE_MIMES.has(mime)) {
          throw new BadRequestException(
            `Unsupported image type: ${file.mimetype || 'unknown'}`,
          );
        }
        const ext = extFromMime(mime);
        const key = `inquiries/${inquiryId}/${randomUUID()}.${ext}`;
        await this.s3.putObject(key, file.buffer, mime);
        images.push({ key, url: this.s3.getPublicUrl(key) });
      }

      planned.push({
        inquiryId,
        itemSnapshot: {
          clientItemId: row.clientItemId,
          form: { ...row.form } as unknown as Record<string, unknown>,
          images,
        },
      });
    }

    return await this.inquiriesRepo.manager.transaction(async (em) => {
      await em.query(
        `SELECT pg_advisory_xact_lock(hashtext($1::text)::bigint)`,
        [utcDayLockKey(refNow)],
      );

      const bounds = utcDayRange(refNow);
      const countToday = await em.count(Inquiry, {
        where: { createdAt: Between(bounds.start, bounds.end) },
      });

      const results: Array<{
        id: string;
        sku: string;
        status: InquiryStatus;
      }> = [];

      for (let i = 0; i < planned.length; i++) {
        const sku = formatInquirySku(refNow, countToday + i + 1);
        const row = planned[i];
        const inquiry = em.create(Inquiry, {
          id: row.inquiryId,
          consignorId: client.id,
          sku,
          status: InquiryStatus.PENDING,
          itemSnapshot: row.itemSnapshot,
          isWalkIn: true,
          walkInBranch: dto.walkInBranch,
          createdById: user.userId,
          updatedById: user.userId,
        });
        await em.save(inquiry);
        results.push({ id: inquiry.id, sku, status: inquiry.status });
      }

      return { inquiries: results };
    });
  }

  private static readonly terminalInquiryStatuses = new Set<InquiryStatus>([
    InquiryStatus.DECLINED,
    InquiryStatus.CANCELLED,
  ]);

  async declineInquiry(id: string, user: JwtUser): Promise<StaffInquiryDetail> {
    const r = await this.inquiriesRepo.findOne({ where: { id } });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    if (InquiriesService.terminalInquiryStatuses.has(r.status)) {
      throw new BadRequestException('This inquiry cannot be declined');
    }
    const before = cloneInquiryForAudit(r);
    r.status = InquiryStatus.DECLINED;
    await this.inquiriesRepo.save(r);
    const label = await this.inquiryAudit.staffActorLabel(user.userId);
    await this.inquiryAudit.recordDiff(id, before, r, {
      userId: user.userId,
      label,
    });
    return this.findOneForStaff(id);
  }

  async submitOffer(
    id: string,
    dto: SubmitOfferDto,
    user: JwtUser,
  ): Promise<StaffInquiryDetail> {
    const r = await this.inquiriesRepo.findOne({
      where: { id },
      relations: { consignor: true },
    });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    if (InquiriesService.terminalInquiryStatuses.has(r.status)) {
      throw new BadRequestException('Cannot submit an offer for this inquiry');
    }
    if (r.status === InquiryStatus.FOR_PROCESSING) {
      throw new BadRequestException(
        'Cannot submit an offer for an inquiry that is in processing',
      );
    }
    if (r.status === InquiryStatus.AUTHENTICATED_RETURNED) {
      throw new BadRequestException(
        'Cannot submit an offer for an inquiry that is pending renegotiation after authentication',
      );
    }
    if (this.inquiryIsInThirdPartyPaymentFlow(r.status)) {
      throw new BadRequestException(
        'Cannot submit an offer for an inquiry that is pending payment for 3rd party authentication',
      );
    }

    const form = (r.itemSnapshot?.form ?? {}) as Record<string, unknown>;
    const consentDirectPurchase = Boolean(form.consentDirectPurchase);
    if (!consentDirectPurchase && dto.transactionType === 'direct_purchase') {
      throw new BadRequestException(
        'Direct purchase is not available for this inquiry',
      );
    }

    const before = cloneInquiryForAudit(r);
    r.offerTransactionType = dto.transactionType;
    r.offerPrice = dto.offerPrice.toFixed(2);
    /** Stay in post–auth renegotiation lane when the coordinator revises the offer. */
    if (r.status !== InquiryStatus.AUTHENTICATED_NEW_OFFER) {
      r.status = InquiryStatus.FOR_OFFER_CONFIRMATION;
    }
    r.preferredPaymentMethod = null;
    r.offerSignatureKey = null;
    await this.inquiriesRepo.save(r);
    const label = await this.inquiryAudit.staffActorLabel(user.userId);
    await this.inquiryAudit.recordDiff(id, before, r, {
      userId: user.userId,
      label,
    });
    this.notifyConsignorOfferEmail(id, r.consignor);
    return this.findOneForStaff(id);
  }

  async submitAuthenticatedReturnNewOffer(
    id: string,
    dto: SubmitAuthenticatedReturnNewOfferDto,
    user: JwtUser,
  ): Promise<StaffInquiryDetail> {
    const r = await this.inquiriesRepo.findOne({
      where: { id },
      relations: { consignor: true },
    });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    if (InquiriesService.terminalInquiryStatuses.has(r.status)) {
      throw new BadRequestException('Cannot update this inquiry');
    }
    if (r.status !== InquiryStatus.AUTHENTICATED_RETURNED) {
      throw new BadRequestException(
        'A new offer can only be created while the inquiry is Authenticated: For renegotiation',
      );
    }

    const before = cloneInquiryForAudit(r);
    r.offerPrice = dto.offerPrice.toFixed(2);
    r.status = InquiryStatus.AUTHENTICATED_NEW_OFFER;
    r.preferredPaymentMethod = null;
    r.offerSignatureKey = null;
    await this.inquiriesRepo.save(r);
    const label = await this.inquiryAudit.staffActorLabel(user.userId);
    await this.inquiryAudit.recordDiff(id, before, r, {
      userId: user.userId,
      label,
    });
    this.notifyConsignorOfferEmail(id, r.consignor);
    return this.findOneForStaff(id);
  }

  async updateNotes(
    id: string,
    dto: UpdateInquiryNotesDto,
    user: JwtUser,
  ): Promise<StaffInquiryDetail> {
    const r = await this.inquiriesRepo.findOne({
      where: { id },
      relations: { consignor: true },
    });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    const before = cloneInquiryForAudit(r);
    const trimmed = dto.notes.trim();
    r.notes = trimmed === '' ? null : trimmed;
    await this.inquiriesRepo.save(r);
    const label = await this.inquiryAudit.staffActorLabel(user.userId);
    await this.inquiryAudit.recordDiff(id, before, r, {
      userId: user.userId,
      label,
    });
    return this.findOneForStaff(id);
  }

  async updateReauthenticationNotes(
    id: string,
    dto: UpdateReauthenticationNotesDto,
    user: JwtUser,
  ): Promise<StaffInquiryDetail> {
    const r = await this.inquiriesRepo.findOne({ where: { id } });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    if (!this.inquiryIsInThirdPartyPaymentFlow(r.status)) {
      throw new BadRequestException(
        'Reauthentication notes can only be updated while the inquiry is in the third-party reauthentication flow.',
      );
    }
    const inv = await this.inventoryItemRepo.findOne({
      where: { inquiryId: id },
    });
    if (!inv) {
      throw new BadRequestException(
        'No inventory item is linked to this inquiry.',
      );
    }
    const auth = await this.itemAuthRepo.findOne({
      where: { inventoryItemId: inv.id },
    });
    if (!auth) {
      throw new BadRequestException('Item authentication record not found.');
    }
    const trimmed = dto.notes.trim();
    auth.reauthenticationNotes = trimmed === '' ? null : trimmed;
    auth.updatedById = user.userId;
    await this.itemAuthRepo.save(auth);
    return this.findOneForStaff(id);
  }

  /**
   * Sets `contractStartDate` to today (UTC calendar date) and `contractExpirationDate`
   * to that date plus the number of days from setting {@link CONTRACT_EXPIRATION_DAYS_KEY}.
   */
  async populateContractDatesForInquiry(inquiryId: string): Promise<Inquiry> {
    const inquiry = await this.inquiriesRepo.findOne({
      where: { id: inquiryId },
    });
    if (!inquiry) {
      throw new NotFoundException('Inquiry not found');
    }

    const settingRow = await this.settingsRepo.findOne({
      where: { key: CONTRACT_EXPIRATION_DAYS_KEY },
    });
    if (!settingRow) {
      throw new BadRequestException(
        `Setting "${CONTRACT_EXPIRATION_DAYS_KEY}" is not configured`,
      );
    }
    const days = Number.parseInt(String(settingRow.value).trim(), 10);
    if (!Number.isFinite(days) || days < 0) {
      throw new BadRequestException(
        `Setting "${CONTRACT_EXPIRATION_DAYS_KEY}" must be a non-negative integer`,
      );
    }

    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const expiration = new Date(start);
    expiration.setUTCDate(expiration.getUTCDate() + days);

    inquiry.contractStartDate = start;
    inquiry.contractExpirationDate = expiration;
    return this.inquiriesRepo.save(inquiry);
  }

  /**
   * Uploads issue photos for a 3rd party authentication request. Mutates `inquiry`
   * only; caller persists. Clears suggested price range columns so they are not
   * confused with coordinator renegotiation. Does not change inquiry status.
   */
  async attachThirdPartyAuthRequestEvidence(
    inquiry: Inquiry,
    body: {
      photosDataUrls: string[];
    },
  ): Promise<void> {
    if (body.photosDataUrls.length > MAX_AUTH_RETURN_PHOTOS) {
      throw new BadRequestException(
        `At most ${MAX_AUTH_RETURN_PHOTOS} issue photos are allowed`,
      );
    }
    const keys: string[] = [];
    for (const raw of body.photosDataUrls) {
      const s = String(raw).trim();
      if (s === '') continue;
      const parsed = parseImageDataUrl(s);
      if (!parsed) {
        throw new BadRequestException(
          'Each issue photo must be a valid image data URL',
        );
      }
      const ext = extFromMime(parsed.mime);
      const key = `inquiries/${inquiry.id}/third-party-auth-request/${randomUUID()}.${ext}`;
      await this.s3.putObject(key, parsed.buffer, parsed.mime);
      keys.push(key);
    }
    if (keys.length === 0) {
      throw new BadRequestException(
        'At least one valid issue photo is required.',
      );
    }
    inquiry.priceRangeMin = null;
    inquiry.priceRangeMax = null;
    inquiry.returnPhotos = keys;
    inquiry.returnReasons = null;
  }

  /**
   * Persists authenticator return metadata on the inquiry and uploads photos to S3.
   */
  async applyAuthenticationReturn(
    inquiryId: string,
    body: {
      returnReasons: string | null;
      priceRangeMin: string | null;
      priceRangeMax: string | null;
      photosDataUrls: string[];
    },
  ): Promise<void> {
    const inquiry = await this.inquiriesRepo.findOne({
      where: { id: inquiryId },
    });
    if (!inquiry) {
      throw new NotFoundException('Inquiry not found');
    }
    if (body.photosDataUrls.length > MAX_AUTH_RETURN_PHOTOS) {
      throw new BadRequestException(
        `At most ${MAX_AUTH_RETURN_PHOTOS} return photos are allowed`,
      );
    }
    const keys: string[] = [];
    for (const raw of body.photosDataUrls) {
      const s = String(raw).trim();
      if (s === '') continue;
      const parsed = parseImageDataUrl(s);
      if (!parsed) {
        throw new BadRequestException(
          'Each return photo must be a valid image data URL',
        );
      }
      const ext = extFromMime(parsed.mime);
      const key = `inquiries/${inquiryId}/auth-return/${randomUUID()}.${ext}`;
      await this.s3.putObject(key, parsed.buffer, parsed.mime);
      keys.push(key);
    }
    if (keys.length === 0) {
      throw new BadRequestException(
        'At least one valid issue photo is required.',
      );
    }
    inquiry.returnReasons = body.returnReasons;
    inquiry.returnPhotos = keys.length > 0 ? keys : null;
    inquiry.priceRangeMin = body.priceRangeMin;
    inquiry.priceRangeMax = body.priceRangeMax;
    inquiry.status = InquiryStatus.AUTHENTICATED_RETURNED;
    await this.inquiriesRepo.save(inquiry);
  }
}
