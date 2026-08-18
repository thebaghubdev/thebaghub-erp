import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "./ConfirmDialog";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay, parsePhpStringToNumber } from "../lib/format-php";
import {
  computeTotalAmountDue,
  isPenaltyWaivePending,
  readApiErrorMessage,
  type OrderInstallmentRow,
} from "../lib/order-installments";
import { computeVoucherApplicationAmounts } from "../lib/order-voucher-payment";
import {
  formatVoucherDate,
  voucherStatusBadgeClass,
  voucherStatusLabel,
} from "../lib/vouchers-display";

type VoucherPickerRow = {
  id: string;
  amount: string;
  expirationDate: string;
  status: string;
};

type UseVoucherDialogProps = {
  open: boolean;
  orderId: string;
  token: string | null;
  mode: "staff" | "client";
  customerId?: string | null;
  amountDue: number;
  onCancel: () => void;
  onApplied: (orderDetail?: unknown) => void | Promise<void>;
};

function isEligibleVoucher(row: VoucherPickerRow, todayYmd: string): boolean {
  if (row.status.trim().toLowerCase() !== "active") return false;
  return row.expirationDate.slice(0, 10) >= todayYmd;
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function computeInstallmentVoucherAmountDue(
  installments: OrderInstallmentRow[],
): number {
  const next = installments.find(
    (row) => row.status.trim().toLowerCase() === "unpaid",
  );
  if (!next) return 0;
  if (isPenaltyWaivePending(next.penaltyWaiveStatus)) return 0;
  return computeTotalAmountDue(next.amountDue, next.penalty);
}

export function UseVoucherDialog({
  open,
  orderId,
  token,
  mode,
  customerId,
  amountDue,
  onCancel,
  onApplied,
}: UseVoucherDialogProps) {
  const titleId = useId();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vouchers, setVouchers] = useState<VoucherPickerRow[]>([]);
  const [selected, setSelected] = useState<VoucherPickerRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const today = todayYmd();

  const loadVouchers = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    setLoading(true);
    try {
      const url =
        mode === "staff" && customerId
          ? `/api/vouchers/by-client/${customerId}`
          : "/api/client/vouchers";
      const res = await apiFetch(url, {}, token);
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as VoucherPickerRow[];
      setVouchers(data);
    } catch (e) {
      setVouchers([]);
      setLoadError(
        e instanceof Error ? e.message : "Failed to load vouchers",
      );
    } finally {
      setLoading(false);
    }
  }, [customerId, mode, token]);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setConfirmOpen(false);
      setApplyError(null);
      return;
    }
    void loadVouchers();
  }, [open, loadVouchers]);

  const eligibleVouchers = useMemo(
    () => vouchers.filter((row) => isEligibleVoucher(row, today)),
    [today, vouchers],
  );

  const confirmAmounts = useMemo(() => {
    if (!selected) return null;
    const voucherAmount = parsePhpStringToNumber(selected.amount) ?? 0;
    return computeVoucherApplicationAmounts(voucherAmount, amountDue);
  }, [amountDue, selected]);

  const handleConfirm = useCallback(async () => {
    if (!token || !selected) return;
    setApplyBusy(true);
    setApplyError(null);
    try {
      const apiBase =
        mode === "staff"
          ? `/api/orders/${orderId}/apply-voucher`
          : `/api/client/orders/${orderId}/apply-voucher`;
      const res = await apiFetch(
        apiBase,
        {
          method: "POST",
          body: JSON.stringify({ voucherId: selected.id }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = await res.json();
      setConfirmOpen(false);
      setSelected(null);
      await onApplied(data);
    } catch (e) {
      setApplyError(
        e instanceof Error ? e.message : "Failed to apply voucher",
      );
    } finally {
      setApplyBusy(false);
    }
  }, [mode, onApplied, orderId, selected, token]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      {!confirmOpen ? (
      <div
        className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center"
        role="presentation"
      >
        <button
          type="button"
          className="absolute inset-0 bg-slate-900/50"
          aria-label="Dismiss"
          disabled={applyBusy}
          onClick={() => !applyBusy && onCancel()}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <h2
              id={titleId}
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Use voucher
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Amount due: {formatPhpDisplay(amountDue)}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loadError ? (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              >
                {loadError}
              </p>
            ) : loading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Loading vouchers…
              </p>
            ) : eligibleVouchers.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No active vouchers available.
              </p>
            ) : (
              <ul className="space-y-2">
                {eligibleVouchers.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-violet-300 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-violet-700 dark:hover:bg-violet-950/40"
                      onClick={() => {
                        setApplyError(null);
                        setSelected(row);
                        setConfirmOpen(true);
                      }}
                    >
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {formatPhpDisplay(row.amount)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          Expires {formatVoucherDate(row.expirationDate)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${voucherStatusBadgeClass(row.status)}`}
                      >
                        {voucherStatusLabel(row.status)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-700">
            <button
              type="button"
              disabled={applyBusy}
              onClick={onCancel}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen && selected != null}
        overlayClassName="z-[130]"
        title="Apply credit voucher?"
        description={
          selected && confirmAmounts ? (
            <span>
              This voucher is {formatPhpDisplay(selected.amount)}.{" "}
              {formatPhpDisplay(confirmAmounts.appliedAmount)} will be applied to
              this order.
              {confirmAmounts.forfeitedAmount > 0 ? (
                <>
                  {" "}
                  The remaining{" "}
                  {formatPhpDisplay(confirmAmounts.forfeitedAmount)} will be
                  forfeited and cannot be used later.
                </>
              ) : null}
            </span>
          ) : (
            ""
          )
        }
        confirmLabel="Apply voucher"
        busy={applyBusy}
        errorMessage={applyError}
        onCancel={() => {
          if (applyBusy) return;
          setConfirmOpen(false);
          setSelected(null);
          setApplyError(null);
        }}
        onConfirm={handleConfirm}
      />
    </>,
    document.body,
  );
}
