import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Between, EntityManager, In, Repository } from 'typeorm';
import {
  Inquiry,
  type InquiryItemSnapshot,
} from '../inquiries/entities/inquiry.entity';
import {
  formatInventorySku,
  utcDayRange,
  utcInventoryDayLockKey,
} from './inventory-sku.util';
import { Employee } from '../employees/entities/employee.entity';
import { InventoryItem } from './entities/inventory-item.entity';
import { ItemAuthentication } from './entities/item-authentication.entity';
import { ItemPhotoshoot } from './entities/item-photoshoot.entity';
import { ItemPosting } from './entities/item-posting.entity';
import { ItemAuthenticationMetric } from './entities/item-authentication-metric.entity';
import { AuthenticationMetric } from '../authentication-metrics/entities/authentication-metric.entity';
import { CreateItemPhotoshootsDto } from './dto/create-item-photoshoots.dto';
import { BatchAssignAuthenticatorDto } from './dto/batch-assign-authenticator.dto';
import type { MulterFile } from '../inquiries/multer-file.type';
import { S3StorageService } from '../inquiries/s3-storage.service';
import { ItemAuthenticationSnapshotFormDto } from './dto/item-authentication-snapshot-form.dto';
import { SaveItemAuthenticationMetricsDto } from './dto/save-item-authentication-metrics.dto';
import { ForThirdPartyAuthenticationDto } from './dto/for-third-party-authentication.dto';
import { ReturnToCoordinatorDto } from './dto/return-to-coordinator.dto';
import { UpdateInventoryPricingDto } from './dto/update-inventory-pricing.dto';
import { CreateItemPostingDto } from './dto/create-item-posting.dto';
import { ScheduleItemPostingsDto } from './dto/schedule-item-postings.dto';
import { InquiryStatus } from '../enums/inquiry-status.enum';
import { InquiriesService } from '../inquiries/inquiries.service';
import { CONSIGNMENT_COORDINATOR_POSITION } from '../notifications/notification.constants';
import { NotificationsService } from '../notifications/notifications.service';

const PHOTOSHOOT_ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

function photoshootExtFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m === 'image/jpeg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/heic' || m === 'image/heif') return 'heic';
  return 'bin';
}

function parsePhotoshootSnapshotImages(
  snapshot: Record<string, unknown> | null,
): Array<{ key: string; url: string }> {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const images = snapshot['images'];
  if (!Array.isArray(images)) return [];
  const out: Array<{ key: string; url: string }> = [];
  for (const img of images) {
    if (!img || typeof img !== 'object') continue;
    const rec = img as { key?: unknown; url?: unknown };
    if (typeof rec.key !== 'string' || typeof rec.url !== 'string') continue;
    const key = rec.key.trim();
    const url = rec.url.trim();
    if (!key || !url) continue;
    out.push({ key, url });
  }
  return out;
}

export type ItemPhotoshootCalendarRow = {
  id: string;
  inventoryItemId: string;
  /** `YYYY-MM-DD` */
  photoshootDate: string;
  sku: string;
  itemLabel: string;
  inclusions: string;
  consignorName: string | null;
  /** Saved S3-backed images from `photos_snapshot`. */
  photos: Array<{ key: string; url: string }>;
};

export type ItemPostingCalendarRow = {
  id: string;
  inventoryItemId: string;
  postingDate: string | null;
  sku: string;
  itemLabel: string;
  inclusions: string;
  consignorName: string | null;
  productName: string;
  collections: string[];
  tags: string[];
};

export type InventoryListRow = {
  id: string;
  sku: string;
  dateReceived: string;
  inquiryId: string | null;
  consignorName: string | null;
  status: string;
  transactionType: string | null;
  currentBranch: string;
  itemLabel: string;
  inclusions: string;
  /** From item snapshot form (`marketPrice`), if set. */
  marketPrice: string | null;
  /** From item snapshot form (`retailPrice`), if set. */
  retailPrice: string | null;
  /** Linked inquiry staff offer (`inquiries.offer_price`), if any. */
  consignorPrice: string | null;
  /** TBH listed selling price (`inventory_items.tbh_selling_price`). */
  tbhSellingPrice: string | null;
  /** Display name of assigned authenticator, if any. */
  assignedToName: string | null;
  /** From item_authentication row; defaults to Pending when missing. */
  authenticationStatus: string;
};

export type InventoryDetailForStaff = {
  id: string;
  sku: string;
  dateReceived: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  transactionType: string | null;
  currentBranch: string;
  inquiryId: string | null;
  inquirySku: string | null;
  consignorId: string | null;
  consignorName: string | null;
  consignorEmail: string | null;
  consignorPhone: string | null;
  /** Employee id when an authenticator is assigned (item_authentication.assigned_to_id). */
  assignedToEmployeeId: string | null;
  assignedToName: string | null;
  /** `item_authentication.authentication_status` (e.g. Pending, Approved). */
  authenticationStatus: string;
  thirdPartyAuthentication: {
    selectedAuthenticator: 'LegitGrails' | 'Entrupy' | null;
    certificateLink: string | null;
    certificatePhotos: string[];
    notes: string | null;
  } | null;
  /** Staff-facing notes for consignor during third-party reauthentication handoff. */
  reauthenticationNotes: string | null;
  /** Staff offer on linked inquiry (`inquiries.offer_price`), if any. */
  inquiryOfferPrice: string | null;
  /** TBH listed selling price (`inventory_items.tbh_selling_price`). */
  tbhSellingPrice: string | null;
  /** When true, VIP/program discount logic may apply (`inventory_items.enable_discount`). */
  enableDiscount: boolean;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
  };
  itemPosting: {
    id: string;
    postingDate: string | null;
    productName: string;
    collections: string[];
    tags: string[];
    priceComparison: string | null;
    productDescription: string | null;
    selectedPhotosSnapshot: Array<Record<string, unknown>>;
  } | null;
};

export type ItemAuthenticationMetricApiRow = {
  authenticationMetricId: string;
  notes: string | null;
  metricStatus: string | null;
  photos: string[] | null;
};

/** One line in the authentication checklist summary (linked inquiry detail). */
export type AuthenticationSummaryRowForInquiry = {
  metric: string;
  metricStatus: string | null;
  notes: string | null;
};

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

function inclusionsFromSnapshot(
  snapshot: InquiryItemSnapshot | null | undefined,
): string {
  if (!snapshot?.form) return '—';
  const v = snapshot.form['inclusions'];
  if (v == null) return '—';
  const s = String(v).trim();
  return s.length > 0 ? s : '—';
}

function priceFieldFromSnapshot(
  snapshot: InquiryItemSnapshot | null | undefined,
  key: 'marketPrice' | 'retailPrice',
): string | null {
  if (!snapshot?.form) return null;
  const v = snapshot.form[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function normalizedOfferPriceString(
  offer: string | number | null | undefined,
): string | null {
  if (offer == null) return null;
  const s = String(offer).trim();
  return s.length > 0 ? s : null;
}

function normalizeOptionalText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const s = String(value ?? '').trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function normalizeSelectedPhotosSnapshot(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      entry != null && typeof entry === 'object' && !Array.isArray(entry),
  );
}

function normalizePostingDate(value: string | null | undefined): Date | null {
  if (value == null || String(value).trim() === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException('Invalid posting date.');
  }
  return d;
}

function normalizePriceComparison(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new BadRequestException('Invalid price comparison.');
  }
  return n.toFixed(2);
}

/**
 * Consignor mark-up % vs inquiry offer (`sell - cost`) / cost;
 * null if TBH selling price doesn't apply as a quotient (missing/zero cost).
 */
function markupPercentFromOfferOrNull(
  tbhSelling: string | null,
  inquiryOfferRaw: string | number | null | undefined,
): number | null {
  if (tbhSelling == null) return null;
  const sell = Number(String(tbhSelling).trim());
  if (!Number.isFinite(sell)) return null;
  const costStr = normalizedOfferPriceString(inquiryOfferRaw);
  if (costStr == null) return null;
  const cost = Number(String(costStr).trim());
  if (!Number.isFinite(cost) || cost === 0) return null;
  return ((sell - cost) / cost) * 100;
}

function photoshootDayKey(value: Date | string): string {
  if (typeof value === 'string') {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    return m ? m[1] : value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function formatEmployeeName(
  e: Pick<Employee, 'firstName' | 'lastName'> | null | undefined,
): string | null {
  if (!e) return null;
  const name = [e.firstName, e.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : null;
}

function isAuthenticatorPosition(position: string): boolean {
  return position.trim().toLowerCase() === 'authenticator';
}

function normalizeThirdPartyAuthenticationData(
  raw:
    | {
        selectedAuthenticator?: unknown;
        certificateLink?: unknown;
        certificatePhotos?: unknown;
        notes?: unknown;
      }
    | null
    | undefined,
): {
  selectedAuthenticator: 'LegitGrails' | 'Entrupy' | null;
  certificateLink: string | null;
  certificatePhotos: string[];
  notes: string | null;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const selectedAuthenticator =
    raw.selectedAuthenticator === 'LegitGrails' ||
    raw.selectedAuthenticator === 'Entrupy'
      ? raw.selectedAuthenticator
      : null;
  const certificateLink =
    typeof raw.certificateLink === 'string' && raw.certificateLink.trim() !== ''
      ? raw.certificateLink.trim()
      : null;
  const certificatePhotos = Array.isArray(raw.certificatePhotos)
    ? raw.certificatePhotos
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        .map((v) => v.trim())
    : [];
  const notes =
    typeof raw.notes === 'string' && raw.notes.trim() !== ''
      ? raw.notes.trim()
      : null;
  if (
    selectedAuthenticator == null &&
    certificateLink == null &&
    certificatePhotos.length === 0 &&
    notes == null
  ) {
    return null;
  }
  return { selectedAuthenticator, certificateLink, certificatePhotos, notes };
}

function mergeItemAuthenticationFormIntoSnapshot(
  item: InventoryItem,
  patch: ItemAuthenticationSnapshotFormDto,
): void {
  const base = item.itemSnapshot;
  const form: Record<string, unknown> = {
    ...(base.form ? { ...base.form } : {}),
  };
  const set = (key: keyof ItemAuthenticationSnapshotFormDto) => {
    const v = patch[key];
    if (v === undefined) return;
    form[key] = String(v).trim();
  };
  set('itemModel');
  set('brand');
  set('category');
  set('serialNumber');
  set('color');
  set('material');
  set('inclusions');
  set('dimensions');
  set('rating');
  set('marketPrice');
  set('retailPrice');
  set('marketResearchNotes');
  set('marketResearchLink');
  set('authenticatorNotes');
  item.itemSnapshot = {
    clientItemId: base.clientItemId,
    images: Array.isArray(base.images) ? [...base.images] : [],
    form,
  };
}

const FOR_AUTHENTICATION_INVENTORY_STATUS = 'For Authentication';
const FOR_PHOTOSHOOT_INVENTORY_STATUS = 'For Photoshoot';
const FOR_PRICING_INVENTORY_STATUS = 'For Pricing';
const FOR_EDITING_INVENTORY_STATUS = 'For Editing';
const FOR_POSTING_INVENTORY_STATUS = 'For Posting';

const UPDATE_TBH_PRICE_ALLOWED_INVENTORY_STATUSES = new Set<string>([
  FOR_PRICING_INVENTORY_STATUS,
  FOR_EDITING_INVENTORY_STATUS,
]);
const MIN_PHOTOS_TO_FINISH_PHOTOSHOOT = 4;
const AUTHENTICATED_FOR_RENEGOTIATION_INVENTORY_STATUS =
  'Authenticated: For renegotiation';
const APPROVED_ITEM_AUTHENTICATION_STATUS = 'Approved';
const FOR_RENEGOTIATION_ITEM_AUTHENTICATION_STATUS = 'For renegotiation';
const AUTHENTICATED_REQUESTED_FOR_REAUTHENTICATION_INVENTORY_STATUS =
  'Authenticated: Requested for Reauthentication';
const REQUESTED_FOR_REAUTHENTICATION_ITEM_AUTH_STATUS =
  'Requested for Reauthentication';
const AUTHENTICATION_REJECTED_INVENTORY_STATUS = 'Authentication Rejected';
const REJECTED_ITEM_AUTHENTICATION_STATUS = 'Rejected';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(ItemPhotoshoot)
    private readonly itemPhotoshootRepo: Repository<ItemPhotoshoot>,
    @InjectRepository(ItemPosting)
    private readonly itemPostingRepo: Repository<ItemPosting>,
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
    @InjectRepository(ItemAuthentication)
    private readonly itemAuthRepo: Repository<ItemAuthentication>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    @InjectRepository(ItemAuthenticationMetric)
    private readonly itemAuthMetricRepo: Repository<ItemAuthenticationMetric>,
    @InjectRepository(AuthenticationMetric)
    private readonly authenticationMetricRepo: Repository<AuthenticationMetric>,
    @Inject(forwardRef(() => InquiriesService))
    private readonly inquiriesService: InquiriesService,
    private readonly notifications: NotificationsService,
    private readonly s3: S3StorageService,
  ) {}

  /**
   * Ensures the actor may edit item-authentication data for this inventory row.
   * Optionally creates a pending `item_authentication` row (save flow).
   */
  private async enforceAuthenticatorAccess(
    inventoryItemId: string,
    actor: { userId: string; isAdmin: boolean },
    options: { createIfMissing: boolean },
  ): Promise<ItemAuthentication> {
    let auth = await this.itemAuthRepo.findOne({
      where: { inventoryItemId },
    });
    if (!auth) {
      if (!options.createIfMissing) {
        throw new BadRequestException('Item authentication record not found.');
      }
      auth = this.itemAuthRepo.create({
        inventoryItemId,
        assignedToId: null,
        authenticationStatus: 'Pending',
        createdById: null,
        updatedById: null,
      });
      await this.itemAuthRepo.save(auth);
    }
    if (!actor.isAdmin) {
      const employee = await this.employeesRepo.findOne({
        where: { userId: actor.userId },
      });
      const assigneeId = auth.assignedToId;
      if (assigneeId != null) {
        if (!employee?.id || employee.id !== assigneeId) {
          throw new ForbiddenException(
            'Only the assigned authenticator can perform this action.',
          );
        }
      }
    }
    return auth;
  }

  /**
   * Creates one inventory row and a pending item_authentication row (same as
   * schedule receive). Caller may wrap in a transaction with other writes.
   */
  async createInventoryAndItemAuthenticationForInquiry(
    em: EntityManager,
    inquiry: Pick<Inquiry, 'id' | 'consignorId' | 'offerTransactionType'>,
    itemSnapshot: InquiryItemSnapshot,
    currentBranch: string,
  ): Promise<void> {
    const refDate = new Date();
    await em.query(`SELECT pg_advisory_xact_lock(hashtext($1::text)::bigint)`, [
      utcInventoryDayLockKey(refDate),
    ]);
    const bounds = utcDayRange(refDate);
    const countToday = await em.count(InventoryItem, {
      where: { dateReceived: Between(bounds.start, bounds.end) },
    });
    const seq = countToday + 1;
    const sku = formatInventorySku(refDate, seq);
    const transactionType =
      inquiry.offerTransactionType === 'direct_purchase' ||
      inquiry.offerTransactionType === 'consignment'
        ? inquiry.offerTransactionType
        : null;

    const inventoryRow = em.create(InventoryItem, {
      sku,
      dateReceived: refDate,
      inquiryId: inquiry.id,
      consignorId: inquiry.consignorId,
      status: FOR_AUTHENTICATION_INVENTORY_STATUS,
      transactionType,
      currentBranch,
      itemSnapshot,
      createdById: null,
      updatedById: null,
    });
    await em.save(inventoryRow);

    const itemAuth = em.create(ItemAuthentication, {
      inventoryItemId: inventoryRow.id,
      assignedToId: null,
      authenticationStatus: 'Pending',
      createdById: null,
      updatedById: null,
    });
    await em.save(itemAuth);
  }

  /**
   * Client re-confirmed after authentication return and a new staff offer:
   * linked inventory moves to photoshoot; authentication marked approved.
   */
  async finalizeInventoryAfterAuthenticatedNewOfferConfirm(
    em: EntityManager,
    inquiryId: string,
    offerTransactionType: 'consignment' | 'direct_purchase' | null,
  ): Promise<void> {
    const existingInv = await em.findOne(InventoryItem, {
      where: { inquiryId },
    });
    if (!existingInv) {
      return;
    }
    const tx =
      offerTransactionType === 'direct_purchase' ||
      offerTransactionType === 'consignment'
        ? offerTransactionType
        : null;
    existingInv.status = FOR_PHOTOSHOOT_INVENTORY_STATUS;
    existingInv.transactionType = tx;
    existingInv.updatedById = null;
    await em.save(existingInv);
    const auth = await em.findOne(ItemAuthentication, {
      where: { inventoryItemId: existingInv.id },
    });
    if (auth) {
      auth.authenticationStatus = APPROVED_ITEM_AUTHENTICATION_STATUS;
      auth.assignedToId = null;
      auth.updatedById = null;
      await em.save(auth);
    }
  }

  async getItemAuthenticationMetricsForInventoryItem(
    inventoryItemId: string,
  ): Promise<ItemAuthenticationMetricApiRow[]> {
    const auth = await this.itemAuthRepo.findOne({
      where: { inventoryItemId },
    });
    if (!auth) {
      return [];
    }
    const rows = await this.itemAuthMetricRepo.find({
      where: { itemAuthenticationId: auth.id },
    });
    return rows.map((row) => ({
      authenticationMetricId: row.authenticationMetricId,
      notes: row.notes,
      metricStatus: row.metricStatus,
      photos: row.photos,
    }));
  }

  async saveItemAuthenticationMetrics(
    inventoryItemId: string,
    dto: SaveItemAuthenticationMetricsDto,
    actor: { userId: string; isAdmin: boolean },
  ): Promise<{ saved: number }> {
    const item = await this.inventoryRepo.findOne({
      where: { id: inventoryItemId },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    const auth = await this.enforceAuthenticatorAccess(inventoryItemId, actor, {
      createIfMissing: true,
    });
    await this.itemAuthMetricRepo.manager.transaction(async (em) => {
      if (dto.itemSnapshotForm) {
        const inv = await em.findOne(InventoryItem, {
          where: { id: inventoryItemId },
        });
        if (!inv) {
          throw new NotFoundException('Inventory item not found');
        }
        mergeItemAuthenticationFormIntoSnapshot(inv, dto.itemSnapshotForm);
        inv.updatedById = actor.userId;
        await em.save(inv);
      }

      const itemAuthId = auth!.id;
      auth.thirdPartyAuthenticationData = normalizeThirdPartyAuthenticationData(
        dto.thirdPartyAuthentication,
      );
      auth.updatedById = actor.userId;
      await em.save(auth);
      for (const row of dto.rows) {
        const notes =
          row.notes == null || String(row.notes).trim() === ''
            ? null
            : String(row.notes).trim();
        const photos =
          row.photos === undefined
            ? null
            : row.photos === null
              ? null
              : Array.isArray(row.photos) && row.photos.length > 0
                ? row.photos
                : null;
        let existing = await em.findOne(ItemAuthenticationMetric, {
          where: {
            itemAuthenticationId: itemAuthId,
            authenticationMetricId: row.authenticationMetricId,
          },
        });
        if (!existing) {
          existing = em.create(ItemAuthenticationMetric, {
            itemAuthenticationId: itemAuthId,
            authenticationMetricId: row.authenticationMetricId,
            notes,
            metricStatus: row.metricStatus ?? null,
            photos,
          });
        } else {
          existing.notes = notes;
          existing.metricStatus = row.metricStatus ?? null;
          existing.photos = photos;
        }
        await em.save(existing);
      }
    });
    return { saved: dto.rows.length };
  }

  /**
   * Marks inventory as For Photoshoot and sets inquiry contract dates when linked.
   */
  async approveAuthenticationForInventoryItem(
    inventoryItemId: string,
    actor: { userId: string; isAdmin: boolean },
  ): Promise<{ status: string }> {
    const item = await this.inventoryRepo.findOne({
      where: { id: inventoryItemId },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    if (item.status !== FOR_AUTHENTICATION_INVENTORY_STATUS) {
      throw new BadRequestException(
        `Only items in "${FOR_AUTHENTICATION_INVENTORY_STATUS}" status can be approved from authentication.`,
      );
    }
    const auth = await this.enforceAuthenticatorAccess(inventoryItemId, actor, {
      createIfMissing: false,
    });
    auth.authenticationStatus = APPROVED_ITEM_AUTHENTICATION_STATUS;
    auth.updatedById = actor.userId;
    await this.itemAuthRepo.save(auth);

    item.status = FOR_PHOTOSHOOT_INVENTORY_STATUS;
    item.updatedById = actor.userId;
    await this.inventoryRepo.save(item);

    if (item.inquiryId) {
      await this.inquiriesService.populateContractDatesForInquiry(
        item.inquiryId,
      );
    }

    return { status: item.status };
  }

  /**
   * Records an authenticator request for paid 3rd party re-authentication: inquiry,
   * inventory, and item_auth are updated in one transaction. Consignor pays next.
   * Requires a linked inquiry.
   */
  async markForThirdPartyAuthenticationForInventoryItem(
    inventoryItemId: string,
    dto: ForThirdPartyAuthenticationDto,
    actor: { userId: string; isAdmin: boolean },
  ): Promise<{ status: string; authenticationStatus: string }> {
    const item0 = await this.inventoryRepo.findOne({
      where: { id: inventoryItemId },
    });
    if (!item0) {
      throw new NotFoundException('Inventory item not found');
    }
    if (!item0.inquiryId) {
      throw new BadRequestException(
        'This inventory item is not linked to an inquiry.',
      );
    }
    if (item0.status !== FOR_AUTHENTICATION_INVENTORY_STATUS) {
      throw new BadRequestException(
        `Only items in "${FOR_AUTHENTICATION_INVENTORY_STATUS}" can be sent for 3rd party authentication.`,
      );
    }
    await this.enforceAuthenticatorAccess(inventoryItemId, actor, {
      createIfMissing: false,
    });

    const { status, authenticationStatus } =
      await this.inventoryRepo.manager.transaction(
        async (em: EntityManager) => {
          const item = await em.findOne(InventoryItem, {
            where: { id: inventoryItemId },
          });
          if (!item || !item.inquiryId) {
            throw new NotFoundException('Inventory item or inquiry not found');
          }
          if (item.status !== FOR_AUTHENTICATION_INVENTORY_STATUS) {
            throw new BadRequestException(
              `This item is no longer in "${FOR_AUTHENTICATION_INVENTORY_STATUS}" status.`,
            );
          }
          const inquiry = await em.findOne(Inquiry, {
            where: { id: item.inquiryId },
          });
          if (!inquiry) {
            throw new NotFoundException('Inquiry not found');
          }
          if (
            inquiry.status === InquiryStatus.DECLINED ||
            inquiry.status === InquiryStatus.CANCELLED
          ) {
            throw new BadRequestException('This inquiry cannot be updated');
          }
          const auth = await em.findOne(ItemAuthentication, {
            where: { inventoryItemId },
          });
          if (!auth) {
            throw new BadRequestException(
              'Item authentication record not found.',
            );
          }

          inquiry.thirdPartyReauthenticationReasons =
            dto.reauthenticationReasons;
          inquiry.status =
            InquiryStatus.AUTHENTICATED_REQUESTED_FOR_REAUTHENTICATION;

          await this.inquiriesService.attachThirdPartyAuthRequestEvidence(
            inquiry,
            {
              photosDataUrls: dto.issuePhotos,
            },
          );

          await em.save(inquiry);

          auth.authenticationStatus =
            REQUESTED_FOR_REAUTHENTICATION_ITEM_AUTH_STATUS;
          auth.updatedById = actor.userId;
          await em.save(auth);

          item.status =
            AUTHENTICATED_REQUESTED_FOR_REAUTHENTICATION_INVENTORY_STATUS;
          item.updatedById = actor.userId;
          await em.save(item);

          return {
            status: item.status,
            authenticationStatus: auth.authenticationStatus,
          };
        },
      );

    void this.inquiriesService
      .onInquirySentForThirdPartyAuthentication(item0.inquiryId)
      .catch((err: unknown) => {
        this.logger.error('3rd party authentication notifications failed', err);
      });

    return { status, authenticationStatus };
  }

  /**
   * Rejects the item at authentication: inventory and item-auth are marked rejected.
   */
  async rejectAuthenticationForInventoryItem(
    inventoryItemId: string,
    actor: { userId: string; isAdmin: boolean },
  ): Promise<{ status: string; authenticationStatus: string }> {
    const item = await this.inventoryRepo.findOne({
      where: { id: inventoryItemId },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    if (item.status !== FOR_AUTHENTICATION_INVENTORY_STATUS) {
      throw new BadRequestException(
        `Only items in "${FOR_AUTHENTICATION_INVENTORY_STATUS}" can be rejected from authentication.`,
      );
    }
    const auth = await this.enforceAuthenticatorAccess(inventoryItemId, actor, {
      createIfMissing: false,
    });
    auth.authenticationStatus = REJECTED_ITEM_AUTHENTICATION_STATUS;
    auth.updatedById = actor.userId;
    await this.itemAuthRepo.save(auth);

    item.status = AUTHENTICATION_REJECTED_INVENTORY_STATUS;
    item.updatedById = actor.userId;
    await this.inventoryRepo.save(item);

    return {
      status: item.status,
      authenticationStatus: auth.authenticationStatus,
    };
  }

  private normalizeOptionalPriceField(raw: string | undefined): string | null {
    if (raw == null) return null;
    const s = String(raw)
      .trim()
      .replace(/,/g, '')
      .replace(/^\u20b1\s?/i, '');
    if (s === '') return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException(
        'Suggested price range values must be non-negative numbers.',
      );
    }
    return n.toFixed(2);
  }

  /**
   * Saves return-to-coordinator data on the linked inquiry, uploads issue photos to S3,
   * and sets inventory / authentication status for renegotiation.
   */
  async returnToCoordinatorForInventoryItem(
    inventoryItemId: string,
    dto: ReturnToCoordinatorDto,
    actor: { userId: string; isAdmin: boolean },
  ): Promise<{ status: string; authenticationStatus: string }> {
    const item = await this.inventoryRepo.findOne({
      where: { id: inventoryItemId },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    if (!item.inquiryId) {
      throw new BadRequestException(
        'This inventory item is not linked to an inquiry.',
      );
    }
    if (item.status !== FOR_AUTHENTICATION_INVENTORY_STATUS) {
      throw new BadRequestException(
        `Only items in "${FOR_AUTHENTICATION_INVENTORY_STATUS}" can be returned to the coordinator.`,
      );
    }
    await this.enforceAuthenticatorAccess(inventoryItemId, actor, {
      createIfMissing: false,
    });
    const auth = await this.itemAuthRepo.findOne({
      where: { inventoryItemId },
    });
    if (!auth) {
      throw new BadRequestException('Item authentication record not found.');
    }

    const reasons = dto.returnReasons.trim();
    if (reasons === '') {
      throw new BadRequestException('Reasons for renegotiation are required.');
    }

    const minStr = this.normalizeOptionalPriceField(dto.priceRangeMin);
    const maxStr = this.normalizeOptionalPriceField(dto.priceRangeMax);
    if (minStr == null || maxStr == null) {
      throw new BadRequestException(
        'Suggested price range (minimum and maximum) is required.',
      );
    }
    if (Number(minStr) > Number(maxStr)) {
      throw new BadRequestException(
        'Suggested price range: minimum cannot be greater than maximum.',
      );
    }

    await this.inquiriesService.applyAuthenticationReturn(item.inquiryId, {
      returnReasons: reasons,
      priceRangeMin: minStr,
      priceRangeMax: maxStr,
      photosDataUrls: dto.returnPhotos,
    });

    item.status = AUTHENTICATED_FOR_RENEGOTIATION_INVENTORY_STATUS;
    item.updatedById = actor.userId;
    await this.inventoryRepo.save(item);

    auth.authenticationStatus = FOR_RENEGOTIATION_ITEM_AUTHENTICATION_STATUS;
    auth.updatedById = actor.userId;
    await this.itemAuthRepo.save(auth);

    if (item.inquiryId) {
      void this.notifications
        .notify({
          message: `An authenticator sent inventory item ${item.sku} back for renegotiation.`,
          receiverRole: CONSIGNMENT_COORDINATOR_POSITION,
          inquiryId: item.inquiryId,
        })
        .catch((err: unknown) => {
          this.logger.error(
            'Failed to notify coordinators of authentication renegotiation',
            err,
          );
        });
    }

    return {
      status: item.status,
      authenticationStatus: auth.authenticationStatus,
    };
  }

  async listAuthenticators(): Promise<{ id: string; displayName: string }[]> {
    const rows = await this.employeesRepo
      .createQueryBuilder('e')
      .where('LOWER(TRIM(e.position)) = :p', { p: 'authenticator' })
      .orderBy('e.lastName', 'ASC')
      .addOrderBy('e.firstName', 'ASC')
      .getMany();
    return rows.map((e) => ({
      id: e.id,
      displayName: formatEmployeeName(e) ?? e.email,
    }));
  }

  async batchAssignAuthenticator(
    dto: BatchAssignAuthenticatorDto,
    actorUserId: string,
  ): Promise<{ updated: number }> {
    const employee = await this.employeesRepo.findOne({
      where: { id: dto.employeeId },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (!isAuthenticatorPosition(employee.position)) {
      throw new BadRequestException(
        'Selected person is not in the Authenticator position.',
      );
    }
    const uniqueIds = [...new Set(dto.inventoryItemIds)];
    await this.itemAuthRepo.manager.transaction(async (em) => {
      for (const inventoryItemId of uniqueIds) {
        const item = await em.findOne(InventoryItem, {
          where: { id: inventoryItemId },
        });
        if (!item) {
          throw new NotFoundException(
            `Inventory item ${inventoryItemId} not found`,
          );
        }
        if (item.status !== FOR_AUTHENTICATION_INVENTORY_STATUS) {
          throw new BadRequestException(
            `Item ${item.sku} is not in "For Authentication" status.`,
          );
        }
        let auth = await em.findOne(ItemAuthentication, {
          where: { inventoryItemId },
        });
        if (!auth) {
          auth = em.create(ItemAuthentication, {
            inventoryItemId,
            assignedToId: dto.employeeId,
            authenticationStatus: 'Pending',
            createdById: actorUserId,
            updatedById: actorUserId,
          });
        } else {
          auth.assignedToId = dto.employeeId;
          auth.updatedById = actorUserId;
        }
        await em.save(auth);
      }
    });
    return { updated: uniqueIds.length };
  }

  async findAllForStaff(): Promise<InventoryListRow[]> {
    const rows = await this.inventoryRepo.find({
      relations: { inquiry: true, consignor: true },
      order: { dateReceived: 'DESC' },
    });
    const ids = rows.map((r) => r.id);
    let authByItemId = new Map<string, ItemAuthentication>();
    if (ids.length > 0) {
      const auths = await this.itemAuthRepo.find({
        where: { inventoryItemId: In(ids) },
        relations: { assignedTo: true },
      });
      authByItemId = new Map(auths.map((a) => [a.inventoryItemId, a]));
    }
    return rows.map((r) => {
      const name = r.consignor
        ? [r.consignor.firstName, r.consignor.lastName]
            .filter(Boolean)
            .join(' ')
            .trim()
        : '';
      const auth = authByItemId.get(r.id);
      return {
        id: r.id,
        sku: r.sku,
        dateReceived: r.dateReceived.toISOString(),
        inquiryId: r.inquiryId,
        consignorName: name || null,
        status: r.status,
        transactionType: r.transactionType,
        currentBranch: r.currentBranch,
        itemLabel: itemLabelFromSnapshot(r.itemSnapshot),
        inclusions: inclusionsFromSnapshot(r.itemSnapshot),
        marketPrice: priceFieldFromSnapshot(r.itemSnapshot, 'marketPrice'),
        retailPrice: priceFieldFromSnapshot(r.itemSnapshot, 'retailPrice'),
        consignorPrice: normalizedOfferPriceString(r.inquiry?.offerPrice),
        tbhSellingPrice:
          r.tbhSellingPrice != null &&
          String(r.tbhSellingPrice).trim() !== ''
            ? String(r.tbhSellingPrice)
            : null,
        assignedToName: formatEmployeeName(auth?.assignedTo ?? null),
        authenticationStatus: auth?.authenticationStatus ?? 'Pending',
      };
    });
  }

  async updateInventoryPricing(
    id: string,
    dto: UpdateInventoryPricingDto,
    actorUserId: string,
  ): Promise<{
    id: string;
    tbhSellingPrice: string | null;
    status: string;
  }> {
    const item = await this.inventoryRepo.findOne({
      where: { id },
      relations: { inquiry: true },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    if (!UPDATE_TBH_PRICE_ALLOWED_INVENTORY_STATUSES.has(item.status)) {
      throw new BadRequestException(
        'TBH selling price can only be updated for items in For Pricing or For Editing status.',
      );
    }
    const raw = dto.tbhSellingPrice;
    let next: string | null;
    if (raw == null || String(raw).trim() === '') {
      next = null;
    } else {
      const n = Number(String(raw).trim());
      if (!Number.isFinite(n) || n < 0) {
        throw new BadRequestException('Invalid TBH selling price.');
      }
      next = n.toFixed(2);
    }
    item.tbhSellingPrice = next;
    if (next != null) {
      const pct = markupPercentFromOfferOrNull(
        next,
        item.inquiry?.offerPrice,
      );
      if (pct == null || pct > 0) {
        item.status = FOR_EDITING_INVENTORY_STATUS;
      }
    }
    item.updatedById = actorUserId;
    await this.inventoryRepo.save(item);
    return { id: item.id, tbhSellingPrice: next, status: item.status };
  }

  async createItemPosting(
    inventoryItemId: string,
    dto: CreateItemPostingDto,
    actorUserId: string,
    options: { updateStatus: boolean } = { updateStatus: true },
  ): Promise<{ id: string; status: string; itemPostingId: string }> {
    const productName = String(dto.productName ?? '').trim();
    if (!productName) {
      throw new BadRequestException('Product name is required.');
    }
    const shouldUpdatePostingDate = dto.postingDate !== undefined;
    const postingDate = shouldUpdatePostingDate
      ? normalizePostingDate(dto.postingDate)
      : null;
    const priceComparison = normalizePriceComparison(dto.priceComparison);
    const collections = normalizeStringArray(dto.collections);
    const tags = normalizeStringArray(dto.tags);
    const productDescription = normalizeOptionalText(dto.productDescription);
    const selectedPhotosSnapshot = normalizeSelectedPhotosSnapshot(
      dto.selectedPhotosSnapshot,
    );

    return this.itemPostingRepo.manager.transaction(async (em) => {
      const item = await em.findOne(InventoryItem, {
        where: { id: inventoryItemId },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }

      if (options.updateStatus) {
        item.status = FOR_POSTING_INVENTORY_STATUS;
        item.updatedById = actorUserId;
        await em.save(item);
      }

      let posting = await em.findOne(ItemPosting, {
        where: { inventoryItemId },
      });
      if (!posting) {
        posting = em.create(ItemPosting, {
          inventoryItemId,
          postingDate: null,
          createdById: actorUserId,
        });
      }

      if (shouldUpdatePostingDate) {
        posting.postingDate = postingDate;
      }
      posting.productName = productName;
      posting.collections = collections;
      posting.tags = tags;
      posting.priceComparison = priceComparison;
      posting.productDescription = productDescription;
      posting.selectedPhotosSnapshot = selectedPhotosSnapshot;
      posting.updatedById = actorUserId;
      await em.save(posting);

      return {
        id: item.id,
        status: item.status,
        itemPostingId: posting.id,
      };
    });
  }

  async findOneForStaff(id: string): Promise<InventoryDetailForStaff> {
    const r = await this.inventoryRepo.findOne({
      where: { id },
      relations: { inquiry: true, consignor: true },
    });
    if (!r) {
      throw new NotFoundException('Inventory item not found');
    }
    const c = r.consignor;
    const name = c
      ? [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
      : '';
    const auth = await this.itemAuthRepo.findOne({
      where: { inventoryItemId: id },
      relations: { assignedTo: true },
    });
    const posting = await this.itemPostingRepo.findOne({
      where: { inventoryItemId: id },
    });
    return {
      id: r.id,
      sku: r.sku,
      dateReceived: r.dateReceived.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      status: r.status,
      transactionType: r.transactionType,
      currentBranch: r.currentBranch,
      inquiryId: r.inquiryId,
      inquirySku: r.inquiry?.sku ?? null,
      consignorId: r.consignorId,
      consignorName: name || null,
      consignorEmail: c?.email?.trim() ?? null,
      consignorPhone: c?.contactNumber?.trim() ?? null,
      assignedToEmployeeId: auth?.assignedToId ?? null,
      assignedToName: formatEmployeeName(auth?.assignedTo ?? null),
      authenticationStatus: auth?.authenticationStatus ?? 'Pending',
      thirdPartyAuthentication: normalizeThirdPartyAuthenticationData(
        auth?.thirdPartyAuthenticationData,
      ),
      reauthenticationNotes:
        auth?.reauthenticationNotes != null &&
        String(auth.reauthenticationNotes).trim() !== ''
          ? String(auth.reauthenticationNotes).trim()
          : null,
      inquiryOfferPrice:
        r.inquiry?.offerPrice != null &&
        String(r.inquiry.offerPrice).trim() !== ''
          ? String(r.inquiry.offerPrice)
          : null,
      tbhSellingPrice:
        r.tbhSellingPrice != null && String(r.tbhSellingPrice).trim() !== ''
          ? String(r.tbhSellingPrice)
          : null,
      enableDiscount: r.enableDiscount,
      itemSnapshot: {
        clientItemId: r.itemSnapshot.clientItemId,
        form: (r.itemSnapshot.form ?? {}) as Record<string, unknown>,
      },
      itemPosting: posting
        ? {
            id: posting.id,
            postingDate: posting.postingDate
              ? posting.postingDate.toISOString()
              : null,
            productName: posting.productName,
            collections: posting.collections,
            tags: posting.tags,
            priceComparison:
              posting.priceComparison != null &&
              String(posting.priceComparison).trim() !== ''
                ? String(posting.priceComparison)
                : null,
            productDescription: posting.productDescription,
            selectedPhotosSnapshot: posting.selectedPhotosSnapshot,
          }
        : null,
    };
  }

  /**
   * Metrics with pass/fail/skip or notes for the inventory row linked to this inquiry.
   */
  async getAuthenticationSummaryForInquiry(
    inquiryId: string,
  ): Promise<AuthenticationSummaryRowForInquiry[]> {
    const item = await this.inventoryRepo.findOne({
      where: { inquiryId },
      select: { id: true },
    });
    if (!item) {
      return [];
    }
    const apiRows = await this.getItemAuthenticationMetricsForInventoryItem(
      item.id,
    );
    const withData = apiRows.filter((row) => {
      const notesTrim = row.notes == null ? '' : String(row.notes).trim();
      const hasNotes = notesTrim !== '';
      const hasVerdict =
        row.metricStatus === 'pass' ||
        row.metricStatus === 'fail' ||
        row.metricStatus === 'skip';
      return hasNotes || hasVerdict;
    });
    if (withData.length === 0) {
      return [];
    }
    const metricIds = [
      ...new Set(withData.map((r) => r.authenticationMetricId)),
    ];
    const defs = await this.authenticationMetricRepo.find({
      where: { id: In(metricIds) },
    });
    const labelById = new Map(defs.map((d) => [d.id, d.metric]));
    return withData.map((row) => ({
      metric: labelById.get(row.authenticationMetricId) ?? 'Metric',
      metricStatus: row.metricStatus,
      notes:
        row.notes == null || String(row.notes).trim() === ''
          ? null
          : String(row.notes).trim(),
    }));
  }

  async listItemPhotoshootsForStaff(): Promise<ItemPhotoshootCalendarRow[]> {
    const rows = await this.itemPhotoshootRepo
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.inventoryItem', 'inv')
      .leftJoinAndSelect('inv.consignor', 'consignor')
      .where('inv.status = :forPs', {
        forPs: FOR_PHOTOSHOOT_INVENTORY_STATUS,
      })
      .orderBy('p.photoshootDate', 'ASC')
      .addOrderBy('p.id', 'ASC')
      .getMany();
    return rows.map((p) => this.mapItemPhotoshootToCalendarRow(p));
  }

  async listItemPostingsForStaff(): Promise<ItemPostingCalendarRow[]> {
    const rows = await this.itemPostingRepo.find({
      relations: { inventoryItem: { consignor: true } },
      order: { postingDate: 'ASC', id: 'ASC' },
    });
    return rows.map((p) => {
      const inv = p.inventoryItem;
      const c = inv?.consignor ?? null;
      const consignorName = c
        ? [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
        : '';
      return {
        id: p.id,
        inventoryItemId: p.inventoryItemId,
        postingDate: p.postingDate ? p.postingDate.toISOString() : null,
        sku: inv?.sku ?? '',
        itemLabel: itemLabelFromSnapshot(inv?.itemSnapshot),
        inclusions: inclusionsFromSnapshot(inv?.itemSnapshot),
        consignorName: consignorName || null,
        productName: p.productName,
        collections: p.collections,
        tags: p.tags,
      };
    });
  }

  async scheduleItemPostings(
    dto: ScheduleItemPostingsDto,
    actorUserId: string,
  ): Promise<{ updated: number }> {
    const postingDate = normalizePostingDate(dto.postingDate);
    if (!postingDate) {
      throw new BadRequestException('Posting date is required.');
    }
    const uniqueIds = [...new Set(dto.inventoryItemIds)];
    await this.itemPostingRepo.manager.transaction(async (em) => {
      for (const inventoryItemId of uniqueIds) {
        const item = await em.findOne(InventoryItem, {
          where: { id: inventoryItemId },
        });
        if (!item) {
          throw new NotFoundException(
            `Inventory item ${inventoryItemId} not found`,
          );
        }
        if (item.status !== FOR_POSTING_INVENTORY_STATUS) {
          throw new BadRequestException(
            `Inventory ${item.sku} is not in status "${FOR_POSTING_INVENTORY_STATUS}"`,
          );
        }
        let posting = await em.findOne(ItemPosting, {
          where: { inventoryItemId },
        });
        if (!posting) {
          posting = em.create(ItemPosting, {
            inventoryItemId,
            productName: itemLabelFromSnapshot(item.itemSnapshot),
            collections: [],
            tags: [],
            priceComparison: null,
            productDescription: null,
            selectedPhotosSnapshot: [],
            createdById: actorUserId,
          });
        }
        posting.postingDate = postingDate;
        posting.updatedById = actorUserId;
        await em.save(posting);
      }
    });
    return { updated: uniqueIds.length };
  }

  async findOneItemPhotoshootForStaff(
    id: string,
  ): Promise<ItemPhotoshootCalendarRow> {
    const p = await this.itemPhotoshootRepo.findOne({
      where: { id },
      relations: { inventoryItem: { consignor: true } },
    });
    if (!p) {
      throw new NotFoundException('Photoshoot schedule not found');
    }
    return this.mapItemPhotoshootToCalendarRow(p);
  }

  /** Photos persisted on `item_photoshoot` for this inventory row (any inventory status). */
  async findItemPhotoshootByInventoryItemIdForStaff(
    inventoryItemId: string,
  ): Promise<ItemPhotoshootCalendarRow | null> {
    const p = await this.itemPhotoshootRepo.findOne({
      where: { inventoryItem: { id: inventoryItemId } },
      relations: { inventoryItem: { consignor: true } },
    });
    if (!p) {
      return null;
    }
    return this.mapItemPhotoshootToCalendarRow(p);
  }

  private mapItemPhotoshootToCalendarRow(
    p: ItemPhotoshoot,
  ): ItemPhotoshootCalendarRow {
    const inv = p.inventoryItem;
    const c = inv.consignor;
    const name = c
      ? [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
      : '';
    return {
      id: p.id,
      inventoryItemId: inv.id,
      photoshootDate: photoshootDayKey(p.photoshootDate),
      sku: inv.sku,
      itemLabel: itemLabelFromSnapshot(inv.itemSnapshot),
      inclusions: inclusionsFromSnapshot(inv.itemSnapshot),
      consignorName: name.length > 0 ? name : null,
      photos: parsePhotoshootSnapshotImages(p.photosSnapshot),
    };
  }

  async saveItemPhotoshootPhotos(
    photoshootId: string,
    files: MulterFile[],
    retainKeysRaw: string | undefined,
    actorUserId: string,
  ): Promise<ItemPhotoshootCalendarRow> {
    let retainKeys: string[] = [];
    if (retainKeysRaw != null && String(retainKeysRaw).trim() !== '') {
      try {
        const parsed = JSON.parse(String(retainKeysRaw)) as unknown;
        if (
          !Array.isArray(parsed) ||
          !parsed.every((x) => typeof x === 'string')
        ) {
          throw new BadRequestException(
            'retainKeys must be a JSON array of strings',
          );
        }
        const seen = new Set<string>();
        for (const k of parsed as string[]) {
          if (seen.has(k)) continue;
          seen.add(k);
          retainKeys.push(k);
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException('retainKeys must be valid JSON');
      }
    }

    const row = await this.itemPhotoshootRepo.findOne({
      where: { id: photoshootId },
      relations: { inventoryItem: { consignor: true } },
    });
    if (!row) {
      throw new NotFoundException('Photoshoot schedule not found');
    }

    const existingImages = parsePhotoshootSnapshotImages(row.photosSnapshot);
    const existingByKey = new Map(existingImages.map((i) => [i.key, i]));
    const retained: Array<{ key: string; url: string }> = [];
    for (const key of retainKeys) {
      const img = existingByKey.get(key);
      if (!img) {
        throw new BadRequestException(`Unknown image key: ${key}`);
      }
      retained.push(img);
    }

    const newImages: Array<{ key: string; url: string }> = [];
    for (const file of files) {
      const mime = file.mimetype?.toLowerCase() ?? '';
      if (!PHOTOSHOOT_ALLOWED_IMAGE_MIMES.has(mime)) {
        throw new BadRequestException(
          `Unsupported image type: ${file.mimetype || 'unknown'}`,
        );
      }
      const ext = photoshootExtFromMime(mime);
      const key = `item-photoshoots/${photoshootId}/${randomUUID()}.${ext}`;
      await this.s3.putObject(key, file.buffer, mime);
      newImages.push({ key, url: this.s3.getPublicUrl(key) });
    }

    const merged = [...retained, ...newImages];
    row.photosSnapshot = { images: merged };
    row.updatedById = actorUserId;
    await this.itemPhotoshootRepo.save(row);

    return this.findOneItemPhotoshootForStaff(photoshootId);
  }

  /**
   * Requires at least {@link MIN_PHOTOS_TO_FINISH_PHOTOSHOOT} saved photos; sets
   * inventory to {@link FOR_PRICING_INVENTORY_STATUS}.
   */
  async finishItemPhotoshoot(
    photoshootId: string,
    actorUserId: string,
  ): Promise<{ status: string; sku: string }> {
    const row = await this.itemPhotoshootRepo.findOne({
      where: { id: photoshootId },
      relations: { inventoryItem: true },
    });
    if (!row) {
      throw new NotFoundException('Photoshoot schedule not found');
    }
    const item = row.inventoryItem;
    if (!item) {
      throw new BadRequestException('Inventory item not found');
    }
    if (item.status !== FOR_PHOTOSHOOT_INVENTORY_STATUS) {
      throw new BadRequestException(
        `Inventory must be in "${FOR_PHOTOSHOOT_INVENTORY_STATUS}" to finish the photoshoot (current: "${item.status}").`,
      );
    }
    const images = parsePhotoshootSnapshotImages(row.photosSnapshot);
    if (images.length < MIN_PHOTOS_TO_FINISH_PHOTOSHOOT) {
      throw new BadRequestException(
        `At least ${MIN_PHOTOS_TO_FINISH_PHOTOSHOOT} photos are required before you can finish the photoshoot (saved: ${images.length}).`,
      );
    }
    item.status = FOR_PRICING_INVENTORY_STATUS;
    item.updatedById = actorUserId;
    await this.inventoryRepo.save(item);
    return { status: item.status, sku: item.sku };
  }

  async createItemPhotoshoots(
    dto: CreateItemPhotoshootsDto,
    actorUserId: string,
  ): Promise<{ createdIds: string[] }> {
    const dateStr = dto.photoshootDate.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new BadRequestException('Invalid photoshoot date');
    }
    const photoshootDate = new Date(`${dateStr}T00:00:00.000Z`);
    const uniqueIds = [...new Set(dto.inventoryItemIds)];
    return this.inventoryRepo.manager.transaction(async (em) => {
      const invRepo = em.getRepository(InventoryItem);
      const psRepo = em.getRepository(ItemPhotoshoot);
      const items = await invRepo.find({ where: { id: In(uniqueIds) } });
      if (items.length !== uniqueIds.length) {
        throw new NotFoundException(
          'One or more inventory items were not found',
        );
      }
      for (const item of items) {
        if (item.status !== FOR_PHOTOSHOOT_INVENTORY_STATUS) {
          throw new BadRequestException(
            `Inventory ${item.sku} is not in status "${FOR_PHOTOSHOOT_INVENTORY_STATUS}"`,
          );
        }
      }
      const existingRows = await psRepo.find({
        where: { inventoryItem: { id: In(uniqueIds) } },
        relations: { inventoryItem: true },
      });
      const existingByInvId = new Map(
        existingRows.map((p) => [p.inventoryItem.id, p]),
      );
      const resultIds: string[] = [];
      for (const inventoryItemId of uniqueIds) {
        const row = existingByInvId.get(inventoryItemId);
        if (row) {
          row.photoshootDate = photoshootDate;
          row.updatedById = actorUserId;
          await psRepo.save(row);
          resultIds.push(row.id);
        } else {
          const inserted = await psRepo.save(
            psRepo.create({
              inventoryItem: { id: inventoryItemId } as InventoryItem,
              photoshootDate,
              employeeId: null,
              photosSnapshot: null,
              createdById: actorUserId,
              updatedById: actorUserId,
            }),
          );
          resultIds.push(inserted.id);
        }
      }
      return { createdIds: resultIds };
    });
  }
}
