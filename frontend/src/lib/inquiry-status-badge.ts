/**
 * Text color classes for inquiry status (staff + client).
 * Keys match backend `InquiryStatus` enum values.
 */
const DEFAULT = "text-slate-700 dark:text-slate-300";

const BY_STATUS: Record<string, string> = {
  pending: "text-amber-800 dark:text-amber-300",
  for_offer_confirmation: "text-violet-800 dark:text-violet-300",
  for_delivery: "text-sky-800 dark:text-sky-300",
  for_pullout: "text-cyan-800 dark:text-cyan-300",
  for_delivery_scheduled: "text-indigo-800 dark:text-indigo-300",
  for_pullout_scheduled: "text-indigo-800 dark:text-indigo-300",
  for_processing: "text-orange-800 dark:text-orange-300",
  authenticated_returned: "text-amber-800 dark:text-amber-300",
  authenticated_new_offer: "text-teal-800 dark:text-teal-300",
  authenticated_for_3rd_party: "text-sky-800 dark:text-sky-300",
  declined: "text-red-800 dark:text-red-300",
  cancelled: "text-zinc-600 dark:text-zinc-400",
};

export function inquiryStatusBadgeClassName(status: string): string {
  const key = status.trim().toLowerCase();
  return BY_STATUS[key] ?? DEFAULT;
}
