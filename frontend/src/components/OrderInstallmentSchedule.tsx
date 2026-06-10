import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { HorizontalScrollMirror } from "./HorizontalScrollMirror";
import { PhpPriceInput } from "./PhpPriceInput";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay, formatPhpAmount } from "../lib/format-php";
import {
  computeRemainingBalance,
  formatDueDate,
  readApiErrorMessage,
  type OrderInstallmentRow,
} from "../lib/order-installments";

type OrderInstallmentScheduleProps = {
  orderId: string;
  token: string | null;
  layawayPrice: string | null;
  installments: OrderInstallmentRow[];
  mode: "staff" | "client";
  readOnly?: boolean;
  onUpdated: (installments: OrderInstallmentRow[]) => void;
  onMarkPaid?: (detail: { status: string; installments: OrderInstallmentRow[] }) => void;
};

export function OrderInstallmentSchedule({
  orderId,
  token,
  layawayPrice,
  installments,
  mode,
  readOnly = false,
  onUpdated,
  onMarkPaid,
}: OrderInstallmentScheduleProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [markPaidConfirmOpen, setMarkPaidConfirmOpen] = useState(false);
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amountDrafts, setAmountDrafts] = useState<Record<number, string>>(
    () =>
      Object.fromEntries(
        installments.map((row) => [
          row.installmentNumber,
          row.amountPaid ?? "",
        ]),
      ),
  );

  useEffect(() => {
    setAmountDrafts(
      Object.fromEntries(
        installments.map((row) => [
          row.installmentNumber,
          row.amountPaid ?? "",
        ]),
      ),
    );
  }, [installments]);

  const apiBase =
    mode === "staff" ? `/api/orders/${orderId}` : `/api/client/orders/${orderId}`;

  const saveAmountPaid = useCallback(
    async (installmentNumber: number) => {
      if (mode !== "staff" || !token) return;
      const key = `amount-${installmentNumber}`;
      setBusyKey(key);
      setError(null);
      try {
        const raw = amountDrafts[installmentNumber]?.trim() ?? "";
        const res = await apiFetch(
          `${apiBase}/installments/${installmentNumber}/amount-paid`,
          {
            method: "PATCH",
            body: JSON.stringify({ amountPaid: raw === "" ? "0" : raw }),
          },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as { installments: OrderInstallmentRow[] };
        onUpdated(data.installments);
        setAmountDrafts(
          Object.fromEntries(
            data.installments.map((row) => [
              row.installmentNumber,
              row.amountPaid ?? "",
            ]),
          ),
        );
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not save amount paid",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [amountDrafts, apiBase, mode, onUpdated, token],
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
        const data = (await res.json()) as { installments: OrderInstallmentRow[] };
        onUpdated(data.installments);
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

  const markPaidBusy = busyKey === "mark-paid";

  const confirmMarkPaid = useCallback(async () => {
    if (mode !== "staff" || !token || !onMarkPaid) return;
    setBusyKey("mark-paid");
    setMarkPaidError(null);
    try {
      const res = await apiFetch(
        `/api/orders/${orderId}/mark-paid`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as {
        status: string;
        installments: OrderInstallmentRow[];
      };
      onMarkPaid(data);
      setMarkPaidConfirmOpen(false);
    } catch (e) {
      setMarkPaidError(
        e instanceof Error ? e.message : "Could not mark order as paid",
      );
    } finally {
      setBusyKey(null);
    }
  }, [mode, onMarkPaid, orderId, token]);

  if (installments.length === 0) {
    return null;
  }

  const remainingBalance = computeRemainingBalance(installments, layawayPrice);
  const canMarkPaid = remainingBalance === 0;

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
                <th className="px-3 py-2.5">Amount paid</th>
                <th className="px-3 py-2.5">Proof of payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {installments.map((row) => {
                const amountBusy = busyKey === `amount-${row.installmentNumber}`;
                const proofBusy = busyKey === `proof-${row.installmentNumber}`;
                return (
                  <tr key={row.installmentNumber}>
                    <td className="px-3 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {row.installmentLabel}
                    </td>
                    <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                      {formatDueDate(row.dueDate)}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-slate-800 dark:text-slate-200">
                      {formatPhpDisplay(row.scheduledAmount)}
                    </td>
                    <td className="px-3 py-3">
                      {mode === "staff" && !readOnly ? (
                        <div className="flex min-w-[10rem] flex-col gap-2">
                          <PhpPriceInput
                            id={`installment-amount-${row.installmentNumber}`}
                            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                            value={amountDrafts[row.installmentNumber] ?? ""}
                            onChange={(v) =>
                              setAmountDrafts((prev) => ({
                                ...prev,
                                [row.installmentNumber]: v,
                              }))
                            }
                            disabled={amountBusy}
                          />
                          <button
                            type="button"
                            disabled={amountBusy}
                            onClick={() =>
                              void saveAmountPaid(row.installmentNumber)
                            }
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            {amountBusy ? "Saving…" : "Save"}
                          </button>
                        </div>
                      ) : (
                        <span className="tabular-nums text-slate-800 dark:text-slate-200">
                          {formatPhpDisplay(row.amountPaid)}
                        </span>
                      )}
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
                        {!readOnly ? (
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
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatPhpAmount(remainingBalance)}
                    </span>
                    {mode === "staff" && onMarkPaid && !readOnly ? (
                      <button
                        type="button"
                        disabled={!canMarkPaid || markPaidBusy}
                        onClick={() => {
                          setMarkPaidError(null);
                          setMarkPaidConfirmOpen(true);
                        }}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                      >
                        Mark as paid
                      </button>
                    ) : null}
                  </div>
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </HorizontalScrollMirror>
      </div>
      {mode === "staff" && onMarkPaid && !readOnly ? (
        <ConfirmDialog
          open={markPaidConfirmOpen}
          title="Mark layaway as paid?"
          description="This order will be marked as paid. Make sure all installment payments have been recorded."
          confirmLabel="Mark as paid"
          busy={markPaidBusy}
          errorMessage={markPaidError}
          onCancel={() => {
            if (!markPaidBusy) setMarkPaidConfirmOpen(false);
          }}
          onConfirm={confirmMarkPaid}
        />
      ) : null}
    </div>
  );
}
