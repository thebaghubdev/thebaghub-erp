const STATUS_LABELS: Record<string, string> = {
  for_direct_purchase_approval: "For Direct Purchase Approval",
  for_delivery_scheduled: "For Delivery: Scheduled",
  for_pullout_scheduled: "For Pullout: Scheduled",
  for_processing: "For Processing",
  pullout_requested: "Pullout Requested",
  pulled_out: "Pulled-out",
  authenticated_returned_to_coordinator:
    "Authenticated - Returned to Coordinator",
  authenticated_returned_to_consignor: "Authenticated - Returned to Consignor",
  for_authentication_payment_verification:
    "For authentication payment verification",
  for_3rd_party_authentication: "For 3rd party authentication",
  /** Legacy values kept for any unmigrated rows. */
  authenticated_returned: "Authenticated - Returned to Coordinator",
  authenticated_new_offer: "Authenticated - Returned to Consignor",
  authenticated_requested_for_reauthentication:
    "For authentication payment verification",
  authenticated_for_3rd_party: "For 3rd party authentication",
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
