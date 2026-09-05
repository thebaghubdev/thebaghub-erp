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
  /**
   * Authenticator sent the item back to the assigned coordinator
   * (renegotiation, 3rd-party request, or both). Consignor is not notified yet.
   */
  AUTHENTICATED_RETURNED_TO_COORDINATOR = 'authenticated_returned_to_coordinator',
  /**
   * Coordinator returned the inquiry to the consignor after reviewing
   * authentication results. Consignor is emailed.
   */
  AUTHENTICATED_RETURNED_TO_CONSIGNOR = 'authenticated_returned_to_consignor',
  /** Consignor uploaded 3rd-party fee proof; awaiting payment verification staff. */
  FOR_AUTHENTICATION_PAYMENT_VERIFICATION = 'for_authentication_payment_verification',
  /** Fee verified; authenticator records 3rd-party authentication results. */
  FOR_3RD_PARTY_AUTHENTICATION = 'for_3rd_party_authentication',
  /** Posted item is waiting for staff/client flow to renew its consignment contract. */
  FOR_CONTRACT_RENEWAL = 'for_contract_renewal',
  /** Renewed/repriced posted item is waiting for selling price update. */
  FOR_REPRICING = 'for_repricing',
  /** Consignor payment has been sent for a sold consignment item. */
  PAID_TO_CONSIGNOR = 'paid_to_consignor',
  DECLINED = 'declined',
  CANCELLED = 'cancelled',
}
