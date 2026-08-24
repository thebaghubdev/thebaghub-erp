import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ConfirmDialog } from "./ConfirmDialog";
import { DatePickerField } from "./DatePickerField";
import { PhpPriceInput } from "./PhpPriceInput";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay, parsePhpStringToNumber } from "../lib/format-php";
import {
  BANK_TRANSFER_ACCOUNT_OPTIONS,
  ORDER_PAYMENT_MODE_OPTIONS,
  composeOrderPaymentMode,
  isBankTransferPaymentMode,
  readApiErrorMessage,
  splitOrderPaymentMode,
  type OrderPaymentRow,
  type OrderPaymentsUpdate,
} from "../lib/order-payments";

type MarkOrderPaymentDialogProps = {
  open: boolean;
  orderId: string;
  token: string | null;
  payment: OrderPaymentRow | null;
  remainingBalancePrice: string | null;
  busy: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onUpdated: (update: OrderPaymentsUpdate) => void;
  onBusyChange: (busy: boolean) => void;
  onErrorChange: (message: string | null) => void;
};

const formPriceInputClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const formDatePickerClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

function todayYmd(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function MarkOrderPaymentDialog({
  open,
  orderId,
  token,
  payment,
  busy,
  errorMessage,
  onCancel,
  onUpdated,
  onBusyChange,
  onErrorChange,
}: MarkOrderPaymentDialogProps) {
  const titleId = useId();
  const descId = useId();
  const [phase, setPhase] = useState<"form" | "confirm">("form");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<string>(
    ORDER_PAYMENT_MODE_OPTIONS[0],
  );
  const [bankTransferAccount, setBankTransferAccount] = useState("");

  useEffect(() => {
    if (!open) {
      setPhase("form");
      return;
    }
    if (!payment) return;
    const split = splitOrderPaymentMode(payment.modeOfPayment);
    setPaymentDate(todayYmd());
    setAmountPaid("");
    setModeOfPayment(split.modeOfPayment);
    setBankTransferAccount(split.bankTransferAccount);
    setPhase("form");
    onErrorChange(null);
  }, [onErrorChange, open, payment]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel, open]);

  const persistedModeOfPayment = composeOrderPaymentMode(
    modeOfPayment,
    bankTransferAccount,
  );

  const submitConfirm = useCallback(async () => {
    if (!token || busy || !payment) return;
    onBusyChange(true);
    onErrorChange(null);
    try {
      const res = await apiFetch(
        `/api/orders/${orderId}/payments/${payment.id}/mark-paid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountPaid: amountPaid.trim(),
            paymentDate: paymentDate.trim(),
            modeOfPayment: persistedModeOfPayment,
          }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderPaymentsUpdate & {
        payments: OrderPaymentRow[];
        remainingBalancePrice: string | null;
        holdingPeriod: string | null;
      };
      onUpdated({
        payments: data.payments,
        remainingBalancePrice: data.remainingBalancePrice,
        holdingPeriod: data.holdingPeriod,
      });
      onCancel();
    } catch (e) {
      onErrorChange(
        e instanceof Error ? e.message : "Could not confirm payment",
      );
    } finally {
      onBusyChange(false);
    }
  }, [
    amountPaid,
    busy,
    persistedModeOfPayment,
    onBusyChange,
    onCancel,
    onErrorChange,
    onUpdated,
    orderId,
    payment,
    paymentDate,
    token,
  ]);

  if (!open || !payment || typeof document === "undefined") return null;

  const canSaveForm =
    amountPaid.trim() !== "" &&
    paymentDate.trim() !== "" &&
    modeOfPayment.trim() !== "" &&
    (!isBankTransferPaymentMode(modeOfPayment) ||
      bankTransferAccount.trim() !== "") &&
    parsePhpStringToNumber(amountPaid) != null;

  if (phase === "confirm") {
    return (
      <ConfirmDialog
        open
        title="Confirm payment?"
        description={
          <>
            Mark this payment as confirmed for{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {formatPhpDisplay(amountPaid)}
            </span>{" "}
            via {persistedModeOfPayment} on {paymentDate}?
          </>
        }
        confirmLabel="Confirm payment"
        busy={busy}
        errorMessage={errorMessage}
        onCancel={() => {
          if (!busy) setPhase("form");
        }}
        onConfirm={submitConfirm}
      />
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Dismiss"
        disabled={busy}
        onClick={() => !busy && onCancel()}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2
          id={titleId}
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          Mark payment as paid
        </h2>
        <p
          id={descId}
          className="mt-2 text-sm text-slate-600 dark:text-slate-400"
        >
          Enter the payment details after reviewing the uploaded proof.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="mark-order-payment-amount"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Paid amount
            </label>
            <PhpPriceInput
              id="mark-order-payment-amount"
              className={formPriceInputClass}
              value={amountPaid}
              disabled={busy}
              onChange={setAmountPaid}
            />
          </div>
          <div>
            <label
              htmlFor="mark-order-payment-date"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Payment date
            </label>
            <DatePickerField
              id="mark-order-payment-date"
              value={paymentDate}
              disabled={busy}
              onChange={setPaymentDate}
              placeholder="Select payment date"
              dialogAriaLabel="Choose payment date"
              triggerClassName={formDatePickerClass}
            />
          </div>
          <div>
            <label
              htmlFor="mark-order-payment-mode"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Mode of payment
            </label>
            <select
              id="mark-order-payment-mode"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              value={modeOfPayment}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value;
                setModeOfPayment(next);
                if (!isBankTransferPaymentMode(next)) {
                  setBankTransferAccount("");
                }
              }}
            >
              {ORDER_PAYMENT_MODE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {isBankTransferPaymentMode(modeOfPayment) ? (
              <div className="mt-3">
                <label
                  htmlFor="mark-order-payment-bank"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Bank account
                </label>
                <select
                  id="mark-order-payment-bank"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  value={bankTransferAccount}
                  disabled={busy}
                  onChange={(e) => setBankTransferAccount(e.target.value)}
                >
                  <option value="">Select bank account</option>
                  {BANK_TRANSFER_ACCOUNT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </div>

        {errorMessage ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !canSaveForm}
            onClick={() => {
              onErrorChange(null);
              setPhase("confirm");
            }}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
