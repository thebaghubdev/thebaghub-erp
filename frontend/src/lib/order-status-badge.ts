const DEFAULT = "text-slate-700 dark:text-slate-300";

/** Keys match backend order status labels. */
const BY_STATUS: Record<string, string> = {
  "for layaway approval": "text-amber-800 dark:text-amber-300",
  "for payment": "text-violet-800 dark:text-violet-300",
  paid: "text-emerald-800 dark:text-emerald-300",
  expired: "text-zinc-600 dark:text-zinc-400",
};

export function orderStatusBadgeClassName(status: string): string {
  const key = status.trim().toLowerCase();
  return BY_STATUS[key] ?? DEFAULT;
}
