import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useState } from "react";
import { DataTable } from "../components/data-table/DataTable";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { branchLabel } from "../lib/consignment-schedule-labels";
import { formatOfferTransactionLabel } from "../lib/format-offer-transaction-type";

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

const columnHelper = createColumnHelper<InventoryRow>();

const columns = [
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
  columnHelper.accessor("inclusions", {
    header: "Inclusions",
    cell: ({ row }) => (
      <span
        className="max-w-[14rem] min-w-[7rem] whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300"
        title={
          row.original.inclusions !== "—" ? row.original.inclusions : undefined
        }
      >
        {row.original.inclusions}
      </span>
    ),
  }),
  columnHelper.accessor("dateReceived", {
    header: "Date received",
    cell: ({ getValue }) => <SubmittedAtCell iso={getValue()} />,
  }),
  columnHelper.accessor("consignorName", {
    header: "Consignor",
    cell: ({ getValue }) => (
      <span className="break-words font-medium text-slate-900 dark:text-slate-100">
        {getValue() ?? "—"}
      </span>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => (
      <span className="text-slate-700 dark:text-slate-300">{getValue()}</span>
    ),
  }),
  columnHelper.accessor("transactionType", {
    header: "Transaction",
    cell: ({ row }) => (
      <span className="text-slate-700 dark:text-slate-300">
        {formatOfferTransactionLabel(
          row.original.transactionType as "consignment" | "direct_purchase" | null,
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

export function InventoryPage() {
  const { token } = usePortalAuth();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/inventory", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as InventoryRow[];
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="w-full min-w-0 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Inventory
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Items received from consignment schedules.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          emptyMessage="No inventory items yet."
          getRowId={(r) => r.id}
        />
      )}
    </div>
  );
}
