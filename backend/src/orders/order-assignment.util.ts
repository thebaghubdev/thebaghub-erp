import {
  ORDER_STATUS_CANCELLED,
  ORDER_STATUS_DECLINED,
  ORDER_STATUS_EXPIRED,
  ORDER_STATUS_ITEM_RECEIVED,
  ORDER_STATUS_ITEM_RECEIVED_PAID,
  ORDER_STATUS_ITEM_RECEIVED_UNPAID,
} from './order-status.constants';

const CLOSED_ORDER_STATUSES = new Set(
  [
    ORDER_STATUS_CANCELLED,
    ORDER_STATUS_DECLINED,
    ORDER_STATUS_EXPIRED,
    ORDER_STATUS_ITEM_RECEIVED,
    ORDER_STATUS_ITEM_RECEIVED_UNPAID,
    ORDER_STATUS_ITEM_RECEIVED_PAID,
  ].map((s) => s.trim().toLowerCase()),
);

export function isSalesAssociatePosition(position: string): boolean {
  return position.trim().toLowerCase() === 'sales associate';
}

export function isSalesAdminPosition(position: string): boolean {
  return position.trim().toLowerCase() === 'sales admin';
}

/** Orders that may still receive staff updates (and can be batch-assigned). */
export function isOrderOpenForStaffUpdates(status: string): boolean {
  return !CLOSED_ORDER_STATUSES.has(status.trim().toLowerCase());
}
