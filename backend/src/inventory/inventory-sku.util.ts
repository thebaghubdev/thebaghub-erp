/** UTC calendar day bounds for `d`. */
export function utcDayRange(d: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  return { start, end };
}

/** Distinct from inquiry lock keys — serializes inventory SKU allocation per UTC day. */
export function utcInventoryDayLockKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `inv-${y}-${m}-${day}`;
}

/**
 * Inventory SKU: same date + sequence shape as inquiries, without the INQ- prefix.
 * Example: 2026-0414-01
 */
export function formatInventorySku(ref: Date, sequence: number): string {
  const y = ref.getUTCFullYear();
  const mm = String(ref.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ref.getUTCDate()).padStart(2, '0');
  const mmdd = `${mm}${dd}`;
  const seq =
    sequence < 100
      ? String(sequence).padStart(2, '0')
      : String(sequence);
  return `${y}-${mmdd}-${seq}`;
}
