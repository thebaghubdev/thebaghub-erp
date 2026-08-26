import { useCallback, useState } from "react";
import { HorizontalScrollMirror } from "./HorizontalScrollMirror";
import { ConfirmDialog } from "./ConfirmDialog";
import { DatePickerField } from "./DatePickerField";
import { MarkInstallmentPaidDialog } from "./MarkInstallmentPaidDialog";
import { UploadInstallmentProofDialog } from "./UploadInstallmentProofDialog";
import { UseVoucherDialog } from "./UseVoucherDialog";
import { apiFetch } from "../lib/api";
import { formatPhpAmount, formatPhpDisplay, parsePhpStringToNumber } from "../lib/format-php";
import {
  computeRemainingBalance,
  computeTotalAmountDue,
  dueDateInputValue,
  formatDueDate,
  installmentStatusBadgeClass,
  isInstallmentPaid,
  isPenaltyWaivePending,
  isPenaltyWaived,
  readApiErrorMessage,
  type OrderInstallmentRow,
} from "../lib/order-installments";

type OrderInstallmentScheduleUpdate = {
  installments: OrderInstallmentRow[];
  status?: string;
};

type OrderInstallmentScheduleProps = {
  orderId: string;
  token: string | null;
  layawayPrice: string | null;
  installments: OrderInstallmentRow[];
  consignorPaymentRelease?: number | null;
  mode: "staff" | "client";
  readOnly?: boolean;
  canUseVoucher?: boolean;
  voucherAmountDue?: number;
  customerId?: string | null;
  onVoucherApplied?: (orderDetail?: unknown) => void | Promise<void>;
  onUpdated: (update: OrderInstallmentScheduleUpdate) => void;
  canRequestPenaltyWaive?: boolean;
  canDecidePenaltyWaive?: boolean;
  canVerifyPayments?: boolean;
  isAssignedToOrder?: boolean;
};

const useVoucherBtnClass =
  "inline-flex items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-900 transition-colors hover:bg-violet-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-900/80";

const iconEditButtonClass =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100";

function EditIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path
        d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OrderInstallmentSchedule({
  orderId,
  token,
  layawayPrice,
  installments,
  consignorPaymentRelease = null,
  mode,
  readOnly = false,
  canUseVoucher = false,
  voucherAmountDue = 0,
  customerId = null,
  onVoucherApplied,
  onUpdated,
  canRequestPenaltyWaive = false,
  canDecidePenaltyWaive = false,
  canVerifyPayments = false,
}: OrderInstallmentScheduleProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [useVoucherOpen, setUseVoucherOpen] = useState(false);
  const [markPaidInstallmentNumber, setMarkPaidInstallmentNumber] = useState<
    number | null
  >(null);
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);
  const [uploadProofInstallmentNumber, setUploadProofInstallmentNumber] =
    useState<number | null>(null);
  const [uploadProofError, setUploadProofError] = useState<string | null>(null);
  const [dueDateEditingNumber, setDueDateEditingNumber] = useState<
    number | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [waiveConfirmNumber, setWaiveConfirmNumber] = useState<number | null>(
    null,
  );
  const [approveConfirmNumber, setApproveConfirmNumber] = useState<
    number | null
  >(null);
  const [rejectConfirmNumber, setRejectConfirmNumber] = useState<number | null>(
    null,
  );
  const [waiveActionError, setWaiveActionError] = useState<string | null>(null);

  const apiBase =
    mode === "staff" ? `/api/orders/${orderId}` : `/api/client/orders/${orderId}`;

  const saveDueDate = useCallback(
    async (installmentNumber: number, dueDate: string) => {
      if (mode !== "staff" || !token) return;
      const trimmed = dueDate.trim();
      if (!trimmed) {
        setError("Please enter a due date.");
        return;
      }
      const key = `due-date-${installmentNumber}`;
      setBusyKey(key);
      setError(null);
      try {
        const res = await apiFetch(
          `${apiBase}/installments/${installmentNumber}/due-date`,
          {
            method: "PATCH",
            body: JSON.stringify({ dueDate: trimmed }),
          },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as OrderInstallmentScheduleUpdate;
        onUpdated(data);
        setDueDateEditingNumber(null);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not save due date",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [apiBase, mode, onUpdated, token],
  );

  const postPenaltyWaiveAction = useCallback(
    async (
      installmentNumber: number,
      action: "waive-request" | "waive-approve" | "waive-reject",
    ) => {
      if (mode !== "staff" || !token) return;
      const key = `penalty-${installmentNumber}`;
      setBusyKey(key);
      setWaiveActionError(null);
      try {
        const res = await apiFetch(
          `${apiBase}/installments/${installmentNumber}/penalty/${action}`,
          { method: "POST" },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as OrderInstallmentScheduleUpdate;
        onUpdated(data);
        setWaiveConfirmNumber(null);
        setApproveConfirmNumber(null);
        setRejectConfirmNumber(null);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Could not update penalty waive";
        setWaiveActionError(message);
      } finally {
        setBusyKey(null);
      }
    },
    [apiBase, mode, onUpdated, token],
  );

  const uploadProof = useCallback(
    async (installmentNumber: number, file: File) => {
      if (!token) return;
      const key = `proof-${installmentNumber}`;
      setBusyKey(key);
      setError(null);
      try {
        const fd = new FormData();
        fd.append("proof", file);
        const res = await apiFetch(
          `${apiBase}/installments/${installmentNumber}/proof`,
          { method: "POST", body: fd },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as OrderInstallmentScheduleUpdate;
        onUpdated(data);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not upload proof of payment",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [apiBase, onUpdated, token],
  );

  const markPaidBusy = markPaidInstallmentNumber != null && busyKey === "mark-paid";
  const markPaidInstallment =
    markPaidInstallmentNumber != null
      ? installments.find(
          (row) => row.installmentNumber === markPaidInstallmentNumber,
        ) ?? null
      : null;
  const uploadProofBusy =
    uploadProofInstallmentNumber != null && busyKey === "upload-proof";
  const uploadProofInstallment =
    uploadProofInstallmentNumber != null
      ? installments.find(
          (row) => row.installmentNumber === uploadProofInstallmentNumber,
        ) ?? null
      : null;
  const waiveConfirmRow =
    waiveConfirmNumber != null
      ? installments.find((row) => row.installmentNumber === waiveConfirmNumber) ??
        null
      : null;
  const approveConfirmRow =
    approveConfirmNumber != null
      ? installments.find((row) => row.installmentNumber === approveConfirmNumber) ??
        null
      : null;
  const rejectConfirmRow =
    rejectConfirmNumber != null
      ? installments.find((row) => row.installmentNumber === rejectConfirmNumber) ??
        null
      : null;
  const penaltyActionBusy = busyKey?.startsWith("penalty-") ?? false;

  if (installments.length === 0) {
    return null;
  }

  const remainingBalance = computeRemainingBalance(installments, layawayPrice);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Layaway payment schedule
        </h2>
        {canUseVoucher && !readOnly && token != null && voucherAmountDue > 0 ? (
          <button
            type="button"
            className={useVoucherBtnClass}
            onClick={() => setUseVoucherOpen(true)}
          >
            Use voucher
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}
      <div className="mt-4 max-w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        <HorizontalScrollMirror>
          <table className="w-max min-w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2.5">Installment</th>
                <th className="px-3 py-2.5">Due date</th>
                <th className="px-3 py-2.5">Scheduled amount</th>
                <th className="px-3 py-2.5">Penalty</th>
                <th className="px-3 py-2.5">Total amount due</th>
                <th className="px-3 py-2.5">Amount paid</th>
                <th className="px-3 py-2.5">Payment date</th>
                <th className="px-3 py-2.5">Mode of payment</th>
                <th className="px-3 py-2.5">Proof of payment</th>
                <th className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {installments.map((row) => {
                const dueDateBusy = busyKey === `due-date-${row.installmentNumber}`;
                const penaltyBusy = busyKey === `penalty-${row.installmentNumber}`;
                const proofBusy = busyKey === `proof-${row.installmentNumber}`;
                const isPaid = isInstallmentPaid(row.status);
                const waivePending = isPenaltyWaivePending(row.penaltyWaiveStatus);
                const waived = isPenaltyWaived(row.penaltyWaiveStatus);
                const penaltyAmount = parsePhpStringToNumber(row.penalty ?? "") ?? 0;
                const showMarkInstallmentPaid =
                  mode === "staff" &&
                  canVerifyPayments &&
                  !isPaid &&
                  !waivePending;
                const canEditDueDate =
                  mode === "staff" && !readOnly && !isPaid;
                const isDueDateEditing =
                  canEditDueDate &&
                  dueDateEditingNumber === row.installmentNumber;
                const showWaiveButton =
                  mode === "staff" &&
                  canRequestPenaltyWaive &&
                  !readOnly &&
                  !isPaid &&
                  !waivePending &&
                  !waived &&
                  penaltyAmount > 0;
                const showDecideButtons =
                  mode === "staff" &&
                  canDecidePenaltyWaive &&
                  !isPaid &&
                  waivePending;
                const showProofUpload =
                  !readOnly &&
                  !isPaid &&
                  (mode === "client" || mode === "staff");
                const totalAmountDue = computeTotalAmountDue(
                  row.scheduledAmount,
                  row.penalty,
                );
                return (
                  <tr key={row.installmentNumber}>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {row.installmentLabel}
                        </span>
                        {consignorPaymentRelease != null &&
                        row.installmentNumber === consignorPaymentRelease ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Consignor payment release
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                      {canEditDueDate ? (
                        isDueDateEditing ? (
                          <DatePickerField
                            id={`installment-due-date-${row.installmentNumber}`}
                            value={dueDateInputValue(row.dueDate)}
                            onChange={(dueDate) =>
                              void saveDueDate(row.installmentNumber, dueDate)
                            }
                            disabled={dueDateBusy}
                            defaultOpen
                            placeholder="Select due date"
                            dialogAriaLabel="Choose due date"
                            triggerClassName="w-[8.75rem] rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span>{formatDueDate(row.dueDate)}</span>
                            <button
                              type="button"
                              aria-label="Edit due date"
                              disabled={dueDateBusy}
                              onClick={() =>
                                setDueDateEditingNumber(row.installmentNumber)
                              }
                              className={iconEditButtonClass}
                            >
                              <EditIcon />
                            </button>
                          </div>
                        )
                      ) : (
                        formatDueDate(row.dueDate)
                      )}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-slate-800 dark:text-slate-200">
                      {formatPhpDisplay(row.scheduledAmount)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-[7.5rem] flex-col gap-1.5">
                        <span className="tabular-nums text-slate-800 dark:text-slate-200">
                          {formatPhpDisplay(row.penalty)}
                        </span>
                        {waived ? (
                          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            Waived
                          </span>
                        ) : waivePending && mode === "staff" ? (
                          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                            For approval
                          </span>
                        ) : waivePending ? null : !row.penaltyOverridden &&
                          row.penalty ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Auto-calculated
                          </span>
                        ) : row.penaltyOverridden ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Manual override
                          </span>
                        ) : null}
                        {showWaiveButton ? (
                          <button
                            type="button"
                            disabled={penaltyBusy}
                            onClick={() => {
                              setWaiveActionError(null);
                              setWaiveConfirmNumber(row.installmentNumber);
                            }}
                            className="w-fit rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Waive
                          </button>
                        ) : null}
                        {showDecideButtons ? (
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={penaltyBusy}
                              onClick={() => {
                                setWaiveActionError(null);
                                setApproveConfirmNumber(row.installmentNumber);
                              }}
                              className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={penaltyBusy}
                              onClick={() => {
                                setWaiveActionError(null);
                                setRejectConfirmNumber(row.installmentNumber);
                              }}
                              className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-slate-950 dark:text-red-200 dark:hover:bg-red-950/40"
                            >
                              Reject
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-slate-800 dark:text-slate-200">
                      {formatPhpAmount(totalAmountDue)}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-slate-800 dark:text-slate-200">
                      {formatPhpDisplay(row.amountPaid)}
                    </td>
                    <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                      {formatDueDate(row.paymentDate)}
                    </td>
                    <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                      {row.modeOfPayment?.trim() ? row.modeOfPayment : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-[8rem] flex-col gap-2">
                        {row.proofUrl ? (
                          <a
                            href={row.proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
                          >
                            View proof
                          </a>
                        ) : (
                          <span className="text-sm text-slate-500">—</span>
                        )}
                        {showProofUpload ? (
                          mode === "staff" ? (
                            <button
                              type="button"
                              disabled={uploadProofBusy}
                              onClick={() => {
                                setUploadProofError(null);
                                setUploadProofInstallmentNumber(
                                  row.installmentNumber,
                                );
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              Upload proof
                            </button>
                          ) : (
                            <label className="inline-flex cursor-pointer items-center">
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="sr-only"
                                disabled={proofBusy}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = "";
                                  if (file)
                                    void uploadProof(
                                      row.installmentNumber,
                                      file,
                                    );
                                }}
                              />
                              <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800">
                                {proofBusy ? "Uploading…" : "Upload proof"}
                              </span>
                            </label>
                          )
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={installmentStatusBadgeClass(row.status)}>
                          {row.status}
                        </span>
                        {showMarkInstallmentPaid ? (
                          <button
                            type="button"
                            disabled={markPaidBusy}
                            onClick={() => {
                              setMarkPaidError(null);
                              setMarkPaidInstallmentNumber(row.installmentNumber);
                            }}
                            className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Mark as paid
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/80">
              <tr>
                <td
                  colSpan={2}
                  className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                >
                  Remaining balance
                </td>
                <td className="px-3 py-3">
                  <span className="tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatPhpAmount(remainingBalance)}
                  </span>
                </td>
                <td colSpan={7} />
              </tr>
            </tfoot>
          </table>
        </HorizontalScrollMirror>
      </div>
      {mode === "staff" && !readOnly ? (
        <UploadInstallmentProofDialog
          open={uploadProofInstallmentNumber != null}
          orderId={orderId}
          token={token}
          installment={uploadProofInstallment}
          busy={uploadProofBusy}
          errorMessage={uploadProofError}
          onCancel={() => {
            if (!uploadProofBusy) {
              setUploadProofError(null);
              setUploadProofInstallmentNumber(null);
            }
          }}
          onUpdated={(update) => {
            onUpdated(update);
            setUploadProofInstallmentNumber(null);
            setUploadProofError(null);
          }}
          onBusyChange={(busy) =>
            setBusyKey(busy ? "upload-proof" : null)
          }
          onErrorChange={setUploadProofError}
        />
      ) : null}
      {mode === "staff" && canVerifyPayments ? (
        <MarkInstallmentPaidDialog
          open={markPaidInstallmentNumber != null}
          orderId={orderId}
          token={token}
          installment={markPaidInstallment}
          consignorPaymentRelease={consignorPaymentRelease}
          busy={markPaidBusy}
          errorMessage={markPaidError}
          onCancel={() => {
            if (!markPaidBusy) {
              setMarkPaidError(null);
              setMarkPaidInstallmentNumber(null);
            }
          }}
          onUpdated={(update) => {
            onUpdated(update);
            setMarkPaidInstallmentNumber(null);
            setMarkPaidError(null);
          }}
          onBusyChange={(busy) =>
            setBusyKey(busy ? "mark-paid" : null)
          }
          onErrorChange={setMarkPaidError}
        />
      ) : null}
      <UseVoucherDialog
        open={useVoucherOpen}
        orderId={orderId}
        token={token}
        mode={mode}
        customerId={customerId}
        amountDue={voucherAmountDue}
        onCancel={() => setUseVoucherOpen(false)}
        onApplied={async (orderDetail) => {
          setUseVoucherOpen(false);
          await onVoucherApplied?.(orderDetail);
        }}
      />
      <ConfirmDialog
        open={waiveConfirmRow != null}
        title="Waive penalty?"
        description={
          waiveConfirmRow
            ? `Request to waive the ${formatPhpAmount(parsePhpStringToNumber(waiveConfirmRow.penalty ?? "") ?? 0)} penalty for the ${waiveConfirmRow.installmentLabel} installment? The General Manager will be notified for approval.`
            : null
        }
        confirmLabel="Request waive"
        busy={penaltyActionBusy}
        errorMessage={waiveActionError}
        onCancel={() => {
          if (!penaltyActionBusy) {
            setWaiveConfirmNumber(null);
            setWaiveActionError(null);
          }
        }}
        onConfirm={() => {
          if (waiveConfirmNumber != null) {
            void postPenaltyWaiveAction(waiveConfirmNumber, "waive-request");
          }
        }}
      />
      <ConfirmDialog
        open={approveConfirmRow != null}
        title="Approve penalty waive?"
        description={
          approveConfirmRow
            ? `Approve waiving the ${formatPhpAmount(parsePhpStringToNumber(approveConfirmRow.penalty ?? "") ?? 0)} penalty for the ${approveConfirmRow.installmentLabel} installment? The assigned sales associate will be notified.`
            : null
        }
        confirmLabel="Approve"
        busy={penaltyActionBusy}
        errorMessage={waiveActionError}
        onCancel={() => {
          if (!penaltyActionBusy) {
            setApproveConfirmNumber(null);
            setWaiveActionError(null);
          }
        }}
        onConfirm={() => {
          if (approveConfirmNumber != null) {
            void postPenaltyWaiveAction(approveConfirmNumber, "waive-approve");
          }
        }}
      />
      <ConfirmDialog
        open={rejectConfirmRow != null}
        title="Reject penalty waive?"
        description={
          rejectConfirmRow
            ? `The ${formatPhpAmount(parsePhpStringToNumber(rejectConfirmRow.penalty ?? "") ?? 0)} penalty for the ${rejectConfirmRow.installmentLabel} installment will not be waived. The assigned sales associate will be notified.`
            : null
        }
        confirmLabel="Reject"
        danger
        busy={penaltyActionBusy}
        errorMessage={waiveActionError}
        onCancel={() => {
          if (!penaltyActionBusy) {
            setRejectConfirmNumber(null);
            setWaiveActionError(null);
          }
        }}
        onConfirm={() => {
          if (rejectConfirmNumber != null) {
            void postPenaltyWaiveAction(rejectConfirmNumber, "waive-reject");
          }
        }}
      />
    </div>
  );
}
