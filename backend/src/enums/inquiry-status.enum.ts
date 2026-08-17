export enum InquiryStatus {
  PENDING = 'pending',
  /** Staff requested a direct purchase offer; awaiting CEO approve/reject. */
  FOR_DIRECT_PURCHASE_APPROVAL = 'for_direct_purchase_approval',
  FOR_OFFER_CONFIRMATION = 'for_offer_confirmation',
  FOR_DELIVERY = 'for_delivery',
  FOR_PULLOUT = 'for_pullout',
  /** Scheduled on a consignment schedule (delivery flow). */
  FOR_DELIVERY_SCHEDULED = 'for_delivery_scheduled',
  /** Scheduled on a consignment schedule (pullout flow). */
  FOR_PULLOUT_SCHEDULED = 'for_pullout_scheduled',
  /** Received at branch; inventory record created — awaiting authentication. */
  FOR_PROCESSING = 'for_processing',
  /** Consignor requested early pullout while item is being processed. */
  PULLOUT_REQUESTED = 'pullout_requested',
  /** Item was pulled out and removed from inventory. */
  PULLED_OUT = 'pulled_out',
  /** Authenticator sent item back for coordinator renegotiation (inventory: Authenticated: For renegotiation). */
  AUTHENTICATED_RETURNED = 'authenticated_returned',
  /** Staff set a new offer price after authentication return; awaiting next step. */
  AUTHENTICATED_NEW_OFFER = 'authenticated_new_offer',
  /**
   * Authenticator requested paid 3rd party re-auth; consignor must pay first
   * (inventory: Authenticated: Requested for Reauthentication; item auth: Requested for Reauthentication).
   */
  AUTHENTICATED_REQUESTED_FOR_REAUTHENTICATION = 'authenticated_requested_for_reauthentication',
  /**
   * Legacy / optional later step: item is in the paid 3rd party pipeline after payment.
   * (inventory: Authenticated: For 3rd party authentication).
   */
  AUTHENTICATED_FOR_3RD_PARTY = 'authenticated_for_3rd_party',
  /** Posted item is waiting for staff/client flow to renew its consignment contract. */
  FOR_CONTRACT_RENEWAL = 'for_contract_renewal',
  /** Renewed/repriced posted item is waiting for selling price update. */
  FOR_REPRICING = 'for_repricing',
  /** Consignor payment has been sent for a sold consignment item. */
  PAID_TO_CONSIGNOR = 'paid_to_consignor',
  DECLINED = 'declined',
  CANCELLED = 'cancelled',
}
