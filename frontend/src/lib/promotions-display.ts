export type PromotionLifecycleStatus =
  | "scheduled"
  | "active"
  | "ended"
  | "cancelled";

export function formatPromotionDate(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function promotionLifecycleLabel(status: PromotionLifecycleStatus): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "active":
      return "Active";
    case "ended":
      return "Ended";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function promotionLifecycleBadgeClass(
  status: PromotionLifecycleStatus,
): string {
  switch (status) {
    case "scheduled":
      return "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200";
    case "active":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
    case "ended":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    case "cancelled":
      return "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200";
    default:
      return "bg-slate-100 text-slate-700";
  }
}
