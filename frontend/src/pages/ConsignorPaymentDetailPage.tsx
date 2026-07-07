import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import {
  consignorPaymentStatusBadgeClass,
  formatConsignorPaymentAuditDate,
} from "../lib/consignor-payments-display";
import { branchLabel } from "../lib/consignment-schedule-labels";
import { formatClientPaymentMethod } from "../lib/client-payment-preference";
import { formatPhpAmount, formatPhpDisplay, parsePhpStringToNumber } from "../lib/format-php";

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
  if (
    group.preferredPaymentMethod &&
    group.preferredPaymentMethod !== "direct_deposit"
  ) {
    return `${method} · ${branchLabel(group.preferredPaymentBranch ?? "pasig")}`;
  }
  return method;
}

const itemListTableClass =
  "w-full table-fixed border-collapse text-left text-sm";

const itemListHeaderCellClass =
  "pb-1.5 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 last:pr-0";

const itemListBodyCellClass =
  "py-1.5 pr-3 align-top text-slate-800 dark:text-slate-200 last:pr-0";

const itemListSkuCellClass =
  "font-mono text-xs text-slate-900 dark:text-slate-100";

function ConsignorPaymentGroupCard({ group }: { group: ConsignorPaymentGroupRow }) {
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
              <span className="tabular-nums">{formatPhpAmount(totalAmount)}</span>
              {" · "}
              {paymentPreferenceInline(group)}
            </span>
          </h2>
        </div>
        <span
          className="shrink-0 text-slate-400 transition-transform duration-200 group-open/consignor:rotate-180 dark:text-slate-500"
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
                    <td className={`${itemListBodyCellClass} ${itemListSkuCellClass} truncate`}>
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

      {detail.groups.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No consignor groups in this batch.
        </p>
      ) : (
        <div className="space-y-4">
          {detail.groups.map((group) => (
            <ConsignorPaymentGroupCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
