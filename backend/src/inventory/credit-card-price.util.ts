/** TBH selling price + 4% (credit card checkout price). */
export function computeCreditCardPriceFromTbh(
  tbhSellingPrice: string | null | undefined,
): string | null {
  if (tbhSellingPrice == null || String(tbhSellingPrice).trim() === '') {
    return null;
  }
  const n = Number(String(tbhSellingPrice).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return (n * 1.04).toFixed(2);
}
