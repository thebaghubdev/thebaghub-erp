import {
  ORDER_STATUS_FOR_PAYMENT,
  ORDER_STATUS_ITEM_RECEIVED_UNPAID,
  ORDER_STATUS_RESERVATION,
} from './order-status.constants';

export const VOUCHER_APPLICABLE_ORDER_STATUSES = [
  ORDER_STATUS_FOR_PAYMENT,
  ORDER_STATUS_RESERVATION,
  ORDER_STATUS_ITEM_RECEIVED_UNPAID,
] as const;

export function isVoucherApplicableOrderStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return VOUCHER_APPLICABLE_ORDER_STATUSES.some(
    (value) => value.toLowerCase() === normalized,
  );
}

export function computeVoucherAppliedAmount(
  voucherAmount: number,
  amountDue: number,
): { appliedAmount: number; forfeitedAmount: number } {
  const appliedAmount = Math.min(voucherAmount, amountDue);
  const forfeitedAmount = Math.max(
    0,
    Math.round((voucherAmount - appliedAmount) * 100) / 100,
  );
  return { appliedAmount, forfeitedAmount };
}
