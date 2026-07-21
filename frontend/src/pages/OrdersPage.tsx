import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/data-table/DataTable";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { StaffCreateOrderPanel } from "../components/StaffCreateOrderPanel";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay } from "../lib/format-php";
import {
  ORDER_STATUS_FILTER_OPTIONS,
  paymentTypeLabel,
} from "../lib/order-status-filter-options";

type OrderRow = {
  id: string;
  orderNumber: number;
  status: string;
  customerName: string;
  itemSku: string;
  itemLabel: string;
  paymentType: string;
  amount: string | null;
  layawayMonths: number | null;
  holdingPeriod: string | null;
  createdAt: string;
};

type OrdersTab = "all" | "create";

const LEAVE_TAB_MSG =
  "You have unsaved changes to this order. Switch tabs anyway?";

const columnHelper = createColumnHelper<OrderRow>();

const columns = [
  columnHelper.accessor("orderNumber", {
    header: "Order #",
    cell: ({ getValue }) => (
      <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("status", {
    id: "status",
    header: "Status",
    cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
  }),
  columnHelper.accessor("customerName", {
    header: "Customer",
    cell: ({ getValue }) => (
      <span className="break-words font-medium text-slate-900 dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("itemSku", {
    header: "Item SKU",
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
  columnHelper.accessor("paymentType", {
    header: "Payment type",
    cell: ({ getValue }) => (
      <span className="text-slate-700 dark:text-slate-300">
        {paymentTypeLabel(getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("amount", {
    header: "Amount",
    cell: ({ getValue }) => (
      <span className="tabular-nums text-slate-800 dark:text-slate-200">
        {formatPhpDisplay(getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("layawayMonths", {
    header: "Layaway months",
    cell: ({ getValue }) => (
      <span className="text-slate-700 dark:text-slate-300">
        {getValue() ?? "—"}
      </span>
    ),
  }),
  columnHelper.accessor("holdingPeriod", {
    header: "Holding period ends",
    cell: ({ getValue }) =>
      getValue() ? <SubmittedAtCell iso={getValue()!} /> : "—",
  }),
  columnHelper.accessor("createdAt", {
    header: "Created",
    cell: ({ getValue }) => <SubmittedAtCell iso={getValue()} />,
  }),
];

export function OrdersPage() {
  const navigate = useNavigate();
  const { token } = usePortalAuth();
  const [tab, setTab] = useState<OrdersTab>("all");
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabLeaveOpen, setTabLeaveOpen] = useState(false);
  const [pendingOrdersTab, setPendingOrdersTab] = useState<OrdersTab | null>(
    null,
  );
  const [createFormDirty, setCreateFormDirty] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/orders", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as OrderRow[];
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === "all") void load();
  }, [tab, load]);

  useEffect(() => {
    if (tab === "all") setCreateFormDirty(false);
  }, [tab]);

  const requestTab = (next: OrdersTab) => {
    if (tab === "create" && next === "all" && createFormDirty) {
      setPendingOrdersTab(next);
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
        description={LEAVE_TAB_MSG}
        cancelLabel="Stay"
        confirmLabel="Switch tab"
        onCancel={() => {
          setTabLeaveOpen(false);
          setPendingOrdersTab(null);
        }}
        onConfirm={() => {
          if (pendingOrdersTab !== null) setTab(pendingOrdersTab);
          setTabLeaveOpen(false);
          setPendingOrdersTab(null);
        }}
      />
      <div
        className="mb-6 flex items-end gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Orders sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          id="tab-orders-all"
          aria-controls="panel-orders-all"
          className={`${tabBtn} ${
            tab === "all"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => requestTab("all")}
        >
          All orders
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "create"}
          id="tab-orders-create"
          aria-controls="panel-orders-create"
          className={`${tabBtn} ${
            tab === "create"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => requestTab("create")}
        >
          Create order
        </button>
      </div>

      {tab === "all" && (
        <section
          id="panel-orders-all"
          role="tabpanel"
          aria-labelledby="tab-orders-all"
        >
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : null}

          <DataTable
            data={rows}
            columns={columns}
            tableId="portal.orders"
            isLoading={loading}
            emptyMessage="No orders yet."
            hideEmptyState={!!error}
            statusFilterOptions={ORDER_STATUS_FILTER_OPTIONS}
            getRowId={(r) => r.id}
            onRowClick={(r) => navigate(`/portal/orders/${r.id}`)}
            getRowAriaLabel={(r) =>
              `Order ${r.orderNumber}, ${r.customerName}, ${r.status}`
            }
          />
        </section>
      )}

      {tab === "create" && (
        <section
          id="panel-orders-create"
          role="tabpanel"
          aria-labelledby="tab-orders-create"
          className="min-h-[12rem]"
        >
          <StaffCreateOrderPanel
            portalToken={token ?? ""}
            onDirtyChange={setCreateFormDirty}
            onSubmitted={(orderId) => navigate(`/portal/orders/${orderId}`)}
          />
        </section>
      )}
    </div>
  );
}
