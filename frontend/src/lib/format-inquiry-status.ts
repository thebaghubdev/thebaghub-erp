const STATUS_LABELS: Record<string, string> = {
  for_delivery_scheduled: "For Delivery: Scheduled",
  for_pullout_scheduled: "For Pullout: Scheduled",
  for_processing: "For Processing",
  authenticated_returned: "Authenticated: Returned",
  authenticated_new_offer: "Authenticated: New Offer",
};

/** Human-readable inquiry status for tables and detail headers. */
export function formatInquiryStatus(status: string): string {
  const key = status.trim().toLowerCase();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  const s = status.replace(/_/g, " ").trim();
  if (!s) return status;
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
