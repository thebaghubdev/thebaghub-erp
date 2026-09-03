import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import type { InquiryMediaAuditSnapshot } from '../media/media.types';
import { Inquiry } from './entities/inquiry.entity';
import { InquiryAuditEntry } from './entities/inquiry-audit-entry.entity';

const MAX_VALUE_LEN = 8000;

export type InquiryAuditActor = {
  userId: string | null;
  label: string;
};

export type InquiryAuditRow = {
  id: string;
  propertyName: string;
  fromValue: string | null;
  toValue: string | null;
  updatedBy: string;
  updatedAt: string;
};

type AuditState = {
  sku: string;
  status: string;
  isWalkIn: boolean;
  walkInBranch: string | null;
  offerTransactionType: string | null;
  offerPrice: string | null;
  directPurchaseRequestedPrice: string | null;
  consignmentRequestedPrice: string | null;
  directPurchaseApproverNotes: string | null;
  directPurchaseRejectReason: string | null;
  contractRenewalRequestedPrice: string | null;
  offerSignaturePresent: boolean;
  notes: string | null;
  declineReason: string | null;
  pulloutFee: string | null;
  pulloutReason: string | null;
  pulloutPaymentStatus: string | null;
  thirdPartyPaymentStatus: string | null;
  itemForm: Record<string, string>;
  imageCount: number;
};

function truncate(s: string): string {
  if (s.length <= MAX_VALUE_LEN) return s;
  return `${s.slice(0, MAX_VALUE_LEN)}…`;
}

function formValueString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return truncate(JSON.stringify(v));
  return truncate(String(v));
}

export function cloneInquiryForAudit(r: Inquiry): Inquiry {
  return JSON.parse(
    JSON.stringify({
      sku: r.sku,
      status: r.status,
      isWalkIn: r.isWalkIn,
      walkInBranch: r.walkInBranch,
      offerTransactionType: r.offerTransactionType,
      offerPrice: r.offerPrice,
      directPurchaseRequestedPrice: r.directPurchaseRequestedPrice,
      consignmentRequestedPrice: r.consignmentRequestedPrice,
      directPurchaseApproverNotes: r.directPurchaseApproverNotes,
      directPurchaseRejectReason: r.directPurchaseRejectReason,
      contractRenewalRequestedPrice: r.contractRenewalRequestedPrice,
      notes: r.notes,
      declineReason: r.declineReason,
      assignedToId: r.assignedToId,
      itemSnapshot: r.itemSnapshot,
      pulloutFee: r.pulloutFee,
      pulloutReason: r.pulloutReason,
      pulloutPaymentStatus: r.pulloutPaymentStatus,
      thirdPartyPaymentStatus: r.thirdPartyPaymentStatus,
    }),
  ) as Inquiry;
}

function toAuditState(
  r: Inquiry,
  media?: InquiryMediaAuditSnapshot,
): AuditState {
  const form = (r.itemSnapshot?.form ?? {}) as Record<string, unknown>;
  const itemForm: Record<string, string> = {};
  for (const k of Object.keys(form)) {
    itemForm[k] = formValueString(form[k]);
  }
  return {
    sku: r.sku != null && String(r.sku).trim() !== '' ? String(r.sku).trim() : '',
    status: String(r.status),
    isWalkIn: Boolean(r.isWalkIn),
    walkInBranch: (() => {
      if (r.walkInBranch == null) return null;
      const t = String(r.walkInBranch).trim();
      return t === '' ? null : t;
    })(),
    offerTransactionType: r.offerTransactionType ?? null,
    offerPrice:
      r.offerPrice != null && String(r.offerPrice).trim() !== ''
        ? String(r.offerPrice)
        : null,
    directPurchaseRequestedPrice:
      r.directPurchaseRequestedPrice != null &&
      String(r.directPurchaseRequestedPrice).trim() !== ''
        ? String(r.directPurchaseRequestedPrice)
        : null,
    consignmentRequestedPrice:
      r.consignmentRequestedPrice != null &&
      String(r.consignmentRequestedPrice).trim() !== ''
        ? String(r.consignmentRequestedPrice)
        : null,
    directPurchaseApproverNotes: (() => {
      if (r.directPurchaseApproverNotes == null) return null;
      const t = String(r.directPurchaseApproverNotes).trim();
      return t === '' ? null : truncate(t);
    })(),
    directPurchaseRejectReason: (() => {
      if (r.directPurchaseRejectReason == null) return null;
      const t = String(r.directPurchaseRejectReason).trim();
      return t === '' ? null : truncate(t);
    })(),
    contractRenewalRequestedPrice:
      r.contractRenewalRequestedPrice != null &&
      String(r.contractRenewalRequestedPrice).trim() !== ''
        ? String(r.contractRenewalRequestedPrice)
        : null,
    offerSignaturePresent: media?.offerSignaturePresent ?? false,
    notes: (() => {
      if (r.notes == null) return null;
      const t = String(r.notes).trim();
      return t === '' ? null : truncate(t);
    })(),
    declineReason: (() => {
      if (r.declineReason == null) return null;
      const t = String(r.declineReason).trim();
      return t === '' ? null : truncate(t);
    })(),
    pulloutFee:
      r.pulloutFee != null && String(r.pulloutFee).trim() !== ''
        ? String(r.pulloutFee)
        : null,
    pulloutReason: (() => {
      if (r.pulloutReason == null) return null;
      const t = String(r.pulloutReason).trim();
      return t === '' ? null : truncate(t);
    })(),
    pulloutPaymentStatus:
      r.pulloutPaymentStatus != null &&
      String(r.pulloutPaymentStatus).trim() !== ''
        ? String(r.pulloutPaymentStatus).trim()
        : null,
    thirdPartyPaymentStatus:
      r.thirdPartyPaymentStatus != null &&
      String(r.thirdPartyPaymentStatus).trim() !== ''
        ? String(r.thirdPartyPaymentStatus).trim()
        : null,
    itemForm,
    imageCount: media?.imageCount ?? 0,
  };
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

function diffStates(
  before: AuditState,
  after: AuditState,
): Array<{ propertyName: string; fromValue: string; toValue: string }> {
  const out: Array<{
    propertyName: string;
    fromValue: string;
    toValue: string;
  }> = [];

  const push = (
    propertyName: string,
    fromV: string | null | undefined,
    toV: string | null | undefined,
  ) => {
    const fromS = fromV ?? '';
    const toS = toV ?? '';
    if (fromS === toS) return;
    out.push({
      propertyName,
      fromValue: fromS === '' ? '—' : fromS,
      toValue: toS === '' ? '—' : toS,
    });
  };

  push('SKU', before.sku, after.sku);
  push('Status', before.status, after.status);
  push('Walk-in', before.isWalkIn ? 'Yes' : '', after.isWalkIn ? 'Yes' : '');
  push('Walk-in branch', before.walkInBranch, after.walkInBranch);
  push(
    'Offer transaction type',
    before.offerTransactionType,
    after.offerTransactionType,
  );
  push('Offer price', before.offerPrice, after.offerPrice);
  push(
    'Direct purchase requested price',
    before.directPurchaseRequestedPrice,
    after.directPurchaseRequestedPrice,
  );
  push(
    'Consignment requested price',
    before.consignmentRequestedPrice,
    after.consignmentRequestedPrice,
  );
  push(
    'Notes for approver',
    before.directPurchaseApproverNotes,
    after.directPurchaseApproverNotes,
  );
  push(
    'Direct purchase reject reason',
    before.directPurchaseRejectReason,
    after.directPurchaseRejectReason,
  );
  push(
    'Contract renewal requested price',
    before.contractRenewalRequestedPrice,
    after.contractRenewalRequestedPrice,
  );
  const bSig = before.offerSignaturePresent ? 'Provided' : '';
  const aSig = after.offerSignaturePresent ? 'Provided' : '';
  push('Offer signature', bSig, aSig);
  push('Staff notes', before.notes, after.notes);
  push('Decline reason', before.declineReason, after.declineReason);
  push('Pullout fee', before.pulloutFee, after.pulloutFee);
  push('Pullout reason', before.pulloutReason, after.pulloutReason);
  push(
    'Pullout payment status',
    before.pulloutPaymentStatus,
    after.pulloutPaymentStatus,
  );
  push(
    '3rd-party payment status',
    before.thirdPartyPaymentStatus,
    after.thirdPartyPaymentStatus,
  );
  push(
    'Photos (count)',
    before.imageCount > 0 ? String(before.imageCount) : '',
    after.imageCount > 0 ? String(after.imageCount) : '',
  );

  const formKeys = new Set([
    ...Object.keys(before.itemForm),
    ...Object.keys(after.itemForm),
  ]);
  for (const k of formKeys) {
    const bf = before.itemForm[k] ?? '';
    const af = after.itemForm[k] ?? '';
    if (bf !== af) {
      push(humanFormKey(k), bf === '' ? '—' : bf, af === '' ? '—' : af);
    }
  }

  return out;
}

@Injectable()
export class InquiryAuditService {
  constructor(
    @InjectRepository(InquiryAuditEntry)
    private readonly auditRepo: Repository<InquiryAuditEntry>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
  ) {}

  /** Resolve display label for staff JWT user id. */
  async staffActorLabel(userId: string): Promise<string> {
    const emp = await this.employeesRepo.findOne({ where: { userId } });
    if (!emp) return 'Staff';
    const name = [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim();
    return name || 'Staff';
  }

  consignorActor(userId: string | null): InquiryAuditActor {
    return { userId, label: 'Consignor' };
  }

  /**
   * Compare two inquiry rows and persist one audit row per changed property.
   */
  async recordDiff(
    inquiryId: string,
    before: Inquiry,
    after: Inquiry,
    actor: InquiryAuditActor,
    manager?: EntityManager,
    beforeMedia?: InquiryMediaAuditSnapshot,
    afterMedia?: InquiryMediaAuditSnapshot,
  ): Promise<void> {
    const rows = diffStates(
      toAuditState(before, beforeMedia),
      toAuditState(after, afterMedia),
    );
    if (rows.length === 0) return;
    await this.persistRows(inquiryId, rows, actor, manager);
  }

  async recordAssignedTo(
    inquiryId: string,
    fromName: string,
    toName: string,
    actor: InquiryAuditActor,
    manager?: EntityManager,
  ): Promise<void> {
    if (fromName === toName) return;
    await this.persistRows(
      inquiryId,
      [
        {
          propertyName: 'Assigned to',
          fromValue: fromName === '' ? '—' : fromName,
          toValue: toName === '' ? '—' : toName,
        },
      ],
      actor,
      manager,
    );
  }

  /** First submission: creation event plus initial field values. */
  async recordInitialSubmission(
    inquiryId: string,
    inquiry: Inquiry,
    actor: InquiryAuditActor,
    manager?: EntityManager,
    media?: InquiryMediaAuditSnapshot,
  ): Promise<void> {
    const empty: AuditState = {
      sku: '',
      status: '',
      isWalkIn: false,
      walkInBranch: null,
      offerTransactionType: null,
      offerPrice: null,
      directPurchaseRequestedPrice: null,
      consignmentRequestedPrice: null,
      directPurchaseApproverNotes: null,
      directPurchaseRejectReason: null,
      contractRenewalRequestedPrice: null,
      offerSignaturePresent: false,
      notes: null,
      declineReason: null,
      pulloutFee: null,
      pulloutReason: null,
      pulloutPaymentStatus: null,
      thirdPartyPaymentStatus: null,
      itemForm: {},
      imageCount: 0,
    };
    const rows = [
      {
        propertyName: 'Record created',
        fromValue: '—',
        toValue: 'Created',
      },
      ...diffStates(empty, toAuditState(inquiry, media)),
    ];
    await this.persistRows(inquiryId, rows, actor, manager);
  }

  private async persistRows(
    inquiryId: string,
    rows: Array<{ propertyName: string; fromValue: string; toValue: string }>,
    actor: InquiryAuditActor,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(InquiryAuditEntry)
      : this.auditRepo;
    const entities = rows.map((row) =>
      repo.create({
        inquiryId,
        propertyName: row.propertyName,
        fromValue: row.fromValue,
        toValue: row.toValue,
        updatedByUserId: actor.userId,
        updatedByLabel: actor.label,
      }),
    );
    await repo.save(entities);
  }

  async findForInquiry(inquiryId: string): Promise<InquiryAuditRow[]> {
    const rows = await this.auditRepo.find({
      where: { inquiryId },
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
}
