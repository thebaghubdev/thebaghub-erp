export const ORDER_STATUS_FOR_LAYAWAY_APPROVAL = 'For Layaway Approval';
export const ORDER_STATUS_FOR_PAYMENT = 'For Payment';
export const ORDER_STATUS_PAID = 'Paid';
export const ORDER_STATUS_EXPIRED = 'Expired';
export const ORDER_STATUS_DECLINED = 'Declined';
export const ORDER_STATUS_CANCELLED = 'Cancelled';

/** Added to sequential order numbers so they start at 10001 (5 digits). */
export const ORDER_NUMBER_OFFSET = 10_000;

export const INVENTORY_STATUS_ON_HOLD = 'On Hold';
export const INVENTORY_STATUS_AVAILABLE_FOR_PURCHASE = 'Available For Purchase';

export const PAYMENT_TYPE_FULL = 'full_payment';
export const PAYMENT_TYPE_LAYAWAY = 'layaway';

/** Hours after order creation before the hold expires. */
export const FULL_PAYMENT_HOLDING_HOURS = 3;
export const LAYAWAY_HOLDING_HOURS = 12;
