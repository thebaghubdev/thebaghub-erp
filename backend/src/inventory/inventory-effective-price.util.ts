import type { InventoryItem } from './entities/inventory-item.entity';

export function parseInventoryUnitPrice(
  raw: string | null | undefined,
): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) && n > 0 ? n : null;
}

type PriceFields = Pick<
  InventoryItem,
  'tbhSellingPrice' | 'onPromo' | 'promoPrice'
>;

export function effectiveInventoryUnitPrice(item: PriceFields): number | null {
  if (item.onPromo) {
    const promo = parseInventoryUnitPrice(item.promoPrice);
    if (promo != null) return promo;
  }
  return parseInventoryUnitPrice(item.tbhSellingPrice);
}

export function effectiveInventoryPriceString(
  item: PriceFields,
): string | null {
  const n = effectiveInventoryUnitPrice(item);
  return n != null ? n.toFixed(2) : null;
}
