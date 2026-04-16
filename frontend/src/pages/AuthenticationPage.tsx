import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "../components/data-table/DataTable";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { branchLabel } from "../lib/consignment-schedule-labels";
import { formatOfferTransactionLabel } from "../lib/format-offer-transaction-type";

const FOR_AUTHENTICATION_STATUS = "For Authentication";

type InventoryRow = {
  id: string;
  sku: string;
  dateReceived: string;
  inquiryId: string | null;
  consignorName: string | null;
  status: string;
  transactionType: string | null;
  currentBranch: string;
  itemLabel: string;
  inclusions: string;
};

type AuthenticationTab = "items" | "metrics";

const columnHelper = createColumnHelper<InventoryRow>();

const authQueueColumns = [
  columnHelper.accessor("sku", {
    header: "SKU",
    cell: ({ getValue }) => (
      <span className="break-all font-mono text-[0.65rem] leading-snug text-slate-900 sm:text-xs dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("itemLabel", {
    header: "Item",
    cell: ({ getValue }) => (
      <span className="break-words text-slate-800 dark:text-slate-200">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("consignorName", {
    header: "Consignor",
    cell: ({ getValue }) => (
      <span className="break-words font-medium text-slate-900 dark:text-slate-100">
        {getValue() ?? "—"}
      </span>
    ),
  }),
  columnHelper.accessor("dateReceived", {
    header: "Date received",
    cell: ({ getValue }) => <SubmittedAtCell iso={getValue()} />,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: ({ row }) => (
      <InventoryStatusBadge status={row.original.status} />
    ),
  }),
  columnHelper.accessor("transactionType", {
    header: "Transaction",
    cell: ({ row }) => (
      <span className="text-slate-700 dark:text-slate-300">
        {formatOfferTransactionLabel(
          row.original.transactionType as
            | "consignment"
            | "direct_purchase"
            | null,
        )}
      </span>
    ),
  }),
  columnHelper.accessor("currentBranch", {
    header: "Branch",
    cell: ({ getValue }) => (
      <span className="text-slate-700 dark:text-slate-300">
        {branchLabel(getValue())}
      </span>
    ),
  }),
];

export function AuthenticationPage() {
  const navigate = useNavigate();
  const { token } = usePortalAuth();
  const [tab, setTab] = useState<AuthenticationTab>("items");
  const [allRows, setAllRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/inventory", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as InventoryRow[];
      setAllRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === "items") void load();
  }, [tab, load]);

  const rows = useMemo(
    () =>
      allRows.filter((r) => r.status === FOR_AUTHENTICATION_STATUS),
    [allRows],
  );

  const tabBtn =
    "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

  return (
    <div className="w-full min-w-0">
      <div
        className="mb-6 flex items-end gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Authentication sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "items"}
          id="tab-auth-items"
          aria-controls="panel-auth-items"
          className={`${tabBtn} ${
            tab === "items"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => setTab("items")}
        >
          Authenticate Items
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "metrics"}
          id="tab-auth-metrics"
          aria-controls="panel-auth-metrics"
          className={`${tabBtn} ${
            tab === "metrics"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => setTab("metrics")}
        >
          Authentication Metrics
        </button>
      </div>

      {tab === "items" && (
        <section
          id="panel-auth-items"
          role="tabpanel"
          aria-labelledby="tab-auth-items"
          className="min-h-[12rem]"
        >
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : null}

          <DataTable<InventoryRow>
            data={rows}
            columns={authQueueColumns}
            isLoading={loading}
            emptyMessage="No items awaiting authentication."
            hideEmptyState={!!error}
            getRowId={(r) => r.id}
            onRowClick={(r) =>
              navigate(`/portal/authentication/${r.id}`)
            }
            getRowAriaLabel={(r) =>
              `Authenticate inventory item ${r.sku}, ${r.itemLabel}`
            }
            tableClassName="w-full min-w-[980px] table-fixed border-collapse text-left"
          />
        </section>
      )}

      {tab === "metrics" && (
        <section
          id="panel-auth-metrics"
          role="tabpanel"
          aria-labelledby="tab-auth-metrics"
          className="min-h-[12rem]"
        />
      )}
    </div>
  );
}
