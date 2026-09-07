import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { DatePickerField } from "./DatePickerField";
import { HorizontalScrollMirror } from "./HorizontalScrollMirror";
import { MarkOrderPaymentDialog } from "./MarkOrderPaymentDialog";
import { PhpPriceInput } from "./PhpPriceInput";
import { SubmittedAtCell } from "./SubmittedAtCell";
import { UploadOrderPaymentDialog } from "./UploadOrderPaymentDialog";
import { UseVoucherDialog } from "./UseVoucherDialog";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay } from "../lib/format-php";
import {
  formatPaymentDate,
  isOrderPaymentConfirmedStatus,
  isOrderPaymentPendingStatus,
  orderPaymentStatusBadgeClass,
  paymentDateInputValue,
  readApiErrorMessage,
  type OrderPaymentRow,
  type OrderPaymentsUpdate,
} from "../lib/order-payments";

type OrderPaymentsSectionProps = {
  orderId: string;
  token: string | null;
  payments: OrderPaymentRow[];
  remainingBalancePrice: string | null;
  orderTotalPrice: string | null;
  mode: "staff" | "client";
  readOnly?: boolean;
  allowMarkOrderPaid?: boolean;
  canVerifyPayments?: boolean;
  canUseVoucher?: boolean;
  voucherAmountDue?: number;
  customerId?: string | null;
  onVoucherApplied?: (orderDetail?: unknown) => void | Promise<void>;
  sectionTitle?: string;
  onUpdated: (update: OrderPaymentsUpdate) => void;
};

const uploadBtnClass =
  "inline-flex items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-900 transition-colors hover:bg-violet-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-900/80";

const markOrderPaidBtnClass =
  "inline-flex items-center justify-center rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500";

const iconEditButtonClass =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100";

const priceInputClass =
  "w-[5.5rem] rounded-lg border border-slate-200 bg-white py-1 pl-6 pr-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const datePickerTriggerClass =
  "w-[8.75rem] rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

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

function applyPaymentsUpdate(
  data: OrderPaymentsUpdate & {
    payments: OrderPaymentRow[];
    remainingBalancePrice: string | null;
    holdingPeriod: string | null;
    orderTotalPrice?: string | null;
    fullPaymentTotalPrice?: string | null;
    status?: string;
  },
): OrderPaymentsUpdate {
  return {
    payments: data.payments,
    remainingBalancePrice: data.remainingBalancePrice,
    holdingPeriod: data.holdingPeriod,
    orderTotalPrice: data.orderTotalPrice,
    fullPaymentTotalPrice: data.fullPaymentTotalPrice,
    ...(data.status != null ? { status: data.status } : {}),
  };
}

export function OrderPaymentsSection({
  orderId,
  token,
  payments,
  remainingBalancePrice,
  orderTotalPrice,
  mode,
  readOnly = false,
  allowMarkOrderPaid = false,
  canVerifyPayments = false,
  canUseVoucher = false,
  voucherAmountDue = 0,
  customerId = null,
  onVoucherApplied,
  sectionTitle = "Payments",
  onUpdated,
}: OrderPaymentsSectionProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markPaymentId, setMarkPaymentId] = useState<string | null>(null);
  const [markPaymentBusy, setMarkPaymentBusy] = useState(false);
  const [markPaymentError, setMarkPaymentError] = useState<string | null>(
    null,
  );
  const [amountEditingId, setAmountEditingId] = useState<string | null>(null);
  const [paymentDateEditingId, setPaymentDateEditingId] = useState<
    string | null
  >(null);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      payments.map((row) => [row.id, row.amountPaid ?? ""]),
    ),
  );
  const [markOrderPaidConfirmOpen, setMarkOrderPaidConfirmOpen] =
    useState(false);
  const [markOrderPaidBusy, setMarkOrderPaidBusy] = useState(false);
  const [markOrderPaidError, setMarkOrderPaidError] = useState<string | null>(
    null,
  );
  const [orderTotalEditing, setOrderTotalEditing] = useState(false);
  const [orderTotalDraft, setOrderTotalDraft] = useState(
    orderTotalPrice ?? "",
  );
  const [useVoucherOpen, setUseVoucherOpen] = useState(false);

  useEffect(() => {
    setOrderTotalDraft(orderTotalPrice ?? "");
  }, [orderTotalPrice]);

  useEffect(() => {
    setAmountDrafts(
      Object.fromEntries(
        payments.map((row) => [row.id, row.amountPaid ?? ""]),
      ),
    );
  }, [payments]);

  const canUpload = !readOnly && token != null;
  const canEditPayments = mode === "staff" && !readOnly && token != null;
  const canEditOrderTotal = canEditPayments;

  const saveOrderTotal = useCallback(async () => {
    if (!canEditOrderTotal || !token) return;
    setBusyKey("order-total");
    setError(null);
    try {
      const res = await apiFetch(
        `/api/orders/${orderId}/order-total-price`,
        {
          method: "PATCH",
          body: JSON.stringify({
            orderTotalPrice: orderTotalDraft.trim(),
          }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderPaymentsUpdate & {
        payments: OrderPaymentRow[];
        remainingBalancePrice: string | null;
        holdingPeriod: string | null;
        orderTotalPrice: string | null;
        fullPaymentTotalPrice: string | null;
      };
      onUpdated(applyPaymentsUpdate(data));
      setOrderTotalEditing(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save order total price",
      );
    } finally {
      setBusyKey(null);
    }
  }, [
    canEditOrderTotal,
    onUpdated,
    orderId,
    orderTotalDraft,
    token,
  ]);

  const saveAmountPaid = useCallback(
    async (paymentId: string) => {
      if (!canEditPayments || !token) return;
      const key = `amount-${paymentId}`;
      setBusyKey(key);
      setError(null);
      try {
        const res = await apiFetch(
          `/api/orders/${orderId}/payments/${paymentId}/amount-paid`,
          {
            method: "PATCH",
            body: JSON.stringify({
              amountPaid: amountDrafts[paymentId]?.trim() ?? "",
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
        onUpdated(applyPaymentsUpdate(data));
        setAmountEditingId(null);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not save paid amount",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [amountDrafts, canEditPayments, onUpdated, orderId, token],
  );

  const savePaymentDate = useCallback(
    async (paymentId: string, paymentDate: string) => {
      if (!canEditPayments || !token) return;
      const trimmed = paymentDate.trim();
      if (!trimmed) {
        setError("Please enter a payment date.");
        return;
      }
      const key = `payment-date-${paymentId}`;
      setBusyKey(key);
      setError(null);
      try {
        const res = await apiFetch(
          `/api/orders/${orderId}/payments/${paymentId}/payment-date`,
          {
            method: "PATCH",
            body: JSON.stringify({ paymentDate: trimmed }),
          },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as OrderPaymentsUpdate & {
          payments: OrderPaymentRow[];
          remainingBalancePrice: string | null;
          holdingPeriod: string | null;
        };
        onUpdated(applyPaymentsUpdate(data));
        setPaymentDateEditingId(null);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not save payment date",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [canEditPayments, onUpdated, orderId, token],
  );

  const startAmountEdit = useCallback((row: OrderPaymentRow) => {
    setAmountDrafts((prev) => ({
      ...prev,
      [row.id]: row.amountPaid ?? "",
    }));
    setAmountEditingId(row.id);
  }, []);

  const confirmMarkOrderPaid = useCallback(async () => {
    if (!token || mode !== "staff") return;
    setMarkOrderPaidBusy(true);
    setMarkOrderPaidError(null);
    try {
      const res = await apiFetch(
        `/api/orders/${orderId}/mark-paid`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderPaymentsUpdate & {
        status: string;
        payments: OrderPaymentRow[];
        remainingBalancePrice: string | null;
        holdingPeriod: string | null;
      };
      onUpdated(applyPaymentsUpdate(data));
      setMarkOrderPaidConfirmOpen(false);
    } catch (e) {
      setMarkOrderPaidError(
        e instanceof Error ? e.message : "Could not mark order as paid",
      );
    } finally {
      setMarkOrderPaidBusy(false);
    }
  }, [mode, onUpdated, orderId, token]);

  const markPaymentRow =
    markPaymentId != null
      ? (payments.find((row) => row.id === markPaymentId) ?? null)
      : null;

  const markPaidBusy = markPaymentId != null && markPaymentBusy;
  const orderTotalBusy = busyKey === "order-total";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            {sectionTitle}
          </h3>
          {orderTotalPrice != null || canEditOrderTotal ? (
            <div className="mt-1">
              {canEditOrderTotal && orderTotalEditing ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Order total:
                  </span>
                  <PhpPriceInput
                    id={`order-total-price-${orderId}`}
                    className={priceInputClass}
                    value={orderTotalDraft}
                    onChange={setOrderTotalDraft}
                    disabled={orderTotalBusy}
                  />
                  <button
                    type="button"
                    disabled={orderTotalBusy}
                    onClick={() => void saveOrderTotal()}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {orderTotalBusy ? "…" : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={orderTotalBusy}
                    onClick={() => {
                      setOrderTotalDraft(orderTotalPrice ?? "");
                      setOrderTotalEditing(false);
                    }}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Order total:{" "}
                    <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatPhpDisplay(orderTotalPrice)}
                    </span>
                  </p>
                  {canEditOrderTotal ? (
                    <button
                      type="button"
                      aria-label="Edit order total price"
                      disabled={orderTotalBusy}
                      onClick={() => {
                        setOrderTotalDraft(orderTotalPrice ?? "");
                        setOrderTotalEditing(true);
                      }}
                      className={iconEditButtonClass}
                    >
                      <EditIcon />
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
        {canUpload || (canUseVoucher && !readOnly && token != null) ? (
          <div className="flex flex-wrap gap-2">
            {canUseVoucher && !readOnly && token != null && voucherAmountDue > 0 ? (
              <button
                type="button"
                className={uploadBtnClass}
                onClick={() => setUseVoucherOpen(true)}
              >
                Use voucher
              </button>
            ) : null}
            {canUpload ? (
              <button
                type="button"
                className={uploadBtnClass}
                disabled={uploadBusy}
                onClick={() => {
                  setUploadError(null);
                  setUploadDialogOpen(true);
                }}
              >
                Upload proof of payment
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {mode === "client" ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
          After you upload proof of payment, our staff will review and validate
          it first. Your payment will show as For payment verification until it
          is confirmed.
        </p>
      ) : null}

      {error || uploadError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {error ?? uploadError}
        </p>
      ) : null}

      {payments.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No payment proofs uploaded yet.
        </p>
      ) : (
        <div className="max-w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <HorizontalScrollMirror>
            <table className="w-max min-w-full border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2.5">Uploaded</th>
                  <th className="px-3 py-2.5">Paid amount</th>
                  <th className="px-3 py-2.5">Payment date</th>
                  <th className="px-3 py-2.5">Mode of payment</th>
                  <th className="px-3 py-2.5">Proof of payment</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {payments.map((row) => {
                  const amountBusy = busyKey === `amount-${row.id}`;
                  const paymentDateBusy =
                    busyKey === `payment-date-${row.id}`;
                  const isConfirmed = isOrderPaymentConfirmedStatus(row.status);
                  const isPending = isOrderPaymentPendingStatus(row.status);
                  const canEditAmount =
                    canEditPayments && isConfirmed;
                  const canEditPaymentDate =
                    canEditPayments && isConfirmed;
                  const isAmountEditing = amountEditingId === row.id;
                  const isPaymentDateEditing =
                    paymentDateEditingId === row.id;
                  const showMarkPaymentPaid =
                    mode === "staff" &&
                    canVerifyPayments &&
                    token != null &&
                    isPending;
                  const showClientProofUpload =
                    mode === "client" &&
                    !readOnly &&
                    isPending &&
                    row.proofUrl == null;

                  return (
                    <tr key={row.id}>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                        <SubmittedAtCell iso={row.proofUploadedAt} />
                      </td>
                      <td className="px-3 py-3">
                        {canEditAmount ? (
                          isAmountEditing ? (
                            <div className="flex items-center gap-1.5">
                              <PhpPriceInput
                                id={`order-payment-amount-${row.id}`}
                                className={priceInputClass}
                                value={amountDrafts[row.id] ?? ""}
                                onChange={(v) =>
                                  setAmountDrafts((prev) => ({
                                    ...prev,
                                    [row.id]: v,
                                  }))
                                }
                                disabled={amountBusy}
                              />
                              <button
                                type="button"
                                disabled={amountBusy}
                                onClick={() => void saveAmountPaid(row.id)}
                                className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                {amountBusy ? "…" : "Save"}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="tabular-nums text-slate-800 dark:text-slate-200">
                                {formatPhpDisplay(row.amountPaid)}
                              </span>
                              <button
                                type="button"
                                aria-label="Edit paid amount"
                                disabled={amountBusy}
                                onClick={() => startAmountEdit(row)}
                                className={iconEditButtonClass}
                              >
                                <EditIcon />
                              </button>
                            </div>
                          )
                        ) : (
                          <span className="tabular-nums text-slate-800 dark:text-slate-200">
                            {formatPhpDisplay(row.amountPaid)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                        {canEditPaymentDate ? (
                          isPaymentDateEditing ? (
                            <DatePickerField
                              id={`order-payment-date-${row.id}`}
                              value={paymentDateInputValue(row.paymentDate)}
                              onChange={(paymentDate) =>
                                void savePaymentDate(row.id, paymentDate)
                              }
                              disabled={paymentDateBusy}
                              defaultOpen
                              placeholder="Select payment date"
                              dialogAriaLabel="Choose payment date"
                              triggerClassName={datePickerTriggerClass}
                            />
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span>{formatPaymentDate(row.paymentDate)}</span>
                              <button
                                type="button"
                                aria-label="Edit payment date"
                                disabled={paymentDateBusy}
                                onClick={() =>
                                  setPaymentDateEditingId(row.id)
                                }
                                className={iconEditButtonClass}
                              >
                                <EditIcon />
                              </button>
                            </div>
                          )
                        ) : (
                          formatPaymentDate(row.paymentDate)
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                        {row.modeOfPayment ?? "—"}
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
                            <span className="text-sm text-slate-500 dark:text-slate-400">
                              —
                            </span>
                          )}
                          {showClientProofUpload ? (
                            <button
                              type="button"
                              disabled={uploadBusy}
                              onClick={() => {
                                setUploadError(null);
                                setUploadDialogOpen(true);
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              Upload proof
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={orderPaymentStatusBadgeClass(row.status)}
                          >
                            {row.status}
                          </span>
                          {showMarkPaymentPaid ? (
                            <button
                              type="button"
                              disabled={markPaidBusy}
                              onClick={() => {
                                setMarkPaymentError(null);
                                setMarkPaymentId(row.id);
                              }}
                              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              Verify payment
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
                    colSpan={1}
                    className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                  >
                    Remaining balance
                  </td>
                  <td className="px-3 py-3">
                    <span className="tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatPhpDisplay(remainingBalancePrice)}
                    </span>
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </HorizontalScrollMirror>
        </div>
      )}

      {allowMarkOrderPaid ? (
        <div className="flex flex-wrap justify-end">
          <button
            type="button"
            className={markOrderPaidBtnClass}
            disabled={markOrderPaidBusy}
            onClick={() => {
              setMarkOrderPaidError(null);
              setMarkOrderPaidConfirmOpen(true);
            }}
          >
            Mark order as paid
          </button>
        </div>
      ) : null}

      <MarkOrderPaymentDialog
        open={markPaymentId != null}
        orderId={orderId}
        token={token}
        payment={markPaymentRow}
        busy={markPaymentBusy}
        errorMessage={markPaymentError}
        onCancel={() => {
          if (!markPaymentBusy) setMarkPaymentId(null);
        }}
        onUpdated={(update) => {
          onUpdated(update);
          setMarkPaymentId(null);
        }}
        onBusyChange={setMarkPaymentBusy}
        onErrorChange={setMarkPaymentError}
      />

      <UploadOrderPaymentDialog
        open={uploadDialogOpen}
        orderId={orderId}
        token={token}
        mode={mode}
        remainingBalancePrice={remainingBalancePrice}
        busy={uploadBusy}
        errorMessage={uploadError}
        onCancel={() => {
          if (!uploadBusy) setUploadDialogOpen(false);
        }}
        onUpdated={(update) => {
          onUpdated(update);
          setUploadDialogOpen(false);
        }}
        onBusyChange={setUploadBusy}
        onErrorChange={setUploadError}
      />

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
        open={markOrderPaidConfirmOpen}
        title="Mark order as paid?"
        description="This order will be marked as paid. Make sure all confirmed payments have been reviewed."
        confirmLabel="Mark as paid"
        busy={markOrderPaidBusy}
        errorMessage={markOrderPaidError}
        onCancel={() => {
          if (!markOrderPaidBusy) setMarkOrderPaidConfirmOpen(false);
        }}
        onConfirm={confirmMarkOrderPaid}
      />
    </div>
  );
}
