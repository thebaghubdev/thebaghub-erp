import { formatInquiryStatus } from "./format-inquiry-status";

/** Values aligned with `InquiryStatus` in the API (snake_case). */
export const INQUIRY_STATUS_VALUES = [
  "pending",
  "for_offer_confirmation",
  "for_delivery",
  "for_pullout",
  "for_delivery_scheduled",
  "for_pullout_scheduled",
  "for_processing",
  "authenticated_returned",
  "authenticated_new_offer",
  "authenticated_for_3rd_party",
  "declined",
  "cancelled",
] as const;

export type InquiryStatusValue = (typeof INQUIRY_STATUS_VALUES)[number];

export const INQUIRY_STATUS_FILTER_OPTIONS: {
  value: InquiryStatusValue;
  label: string;
}[] = INQUIRY_STATUS_VALUES.map((value) => ({
  value,
  label: formatInquiryStatus(value),
}));
