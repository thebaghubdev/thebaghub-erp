import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AddStockInventoryItemForm } from "../components/AddStockInventoryItemForm";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/data-table/DataTable";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { useFeatureAccess } from "../lib/use-feature-access";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { branchLabel } from "../lib/consignment-schedule-labels";
import { formatOfferTransactionLabel } from "../lib/format-offer-transaction-type";
import { formatPhpDisplay } from "../lib/format-php";
import { INVENTORY_ITEM_STATUS_FILTER_OPTIONS } from "../lib/inventory-item-status-filter-options";
import { logisticsStatusBadgeClass } from "../lib/logistics-display";

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
  rating: string | null;
  consignorPrice: string | null;
  tbhSellingPrice: string | null;
  assignedToName: string | null;
  authenticationStatus: string;
  logisticsStatus: string;
};

type InventoryTab = "all" | "add";

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
  columnHelper.accessor("rating", {
    header: "Rating",
    cell: ({ getValue }) => {
      const rating = getValue()?.trim() ?? "";
      return (
        <span className="tabular-nums text-slate-800 dark:text-slate-200">
          {rating || "—"}
        </span>
      );
    },
  }),
  columnHelper.accessor("consignorPrice", {
    header: "Consignor price",
    cell: ({ getValue }) => (
      <span className="tabular-nums text-slate-800 dark:text-slate-200">
        {formatPhpDisplay(getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("tbhSellingPrice", {
    header: "TBH selling price",
    cell: ({ getValue }) => (
      <span className="tabular-nums text-slate-800 dark:text-slate-200">
        {formatPhpDisplay(getValue())}
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
  columnHelper.accessor("logisticsStatus", {
    header: "Logistics status",
    cell: ({ getValue }) => {
      const status = getValue() || "In Stock";
      return (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${logisticsStatusBadgeClass(status)}`}
        >
          {status}
        </span>
      );
    },
  }),
];

export function InventoryPage() {
  const navigate = useNavigate();
  const { token } = usePortalAuth();
  const { canEdit: canAddInventoryItem } = useFeatureAccess(
    "add-inventory-item",
  );
  const [tab, setTab] = useState<InventoryTab>("all");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [addFormDirty, setAddFormDirty] = useState(false);
  const [tabLeaveOpen, setTabLeaveOpen] = useState(false);

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
    if (tab === "all") void load();
  }, [tab, load]);

  useEffect(() => {
    if (tab === "add" && !canAddInventoryItem) {
      setTab("all");
    }
  }, [tab, canAddInventoryItem]);

  const requestTab = (next: InventoryTab) => {
    if (tab === "add" && next === "all" && addFormDirty) {
      setTabLeaveOpen(true);
      return;
    }
    setTab(next);
  };

  const tabBtn =
    "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

  return (
    <div className="w-full min-w-0">
      <ConfirmDialog
        open={tabLeaveOpen}
        title="Unsaved changes"
        description="You have unsaved changes to this stock item. Switch tabs anyway?"
        cancelLabel="Stay"
        confirmLabel="Switch tab"
        onCancel={() => setTabLeaveOpen(false)}
        onConfirm={() => {
          setTab("all");
          setTabLeaveOpen(false);
        }}
      />
      <div
        className="mb-6 flex items-end gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Inventory sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          id="tab-inventory-all"
          aria-controls="panel-inventory-all"
          className={`${tabBtn} ${
            tab === "all"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => requestTab("all")}
        >
          All Items
        </button>
        {canAddInventoryItem ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "add"}
            id="tab-inventory-add"
            aria-controls="panel-inventory-add"
            className={`${tabBtn} ${
              tab === "add"
                ? "border-violet-600 text-violet-700 dark:text-violet-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
            onClick={() => requestTab("add")}
          >
            Add Item
          </button>
        ) : null}
      </div>

      {tab === "all" && (
        <section
          id="panel-inventory-all"
          role="tabpanel"
          aria-labelledby="tab-inventory-all"
        >
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : null}

          <DataTable
            data={rows}
            columns={columns}
            tableId="portal.inventory"
            isLoading={loading}
            emptyMessage="No inventory items yet."
            hideEmptyState={!!error}
            statusFilterOptions={INVENTORY_ITEM_STATUS_FILTER_OPTIONS}
            getRowId={(r) => r.id}
            onRowClick={(r) => navigate(`/portal/inventory/${r.id}`)}
            getRowAriaLabel={(r) =>
              `Inventory item ${r.sku}, ${r.itemLabel}`
            }
          />
        </section>
      )}

      {tab === "add" && canAddInventoryItem && (
        <section
          id="panel-inventory-add"
          role="tabpanel"
          aria-labelledby="tab-inventory-add"
          className="min-h-[12rem]"
        >
          {addSuccess ? (
            <p
              className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
              role="status"
            >
              {addSuccess}{" "}
              <button
                type="button"
                className="font-medium text-violet-700 underline dark:text-violet-300"
                onClick={() => setTab("all")}
              >
                View all items
              </button>
            </p>
          ) : null}
          <AddStockInventoryItemForm
            portalToken={token}
            onDirtyChange={setAddFormDirty}
            onCreated={({ sku }) => {
              setAddSuccess(
                `Added ${sku} (For Authentication). You can add another item below.`,
              );
            }}
          />
        </section>
      )}
    </div>
  );
}
