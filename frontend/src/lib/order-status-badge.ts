const DEFAULT = "text-slate-700 dark:text-slate-300";

/** Keys match backend order status labels. */
const BY_STATUS: Record<string, string> = {
  "for layaway approval": "text-amber-800 dark:text-amber-300",
  "for payment": "text-violet-800 dark:text-violet-300",
  paid: "text-emerald-800 dark:text-emerald-300",
  "out for delivery": "text-sky-800 dark:text-sky-300",
  "for pick-up": "text-sky-800 dark:text-sky-300",
  "item received": "text-emerald-800 dark:text-emerald-300",
  expired: "text-zinc-600 dark:text-zinc-400",
  declined: "text-red-800 dark:text-red-300",
  cancelled: "text-zinc-600 dark:text-zinc-400",
  reservation: "text-amber-800 dark:text-amber-300",
};

export function orderStatusBadgeClassName(status: string): string {
  const key = status.trim().toLowerCase();
  return BY_STATUS[key] ?? DEFAULT;
}

/** Display label for order status (backend may still store legacy values). */
export function orderStatusDisplayLabel(status: string): string {
  const key = status.trim().toLowerCase();
  if (key === "out for delivery" || key === "for pick-up") return "For pick-up";
  return status;
}
