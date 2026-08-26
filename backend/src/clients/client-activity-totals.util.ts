/** Whole PHP pesos from a money string or number. Cents round to nearest peso. */
export function wholePesosFromMoney(
  raw: string | number | null | undefined,
): number {
  if (raw == null || String(raw).trim() === '') return 0;
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}
