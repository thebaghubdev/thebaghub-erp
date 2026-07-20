import { useCallback, useEffect, useState } from "react";
import { HorizontalScrollMirror } from "./HorizontalScrollMirror";
import { DatePickerField } from "./DatePickerField";
import { MarkInstallmentPaidDialog } from "./MarkInstallmentPaidDialog";
import { PhpPriceInput } from "./PhpPriceInput";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay, formatPhpAmount } from "../lib/format-php";
import {
  computeRemainingBalance,
  computeTotalAmountDue,
  dueDateInputValue,
  formatDueDate,
  installmentStatusBadgeClass,
  isInstallmentUnpaid,
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
  onUpdated: (update: OrderInstallmentScheduleUpdate) => void;
};

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
  onUpdated,
}: OrderInstallmentScheduleProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [markPaidInstallmentNumber, setMarkPaidInstallmentNumber] = useState<
    number | null
  >(null);
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);
  const [penaltyEditingNumber, setPenaltyEditingNumber] = useState<
    number | null
  >(null);
  const [dueDateEditingNumber, setDueDateEditingNumber] = useState<
    number | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [penaltyDrafts, setPenaltyDrafts] = useState<Record<number, string>>(
    () =>
      Object.fromEntries(
        installments.map((row) => [
          row.installmentNumber,
          row.penalty ?? "",
        ]),
      ),
  );

  useEffect(() => {
    setPenaltyDrafts(
      Object.fromEntries(
        installments.map((row) => [
          row.installmentNumber,
          row.penalty ?? "",
        ]),
      ),
    );
  }, [installments]);

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

  const savePenalty = useCallback(
    async (installmentNumber: number) => {
      if (mode !== "staff" || !token) return;
      const key = `penalty-${installmentNumber}`;
      setBusyKey(key);
      setError(null);
      try {
        const raw = penaltyDrafts[installmentNumber]?.trim() ?? "";
        const res = await apiFetch(
          `${apiBase}/installments/${installmentNumber}/penalty`,
          {
            method: "PATCH",
            body: JSON.stringify({ penalty: raw }),
          },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as OrderInstallmentScheduleUpdate;
        onUpdated(data);
        setPenaltyDrafts(
          Object.fromEntries(
            data.installments.map((row) => [
              row.installmentNumber,
              row.penalty ?? "",
            ]),
          ),
        );
        setPenaltyEditingNumber(null);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not save penalty",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [apiBase, mode, onUpdated, penaltyDrafts, token],
  );

  const startPenaltyEdit = useCallback((row: OrderInstallmentRow) => {
    setPenaltyDrafts((prev) => ({
      ...prev,
      [row.installmentNumber]: row.penalty ?? "",
    }));
    setPenaltyEditingNumber(row.installmentNumber);
  }, []);

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

  if (installments.length === 0) {
    return null;
  }

  const remainingBalance = computeRemainingBalance(installments, layawayPrice);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
        Layaway payment schedule
      </h2>
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
                <th className="px-3 py-2.5">Proof of payment</th>
                <th className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {installments.map((row) => {
                const dueDateBusy = busyKey === `due-date-${row.installmentNumber}`;
                const penaltyBusy = busyKey === `penalty-${row.installmentNumber}`;
                const proofBusy = busyKey === `proof-${row.installmentNumber}`;
                const isPaid = !isInstallmentUnpaid(row.status);
                const showMarkInstallmentPaid =
                  mode === "staff" && !readOnly && !isPaid;
                const canEditDueDate =
                  mode === "staff" && !readOnly && !isPaid;
                const isDueDateEditing =
                  canEditDueDate &&
                  dueDateEditingNumber === row.installmentNumber;
                const canEditPenalty =
                  mode === "staff" && !readOnly && !isPaid;
                const isPenaltyEditing =
                  canEditPenalty &&
                  penaltyEditingNumber === row.installmentNumber;
                const showProofUpload =
                  mode === "client" && !readOnly && !isPaid;
                const penaltyForTotal = isPenaltyEditing
                  ? penaltyDrafts[row.installmentNumber] ?? row.penalty
                  : row.penalty;
                const totalAmountDue = computeTotalAmountDue(
                  row.scheduledAmount,
                  penaltyForTotal,
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
                      {canEditPenalty ? (
                        isPenaltyEditing ? (
                          <div className="flex items-center gap-1.5">
                            <PhpPriceInput
                              id={`installment-penalty-${row.installmentNumber}`}
                              className="w-[5.5rem] rounded-lg border border-slate-200 bg-white py-1 pl-6 pr-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                              value={penaltyDrafts[row.installmentNumber] ?? ""}
                              onChange={(v) =>
                                setPenaltyDrafts((prev) => ({
                                  ...prev,
                                  [row.installmentNumber]: v,
                                }))
                              }
                              disabled={penaltyBusy}
                            />
                            <button
                              type="button"
                              disabled={penaltyBusy}
                              onClick={() => void savePenalty(row.installmentNumber)}
                              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              {penaltyBusy ? "…" : "Save"}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-start gap-1.5">
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className="tabular-nums text-slate-800 dark:text-slate-200">
                                {formatPhpDisplay(row.penalty)}
                              </span>
                              {!row.penaltyOverridden && row.penalty ? (
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  Auto-calculated
                                </span>
                              ) : row.penaltyOverridden ? (
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  Manual override
                                </span>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              aria-label="Edit penalty"
                              onClick={() => startPenaltyEdit(row)}
                              className={iconEditButtonClass}
                            >
                              <EditIcon />
                            </button>
                          </div>
                        )
                      ) : (
                        <span className="tabular-nums text-slate-800 dark:text-slate-200">
                          {formatPhpDisplay(row.penalty)}
                        </span>
                      )}
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
                          <label className="inline-flex cursor-pointer items-center">
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              className="sr-only"
                              disabled={proofBusy}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) void uploadProof(row.installmentNumber, file);
                              }}
                            />
                            <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800">
                              {proofBusy ? "Uploading…" : "Upload proof"}
                            </span>
                          </label>
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
                <td colSpan={6} />
              </tr>
            </tfoot>
          </table>
        </HorizontalScrollMirror>
      </div>
      {mode === "staff" && !readOnly ? (
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
    </div>
  );
}
