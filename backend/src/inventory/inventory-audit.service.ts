import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { In, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { InventoryItem } from './entities/inventory-item.entity';
import { InventoryItemAuditEntry } from './entities/inventory-item-audit-entry.entity';
import { ItemAuthentication } from './entities/item-authentication.entity';
import { ItemPhotoshoot } from './entities/item-photoshoot.entity';
import { ItemPosting } from './entities/item-posting.entity';

const MAX_VALUE_LEN = 8000;

export type InventoryAuditActor = {
  userId: string | null;
  label: string;
};

export type InventoryAuditRow = {
  id: string;
  propertyName: string;
  fromValue: string | null;
  toValue: string | null;
  updatedBy: string;
  updatedAt: string;
};

type ItemAuditState = {
  sku: string;
  status: string;
  transactionType: string;
  currentBranch: string;
  logisticsStatus: string;
  tbhSellingPrice: string;
  creditCardPrice: string;
  enableDiscount: string;
  onPromo: string;
  promoPrice: string;
  dateSold: string;
  dateSoldFinal: string;
  itemForm: Record<string, string>;
};

type AuthAuditState = {
  assignedToId: string | null;
  assignedToName: string;
  authenticationStatus: string;
  rating: string;
  dimensions: string;
  marketPrice: string;
  retailPrice: string;
  marketResearchNotes: string;
  marketResearchLink: string;
  authenticatorNotes: string;
  reauthenticationNotes: string;
  thirdPartyAuthenticator: string;
  thirdPartyCertificateLink: string;
  thirdPartyNotes: string;
};

type PostingAuditState = {
  postingDate: string;
  productName: string;
  collections: string;
  tags: string;
  productDescription: string;
  shopifyProductId: string;
};

function truncate(s: string): string {
  if (s.length <= MAX_VALUE_LEN) return s;
  return `${s.slice(0, MAX_VALUE_LEN)}…`;
}

function textOrEmpty(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const text = String(value).trim();
  return text ? truncate(text) : '';
}

function moneyText(value: unknown): string {
  const text = textOrEmpty(value);
  if (!text) return '';
  const n = Number(text);
  if (!Number.isFinite(n)) return text;
  return n.toFixed(2);
}

function timestampText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function dateOnlyText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim().slice(0, 10);
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function displayOrDash(value: string): string {
  return value === '' ? '—' : value;
}

function formValueString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return truncate(JSON.stringify(v));
  return truncate(String(v));
}

function humanFormKey(k: string): string {
  if (k === 'itemModel') return 'Item: Model';
  if (k === 'consignmentSellingPrice') return 'Item: Consignment selling price';
  if (k === 'directPurchaseSellingPrice')
    return 'Item: Direct purchase selling price';
  if (k === 'consentDirectPurchase') return 'Item: Consent direct purchase';
  if (k === 'consentPriceNomination') return 'Item: Consent price nomination';
  if (k === 'serialNumber') return 'Item: Serial number';
  if (k === 'sourceOfPurchase') return 'Item: Source of purchase';
  if (k === 'datePurchased') return 'Item: Date purchased';
  if (k === 'specialInstructions') return 'Item: Special instructions';
  const spaced = k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ');
  const t = spaced.trim();
  const cap = t.length > 0 ? t.charAt(0).toUpperCase() + t.slice(1) : k;
  return `Item: ${cap}`;
}

function listText(values: string[] | null | undefined): string {
  if (!values || values.length === 0) return '';
  return values.map((v) => String(v).trim()).filter(Boolean).join(', ');
}

export function cloneInventoryItemForAudit(r: InventoryItem): InventoryItem {
  return JSON.parse(
    JSON.stringify({
      sku: r.sku,
      status: r.status,
      transactionType: r.transactionType,
      currentBranch: r.currentBranch,
      logisticsStatus: r.logisticsStatus,
      tbhSellingPrice: r.tbhSellingPrice,
      creditCardPrice: r.creditCardPrice,
      enableDiscount: r.enableDiscount,
      onPromo: r.onPromo,
      promoPrice: r.promoPrice,
      dateSold: r.dateSold,
      dateSoldFinal: r.dateSoldFinal,
      itemSnapshot: r.itemSnapshot,
    }),
  ) as InventoryItem;
}

export function cloneAuthForAudit(r: ItemAuthentication): ItemAuthentication {
  return JSON.parse(
    JSON.stringify({
      assignedToId: r.assignedToId,
      authenticationStatus: r.authenticationStatus,
      rating: r.rating,
      dimensions: r.dimensions,
      marketPrice: r.marketPrice,
      retailPrice: r.retailPrice,
      marketResearchNotes: r.marketResearchNotes,
      marketResearchLink: r.marketResearchLink,
      authenticatorNotes: r.authenticatorNotes,
      reauthenticationNotes: r.reauthenticationNotes,
      thirdPartyAuthenticationData: r.thirdPartyAuthenticationData,
    }),
  ) as ItemAuthentication;
}

export function clonePostingForAudit(r: ItemPosting): ItemPosting {
  return JSON.parse(
    JSON.stringify({
      postingDate: r.postingDate,
      productName: r.productName,
      collections: r.collections,
      tags: r.tags,
      productDescription: r.productDescription,
      shopifyProductId: r.shopifyProductId,
    }),
  ) as ItemPosting;
}

function emptyItemState(): ItemAuditState {
  return {
    sku: '',
    status: '',
    transactionType: '',
    currentBranch: '',
    logisticsStatus: '',
    tbhSellingPrice: '',
    creditCardPrice: '',
    enableDiscount: '',
    onPromo: '',
    promoPrice: '',
    dateSold: '',
    dateSoldFinal: '',
    itemForm: {},
  };
}

function emptyAuthState(): AuthAuditState {
  return {
    assignedToId: null,
    assignedToName: '',
    authenticationStatus: '',
    rating: '',
    dimensions: '',
    marketPrice: '',
    retailPrice: '',
    marketResearchNotes: '',
    marketResearchLink: '',
    authenticatorNotes: '',
    reauthenticationNotes: '',
    thirdPartyAuthenticator: '',
    thirdPartyCertificateLink: '',
    thirdPartyNotes: '',
  };
}

function emptyPostingState(): PostingAuditState {
  return {
    postingDate: '',
    productName: '',
    collections: '',
    tags: '',
    productDescription: '',
    shopifyProductId: '',
  };
}

function toItemState(r: InventoryItem): ItemAuditState {
  const form = (r.itemSnapshot?.form ?? {}) as Record<string, unknown>;
  const itemForm: Record<string, string> = {};
  for (const k of Object.keys(form)) {
    itemForm[k] = formValueString(form[k]);
  }
  return {
    sku: textOrEmpty(r.sku),
    status: textOrEmpty(r.status),
    transactionType: textOrEmpty(r.transactionType),
    currentBranch: textOrEmpty(r.currentBranch),
    logisticsStatus: textOrEmpty(r.logisticsStatus),
    tbhSellingPrice: moneyText(r.tbhSellingPrice),
    creditCardPrice: moneyText(r.creditCardPrice),
    enableDiscount: yesNo(Boolean(r.enableDiscount)),
    onPromo: yesNo(Boolean(r.onPromo)),
    promoPrice: moneyText(r.promoPrice),
    dateSold: timestampText(r.dateSold),
    dateSoldFinal: timestampText(r.dateSoldFinal),
    itemForm,
  };
}

function toAuthState(
  r: ItemAuthentication,
  assignedNameById: Map<string, string>,
): AuthAuditState {
  const assignedToId = r.assignedToId ?? null;
  const tp = r.thirdPartyAuthenticationData;
  return {
    assignedToId,
    assignedToName: assignedToId
      ? (assignedNameById.get(assignedToId) ?? assignedToId)
      : '',
    authenticationStatus: textOrEmpty(r.authenticationStatus),
    rating: textOrEmpty(r.rating),
    dimensions: textOrEmpty(r.dimensions),
    marketPrice: moneyText(r.marketPrice),
    retailPrice: moneyText(r.retailPrice),
    marketResearchNotes: textOrEmpty(r.marketResearchNotes),
    marketResearchLink: textOrEmpty(r.marketResearchLink),
    authenticatorNotes: textOrEmpty(r.authenticatorNotes),
    reauthenticationNotes: textOrEmpty(r.reauthenticationNotes),
    thirdPartyAuthenticator: textOrEmpty(tp?.selectedAuthenticator),
    thirdPartyCertificateLink: textOrEmpty(tp?.certificateLink),
    thirdPartyNotes: textOrEmpty(tp?.notes),
  };
}

function toPostingState(r: ItemPosting): PostingAuditState {
  return {
    postingDate: dateOnlyText(r.postingDate),
    productName: textOrEmpty(r.productName),
    collections: listText(r.collections),
    tags: listText(r.tags),
    productDescription: textOrEmpty(r.productDescription),
    shopifyProductId: textOrEmpty(r.shopifyProductId),
  };
}

function diffPairs(
  pairs: Array<[string, string, string]>,
): Array<{ propertyName: string; fromValue: string; toValue: string }> {
  const out: Array<{
    propertyName: string;
    fromValue: string;
    toValue: string;
  }> = [];
  for (const [propertyName, fromV, toV] of pairs) {
    if (fromV === toV) continue;
    out.push({
      propertyName,
      fromValue: displayOrDash(fromV),
      toValue: displayOrDash(toV),
    });
  }
  return out;
}

function diffItemStates(
  before: ItemAuditState,
  after: ItemAuditState,
): Array<{ propertyName: string; fromValue: string; toValue: string }> {
  const out = diffPairs([
    ['SKU', before.sku, after.sku],
    ['Status', before.status, after.status],
    ['Transaction type', before.transactionType, after.transactionType],
    ['Current branch', before.currentBranch, after.currentBranch],
    ['Logistics status', before.logisticsStatus, after.logisticsStatus],
    ['TBH selling price', before.tbhSellingPrice, after.tbhSellingPrice],
    ['Credit card price', before.creditCardPrice, after.creditCardPrice],
    ['Enable discount', before.enableDiscount, after.enableDiscount],
    ['On promo', before.onPromo, after.onPromo],
    ['Promo price', before.promoPrice, after.promoPrice],
    ['Date sold', before.dateSold, after.dateSold],
    ['Date sold final', before.dateSoldFinal, after.dateSoldFinal],
  ]);
  const keys = new Set([
    ...Object.keys(before.itemForm),
    ...Object.keys(after.itemForm),
  ]);
  for (const k of keys) {
    const fromV = before.itemForm[k] ?? '';
    const toV = after.itemForm[k] ?? '';
    if (fromV === toV) continue;
    out.push({
      propertyName: humanFormKey(k),
      fromValue: displayOrDash(fromV),
      toValue: displayOrDash(toV),
    });
  }
  return out;
}

function diffAuthStates(
  before: AuthAuditState,
  after: AuthAuditState,
): Array<{ propertyName: string; fromValue: string; toValue: string }> {
  return diffPairs([
    ['Authentication: Assigned to', before.assignedToName, after.assignedToName],
    [
      'Authentication: Status',
      before.authenticationStatus,
      after.authenticationStatus,
    ],
    ['Authentication: Rating', before.rating, after.rating],
    ['Authentication: Dimensions', before.dimensions, after.dimensions],
    ['Authentication: Market price', before.marketPrice, after.marketPrice],
    ['Authentication: Retail price', before.retailPrice, after.retailPrice],
    [
      'Authentication: Market research notes',
      before.marketResearchNotes,
      after.marketResearchNotes,
    ],
    [
      'Authentication: Market research link',
      before.marketResearchLink,
      after.marketResearchLink,
    ],
    [
      'Authentication: Authenticator notes',
      before.authenticatorNotes,
      after.authenticatorNotes,
    ],
    [
      'Authentication: Reauthentication notes',
      before.reauthenticationNotes,
      after.reauthenticationNotes,
    ],
    [
      'Authentication: 3rd party authenticator',
      before.thirdPartyAuthenticator,
      after.thirdPartyAuthenticator,
    ],
    [
      'Authentication: 3rd party certificate link',
      before.thirdPartyCertificateLink,
      after.thirdPartyCertificateLink,
    ],
    [
      'Authentication: 3rd party notes',
      before.thirdPartyNotes,
      after.thirdPartyNotes,
    ],
  ]);
}

function diffPostingStates(
  before: PostingAuditState,
  after: PostingAuditState,
): Array<{ propertyName: string; fromValue: string; toValue: string }> {
  return diffPairs([
    ['Posting: Date', before.postingDate, after.postingDate],
    ['Posting: Product name', before.productName, after.productName],
    ['Posting: Collections', before.collections, after.collections],
    ['Posting: Tags', before.tags, after.tags],
    [
      'Posting: Product description',
      before.productDescription,
      after.productDescription,
    ],
    ['Posting: Shopify product ID', before.shopifyProductId, after.shopifyProductId],
  ]);
}

@Injectable()
export class InventoryAuditService {
  constructor(
    @InjectRepository(InventoryItemAuditEntry)
    private readonly auditRepo: Repository<InventoryItemAuditEntry>,
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
  ) {}

  async staffActorLabel(userId: string): Promise<string> {
    const emp = await this.employeesRepo.findOne({ where: { userId } });
    if (!emp) return 'Staff';
    const name = [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim();
    return name || 'Staff';
  }

  async staffActor(userId: string): Promise<InventoryAuditActor> {
    return { userId, label: await this.staffActorLabel(userId) };
  }

  customerActor(userId: string | null): InventoryAuditActor {
    return { userId, label: 'Customer' };
  }

  systemActor(): InventoryAuditActor {
    return { userId: null, label: 'System' };
  }

  async recordDiff(
    inventoryItemId: string,
    before: InventoryItem,
    after: InventoryItem,
    actor: InventoryAuditActor,
    manager?: EntityManager,
  ): Promise<void> {
    const rows = diffItemStates(toItemState(before), toItemState(after));
    if (rows.length === 0) return;
    await this.persistRows(inventoryItemId, rows, actor, manager);
  }

  async recordInitialCreation(
    item: InventoryItem,
    actor: InventoryAuditActor,
    manager?: EntityManager,
  ): Promise<void> {
    const rows = diffItemStates(emptyItemState(), toItemState(item));
    if (rows.length === 0) return;
    await this.persistRows(item.id, rows, actor, manager);
  }

  async recordAuthDiff(
    inventoryItemId: string,
    before: ItemAuthentication | null,
    after: ItemAuthentication,
    actor: InventoryAuditActor,
    manager?: EntityManager,
  ): Promise<void> {
    const nameById = await this.assignedNames([
      before?.assignedToId,
      after.assignedToId,
    ]);
    const rows = diffAuthStates(
      before ? toAuthState(before, nameById) : emptyAuthState(),
      toAuthState(after, nameById),
    );
    if (rows.length === 0) return;
    await this.persistRows(inventoryItemId, rows, actor, manager);
  }

  async recordPostingDiff(
    inventoryItemId: string,
    before: ItemPosting | null,
    after: ItemPosting,
    actor: InventoryAuditActor,
    manager?: EntityManager,
  ): Promise<void> {
    const rows = diffPostingStates(
      before ? toPostingState(before) : emptyPostingState(),
      toPostingState(after),
    );
    if (rows.length === 0) return;
    await this.persistRows(inventoryItemId, rows, actor, manager);
  }

  async recordChange(
    inventoryItemId: string,
    propertyName: string,
    fromValue: string,
    toValue: string,
    actor: InventoryAuditActor,
    manager?: EntityManager,
  ): Promise<void> {
    if (fromValue === toValue) return;
    await this.persistRows(
      inventoryItemId,
      [
        {
          propertyName,
          fromValue: displayOrDash(fromValue),
          toValue: displayOrDash(toValue),
        },
      ],
      actor,
      manager,
    );
  }

  async recordPhotoshootDate(
    inventoryItemId: string,
    before: ItemPhotoshoot | null,
    after: ItemPhotoshoot,
    actor: InventoryAuditActor,
    manager?: EntityManager,
  ): Promise<void> {
    await this.recordChange(
      inventoryItemId,
      'Photoshoot date',
      before ? dateOnlyText(before.photoshootDate) : '',
      dateOnlyText(after.photoshootDate),
      actor,
      manager,
    );
  }

  async findForInventoryItem(
    inventoryItemId: string,
  ): Promise<InventoryAuditRow[]> {
    const exists = await this.inventoryRepo.exists({
      where: { id: inventoryItemId },
    });
    if (!exists) {
      throw new NotFoundException('Inventory item not found');
    }
    const rows = await this.auditRepo.find({
      where: { inventoryItemId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      propertyName: r.propertyName,
      fromValue: r.fromValue,
      toValue: r.toValue,
      updatedBy: r.updatedByLabel,
      updatedAt: r.createdAt.toISOString(),
    }));
  }

  private async assignedNames(
    ids: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const unique = [
      ...new Set(
        ids.filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    if (unique.length === 0) return new Map();
    const rows = await this.employeesRepo.find({ where: { id: In(unique) } });
    return new Map(
      rows.map((e) => {
        const name = [e.firstName, e.lastName].filter(Boolean).join(' ').trim();
        return [e.id, name || e.email];
      }),
    );
  }

  private async persistRows(
    inventoryItemId: string,
    rows: Array<{ propertyName: string; fromValue: string; toValue: string }>,
    actor: InventoryAuditActor,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(InventoryItemAuditEntry)
      : this.auditRepo;
    const entities = rows.map((row) =>
      repo.create({
        inventoryItemId,
        propertyName: row.propertyName,
        fromValue: row.fromValue,
        toValue: row.toValue,
        updatedByUserId: actor.userId,
        updatedByLabel: actor.label,
      }),
    );
    await repo.save(entities);
  }
}
