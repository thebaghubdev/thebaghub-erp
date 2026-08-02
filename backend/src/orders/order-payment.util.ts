import { OrderPayment } from './entities/order-payment.entity';
import { Order } from './entities/order.entity';
import {
  ORDER_PAYMENT_STATUS_CONFIRMED,
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

export const ORDER_PAYMENT_MODE_OPTIONS = [
  'Bank transfer',
  'Cash',
  'Credit card',
  'Store voucher',
  'Other',
] as const;

export type OrderPaymentMode = (typeof ORDER_PAYMENT_MODE_OPTIONS)[number];

export function isOrderPaymentConfirmed(status: string): boolean {
  return status.trim() === ORDER_PAYMENT_STATUS_CONFIRMED;
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
  order: Pick<Order, 'status' | 'reservationPaymentProofUploadedAt'>,
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
  order: Pick<Order, 'status' | 'reservationPaymentProofUploadedAt'>,
): number {
  if (order.status !== ORDER_STATUS_RESERVATION) return 0;
  if (order.reservationPaymentProofUploadedAt != null) {
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
