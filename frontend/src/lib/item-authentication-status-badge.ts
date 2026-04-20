const DEFAULT = "text-slate-700 dark:text-slate-300";

/** Keys match `item_authentication.authentication_status` (normalized). */
const BY_STATUS: Record<string, string> = {
  pending: "text-amber-800 dark:text-amber-300",
  approved: "text-emerald-800 dark:text-emerald-300",
  returned: "text-amber-800 dark:text-amber-300",
};

export function itemAuthenticationStatusBadgeClassName(status: string): string {
  const key = status.trim().toLowerCase();
  return BY_STATUS[key] ?? DEFAULT;
}
