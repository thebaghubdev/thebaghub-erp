const GROUPED_NUMBER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

function formatGroupedNumber(n: number): string {
  return GROUPED_NUMBER.format(n);
}

/** Format a numeric amount as Philippine peso (e.g. `₱100,000.00`). */
export function formatPhpAmount(n: number): string {
  return `₱${formatGroupedNumber(n)}`;
}

/**
 * Grouped number for peso-prefixed inputs (e.g. `100,000.00`).
 * Returns the original text when it is not a finite amount.
 */
export function formatPhpInputDisplay(raw: string): string {
  const n = parsePhpStringToNumber(raw);
  if (n == null) return raw;
  return formatGroupedNumber(n);
}

/**
 * Parse a user-typed or API string (optional ₱, commas) to a finite number.
 */
export function parsePhpStringToNumber(raw: string): number | null {
  const s = raw
    .trim()
    .replace(/,/g, "")
    .replace(/^\u20B1\s?/, "");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Format values for display: plain numbers, optional `—` sentinel, or invalid text passthrough.
 */
export function formatPhpDisplay(raw: unknown): string {
  if (raw == null) return "—";
  const s = String(raw).trim();
  if (s === "" || s === "—") return "—";
  const n = parsePhpStringToNumber(s);
  if (n == null) return s;
  return formatPhpAmount(n);
}

function isMoneyAuditProperty(propertyName: string): boolean {
  const name = propertyName.toLowerCase();
  if (
    /status|proof|type|date|count|care of|months|created/.test(name)
  ) {
    return /price|amount|penalty|pullout fee/.test(name);
  }
  return /price|amount|penalty|fee|total|monthly payment/.test(name);
}

/**
 * Format audit-trail from/to cells so stored amounts like `100000.00` show as `₱100,000.00`.
 */
export function formatAuditTrailValue(
  propertyName: string,
  raw: string | null | undefined,
): string {
  const value = raw == null || String(raw).trim() === "" ? "—" : String(raw);
  if (value === "—" || !isMoneyAuditProperty(propertyName)) return value;
  const n = parsePhpStringToNumber(value);
  if (n == null) return value;
  return formatPhpAmount(n);
}
