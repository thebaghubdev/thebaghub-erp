import { useCallback } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay } from "../lib/format-php";
import {
  formatPaymentDate,
  paymentDateInputValue,
  readApiErrorMessage,
  type OrderPaymentRow,
  type OrderPaymentsUpdate,
} from "../lib/order-payments";

type MarkOrderPaymentDialogProps = {
  open: boolean;
  orderId: string;
  token: string | null;
  payment: OrderPaymentRow | null;
  busy: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onUpdated: (update: OrderPaymentsUpdate) => void;
  onBusyChange: (busy: boolean) => void;
  onErrorChange: (message: string | null) => void;
};

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
  const paymentDate = paymentDateInputValue(payment?.paymentDate ?? null);
  const amountPaid = payment?.amountPaid?.trim() ?? "";
  const modeOfPayment = payment?.modeOfPayment?.trim() ?? "";
  const canConfirm =
    amountPaid !== "" && paymentDate !== "" && modeOfPayment !== "";

  const submitConfirm = useCallback(async () => {
    if (!token || busy || !payment || !canConfirm) return;
    onBusyChange(true);
    onErrorChange(null);
    try {
      const res = await apiFetch(
        `/api/orders/${orderId}/payments/${payment.id}/mark-paid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountPaid,
            paymentDate,
            modeOfPayment,
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
    canConfirm,
    modeOfPayment,
    onBusyChange,
    onCancel,
    onErrorChange,
    onUpdated,
    orderId,
    payment,
    paymentDate,
    token,
  ]);

  if (!open || !payment) return null;

  return (
    <ConfirmDialog
      open
      title="Verify payment?"
      description={
        canConfirm ? (
          <>
            Confirm this payment of{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {formatPhpDisplay(amountPaid)}
            </span>{" "}
            via {modeOfPayment} on {formatPaymentDate(paymentDate)}?
          </>
        ) : (
          "This payment is missing a paid amount, payment date, or mode of payment. Ask the client or sales associate to re-upload proof of payment with those details."
        )
      }
      confirmLabel="Verify payment"
      busy={busy}
      confirmDisabled={!canConfirm}
      errorMessage={errorMessage}
      onCancel={() => {
        if (!busy) onCancel();
      }}
      onConfirm={submitConfirm}
    />
  );
}
