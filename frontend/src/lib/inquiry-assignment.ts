const CLOSED_INQUIRY_STATUSES = new Set(
  ["declined", "cancelled", "pulled_out", "paid_to_consignor"],
);

/** Inquiries that may still receive staff updates (and can be batch-assigned). */
export function isInquiryOpenForStaffUpdates(status: string): boolean {
  return !CLOSED_INQUIRY_STATUSES.has(status.trim().toLowerCase());
}
