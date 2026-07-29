const PRICE_SCALE = 2;

export function parsePromotionMoney(
  raw: string | number | null | undefined,
): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

export function formatPromotionMoney(value: number): string {
  return value.toFixed(PRICE_SCALE);
}

export function compareDateOnly(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function promoPriceFromPercentOff(
  sellingPrice: number,
  percent: number,
): number {
  const factor = 1 - percent / 100;
  const raw = sellingPrice * factor;
  return Number(raw.toFixed(PRICE_SCALE));
}

export function promoPriceFromValueOff(
  sellingPrice: number,
  amountOff: number,
): number {
  const raw = sellingPrice - amountOff;
  return Number(raw.toFixed(PRICE_SCALE));
}

export function assertValidPromoPriceAgainstSelling(
  sellingPrice: number,
  promoPrice: number,
): void {
  if (promoPrice <= 0) {
    throw new Error('Promo price must be greater than zero');
  }
  if (promoPrice >= sellingPrice) {
    throw new Error('Promo price must be less than the selling price');
  }
}

export function assertValidBulkDiscountInput(
  discountType: 'percent' | 'value',
  amount: number,
  sellingPrice: number,
): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Discount amount must be greater than zero');
  }
  if (discountType === 'percent') {
    if (amount > 100) {
      throw new Error('Percent discount cannot exceed 100');
    }
    const promo = promoPriceFromPercentOff(sellingPrice, amount);
    assertValidPromoPriceAgainstSelling(sellingPrice, promo);
    return promo;
  }
  if (amount >= sellingPrice) {
    throw new Error('Value discount must be less than the selling price');
  }
  const promo = promoPriceFromValueOff(sellingPrice, amount);
  assertValidPromoPriceAgainstSelling(sellingPrice, promo);
  return promo;
}
