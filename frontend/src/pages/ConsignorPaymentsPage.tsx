import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import {
  consignorPaymentStatusBadgeClass,
  formatConsignorPaymentAuditDate,
} from "../lib/consignor-payments-display";

type ConsignorPaymentRow = {
  id: string;
  auditDate: string;
  status: string;
  groupCount: number;
  itemCount: number;
};

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

const listItemClass =
  "flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-3 text-left transition-colors hover:border-violet-200 hover:bg-violet-50/80 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:hover:border-violet-800 dark:hover:bg-violet-950/40";

export function ConsignorPaymentsPage() {
  const navigate = useNavigate();
  const { token } = usePortalAuth();
  const [rows, setRows] = useState<ConsignorPaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/consignor-payments", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as ConsignorPaymentRow[];
      setRows(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load consignor payments",
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  return (
    <div className="w-full min-w-0 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Consignor Payments
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Payment batches grouped by audit date. Select a batch to view items
          per consignor.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      <div className={cardClass}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Payment batches
        </h2>

        {loading ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No consignor payment batches yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={listItemClass}
                  aria-label={`View consignor payment items for audit date ${formatConsignorPaymentAuditDate(row.auditDate)}`}
                  onClick={() =>
                    navigate(`/portal/consignor-payments/${row.id}`)
                  }
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {formatConsignorPaymentAuditDate(row.auditDate)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {row.groupCount}{" "}
                      {row.groupCount === 1 ? "consignor" : "consignors"}
                      {" · "}
                      {row.itemCount}{" "}
                      {row.itemCount === 1 ? "item" : "items"}
                    </p>
                  </div>
                  <span className={consignorPaymentStatusBadgeClass(row.status)}>
                    {row.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
