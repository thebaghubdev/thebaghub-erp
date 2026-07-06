const DEFAULT = "text-slate-700 dark:text-slate-300";

/** Normalized labels from inventory receive / authentication workflows. */
const BY_STATUS: Record<string, string> = {
  "for authentication": "text-amber-800 dark:text-amber-300",
  "for photoshoot": "text-violet-800 dark:text-violet-300",
  "for pricing": "text-emerald-800 dark:text-emerald-300",
  "for repricing": "text-orange-800 dark:text-orange-300",
  "for editing": "text-teal-800 dark:text-teal-300",
  "for posting": "text-fuchsia-800 dark:text-fuchsia-300",
  "available for purchase": "text-green-800 dark:text-green-300",
  "reserved - layaway": "text-blue-800 dark:text-blue-300",
  "out for delivery": "text-sky-800 dark:text-sky-300",
  "sold under warranty": "text-emerald-800 dark:text-emerald-300",
  "sold final": "text-zinc-700 dark:text-zinc-300",
  "for contract renewal": "text-cyan-800 dark:text-cyan-300",
  "authenticated: requested for reauthentication": "text-sky-800 dark:text-sky-300",
  "authenticated: for 3rd party authentication":
    "text-indigo-800 dark:text-indigo-300",
  "authenticated: returned": "text-amber-800 dark:text-amber-300",
  "authenticated: for renegotiation": "text-amber-800 dark:text-amber-300",
  "authenticated: rejected": "text-red-800 dark:text-red-300",
};

export function inventoryStatusBadgeClassName(status: string): string {
  const key = status.trim().toLowerCase();
  return BY_STATUS[key] ?? DEFAULT;
}
