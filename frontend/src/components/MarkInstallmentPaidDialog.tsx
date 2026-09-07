import { useCallback } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay } from "../lib/format-php";
import {
  dueDateInputValue,
  formatDueDate,
  readApiErrorMessage,
  type OrderInstallmentRow,
} from "../lib/order-installments";

type OrderInstallmentScheduleUpdate = {
  installments: OrderInstallmentRow[];
  status?: string;
};

type MarkInstallmentPaidDialogProps = {
  open: boolean;
  orderId: string;
  token: string | null;
  installment: OrderInstallmentRow | null;
  consignorPaymentRelease: number | null;
  busy: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onUpdated: (update: OrderInstallmentScheduleUpdate) => void;
  onBusyChange: (busy: boolean) => void;
  onErrorChange: (message: string | null) => void;
};

export function MarkInstallmentPaidDialog({
  open,
  orderId,
  token,
  installment,
  consignorPaymentRelease,
  busy,
  errorMessage,
  onCancel,
  onUpdated,
  onBusyChange,
  onErrorChange,
}: MarkInstallmentPaidDialogProps) {
  const paymentDate = dueDateInputValue(installment?.paymentDate ?? null);
  const amountPaid = installment?.amountPaid?.trim() ?? "";
  const modeOfPayment = installment?.modeOfPayment?.trim() ?? "";
  const canConfirm =
    amountPaid !== "" && paymentDate !== "" && modeOfPayment !== "";
  const isConsignorRelease =
    consignorPaymentRelease != null &&
    installment != null &&
    installment.installmentNumber === consignorPaymentRelease;

  const submitConfirm = useCallback(async () => {
    if (!token || busy || !installment || !canConfirm) return;
    onBusyChange(true);
    onErrorChange(null);
    try {
      const fd = new FormData();
      fd.append("amountPaid", amountPaid);
      fd.append("paymentDate", paymentDate);
      fd.append("modeOfPayment", modeOfPayment);
      const res = await apiFetch(
        `/api/orders/${orderId}/installments/${installment.installmentNumber}/mark-paid`,
        { method: "POST", body: fd },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderInstallmentScheduleUpdate;
      onUpdated(data);
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
    installment,
    modeOfPayment,
    onBusyChange,
    onCancel,
    onErrorChange,
    onUpdated,
    orderId,
    paymentDate,
    token,
  ]);

  if (!open || !installment) return null;

  return (
    <ConfirmDialog
      open
      title="Verify payment?"
      description={
        canConfirm ? (
          <>
            Confirm {installment.installmentLabel.toLowerCase()} payment of{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {formatPhpDisplay(amountPaid)}
            </span>{" "}
            via {modeOfPayment} on {formatDueDate(paymentDate)}
            {isConsignorRelease
              ? "? This will also add the item to the consignor payments report."
              : "?"}
          </>
        ) : (
          "This installment is missing a paid amount, payment date, or mode of payment. Ask the client or sales associate to re-upload proof of payment with those details."
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
