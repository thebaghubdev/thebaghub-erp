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
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import {
  consignorPaymentGroupStatusBadgeClass,
  consignorPaymentStatusBadgeClass,
  formatConsignorPaymentAuditDate,
  isConsignorPaymentApproved,
  isConsignorPaymentPending,
} from "../lib/consignor-payments-display";
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

type ConsignorPaymentItemRow = {
  id: string;
  inquiryId: string;
  inquirySku: string;
  itemLabel: string;
  offerPrice: string | null;
  inventorySku: string | null;
};

type ConsignorPaymentGroupRow = {
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
  items: ConsignorPaymentItemRow[];
};

type ConsignorPaymentDetail = {
  id: string;
  auditDate: string;
  status: string;
  groups: ConsignorPaymentGroupRow[];
};

const cardClass =
  "rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";

const approveBtnClass =
  "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500";

const groupActionBtnClass =
  "inline-flex shrink-0 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

const GROUP_STATUS_PAYMENT_SENT = "Payment sent";
const GROUP_STATUS_UNABLE_TO_SEND = "Unable to send";

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

function groupOfferTotal(items: ConsignorPaymentItemRow[]): number {
  return items.reduce((sum, item) => {
    const amount =
      item.offerPrice != null
        ? parsePhpStringToNumber(String(item.offerPrice))
        : null;
    return sum + (amount ?? 0);
  }, 0);
}

function paymentPreferenceInline(group: ConsignorPaymentGroupRow): string {
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

type PaymentMethodTotalKey =
  | "direct_deposit:bdo"
  | "direct_deposit:bpi"
  | "check_pickup:pasig"
  | "check_pickup:makati"
  | "cash_pickup:pasig"
  | "cash_pickup:makati";

const PAYMENT_SUMMARY_CATEGORIES: Array<{
  title: string;
  rows: Array<{ key: PaymentMethodTotalKey; label: string }>;
}> = [
  {
    title: "Check pickup",
    rows: [
      { key: "check_pickup:pasig", label: "Pasig" },
      { key: "check_pickup:makati", label: "Makati" },
    ],
  },
  {
    title: "Cash pickup",
    rows: [
      { key: "cash_pickup:pasig", label: "Pasig" },
      { key: "cash_pickup:makati", label: "Makati" },
    ],
  },
  {
    title: "Direct deposit",
    rows: [
      { key: "direct_deposit:bdo", label: "BDO" },
      { key: "direct_deposit:bpi", label: "BPI" },
    ],
  },
];

function groupPaymentMethodTotalKey(
  group: ConsignorPaymentGroupRow,
): PaymentMethodTotalKey | null {
  if (group.preferredPaymentMethod === "direct_deposit") {
    if (group.bankCode === "bdo") return "direct_deposit:bdo";
    if (group.bankCode === "bpi") return "direct_deposit:bpi";
    return null;
  }
  if (
    group.preferredPaymentMethod === "check_pickup" ||
    group.preferredPaymentMethod === "cash_pickup"
  ) {
    const branch = group.preferredPaymentBranch ?? "pasig";
    if (branch === "pasig" || branch === "makati") {
      return `${group.preferredPaymentMethod}:${branch}` as PaymentMethodTotalKey;
    }
  }
  return null;
}

function computePaymentMethodTotals(
  groups: ConsignorPaymentGroupRow[],
): Record<PaymentMethodTotalKey, number> {
  const totals: Record<PaymentMethodTotalKey, number> = {
    "direct_deposit:bdo": 0,
    "direct_deposit:bpi": 0,
    "check_pickup:pasig": 0,
    "check_pickup:makati": 0,
    "cash_pickup:pasig": 0,
    "cash_pickup:makati": 0,
  };

  for (const group of groups) {
    const key = groupPaymentMethodTotalKey(group);
    if (!key) continue;
    totals[key] += groupOfferTotal(group.items);
  }

  return totals;
}

const itemListTableClass =
  "w-full table-fixed border-collapse text-left text-sm";

const itemListHeaderCellClass =
  "pb-1.5 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 last:pr-0";

const itemListBodyCellClass =
  "py-1.5 pr-3 align-top text-slate-800 dark:text-slate-200 last:pr-0";

const itemListSkuCellClass =
  "font-mono text-xs text-slate-900 dark:text-slate-100";

function PaymentSummaryCard({
  totals,
}: {
  totals: Record<PaymentMethodTotalKey, number>;
}) {
  return (
    <section className={`${cardClass} p-5`}>
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Payment summary
      </h2>
      <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PAYMENT_SUMMARY_CATEGORIES.map((category) => (
          <div key={category.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {category.title}
            </h3>
            <dl className="mt-2 space-y-2">
              {category.rows.map((row) => (
                <div
                  key={row.key}
                  className="flex items-baseline justify-between gap-4 text-sm"
                >
                  <dt className="text-slate-600 dark:text-slate-400">
                    {row.label}
                  </dt>
                  <dd className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                    {formatPhpAmount(totals[row.key])}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConsignorPaymentGroupHeaderActions({
  paymentId,
  group,
  token,
  disabled,
  onDetailUpdated,
  onError,
}: {
  paymentId: string;
  group: ConsignorPaymentGroupRow;
  token: string | null;
  disabled: boolean;
  onDetailUpdated: (detail: ConsignorPaymentDetail) => void;
  onError: (message: string | null) => void;
}) {
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [checkModalOpen, setCheckModalOpen] = useState(false);
  const [depositSlipModalOpen, setDepositSlipModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const updateGroupStatus = async (status: string) => {
    if (!token || busy || disabled) return;
    onError(null);
    setBusy(true);
    try {
      const res = await apiFetch(
        `/api/consignor-payments/${paymentId}/groups/${group.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as ConsignorPaymentDetail;
      onDetailUpdated(data);
      setActionsOpen(false);
    } catch (e) {
      onError(
        e instanceof Error ? e.message : "Could not update consignor status",
      );
    } finally {
      setBusy(false);
    }
  };

  const isDirectDeposit = group.preferredPaymentMethod === "direct_deposit";
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
          isDirectDeposit
            ? undefined
            : "Available for direct deposit only"
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
                  void updateGroupStatus(GROUP_STATUS_PAYMENT_SENT);
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
                  void updateGroupStatus(GROUP_STATUS_UNABLE_TO_SEND);
                }}
              >
                Unable to send
              </button>
            </li>
          </ul>
        ) : null}
      </div>
      </div>
      <ConsignorPaymentCheckModal
        open={checkModalOpen}
        paymentId={paymentId}
        groupId={group.id}
        consignorName={group.consignorName}
        initialCheckNumber={group.checkNumber}
        initialPhotos={group.checkPhotos}
        token={token}
        onClose={() => setCheckModalOpen(false)}
        onSaved={(detail) =>
          onDetailUpdated(detail as ConsignorPaymentDetail)
        }
        onError={onError}
      />
      <ConsignorPaymentDepositSlipModal
        open={depositSlipModalOpen}
        paymentId={paymentId}
        groupId={group.id}
        consignorName={group.consignorName}
        initialPhotos={group.depositSlipPhotos}
        token={token}
        onClose={() => setDepositSlipModalOpen(false)}
        onSaved={(detail) =>
          onDetailUpdated(detail as ConsignorPaymentDetail)
        }
        onError={onError}
      />
    </>
  );
}

function ConsignorPaymentGroupCard({
  paymentId,
  group,
  batchApproved,
  token,
  groupActionsDisabled,
  onDetailUpdated,
  onGroupActionError,
}: {
  paymentId: string;
  group: ConsignorPaymentGroupRow;
  batchApproved: boolean;
  token: string | null;
  groupActionsDisabled: boolean;
  onDetailUpdated: (detail: ConsignorPaymentDetail) => void;
  onGroupActionError: (message: string | null) => void;
}) {
  const totalAmount = groupOfferTotal(group.items);

  return (
    <details open className={`${cardClass} group/consignor overflow-hidden`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1 text-left">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {group.consignorName}
            <span className="font-normal text-slate-500 dark:text-slate-400">
              {" "}
              · {itemCountLabel(group.items.length)} ·{" "}
              <span className="tabular-nums">
                {formatPhpAmount(totalAmount)}
              </span>
              {" · "}
              {paymentPreferenceInline(group)}
            </span>
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {batchApproved ? (
            <>
              <ConsignorPaymentGroupHeaderActions
                paymentId={paymentId}
                group={group}
                token={token}
                disabled={groupActionsDisabled}
                onDetailUpdated={onDetailUpdated}
                onError={onGroupActionError}
              />
              <span
                className={consignorPaymentGroupStatusBadgeClass(group.status)}
              >
                {group.status}
              </span>
            </>
          ) : null}
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
        {group.items.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No items in this group.
          </p>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className={itemListTableClass}>
              <colgroup>
                <col />
                <col className="w-[9rem] sm:w-[10rem]" />
                <col className="w-[9rem] sm:w-[10rem]" />
                <col className="w-[7rem] sm:w-[8rem]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className={itemListHeaderCellClass}>Item</th>
                  <th className={itemListHeaderCellClass}>Inquiry SKU</th>
                  <th className={itemListHeaderCellClass}>Inventory SKU</th>
                  <th className={`${itemListHeaderCellClass} text-right`}>
                    Consignor&apos;s price
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {group.items.map((item) => (
                  <tr key={item.id}>
                    <td className={`${itemListBodyCellClass} min-w-0 truncate`}>
                      <span className="block truncate" title={item.itemLabel}>
                        {item.itemLabel}
                      </span>
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
                      {item.inventorySku ?? "—"}
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
  );
}

export function ConsignorPaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = usePortalAuth();
  const [detail, setDetail] = useState<ConsignorPaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [groupActionError, setGroupActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/consignor-payments/${id}`, {}, token);
      if (!res.ok) {
        const msg =
          res.status === 404
            ? "Consignor payment batch not found."
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }
      const data = (await res.json()) as ConsignorPaymentDetail;
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

  const confirmApprove = useCallback(async () => {
    if (!id || !token) return;
    setApproveError(null);
    setApproveBusy(true);
    try {
      const res = await apiFetch(
        `/api/consignor-payments/${id}/approve`,
        { method: "PATCH" },
        token,
      );
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const body = (await res.json()) as { message?: string | string[] };
          if (Array.isArray(body.message)) msg = body.message.join("; ");
          else if (typeof body.message === "string") msg = body.message;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as ConsignorPaymentDetail;
      setDetail(data);
      setApproveConfirmOpen(false);
    } catch (e) {
      setApproveError(
        e instanceof Error ? e.message : "Could not approve payment batch",
      );
    } finally {
      setApproveBusy(false);
    }
  }, [id, token]);

  if (loading) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Link
          to="/portal/consignor-payments"
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to consignor payments
        </Link>
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {error ?? "Consignor payment batch not found."}
        </p>
      </div>
    );
  }

  const paymentMethodTotals = computePaymentMethodTotals(detail.groups);
  const showApproveActions = isConsignorPaymentPending(detail.status);
  const batchApproved = isConsignorPaymentApproved(detail.status);

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Consignor payment batch
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {formatConsignorPaymentAuditDate(detail.auditDate)}
          </h1>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            <span className={consignorPaymentStatusBadgeClass(detail.status)}>
              {detail.status}
            </span>
          </p>
        </div>
        <Link
          to="/portal/consignor-payments"
          className="shrink-0 text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to consignor payments
        </Link>
      </div>

      {showApproveActions ? (
        <div className={`${cardClass} p-4`}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Actions
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={approveBtnClass}
              disabled={approveBusy}
              onClick={() => {
                setApproveError(null);
                setApproveConfirmOpen(true);
              }}
            >
              Approve
            </button>
          </div>
        </div>
      ) : null}

      <PaymentSummaryCard totals={paymentMethodTotals} />

      {groupActionError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {groupActionError}
        </p>
      ) : null}

      {detail.groups.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No consignor groups in this batch.
        </p>
      ) : (
        <div className="space-y-4">
          {detail.groups.map((group) => (
            <ConsignorPaymentGroupCard
              key={group.id}
              paymentId={detail.id}
              group={group}
              batchApproved={batchApproved}
              token={token}
              groupActionsDisabled={approveBusy}
              onDetailUpdated={setDetail}
              onGroupActionError={setGroupActionError}
            />
          ))}
        </div>
      )}
      <ConfirmDialog
        open={approveConfirmOpen}
        title="Approve payment batch?"
        description="This will mark the batch as Approved."
        confirmLabel="Approve"
        cancelLabel="Cancel"
        busy={approveBusy}
        errorMessage={approveError}
        onCancel={() => {
          if (approveBusy) return;
          setApproveError(null);
          setApproveConfirmOpen(false);
        }}
        onConfirm={() => void confirmApprove()}
      />
    </div>
  );
}
