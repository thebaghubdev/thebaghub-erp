const DEFAULT = "text-slate-700 dark:text-slate-300";

/** Normalized labels from inventory receive / authentication workflows. */
const BY_STATUS: Record<string, string> = {
  "for authentication": "text-amber-800 dark:text-amber-300",
  "for photoshoot": "text-violet-800 dark:text-violet-300",
  "authenticated: returned": "text-amber-800 dark:text-amber-300",
};

export function inventoryStatusBadgeClassName(status: string): string {
  const key = status.trim().toLowerCase();
  return BY_STATUS[key] ?? DEFAULT;
}
