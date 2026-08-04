export function voucherStatusLabel(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "active") return "Active";
  if (normalized === "forfeited") return "Forfeited";
  if (normalized === "redeemed") return "Redeemed";
  return status;
}

export function voucherStatusBadgeClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "active") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200";
  }
  if (normalized === "forfeited") {
    return "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
  }
  if (normalized === "redeemed") {
    return "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200";
  }
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

export function formatVoucherDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
