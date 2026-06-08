import { parsePhpStringToNumber } from "./format-php";

export type OrderInstallmentRow = {
  installmentNumber: number;
  installmentLabel: string;
  scheduledAmount: string;
  amountDue: string;
  amountPaid: string | null;
  proofUrl: string | null;
  dueDate: string | null;
};

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

export { computeRemainingBalance, formatDueDate, readApiErrorMessage };
