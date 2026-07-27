const CLOSED_ORDER_STATUSES = new Set([
  "cancelled",
  "declined",
  "expired",
  "item received",
  "item received - unpaid",
  "item received - paid",
]);

/** Orders that may still receive staff updates (and can be batch-assigned). */
export function isOrderOpenForStaffUpdates(status: string): boolean {
  return !CLOSED_ORDER_STATUSES.has(status.trim().toLowerCase());
}
