const STATUS_LABELS: Record<string, string> = {
  for_delivery_scheduled: "For Delivery: Scheduled",
  for_pullout_scheduled: "For Pullout: Scheduled",
  for_processing: "For Processing",
  authenticated_returned: "Authenticated: For renegotiation",
  authenticated_new_offer: "Authenticated: New Offer",
  authenticated_requested_for_reauthentication:
    "Authenticated: Requested for Reauthentication",
  authenticated_for_3rd_party: "Authenticated: For 3rd party authentication",
  for_contract_renewal: "For Contract Renewal",
  for_repricing: "For Repricing",
  paid_to_consignor: "Paid to Consignor",
};

/** Human-readable inquiry status for tables and detail headers. */
export function formatInquiryStatus(status: string): string {
  const key = status.trim().toLowerCase();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  const s = status.replace(/_/g, " ").trim();
  if (!s) return status;
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
