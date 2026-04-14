const PHP_FORMAT = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a numeric amount as Philippine peso (e.g. `₱1,234.56`). */
export function formatPhpAmount(n: number): string {
  return PHP_FORMAT.format(n);
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
