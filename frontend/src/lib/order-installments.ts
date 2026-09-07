import { parsePhpStringToNumber } from "./format-php";

export type OrderInstallmentRow = {
  installmentNumber: number;
  installmentLabel: string;
  scheduledAmount: string;
  amountDue: string;
  amountPaid: string | null;
  penalty: string | null;
  penaltyOverridden: boolean;
  penaltyWaiveStatus?: string | null;
  status: string;
  proofUrl: string | null;
  dueDate: string | null;
  paymentDate: string | null;
  modeOfPayment: string | null;
};

function installmentStatusBadgeClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (
    normalized === "unpaid" ||
    normalized === "for payment verification"
  ) {
    return "inline-flex w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200";
  }
  if (normalized === "paid") {
    return "inline-flex w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200";
  }
  return "inline-flex w-fit rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200";
}

function isInstallmentUnpaid(status: string): boolean {
  return status.trim().toLowerCase() === "unpaid";
}

function isInstallmentPaid(status: string): boolean {
  return status.trim().toLowerCase() === "paid";
}

function isInstallmentAwaitingVerification(status: string): boolean {
  return status.trim().toLowerCase() === "for payment verification";
}

function isPenaltyWaivePending(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "pending";
}

function isPenaltyWaived(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "approved";
}

/** Remaining balance: layaway price minus paid plus unpaid penalties. */
function computeRemainingBalance(
  installments: OrderInstallmentRow[],
  layawayPrice: string | null,
): number {
  const price = parsePhpStringToNumber(layawayPrice ?? "") ?? 0;
  const paid = installments.reduce((sum, row) => {
    if (isInstallmentAwaitingVerification(row.status)) return sum;
    return sum + (parsePhpStringToNumber(row.amountPaid ?? "") ?? 0);
  }, 0);
  const unpaidPenalties = installments.reduce((sum, row) => {
    if (isInstallmentPaid(row.status)) return sum;
    return sum + (parsePhpStringToNumber(row.penalty ?? "") ?? 0);
  }, 0);
  return Math.max(
    0,
    Math.round((price - paid + unpaidPenalties) * 100) / 100,
  );
}

function formatDueDate(raw: string | null): string {
  if (raw == null || raw.trim() === "") return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
}

function dueDateInputValue(raw: string | null): string {
  if (raw == null || raw.trim() === "") return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return m?.[1] ?? "";
}

/** Scheduled amount plus penalty for display. */
function computeTotalAmountDue(
  scheduledAmount: string,
  penalty: string | null | undefined,
): number {
  const scheduled = parsePhpStringToNumber(scheduledAmount) ?? 0;
  const penaltyAmount = parsePhpStringToNumber(penalty ?? "") ?? 0;
  return Math.round((scheduled + penaltyAmount) * 100) / 100;
}

async function readApiErrorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(j.message)) return j.message.join("; ");
    if (typeof j.message === "string") return j.message;
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export {
  computeRemainingBalance,
  computeTotalAmountDue,
  dueDateInputValue,
  formatDueDate,
  installmentStatusBadgeClass,
  isInstallmentAwaitingVerification,
  isInstallmentPaid,
  isInstallmentUnpaid,
  isPenaltyWaivePending,
  isPenaltyWaived,
  readApiErrorMessage,
};
