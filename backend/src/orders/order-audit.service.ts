import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { In, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { OrderAuditEntry } from './entities/order-audit-entry.entity';
import { OrderInstallment } from './entities/order-installment.entity';
import { OrderPayment } from './entities/order-payment.entity';
import { Order } from './entities/order.entity';

const MAX_VALUE_LEN = 8000;

export type OrderAuditActor = {
  userId: string | null;
  label: string;
};

export type OrderAuditRow = {
  id: string;
  propertyName: string;
  fromValue: string | null;
  toValue: string | null;
  updatedBy: string;
  updatedAt: string;
};

type OrderAuditState = {
  status: string;
  assignedToId: string | null;
  assignedToName: string;
  paymentType: string;
  layawayMonths: string;
  layawayPrice: string;
  layawayMonthlyPayment: string;
  fullPaymentPrice: string;
  orderTotalPrice: string;
  reservationProof: string;
  reservationPaymentStatus: string;
  fullPaymentProof: string;
  holdingPeriod: string;
  layawayPaymentStartDate: string;
  consignorPaymentRelease: string;
  convertedToLayaway: string;
  declineReason: string;
  pickupOption: string;
  pickupBranch: string;
  courierService: string;
  shippingFeeCareOf: string;
  shippingFeeProof: string;
};

type InstallmentAuditState = {
  scheduledAmount: string;
  penalty: string;
  penaltyOverridden: string;
  penaltyWaiveStatus: string;
  amountPaid: string;
  status: string;
  dueDate: string;
  paymentDate: string;
  modeOfPayment: string;
  voucher: string;
  proof: string;
};

type PaymentAuditState = {
  amountPaid: string;
  modeOfPayment: string;
  status: string;
  paymentDate: string;
  voucher: string;
  proof: string;
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

function dateOnlyText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim().slice(0, 10);
}

function timestampText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  return text;
}

function uploadedText(value: unknown): string {
  return value == null || value === '' ? '' : 'Uploaded';
}

function paymentTypeLabel(value: string): string {
  if (value === 'full_payment') return 'Full payment';
  if (value === 'layaway') return 'Layaway';
  if (value === 'credit_line') return 'Credit Line';
  return value;
}

function pickupOptionLabel(value: string): string {
  if (value === 'store_pickup') return 'Store pick-up';
  if (value === 'courier_delivery') return 'Courier delivery';
  if (value === 'in_store_purchase') return 'In-store purchase';
  return value;
}

function pickupBranchLabel(value: string): string {
  if (value === 'makati') return 'Makati';
  if (value === 'pasig') return 'Pasig';
  return value;
}

function courierServiceLabel(value: string): string {
  if (value === 'lbc') return 'LBC';
  if (value === 'third_party') return 'Third-party';
  return value;
}

function displayOrDash(value: string): string {
  return value === '' ? '—' : value;
}

export function cloneOrderForAudit(r: Order): Order {
  return JSON.parse(
    JSON.stringify({
      status: r.status,
      assignedToId: r.assignedToId,
      paymentType: r.paymentType,
      layawayMonths: r.layawayMonths,
      layawayPrice: r.layawayPrice,
      layawayMonthlyPayment: r.layawayMonthlyPayment,
      fullPaymentPrice: r.fullPaymentPrice,
      orderTotalPrice: r.orderTotalPrice,
      reservationPaymentProofUploadedAt: r.reservationPaymentProofUploadedAt,
      reservationPaymentStatus: r.reservationPaymentStatus,
      fullPaymentProofUploadedAt: r.fullPaymentProofUploadedAt,
      holdingPeriod: r.holdingPeriod,
      layawayPaymentStartDate: r.layawayPaymentStartDate,
      consignorPaymentRelease: r.consignorPaymentRelease,
      convertedToLayawayAt: r.convertedToLayawayAt,
      declineReason: r.declineReason,
      pickupOption: r.pickupOption,
      pickupBranch: r.pickupBranch,
      courierService: r.courierService,
      shippingFeeCareOf: r.shippingFeeCareOf,
      shippingFeeProofUploadedAt: r.shippingFeeProofUploadedAt,
    }),
  ) as Order;
}

export function cloneInstallmentForAudit(
  r: OrderInstallment,
): OrderInstallment {
  return JSON.parse(
    JSON.stringify({
      installmentNumber: r.installmentNumber,
      scheduledAmount: r.scheduledAmount,
      penalty: r.penalty,
      penaltyOverridden: r.penaltyOverridden,
      penaltyWaiveStatus: r.penaltyWaiveStatus,
      amountPaid: r.amountPaid,
      status: r.status,
      dueDate: r.dueDate,
      paymentDate: r.paymentDate,
      modeOfPayment: r.modeOfPayment,
      voucherId: r.voucherId,
      proofUploadedAt: r.proofUploadedAt,
    }),
  ) as OrderInstallment;
}

export function clonePaymentForAudit(r: OrderPayment): OrderPayment {
  return JSON.parse(
    JSON.stringify({
      amountPaid: r.amountPaid,
      modeOfPayment: r.modeOfPayment,
      status: r.status,
      paymentDate: r.paymentDate,
      voucherId: r.voucherId,
      proofUploadedAt: r.proofUploadedAt,
    }),
  ) as OrderPayment;
}

function emptyOrderState(): OrderAuditState {
  return {
    status: '',
    assignedToId: null,
    assignedToName: '',
    paymentType: '',
    layawayMonths: '',
    layawayPrice: '',
    layawayMonthlyPayment: '',
    fullPaymentPrice: '',
    orderTotalPrice: '',
    reservationProof: '',
    reservationPaymentStatus: '',
    fullPaymentProof: '',
    holdingPeriod: '',
    layawayPaymentStartDate: '',
    consignorPaymentRelease: '',
    convertedToLayaway: '',
    declineReason: '',
    pickupOption: '',
    pickupBranch: '',
    courierService: '',
    shippingFeeCareOf: '',
    shippingFeeProof: '',
  };
}

function emptyInstallmentState(): InstallmentAuditState {
  return {
    scheduledAmount: '',
    penalty: '',
    penaltyOverridden: '',
    penaltyWaiveStatus: '',
    amountPaid: '',
    status: '',
    dueDate: '',
    paymentDate: '',
    modeOfPayment: '',
    voucher: '',
    proof: '',
  };
}

function emptyPaymentState(): PaymentAuditState {
  return {
    amountPaid: '',
    modeOfPayment: '',
    status: '',
    paymentDate: '',
    voucher: '',
    proof: '',
  };
}

function toOrderState(
  r: Order,
  assignedNameById: Map<string, string>,
): OrderAuditState {
  const assignedToId = r.assignedToId ?? null;
  return {
    status: textOrEmpty(r.status),
    assignedToId,
    assignedToName: assignedToId
      ? (assignedNameById.get(assignedToId) ?? assignedToId)
      : '',
    paymentType: paymentTypeLabel(textOrEmpty(r.paymentType)),
    layawayMonths: textOrEmpty(r.layawayMonths),
    layawayPrice: moneyText(r.layawayPrice),
    layawayMonthlyPayment: moneyText(r.layawayMonthlyPayment),
    fullPaymentPrice: moneyText(r.fullPaymentPrice),
    orderTotalPrice: moneyText(r.orderTotalPrice),
    reservationProof: uploadedText(r.reservationPaymentProofUploadedAt),
    reservationPaymentStatus: textOrEmpty(r.reservationPaymentStatus),
    fullPaymentProof: uploadedText(r.fullPaymentProofUploadedAt),
    holdingPeriod: timestampText(r.holdingPeriod),
    layawayPaymentStartDate: dateOnlyText(r.layawayPaymentStartDate),
    consignorPaymentRelease: textOrEmpty(r.consignorPaymentRelease),
    convertedToLayaway: timestampText(r.convertedToLayawayAt),
    declineReason: textOrEmpty(r.declineReason),
    pickupOption: pickupOptionLabel(textOrEmpty(r.pickupOption)),
    pickupBranch: pickupBranchLabel(textOrEmpty(r.pickupBranch)),
    courierService: courierServiceLabel(textOrEmpty(r.courierService)),
    shippingFeeCareOf: textOrEmpty(r.shippingFeeCareOf),
    shippingFeeProof: uploadedText(r.shippingFeeProofUploadedAt),
  };
}

function toInstallmentState(r: OrderInstallment): InstallmentAuditState {
  return {
    scheduledAmount: moneyText(r.scheduledAmount),
    penalty: moneyText(r.penalty),
    penaltyOverridden: r.penaltyOverridden ? 'Yes' : '',
    penaltyWaiveStatus: textOrEmpty(r.penaltyWaiveStatus),
    amountPaid: moneyText(r.amountPaid),
    status: textOrEmpty(r.status),
    dueDate: dateOnlyText(r.dueDate),
    paymentDate: dateOnlyText(r.paymentDate),
    modeOfPayment: textOrEmpty(r.modeOfPayment),
    voucher: r.voucherId ? 'Applied' : '',
    proof: uploadedText(r.proofUploadedAt),
  };
}

function toPaymentState(r: OrderPayment): PaymentAuditState {
  return {
    amountPaid: moneyText(r.amountPaid),
    modeOfPayment: textOrEmpty(r.modeOfPayment),
    status: textOrEmpty(r.status),
    paymentDate: dateOnlyText(r.paymentDate),
    voucher: r.voucherId ? 'Applied' : '',
    proof: uploadedText(r.proofUploadedAt),
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

function diffOrderStates(
  before: OrderAuditState,
  after: OrderAuditState,
): Array<{ propertyName: string; fromValue: string; toValue: string }> {
  return diffPairs([
    ['Status', before.status, after.status],
    ['Assigned to', before.assignedToName, after.assignedToName],
    ['Payment type', before.paymentType, after.paymentType],
    ['Layaway months', before.layawayMonths, after.layawayMonths],
    ['Layaway price', before.layawayPrice, after.layawayPrice],
    [
      'Layaway monthly payment',
      before.layawayMonthlyPayment,
      after.layawayMonthlyPayment,
    ],
    ['Full payment price', before.fullPaymentPrice, after.fullPaymentPrice],
    ['Order total', before.orderTotalPrice, after.orderTotalPrice],
    ['Reservation payment proof', before.reservationProof, after.reservationProof],
    [
      'Reservation payment status',
      before.reservationPaymentStatus,
      after.reservationPaymentStatus,
    ],
    ['Full payment proof', before.fullPaymentProof, after.fullPaymentProof],
    ['Holding period', before.holdingPeriod, after.holdingPeriod],
    [
      'Layaway payment start date',
      before.layawayPaymentStartDate,
      after.layawayPaymentStartDate,
    ],
    [
      'Consignor payment release',
      before.consignorPaymentRelease,
      after.consignorPaymentRelease,
    ],
    ['Converted to layaway', before.convertedToLayaway, after.convertedToLayaway],
    ['Decline / cancel reason', before.declineReason, after.declineReason],
    ['Pick-up option', before.pickupOption, after.pickupOption],
    ['Pick-up branch', before.pickupBranch, after.pickupBranch],
    ['Courier service', before.courierService, after.courierService],
    ['Shipping fee care of', before.shippingFeeCareOf, after.shippingFeeCareOf],
    ['Shipping fee proof', before.shippingFeeProof, after.shippingFeeProof],
  ]);
}

function diffInstallmentStates(
  prefix: string,
  before: InstallmentAuditState,
  after: InstallmentAuditState,
): Array<{ propertyName: string; fromValue: string; toValue: string }> {
  return diffPairs([
    [`${prefix}: Scheduled amount`, before.scheduledAmount, after.scheduledAmount],
    [`${prefix}: Penalty`, before.penalty, after.penalty],
    [`${prefix}: Penalty overridden`, before.penaltyOverridden, after.penaltyOverridden],
    [`${prefix}: Penalty waive`, before.penaltyWaiveStatus, after.penaltyWaiveStatus],
    [`${prefix}: Amount paid`, before.amountPaid, after.amountPaid],
    [`${prefix}: Status`, before.status, after.status],
    [`${prefix}: Due date`, before.dueDate, after.dueDate],
    [`${prefix}: Payment date`, before.paymentDate, after.paymentDate],
    [`${prefix}: Mode of payment`, before.modeOfPayment, after.modeOfPayment],
    [`${prefix}: Voucher`, before.voucher, after.voucher],
    [`${prefix}: Proof`, before.proof, after.proof],
  ]);
}

function diffPaymentStates(
  prefix: string,
  before: PaymentAuditState,
  after: PaymentAuditState,
): Array<{ propertyName: string; fromValue: string; toValue: string }> {
  return diffPairs([
    [`${prefix}: Amount paid`, before.amountPaid, after.amountPaid],
    [`${prefix}: Mode of payment`, before.modeOfPayment, after.modeOfPayment],
    [`${prefix}: Status`, before.status, after.status],
    [`${prefix}: Payment date`, before.paymentDate, after.paymentDate],
    [`${prefix}: Voucher`, before.voucher, after.voucher],
    [`${prefix}: Proof`, before.proof, after.proof],
  ]);
}

@Injectable()
export class OrderAuditService {
  constructor(
    @InjectRepository(OrderAuditEntry)
    private readonly auditRepo: Repository<OrderAuditEntry>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    @InjectRepository(OrderPayment)
    private readonly paymentsRepo: Repository<OrderPayment>,
  ) {}

  async staffActorLabel(userId: string): Promise<string> {
    const emp = await this.employeesRepo.findOne({ where: { userId } });
    if (!emp) return 'Staff';
    const name = [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim();
    return name || 'Staff';
  }

  customerActor(userId: string | null): OrderAuditActor {
    return { userId, label: 'Customer' };
  }

  systemActor(): OrderAuditActor {
    return { userId: null, label: 'System' };
  }

  async recordDiff(
    orderId: string,
    before: Order,
    after: Order,
    actor: OrderAuditActor,
    manager?: EntityManager,
  ): Promise<void> {
    const nameById = await this.assignedNames(
      [before.assignedToId, after.assignedToId],
    );
    const rows = diffOrderStates(
      toOrderState(before, nameById),
      toOrderState(after, nameById),
    );
    if (rows.length === 0) return;
    await this.persistRows(orderId, rows, actor, manager);
  }

  async recordInitialCreation(
    order: Order,
    actor: OrderAuditActor,
    manager?: EntityManager,
  ): Promise<void> {
    const nameById = await this.assignedNames([order.assignedToId]);
    const rows = diffOrderStates(
      emptyOrderState(),
      toOrderState(order, nameById),
    );
    if (rows.length === 0) return;
    await this.persistRows(order.id, rows, actor, manager);
  }

  async recordInstallmentDiff(
    orderId: string,
    installment: OrderInstallment,
    before: OrderInstallment | null,
    actor: OrderAuditActor,
    manager?: EntityManager,
  ): Promise<void> {
    const prefix = `Installment ${installment.installmentNumber}`;
    const rows = diffInstallmentStates(
      prefix,
      before ? toInstallmentState(before) : emptyInstallmentState(),
      toInstallmentState(installment),
    );
    if (rows.length === 0) return;
    await this.persistRows(orderId, rows, actor, manager);
  }

  async recordPaymentDiff(
    orderId: string,
    payment: OrderPayment,
    before: OrderPayment | null,
    actor: OrderAuditActor,
    manager?: EntityManager,
  ): Promise<void> {
    const n = await this.paymentNumber(orderId, payment.id, manager);
    const prefix = `Payment ${n}`;
    const rows = diffPaymentStates(
      prefix,
      before ? toPaymentState(before) : emptyPaymentState(),
      toPaymentState(payment),
    );
    if (rows.length === 0) return;
    await this.persistRows(orderId, rows, actor, manager);
  }

  async findForOrder(orderId: string): Promise<OrderAuditRow[]> {
    const rows = await this.auditRepo.find({
      where: { orderId },
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

  private async paymentNumber(
    orderId: string,
    paymentId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager
      ? manager.getRepository(OrderPayment)
      : this.paymentsRepo;
    const rows = await repo.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });
    const idx = rows.findIndex((r) => r.id === paymentId);
    return idx >= 0 ? idx + 1 : rows.length;
  }

  private async persistRows(
    orderId: string,
    rows: Array<{ propertyName: string; fromValue: string; toValue: string }>,
    actor: OrderAuditActor,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(OrderAuditEntry)
      : this.auditRepo;
    const entities = rows.map((row) =>
      repo.create({
        orderId,
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
