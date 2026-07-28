export const LOGISTICS_STATUS_PENDING_DISPATCH = 'Pending dispatch';
export const LOGISTICS_STATUS_IN_TRANSIT = 'In Transit';
export const LOGISTICS_STATUS_COMPLETED = 'Completed';
export const LOGISTICS_STATUS_CANCELLED = 'Cancelled';

/** Transfer statuses that reserve items on a logistics record. */
export const LOGISTICS_OPEN_TRANSFER_STATUSES = [
  LOGISTICS_STATUS_PENDING_DISPATCH,
  LOGISTICS_STATUS_IN_TRANSIT,
] as const;

export const INVENTORY_LOGISTICS_STATUS_IN_STOCK = 'In Stock';
export const INVENTORY_LOGISTICS_STATUS_IN_TRANSIT = 'In Transit';

export const LOGISTICS_BRANCH_CODES = [
  'pasig',
  'makati',
  'authentication',
  'studio',
] as const;

export type LogisticsBranchCode = (typeof LOGISTICS_BRANCH_CODES)[number];

export const LOGISTICS_MODE_OF_TRANSFER_OPTIONS = [
  'Company Vehicle',
  'Courier',
  'Others',
] as const;

/** Inventory `status` values that cannot be added to a transfer (case-insensitive). */
export const LOGISTICS_BLOCKED_INVENTORY_STATUSES = [
  'Sold final',
  'Sold under warranty',
  'Paid to consignor',
  'Pulled-out',
] as const;

export function normalizeLogisticsBranch(branch: string): string {
  return branch.trim().toLowerCase();
}

export function isLogisticsBranchCode(
  branch: string,
): branch is LogisticsBranchCode {
  const n = normalizeLogisticsBranch(branch);
  return (LOGISTICS_BRANCH_CODES as readonly string[]).includes(n);
}

export function isBlockedInventoryStatusForLogistics(status: string): boolean {
  const s = status.trim().toLowerCase();
  return LOGISTICS_BLOCKED_INVENTORY_STATUSES.some(
    (blocked) => blocked.toLowerCase() === s,
  );
}
