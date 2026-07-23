export const ORDER_STATUS_FOR_LAYAWAY_APPROVAL = 'For Layaway Approval';
export const ORDER_STATUS_FOR_PAYMENT = 'For Payment';
export const ORDER_STATUS_PAID = 'Paid';
export const ORDER_STATUS_FOR_PICKUP = 'For pick-up';
export const ORDER_STATUS_ITEM_RECEIVED = 'Item Received';
export const ORDER_STATUS_EXPIRED = 'Expired';
export const ORDER_STATUS_DECLINED = 'Declined';
export const ORDER_STATUS_CANCELLED = 'Cancelled';
export const ORDER_STATUS_RESERVATION = 'Reservation';

/** Added to sequential order numbers so they start at 10001 (5 digits). */
export const ORDER_NUMBER_OFFSET = 10_000;

export const INVENTORY_STATUS_ON_HOLD = 'On Hold';
export const INVENTORY_STATUS_RESERVED_LAYAWAY = 'Reserved - Layaway';
export const INVENTORY_STATUS_AVAILABLE_FOR_PURCHASE = 'Available For Purchase';
export const INVENTORY_STATUS_FOR_PICKUP = 'For pick-up';
export const INVENTORY_STATUS_SOLD_UNDER_WARRANTY = 'Sold under warranty';
export const INVENTORY_STATUS_SOLD_FINAL = 'Sold final';
export const INVENTORY_STATUS_PAID_TO_CONSIGNOR = 'Paid to consignor';

/** Calendar days (date-only) an item stays under warranty after sale. */
export const SOLD_UNDER_WARRANTY_CALENDAR_DAYS = 7;

/** Local timezone used for warranty calendar-day calculations and daily cron. */
export const APP_CALENDAR_TIME_ZONE = 'Asia/Manila';

export const SHIPPING_FEE_CARE_OF_TBH = 'The Bag Hub';
export const SHIPPING_FEE_CARE_OF_CLIENT = 'Client';
export const SHIPPING_FEE_CARE_OF_OPTIONS = [
  SHIPPING_FEE_CARE_OF_TBH,
  SHIPPING_FEE_CARE_OF_CLIENT,
] as const;

export const PAYMENT_TYPE_FULL = 'full_payment';
export const PAYMENT_TYPE_LAYAWAY = 'layaway';
export const PAYMENT_TYPE_CREDIT_LINE = 'credit_line';

export const ORDER_INSTALLMENT_STATUS_UNPAID = 'Unpaid';
export const ORDER_INSTALLMENT_STATUS_PAID = 'Paid';

/** Hours after order creation before the hold expires. */
export const FULL_PAYMENT_HOLDING_HOURS = 3;
export const LAYAWAY_HOLDING_HOURS = 12;
export const RESERVATION_HOLDING_HOURS = 72;
