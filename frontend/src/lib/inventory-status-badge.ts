const DEFAULT = "text-slate-700 dark:text-slate-300";

/** Normalized labels from inventory receive / future workflows. */
const BY_STATUS: Record<string, string> = {
  "for authentication": "text-amber-800 dark:text-amber-300",
};

export function inventoryStatusBadgeClassName(status: string): string {
  const key = status.trim().toLowerCase();
  return BY_STATUS[key] ?? DEFAULT;
}
