export const PAYMENT_STATUS_FOR_VERIFICATION = "For payment verification";
export const PAYMENT_STATUS_CONFIRMED = "Confirmed";

export function isPaymentAwaitingVerification(
  status: string | null | undefined,
): boolean {
  const normalized = status?.trim().toLowerCase();
  return (
    normalized === "for payment verification" || normalized === "pending"
  );
}

export function isPaymentConfirmed(
  status: string | null | undefined,
): boolean {
  return status?.trim() === PAYMENT_STATUS_CONFIRMED;
}
