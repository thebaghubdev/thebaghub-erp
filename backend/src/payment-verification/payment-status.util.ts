export const PAYMENT_STATUS_FOR_VERIFICATION = 'For payment verification';
export const PAYMENT_STATUS_CONFIRMED = 'Confirmed';
/** Legacy stored value; treat as awaiting verification. */
export const PAYMENT_STATUS_PENDING_LEGACY = 'Pending';

export function isPaymentAwaitingVerification(
  status: string | null | undefined,
): boolean {
  const normalized = status?.trim().toLowerCase();
  return (
    normalized === PAYMENT_STATUS_FOR_VERIFICATION.toLowerCase() ||
    normalized === PAYMENT_STATUS_PENDING_LEGACY.toLowerCase()
  );
}

export function isPaymentConfirmed(
  status: string | null | undefined,
): boolean {
  return status?.trim() === PAYMENT_STATUS_CONFIRMED;
}
