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
import { Between, In, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import {
  extractBankDetailsFromClient,
  hasCompleteBankDetails,
  isClientPaymentPreferenceLocked,
} from '../clients/client-payment-preference.util';
import { MailService } from '../mail/mail.service';
import {
  ConsignmentSchedule,
  ConsignmentScheduleItem,
} from '../consignment-schedules/entities/consignment-schedule.entities';
import {
  countDeliveryInquiriesOnDay,
  fullDeliveryDatesForBranch,
  loadConsignmentDailyLimit,
  utcDateKeyFromDeliveryDate,
} from '../consignment-schedules/consignment-daily-limit.util';
import { normalizeClientVipStatus } from '../clients/client-vip-status.util';
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
import { CreateClientDeliveryScheduleDto } from './dto/create-client-delivery-schedule.dto';
import { RescheduleClientDeliveryScheduleDto } from './dto/reschedule-client-delivery-schedule.dto';
import { ScheduleClientDeliveryDto } from './dto/schedule-client-delivery.dto';
import {
  ClientOfferConfirmationData,
  Inquiry,
  InquiryItemSnapshot,
} from './entities/inquiry.entity';
import type { MulterFile } from './multer-file.type';
import { MediaOwnerType } from '../enums/media-owner-type.enum';
import { MediaPurpose } from '../enums/media-purpose.enum';
import type { InquiryMediaAuditSnapshot } from '../media/media.types';
import { MediaService } from '../media/media.service';
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
const AVAILABLE_FOR_PURCHASE_INVENTORY_STATUS = 'Available For Purchase';
const FOR_REPRICING_INVENTORY_STATUS = 'For Repricing';
const FOR_CONTRACT_RENEWAL_INVENTORY_STATUS = 'For Contract Renewal';

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
  originalOfferPrice: string | null;
  contractRenewalRequestedPrice: string | null;
  repricingProofUrl: string | null;
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
  paymentBranch: ClientOfferConfirmationData['paymentBranch'];
  bankDetails: ClientOfferConfirmationData['bankDetails'];
  signatureUrl: string;
};

export type StaffInquiryDetail = StaffInquiryRow & {
  updatedAt: Date;
  /** Set when an `inventory_items` row links to this inquiry (`inquiry_id`). */
  linkedInventoryItemId: string | null;
  /** Status for the linked inventory row, when present. */
  linkedInventoryItemStatus: string | null;
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
  branch: string;
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
    @InjectRepository(ConsignmentSchedule)
    private readonly scheduleRepo: Repository<ConsignmentSchedule>,
    @InjectRepository(Setting)
    private readonly settingsRepo: Repository<Setting>,
    private readonly media: MediaService,
    private readonly inquiryAudit: InquiryAuditService,
    @Inject(forwardRef(() => InventoryService))
    private readonly inventoryService: InventoryService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private async inquiryMediaAudit(
    inquiryId: string,
  ): Promise<InquiryMediaAuditSnapshot> {
    const [imageCount, offerSignaturePresent] = await Promise.all([
      this.media.countByOwner(
        MediaOwnerType.INQUIRY,
        inquiryId,
        MediaPurpose.ITEM_PHOTO,
      ),
      this.media.hasMedia(
        MediaOwnerType.INQUIRY,
        inquiryId,
        MediaPurpose.SIGNATURE,
      ),
    ]);
    return { imageCount, offerSignaturePresent };
  }

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
      branch: sch.branch,
    };
  }

  private clientDeliveryModeLabel(mode: string): string {
    if (mode === 'courier') return 'Courier';
    if (mode === 'consignor_dropoff') return 'Drop-off at branch';
    if (mode === 'pickup_service') return 'Pick-up service';
    return mode;
  }

  private branchDisplayLabel(branch: string): string {
    return branch.trim().toLowerCase() === 'makati' ? 'Makati' : 'Pasig';
  }

  private notifyCoordinatorsClientScheduledDelivery(
    inquiries: Array<{ id: string; sku: string }>,
    dto: ScheduleClientDeliveryDto,
  ): void {
    if (inquiries.length === 0) return;
    const dateLabel = dto.deliveryDate;
    const branch = this.branchDisplayLabel(dto.branch);
    const mode = this.clientDeliveryModeLabel(dto.modeOfTransfer);
    const skuLabel =
      inquiries.length === 1
        ? `inquiry ${inquiries[0].sku}`
        : `inquiries ${inquiries.map((i) => i.sku).join(', ')}`;
    void this.notifications
      .notify({
        message: `Consignor scheduled delivery for ${skuLabel} on ${dateLabel} (${branch} · ${mode}).`,
        receiverRole: CONSIGNMENT_COORDINATOR_POSITION,
        inquiryId: inquiries[0].id,
      })
      .catch((err: unknown) => {
        this.logger.error(
          'Failed to notify coordinators of client-scheduled delivery',
          err,
        );
      });
  }

  private notifyCoordinatorsClientRescheduledDelivery(
    inquiries: Array<{ id: string; sku: string }>,
    schedule: ConsignmentSchedule,
    dto: RescheduleClientDeliveryScheduleDto,
    previousDateLabel: string,
  ): void {
    if (inquiries.length === 0) return;
    const dateLabel = dto.deliveryDate;
    const branch = this.branchDisplayLabel(schedule.branch);
    const mode = this.clientDeliveryModeLabel(schedule.modeOfTransfer);
    const skuLabel =
      inquiries.length === 1
        ? `inquiry ${inquiries[0].sku}`
        : `inquiries ${inquiries.map((i) => i.sku).join(', ')}`;
    void this.notifications
      .notify({
        message: `Consignor rescheduled delivery for ${skuLabel} from ${previousDateLabel} to ${dateLabel} (${branch} · ${mode}). Reason: ${dto.rescheduleReason.trim()}`,
        receiverRole: CONSIGNMENT_COORDINATOR_POSITION,
        inquiryId: inquiries[0].id,
      })
      .catch((err: unknown) => {
        this.logger.error(
          'Failed to notify coordinators of client-rescheduled delivery',
          err,
        );
      });
  }

  async getClientDeliveryAvailability(
    branchRaw: string,
    itemCountRaw?: string,
  ): Promise<{ dailyLimit: number | null; fullDates: string[] }> {
    const branch = branchRaw?.trim().toLowerCase();
    if (branch !== 'pasig' && branch !== 'makati') {
      throw new BadRequestException('branch must be pasig or makati');
    }
    const parsed = Number.parseInt(String(itemCountRaw ?? '1').trim(), 10);
    const itemCount =
      Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
    const dailyLimit = await loadConsignmentDailyLimit(this.settingsRepo);
    const schedules = await this.scheduleRepo.find({
      where: { type: 'delivery' },
      relations: { items: true },
    });
    return {
      dailyLimit,
      fullDates: fullDeliveryDatesForBranch(
        schedules,
        branch,
        dailyLimit,
        itemCount,
      ),
    };
  }

  async findForDeliveryForClient(user: JwtUser): Promise<
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
      where: {
        consignorId: client.id,
        status: InquiryStatus.FOR_DELIVERY,
      },
      order: { createdAt: 'DESC' },
    });
    if (rows.length === 0) return [];
    const links = await this.scheduleItemRepo.find({
      where: { inquiry: { id: In(rows.map((r) => r.id)) } },
      relations: { inquiry: true },
    });
    const linkedIds = new Set(links.map((l) => l.inquiry.id));
    return rows
      .filter((r) => !linkedIds.has(r.id))
      .map((r) => ({
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

  async listClientSchedules(user: JwtUser): Promise<
    Array<{
      id: string;
      deliveryDate: string;
      status: string;
      modeOfTransfer: string;
      branch: string;
      inquiryCount: number;
      items: Array<{ id: string; sku: string; itemLabel: string }>;
      createdAt: string;
      hasClientRescheduled: boolean;
    }>
  > {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }
    const schedules = await this.scheduleRepo
      .createQueryBuilder('s')
      .innerJoin('s.items', 'link')
      .innerJoin(
        'link.inquiry',
        'inquiry',
        'inquiry.consignor_id = :clientId',
        { clientId: client.id },
      )
      .leftJoinAndSelect('s.items', 'items')
      .leftJoinAndSelect('items.inquiry', 'inq')
      .where('s.type = :type', { type: 'delivery' })
      .orderBy('s.created_at', 'DESC')
      .distinct(true)
      .getMany();

    return schedules.map((s) => {
      const clientItems = (s.items ?? []).filter(
        (item) => item.inquiry?.consignorId === client.id,
      );
      const items = clientItems
        .map((item) => {
          const inquiry = item.inquiry;
          if (!inquiry) return null;
          return {
            id: inquiry.id,
            sku: inquiry.sku?.trim() ?? '',
            itemLabel: itemLabelFromSnapshot(inquiry.itemSnapshot),
          };
        })
        .filter(
          (row): row is { id: string; sku: string; itemLabel: string } =>
            row != null && row.sku !== '',
        )
        .sort((a, b) => a.sku.localeCompare(b.sku));
      return {
        id: s.id,
        deliveryDate: s.deliveryDate.toISOString(),
        status: s.status,
        modeOfTransfer: s.modeOfTransfer,
        branch: s.branch,
        inquiryCount: items.length,
        items,
        createdAt: s.createdAt.toISOString(),
        hasClientRescheduled: s.hasClientRescheduled,
      };
    });
  }

  async createClientDeliverySchedule(
    user: JwtUser,
    dto: CreateClientDeliveryScheduleDto,
  ): Promise<{ id: string }> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const vipStatus = normalizeClientVipStatus(client.vipStatus);
    if (
      dto.modeOfTransfer === 'pickup_service' &&
      vipStatus !== 'Gold' &&
      vipStatus !== 'Diamond'
    ) {
      throw new BadRequestException(
        'Pick-up service is available for VIP Gold and Diamond clients only',
      );
    }

    const uniqueIds = [...new Set(dto.inquiryIds)];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('Select at least one inquiry');
    }

    const deliveryDate = new Date(`${dto.deliveryDate}T12:00:00.000Z`);
    let scheduleId = '';

    const scheduledInquiries = await this.scheduleRepo.manager.transaction(
      async (em) => {
        const inquiries = await em.find(Inquiry, {
          where: { id: In(uniqueIds), consignorId: client.id },
        });
        if (inquiries.length !== uniqueIds.length) {
          throw new BadRequestException(
            'One or more selected inquiries are invalid',
          );
        }

        for (const inquiry of inquiries) {
          if (inquiry.status !== InquiryStatus.FOR_DELIVERY) {
            throw new BadRequestException(
              'One or more selected inquiries are not ready to schedule for delivery',
            );
          }
        }

        const existingLinks = await em.find(ConsignmentScheduleItem, {
          where: { inquiry: { id: In(uniqueIds) } },
          relations: { inquiry: true },
        });
        if (existingLinks.length > 0) {
          throw new BadRequestException(
            'One or more selected inquiries are already scheduled',
          );
        }

        const dailyLimit = await loadConsignmentDailyLimit(
          em.getRepository(Setting),
        );
        if (dailyLimit != null) {
          const schedules = await em.find(ConsignmentSchedule, {
            where: { type: 'delivery', branch: dto.branch },
            relations: { items: true },
          });
          const count = countDeliveryInquiriesOnDay(
            schedules,
            dto.deliveryDate,
            dto.branch,
          );
          if (count + uniqueIds.length > dailyLimit) {
            throw new BadRequestException(
              'The selected delivery date does not have enough capacity for this branch',
            );
          }
        }

        const schedule = em.create(ConsignmentSchedule, {
          deliveryDate,
          status: 'scheduled',
          type: 'delivery',
          modeOfTransfer: dto.modeOfTransfer,
          branch: dto.branch,
          createdBy: null,
          scheduledByClient: client,
        });
        await em.save(schedule);
        scheduleId = schedule.id;

        const consignorActor = this.inquiryAudit.consignorActor(user.userId);
        for (const inquiry of inquiries) {
          const before = cloneInquiryForAudit(inquiry);
          inquiry.status = InquiryStatus.FOR_DELIVERY_SCHEDULED;
          await em.save(inquiry);
          await this.inquiryAudit.recordDiff(
            inquiry.id,
            before,
            inquiry,
            consignorActor,
            em,
          );

          const link = em.create(ConsignmentScheduleItem, {
            consignmentSchedule: schedule,
            inquiry,
          });
          await em.save(link);
        }

        return inquiries;
      },
    );

    this.notifyCoordinatorsClientScheduledDelivery(scheduledInquiries, dto);

    return { id: scheduleId };
  }

  async rescheduleClientDeliverySchedule(
    user: JwtUser,
    scheduleId: string,
    dto: RescheduleClientDeliveryScheduleDto,
  ): Promise<{
    id: string;
    deliveryDate: string;
    status: string;
    hasClientRescheduled: boolean;
  }> {
    const client = await this.clientsRepo.findOne({
      where: { userId: user.userId },
    });
    if (!client) {
      throw new NotFoundException('Client profile not found');
    }

    const schedule = await this.scheduleRepo.findOne({
      where: { id: scheduleId },
      relations: { items: { inquiry: true } },
    });
    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    const ownsSchedule = (schedule.items ?? []).some(
      (item) => item.inquiry?.consignorId === client.id,
    );
    if (!ownsSchedule) {
      throw new NotFoundException('Schedule not found');
    }

    if (schedule.type !== 'delivery') {
      throw new BadRequestException(
        'Only delivery schedules can be rescheduled',
      );
    }

    const status = schedule.status.trim().toLowerCase();
    if (status === 'received' || status === 'cancelled') {
      throw new BadRequestException(
        'This delivery can no longer be rescheduled',
      );
    }

    if (schedule.hasClientRescheduled) {
      throw new BadRequestException(
        'You have already rescheduled this delivery',
      );
    }

    const deliveryTime = schedule.deliveryDate.getTime();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    if (Date.now() >= deliveryTime - twentyFourHoursMs) {
      throw new BadRequestException(
        'Rescheduling is not available within 24 hours of the scheduled delivery date. You may reach out to the coordinator for assistance.',
      );
    }

    const newDayKey = dto.deliveryDate.trim();
    const currentDayKey = utcDateKeyFromDeliveryDate(schedule.deliveryDate);
    if (newDayKey === currentDayKey) {
      throw new BadRequestException('Choose a different delivery date');
    }

    const todayKey = utcDateKeyFromDeliveryDate(new Date());
    if (newDayKey < todayKey) {
      throw new BadRequestException('Delivery date cannot be in the past');
    }

    const movingCount = schedule.items?.length ?? 0;
    const dailyLimit = await loadConsignmentDailyLimit(this.settingsRepo);
    if (dailyLimit != null && movingCount > 0) {
      const schedules = await this.scheduleRepo.find({
        where: { type: 'delivery', branch: schedule.branch },
        relations: { items: true },
      });
      const countOnNewDay = countDeliveryInquiriesOnDay(
        schedules.filter((s) => s.id !== schedule.id),
        newDayKey,
        schedule.branch,
      );
      if (countOnNewDay + movingCount > dailyLimit) {
        throw new BadRequestException(
          'The selected delivery date does not have enough capacity for this branch',
        );
      }
    }

    const deliveryDate = new Date(`${newDayKey}T12:00:00.000Z`);
    schedule.deliveryDate = deliveryDate;
    schedule.status = 'rescheduled';
    schedule.rescheduleReason = dto.rescheduleReason.trim();
    schedule.hasClientRescheduled = true;
    await this.scheduleRepo.save(schedule);

    const inquiries = (schedule.items ?? [])
      .map((item) => item.inquiry)
      .filter((inq): inq is Inquiry => inq != null);
    this.notifyCoordinatorsClientRescheduledDelivery(
      inquiries,
      schedule,
      dto,
      currentDayKey,
    );

    return {
      id: schedule.id,
      deliveryDate: schedule.deliveryDate.toISOString(),
      status: schedule.status,
      hasClientRescheduled: true,
    };
  }

  /** Builds API view from consignor payment prefs and inquiry signature media. */
  private async mapClientOfferConfirmationForApi(
    r: Inquiry,
  ): Promise<ClientOfferConfirmationView | null> {
    const signatureUrl = await this.media.findFirstUrl(
      MediaOwnerType.INQUIRY,
      r.id,
      MediaPurpose.SIGNATURE,
    );
    if (!signatureUrl) {
      return null;
    }
    const consignor = r.consignor;
    if (!consignor?.preferredPaymentMethod) {
      return null;
    }
    let bankDetails: ClientOfferConfirmationData['bankDetails'] = null;
    if (consignor.preferredPaymentMethod === 'direct_deposit') {
      const num = consignor.bankAccountNumber?.trim();
      const name = consignor.bankAccountName?.trim();
      const code = consignor.bankCode?.trim();
      if (num && name && code) {
        bankDetails = {
          accountNumber: num,
          accountName: name,
          bank: code as 'bdo' | 'bpi' | 'other',
        };
      }
    }
    return {
      paymentMethod: consignor.preferredPaymentMethod,
      paymentBranch: consignor.preferredPaymentBranch ?? null,
      bankDetails,
      signatureUrl,
    };
  }

  private async mapInquiryToStaffRowAsync(
    r: Inquiry,
    photoCount?: number,
  ): Promise<StaffInquiryRow> {
    const form = (r.itemSnapshot?.form ?? {}) as Record<string, unknown>;
    const c = r.consignor;
    const name = c ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() : '';
    const resolvedPhotoCount =
      photoCount ??
      (await this.media.countByOwner(
        MediaOwnerType.INQUIRY,
        r.id,
        MediaPurpose.ITEM_PHOTO,
      ));
    const repricingProofUrl = await this.media.findFirstUrl(
      MediaOwnerType.INQUIRY,
      r.id,
      MediaPurpose.REPRICING_PROOF,
    );
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
      photoCount: resolvedPhotoCount,
      offerTransactionType: r.offerTransactionType ?? null,
      offerPrice:
        r.offerPrice != null && r.offerPrice !== ''
          ? String(r.offerPrice)
          : null,
      originalOfferPrice:
        r.originalOfferPrice != null && r.originalOfferPrice !== ''
          ? String(r.originalOfferPrice)
          : null,
      contractRenewalRequestedPrice:
        r.contractRenewalRequestedPrice != null &&
        r.contractRenewalRequestedPrice !== ''
          ? String(r.contractRenewalRequestedPrice)
          : null,
      repricingProofUrl,
      clientOfferConfirmation: await this.mapClientOfferConfirmationForApi(r),
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
    const photoCounts = await this.media.countByOwners(
      MediaOwnerType.INQUIRY,
      rows.map((r) => r.id),
      MediaPurpose.ITEM_PHOTO,
    );
    return Promise.all(
      rows.map((r) =>
        this.mapInquiryToStaffRowAsync(r, photoCounts.get(r.id) ?? 0),
      ),
    );
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
    const base = await this.mapInquiryToStaffRowAsync(r);
    const itemPhotos = await this.media.findByOwner(
      MediaOwnerType.INQUIRY,
      r.id,
      { purpose: MediaPurpose.ITEM_PHOTO, orderBySort: true },
    );
    const images = this.media.toKeyUrlList(itemPhotos);
    const linkedInv = await this.inventoryItemRepo.findOne({
      where: { inquiryId: r.id },
      select: { id: true, status: true },
    });

    const thirdPartyReauthenticationReasons =
      this.inquiryIsInThirdPartyPaymentFlow(r.status) &&
      r.thirdPartyReauthenticationReasons != null &&
      String(r.thirdPartyReauthenticationReasons).trim() !== ''
        ? String(r.thirdPartyReauthenticationReasons).trim()
        : null;
    const thirdPartyPaymentProofUrls = this.inquiryIsInThirdPartyPaymentFlow(
      r.status,
    )
      ? this.media.toUrlList(
          await this.media.findByOwner(MediaOwnerType.INQUIRY, r.id, {
            purpose: MediaPurpose.THIRD_PARTY_PAYMENT,
            orderBySort: true,
          }),
        )
      : [];

    const thirdPartyIssuePhotoUrls = this.inquiryIsInThirdPartyPaymentFlow(
      r.status,
    )
      ? this.media.toUrlList(
          await this.media.findByOwner(MediaOwnerType.INQUIRY, r.id, {
            purpose: MediaPurpose.AUTH_RETURN,
            metadata: { context: 'third_party_request' },
            orderBySort: true,
          }),
        )
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
      linkedInventoryItemStatus: linkedInv?.status ?? null,
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
      const returnPhotoUrls = this.media.toUrlList(
        await this.media.findByOwner(MediaOwnerType.INQUIRY, r.id, {
          purpose: MediaPurpose.AUTH_RETURN,
          metadata: { context: 'coordinator_return' },
          orderBySort: true,
        }),
      );
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
        returnPhotoUrls,
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
    const base = await this.mapInquiryToStaffRowAsync(r);
    const { notes: _notes, ...rest } = base;
    const itemPhotos = await this.media.findByOwner(
      MediaOwnerType.INQUIRY,
      r.id,
      { purpose: MediaPurpose.ITEM_PHOTO, orderBySort: true },
    );
    const images = this.media.toKeyUrlList(itemPhotos);
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

    const thirdPartyPaymentProofUrls = this.inquiryIsInThirdPartyPaymentFlow(
      r.status,
    )
      ? this.media.toUrlList(
          await this.media.findByOwner(MediaOwnerType.INQUIRY, r.id, {
            purpose: MediaPurpose.THIRD_PARTY_PAYMENT,
            orderBySort: true,
          }),
        )
      : [];
    const thirdPartyIssuePhotoUrls = this.inquiryIsInThirdPartyPaymentFlow(
      r.status,
    )
      ? this.media.toUrlList(
          await this.media.findByOwner(MediaOwnerType.INQUIRY, r.id, {
            purpose: MediaPurpose.AUTH_RETURN,
            metadata: { context: 'third_party_request' },
            orderBySort: true,
          }),
        )
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
    for (const file of files) {
      const mime = file.mimetype?.toLowerCase() ?? '';
      if (!ALLOWED_IMAGE_MIMES.has(mime)) {
        throw new BadRequestException(
          `Unsupported image type: ${file.mimetype || 'unknown'}`,
        );
      }
    }
    const before = cloneInquiryForAudit(r);
    await this.media.appendFiles(
      MediaOwnerType.INQUIRY,
      inquiryId,
      MediaPurpose.THIRD_PARTY_PAYMENT,
      files,
      (_i, file) => {
        const mime = file.mimetype.toLowerCase();
        return `inquiries/${inquiryId}/third-party-payment/${randomUUID()}.${extFromMime(mime)}`;
      },
      { uploadedByUserId: user.userId },
    );
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
    const hasProof = await this.media.hasMedia(
      MediaOwnerType.INQUIRY,
      inquiryId,
      MediaPurpose.THIRD_PARTY_PAYMENT,
    );
    if (!hasProof) {
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

    for (const file of files) {
      const mime = file.mimetype?.toLowerCase() ?? '';
      if (!ALLOWED_IMAGE_MIMES.has(mime)) {
        throw new BadRequestException(
          `Unsupported image type: ${file.mimetype || 'unknown'}`,
        );
      }
    }

    await this.media.appendFiles(
      MediaOwnerType.INQUIRY,
      inquiryId,
      MediaPurpose.ITEM_PHOTO,
      files,
      (_i, file) => {
        const mime = file.mimetype.toLowerCase();
        return `inquiries/${inquiryId}/${randomUUID()}.${extFromMime(mime)}`;
      },
    );
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

    const beforeMedia = await this.inquiryMediaAudit(inquiryId);

    const paymentLocked = isClientPaymentPreferenceLocked(client);
    let paymentMethod: ClientOfferConfirmationData['paymentMethod'];
    let bankDetails: ClientOfferConfirmationData['bankDetails'] = null;
    let paymentBranch: ClientOfferConfirmationData['paymentBranch'] = null;

    if (paymentLocked) {
      paymentMethod = client.preferredPaymentMethod!;
      if (paymentMethod === 'direct_deposit') {
        bankDetails = extractBankDetailsFromClient(client);
        if (!bankDetails) {
          throw new BadRequestException(
            'Your saved bank details are incomplete. Please contact our coordinators if you need to update them.',
          );
        }
      } else {
        if (!client.preferredPaymentBranch) {
          throw new BadRequestException(
            'Your saved payment pickup branch is missing. Please contact our coordinators if you need to update it.',
          );
        }
        paymentBranch = client.preferredPaymentBranch;
      }
    } else if (dto.paymentMethod === 'direct_deposit') {
      paymentMethod = dto.paymentMethod;
      if (!dto.bankDetails) {
        throw new BadRequestException(
          'Bank details are required for direct deposit',
        );
      }
      bankDetails = {
        accountNumber: dto.bankDetails.accountNumber.trim(),
        accountName: dto.bankDetails.accountName.trim(),
        bank: dto.bankDetails.bank,
      };
      if (
        !hasCompleteBankDetails({
          bankAccountNumber: bankDetails.accountNumber,
          bankAccountName: bankDetails.accountName,
          bankCode: bankDetails.bank,
        })
      ) {
        throw new BadRequestException(
          'All bank fields are required for direct deposit',
        );
      }
    } else {
      paymentMethod = dto.paymentMethod;
      if (!dto.paymentBranch) {
        throw new BadRequestException('Payment pickup branch is required');
      }
      paymentBranch = dto.paymentBranch;
    }

    const ext = extFromMime(mime);
    const signatureKey = `inquiries/${inquiryId}/offer-signature-${randomUUID()}.${ext}`;
    await this.media.replaceSingle(
      MediaOwnerType.INQUIRY,
      inquiryId,
      MediaPurpose.SIGNATURE,
      signatureFile,
      signatureKey,
      { uploadedByUserId: user.userId },
    );

    if (!paymentLocked) {
      if (paymentMethod === 'direct_deposit' && bankDetails) {
        client.bankAccountNumber = bankDetails.accountNumber;
        client.bankAccountName = bankDetails.accountName;
        client.bankCode = bankDetails.bank;
      } else {
        client.bankAccountNumber = null;
        client.bankAccountName = null;
        client.bankCode = null;
      }
      client.preferredPaymentMethod = paymentMethod;
      client.preferredPaymentBranch = paymentBranch;
      await this.clientsRepo.save(client);
    }

    const before = cloneInquiryForAudit(r);

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

    const savedInquiry = await this.inquiriesRepo.findOne({
      where: { id: inquiryId },
    });
    if (savedInquiry?.status === InquiryStatus.FOR_PROCESSING) {
      const inv = await this.inventoryItemRepo.findOne({
        where: { inquiryId },
      });
      if (inv) {
        await this.media.copyOwnerMedia(
          MediaOwnerType.INQUIRY,
          inquiryId,
          MediaOwnerType.INVENTORY_ITEM,
          inv.id,
          MediaPurpose.ITEM_PHOTO,
        );
      }
    }

    const afterMedia = await this.inquiryMediaAudit(inquiryId);
    await this.inquiryAudit.recordDiff(
      r.id,
      before,
      r,
      this.inquiryAudit.consignorActor(user.userId),
      undefined,
      beforeMedia,
      afterMedia,
    );
    this.notifyCoordinatorsConsignorConfirmedOffer(r);
    return this.findOneForClient(user, inquiryId);
  }

  async acceptContractRenewalForClient(
    user: JwtUser,
    inquiryId: string,
    payloadRaw: string | undefined,
    signatureFile: MulterFile | undefined,
  ): Promise<ClientInquiryDetail> {
    if (payloadRaw == null || payloadRaw.trim() === '') {
      throw new BadRequestException('Missing payload');
    }
    let termsAccepted = false;
    try {
      const payload = JSON.parse(payloadRaw) as { termsAccepted?: unknown };
      termsAccepted = payload.termsAccepted === true;
    } catch {
      throw new BadRequestException('Invalid contract renewal payload');
    }
    if (!termsAccepted) {
      throw new BadRequestException(
        'Consignment terms and conditions must be accepted.',
      );
    }
    if (!signatureFile?.buffer?.length) {
      throw new BadRequestException('Signature image is required');
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
    const contractStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const contractExpiration = new Date(contractStart);
    contractExpiration.setUTCDate(contractExpiration.getUTCDate() + days);

    const signatureKey = `inquiries/${inquiryId}/contract-renewal-signature-${randomUUID()}.${extFromMime(mime)}`;
    const beforeMedia = await this.inquiryMediaAudit(inquiryId);
    await this.media.replaceSingle(
      MediaOwnerType.INQUIRY,
      inquiryId,
      MediaPurpose.SIGNATURE,
      signatureFile,
      signatureKey,
      { uploadedByUserId: user.userId },
    );

    await this.inquiriesRepo.manager.transaction(async (em) => {
      const inquiry = await em.findOne(Inquiry, {
        where: { id: inquiryId, consignorId: client.id },
      });
      if (!inquiry) {
        throw new NotFoundException('Inquiry not found');
      }
      if (inquiry.status !== InquiryStatus.FOR_CONTRACT_RENEWAL) {
        throw new BadRequestException(
          'This inquiry is not waiting for contract renewal.',
        );
      }
      if (
        inquiry.contractRenewalRequestedPrice == null ||
        String(inquiry.contractRenewalRequestedPrice).trim() === ''
      ) {
        throw new BadRequestException('No renewal offer price is available.');
      }

      const inv = await em.findOne(InventoryItem, {
        where: { inquiryId: inquiry.id },
      });
      if (!inv) {
        throw new BadRequestException(
          'No linked inventory item was found for this inquiry.',
        );
      }
      if (inv.status !== FOR_CONTRACT_RENEWAL_INVENTORY_STATUS) {
        throw new BadRequestException(
          'Linked inventory item is not currently for contract renewal.',
        );
      }

      const before = cloneInquiryForAudit(inquiry);
      inquiry.offerPrice = String(inquiry.contractRenewalRequestedPrice);
      inquiry.contractRenewalRequestedPrice = null;
      inquiry.contractStartDate = contractStart;
      inquiry.contractExpirationDate = contractExpiration;
      inquiry.status = InquiryStatus.FOR_REPRICING;
      inquiry.updatedById = user.userId;
      await em.save(inquiry);

      inv.status = FOR_REPRICING_INVENTORY_STATUS;
      inv.updatedById = user.userId;
      await em.save(inv);

      await this.inquiryAudit.recordDiff(
        inquiry.id,
        before,
        inquiry,
        this.inquiryAudit.consignorActor(user.userId),
        em,
        beforeMedia,
        await this.inquiryMediaAudit(inquiryId),
      );
    });

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

    type Planned = {
      inquiryId: string;
      itemSnapshot: InquiryItemSnapshot;
      files: MulterFile[];
    };
    const planned: Planned[] = [];

    for (let itemIdx = 0; itemIdx < dto.items.length; itemIdx++) {
      const row = dto.items[itemIdx];
      const inquiryId = randomUUID();
      const itemFiles: MulterFile[] = [];

      for (let j = 0; j < row.imageCount; j++) {
        const file = files[fileIdx++];
        const mime = file.mimetype?.toLowerCase() ?? '';
        if (!ALLOWED_IMAGE_MIMES.has(mime)) {
          throw new BadRequestException(
            `Unsupported image type: ${file.mimetype || 'unknown'}`,
          );
        }
        itemFiles.push(file);
      }

      planned.push({
        inquiryId,
        itemSnapshot: {
          clientItemId: row.clientItemId,
          form: { ...row.form } as unknown as Record<string, unknown>,
        },
        files: itemFiles,
      });
    }

    const out = await this.inquiriesRepo.manager.transaction(async (em) => {
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
    });

    for (const row of planned) {
      if (row.files.length === 0) continue;
      await this.media.appendFiles(
        MediaOwnerType.INQUIRY,
        row.inquiryId,
        MediaPurpose.ITEM_PHOTO,
        row.files,
        (_i, file) => {
          const mime = file.mimetype.toLowerCase();
          return `inquiries/${row.inquiryId}/${randomUUID()}.${extFromMime(mime)}`;
        },
      );
    }

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

    type Planned = {
      inquiryId: string;
      itemSnapshot: InquiryItemSnapshot;
      files: MulterFile[];
    };
    const planned: Planned[] = [];

    for (let itemIdx = 0; itemIdx < dto.items.length; itemIdx++) {
      const row = dto.items[itemIdx];
      const inquiryId = randomUUID();
      const itemFiles: MulterFile[] = [];

      for (let j = 0; j < row.imageCount; j++) {
        const file = files[fileIdx++];
        const mime = file.mimetype?.toLowerCase() ?? '';
        if (!ALLOWED_IMAGE_MIMES.has(mime)) {
          throw new BadRequestException(
            `Unsupported image type: ${file.mimetype || 'unknown'}`,
          );
        }
        itemFiles.push(file);
      }

      planned.push({
        inquiryId,
        itemSnapshot: {
          clientItemId: row.clientItemId,
          form: { ...row.form } as unknown as Record<string, unknown>,
        },
        files: itemFiles,
      });
    }

    const out = await this.inquiriesRepo.manager.transaction(async (em) => {
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

    for (const row of planned) {
      if (row.files.length === 0) continue;
      await this.media.appendFiles(
        MediaOwnerType.INQUIRY,
        row.inquiryId,
        MediaPurpose.ITEM_PHOTO,
        row.files,
        (_i, file) => {
          const mime = file.mimetype.toLowerCase();
          return `inquiries/${row.inquiryId}/${randomUUID()}.${extFromMime(mime)}`;
        },
        { uploadedByUserId: user.userId, createdById: user.userId },
      );
    }

    return out;
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
    const beforeMedia = await this.inquiryMediaAudit(id);
    r.offerTransactionType = dto.transactionType;
    r.offerPrice = dto.offerPrice.toFixed(2);
    /** Stay in post–auth renegotiation lane when the coordinator revises the offer. */
    if (r.status !== InquiryStatus.AUTHENTICATED_NEW_OFFER) {
      r.status = InquiryStatus.FOR_OFFER_CONFIRMATION;
    }
    await this.media.deleteByOwner(
      MediaOwnerType.INQUIRY,
      id,
      MediaPurpose.SIGNATURE,
    );
    await this.inquiriesRepo.save(r);
    const label = await this.inquiryAudit.staffActorLabel(user.userId);
    const afterMedia = await this.inquiryMediaAudit(id);
    await this.inquiryAudit.recordDiff(
      id,
      before,
      r,
      {
        userId: user.userId,
        label,
      },
      undefined,
      beforeMedia,
      afterMedia,
    );
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
    const beforeMedia = await this.inquiryMediaAudit(id);
    r.offerPrice = dto.offerPrice.toFixed(2);
    r.status = InquiryStatus.AUTHENTICATED_NEW_OFFER;
    await this.media.deleteByOwner(
      MediaOwnerType.INQUIRY,
      id,
      MediaPurpose.SIGNATURE,
    );
    await this.inquiriesRepo.save(r);
    const label = await this.inquiryAudit.staffActorLabel(user.userId);
    const afterMedia = await this.inquiryMediaAudit(id);
    await this.inquiryAudit.recordDiff(
      id,
      before,
      r,
      {
        userId: user.userId,
        label,
      },
      undefined,
      beforeMedia,
      afterMedia,
    );
    this.notifyConsignorOfferEmail(id, r.consignor);
    return this.findOneForStaff(id);
  }

  async updateConsignmentPrice(
    id: string,
    rawOfferPrice: string | undefined,
    proof: MulterFile | undefined,
    user: JwtUser,
  ): Promise<StaffInquiryDetail> {
    const parsedOfferPrice = Number(
      String(rawOfferPrice ?? '')
        .trim()
        .replace(/,/g, '')
        .replace(/^\u20b1\s?/i, ''),
    );
    if (!Number.isFinite(parsedOfferPrice) || parsedOfferPrice <= 0) {
      throw new BadRequestException(
        'Enter a valid offer price greater than zero.',
      );
    }
    if (!proof?.buffer?.length) {
      throw new BadRequestException(
        'Proof of consignor agreement is required.',
      );
    }
    const mime = proof.mimetype?.toLowerCase() ?? '';
    if (!ALLOWED_IMAGE_MIMES.has(mime)) {
      throw new BadRequestException(
        `Unsupported image type: ${proof.mimetype || 'unknown'}`,
      );
    }

    const key = `inquiries/${id}/repricing-proof/${randomUUID()}.${extFromMime(mime)}`;
    await this.media.replaceSingle(
      MediaOwnerType.INQUIRY,
      id,
      MediaPurpose.REPRICING_PROOF,
      proof,
      key,
      { uploadedByUserId: user.userId },
    );
    const label = await this.inquiryAudit.staffActorLabel(user.userId);

    await this.inquiriesRepo.manager.transaction(async (em) => {
      const r = await em.findOne(Inquiry, { where: { id } });
      if (!r) {
        throw new NotFoundException('Inquiry not found');
      }
      if (r.offerPrice == null || String(r.offerPrice).trim() === '') {
        throw new BadRequestException('Current offer price is not set.');
      }
      const inv = await em.findOne(InventoryItem, {
        where: { inquiryId: id },
      });
      if (!inv) {
        throw new BadRequestException(
          'No linked inventory item was found for this inquiry.',
        );
      }
      if (inv.status !== AVAILABLE_FOR_PURCHASE_INVENTORY_STATUS) {
        throw new BadRequestException(
          'Consignment price can only be updated while the item is available for purchase.',
        );
      }

      const before = cloneInquiryForAudit(r);
      if (r.originalOfferPrice == null || String(r.originalOfferPrice) === '') {
        r.originalOfferPrice = String(r.offerPrice);
      }
      r.offerPrice = parsedOfferPrice.toFixed(2);
      r.updatedById = user.userId;
      await em.save(r);

      inv.status = FOR_REPRICING_INVENTORY_STATUS;
      inv.updatedById = user.userId;
      await em.save(inv);

      await this.inquiryAudit.recordDiff(
        id,
        before,
        r,
        { userId: user.userId, label },
        em,
      );
    });

    return this.findOneForStaff(id);
  }

  async renewContract(
    id: string,
    dto: SubmitAuthenticatedReturnNewOfferDto,
    user: JwtUser,
  ): Promise<StaffInquiryDetail> {
    const r = await this.inquiriesRepo.findOne({ where: { id } });
    if (!r) {
      throw new NotFoundException('Inquiry not found');
    }
    if (r.offerPrice == null || String(r.offerPrice).trim() === '') {
      throw new BadRequestException('Current offer price is not set.');
    }
    const label = await this.inquiryAudit.staffActorLabel(user.userId);

    await this.inquiriesRepo.manager.transaction(async (em) => {
      const inquiry = await em.findOne(Inquiry, { where: { id } });
      if (!inquiry) {
        throw new NotFoundException('Inquiry not found');
      }
      const inv = await em.findOne(InventoryItem, {
        where: { inquiryId: id },
      });
      if (!inv) {
        throw new BadRequestException(
          'No linked inventory item was found for this inquiry.',
        );
      }
      if (inv.status !== AVAILABLE_FOR_PURCHASE_INVENTORY_STATUS) {
        throw new BadRequestException(
          'Contract renewal can only be started while the item is available for purchase.',
        );
      }

      const before = cloneInquiryForAudit(inquiry);
      inquiry.contractRenewalRequestedPrice = dto.offerPrice.toFixed(2);
      inquiry.status = InquiryStatus.FOR_CONTRACT_RENEWAL;
      inquiry.updatedById = user.userId;
      await em.save(inquiry);

      inv.status = FOR_CONTRACT_RENEWAL_INVENTORY_STATUS;
      inv.updatedById = user.userId;
      await em.save(inv);

      await this.inquiryAudit.recordDiff(
        id,
        before,
        inquiry,
        { userId: user.userId, label },
        em,
      );
    });

    return this.findOneForStaff(id);
  }

  async cancelContractRenewal(
    id: string,
    user: JwtUser,
  ): Promise<StaffInquiryDetail> {
    const label = await this.inquiryAudit.staffActorLabel(user.userId);

    await this.inquiriesRepo.manager.transaction(async (em) => {
      const inquiry = await em.findOne(Inquiry, { where: { id } });
      if (!inquiry) {
        throw new NotFoundException('Inquiry not found');
      }
      if (inquiry.status !== InquiryStatus.FOR_CONTRACT_RENEWAL) {
        throw new BadRequestException(
          'Only inquiries for contract renewal can be cancelled.',
        );
      }

      const inv = await em.findOne(InventoryItem, {
        where: { inquiryId: id },
      });
      if (!inv) {
        throw new BadRequestException(
          'No linked inventory item was found for this inquiry.',
        );
      }
      if (inv.status !== FOR_CONTRACT_RENEWAL_INVENTORY_STATUS) {
        throw new BadRequestException(
          'Linked inventory item is not currently for contract renewal.',
        );
      }

      const before = cloneInquiryForAudit(inquiry);
      inquiry.contractRenewalRequestedPrice = null;
      inquiry.status = InquiryStatus.FOR_PROCESSING;
      inquiry.updatedById = user.userId;
      await em.save(inquiry);

      inv.status = AVAILABLE_FOR_PURCHASE_INVENTORY_STATUS;
      inv.updatedById = user.userId;
      await em.save(inv);

      await this.inquiryAudit.recordDiff(
        id,
        before,
        inquiry,
        { userId: user.userId, label },
        em,
      );
    });

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
    for (const raw of body.photosDataUrls) {
      const s = String(raw).trim();
      if (s === '') continue;
      if (!parseImageDataUrl(s)) {
        throw new BadRequestException(
          'Each issue photo must be a valid image data URL',
        );
      }
    }
    const saved = await this.media.replaceAllFromDataUrls(
      MediaOwnerType.INQUIRY,
      inquiry.id,
      MediaPurpose.AUTH_RETURN,
      body.photosDataUrls,
      (_index, mime) =>
        `inquiries/${inquiry.id}/third-party-auth-request/${randomUUID()}.${extFromMime(mime)}`,
      parseImageDataUrl,
      { metadata: { context: 'third_party_request' } },
    );
    if (saved.length === 0) {
      throw new BadRequestException(
        'At least one valid issue photo is required.',
      );
    }
    inquiry.priceRangeMin = null;
    inquiry.priceRangeMax = null;
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
    for (const raw of body.photosDataUrls) {
      const s = String(raw).trim();
      if (s === '') continue;
      if (!parseImageDataUrl(s)) {
        throw new BadRequestException(
          'Each return photo must be a valid image data URL',
        );
      }
    }
    const saved = await this.media.replaceAllFromDataUrls(
      MediaOwnerType.INQUIRY,
      inquiryId,
      MediaPurpose.AUTH_RETURN,
      body.photosDataUrls,
      (_index, mime) =>
        `inquiries/${inquiryId}/auth-return/${randomUUID()}.${extFromMime(mime)}`,
      parseImageDataUrl,
      { metadata: { context: 'coordinator_return' } },
    );
    if (saved.length === 0) {
      throw new BadRequestException(
        'At least one valid issue photo is required.',
      );
    }
    inquiry.returnReasons = body.returnReasons;
    inquiry.priceRangeMin = body.priceRangeMin;
    inquiry.priceRangeMax = body.priceRangeMax;
    inquiry.status = InquiryStatus.AUTHENTICATED_RETURNED;
    await this.inquiriesRepo.save(inquiry);
  }
}
