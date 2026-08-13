const STATUS_CLASSES: Record<string, string> = {
  Pending:
    "rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  Assigned:
    "rounded-md bg-sky-100 px-2 py-0.5 text-xs text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
  Completed:
    "rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
};

export function walkInAuthStatusBadgeClassName(status: string): string {
  return (
    STATUS_CLASSES[status] ??
    "rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
  );
}

const RESULT_CLASSES: Record<string, string> = {
  Authentic:
    "rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  "Not authentic":
    "rounded-md bg-rose-100 px-2 py-0.5 text-xs text-rose-900 dark:bg-rose-950/50 dark:text-rose-200",
  Inconclusive:
    "rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

export function walkInAuthResultBadgeClassName(result: string): string {
  return (
    RESULT_CLASSES[result] ??
    "rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
  );
}
