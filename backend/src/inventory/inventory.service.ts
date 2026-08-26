import {
  BadRequestException,
  ConflictException,
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
import { ConfigService } from '@nestjs/config';
import {
  Inquiry,
  type InquiryItemSnapshot,
} from '../inquiries/entities/inquiry.entity';
import {
  formatInventorySku,
  utcDayRange,
  utcInventoryDayLockKey,
} from './inventory-sku.util';
import { JwtUser } from '../auth/jwt-user';
import { portalPageUrl } from '../common/frontend-url.util';
import { Employee } from '../employees/entities/employee.entity';
import { canAssignWorkToOthers } from '../employees/employee-position.util';
import { InventoryItem } from './entities/inventory-item.entity';
import { ItemAuthentication } from './entities/item-authentication.entity';
import { ItemPhotoshoot } from './entities/item-photoshoot.entity';
import { ItemPosting } from './entities/item-posting.entity';
import {
  InventoryAuditService,
  cloneAuthForAudit,
  cloneInventoryItemForAudit,
  clonePostingForAudit,
} from './inventory-audit.service';
import { computeCreditCardPriceFromTbh } from './credit-card-price.util';
import { effectiveInventoryUnitPrice } from './inventory-effective-price.util';
import { ItemAuthenticationMetric } from './entities/item-authentication-metric.entity';
import { AuthenticationMetric } from '../authentication-metrics/entities/authentication-metric.entity';
import {
  INVENTORY_STATUS_SOLD_FINAL,
  INVENTORY_STATUS_SOLD_UNDER_WARRANTY,
} from '../orders/order-status.constants';
import { isSoldDateEligibleForFinalStatus } from './sold-warranty.util';
import { CreateItemPhotoshootsDto } from './dto/create-item-photoshoots.dto';
import { CreateStockInventoryItemDto } from './dto/create-stock-inventory-item.dto';
import { normalizeClientVipStatus } from '../clients/client-vip-status.util';
import type { ClientVipStatus } from '../clients/client-vip-status.util';
import { VipPricingService } from '../clients/vip-pricing.service';
import { BatchAssignAuthenticatorDto } from './dto/batch-assign-authenticator.dto';
import type { MulterFile } from '../inquiries/multer-file.type';
import { MediaOwnerType } from '../enums/media-owner-type.enum';
import { MediaPurpose } from '../enums/media-purpose.enum';
import { MediaService } from '../media/media.service';
import { ItemAuthenticationDetailsDto } from './dto/item-authentication-details.dto';
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
import { TasksService } from '../tasks/tasks.service';
import { Client } from '../clients/entities/client.entity';
import { Waitlist } from '../orders/entities/waitlist.entity';
import { Order } from '../orders/entities/order.entity';
import {
  ShopifyAdminService,
  type ShopifyCreateProductInput,
  type ShopifyUpdateProductInput,
} from '../shopify/shopify-admin.service';
import type { ThirdPartyAuthenticationData } from './entities/item-authentication.types';

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

const MAX_AUTH_METRIC_PHOTO_BYTES = 15 * 1024 * 1024;

function parseImageDataUrl(
  dataUrl: string,
): { buffer: Buffer; mime: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl.trim());
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!PHOTOSHOOT_ALLOWED_IMAGE_MIMES.has(mime)) return null;
  try {
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length === 0 || buffer.length > MAX_AUTH_METRIC_PHOTO_BYTES) {
      return null;
    }
    return { buffer, mime };
  } catch {
    return null;
  }
}

function authMetricExtFromMime(mime: string): string {
  return photoshootExtFromMime(mime);
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
  /** Saved S3-backed photoshoot images from media. */
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

export type ItemAuthenticationDetailsView = {
  dimensions: string | null;
  rating: string | null;
  marketPrice: string | null;
  retailPrice: string | null;
  marketResearchNotes: string | null;
  marketResearchLink: string | null;
  authenticatorNotes: string | null;
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
  /** Posted product name when available, otherwise item label. */
  productName: string;
  inclusions: string;
  /** From item_authentication (`rating`), if set. */
  rating: string | null;
  /** From item_authentication (`authenticator_notes`), if set. */
  authenticatorNotes: string | null;
  /** From item snapshot form (`marketPrice`), if set. */
  marketPrice: string | null;
  /** From item snapshot form (`retailPrice`), if set. */
  retailPrice: string | null;
  /** Linked inquiry staff offer (`inquiries.offer_price`), if any. */
  consignorPrice: string | null;
  /** TBH listed selling price (`inventory_items.tbh_selling_price`). */
  tbhSellingPrice: string | null;
  /** TBH selling price + 4% (`inventory_items.credit_card_price`). */
  creditCardPrice: string | null;
  onPromo: boolean;
  promoPrice: string | null;
  /** When true, VIP/program discount logic may apply (`inventory_items.enable_discount`). */
  enableDiscount: boolean;
  /** Display name of assigned authenticator, if any. */
  assignedToName: string | null;
  /** From item_authentication row; defaults to Pending when missing. */
  authenticationStatus: string;
  logisticsStatus: string;
};

export type InventoryDetailForStaff = {
  id: string;
  sku: string;
  dateReceived: string;
  dateSold: string | null;
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
  /** VIP tier of linked consignor client, if any. */
  consignorVipStatus: ClientVipStatus | null;
  /** Credit line eligibility of linked consignor client, if any. */
  consignorIsCreditLine: boolean | null;
  /** Employee id when an authenticator is assigned (item_authentication.assigned_to_id). */
  assignedToEmployeeId: string | null;
  assignedToName: string | null;
  /** `item_authentication.authentication_status` (e.g. Pending, Approved). */
  authenticationStatus: string;
  /** Current logistics location state (e.g. In Stock, In Transit). */
  logisticsStatus: string;
  thirdPartyAuthentication: {
    selectedAuthenticator: 'LegitGrails' | 'Entrupy' | null;
    certificateLink: string | null;
    certificatePhotos: string[];
    notes: string | null;
  } | null;
  /** Staff-facing notes for consignor during third-party reauthentication handoff. */
  reauthenticationNotes: string | null;
  /** Authentication detail fields from `item_authentication`. */
  authenticationDetails: ItemAuthenticationDetailsView | null;
  /** Staff offer on linked inquiry (`inquiries.offer_price`), if any. */
  inquiryOfferPrice: string | null;
  /** TBH listed selling price (`inventory_items.tbh_selling_price`). */
  tbhSellingPrice: string | null;
  /** TBH selling price + 4% (`inventory_items.credit_card_price`). */
  creditCardPrice: string | null;
  onPromo: boolean;
  promoPrice: string | null;
  /** When true, VIP/program discount logic may apply (`inventory_items.enable_discount`). */
  enableDiscount: boolean;
  vipGoldPrice: string | null;
  vipDiamondPrice: string | null;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
  };
  itemPosting: ItemPostingForStaff | null;
  /** Saved photoshoot gallery when a photoshoot row exists for this item. */
  itemPhotoshoot: {
    id: string;
    photoshootDate: string;
    photos: Array<{ key: string; url: string }>;
  } | null;
};

export type InventoryItemWaitlistClientRow = {
  id: string;
  clientId: string;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  createdAt: string;
};

export type ItemPostingForStaff = {
  id: string;
  postingDate: string | null;
  productName: string;
  collections: string[];
  tags: string[];
  productDescription: string | null;
  selectedPhotosSnapshot: Array<Record<string, unknown>>;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  shopifyPostedAt: string | null;
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

const STOCK_TRANSACTION_TYPE = 'stock';

function sourceOfPurchaseFromSnapshot(
  snapshot: InquiryItemSnapshot | null | undefined,
): string {
  if (!snapshot?.form) return '';
  const v = snapshot.form['sourceOfPurchase'];
  if (v == null) return '';
  return String(v).trim();
}

/** Display label for the Consignor column (real client, or Stock - source). */
function consignorDisplayName(opts: {
  transactionType: string | null | undefined;
  consignor:
    | Pick<Client, 'firstName' | 'lastName'>
    | null
    | undefined;
  itemSnapshot: InquiryItemSnapshot | null | undefined;
}): string | null {
  if (opts.transactionType === STOCK_TRANSACTION_TYPE) {
    const source = sourceOfPurchaseFromSnapshot(opts.itemSnapshot);
    return source ? `Stock - ${source}` : 'Stock';
  }
  const c = opts.consignor;
  if (!c) return null;
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return name || null;
}

function parseStockDateReceived(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) {
    throw new BadRequestException('dateReceived must be YYYY-MM-DD');
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new BadRequestException('Invalid dateReceived');
  }
  return date;
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

function optionalMoneyString(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

function parseOptionalMoney(raw: string): number | null {
  const trimmed = raw
    .trim()
    .replace(/,/g, '')
    .replace(/^\u20b1\s?/i, '');
  if (trimmed === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number.parseFloat(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function mapAuthenticationDetailsView(
  auth: ItemAuthentication | null | undefined,
): ItemAuthenticationDetailsView | null {
  if (!auth) return null;
  return {
    dimensions: normalizeOptionalText(auth.dimensions),
    rating: normalizeOptionalText(auth.rating),
    marketPrice: optionalMoneyString(auth.marketPrice),
    retailPrice: optionalMoneyString(auth.retailPrice),
    marketResearchNotes: normalizeOptionalText(auth.marketResearchNotes),
    marketResearchLink: normalizeOptionalText(auth.marketResearchLink),
    authenticatorNotes: normalizeOptionalText(auth.authenticatorNotes),
  };
}

function authPriceField(
  auth: ItemAuthentication | null | undefined,
  snapshot: InquiryItemSnapshot | null | undefined,
  key: 'marketPrice' | 'retailPrice',
): string | null {
  const fromAuth =
    key === 'marketPrice'
      ? optionalMoneyString(auth?.marketPrice)
      : optionalMoneyString(auth?.retailPrice);
  if (fromAuth != null) return fromAuth;
  return priceFieldFromSnapshot(snapshot, key);
}

function applyAuthenticationDetailsToEntity(
  auth: ItemAuthentication,
  dto: ItemAuthenticationDetailsDto,
): void {
  const setText = (
    dtoKey: keyof ItemAuthenticationDetailsDto,
    entityKey:
      | 'dimensions'
      | 'rating'
      | 'marketResearchNotes'
      | 'marketResearchLink'
      | 'authenticatorNotes',
  ) => {
    const raw = dto[dtoKey];
    if (raw === undefined) return;
    const trimmed = String(raw).trim();
    auth[entityKey] = trimmed === '' ? null : trimmed;
  };

  setText('dimensions', 'dimensions');
  setText('rating', 'rating');
  setText('marketResearchNotes', 'marketResearchNotes');
  setText('marketResearchLink', 'marketResearchLink');
  setText('authenticatorNotes', 'authenticatorNotes');

  if (dto.marketPrice !== undefined) {
    const trimmed = dto.marketPrice.trim();
    if (trimmed === '') {
      auth.marketPrice = null;
    } else {
      const parsed = parseOptionalMoney(trimmed);
      if (parsed == null) {
        throw new BadRequestException('Invalid market price.');
      }
      auth.marketPrice = parsed.toFixed(2);
    }
  }

  if (dto.retailPrice !== undefined) {
    const trimmed = dto.retailPrice.trim();
    if (trimmed === '') {
      auth.retailPrice = null;
    } else {
      const parsed = parseOptionalMoney(trimmed);
      if (parsed == null) {
        throw new BadRequestException('Invalid retail price.');
      }
      auth.retailPrice = parsed.toFixed(2);
    }
  }
}

function normalizedOfferPriceString(
  offer: string | number | null | undefined,
): string | null {
  if (offer == null) return null;
  const s = String(offer).trim();
  return s.length > 0 ? s : null;
}

function normalizedTbhPriceString(
  raw: string | number | null | undefined,
): string | null {
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
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

function selectedPhotoKeys(
  value: Array<Record<string, unknown>>,
): Array<{ key: string; position: number }> {
  const entries: Array<{ key: string; position: number }> = [];
  for (let i = 0; i < value.length; i++) {
    const photo = value[i];
    const key = typeof photo.key === 'string' ? photo.key.trim() : '';
    if (!key) continue;
    const rawPosition = Number(photo.position);
    entries.push({
      key,
      position: Number.isFinite(rawPosition) ? rawPosition : i,
    });
  }
  return entries;
}

function buildShopifyProductPayload(
  posting: ItemPosting,
  item: InventoryItem,
  photoUrls: string[],
): {
  productName: string;
  price: string;
  variant: ShopifyCreateProductInput['variants'][number];
  images: Array<{ src: string }>;
  productFields: Pick<
    ShopifyCreateProductInput,
    'title' | 'body_html' | 'vendor' | 'status' | 'tags'
  >;
} {
  const price =
    item.tbhSellingPrice != null && String(item.tbhSellingPrice).trim() !== ''
      ? String(item.tbhSellingPrice).trim()
      : null;
  if (!price) {
    throw new BadRequestException('TBH selling price is required.');
  }
  const productName = posting.productName.trim();
  if (!productName) {
    throw new BadRequestException('Product name is required.');
  }

  const variant: ShopifyCreateProductInput['variants'][number] = {
    price,
    sku: item.sku,
    inventory_management: 'shopify',
    inventory_quantity: 1,
  };
  if (
    item.creditCardPrice != null &&
    String(item.creditCardPrice).trim() !== ''
  ) {
    variant.compare_at_price = String(item.creditCardPrice).trim();
  }

  return {
    productName,
    price,
    variant,
    images: photoUrls.map((src) => ({ src })),
    productFields: {
      title: productName,
      body_html: posting.productDescription,
      vendor: 'The Bag Hub',
      status: 'active',
      tags: posting.tags.join(', '),
    },
  };
}

function readShopifyVariantId(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const variants = (raw as Record<string, unknown>).variants;
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const first = variants[0];
  if (!first || typeof first !== 'object') return null;
  const id = (first as Record<string, unknown>).id;
  return id != null ? String(id) : null;
}

function numericShopifyIdForCompare(id: string): string {
  const trimmed = id.trim();
  const m = /\/(\d+)$/.exec(trimmed);
  return m?.[1] ?? trimmed;
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

function normalizeThirdPartyAuthenticationDataForSave(
  raw:
    | {
        selectedAuthenticator?: unknown;
        certificateLink?: unknown;
        notes?: unknown;
      }
    | null
    | undefined,
): ThirdPartyAuthenticationData | null {
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
  const notes =
    typeof raw.notes === 'string' && raw.notes.trim() !== ''
      ? raw.notes.trim()
      : null;
  if (
    selectedAuthenticator == null &&
    certificateLink == null &&
    notes == null
  ) {
    return null;
  }
  return { selectedAuthenticator, certificateLink, notes };
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
  item.itemSnapshot = {
    clientItemId: base.clientItemId,
    form,
  };
}

const FOR_AUTHENTICATION_INVENTORY_STATUS = 'For Authentication';
const FOR_PHOTOSHOOT_INVENTORY_STATUS = 'For Photoshoot';
const FOR_PRICING_INVENTORY_STATUS = 'For Pricing';
const FOR_REPRICING_INVENTORY_STATUS = 'For Repricing';
const FOR_EDITING_INVENTORY_STATUS = 'For Editing';
const FOR_POSTING_INVENTORY_STATUS = 'For Posting';
const AVAILABLE_FOR_PURCHASE_INVENTORY_STATUS = 'Available For Purchase';
const ON_HOLD_INVENTORY_STATUS = 'On Hold';

const STAFF_WAITLISTABLE_INVENTORY_STATUSES = [
  AVAILABLE_FOR_PURCHASE_INVENTORY_STATUS,
  ON_HOLD_INVENTORY_STATUS,
  FOR_REPRICING_INVENTORY_STATUS,
];

const UPDATE_TBH_PRICE_ALLOWED_INVENTORY_STATUSES = new Set<string>([
  FOR_PRICING_INVENTORY_STATUS,
  FOR_REPRICING_INVENTORY_STATUS,
  FOR_EDITING_INVENTORY_STATUS,
]);
const MIN_PHOTOS_TO_FINISH_PHOTOSHOOT = 1;
const MIN_SELECTED_PHOTOS_FOR_ITEM_POSTING = 1;
const AUTHENTICATED_FOR_RENEGOTIATION_INVENTORY_STATUS =
  'Authenticated: For renegotiation';
const APPROVED_ITEM_AUTHENTICATION_STATUS = 'Approved';
const FOR_RENEGOTIATION_ITEM_AUTHENTICATION_STATUS = 'For renegotiation';
const AUTHENTICATED_REQUESTED_FOR_REAUTHENTICATION_INVENTORY_STATUS =
  'Authenticated: Requested for Reauthentication';
const AUTHENTICATED_FOR_THIRD_PARTY_INVENTORY_STATUS =
  'Authenticated: For 3rd party authentication';
const REQUESTED_FOR_REAUTHENTICATION_ITEM_AUTH_STATUS =
  'Requested for Reauthentication';
const AUTHENTICATION_REJECTED_INVENTORY_STATUS = 'Authenticated: Rejected';
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
    @InjectRepository(Waitlist)
    private readonly waitlistsRepo: Repository<Waitlist>,
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
    @Inject(forwardRef(() => InquiriesService))
    private readonly inquiriesService: InquiriesService,
    private readonly notifications: NotificationsService,
    private readonly shopifyAdmin: ShopifyAdminService,
    private readonly media: MediaService,
    private readonly config: ConfigService,
    private readonly tasks: TasksService,
    private readonly inventoryAudit: InventoryAuditService,
    private readonly vipPricing: VipPricingService,
  ) {}

  private async loadPostingPhotosSnapshot(
    postingId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.media.findByOwner(
      MediaOwnerType.ITEM_POSTING,
      postingId,
      { purpose: MediaPurpose.POSTING_SELECTION, orderBySort: true },
    );
    return this.media.toKeyUrlPositionList(rows).map(({ key, url, position }) => ({
      key,
      url,
      position,
    }));
  }

  private async loadPostingPhotoUrls(postingId: string): Promise<string[]> {
    const rows = await this.media.findByOwner(
      MediaOwnerType.ITEM_POSTING,
      postingId,
      { purpose: MediaPurpose.POSTING_SELECTION, orderBySort: true },
    );
    return this.media.toUrlList(rows);
  }

  private async mapItemPostingForStaff(
    posting: ItemPosting,
  ): Promise<ItemPostingForStaff> {
    return {
      id: posting.id,
      postingDate: posting.postingDate
        ? posting.postingDate.toISOString()
        : null,
      productName: posting.productName,
      collections: posting.collections,
      tags: posting.tags,
      productDescription: posting.productDescription,
      selectedPhotosSnapshot: await this.loadPostingPhotosSnapshot(posting.id),
      shopifyProductId:
        posting.shopifyProductId != null &&
        String(posting.shopifyProductId).trim() !== ''
          ? String(posting.shopifyProductId).trim()
          : null,
      shopifyVariantId:
        posting.shopifyVariantId != null &&
        String(posting.shopifyVariantId).trim() !== ''
          ? String(posting.shopifyVariantId).trim()
          : null,
      shopifyPostedAt: posting.shopifyPostedAt
        ? posting.shopifyPostedAt.toISOString()
        : null,
    };
  }

  private async loadThirdPartyAuthenticationView(
    auth: ItemAuthentication | null | undefined,
    inventoryItemId: string,
  ): Promise<InventoryDetailForStaff['thirdPartyAuthentication']> {
    const saved = normalizeThirdPartyAuthenticationDataForSave(
      auth?.thirdPartyAuthenticationData,
    );
    const certificatePhotos = this.media.toUrlList(
      await this.media.findByOwner(
        MediaOwnerType.INVENTORY_ITEM,
        inventoryItemId,
        { purpose: MediaPurpose.CERTIFICATE, orderBySort: true },
      ),
    );
    if (
      saved == null &&
      certificatePhotos.length === 0
    ) {
      return null;
    }
    return {
      selectedAuthenticator: saved?.selectedAuthenticator ?? null,
      certificateLink: saved?.certificateLink ?? null,
      certificatePhotos,
      notes: saved?.notes ?? null,
    };
  }

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
      if (!actor.isAdmin) {
        throw new ForbiddenException(
          'This item must be assigned to an authenticator before authentication.',
        );
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
      if (!assigneeId) {
        throw new ForbiddenException(
          'This item must be assigned to an authenticator before authentication.',
        );
      }
      if (!employee?.id || employee.id !== assigneeId) {
        throw new ForbiddenException(
          'Only the assigned authenticator can perform this action.',
        );
      }
    }
    return auth;
  }

  /**
   * Staff-created company stock: no inquiry/consignor. Status For Authentication;
   * transactionType `stock` (excluded from consignor payments).
   */
  async createStockInventoryItem(
    dto: CreateStockInventoryItemDto,
    actorUserId: string,
  ): Promise<{ id: string; sku: string; status: string }> {
    const dateReceived = parseStockDateReceived(dto.dateReceived);
    const source = dto.form.sourceOfPurchase.trim();
    if (!source) {
      throw new BadRequestException('Source of purchase is required.');
    }

    return this.inventoryRepo.manager.transaction(async (em) => {
      await em.query(
        `SELECT pg_advisory_xact_lock(hashtext($1::text)::bigint)`,
        [utcInventoryDayLockKey(dateReceived)],
      );
      const bounds = utcDayRange(dateReceived);
      const countDay = await em.count(InventoryItem, {
        where: { dateReceived: Between(bounds.start, bounds.end) },
      });
      const seq = countDay + 1;
      const sku = formatInventorySku(dateReceived, seq);

      const itemSnapshot: InquiryItemSnapshot = {
        clientItemId: randomUUID(),
        form: {
          itemModel: dto.form.itemModel.trim(),
          brand: dto.form.brand.trim(),
          category: dto.form.category.trim(),
          serialNumber: (dto.form.serialNumber ?? '').trim(),
          color: (dto.form.color ?? '').trim(),
          material: (dto.form.material ?? '').trim(),
          condition: dto.form.condition.trim(),
          inclusions: dto.form.inclusions.trim(),
          datePurchased: (dto.form.datePurchased ?? '').trim(),
          sourceOfPurchase: source,
          specialInstructions: '',
          consignmentSellingPrice: '',
          directPurchaseSellingPrice: '',
          consentDirectPurchase: false,
          consentPriceNomination: false,
        },
      };

      const inventoryRow = em.create(InventoryItem, {
        sku,
        dateReceived,
        inquiryId: null,
        consignorId: null,
        status: FOR_AUTHENTICATION_INVENTORY_STATUS,
        transactionType: STOCK_TRANSACTION_TYPE,
        currentBranch: dto.currentBranch,
        itemSnapshot,
        createdById: actorUserId,
        updatedById: actorUserId,
      });
      await em.save(inventoryRow);

      const itemAuth = em.create(ItemAuthentication, {
        inventoryItemId: inventoryRow.id,
        assignedToId: null,
        authenticationStatus: 'Pending',
        createdById: actorUserId,
        updatedById: actorUserId,
      });
      await em.save(itemAuth);

      await this.inventoryAudit.recordInitialCreation(
        inventoryRow,
        await this.inventoryAudit.staffActor(actorUserId),
        em,
      );

      return {
        id: inventoryRow.id,
        sku: inventoryRow.sku,
        status: inventoryRow.status,
      };
    });
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

    await this.inventoryAudit.recordInitialCreation(
      inventoryRow,
      this.inventoryAudit.systemActor(),
      em,
    );

    await this.media.copyOwnerMedia(
      MediaOwnerType.INQUIRY,
      inquiry.id,
      MediaOwnerType.INVENTORY_ITEM,
      inventoryRow.id,
      MediaPurpose.ITEM_PHOTO,
    );
  }

  /** Removes a consigned inventory row when a scheduled pullout is completed. */
  async removeInventoryItemForInquiryPullout(
    em: EntityManager,
    inquiryId: string,
  ): Promise<void> {
    const item = await em.findOne(InventoryItem, { where: { inquiryId } });
    if (!item) {
      throw new BadRequestException(
        'No inventory item is linked to this inquiry',
      );
    }

    const orderCount = await em.count(Order, {
      where: { inventoryItemId: item.id },
    });
    if (orderCount > 0) {
      throw new BadRequestException(
        'Cannot remove this item from inventory while it has an active order',
      );
    }

    await em.delete(Waitlist, { inventoryItemId: item.id });
    await this.media.deleteByOwner(MediaOwnerType.INVENTORY_ITEM, item.id);
    await em.remove(item);
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
    const beforeInv = cloneInventoryItemForAudit(existingInv);
    existingInv.status = FOR_PHOTOSHOOT_INVENTORY_STATUS;
    existingInv.transactionType = tx;
    existingInv.updatedById = null;
    await em.save(existingInv);
    await this.inventoryAudit.recordDiff(
      existingInv.id,
      beforeInv,
      existingInv,
      this.inventoryAudit.customerActor(null),
      em,
    );
    const auth = await em.findOne(ItemAuthentication, {
      where: { inventoryItemId: existingInv.id },
    });
    if (auth) {
      const beforeAuth = cloneAuthForAudit(auth);
      auth.authenticationStatus = APPROVED_ITEM_AUTHENTICATION_STATUS;
      auth.assignedToId = null;
      auth.updatedById = null;
      await em.save(auth);
      await this.inventoryAudit.recordAuthDiff(
        existingInv.id,
        beforeAuth,
        auth,
        this.inventoryAudit.customerActor(null),
        em,
      );
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
    return Promise.all(
      rows.map(async (row) => {
        const mediaRows = await this.media.findByOwner(
          MediaOwnerType.ITEM_AUTHENTICATION_METRIC,
          row.id,
          { purpose: MediaPurpose.AUTH_METRIC, orderBySort: true },
        );
        const urls = this.media.toUrlList(mediaRows);
        return {
          authenticationMetricId: row.authenticationMetricId,
          notes: row.notes,
          metricStatus: row.metricStatus,
          photos: urls.length > 0 ? urls : null,
        };
      }),
    );
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

    type MetricPhotoSync = {
      metricRowId: string;
      photos: string[];
    };
    const metricPhotoSyncs: MetricPhotoSync[] = [];
    let certificatePhotosToSync: string[] | null = null;

    await this.itemAuthMetricRepo.manager.transaction(async (em) => {
      const auditActor = await this.inventoryAudit.staffActor(actor.userId);
      if (dto.itemSnapshotForm) {
        const inv = await em.findOne(InventoryItem, {
          where: { id: inventoryItemId },
        });
        if (!inv) {
          throw new NotFoundException('Inventory item not found');
        }
        const beforeInv = cloneInventoryItemForAudit(inv);
        mergeItemAuthenticationFormIntoSnapshot(inv, dto.itemSnapshotForm);
        inv.updatedById = actor.userId;
        await em.save(inv);
        await this.inventoryAudit.recordDiff(
          inventoryItemId,
          beforeInv,
          inv,
          auditActor,
          em,
        );
      }

      const authRow = await em.findOne(ItemAuthentication, {
        where: { id: auth!.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!authRow) {
        throw new NotFoundException('Item authentication record not found');
      }

      const beforeAuth = cloneAuthForAudit(authRow);
      if (dto.authenticationDetails) {
        applyAuthenticationDetailsToEntity(authRow, dto.authenticationDetails);
      }
      if (dto.thirdPartyAuthentication !== undefined) {
        authRow.thirdPartyAuthenticationData =
          normalizeThirdPartyAuthenticationDataForSave(
            dto.thirdPartyAuthentication,
          );
      }
      authRow.updatedById = actor.userId;
      await em.save(authRow);
      await this.inventoryAudit.recordAuthDiff(
        inventoryItemId,
        beforeAuth,
        authRow,
        auditActor,
        em,
      );

      if (dto.thirdPartyAuthentication?.certificatePhotos !== undefined) {
        certificatePhotosToSync =
          dto.thirdPartyAuthentication.certificatePhotos === null
            ? []
            : Array.isArray(dto.thirdPartyAuthentication.certificatePhotos)
              ? dto.thirdPartyAuthentication.certificatePhotos
              : [];
      }

      const itemAuthId = authRow.id;
      for (const row of dto.rows) {
        const notes =
          row.notes == null || String(row.notes).trim() === ''
            ? null
            : String(row.notes).trim();
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
          });
        } else {
          existing.notes = notes;
          existing.metricStatus = row.metricStatus ?? null;
        }
        await em.save(existing);

        if (row.photos !== undefined) {
          metricPhotoSyncs.push({
            metricRowId: existing.id,
            photos:
              row.photos === null
                ? []
                : Array.isArray(row.photos)
                  ? row.photos
                  : [],
          });
        }
      }
    });

    if (certificatePhotosToSync !== null) {
      await this.media.syncPhotoPayload(
        MediaOwnerType.INVENTORY_ITEM,
        inventoryItemId,
        MediaPurpose.CERTIFICATE,
        certificatePhotosToSync,
        {
          keyForNewUpload: (index, mime) =>
            `inventory-items/${inventoryItemId}/certificate/${index}-${randomUUID()}.${authMetricExtFromMime(mime)}`,
          parseDataUrl: parseImageDataUrl,
          uploadedByUserId: actor.userId,
          createdById: actor.userId,
        },
      );
    }

    for (const sync of metricPhotoSyncs) {
      await this.media.syncPhotoPayload(
        MediaOwnerType.ITEM_AUTHENTICATION_METRIC,
        sync.metricRowId,
        MediaPurpose.AUTH_METRIC,
        sync.photos,
        {
          keyForNewUpload: (index, mime) =>
            `item-authentication-metrics/${sync.metricRowId}/${index}-${randomUUID()}.${authMetricExtFromMime(mime)}`,
          parseDataUrl: parseImageDataUrl,
          uploadedByUserId: actor.userId,
          createdById: actor.userId,
        },
      );
    }

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
    if (
      item.status !== FOR_AUTHENTICATION_INVENTORY_STATUS &&
      item.status !== AUTHENTICATED_FOR_THIRD_PARTY_INVENTORY_STATUS
    ) {
      throw new BadRequestException(
        `Only items in "${FOR_AUTHENTICATION_INVENTORY_STATUS}" or "${AUTHENTICATED_FOR_THIRD_PARTY_INVENTORY_STATUS}" status can be approved from authentication.`,
      );
    }
    const approvingThirdPartyAuthentication =
      item.status === AUTHENTICATED_FOR_THIRD_PARTY_INVENTORY_STATUS;
    const auth = await this.enforceAuthenticatorAccess(inventoryItemId, actor, {
      createIfMissing: false,
    });
    const auditActor = await this.inventoryAudit.staffActor(actor.userId);
    const beforeAuth = cloneAuthForAudit(auth);
    auth.authenticationStatus = APPROVED_ITEM_AUTHENTICATION_STATUS;
    auth.updatedById = actor.userId;
    await this.itemAuthRepo.save(auth);
    await this.inventoryAudit.recordAuthDiff(
      inventoryItemId,
      beforeAuth,
      auth,
      auditActor,
    );

    const beforeInv = cloneInventoryItemForAudit(item);
    item.status = FOR_PHOTOSHOOT_INVENTORY_STATUS;
    item.updatedById = actor.userId;
    await this.inventoryRepo.save(item);
    await this.inventoryAudit.recordDiff(
      item.id,
      beforeInv,
      item,
      auditActor,
    );

    if (item.inquiryId) {
      if (approvingThirdPartyAuthentication) {
        const inquiry = await this.inventoryRepo.manager.findOne(Inquiry, {
          where: { id: item.inquiryId },
        });
        if (inquiry?.status === InquiryStatus.AUTHENTICATED_FOR_3RD_PARTY) {
          inquiry.status = InquiryStatus.FOR_PROCESSING;
          inquiry.updatedById = actor.userId;
          await this.inventoryRepo.manager.save(inquiry);
        }
      }
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

          const beforeAuth = cloneAuthForAudit(auth);
          auth.authenticationStatus =
            REQUESTED_FOR_REAUTHENTICATION_ITEM_AUTH_STATUS;
          auth.updatedById = actor.userId;
          await em.save(auth);

          const beforeInv = cloneInventoryItemForAudit(item);
          item.status =
            AUTHENTICATED_REQUESTED_FOR_REAUTHENTICATION_INVENTORY_STATUS;
          item.updatedById = actor.userId;
          await em.save(item);

          const auditActor = await this.inventoryAudit.staffActor(actor.userId);
          await this.inventoryAudit.recordAuthDiff(
            inventoryItemId,
            beforeAuth,
            auth,
            auditActor,
            em,
          );
          await this.inventoryAudit.recordDiff(
            item.id,
            beforeInv,
            item,
            auditActor,
            em,
          );

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
    const auditActor = await this.inventoryAudit.staffActor(actor.userId);
    const beforeAuth = cloneAuthForAudit(auth);
    auth.authenticationStatus = REJECTED_ITEM_AUTHENTICATION_STATUS;
    auth.updatedById = actor.userId;
    await this.itemAuthRepo.save(auth);

    const beforeInv = cloneInventoryItemForAudit(item);
    item.status = AUTHENTICATION_REJECTED_INVENTORY_STATUS;
    item.updatedById = actor.userId;
    await this.inventoryRepo.save(item);
    await this.inventoryAudit.recordAuthDiff(
      inventoryItemId,
      beforeAuth,
      auth,
      auditActor,
    );
    await this.inventoryAudit.recordDiff(item.id, beforeInv, item, auditActor);

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

    const auditActor = await this.inventoryAudit.staffActor(actor.userId);
    const beforeInv = cloneInventoryItemForAudit(item);
    item.status = AUTHENTICATED_FOR_RENEGOTIATION_INVENTORY_STATUS;
    item.updatedById = actor.userId;
    await this.inventoryRepo.save(item);

    const beforeAuth = cloneAuthForAudit(auth);
    auth.authenticationStatus = FOR_RENEGOTIATION_ITEM_AUTHENTICATION_STATUS;
    auth.updatedById = actor.userId;
    await this.itemAuthRepo.save(auth);
    await this.inventoryAudit.recordDiff(item.id, beforeInv, item, auditActor);
    await this.inventoryAudit.recordAuthDiff(
      inventoryItemId,
      beforeAuth,
      auth,
      auditActor,
    );

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
    actor: JwtUser,
  ): Promise<{ updated: number }> {
    const actorEmployee = await this.employeesRepo.findOne({
      where: { userId: actor.userId },
    });
    if (!canAssignWorkToOthers(actor.isAdmin, actorEmployee?.position)) {
      if (!actorEmployee?.id) {
        throw new ForbiddenException(
          'Your account is not linked to an employee record.',
        );
      }
      if (actorEmployee.id !== dto.employeeId) {
        throw new ForbiddenException(
          'Only a supervisor can assign authentication to other staff.',
        );
      }
    }
    const employee = await this.employeesRepo.findOne({
      where: { id: dto.employeeId },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (!isAuthenticatorPosition(employee.position)) {
      throw new BadRequestException(
        actorEmployee?.id === dto.employeeId
          ? 'You must be in the Authenticator position to assign items to yourself.'
          : 'Selected person is not in the Authenticator position.',
      );
    }
    const uniqueIds = [...new Set(dto.inventoryItemIds)];
    const assignedItems: {
      itemId: string;
      sku: string;
      createTask: boolean;
    }[] = [];
    const supervisorAssignment = canAssignWorkToOthers(
      actor.isAdmin,
      actorEmployee?.position,
    );

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
        const alreadyAssigned = auth?.assignedToId === dto.employeeId;
        const beforeAuth = auth ? cloneAuthForAudit(auth) : null;
        if (!auth) {
          auth = em.create(ItemAuthentication, {
            inventoryItemId,
            assignedToId: dto.employeeId,
            authenticationStatus: 'Pending',
            createdById: actor.userId,
            updatedById: actor.userId,
          });
        } else {
          auth.assignedToId = dto.employeeId;
          auth.updatedById = actor.userId;
        }
        await em.save(auth);
        await this.inventoryAudit.recordAuthDiff(
          inventoryItemId,
          beforeAuth,
          auth,
          await this.inventoryAudit.staffActor(actor.userId),
          em,
        );
        assignedItems.push({
          itemId: item.id,
          sku: item.sku,
          createTask: supervisorAssignment && !alreadyAssigned,
        });
      }
    });

    for (const { itemId, sku, createTask } of assignedItems) {
      if (!createTask) continue;
      void this.notifications
        .notify({
          message: `Item ${sku} has been assigned to you for authentication.`,
          receiverId: dto.employeeId,
        })
        .catch((err: unknown) => {
          this.logger.error(
            'Failed to notify authenticator for assignment',
            err,
          );
        });
      void this.tasks
        .createAssigned({
          assigneeId: dto.employeeId,
          title: `Item ${sku} is assigned to you for authentication`,
          description: portalPageUrl(
            this.config,
            `/portal/authentication/${itemId}`,
          ),
          severity: 'moderate',
          dueDate: null,
        })
        .catch((err: unknown) => {
          this.logger.error(
            'Failed to create task for authenticator assignment',
            err,
          );
        });
    }

    return { updated: uniqueIds.length };
  }

  async findAllForStaff(): Promise<InventoryListRow[]> {
    const rows = await this.inventoryRepo.find({
      relations: { inquiry: true, consignor: true, itemPosting: true },
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
      const name = consignorDisplayName({
        transactionType: r.transactionType,
        consignor: r.consignor,
        itemSnapshot: r.itemSnapshot,
      });
      const auth = authByItemId.get(r.id);
      const itemLabel = itemLabelFromSnapshot(r.itemSnapshot);
      const productName =
        r.itemPosting?.productName?.trim() || itemLabel;
      return {
        id: r.id,
        sku: r.sku,
        dateReceived: r.dateReceived.toISOString(),
        inquiryId: r.inquiryId,
        consignorName: name,
        status: r.status,
        transactionType: r.transactionType,
        currentBranch: r.currentBranch,
        itemLabel,
        productName,
        inclusions: inclusionsFromSnapshot(r.itemSnapshot),
        rating: normalizeOptionalText(auth?.rating),
        authenticatorNotes: normalizeOptionalText(auth?.authenticatorNotes),
        marketPrice: authPriceField(auth, r.itemSnapshot, 'marketPrice'),
        retailPrice: authPriceField(auth, r.itemSnapshot, 'retailPrice'),
        consignorPrice: normalizedOfferPriceString(r.inquiry?.offerPrice),
        tbhSellingPrice:
          r.tbhSellingPrice != null &&
          String(r.tbhSellingPrice).trim() !== ''
            ? String(r.tbhSellingPrice)
            : null,
        creditCardPrice:
          r.creditCardPrice != null &&
          String(r.creditCardPrice).trim() !== ''
            ? String(r.creditCardPrice)
            : null,
        onPromo: r.onPromo,
        promoPrice:
          r.promoPrice != null && String(r.promoPrice).trim() !== ''
            ? String(r.promoPrice)
            : null,
        enableDiscount: r.enableDiscount,
        assignedToName: formatEmployeeName(auth?.assignedTo ?? null),
        authenticationStatus: auth?.authenticationStatus ?? 'Pending',
        logisticsStatus: r.logisticsStatus ?? 'In Stock',
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
    creditCardPrice: string | null;
    enableDiscount: boolean;
    status: string;
  }> {
    const item = await this.inventoryRepo.findOne({
      where: { id },
      relations: { inquiry: true, itemPosting: true },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    if (!UPDATE_TBH_PRICE_ALLOWED_INVENTORY_STATUSES.has(item.status)) {
      throw new BadRequestException(
        'TBH selling price can only be updated for items in For Pricing, For Repricing, or For Editing status.',
      );
    }
    const priceProvided = dto.tbhSellingPrice !== undefined;
    const discountProvided = dto.enableDiscount !== undefined;
    if (!priceProvided && !discountProvided) {
      throw new BadRequestException('No pricing fields to update.');
    }

    const wasForRepricing = item.status === FOR_REPRICING_INVENTORY_STATUS;
    const storedTbh = normalizedTbhPriceString(item.tbhSellingPrice);
    let nextTbh: string | null = storedTbh;
    let priceChanged = false;
    const beforeInv = cloneInventoryItemForAudit(item);

    if (priceProvided) {
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
      if (wasForRepricing && next == null) {
        throw new BadRequestException(
          'TBH selling price is required to finish repricing.',
        );
      }
      priceChanged = storedTbh !== next;
      item.creditCardPrice = computeCreditCardPriceFromTbh(next);
      if (priceChanged) {
        item.tbhSellingPrice = next;
        nextTbh = next;
        if (wasForRepricing) {
          item.updatedById = actorUserId;
          await this.inventoryRepo.save(item);
          await this.syncPostedItemToShopify(item.itemPosting, item);
          item.status = AVAILABLE_FOR_PURCHASE_INVENTORY_STATUS;
        } else if (next != null) {
          const pct = markupPercentFromOfferOrNull(
            next,
            item.inquiry?.offerPrice,
          );
          if (pct == null || pct > 0) {
            item.status = FOR_EDITING_INVENTORY_STATUS;
          }
        }
      }
    }

    if (discountProvided) {
      item.enableDiscount = dto.enableDiscount ?? false;
    }

    item.updatedById = actorUserId;
    await this.inventoryRepo.save(item);
    await this.inventoryAudit.recordDiff(
      item.id,
      beforeInv,
      item,
      await this.inventoryAudit.staffActor(actorUserId),
    );
    return {
      id: item.id,
      tbhSellingPrice: nextTbh,
      creditCardPrice: item.creditCardPrice,
      enableDiscount: item.enableDiscount,
      status: item.status,
    };
  }

  async createItemPosting(
    inventoryItemId: string,
    dto: CreateItemPostingDto,
    actorUserId: string,
    options: { updateStatus: boolean } = { updateStatus: true },
  ): Promise<{
    id: string;
    status: string;
    itemPostingId: string;
    shopifyUpdated: boolean;
  }> {
    const productName = String(dto.productName ?? '').trim();
    if (!productName) {
      throw new BadRequestException('Product name is required.');
    }
    const shouldUpdatePostingDate = dto.postingDate !== undefined;
    const postingDate = shouldUpdatePostingDate
      ? normalizePostingDate(dto.postingDate)
      : null;
    const collections = normalizeStringArray(dto.collections);
    if (collections.length === 0) {
      throw new BadRequestException('Collection is required.');
    }
    const tags = normalizeStringArray(dto.tags);
    const productDescription = normalizeOptionalText(dto.productDescription);
    const selectedPhotosSnapshot = normalizeSelectedPhotosSnapshot(
      dto.selectedPhotosSnapshot,
    );
    if (selectedPhotosSnapshot.length < MIN_SELECTED_PHOTOS_FOR_ITEM_POSTING) {
      throw new BadRequestException(
        `At least ${MIN_SELECTED_PHOTOS_FOR_ITEM_POSTING} photoshoot photo must be selected for posting (selected: ${selectedPhotosSnapshot.length}).`,
      );
    }

    const result = await this.itemPostingRepo.manager.transaction(async (em) => {
      const item = await em.findOne(InventoryItem, {
        where: { id: inventoryItemId },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }

      if (options.updateStatus) {
        if (item.status !== AVAILABLE_FOR_PURCHASE_INVENTORY_STATUS) {
          const beforeInv = cloneInventoryItemForAudit(item);
          item.status = FOR_POSTING_INVENTORY_STATUS;
          item.updatedById = actorUserId;
          await em.save(item);
          await this.inventoryAudit.recordDiff(
            item.id,
            beforeInv,
            item,
            await this.inventoryAudit.staffActor(actorUserId),
            em,
          );
        }
      }

      let posting = await em.findOne(ItemPosting, {
        where: { inventoryItemId },
      });
      const beforePosting = posting ? clonePostingForAudit(posting) : null;
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
      posting.productDescription = productDescription;
      posting.updatedById = actorUserId;
      await em.save(posting);
      await this.inventoryAudit.recordPostingDiff(
        inventoryItemId,
        beforePosting,
        posting,
        await this.inventoryAudit.staffActor(actorUserId),
        em,
      );

      await this.media.referenceExistingKeys(
        MediaOwnerType.ITEM_POSTING,
        posting.id,
        MediaPurpose.POSTING_SELECTION,
        selectedPhotoKeys(selectedPhotosSnapshot),
        {
          uploadedByUserId: actorUserId,
          createdById: actorUserId,
        },
      );

      const shopifyProductId =
        posting.shopifyProductId != null
          ? String(posting.shopifyProductId).trim()
          : '';
      const shouldSyncShopify =
        item.status === AVAILABLE_FOR_PURCHASE_INVENTORY_STATUS &&
        shopifyProductId !== '';

      return {
        id: item.id,
        status: item.status,
        itemPostingId: posting.id,
        shouldSyncShopify,
      };
    });

    let shopifyUpdated = false;
    if (result.shouldSyncShopify) {
      await this.updateItemOnShopify(inventoryItemId);
      shopifyUpdated = true;
    }

    return {
      id: result.id,
      status: result.status,
      itemPostingId: result.itemPostingId,
      shopifyUpdated,
    };
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
    const name = consignorDisplayName({
      transactionType: r.transactionType,
      consignor: c,
      itemSnapshot: r.itemSnapshot,
    });
    const [auth, posting, photoshoot] = await Promise.all([
      this.itemAuthRepo.findOne({
        where: { inventoryItemId: id },
        relations: { assignedTo: true },
      }),
      this.itemPostingRepo.findOne({
        where: { inventoryItemId: id },
      }),
      this.itemPhotoshootRepo.findOne({
        where: { inventoryItem: { id } },
      }),
    ]);
    const photoshootPhotos = photoshoot
      ? this.media.toKeyUrlList(
          await this.media.findByOwner(
            MediaOwnerType.ITEM_PHOTOSHOOT,
            photoshoot.id,
            { purpose: MediaPurpose.PHOTOSHOOT, orderBySort: true },
          ),
        )
      : [];
    const vipSettings = await this.vipPricing.loadSettings();
    const vipTierPrices = this.vipPricing.tierPriceStrings(
      effectiveInventoryUnitPrice(r),
      Boolean(r.enableDiscount),
      vipSettings,
    );
    return {
      id: r.id,
      sku: r.sku,
      dateReceived: r.dateReceived.toISOString(),
      dateSold: r.dateSold?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      status: r.status,
      transactionType: r.transactionType,
      currentBranch: r.currentBranch,
      inquiryId: r.inquiryId,
      inquirySku: r.inquiry?.sku ?? null,
      consignorId: r.consignorId,
      consignorName: name,
      consignorEmail: c?.email?.trim() ?? null,
      consignorPhone: c?.contactNumber?.trim() ?? null,
      consignorVipStatus: c ? normalizeClientVipStatus(c.vipStatus) : null,
      consignorIsCreditLine: c ? Boolean(c.isCreditLine) : null,
      assignedToEmployeeId: auth?.assignedToId ?? null,
      assignedToName: formatEmployeeName(auth?.assignedTo ?? null),
      authenticationStatus: auth?.authenticationStatus ?? 'Pending',
      logisticsStatus: r.logisticsStatus ?? 'In Stock',
      thirdPartyAuthentication: await this.loadThirdPartyAuthenticationView(
        auth,
        id,
      ),
      reauthenticationNotes:
        auth?.reauthenticationNotes != null &&
        String(auth.reauthenticationNotes).trim() !== ''
          ? String(auth.reauthenticationNotes).trim()
          : null,
      authenticationDetails: mapAuthenticationDetailsView(auth),
      inquiryOfferPrice:
        r.inquiry?.offerPrice != null &&
        String(r.inquiry.offerPrice).trim() !== ''
          ? String(r.inquiry.offerPrice)
          : null,
      tbhSellingPrice:
        r.tbhSellingPrice != null && String(r.tbhSellingPrice).trim() !== ''
          ? String(r.tbhSellingPrice)
          : null,
      creditCardPrice:
        r.creditCardPrice != null && String(r.creditCardPrice).trim() !== ''
          ? String(r.creditCardPrice)
          : null,
      onPromo: r.onPromo,
      promoPrice:
        r.promoPrice != null && String(r.promoPrice).trim() !== ''
          ? String(r.promoPrice)
          : null,
      enableDiscount: r.enableDiscount,
      vipGoldPrice: vipTierPrices.gold,
      vipDiamondPrice: vipTierPrices.diamond,
      itemSnapshot: {
        clientItemId: r.itemSnapshot.clientItemId,
        form: (r.itemSnapshot.form ?? {}) as Record<string, unknown>,
      },
      itemPosting: posting ? await this.mapItemPostingForStaff(posting) : null,
      itemPhotoshoot: photoshoot
        ? {
            id: photoshoot.id,
            photoshootDate: photoshootDayKey(photoshoot.photoshootDate),
            photos: photoshootPhotos,
          }
        : null,
    };
  }

  async listWaitlistsForInventoryItem(
    id: string,
  ): Promise<InventoryItemWaitlistClientRow[]> {
    const item = await this.inventoryRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }

    const rows = await this.waitlistsRepo.find({
      where: { inventoryItemId: id },
      relations: { client: true },
      order: { createdAt: 'DESC' },
    });

    return rows.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      firstName: row.client.firstName,
      lastName: row.client.lastName,
      email: row.client.email,
      contactNumber: row.client.contactNumber,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async addClientToWaitlistForInventoryItem(
    inventoryItemId: string,
    clientId: string,
    actorUserId: string,
  ): Promise<InventoryItemWaitlistClientRow> {
    const item = await this.inventoryRepo.findOne({
      where: { id: inventoryItemId },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    if (!STAFF_WAITLISTABLE_INVENTORY_STATUSES.includes(item.status)) {
      throw new BadRequestException(
        'Waitlist entries cannot be added for this item status',
      );
    }

    const client = await this.clientsRepo.findOne({ where: { id: clientId } });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    if (item.consignorId === client.id) {
      throw new BadRequestException(
        'The consignor cannot be added to the waitlist',
      );
    }

    await this.waitlistsRepo
      .createQueryBuilder()
      .insert()
      .into(Waitlist)
      .values({
        inventoryItemId: item.id,
        clientId: client.id,
        createdById: actorUserId,
        updatedById: actorUserId,
      })
      .orIgnore()
      .execute();

    const row = await this.waitlistsRepo.findOne({
      where: { inventoryItemId: item.id, clientId: client.id },
      relations: { client: true },
    });
    if (!row) {
      throw new BadRequestException('Unable to add client to waitlist');
    }

    const clientLabel =
      `${row.client.firstName} ${row.client.lastName}`.trim() ||
      row.client.email;
    await this.inventoryAudit.recordChange(
      item.id,
      'Waitlist',
      '',
      `${clientLabel} added`,
      await this.inventoryAudit.staffActor(actorUserId),
    );

    return {
      id: row.id,
      clientId: row.clientId,
      firstName: row.client.firstName,
      lastName: row.client.lastName,
      email: row.client.email,
      contactNumber: row.client.contactNumber,
      createdAt: row.createdAt.toISOString(),
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
    return Promise.all(
      rows.map((p) => this.mapItemPhotoshootToCalendarRow(p)),
    );
  }

  async listItemPostingsForStaff(): Promise<ItemPostingCalendarRow[]> {
    const rows = await this.itemPostingRepo
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.inventoryItem', 'inv')
      .leftJoinAndSelect('inv.consignor', 'consignor')
      .where('inv.status = :forPosting', {
        forPosting: FOR_POSTING_INVENTORY_STATUS,
      })
      .orderBy('p.postingDate', 'ASC')
      .addOrderBy('p.id', 'ASC')
      .getMany();
    return rows.map((p) => {
      const inv = p.inventoryItem;
      const consignorName = consignorDisplayName({
        transactionType: inv?.transactionType,
        consignor: inv?.consignor ?? null,
        itemSnapshot: inv?.itemSnapshot,
      });
      return {
        id: p.id,
        inventoryItemId: p.inventoryItemId,
        postingDate: p.postingDate ? p.postingDate.toISOString() : null,
        sku: inv?.sku ?? '',
        itemLabel: itemLabelFromSnapshot(inv?.itemSnapshot),
        inclusions: inclusionsFromSnapshot(inv?.itemSnapshot),
        consignorName,
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
        const beforePosting = posting ? clonePostingForAudit(posting) : null;
        if (!posting) {
          posting = em.create(ItemPosting, {
            inventoryItemId,
            productName: itemLabelFromSnapshot(item.itemSnapshot),
            collections: [],
            tags: [],
            productDescription: null,
            createdById: actorUserId,
          });
        }
        posting.postingDate = postingDate;
        posting.updatedById = actorUserId;
        await em.save(posting);
        await this.inventoryAudit.recordPostingDiff(
          inventoryItemId,
          beforePosting,
          posting,
          await this.inventoryAudit.staffActor(actorUserId),
          em,
        );
      }
    });
    return { updated: uniqueIds.length };
  }

  async postItemToShopify(
    inventoryItemId: string,
    actorUserId: string,
  ): Promise<{
    productId: string;
    variantId: string | null;
    collectionCount: number;
    status: string;
  }> {
    const posting = await this.itemPostingRepo.findOne({
      where: { inventoryItemId },
      relations: { inventoryItem: true },
    });
    if (!posting) {
      throw new NotFoundException('Posting data not found for this item.');
    }
    const item = posting.inventoryItem;
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    if (
      posting.shopifyProductId != null &&
      String(posting.shopifyProductId).trim() !== ''
    ) {
      throw new ConflictException(
        'This item is already linked to a Shopify product. Edit the post to update the listing.',
      );
    }

    const photoUrls = await this.loadPostingPhotoUrls(posting.id);
    const { variant, images, productFields } = buildShopifyProductPayload(
      posting,
      item,
      photoUrls,
    );
    const product: ShopifyCreateProductInput = {
      ...productFields,
      variants: [variant],
      images,
    };

    const created = await this.shopifyAdmin.createProduct(product);
    const variantId = readShopifyVariantId(created.raw);
    for (const collectionId of posting.collections) {
      await this.shopifyAdmin.addProductToCollection(
        created.id,
        collectionId,
      );
    }

    const beforePosting = clonePostingForAudit(posting);
    posting.shopifyProductId = created.id;
    posting.shopifyVariantId = variantId;
    posting.shopifyPostedAt = new Date();
    await this.itemPostingRepo.save(posting);
    await this.inventoryAudit.recordPostingDiff(
      inventoryItemId,
      beforePosting,
      posting,
      await this.inventoryAudit.staffActor(actorUserId),
    );

    const beforeInv = cloneInventoryItemForAudit(item);
    item.status = AVAILABLE_FOR_PURCHASE_INVENTORY_STATUS;
    await this.inventoryRepo.save(item);
    await this.inventoryAudit.recordDiff(
      item.id,
      beforeInv,
      item,
      await this.inventoryAudit.staffActor(actorUserId),
    );

    return {
      productId: created.id,
      variantId,
      collectionCount: posting.collections.length,
      status: item.status,
    };
  }

  async updateItemOnShopify(inventoryItemId: string): Promise<{
    productId: string;
    updatedAt: string;
  }> {
    const posting = await this.itemPostingRepo.findOne({
      where: { inventoryItemId },
      relations: { inventoryItem: true },
    });
    if (!posting) {
      throw new NotFoundException('Posting data not found for this item.');
    }
    const item = posting.inventoryItem;
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    const shopifyProductId =
      posting.shopifyProductId != null
        ? String(posting.shopifyProductId).trim()
        : '';
    if (!shopifyProductId) {
      throw new BadRequestException(
        'Shopify product ID is missing. Link an existing Shopify product before updating.',
      );
    }
    if (item.status !== AVAILABLE_FOR_PURCHASE_INVENTORY_STATUS) {
      throw new BadRequestException(
        'Only items available for purchase can be updated on Shopify.',
      );
    }

    const productId = await this.syncPostedItemToShopify(posting, item);
    return {
      productId,
      updatedAt: new Date().toISOString(),
    };
  }

  private async syncPostedItemToShopify(
    posting: ItemPosting | null | undefined,
    item: InventoryItem,
  ): Promise<string> {
    if (!posting) {
      throw new NotFoundException('Posting data not found for this item.');
    }
    const shopifyProductId =
      posting.shopifyProductId != null
        ? String(posting.shopifyProductId).trim()
        : '';
    if (!shopifyProductId) {
      throw new BadRequestException(
        'Shopify product ID is missing. Link an existing Shopify product before updating.',
      );
    }
    const photoUrls = await this.loadPostingPhotoUrls(posting.id);
    const { variant, images, productFields } = buildShopifyProductPayload(
      posting,
      item,
      photoUrls,
    );
    const updateVariant: ShopifyUpdateProductInput['variants'][number] = {
      price: variant.price,
      sku: variant.sku,
    };
    if (variant.compare_at_price) {
      updateVariant.compare_at_price = variant.compare_at_price;
    }
    if (
      posting.shopifyVariantId != null &&
      String(posting.shopifyVariantId).trim() !== ''
    ) {
      updateVariant.id = String(posting.shopifyVariantId).trim();
    }

    const existingProduct =
      await this.shopifyAdmin.getProduct(shopifyProductId);
    for (const image of existingProduct.images) {
      await this.shopifyAdmin.deleteProductImage(shopifyProductId, image.id);
    }

    const updatePayload: ShopifyUpdateProductInput = {
      ...productFields,
      variants: [updateVariant],
      images,
    };
    await this.shopifyAdmin.updateProduct(shopifyProductId, updatePayload);

    const desiredCollectionIds = new Set(
      posting.collections.map((id) => numericShopifyIdForCompare(id)),
    );
    const existingCollects =
      await this.shopifyAdmin.listProductCollects(shopifyProductId);
    for (const collect of existingCollects) {
      const collectionNumeric = numericShopifyIdForCompare(collect.collection_id);
      if (!desiredCollectionIds.has(collectionNumeric)) {
        await this.shopifyAdmin.deleteCollect(collect.id);
      }
    }
    const existingCollectionIds = new Set(
      existingCollects.map((c) => numericShopifyIdForCompare(c.collection_id)),
    );
    for (const collectionId of posting.collections) {
      const collectionNumeric = numericShopifyIdForCompare(collectionId);
      if (!existingCollectionIds.has(collectionNumeric)) {
        await this.shopifyAdmin.addProductToCollection(
          shopifyProductId,
          collectionId,
        );
      }
    }

    if (!posting.shopifyVariantId && existingProduct.variants[0]?.id) {
      posting.shopifyVariantId = existingProduct.variants[0].id;
      await this.itemPostingRepo.save(posting);
    }

    return shopifyProductId;
  }

  async linkShopifyProduct(
    inventoryItemId: string,
    shopifyProductIdRaw: string,
    actorUserId: string,
  ): Promise<{ productId: string; variantId: string | null }> {
    const shopifyProductId = String(shopifyProductIdRaw ?? '').trim();
    if (!shopifyProductId) {
      throw new BadRequestException('Shopify product ID is required.');
    }

    const posting = await this.itemPostingRepo.findOne({
      where: { inventoryItemId },
      relations: { inventoryItem: true },
    });
    if (!posting) {
      throw new NotFoundException('Posting data not found for this item.');
    }
    const item = posting.inventoryItem;
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    if (item.status !== AVAILABLE_FOR_PURCHASE_INVENTORY_STATUS) {
      throw new BadRequestException(
        'Only items available for purchase can be linked to Shopify.',
      );
    }

    const product = await this.shopifyAdmin.getProduct(shopifyProductId);
    const variantId = product.variants[0]?.id ?? null;

    const beforePosting = clonePostingForAudit(posting);
    posting.shopifyProductId = product.id;
    posting.shopifyVariantId = variantId;
    if (!posting.shopifyPostedAt) {
      posting.shopifyPostedAt = new Date();
    }
    await this.itemPostingRepo.save(posting);
    await this.inventoryAudit.recordPostingDiff(
      inventoryItemId,
      beforePosting,
      posting,
      await this.inventoryAudit.staffActor(actorUserId),
    );

    return { productId: product.id, variantId };
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

  private async mapItemPhotoshootToCalendarRow(
    p: ItemPhotoshoot,
  ): Promise<ItemPhotoshootCalendarRow> {
    const inv = p.inventoryItem;
    const consignorName = consignorDisplayName({
      transactionType: inv.transactionType,
      consignor: inv.consignor,
      itemSnapshot: inv.itemSnapshot,
    });
    const photos = this.media.toKeyUrlList(
      await this.media.findByOwner(
        MediaOwnerType.ITEM_PHOTOSHOOT,
        p.id,
        { purpose: MediaPurpose.PHOTOSHOOT, orderBySort: true },
      ),
    );
    return {
      id: p.id,
      inventoryItemId: inv.id,
      photoshootDate: photoshootDayKey(p.photoshootDate),
      sku: inv.sku,
      itemLabel: itemLabelFromSnapshot(inv.itemSnapshot),
      inclusions: inclusionsFromSnapshot(inv.itemSnapshot),
      consignorName,
      photos,
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

    for (const file of files) {
      const mime = file.mimetype?.toLowerCase() ?? '';
      if (!PHOTOSHOOT_ALLOWED_IMAGE_MIMES.has(mime)) {
        throw new BadRequestException(
          `Unsupported image type: ${file.mimetype || 'unknown'}`,
        );
      }
    }

    await this.media.replaceGallery(
      MediaOwnerType.ITEM_PHOTOSHOOT,
      photoshootId,
      MediaPurpose.PHOTOSHOOT,
      retainKeys,
      files,
      (_index, file) => {
        const mime = file.mimetype?.toLowerCase() ?? 'image/jpeg';
        const ext = photoshootExtFromMime(mime);
        return `item-photoshoots/${photoshootId}/${randomUUID()}.${ext}`;
      },
      {
        uploadedByUserId: actorUserId,
        createdById: actorUserId,
      },
    );

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
    const photoCount = await this.media.countByOwner(
      MediaOwnerType.ITEM_PHOTOSHOOT,
      row.id,
      MediaPurpose.PHOTOSHOOT,
    );
    if (photoCount < MIN_PHOTOS_TO_FINISH_PHOTOSHOOT) {
      throw new BadRequestException(
        `At least ${MIN_PHOTOS_TO_FINISH_PHOTOSHOOT} photo is required before you can finish the photoshoot (saved: ${photoCount}).`,
      );
    }
    const beforeInv = cloneInventoryItemForAudit(item);
    item.status = FOR_PRICING_INVENTORY_STATUS;
    item.updatedById = actorUserId;
    await this.inventoryRepo.save(item);
    await this.inventoryAudit.recordDiff(
      item.id,
      beforeInv,
      item,
      await this.inventoryAudit.staffActor(actorUserId),
    );
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
      const auditActor = await this.inventoryAudit.staffActor(actorUserId);
      for (const inventoryItemId of uniqueIds) {
        const row = existingByInvId.get(inventoryItemId);
        if (row) {
          const beforeRow = { photoshootDate: row.photoshootDate } as ItemPhotoshoot;
          row.photoshootDate = photoshootDate;
          row.updatedById = actorUserId;
          await psRepo.save(row);
          await this.inventoryAudit.recordPhotoshootDate(
            inventoryItemId,
            beforeRow,
            row,
            auditActor,
            em,
          );
          resultIds.push(row.id);
        } else {
          const inserted = await psRepo.save(
            psRepo.create({
              inventoryItem: { id: inventoryItemId } as InventoryItem,
              photoshootDate,
              employeeId: null,
              createdById: actorUserId,
              updatedById: actorUserId,
            }),
          );
          await this.inventoryAudit.recordPhotoshootDate(
            inventoryItemId,
            null,
            inserted,
            auditActor,
            em,
          );
          resultIds.push(inserted.id);
        }
      }
      return { createdIds: resultIds };
    });
  }

  async finalizeSoldUnderWarrantyItems(): Promise<number> {
    const items = await this.inventoryRepo.find({
      where: { status: INVENTORY_STATUS_SOLD_UNDER_WARRANTY },
    });
    if (items.length === 0) return 0;

    const referenceDate = new Date();
    const toFinalize = items.filter(
      (item) =>
        item.dateSold != null &&
        isSoldDateEligibleForFinalStatus(item.dateSold, referenceDate),
    );
    if (toFinalize.length === 0) return 0;

    for (const item of toFinalize) {
      await this.finalizeInventoryItemAsSoldFinal(item.id, null, referenceDate);
    }

    return toFinalize.length;
  }

  async markSoldUnderWarrantyAsFinal(
    inventoryItemId: string,
    actorUserId: string,
  ): Promise<{ status: string }> {
    const item = await this.inventoryRepo.findOne({
      where: { id: inventoryItemId },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    if (item.status !== INVENTORY_STATUS_SOLD_UNDER_WARRANTY) {
      throw new BadRequestException(
        `Only items in "${INVENTORY_STATUS_SOLD_UNDER_WARRANTY}" can be marked as sold final.`,
      );
    }

    return this.finalizeInventoryItemAsSoldFinal(
      inventoryItemId,
      actorUserId,
      new Date(),
    );
  }

  /** Marks inventory sold final and records date_sold_final. */
  private async finalizeInventoryItemAsSoldFinal(
    inventoryItemId: string,
    actorUserId: string | null,
    soldFinalAt: Date,
  ): Promise<{ status: string }> {
    return this.inventoryRepo.manager.transaction(async (manager) => {
      const item = await manager.findOne(InventoryItem, {
        where: { id: inventoryItemId },
      });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }
      if (item.status !== INVENTORY_STATUS_SOLD_UNDER_WARRANTY) {
        throw new BadRequestException(
          `Only items in "${INVENTORY_STATUS_SOLD_UNDER_WARRANTY}" can be marked as sold final.`,
        );
      }

      const beforeInv = cloneInventoryItemForAudit(item);
      item.status = INVENTORY_STATUS_SOLD_FINAL;
      item.dateSoldFinal = soldFinalAt;
      if (actorUserId) {
        item.updatedById = actorUserId;
      }
      await manager.save(item);
      await this.inventoryAudit.recordDiff(
        item.id,
        beforeInv,
        item,
        actorUserId
          ? await this.inventoryAudit.staffActor(actorUserId)
          : this.inventoryAudit.systemActor(),
        manager,
      );

      return { status: item.status };
    });
  }
}
