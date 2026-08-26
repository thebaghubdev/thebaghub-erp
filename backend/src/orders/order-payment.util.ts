import { OrderPayment } from './entities/order-payment.entity';
import { Order } from './entities/order.entity';
import {
  ORDER_PAYMENT_STATUS_CONFIRMED,
  ORDER_PAYMENT_STATUS_FOR_VERIFICATION,
  ORDER_PAYMENT_STATUS_PENDING_LEGACY,
  ORDER_STATUS_RESERVATION,
  PAYMENT_TYPE_FULL,
  PAYMENT_TYPE_LAYAWAY,
} from './order-status.constants';
import { formatMoney, parseMoney } from './order-installment.util';

export type OrderPaymentView = {
  id: string;
  amountPaid: string | null;
  modeOfPayment: string | null;
  status: string;
  proofUrl: string | null;
  proofUploadedAt: string;
  paymentDate: string | null;
  markedPaidAt: string | null;
};

const RESERVATION_FEE = 5_000;

export const PAYMENT_MODE_CREDIT_VOUCHER = 'Credit Voucher';

export const ORDER_PAYMENT_MODE_OPTIONS = [
  'Bank transfer',
  'Cash',
  'Credit card',
  'Other',
] as const;

export type OrderPaymentMode = (typeof ORDER_PAYMENT_MODE_OPTIONS)[number];

export const BANK_TRANSFER_ACCOUNT_OPTIONS = [
  'BDO OPC',
  'BPI OPC',
  'BPI Personal',
  'BDO Personal',
] as const;

export type BankTransferAccount =
  (typeof BANK_TRANSFER_ACCOUNT_OPTIONS)[number];

const BANK_TRANSFER_MODE_PREFIX = 'Bank transfer — ';

export function isBankTransferPaymentMode(mode: string): boolean {
  const trimmed = mode.trim();
  return (
    trimmed === 'Bank transfer' ||
    trimmed.startsWith(BANK_TRANSFER_MODE_PREFIX)
  );
}

export function bankTransferAccountFromMode(mode: string): string {
  const trimmed = mode.trim();
  if (!trimmed.startsWith(BANK_TRANSFER_MODE_PREFIX)) return '';
  return trimmed.slice(BANK_TRANSFER_MODE_PREFIX.length);
}

export function composeOrderPaymentMode(
  mode: string,
  bankAccount?: string,
): string {
  if (mode.trim() !== 'Bank transfer') return mode.trim();
  const account = bankAccount?.trim() ?? '';
  return account ? `${BANK_TRANSFER_MODE_PREFIX}${account}` : 'Bank transfer';
}

export const ALLOWED_ORDER_PAYMENT_MODE_VALUES = [
  'Cash',
  'Credit card',
  'Other',
  ...BANK_TRANSFER_ACCOUNT_OPTIONS.map((account) =>
    composeOrderPaymentMode('Bank transfer', account),
  ),
] as const;

export function isOrderPaymentConfirmed(status: string): boolean {
  return status.trim() === ORDER_PAYMENT_STATUS_CONFIRMED;
}

export function isOrderPaymentPending(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized === ORDER_PAYMENT_STATUS_FOR_VERIFICATION.toLowerCase() ||
    normalized === ORDER_PAYMENT_STATUS_PENDING_LEGACY.toLowerCase()
  );
}

export function shouldIncludeOrderPayments(
  order: Pick<Order, 'paymentType'>,
): boolean {
  return order.paymentType === PAYMENT_TYPE_FULL;
}

export function shouldShowPriorFullPayments(
  order: Pick<Order, 'paymentType' | 'convertedToLayawayAt'>,
  paymentCount: number,
): boolean {
  return (
    order.paymentType === PAYMENT_TYPE_LAYAWAY &&
    order.convertedToLayawayAt != null &&
    paymentCount > 0
  );
}

export function shouldLoadOrderPaymentViews(
  order: Pick<Order, 'paymentType' | 'convertedToLayawayAt'>,
  paymentCount: number,
): boolean {
  return (
    shouldIncludeOrderPayments(order) ||
    shouldShowPriorFullPayments(order, paymentCount)
  );
}

export function computeFullPaymentCredit(
  order: Pick<
    Order,
    'status' | 'reservationPaymentProofUploadedAt' | 'reservationPaymentStatus'
  >,
  payments: Pick<OrderPayment, 'amountPaid' | 'status'>[],
): number {
  return reservationFeeCredit(order) + sumConfirmedOrderPayments(payments);
}

export function orderPaymentTotalPrice(
  order: Order,
  liveItemPrice: number | null,
): number | null {
  if (
    order.orderTotalPrice != null &&
    String(order.orderTotalPrice).trim() !== ''
  ) {
    return parseMoney(order.orderTotalPrice);
  }
  if (order.status === ORDER_STATUS_RESERVATION) {
    return liveItemPrice;
  }
  if (
    order.fullPaymentPrice == null ||
    String(order.fullPaymentPrice).trim() === ''
  ) {
    return null;
  }
  return parseMoney(order.fullPaymentPrice);
}

export function reservationFeeCredit(
  order: Pick<
    Order,
    'status' | 'reservationPaymentProofUploadedAt' | 'reservationPaymentStatus'
  >,
): number {
  if (order.status !== ORDER_STATUS_RESERVATION) return 0;
  const status = order.reservationPaymentStatus?.trim();
  if (status === ORDER_PAYMENT_STATUS_CONFIRMED) {
    return RESERVATION_FEE;
  }
  if (!status && order.reservationPaymentProofUploadedAt != null) {
    return RESERVATION_FEE;
  }
  return 0;
}

export function sumConfirmedOrderPayments(
  rows: Pick<OrderPayment, 'amountPaid' | 'status'>[],
): number {
  return rows.reduce((sum, row) => {
    if (!isOrderPaymentConfirmed(row.status)) return sum;
    return sum + (parseMoney(row.amountPaid) ?? 0);
  }, 0);
}

export function computeOrderPaymentRemainingBalance(
  order: Order,
  payments: Pick<OrderPayment, 'amountPaid' | 'status'>[],
  liveItemPrice: number | null,
): string | null {
  const total = orderPaymentTotalPrice(order, liveItemPrice);
  if (total == null) return null;
  const credit = reservationFeeCredit(order);
  const confirmed = sumConfirmedOrderPayments(payments);
  return formatMoney(Math.max(0, total - credit - confirmed));
}

export function buildOrderPaymentViews(
  rows: OrderPayment[],
  getProofUrl: (row: OrderPayment) => string | null,
): OrderPaymentView[] {
  return rows.map((row) => ({
    id: row.id,
    amountPaid: row.amountPaid,
    modeOfPayment: row.modeOfPayment,
    status: row.status,
    proofUrl: getProofUrl(row),
    proofUploadedAt: row.proofUploadedAt.toISOString(),
    paymentDate: row.paymentDate,
    markedPaidAt: row.markedPaidAt?.toISOString() ?? null,
  }));
}
