export function parsePhpAmount(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number.parseFloat(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function formatPromoPrice(amount: number): string {
  return amount.toFixed(2);
}

export function promoPriceFromPercentOff(
  sellingPrice: number,
  percent: number,
): number {
  return Number((sellingPrice * (1 - percent / 100)).toFixed(2));
}

export function promoPriceFromValueOff(
  sellingPrice: number,
  amountOff: number,
): number {
  return Number((sellingPrice - amountOff).toFixed(2));
}

export function validatePromoPriceAgainstSelling(
  sellingPrice: number,
  promoPrice: number,
): string | null {
  if (promoPrice <= 0) return "Promo price must be greater than zero";
  if (promoPrice >= sellingPrice) {
    return "Promo price must be less than the selling price";
  }
  return null;
}

export function computePromoFromBulkDiscount(
  discountType: "percent" | "value",
  amount: number,
  sellingPrice: number,
): { promoPrice: number } | { error: string } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Discount amount must be greater than zero" };
  }
  if (discountType === "percent") {
    if (amount > 100) return { error: "Percent discount cannot exceed 100" };
    const promoPrice = promoPriceFromPercentOff(sellingPrice, amount);
    const err = validatePromoPriceAgainstSelling(sellingPrice, promoPrice);
    return err ? { error: err } : { promoPrice };
  }
  if (amount >= sellingPrice) {
    return { error: "Value discount must be less than the selling price" };
  }
  const promoPrice = promoPriceFromValueOff(sellingPrice, amount);
  const err = validatePromoPriceAgainstSelling(sellingPrice, promoPrice);
  return err ? { error: err } : { promoPrice };
}
