export function formatConsignorPaymentAuditDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function consignorPaymentStatusBadgeClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "pending") {
    return "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200";
  }
  if (normalized === "approved") {
    return "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200";
  }
  return "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200";
}

export function isConsignorPaymentPending(status: string): boolean {
  return status.trim().toLowerCase() === "pending";
}

export function isConsignorPaymentApproved(status: string): boolean {
  return status.trim().toLowerCase() === "approved";
}

export function consignorPaymentGroupStatusBadgeClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "unpaid") {
    return "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200";
  }
  if (normalized === "payment sent") {
    return "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200";
  }
  if (normalized === "unable to send") {
    return "inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:bg-red-950/60 dark:text-red-200";
  }
  return "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200";
}
