export type ConsignorItemSnapshotLike = {
  form?: Record<string, unknown> | null;
} | null | undefined;

export type ConsignorEmailItem = {
  sku: string;
  brand: string;
  itemModel: string;
  category: string;
  color: string;
  condition: string;
  serialNumber: string;
};

function formField(form: Record<string, unknown>, key: string): string {
  const value = form[key];
  if (value == null) return '';
  return String(value).trim();
}

export function consignorEmailItemFromSnapshot(
  sku: string | null | undefined,
  snapshot: ConsignorItemSnapshotLike,
): ConsignorEmailItem {
  const form = (snapshot?.form ?? {}) as Record<string, unknown>;
  return {
    sku: sku?.trim() ?? '',
    brand: formField(form, 'brand'),
    itemModel: formField(form, 'itemModel'),
    category: formField(form, 'category'),
    color: formField(form, 'color'),
    condition: formField(form, 'condition'),
    serialNumber: formField(form, 'serialNumber'),
  };
}

/** One-line identity for subjects and payment lists. */
export function consignorItemShortLabel(item: ConsignorEmailItem): string {
  const name = [item.brand, item.itemModel].filter(Boolean).join(' ');
  const withColor = item.color
    ? name
      ? `${name}, ${item.color}`
      : item.color
    : name;
  if (withColor && item.sku) return `${withColor} (${item.sku})`;
  return withColor || item.sku;
}

export function consignorItemDetailRows(
  item: ConsignorEmailItem,
): Array<{ label: string; value: string }> {
  return (
    [
      ['SKU', item.sku],
      ['Brand', item.brand],
      ['Model', item.itemModel],
      ['Category', item.category],
      ['Color', item.color],
      ['Condition', item.condition],
      ['Serial number', item.serialNumber],
    ] as Array<[string, string]>
  )
    .filter(([, value]) => value !== '')
    .map(([label, value]) => ({ label, value }));
}

export function consignorItemDetailsPlain(item?: ConsignorEmailItem): string {
  if (!item) return '';
  const rows = consignorItemDetailRows(item);
  if (rows.length === 0) return '';
  return `Item details:\n${rows.map((row) => `${row.label}: ${row.value}`).join('\n')}`;
}

export function consignorItemDetailsHtml(
  item: ConsignorEmailItem | undefined,
  escapeHtml: (s: string) => string,
): string {
  if (!item) return '';
  const rows = consignorItemDetailRows(item);
  if (rows.length === 0) return '';
  const lines = rows
    .map(
      (row) =>
        `<li><strong>${escapeHtml(row.label)}:</strong> ${escapeHtml(row.value)}</li>`,
    )
    .join('');
  return `<p><strong>Item details</strong></p><ul>${lines}</ul>`;
}
