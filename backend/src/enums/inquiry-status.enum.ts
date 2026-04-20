export enum InquiryStatus {
  PENDING = 'pending',
  FOR_OFFER_CONFIRMATION = 'for_offer_confirmation',
  FOR_DELIVERY = 'for_delivery',
  FOR_PULLOUT = 'for_pullout',
  /** Scheduled on a consignment schedule (delivery flow). */
  FOR_DELIVERY_SCHEDULED = 'for_delivery_scheduled',
  /** Scheduled on a consignment schedule (pullout flow). */
  FOR_PULLOUT_SCHEDULED = 'for_pullout_scheduled',
  /** Received at branch; inventory record created — awaiting authentication. */
  FOR_PROCESSING = 'for_processing',
  /** Authenticator returned item to coordinator (inventory also marked returned). */
  AUTHENTICATED_RETURNED = 'authenticated_returned',
  DECLINED = 'declined',
  CANCELLED = 'cancelled',
}
