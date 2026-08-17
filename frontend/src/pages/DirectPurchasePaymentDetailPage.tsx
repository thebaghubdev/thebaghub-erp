import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ConsignorPaymentCheckModal } from "../components/ConsignorPaymentCheckModal";
import { ConsignorPaymentDepositSlipModal } from "../components/ConsignorPaymentDepositSlipModal";
import { ConsignorPaymentUnableToSendModal } from "../components/ConsignorPaymentUnableToSendModal";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { useFeatureAccess } from "../lib/use-feature-access";
import { consignorPaymentGroupStatusBadgeClass } from "../lib/consignor-payments-display";
import { branchLabel } from "../lib/consignment-schedule-labels";
import {
  formatClientBank,
  formatClientPaymentMethod,
} from "../lib/client-payment-preference";
import {
  formatPhpAmount,
  formatPhpDisplay,
  parsePhpStringToNumber,
} from "../lib/format-php";

type DirectPurchasePaymentItemRow = {
  id: string;
  inquiryId: string;
  inquirySku: string;
  itemLabel: string;
  offerPrice: string | null;
  inventoryItemId: string | null;
  inventorySku: string | null;
  orderId: string | null;
  orderNumber: number | null;
};

type DirectPurchasePaymentDetail = {
  id: string;
  clientId: string;
  consignorName: string;
  consignorEmail: string;
  preferredPaymentMethod:
    | "check_pickup"
    | "cash_pickup"
    | "direct_deposit"
    | null;
  preferredPaymentBranch: "pasig" | "makati" | null;
  bankCode: "bdo" | "bpi" | "other" | null;
  status: string;
  checkNumber: string | null;
  checkPhotos: { key: string; url: string }[];
  depositSlipPhotos: { key: string; url: string }[];
  createdAt: string;
  items: DirectPurchasePaymentItemRow[];
};

const cardClass =
  "rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";

const groupActionBtnClass =
  "inline-flex shrink-0 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

const GROUP_STATUS_PAYMENT_SENT = "Payment sent";

const itemListTableClass =
  "w-full table-fixed border-collapse text-left text-sm";

const itemListHeaderCellClass =
  "pb-1.5 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 last:pr-0";

const itemListBodyCellClass =
  "py-1.5 pr-3 align-top text-slate-800 dark:text-slate-200 last:pr-0";

const itemListSkuCellClass =
  "font-mono text-xs text-slate-900 dark:text-slate-100";

async function readApiErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join("; ");
    if (typeof body.message === "string") return body.message;
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

function groupOfferTotal(items: DirectPurchasePaymentItemRow[]): number {
  return items.reduce((sum, item) => {
    const amount =
      item.offerPrice != null
        ? parsePhpStringToNumber(String(item.offerPrice))
        : null;
    return sum + (amount ?? 0);
  }, 0);
}

function paymentPreferenceInline(group: DirectPurchasePaymentDetail): string {
  const method = formatClientPaymentMethod(group.preferredPaymentMethod);
  if (group.preferredPaymentMethod === "direct_deposit") {
    if (group.bankCode === "bdo" || group.bankCode === "bpi") {
      return `${method} · ${formatClientBank(group.bankCode)}`;
    }
    return method;
  }
  if (
    group.preferredPaymentMethod === "check_pickup" ||
    group.preferredPaymentMethod === "cash_pickup"
  ) {
    return `${method} · ${branchLabel(group.preferredPaymentBranch ?? "pasig")}`;
  }
  return method;
}

function HeaderActions({
  payment,
  token,
  disabled,
  onDetailUpdated,
  onError,
}: {
  payment: DirectPurchasePaymentDetail;
  token: string | null;
  disabled: boolean;
  onDetailUpdated: (detail: DirectPurchasePaymentDetail) => void;
  onError: (message: string | null) => void;
}) {
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [checkModalOpen, setCheckModalOpen] = useState(false);
  const [depositSlipModalOpen, setDepositSlipModalOpen] = useState(false);
  const [paymentSentConfirmOpen, setPaymentSentConfirmOpen] = useState(false);
  const [unableToSendModalOpen, setUnableToSendModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const endpointBase = `/api/direct-purchase-payments/${payment.id}`;

  useEffect(() => {
    if (!actionsOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = actionsMenuRef.current;
      if (el && !el.contains(e.target as Node)) setActionsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionsOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [actionsOpen]);

  const stopSummaryToggle = (e: ReactMouseEvent | ReactKeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const updateStatus = async (status: string) => {
    if (!token || busy || disabled) return;
    onError(null);
    setBusy(true);
    try {
      const res = await apiFetch(
        `${endpointBase}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as DirectPurchasePaymentDetail;
      onDetailUpdated(data);
      setActionsOpen(false);
      setPaymentSentConfirmOpen(false);
    } catch (e) {
      onError(
        e instanceof Error ? e.message : "Could not update payment status",
      );
    } finally {
      setBusy(false);
    }
  };

  const isDirectDeposit = payment.preferredPaymentMethod === "direct_deposit";
  const actionDisabled = disabled || busy || !token;

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2"
        onClick={stopSummaryToggle}
        onKeyDown={stopSummaryToggle}
      >
        <button
          type="button"
          className={groupActionBtnClass}
          disabled={actionDisabled}
          onClick={(e) => {
            stopSummaryToggle(e);
            setCheckModalOpen(true);
          }}
        >
          View check
        </button>
        <button
          type="button"
          className={groupActionBtnClass}
          disabled={actionDisabled || !isDirectDeposit}
          title={
            isDirectDeposit ? undefined : "Available for direct deposit only"
          }
          onClick={(e) => {
            stopSummaryToggle(e);
            setDepositSlipModalOpen(true);
          }}
        >
          View deposit slip
        </button>
        <div className="relative" ref={actionsMenuRef}>
          <button
            type="button"
            className={`${groupActionBtnClass} gap-1.5`}
            disabled={actionDisabled}
            aria-expanded={actionsOpen}
            aria-haspopup="menu"
            onClick={(e) => {
              stopSummaryToggle(e);
              setActionsOpen((open) => !open);
            }}
          >
            Actions
            <svg
              className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                actionsOpen ? "rotate-180" : ""
              }`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path
                d="M6 9l6 6 6-6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {actionsOpen ? (
            <ul
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
              onClick={stopSummaryToggle}
            >
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled={actionDisabled}
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                  onClick={(e) => {
                    stopSummaryToggle(e);
                    setPaymentSentConfirmOpen(true);
                  }}
                >
                  Payment sent
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled={actionDisabled}
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-red-800 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
                  onClick={(e) => {
                    stopSummaryToggle(e);
                    setUnableToSendModalOpen(true);
                  }}
                >
                  Unable to send payment
                </button>
              </li>
            </ul>
          ) : null}
        </div>
      </div>
      <ConsignorPaymentCheckModal
        open={checkModalOpen}
        endpointBase={endpointBase}
        consignorName={payment.consignorName}
        initialCheckNumber={payment.checkNumber}
        initialPhotos={payment.checkPhotos}
        token={token}
        onClose={() => setCheckModalOpen(false)}
        onSaved={(detail) =>
          onDetailUpdated(detail as DirectPurchasePaymentDetail)
        }
        onError={onError}
      />
      <ConsignorPaymentDepositSlipModal
        open={depositSlipModalOpen}
        endpointBase={endpointBase}
        consignorName={payment.consignorName}
        initialPhotos={payment.depositSlipPhotos}
        token={token}
        onClose={() => setDepositSlipModalOpen(false)}
        onSaved={(detail) =>
          onDetailUpdated(detail as DirectPurchasePaymentDetail)
        }
        onError={onError}
      />
      <ConsignorPaymentUnableToSendModal
        open={unableToSendModalOpen}
        endpointBase={endpointBase}
        consignorName={payment.consignorName}
        token={token}
        onClose={() => {
          if (!busy) setUnableToSendModalOpen(false);
        }}
        onSaved={(detail) => {
          onDetailUpdated(detail as DirectPurchasePaymentDetail);
          setActionsOpen(false);
          setUnableToSendModalOpen(false);
        }}
        onError={onError}
      />
      <ConfirmDialog
        open={paymentSentConfirmOpen}
        title="Mark payment as sent?"
        description={`This will mark ${payment.consignorName}'s payment as sent, update related inquiry and inventory statuses to Paid to consignor, and email the consignor with the item list and deposit slip if available.`}
        confirmLabel="Payment sent"
        cancelLabel="Cancel"
        busy={busy}
        onCancel={() => {
          if (busy) return;
          setPaymentSentConfirmOpen(false);
        }}
        onConfirm={() => void updateStatus(GROUP_STATUS_PAYMENT_SENT)}
      />
    </>
  );
}

export function DirectPurchasePaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = usePortalAuth();
  const { canEdit, readOnly } = useFeatureAccess("direct-purchase-payments");
  const [detail, setDetail] = useState<DirectPurchasePaymentDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(
        `/api/direct-purchase-payments/${id}`,
        {},
        token,
      );
      if (!res.ok) {
        const msg =
          res.status === 404
            ? "Direct purchase payment not found."
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }
      const data = (await res.json()) as DirectPurchasePaymentDetail;
      setDetail(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load payment details",
      );
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Link
          to="/portal/direct-purchase-payments"
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to direct purchase payments
        </Link>
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {error ?? "Direct purchase payment not found."}
        </p>
      </div>
    );
  }

  const totalAmount = groupOfferTotal(detail.items);

  return (
    <div className="w-full min-w-0 space-y-6">
      {readOnly ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          You have view-only access to this feature.
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Direct purchase payment
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {detail.consignorName}
          </h1>
        </div>
        <Link
          to="/portal/direct-purchase-payments"
          className="shrink-0 text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to direct purchase payments
        </Link>
      </div>

      {actionError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {actionError}
        </p>
      ) : null}

      <details open className={`${cardClass} group/consignor overflow-hidden`}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1 text-left">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {detail.consignorName}
              <span className="font-normal text-slate-500 dark:text-slate-400">
                {" "}
                · {itemCountLabel(detail.items.length)} ·{" "}
                <span className="tabular-nums">
                  {formatPhpAmount(totalAmount)}
                </span>
                {" · "}
                {paymentPreferenceInline(detail)}
              </span>
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <HeaderActions
              payment={detail}
              token={token}
              disabled={!canEdit}
              onDetailUpdated={setDetail}
              onError={setActionError}
            />
            <span
              className={consignorPaymentGroupStatusBadgeClass(detail.status)}
            >
              {detail.status}
            </span>
            <span
              className="text-slate-400 transition-transform duration-200 group-open/consignor:rotate-180 dark:text-slate-500"
              aria-hidden
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  d="M6 9l6 6 6-6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
        </summary>

        <div className="border-t border-slate-200 px-4 pb-3 pt-2 dark:border-slate-700">
          {detail.items.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No items in this payment.
            </p>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <table className={itemListTableClass}>
                <colgroup>
                  <col />
                  <col className="w-[6rem] sm:w-[7rem]" />
                  <col className="w-[9rem] sm:w-[10rem]" />
                  <col className="w-[9rem] sm:w-[10rem]" />
                  <col className="w-[7rem] sm:w-[8rem]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className={itemListHeaderCellClass}>Item</th>
                    <th className={itemListHeaderCellClass}>Order</th>
                    <th className={itemListHeaderCellClass}>Inquiry SKU</th>
                    <th className={itemListHeaderCellClass}>Inventory SKU</th>
                    <th className={`${itemListHeaderCellClass} text-right`}>
                      Consignor&apos;s price
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {detail.items.map((item) => (
                    <tr key={item.id}>
                      <td
                        className={`${itemListBodyCellClass} min-w-0 truncate`}
                      >
                        <span
                          className="block truncate"
                          title={item.itemLabel}
                        >
                          {item.itemLabel}
                        </span>
                      </td>
                      <td
                        className={`${itemListBodyCellClass} ${itemListSkuCellClass} truncate`}
                      >
                        {item.orderId != null && item.orderNumber != null ? (
                          <Link
                            to={`/portal/orders/${item.orderId}`}
                            className="block truncate text-violet-700 hover:underline dark:text-violet-300"
                            title={`Order #${item.orderNumber}`}
                          >
                            #{item.orderNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className={`${itemListBodyCellClass} ${itemListSkuCellClass} truncate`}
                      >
                        <Link
                          to={`/portal/inquiries/${item.inquiryId}`}
                          className="block truncate text-violet-700 hover:underline dark:text-violet-300"
                          title={item.inquirySku}
                        >
                          {item.inquirySku}
                        </Link>
                      </td>
                      <td
                        className={`${itemListBodyCellClass} ${itemListSkuCellClass} truncate`}
                        title={item.inventorySku ?? undefined}
                      >
                        {item.inventoryItemId != null && item.inventorySku ? (
                          <Link
                            to={`/portal/inventory/${item.inventoryItemId}`}
                            className="block truncate text-violet-700 hover:underline dark:text-violet-300"
                            title={item.inventorySku}
                          >
                            {item.inventorySku}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className={`${itemListBodyCellClass} truncate text-right tabular-nums`}
                      >
                        {formatPhpDisplay(item.offerPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
