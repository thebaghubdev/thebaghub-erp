export enum InquiryStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  /** Staff placed an offer; awaiting consignor confirmation. */
  FOR_OFFER_CONFIRMATION = 'for_offer_confirmation',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  DECLINED = 'declined',
  CANCELLED = 'cancelled',
}
