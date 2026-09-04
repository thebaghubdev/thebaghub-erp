import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  ConsignmentInquiryCalendar,
  type ConsignmentInquiryCalendarRow,
} from "../components/ConsignmentInquiryCalendar";
import { DataTable } from "../components/data-table/DataTable";
import { StaffWalkInConsignmentWizard } from "../components/StaffWalkInConsignmentWizard";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { useFeatureAccess } from "../lib/use-feature-access";
import { InquiryStatusBadge } from "../components/InquiryStatusBadge";
import { formatOfferTransactionLabel } from "../lib/format-offer-transaction-type";
import { formatPhpDisplay } from "../lib/format-php";
import { isInquiryOpenForStaffUpdates } from "../lib/inquiry-assignment";
import { INQUIRY_STATUS_FILTER_OPTIONS } from "../lib/inquiry-status-filter-options";
import {
  picklistToFilterOptions,
  sortPicklistValues,
} from "../lib/picklist-to-filter-options";

type InquiryRow = {
  id: string;
  sku: string;
  itemLabel: string;
  status: string;
  createdAt: string;
  consignorName: string;
  brand: string;
  category: string;
  itemModel: string;
  serialNumber: string;
  condition: string;
  inclusions: string;
  consentDirectPurchase: boolean;
  offerTransactionType: "consignment" | "direct_purchase" | null;
  offerPrice: string | null;
  isWalkIn: boolean;
  contractStartDate: string | null;
  contractExpirationDate: string | null;
  assignedToName: string | null;
};

type CoordinatorOption = {
  id: string;
  displayName: string;
};

type InquiryTab = "all" | "calendar" | "create";

const LEAVE_TAB_MSG =
  "You have unsaved changes to this consignment inquiry. Switch tabs anyway?";

type ClientAccountRow = {
  id: string;
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  createdAt: string;
};

function formatConsignorSummary(c: ClientAccountRow): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  const primary = name || c.username;
  return `${primary} · ${c.email}`;
}

function yesNo(v: boolean) {
  return v ? "Yes" : "No";
}

/** Calendar display for `YYYY-MM-DD` from API (avoids UTC/local midnight shifts). */
function formatContractDateCell(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
}

const columnHelper = createColumnHelper<InquiryRow>();

const inquiryColumns = [
  columnHelper.accessor("sku", {
    header: "SKU",
    cell: ({ getValue }) => (
      <span className="break-all font-mono text-[0.65rem] leading-snug text-slate-900 sm:text-xs dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("status", {
    id: "status",
    header: "Status",
    cell: ({ row }) => <InquiryStatusBadge status={row.original.status} />,
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
  columnHelper.accessor("consignorName", {
    header: "Consignor",
    cell: ({ getValue }) => (
      <span className="break-words font-medium text-slate-900 dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor((row) => Boolean(row.isWalkIn), {
    id: "isWalkIn",
    header: () => (
      <span className="whitespace-normal leading-tight">Walk-in?</span>
    ),
    cell: ({ getValue }) => (
      <span className="block text-center text-slate-700 dark:text-slate-300">
        {yesNo(getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("brand", {
    header: "Brand",
    cell: ({ getValue }) => (
      <span className="break-words text-slate-800 dark:text-slate-200">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("category", {
    header: "Category",
    cell: ({ getValue }) => (
      <span className="break-words text-slate-800 dark:text-slate-200">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("itemModel", {
    header: "Model",
    cell: ({ getValue }) => (
      <span className="break-words text-slate-800 dark:text-slate-200">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("serialNumber", {
    header: "Serial",
    cell: ({ getValue }) => (
      <span className="break-all font-mono text-[0.7rem] text-slate-700 dark:text-slate-300">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("condition", {
    header: "Condition",
    cell: ({ row }) => (
      <span
        className="max-w-[10rem] break-words text-slate-700 dark:text-slate-300"
        title={
          row.original.condition !== "—" ? row.original.condition : undefined
        }
      >
        {row.original.condition}
      </span>
    ),
  }),
  columnHelper.accessor("inclusions", {
    header: "Inclusions",
    cell: ({ row }) => (
      <span
        className="max-w-[12rem] min-w-[7rem] whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300"
        title={
          row.original.inclusions !== "—" ? row.original.inclusions : undefined
        }
      >
        {row.original.inclusions}
      </span>
    ),
  }),
  columnHelper.accessor("contractStartDate", {
    id: "contractStartDate",
    header: () => (
      <span className="whitespace-normal leading-tight">Contract date</span>
    ),
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap text-slate-700 tabular-nums dark:text-slate-300">
        {formatContractDateCell(getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("contractExpirationDate", {
    id: "contractExpirationDate",
    header: () => (
      <span className="whitespace-normal leading-tight">
        Contract expiration
      </span>
    ),
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap text-slate-700 tabular-nums dark:text-slate-300">
        {formatContractDateCell(getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("offerPrice", {
    header: () => <span title="Staff offer price (PHP)">Offer price</span>,
    cell: ({ getValue }) => (
      <span className="tabular-nums text-slate-800 dark:text-slate-200">
        {formatPhpDisplay(getValue())}
      </span>
    ),
  }),
  columnHelper.accessor(
    (row) => formatOfferTransactionLabel(row.offerTransactionType),
    {
      id: "offerTransactionType",
      header: "Transaction type",
      cell: ({ getValue }) => (
        <span className="text-slate-700 dark:text-slate-300">{getValue()}</span>
      ),
    },
  ),
  columnHelper.accessor((row) => yesNo(row.consentDirectPurchase), {
    id: "consentDirectPurchase",
    header: () => (
      <span className="whitespace-normal leading-tight">
        Allow Direct Purchase
      </span>
    ),
    cell: ({ getValue }) => (
      <span className="block text-center text-slate-700 dark:text-slate-300">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("createdAt", {
    id: "submitted",
    header: "Submitted",
    sortingFn: "alphanumeric",
    cell: ({ row }) => (
      <span className="text-slate-600 dark:text-slate-400">
        <SubmittedAtCell iso={row.original.createdAt} />
      </span>
    ),
  }),
];

const formFieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const formLabelClass =
  "block text-sm font-medium text-slate-700 dark:text-slate-300";

export function InquiryPage() {
  const navigate = useNavigate();
  const { token, user } = usePortalAuth();
  const { canEdit, readOnly } = useFeatureAccess("inquiries");
  const inquiryAssignment = useFeatureAccess("inquiry-assignment");
  const canAssignToOthers = inquiryAssignment.canEdit;
  const assignModalTitleId = useId();
  const [tab, setTab] = useState<InquiryTab>("all");
  const [tabLeaveOpen, setTabLeaveOpen] = useState(false);
  const [pendingInquiryTab, setPendingInquiryTab] =
    useState<InquiryTab | null>(null);
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarRows, setCalendarRows] = useState<
    ConsignmentInquiryCalendarRow[]
  >([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [inquiryBrandPicklist, setInquiryBrandPicklist] = useState<string[]>(
    [],
  );
  const [inquiryCategoryPicklist, setInquiryCategoryPicklist] = useState<
    string[]
  >([]);

  const [clients, setClients] = useState<ClientAccountRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [wizardDirty, setWizardDirty] = useState(false);
  const [inquirySelectedIds, setInquirySelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [coordinators, setCoordinators] = useState<CoordinatorOption[]>([]);
  const [coordinatorsLoading, setCoordinatorsLoading] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      const ln = a.lastName.localeCompare(b.lastName);
      if (ln !== 0) return ln;
      return a.firstName.localeCompare(b.firstName);
    });
  }, [clients]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  const inquiryCategoryFilterOptions = useMemo(
    () =>
      picklistToFilterOptions([
        ...inquiryCategoryPicklist,
        ...rows.map((r) => r.category),
      ]),
    [inquiryCategoryPicklist, rows],
  );

  const loadInquiries = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/inquiries", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as InquiryRow[];
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inquiries");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === "all") void loadInquiries();
  }, [tab, loadInquiries]);

  const loadCalendar = useCallback(async () => {
    setCalendarError(null);
    setCalendarLoading(true);
    try {
      const res = await apiFetch("/api/inquiries/calendar", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as ConsignmentInquiryCalendarRow[];
      setCalendarRows(data);
    } catch (e) {
      setCalendarError(
        e instanceof Error ? e.message : "Failed to load calendar",
      );
    } finally {
      setCalendarLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === "calendar") void loadCalendar();
  }, [tab, loadCalendar]);

  useEffect(() => {
    if (tab !== "all" || !token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(
          "/api/client/consignment-form/options",
          {},
          token,
        );
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as {
          brands?: unknown;
          categories?: unknown;
        };
        const brands = Array.isArray(data.brands)
          ? sortPicklistValues(
              data.brands.filter((b): b is string => typeof b === "string"),
            )
          : [];
        const categories = Array.isArray(data.categories)
          ? data.categories.filter((c): c is string => typeof c === "string")
          : [];
        if (!cancelled) {
          setInquiryBrandPicklist(brands);
          setInquiryCategoryPicklist(categories);
        }
      } catch {
        if (!cancelled) {
          setInquiryBrandPicklist([]);
          setInquiryCategoryPicklist([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, token]);

  useEffect(() => {
    if (tab === "all") setWizardDirty(false);
  }, [tab]);

  const toggleInquiryRow = useCallback((id: string, selected: boolean) => {
    setInquirySelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleInquiryPage = useCallback((ids: string[], selected: boolean) => {
    setInquirySelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const inquiriesRowSelection = useMemo(
    () => ({
      selectedIds: inquirySelectedIds,
      onToggleRow: toggleInquiryRow,
      onTogglePage: toggleInquiryPage,
      isRowSelectable: (r: InquiryRow) => isInquiryOpenForStaffUpdates(r.status),
    }),
    [inquirySelectedIds, toggleInquiryRow, toggleInquiryPage],
  );

  const openAssignModal = useCallback(async () => {
    if (!canEdit || !token) return;
    setAssignError(null);
    setAssignEmployeeId("");
    setAssignModalOpen(true);
    setCoordinatorsLoading(true);
    try {
      const res = await apiFetch("/api/inquiries/coordinators", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as CoordinatorOption[];
      setCoordinators(data);
    } catch (e) {
      setAssignError(
        e instanceof Error ? e.message : "Failed to load coordinators",
      );
      setCoordinators([]);
    } finally {
      setCoordinatorsLoading(false);
    }
  }, [canEdit, token]);

  const submitAssignCoordinator = useCallback(
    async (employeeId: string) => {
      if (!canEdit || !token) return;
      if (!employeeId.trim()) {
        setAssignError("Select a coordinator.");
        return;
      }
      if (inquirySelectedIds.size === 0) return;
      setAssignBusy(true);
      setAssignError(null);
      try {
        const res = await apiFetch(
          "/api/inquiries/batch-assign-coordinator",
          {
            method: "POST",
            body: JSON.stringify({
              inquiryIds: [...inquirySelectedIds],
              employeeId: employeeId.trim(),
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
        setInquirySelectedIds(new Set());
        await loadInquiries();
      } catch (e) {
        setAssignError(
          e instanceof Error ? e.message : "Could not assign coordinator",
        );
      } finally {
        setAssignBusy(false);
      }
    },
    [canEdit, token, inquirySelectedIds, loadInquiries],
  );

  const assignSelectedToSelf = useCallback(async () => {
    const myId = user?.employee?.id?.trim();
    if (!myId) {
      setAssignError("Your account is not linked to an employee record.");
      return;
    }
    await submitAssignCoordinator(myId);
  }, [user?.employee?.id, submitAssignCoordinator]);

  const onAssignToolbarClick = useCallback(() => {
    if (canAssignToOthers) {
      void openAssignModal();
      return;
    }
    void assignSelectedToSelf();
  }, [canAssignToOthers, openAssignModal, assignSelectedToSelf]);

  useEffect(() => {
    if (tab !== "create" || !token) return;
    let cancelled = false;
    void (async () => {
      setClientsError(null);
      setClientsLoading(true);
      try {
        const res = await apiFetch("/api/accounts/clients", {}, token);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as ClientAccountRow[];
        if (!cancelled) setClients(data);
      } catch (e) {
        if (!cancelled) {
          setClientsError(
            e instanceof Error ? e.message : "Failed to load client accounts",
          );
          setClients([]);
        }
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, token]);

  const tabBtn =
    "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

  const consignorSelectField =
    "box-border h-11 min-h-11 w-full max-w-xl rounded-lg border border-slate-300 bg-white px-3 py-0 text-sm leading-5 text-slate-900 outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  const requestTab = (next: InquiryTab) => {
    if (next === "create" && !canEdit) return;
    if (tab === "create" && next !== "create" && wizardDirty) {
      setPendingInquiryTab(next);
      setTabLeaveOpen(true);
      return;
    }
    setTab(next);
  };

  return (
    <div className="w-full min-w-0">
      {readOnly ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          You have view-only access to this feature.
        </p>
      ) : null}
      <ConfirmDialog
        open={tabLeaveOpen}
        title="Unsaved changes"
        description={LEAVE_TAB_MSG}
        cancelLabel="Stay"
        confirmLabel="Switch tab"
        onCancel={() => {
          setTabLeaveOpen(false);
          setPendingInquiryTab(null);
        }}
        onConfirm={() => {
          if (pendingInquiryTab !== null) setTab(pendingInquiryTab);
          setTabLeaveOpen(false);
          setPendingInquiryTab(null);
        }}
      />
      <div
        className="mb-6 flex items-end gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Inquiry sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          id="tab-all"
          aria-controls="panel-all"
          className={`${tabBtn} ${
            tab === "all"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => requestTab("all")}
        >
          All Inquiries
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "calendar"}
          id="tab-calendar"
          aria-controls="panel-calendar"
          className={`${tabBtn} ${
            tab === "calendar"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => requestTab("calendar")}
        >
          Consignment Calendar
        </button>
        {!readOnly ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "create"}
            id="tab-create"
            aria-controls="panel-create"
            className={`${tabBtn} ${
              tab === "create"
                ? "border-violet-600 text-violet-700 dark:text-violet-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
            onClick={() => requestTab("create")}
          >
            Create Inquiry
          </button>
        ) : null}
      </div>

      {tab === "all" && (
        <section id="panel-all" role="tabpanel" aria-labelledby="tab-all">
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}
          {!assignModalOpen && assignError ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {assignError}
            </p>
          ) : null}

          <DataTable<InquiryRow>
            data={rows}
            columns={inquiryColumns}
            tableId="portal.inquiries"
            isLoading={loading}
            emptyMessage="No inquiries yet."
            hideEmptyState={!!error}
            brandFilterSuggestions={inquiryBrandPicklist}
            statusFilterOptions={INQUIRY_STATUS_FILTER_OPTIONS}
            categoryFilterOptions={inquiryCategoryFilterOptions}
            getRowId={(row) => row.id}
            onRowClick={(row) => navigate(`/portal/inquiries/${row.id}`)}
            getRowAriaLabel={(row) =>
              `Inquiry ${row.sku}, ${row.itemLabel || "item"}`
            }
            rowSelection={inquiriesRowSelection}
            toolbarRight={
              !readOnly && inquirySelectedIds.size > 0 ? (
                <button
                  type="button"
                  onClick={onAssignToolbarClick}
                  disabled={assignBusy}
                  className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
                >
                  {assignBusy
                    ? "Assigning…"
                    : canAssignToOthers
                      ? `Assign to Coordinator (${inquirySelectedIds.size})`
                      : `Assign to me (${inquirySelectedIds.size})`}
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
                      Assign to coordinator
                    </h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {inquirySelectedIds.size} inquir
                      {inquirySelectedIds.size === 1 ? "y" : "ies"} selected.
                    </p>
                    <label
                      className={`${formLabelClass} mt-4`}
                      htmlFor="assign-coordinator-select"
                    >
                      Coordinator
                    </label>
                    <select
                      id="assign-coordinator-select"
                      className={formFieldClass}
                      value={assignEmployeeId}
                      onChange={(e) => setAssignEmployeeId(e.target.value)}
                      disabled={assignBusy || coordinatorsLoading}
                    >
                      <option value="">
                        {coordinatorsLoading
                          ? "Loading…"
                          : "Select coordinator"}
                      </option>
                      {coordinators.map((a) => (
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
                        disabled={assignBusy || coordinatorsLoading}
                        onClick={() =>
                          void submitAssignCoordinator(assignEmployeeId)
                        }
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

      {tab === "calendar" && (
        <section
          id="panel-calendar"
          role="tabpanel"
          aria-labelledby="tab-calendar"
        >
          {calendarError && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {calendarError}
            </p>
          )}
          <ConsignmentInquiryCalendar
            rows={calendarRows}
            isLoading={calendarLoading}
          />
        </section>
      )}

      {tab === "create" && !readOnly && (
        <section
          id="panel-create"
          role="tabpanel"
          aria-labelledby="tab-create"
          className="min-h-[12rem] max-w-3xl space-y-6"
        >
          <div>
            <label
              htmlFor="walk-in-consignor"
              className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-200"
            >
              Consignor (client account)
            </label>
            <select
              id="walk-in-consignor"
              className={consignorSelectField}
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              disabled={clientsLoading || !!clientsError}
              aria-busy={clientsLoading}
            >
              <option value="">
                {clientsLoading ? "Loading clients…" : "Select a consignor…"}
              </option>
              {sortedClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatConsignorSummary(c)}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Walk-in consignments must be tied to an existing client account.
              The consignor needs to have registered in the app before you can
              create an inquiry on their behalf.
            </p>
            {clientsError && (
              <p
                className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                role="alert"
              >
                {clientsError}
              </p>
            )}
            {!clientsLoading && !clientsError && sortedClients.length === 0 && (
              <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
                No client accounts found. Register a client before recording a
                walk-in inquiry.
              </p>
            )}
          </div>

          {selectedClient && (
            <StaffWalkInConsignmentWizard
              key={selectedClient.id}
              portalToken={token}
              consignorClientId={selectedClient.id}
              onDirtyChange={setWizardDirty}
              onSubmitted={() => setTab("all")}
            />
          )}
        </section>
      )}
    </div>
  );
}
