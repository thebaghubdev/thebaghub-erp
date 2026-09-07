import { parsePhpStringToNumber } from "./format-php";

export type OrderPaymentRow = {
  id: string;
  amountPaid: string | null;
  modeOfPayment: string | null;
  status: string;
  proofUrl: string | null;
  proofUploadedAt: string;
  paymentDate: string | null;
  markedPaidAt: string | null;
};

export const PAYMENT_MODE_CREDIT_VOUCHER = "Credit Voucher";

export const ORDER_PAYMENT_MODE_OPTIONS = [
  "Bank transfer",
  "Cash",
  "Credit card",
  "Other",
] as const;

export type OrderPaymentMode = (typeof ORDER_PAYMENT_MODE_OPTIONS)[number];

export const BANK_TRANSFER_ACCOUNT_OPTIONS = [
  "BDO OPC",
  "BPI OPC",
  "BPI Personal",
  "BDO Personal",
] as const;

export type BankTransferAccount =
  (typeof BANK_TRANSFER_ACCOUNT_OPTIONS)[number];

export type BankTransferAccountDetails = {
  label: BankTransferAccount;
  accountName: string;
  accountNumber: string;
};

export const BANK_TRANSFER_ACCOUNT_DETAILS: readonly BankTransferAccountDetails[] =
  [
    {
      label: "BPI OPC",
      accountName: "TBH Branded Lux Trading OPC",
      accountNumber: "0221 000 366",
    },
    {
      label: "BDO OPC",
      accountName: "TBH Branded Lux Trading OPC",
      accountNumber: "0107 2800 6101",
    },
    {
      label: "BPI Personal",
      accountName: "MAIA CRISELLE URRUTIA",
      accountNumber: "8060 0016 19",
    },
    {
      label: "BDO Personal",
      accountName: "MAIA CRISELLE URRUTIA",
      accountNumber: "0107 2000 8840",
    },
  ];

const BANK_TRANSFER_MODE_PREFIX = "Bank transfer — ";

export function isBankTransferPaymentMode(mode: string): boolean {
  const trimmed = mode.trim();
  return (
    trimmed === "Bank transfer" ||
    trimmed.startsWith(BANK_TRANSFER_MODE_PREFIX)
  );
}

export function bankTransferAccountFromMode(mode: string): string {
  const trimmed = mode.trim();
  if (!trimmed.startsWith(BANK_TRANSFER_MODE_PREFIX)) return "";
  return trimmed.slice(BANK_TRANSFER_MODE_PREFIX.length);
}

export function composeOrderPaymentMode(
  mode: string,
  bankAccount?: string,
): string {
  if (mode.trim() !== "Bank transfer") return mode.trim();
  const account = bankAccount?.trim() ?? "";
  return account ? `${BANK_TRANSFER_MODE_PREFIX}${account}` : "Bank transfer";
}

export function splitOrderPaymentMode(mode: string | null | undefined): {
  modeOfPayment: string;
  bankTransferAccount: string;
} {
  const trimmed = mode?.trim() ?? "";
  if (!trimmed) {
    return {
      modeOfPayment: ORDER_PAYMENT_MODE_OPTIONS[0],
      bankTransferAccount: "",
    };
  }
  if (isBankTransferPaymentMode(trimmed)) {
    return {
      modeOfPayment: "Bank transfer",
      bankTransferAccount: bankTransferAccountFromMode(trimmed),
    };
  }
  return { modeOfPayment: trimmed, bankTransferAccount: "" };
}

export type OrderPaymentsUpdate = {
  payments: OrderPaymentRow[];
  remainingBalancePrice: string | null;
  holdingPeriod: string | null;
  orderTotalPrice?: string | null;
  fullPaymentTotalPrice?: string | null;
  status?: string;
};

function isOrderPaymentConfirmed(status: string): boolean {
  return status.trim().toLowerCase() === "confirmed";
}

function isOrderPaymentPending(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized === "pending" ||
    normalized === "for payment verification"
  );
}

export function orderPaymentStatusBadgeClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "for payment verification"
  ) {
    return "inline-flex w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200";
  }
  if (normalized === "confirmed") {
    return "inline-flex w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200";
  }
  return "inline-flex w-fit rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200";
}

export function isOrderPaymentPendingStatus(status: string): boolean {
  return isOrderPaymentPending(status);
}

export function isOrderPaymentConfirmedStatus(status: string): boolean {
  return isOrderPaymentConfirmed(status);
}

function formatPaymentDate(raw: string | null): string {
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

function paymentDateInputValue(raw: string | null): string {
  if (raw == null || raw.trim() === "") return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return m?.[1] ?? "";
}

export function computeConfirmedPaymentsTotal(
  payments: OrderPaymentRow[],
): number {
  return payments.reduce((sum, row) => {
    if (!isOrderPaymentConfirmed(row.status)) return sum;
    return sum + (parsePhpStringToNumber(row.amountPaid ?? "") ?? 0);
  }, 0);
}

export { formatPaymentDate, paymentDateInputValue };
export { readApiErrorMessage } from "./order-installments";
