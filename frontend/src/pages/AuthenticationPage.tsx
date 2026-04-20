import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/data-table/DataTable";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { formatOfferTransactionLabel } from "../lib/format-offer-transaction-type";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { ItemAuthenticationStatusBadge } from "../components/ItemAuthenticationStatusBadge";

const FOR_AUTHENTICATION_STATUS = "For Authentication";
const FOR_PHOTOSHOOT_STATUS = "For Photoshoot";

const AUTHENTICATE_ITEMS_QUEUE_STATUSES = new Set([
  FOR_AUTHENTICATION_STATUS,
  FOR_PHOTOSHOOT_STATUS,
]);

const ITEM_CATEGORIES_KEY = "item_categories";
const BRANDS_WE_CONSIGN_KEY = "brands_we_consign";

type SettingApiRow = {
  key: string;
  type: string;
  value: string;
};

function parseStringArraySetting(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

type CreateMetricForm = {
  category: string;
  metricCategory: string;
  metric: string;
  description: string;
  type: "default" | "custom";
  brand: string;
  model: string;
};

function emptyCreateForm(cats: string[], brs: string[]): CreateMetricForm {
  return {
    category: cats[0] ?? "",
    metricCategory: "",
    metric: "",
    description: "",
    type: "default",
    brand: brs[0] ?? "",
    model: "",
  };
}

const formFieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const formLabelClass =
  "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

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

type AuthenticationMetricRow = {
  id: string;
  category: string;
  metricCategory: string;
  metric: string;
  description: string | null;
  isCustom: boolean;
  brand: string | null;
  model: string | null;
};

type AuthenticationTab = "items" | "metrics";

type AuthenticatorOption = {
  id: string;
  displayName: string;
};

const columnHelper = createColumnHelper<InventoryRow>();
const metricColumnHelper = createColumnHelper<AuthenticationMetricRow>();

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
  columnHelper.accessor("status", {
    header: "Item status",
    cell: ({ getValue }) => (
      <span className="min-w-0 break-words">
        <InventoryStatusBadge status={getValue()} />
      </span>
    ),
  }),
  columnHelper.accessor("dateReceived", {
    header: "Date received",
    cell: ({ getValue }) => <SubmittedAtCell iso={getValue()} />,
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
  columnHelper.accessor("assignedToName", {
    id: "assignedToName",
    header: "Assigned to",
    cell: ({ getValue }) => (
      <span className="break-words text-slate-700 dark:text-slate-300">
        {getValue() ?? "—"}
      </span>
    ),
  }),
  columnHelper.accessor("authenticationStatus", {
    header: "Authentication status",
    cell: ({ getValue }) => (
      <span className="min-w-0 break-words">
        <ItemAuthenticationStatusBadge status={getValue()} />
      </span>
    ),
  }),
];

const authenticationMetricsColumns = [
  metricColumnHelper.accessor("category", {
    header: "Category",
    cell: ({ getValue }) => (
      <span className="break-words font-medium text-slate-900 dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  metricColumnHelper.accessor("metricCategory", {
    header: "Metric category",
    cell: ({ getValue }) => (
      <span className="break-words text-slate-800 dark:text-slate-200">
        {getValue()}
      </span>
    ),
  }),
  metricColumnHelper.accessor("metric", {
    header: "Metric",
    cell: ({ getValue }) => (
      <span className="break-words text-slate-800 dark:text-slate-200">
        {getValue()}
      </span>
    ),
  }),
  metricColumnHelper.accessor("description", {
    header: "Description",
    cell: ({ getValue }) => (
      <span className="max-w-[28rem] whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">
        {getValue() ?? "—"}
      </span>
    ),
  }),
  metricColumnHelper.accessor("isCustom", {
    header: "Type",
    cell: ({ getValue }) => (
      <span className="text-slate-700 dark:text-slate-300">
        {getValue() ? "Custom" : "Default"}
      </span>
    ),
  }),
  metricColumnHelper.accessor("brand", {
    header: "Brand",
    cell: ({ getValue }) => (
      <span className="break-words text-slate-800 dark:text-slate-200">
        {getValue() ?? "—"}
      </span>
    ),
  }),
  metricColumnHelper.accessor("model", {
    header: "Model",
    cell: ({ getValue }) => (
      <span className="break-words text-slate-800 dark:text-slate-200">
        {getValue() ?? "—"}
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
  const [metricRows, setMetricRows] = useState<AuthenticationMetricRow[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metricSelectedIds, setMetricSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deleteMetricsOpen, setDeleteMetricsOpen] = useState(false);
  const [deleteMetricsBusy, setDeleteMetricsBusy] = useState(false);
  const [deleteMetricsError, setDeleteMetricsError] = useState<string | null>(
    null,
  );

  const [itemCategories, setItemCategories] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [picklistsError, setPicklistsError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateMetricForm>(() =>
    emptyCreateForm([], []),
  );
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createModalTitleId = useId();

  const [authItemSelectedIds, setAuthItemSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [authenticators, setAuthenticators] = useState<AuthenticatorOption[]>(
    [],
  );
  const [authenticatorsLoading, setAuthenticatorsLoading] = useState(false);
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const assignModalTitleId = useId();

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

  const loadMetrics = useCallback(async () => {
    if (!token) return;
    setMetricsError(null);
    setMetricsLoading(true);
    try {
      const res = await apiFetch("/api/authentication-metrics", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as AuthenticationMetricRow[];
      setMetricRows(data);
    } catch (e) {
      setMetricsError(
        e instanceof Error
          ? e.message
          : "Failed to load authentication metrics",
      );
      setMetricRows([]);
    } finally {
      setMetricsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === "items") void load();
  }, [tab, load]);

  useEffect(() => {
    if (tab === "metrics") void loadMetrics();
  }, [tab, loadMetrics]);

  useEffect(() => {
    if (tab !== "metrics" || !token) return;
    let cancelled = false;
    void (async () => {
      setPicklistsError(null);
      try {
        const res = await apiFetch("/api/settings", {}, token);
        if (!res.ok) throw new Error(`Could not load settings (${res.status})`);
        const rows = (await res.json()) as SettingApiRow[];
        if (cancelled) return;
        const catRow = rows.find((r) => r.key === ITEM_CATEGORIES_KEY);
        const brandRow = rows.find((r) => r.key === BRANDS_WE_CONSIGN_KEY);
        setItemCategories(
          catRow?.type === "string[]"
            ? parseStringArraySetting(catRow.value)
            : [],
        );
        setBrands(
          brandRow?.type === "string[]"
            ? parseStringArraySetting(brandRow.value)
            : [],
        );
      } catch (e) {
        if (!cancelled) {
          setItemCategories([]);
          setBrands([]);
          setPicklistsError(
            e instanceof Error ? e.message : "Failed to load form options",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, token]);

  useEffect(() => {
    if (tab !== "metrics") setMetricSelectedIds(new Set());
  }, [tab]);

  useEffect(() => {
    if (tab !== "items") setAuthItemSelectedIds(new Set());
  }, [tab]);

  useEffect(() => {
    setAuthItemSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const byId = new Map(allRows.map((r) => [r.id, r]));
      const next = new Set<string>();
      for (const id of prev) {
        const r = byId.get(id);
        if (r && r.status === FOR_AUTHENTICATION_STATUS) next.add(id);
      }
      if (next.size === prev.size && [...prev].every((id) => next.has(id))) {
        return prev;
      }
      return next;
    });
  }, [allRows]);

  useEffect(() => {
    if (!createModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !createBusy) setCreateModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createModalOpen, createBusy]);

  useEffect(() => {
    if (!createModalOpen || itemCategories.length === 0) return;
    setCreateForm((f) =>
      f.category && itemCategories.includes(f.category)
        ? f
        : { ...f, category: itemCategories[0] ?? "" },
    );
  }, [createModalOpen, itemCategories]);

  useEffect(() => {
    if (!createModalOpen || createForm.type !== "custom" || brands.length === 0)
      return;
    setCreateForm((f) =>
      f.brand && brands.includes(f.brand)
        ? f
        : { ...f, brand: brands[0] ?? "" },
    );
  }, [createModalOpen, createForm.type, brands]);

  useEffect(() => {
    if (metricSelectedIds.size === 0 && deleteMetricsOpen) {
      setDeleteMetricsOpen(false);
      setDeleteMetricsError(null);
    }
  }, [metricSelectedIds.size, deleteMetricsOpen]);

  useEffect(() => {
    if (!assignModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !assignBusy) setAssignModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assignModalOpen, assignBusy]);

  const toggleAuthItemRow = useCallback((id: string, selected: boolean) => {
    setAuthItemSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAuthItemPage = useCallback((ids: string[], selected: boolean) => {
    setAuthItemSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const authItemsRowSelection = useMemo(
    () => ({
      selectedIds: authItemSelectedIds,
      onToggleRow: toggleAuthItemRow,
      onTogglePage: toggleAuthItemPage,
      isRowSelectable: (r: InventoryRow) =>
        r.status === FOR_AUTHENTICATION_STATUS,
    }),
    [authItemSelectedIds, toggleAuthItemRow, toggleAuthItemPage],
  );

  const openAssignModal = useCallback(async () => {
    if (!token) return;
    setAssignError(null);
    setAssignEmployeeId("");
    setAssignModalOpen(true);
    setAuthenticatorsLoading(true);
    try {
      const res = await apiFetch("/api/inventory/authenticators", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as AuthenticatorOption[];
      setAuthenticators(data);
    } catch (e) {
      setAssignError(
        e instanceof Error ? e.message : "Failed to load authenticators",
      );
      setAuthenticators([]);
    } finally {
      setAuthenticatorsLoading(false);
    }
  }, [token]);

  const submitAssignAuthenticator = useCallback(async () => {
    if (!token) return;
    if (!assignEmployeeId.trim()) {
      setAssignError("Select an authenticator.");
      return;
    }
    if (authItemSelectedIds.size === 0) return;
    setAssignBusy(true);
    setAssignError(null);
    try {
      const res = await apiFetch(
        "/api/inventory/batch-assign-authenticator",
        {
          method: "POST",
          body: JSON.stringify({
            inventoryItemIds: [...authItemSelectedIds],
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
      setAuthItemSelectedIds(new Set());
      await load();
    } catch (e) {
      setAssignError(
        e instanceof Error ? e.message : "Could not assign authenticator",
      );
    } finally {
      setAssignBusy(false);
    }
  }, [token, assignEmployeeId, authItemSelectedIds, load]);

  const toggleMetricRow = useCallback((id: string, selected: boolean) => {
    setMetricSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleMetricPage = useCallback((ids: string[], selected: boolean) => {
    setMetricSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const metricsRowSelection = useMemo(
    () => ({
      selectedIds: metricSelectedIds,
      onToggleRow: toggleMetricRow,
      onTogglePage: toggleMetricPage,
    }),
    [metricSelectedIds, toggleMetricRow, toggleMetricPage],
  );

  const deleteSelectedMetrics = useCallback(async () => {
    if (!token || metricSelectedIds.size === 0) return;
    setDeleteMetricsBusy(true);
    setDeleteMetricsError(null);
    try {
      const res = await apiFetch(
        "/api/authentication-metrics/soft-delete",
        {
          method: "POST",
          body: JSON.stringify({ ids: [...metricSelectedIds] }),
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
      setMetricSelectedIds(new Set());
      setDeleteMetricsOpen(false);
      await loadMetrics();
    } catch (e) {
      setDeleteMetricsError(
        e instanceof Error ? e.message : "Failed to delete metrics",
      );
    } finally {
      setDeleteMetricsBusy(false);
    }
  }, [token, metricSelectedIds, loadMetrics]);

  const openCreateModal = useCallback(() => {
    setCreateForm(emptyCreateForm(itemCategories, brands));
    setCreateError(null);
    setCreateModalOpen(true);
  }, [itemCategories, brands]);

  const submitCreateMetric = useCallback(async () => {
    if (!token) return;
    const cat = createForm.category.trim();
    const mc = createForm.metricCategory.trim();
    const m = createForm.metric.trim();
    if (!cat || !mc || !m) {
      setCreateError("Category, metric category, and metric are required.");
      return;
    }
    if (itemCategories.length === 0) {
      setCreateError(
        "No item categories are configured in settings. Add categories first.",
      );
      return;
    }
    if (createForm.type === "custom" && brands.length === 0) {
      setCreateError(
        "No brands are configured in settings. Add brands or choose Default type.",
      );
      return;
    }
    if (createForm.type === "custom" && !createForm.brand.trim()) {
      setCreateError("Brand is required for custom metrics.");
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        category: cat,
        metricCategory: mc,
        metric: m,
        description: createForm.description.trim() || null,
        isCustom: createForm.type === "custom",
      };
      if (createForm.type === "custom") {
        body.brand = createForm.brand.trim();
        body.model =
          createForm.model.trim() === "" ? null : createForm.model.trim();
      }
      const res = await apiFetch(
        "/api/authentication-metrics",
        {
          method: "POST",
          body: JSON.stringify(body),
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
      setCreateModalOpen(false);
      await loadMetrics();
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : "Failed to create metric",
      );
    } finally {
      setCreateBusy(false);
    }
  }, [token, createForm, loadMetrics, itemCategories.length, brands.length]);

  const rows = useMemo(
    () => allRows.filter((r) => AUTHENTICATE_ITEMS_QUEUE_STATUSES.has(r.status)),
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
            emptyMessage="No items in For Authentication or For Photoshoot."
            hideEmptyState={!!error}
            searchPlaceholder="Search items…"
            getRowId={(r) => r.id}
            onRowClick={(r) => navigate(`/portal/authentication/${r.id}`)}
            getRowAriaLabel={(r) =>
              `Authenticate inventory item ${r.sku}, ${r.itemLabel}, status ${r.status}`
            }
            tableClassName="w-full min-w-[1080px] table-fixed border-collapse text-left"
            paginationItemLabel="items"
            rowSelection={authItemsRowSelection}
            toolbarRight={
              authItemSelectedIds.size > 0 ? (
                <button
                  type="button"
                  onClick={() => void openAssignModal()}
                  className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
                >
                  Assign to Authenticator ({authItemSelectedIds.size})
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
                      Assign to authenticator
                    </h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {authItemSelectedIds.size} item
                      {authItemSelectedIds.size === 1 ? "" : "s"} selected.
                    </p>
                    <label
                      className={`${formLabelClass} mt-4`}
                      htmlFor="assign-authenticator-select"
                    >
                      Authenticator
                    </label>
                    <select
                      id="assign-authenticator-select"
                      className={formFieldClass}
                      value={assignEmployeeId}
                      onChange={(e) => setAssignEmployeeId(e.target.value)}
                      disabled={assignBusy || authenticatorsLoading}
                    >
                      <option value="">
                        {authenticatorsLoading
                          ? "Loading…"
                          : "Select authenticator"}
                      </option>
                      {authenticators.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.displayName}
                        </option>
                      ))}
                    </select>
                    {!authenticatorsLoading && authenticators.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        No employees with the Authenticator position. Set
                        position to Authenticator in Manage Accounts.
                      </p>
                    ) : null}
                    {assignError ? (
                      <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                        {assignError}
                      </p>
                    ) : null}
                    <div className="mt-5 flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                        disabled={assignBusy}
                        onClick={() => setAssignModalOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
                        disabled={
                          assignBusy ||
                          authenticatorsLoading ||
                          authenticators.length === 0
                        }
                        onClick={() => void submitAssignAuthenticator()}
                      >
                        {assignBusy ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}
        </section>
      )}

      {tab === "metrics" && (
        <section
          id="panel-auth-metrics"
          role="tabpanel"
          aria-labelledby="tab-auth-metrics"
          className="min-h-[12rem]"
        >
          {metricsError ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {metricsError}
            </p>
          ) : null}

          <DataTable<AuthenticationMetricRow>
            data={metricRows}
            columns={authenticationMetricsColumns}
            isLoading={metricsLoading}
            emptyMessage="No authentication metrics found."
            hideEmptyState={!!metricsError}
            searchPlaceholder="Search metrics…"
            getRowId={(r) => r.id}
            tableClassName="w-full min-w-[1120px] table-fixed border-collapse text-left"
            paginationItemLabel="metrics"
            rowSelection={metricsRowSelection}
            toolbarRight={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {metricSelectedIds.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteMetricsError(null);
                      setDeleteMetricsOpen(true);
                    }}
                    className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    Delete selected ({metricSelectedIds.size})
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => openCreateModal()}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  Create metric
                </button>
              </div>
            }
          />

          <ConfirmDialog
            open={deleteMetricsOpen}
            title="Delete authentication metrics?"
            description={`Are you sure you want to delete ${metricSelectedIds.size} selected metric${
              metricSelectedIds.size === 1 ? "" : "s"
            }?`}
            confirmLabel="Delete"
            cancelLabel="Cancel"
            danger
            busy={deleteMetricsBusy}
            errorMessage={deleteMetricsError}
            onCancel={() => !deleteMetricsBusy && setDeleteMetricsOpen(false)}
            onConfirm={() => void deleteSelectedMetrics()}
          />

          {createModalOpen && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={createModalTitleId}
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/50"
                    aria-label="Close"
                    disabled={createBusy}
                    onClick={() => !createBusy && setCreateModalOpen(false)}
                  />
                  <div className="relative z-10 flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <div className="shrink-0 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                      <h2
                        id={createModalTitleId}
                        className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                      >
                        Create authentication metric
                      </h2>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        New metrics are saved as custom or default per your
                        selection. Custom metrics can be tied to a brand and
                        model.
                      </p>
                    </div>
                    <form
                      className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submitCreateMetric();
                      }}
                    >
                      {picklistsError ? (
                        <p
                          className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                          role="status"
                        >
                          {picklistsError} Category and brand dropdowns may be
                          empty.
                        </p>
                      ) : null}
                      {createError ? (
                        <p
                          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                          role="alert"
                        >
                          {createError}
                        </p>
                      ) : null}
                      <div className="space-y-4">
                        <div>
                          <label className={formLabelClass} htmlFor="am-category">
                            Category
                          </label>
                          <select
                            id="am-category"
                            required
                            className={formFieldClass}
                            value={createForm.category}
                            disabled={createBusy}
                            onChange={(e) =>
                              setCreateForm((f) => ({
                                ...f,
                                category: e.target.value,
                              }))
                            }
                          >
                            {itemCategories.length === 0 ? (
                              <option value="">No categories — check settings</option>
                            ) : (
                              itemCategories.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                        <div>
                          <label
                            className={formLabelClass}
                            htmlFor="am-metric-category"
                          >
                            Metric category
                          </label>
                          <input
                            id="am-metric-category"
                            type="text"
                            required
                            className={formFieldClass}
                            value={createForm.metricCategory}
                            disabled={createBusy}
                            onChange={(e) =>
                              setCreateForm((f) => ({
                                ...f,
                                metricCategory: e.target.value,
                              }))
                            }
                            autoComplete="off"
                          />
                        </div>
                        <div>
                          <label className={formLabelClass} htmlFor="am-metric">
                            Metric
                          </label>
                          <input
                            id="am-metric"
                            type="text"
                            required
                            className={formFieldClass}
                            value={createForm.metric}
                            disabled={createBusy}
                            onChange={(e) =>
                              setCreateForm((f) => ({
                                ...f,
                                metric: e.target.value,
                              }))
                            }
                            autoComplete="off"
                          />
                        </div>
                        <div>
                          <label
                            className={formLabelClass}
                            htmlFor="am-description"
                          >
                            Description
                          </label>
                          <textarea
                            id="am-description"
                            rows={4}
                            className={`${formFieldClass} resize-y`}
                            value={createForm.description}
                            disabled={createBusy}
                            onChange={(e) =>
                              setCreateForm((f) => ({
                                ...f,
                                description: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className={formLabelClass} htmlFor="am-type">
                            Type
                          </label>
                          <select
                            id="am-type"
                            className={formFieldClass}
                            value={createForm.type}
                            disabled={createBusy}
                            onChange={(e) => {
                              const type = e.target.value as
                                | "default"
                                | "custom";
                              setCreateForm((f) => ({
                                ...f,
                                type,
                                brand:
                                  type === "custom"
                                    ? f.brand || brands[0] || ""
                                    : "",
                              }));
                            }}
                          >
                            <option value="default">Default</option>
                            <option value="custom">Custom</option>
                          </select>
                        </div>
                        {createForm.type === "custom" ? (
                          <>
                            <div>
                              <label
                                className={formLabelClass}
                                htmlFor="am-brand"
                              >
                                Brand
                              </label>
                              <select
                                id="am-brand"
                                required
                                className={formFieldClass}
                                value={createForm.brand}
                                disabled={createBusy}
                                onChange={(e) =>
                                  setCreateForm((f) => ({
                                    ...f,
                                    brand: e.target.value,
                                  }))
                                }
                              >
                                {brands.length === 0 ? (
                                  <option value="">
                                    No brands — check settings
                                  </option>
                                ) : (
                                  brands.map((b) => (
                                    <option key={b} value={b}>
                                      {b}
                                    </option>
                                  ))
                                )}
                              </select>
                            </div>
                            <div>
                              <label
                                className={formLabelClass}
                                htmlFor="am-model"
                              >
                                Model
                              </label>
                              <input
                                id="am-model"
                                type="text"
                                className={formFieldClass}
                                value={createForm.model}
                                disabled={createBusy}
                                onChange={(e) =>
                                  setCreateForm((f) => ({
                                    ...f,
                                    model: e.target.value,
                                  }))
                                }
                                autoComplete="off"
                              />
                            </div>
                          </>
                        ) : null}
                      </div>
                      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                          disabled={createBusy}
                          onClick={() => setCreateModalOpen(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                          disabled={createBusy}
                        >
                          {createBusy ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>,
                document.body,
              )
            : null}
        </section>
      )}
    </div>
  );
}
