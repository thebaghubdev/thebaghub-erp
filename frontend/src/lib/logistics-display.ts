import { branchLabel } from "./consignment-schedule-labels";

/** Inventory statuses excluded from logistics item selection (case-insensitive). */
export const LOGISTICS_BLOCKED_INVENTORY_STATUSES = [
  "Sold final",
  "Sold under warranty",
  "Paid to consignor",
  "Pulled-out",
] as const;

export const LOGISTICS_MODE_OPTIONS = [
  "Company Vehicle",
  "Courier",
  "Others",
] as const;

export const LOGISTICS_TRANSFER_STATUS = {
  pendingDispatch: "Pending dispatch",
  inTransit: "In Transit",
  completed: "Completed",
  cancelled: "Cancelled",
} as const;

export function logisticsStatusBadgeClass(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "pending dispatch") {
    return "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200";
  }
  if (s === "in transit" || s.startsWith("in transit ")) {
    return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
  }
  if (s === "completed") {
    return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
  }
  if (s === "cancelled") {
    return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
  return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200";
}

export function formatLogisticsTransferDate(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
}

export function isInventoryEligibleForLogistics(row: {
  status: string;
  logisticsStatus: string;
}): boolean {
  const statusNorm = row.status.trim().toLowerCase();
  if (
    LOGISTICS_BLOCKED_INVENTORY_STATUSES.some(
      (b) => b.toLowerCase() === statusNorm,
    )
  ) {
    return false;
  }
  const logistics = row.logisticsStatus.trim().toLowerCase();
  return logistics !== "in transit" && !logistics.startsWith("in transit ");
}

/** Inventory-only display: append destination while an item is in transit. */
export function formatInventoryLogisticsStatus(
  status: string,
  destination?: string | null,
): string {
  const raw = status?.trim() || "In Stock";
  if (raw.toLowerCase() === "in transit" && destination?.trim()) {
    return `In Transit to ${branchLabel(destination)}`;
  }
  return raw;
}
