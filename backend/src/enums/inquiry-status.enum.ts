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
  /** Authenticator sent item back for coordinator renegotiation (inventory: Authenticated: For renegotiation). */
  AUTHENTICATED_RETURNED = 'authenticated_returned',
  /** Staff set a new offer price after authentication return; awaiting next step. */
  AUTHENTICATED_NEW_OFFER = 'authenticated_new_offer',
  /**
   * Item sent for paid 3rd party authentication; coordinator/consignor notified
   * (inventory: Authenticated: For 3rd party authentication).
   */
  AUTHENTICATED_FOR_3RD_PARTY = 'authenticated_for_3rd_party',
  DECLINED = 'declined',
  CANCELLED = 'cancelled',
}
