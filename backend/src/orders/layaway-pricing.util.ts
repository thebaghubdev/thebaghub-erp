export const LAYAWAY_PRICE_THRESHOLD = 100_000;
export const MIN_LAYAWAY_MONTHS = 2;
export const MAX_LAYAWAY_MONTHS = 6;

/** Monthly layaway rate as a decimal (e.g. 0.02 = 2%). */
export function layawayMonthlyRate(itemPrice: number): number {
  return itemPrice >= LAYAWAY_PRICE_THRESHOLD ? 0.01 : 0.02;
}

export function calculateLayawayPricing(
  itemPrice: number,
  months: number,
): { layawayPrice: number; monthlyPayment: number } | null {
  if (!Number.isFinite(itemPrice) || itemPrice <= 0) return null;
  if (
    !Number.isInteger(months) ||
    months < MIN_LAYAWAY_MONTHS ||
    months > MAX_LAYAWAY_MONTHS
  ) {
    return null;
  }

  const monthlyRate = layawayMonthlyRate(itemPrice);
  const layawayPrice = itemPrice * (1 + monthlyRate * months);
  const monthlyPayment = layawayPrice / months;

  return { layawayPrice, monthlyPayment };
}
