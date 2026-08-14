import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "../components/data-table/DataTable";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { useFeatureAccess } from "../lib/use-feature-access";
import { branchLabel } from "../lib/consignment-schedule-labels";
import { formatOfferTransactionLabel } from "../lib/format-offer-transaction-type";

const EDITING_PAGE_STATUSES = new Set([
  "For Editing",
  "For Posting",
  "Available For Purchase",
]);

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
  assignedToName: string | null;
  authenticationStatus: string;
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
  columnHelper.accessor("status", {
    header: "Status",
    cell: ({ row }) => (
      <InventoryStatusBadge status={row.original.status} />
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
  columnHelper.accessor("transactionType", {
    header: "Transaction",
    cell: ({ row }) => (
      <span className="text-slate-700 dark:text-slate-300">
        {formatOfferTransactionLabel(row.original.transactionType)}
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

export function EditingPage() {
  const navigate = useNavigate();
  const { token } = usePortalAuth();
  const { readOnly } = useFeatureAccess("editing");
  const [rows, setRows] = useState<InventoryRow[]>([]);
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
      setRows(data.filter((r) => EDITING_PAGE_STATUSES.has(r.status)));
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
    <div className="w-full min-w-0">
      {readOnly ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          You have view-only access to this feature.
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <DataTable
        data={rows}
        columns={columns}
        tableId="portal.editing"
        isLoading={loading}
        emptyMessage="No inventory items are currently For Editing, For Posting, or Available For Purchase."
        hideEmptyState={!!error}
        searchPlaceholder="Search SKU, item, inclusions, consignor…"
        getRowId={(r) => r.id}
        onRowClick={(r) => navigate(`/portal/editing/${r.id}`)}
        getRowAriaLabel={(r) => `Inventory item ${r.sku}, ${r.itemLabel}`}
      />
    </div>
  );
}
