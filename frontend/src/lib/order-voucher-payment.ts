export const VOUCHER_APPLICABLE_ORDER_STATUSES = [
  "For Payment",
  "Reservation",
  "Item Received - Unpaid",
] as const;

export function isVoucherApplicableOrderStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return VOUCHER_APPLICABLE_ORDER_STATUSES.some(
    (value) => value.toLowerCase() === normalized,
  );
}

export function computeVoucherApplicationAmounts(
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
