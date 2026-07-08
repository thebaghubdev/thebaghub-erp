import { parsePhpStringToNumber } from "./format-php";

export type OrderInstallmentRow = {
  installmentNumber: number;
  installmentLabel: string;
  scheduledAmount: string;
  amountDue: string;
  amountPaid: string | null;
  status: string;
  proofUrl: string | null;
  dueDate: string | null;
};

function installmentStatusBadgeClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "unpaid") {
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

/** Remaining balance: layaway price minus total amount paid. */
function computeRemainingBalance(
  installments: OrderInstallmentRow[],
  layawayPrice: string | null,
): number {
  const price = parsePhpStringToNumber(layawayPrice ?? "") ?? 0;
  const paid = installments.reduce(
    (sum, row) => sum + (parsePhpStringToNumber(row.amountPaid ?? "") ?? 0),
    0,
  );
  return Math.max(0, Math.round((price - paid) * 100) / 100);
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
  formatDueDate,
  installmentStatusBadgeClass,
  isInstallmentUnpaid,
  readApiErrorMessage,
};
