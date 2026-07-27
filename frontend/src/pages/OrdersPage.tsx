import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/data-table/DataTable";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { StaffCreateOrderPanel } from "../components/StaffCreateOrderPanel";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import {
  canCreateStaffOrder,
} from "../lib/employee-position";
import { formatPhpDisplay } from "../lib/format-php";
import { isOrderOpenForStaffUpdates } from "../lib/order-assignment";
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
  assignedToName: string | null;
  createdAt: string;
};

type SalesAssociateOption = {
  id: string;
  displayName: string;
};

type OrdersTab = "all" | "create";

const LEAVE_TAB_MSG =
  "You have unsaved changes to this order. Switch tabs anyway?";

const formFieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const formLabelClass =
  "block text-sm font-medium text-slate-700 dark:text-slate-300";

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
  columnHelper.accessor("assignedToName", {
    id: "assignedToName",
    header: "Assigned to",
    cell: ({ getValue }) => (
      <span className="text-slate-700 dark:text-slate-300">
        {getValue()?.trim() || "—"}
      </span>
    ),
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
  const { token, user } = usePortalAuth();
  const assignModalTitleId = useId();
  const [tab, setTab] = useState<OrdersTab>("all");
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabLeaveOpen, setTabLeaveOpen] = useState(false);
  const [pendingOrdersTab, setPendingOrdersTab] = useState<OrdersTab | null>(
    null,
  );
  const [createFormDirty, setCreateFormDirty] = useState(false);
  const [orderSelectedIds, setOrderSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [salesAssociates, setSalesAssociates] = useState<
    SalesAssociateOption[]
  >([]);
  const [associatesLoading, setAssociatesLoading] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const mayCreateOrder = canCreateStaffOrder(
    Boolean(user?.isAdmin),
    user?.employee?.position,
  );

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

  const toggleOrderRow = useCallback((id: string, selected: boolean) => {
    setOrderSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleOrderPage = useCallback((ids: string[], selected: boolean) => {
    setOrderSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const ordersRowSelection = useMemo(
    () => ({
      selectedIds: orderSelectedIds,
      onToggleRow: toggleOrderRow,
      onTogglePage: toggleOrderPage,
      isRowSelectable: (r: OrderRow) =>
        isOrderOpenForStaffUpdates(r.status),
    }),
    [orderSelectedIds, toggleOrderRow, toggleOrderPage],
  );

  const openAssignModal = useCallback(async () => {
    if (!token) return;
    setAssignError(null);
    setAssignEmployeeId("");
    setAssignModalOpen(true);
    setAssociatesLoading(true);
    try {
      const res = await apiFetch("/api/orders/sales-associates", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as SalesAssociateOption[];
      setSalesAssociates(data);
    } catch (e) {
      setAssignError(
        e instanceof Error ? e.message : "Failed to load sales associates",
      );
      setSalesAssociates([]);
    } finally {
      setAssociatesLoading(false);
    }
  }, [token]);

  const submitAssignSalesAssociate = useCallback(async () => {
    if (!token) return;
    if (!assignEmployeeId.trim()) {
      setAssignError("Select a sales associate.");
      return;
    }
    if (orderSelectedIds.size === 0) return;
    setAssignBusy(true);
    setAssignError(null);
    try {
      const res = await apiFetch(
        "/api/orders/batch-assign-sales-associate",
        {
          method: "POST",
          body: JSON.stringify({
            orderIds: [...orderSelectedIds],
            employeeId: assignEmployeeId.trim(),
          }),
        },
        token,
      );
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = (await res.json()) as { message?: string | string[] };
          if (Array.isArray(j.message)) msg = j.message.join("; ");
          else if (typeof j.message === "string") msg = j.message;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      setAssignModalOpen(false);
      setOrderSelectedIds(new Set());
      await load();
    } catch (e) {
      setAssignError(
        e instanceof Error ? e.message : "Could not assign sales associate",
      );
    } finally {
      setAssignBusy(false);
    }
  }, [token, assignEmployeeId, orderSelectedIds, load]);

  const requestTab = (next: OrdersTab) => {
    if (next === "create" && !mayCreateOrder) return;
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
        {mayCreateOrder ? (
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
        ) : null}
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
            paginationItemLabel="orders"
            rowSelection={ordersRowSelection}
            toolbarRight={
              orderSelectedIds.size > 0 ? (
                <button
                  type="button"
                  onClick={() => void openAssignModal()}
                  className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
                >
                  Assign to Sales Associate ({orderSelectedIds.size})
                </button>
              ) : null
            }
          />

          {assignModalOpen && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={assignModalTitleId}
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/50"
                    aria-label="Close"
                    disabled={assignBusy}
                    onClick={() => !assignBusy && setAssignModalOpen(false)}
                  />
                  <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <h2
                      id={assignModalTitleId}
                      className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                    >
                      Assign to sales associate
                    </h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {orderSelectedIds.size} order
                      {orderSelectedIds.size === 1 ? "" : "s"} selected.
                    </p>
                    <label
                      className={`${formLabelClass} mt-4`}
                      htmlFor="assign-sales-associate-select"
                    >
                      Sales associate
                    </label>
                    <select
                      id="assign-sales-associate-select"
                      className={formFieldClass}
                      value={assignEmployeeId}
                      onChange={(e) => setAssignEmployeeId(e.target.value)}
                      disabled={assignBusy || associatesLoading}
                    >
                      <option value="">
                        {associatesLoading
                          ? "Loading…"
                          : "Select sales associate"}
                      </option>
                      {salesAssociates.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.displayName}
                        </option>
                      ))}
                    </select>
                    {assignError ? (
                      <p className="mt-3 text-sm text-red-700 dark:text-red-300">
                        {assignError}
                      </p>
                    ) : null}
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                        disabled={assignBusy}
                        onClick={() => setAssignModalOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
                        disabled={assignBusy || associatesLoading}
                        onClick={() => void submitAssignSalesAssociate()}
                      >
                        {assignBusy ? "Assigning…" : "Assign"}
                      </button>
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}
        </section>
      )}

      {tab === "create" && mayCreateOrder && (
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
