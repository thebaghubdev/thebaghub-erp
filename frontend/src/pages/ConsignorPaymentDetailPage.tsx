import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import {
  consignorPaymentStatusBadgeClass,
  formatConsignorPaymentAuditDate,
} from "../lib/consignor-payments-display";
import { formatPhpDisplay } from "../lib/format-php";

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
  items: ConsignorPaymentItemRow[];
};

type ConsignorPaymentDetail = {
  id: string;
  auditDate: string;
  status: string;
  groups: ConsignorPaymentGroupRow[];
};

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

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
        <div className="space-y-6">
          {detail.groups.map((group) => (
            <div key={group.id} className={cardClass}>
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {group.consignorName}
                </h2>
                {group.consignorEmail ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {group.consignorEmail}
                  </p>
                ) : null}
              </div>

              {group.items.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  No items in this group.
                </p>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                  {group.items.map((item) => (
                    <li key={item.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {item.itemLabel}
                          </p>
                          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                            <div>
                              <dt className="text-slate-500 dark:text-slate-400">
                                Inquiry SKU
                              </dt>
                              <dd>
                                <Link
                                  to={`/portal/inquiries/${item.inquiryId}`}
                                  className="break-all font-mono text-xs text-violet-700 hover:underline dark:text-violet-300"
                                >
                                  {item.inquirySku}
                                </Link>
                              </dd>
                            </div>
                            <div>
                              <dt className="text-slate-500 dark:text-slate-400">
                                Inventory SKU
                              </dt>
                              <dd className="break-all font-mono text-xs text-slate-900 dark:text-slate-100">
                                {item.inventorySku ?? "—"}
                              </dd>
                            </div>
                          </dl>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Offer price
                          </p>
                          <p className="mt-0.5 tabular-nums text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatPhpDisplay(item.offerPrice)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
