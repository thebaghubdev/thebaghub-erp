import { createColumnHelper } from "@tanstack/react-table";
import { format } from "date-fns";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DataTable } from "../components/data-table/DataTable";
import { DatePickerField } from "../components/DatePickerField";
import {
  PhotoshootCalendar,
  type PhotoshootCalendarRow,
} from "../components/PhotoshootCalendar";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { isPhotographerPosition } from "../lib/employee-position";
import { useFeatureAccess } from "../lib/use-feature-access";

type PhotoshootTab = "calendar" | "scheduling";

const FOR_PHOTOSHOOT_STATUS = "For Photoshoot";

type InventoryRow = {
  id: string;
  sku: string;
  inquiryId: string | null;
  consignorName: string | null;
  status: string;
  itemLabel: string;
  inclusions: string;
};

/** `YYYY-MM-DD` → readable string without UTC shift. */
function formatPhotoshootDateCell(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  return format(
    new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
    "MMM d, yyyy",
  );
}

type PhotoshootSchedulingRow = InventoryRow & {
  /** Formatted photoshoot date from `item_photoshoot` for display/search; empty when none. */
  photoshootDateLabel: string;
  assignedToName: string;
};

type PhotographerOption = {
  id: string;
  displayName: string;
};

const formFieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const formLabelClass =
  "block text-sm font-medium text-slate-700 dark:text-slate-300";

const fieldLabel =
  "block text-sm font-medium text-slate-700 dark:text-slate-300";

const dateTriggerClass =
  "mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-950";

const schedulingColumnHelper = createColumnHelper<PhotoshootSchedulingRow>();
const calendarColumnHelper = createColumnHelper<PhotoshootCalendarRow>();

const photoshootColumns = [
  schedulingColumnHelper.accessor("sku", {
    header: "SKU",
    cell: ({ getValue }) => (
      <span className="break-all font-mono text-[0.65rem] leading-snug text-slate-900 sm:text-xs dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  schedulingColumnHelper.accessor("photoshootDateLabel", {
    id: "photoshootDate",
    header: "Photoshoot date",
    cell: ({ getValue }) => {
      const v = getValue();
      if (!v) {
        return (
          <span className="text-slate-400 dark:text-slate-500">—</span>
        );
      }
      return (
        <span className="whitespace-normal text-slate-800 dark:text-slate-200">
          {v}
        </span>
      );
    },
  }),
  schedulingColumnHelper.accessor("assignedToName", {
    id: "assignedToName",
    header: "Assigned to",
    cell: ({ getValue }) => (
      <span className="text-slate-700 dark:text-slate-300">
        {getValue()?.trim() || "—"}
      </span>
    ),
  }),
  schedulingColumnHelper.accessor("status", {
    header: "Status",
    cell: ({ row }) => (
      <InventoryStatusBadge status={row.original.status} />
    ),
  }),
  schedulingColumnHelper.accessor("itemLabel", {
    header: "Item",
    cell: ({ getValue }) => (
      <span className="break-words text-slate-800 dark:text-slate-200">
        {getValue()}
      </span>
    ),
  }),
  schedulingColumnHelper.accessor("inclusions", {
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
  schedulingColumnHelper.accessor("consignorName", {
    header: "Consignor",
    cell: ({ getValue }) => (
      <span className="break-words font-medium text-slate-900 dark:text-slate-100">
        {getValue() ?? "—"}
      </span>
    ),
  }),
];

const calendarAssignColumns = [
  calendarColumnHelper.accessor("sku", {
    header: "SKU",
    cell: ({ getValue }) => (
      <span className="break-all font-mono text-[0.65rem] leading-snug text-slate-900 sm:text-xs dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  calendarColumnHelper.accessor("photoshootDate", {
    header: "Photoshoot date",
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap text-slate-800 dark:text-slate-200">
        {formatPhotoshootDateCell(getValue())}
      </span>
    ),
  }),
  calendarColumnHelper.accessor("assignedToName", {
    header: "Assigned to",
    cell: ({ getValue }) => (
      <span className="text-slate-700 dark:text-slate-300">
        {getValue()?.trim() || "—"}
      </span>
    ),
  }),
  calendarColumnHelper.accessor("itemLabel", {
    header: "Item",
    cell: ({ getValue }) => (
      <span className="break-words text-slate-800 dark:text-slate-200">
        {getValue()}
      </span>
    ),
  }),
];

async function readApiErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    const m = body.message;
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m.join(", ");
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export function PhotoshootPage() {
  const [tab, setTab] = useState<PhotoshootTab>("calendar");
  const scheduleDateId = useId();
  const { token, user } = usePortalAuth();
  const { canEdit, readOnly } = useFeatureAccess("photoshoot");
  const photoshootAssignment = useFeatureAccess("photoshoot-assignment");
  const canAssignToOthers = photoshootAssignment.canEdit;
  const canSelfAssign = isPhotographerPosition(user?.employee?.position);
  const showAssignUi = canEdit && (canAssignToOthers || canSelfAssign);
  const assignModalTitleId = useId();
  const canSchedule =
    !readOnly && !isPhotographerPosition(user?.employee?.position);
  const [scheduleDate, setScheduleDate] = useState("");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const [calendarRows, setCalendarRows] = useState<PhotoshootCalendarRow[]>(
    [],
  );
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [assignSelectedIds, setAssignSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [photographers, setPhotographers] = useState<PhotographerOption[]>([]);
  const [photographersLoading, setPhotographersLoading] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const loadPhotoshoots = useCallback(async () => {
    if (!token) return;
    setCalendarError(null);
    setCalendarLoading(true);
    try {
      const res = await apiFetch("/api/inventory/item-photoshoots", {}, token);
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as PhotoshootCalendarRow[];
      setCalendarRows(data);
    } catch (e) {
      setCalendarError(
        e instanceof Error ? e.message : "Failed to load photoshoot schedule",
      );
      setCalendarRows([]);
    } finally {
      setCalendarLoading(false);
    }
  }, [token]);

  const loadInventory = useCallback(async () => {
    if (!token) return;
    setInventoryError(null);
    setInventoryLoading(true);
    try {
      const res = await apiFetch("/api/inventory", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as InventoryRow[];
      setRows(data);
    } catch (e) {
      setInventoryError(
        e instanceof Error ? e.message : "Failed to load inventory",
      );
      setRows([]);
    } finally {
      setInventoryLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!canSchedule && tab === "scheduling") {
      setTab("calendar");
    }
  }, [canSchedule, tab]);

  useEffect(() => {
    if (tab !== "calendar" && tab !== "scheduling") return;
    void loadPhotoshoots();
  }, [tab, loadPhotoshoots]);

  useEffect(() => {
    if (tab !== "scheduling") return;
    void loadInventory();
  }, [tab, loadInventory]);

  const photoshootDateByInventoryId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of calendarRows) {
      m.set(r.inventoryItemId, r.photoshootDate);
    }
    return m;
  }, [calendarRows]);

  const assignedNameByInventoryId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of calendarRows) {
      m.set(r.inventoryItemId, r.assignedToName?.trim() ?? "");
    }
    return m;
  }, [calendarRows]);

  const photoshootRows = useMemo((): PhotoshootSchedulingRow[] => {
    return rows
      .filter((r) => r.status === FOR_PHOTOSHOOT_STATUS)
      .map((r) => {
        const iso = photoshootDateByInventoryId.get(r.id);
        const photoshootDateLabel =
          iso === undefined ? "" : formatPhotoshootDateCell(iso);
        return {
          ...r,
          photoshootDateLabel,
          assignedToName: assignedNameByInventoryId.get(r.id) ?? "",
        };
      });
  }, [rows, photoshootDateByInventoryId, assignedNameByInventoryId]);

  const onToggleRow = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const onTogglePage = useCallback((ids: string[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const toggleAssignRow = useCallback((id: string, selected: boolean) => {
    setAssignSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAssignPage = useCallback((ids: string[], selected: boolean) => {
    setAssignSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const assignRowSelection = useMemo(
    () => ({
      selectedIds: assignSelectedIds,
      onToggleRow: toggleAssignRow,
      onTogglePage: toggleAssignPage,
    }),
    [assignSelectedIds, toggleAssignRow, toggleAssignPage],
  );

  const openAssignModal = useCallback(async () => {
    if (!canEdit || !token) return;
    setAssignError(null);
    setAssignEmployeeId("");
    setAssignModalOpen(true);
    setPhotographersLoading(true);
    try {
      const res = await apiFetch("/api/inventory/photographers", {}, token);
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as PhotographerOption[];
      setPhotographers(data);
    } catch (e) {
      setAssignError(
        e instanceof Error ? e.message : "Failed to load photographers",
      );
      setPhotographers([]);
    } finally {
      setPhotographersLoading(false);
    }
  }, [canEdit, token]);

  const submitAssignPhotographer = useCallback(
    async (employeeId: string) => {
      if (!canEdit || !token) return;
      if (!employeeId.trim()) {
        setAssignError("Select a photographer.");
        return;
      }
      if (assignSelectedIds.size === 0) return;
      setAssignBusy(true);
      setAssignError(null);
      try {
        const res = await apiFetch(
          "/api/inventory/batch-assign-photographer",
          {
            method: "POST",
            body: JSON.stringify({
              photoshootIds: [...assignSelectedIds],
              employeeId: employeeId.trim(),
            }),
          },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        setAssignModalOpen(false);
        setAssignSelectedIds(new Set());
        await loadPhotoshoots();
      } catch (e) {
        setAssignError(
          e instanceof Error ? e.message : "Could not assign photographer",
        );
      } finally {
        setAssignBusy(false);
      }
    },
    [canEdit, token, assignSelectedIds, loadPhotoshoots],
  );

  const assignSelectedToSelf = useCallback(async () => {
    const myId = user?.employee?.id?.trim();
    if (!myId) {
      setAssignError("Your account is not linked to an employee record.");
      return;
    }
    await submitAssignPhotographer(myId);
  }, [user?.employee?.id, submitAssignPhotographer]);

  const onAssignToolbarClick = useCallback(() => {
    if (canAssignToOthers) {
      void openAssignModal();
      return;
    }
    void assignSelectedToSelf();
  }, [canAssignToOthers, openAssignModal, assignSelectedToSelf]);

  const showCreate =
    canSchedule && Boolean(scheduleDate.trim()) && selectedIds.size > 0;

  const handleCreate = async () => {
    if (
      !canSchedule ||
      !canEdit ||
      !token ||
      !scheduleDate.trim() ||
      selectedIds.size === 0
    )
      return;
    setCreateError(null);
    setCreateSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/inventory/item-photoshoots",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoshootDate: scheduleDate.trim().slice(0, 10),
            inventoryItemIds: [...selectedIds],
          }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      setSelectedIds(new Set());
      setScheduleDate("");
      setTab("calendar");
      void loadPhotoshoots();
      void loadInventory();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const tabBtn =
    "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

  return (
    <div className="w-full min-w-0">
      {readOnly ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          You have view-only access to this feature.
        </p>
      ) : null}
      <div
        className="mb-6 flex items-end gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Photoshoot sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "calendar"}
          id="tab-photoshoot-calendar"
          aria-controls="panel-photoshoot-calendar"
          className={`${tabBtn} ${
            tab === "calendar"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => setTab("calendar")}
        >
          Photoshoot Calendar
        </button>
        {canSchedule ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "scheduling"}
            id="tab-photoshoot-scheduling"
            aria-controls="panel-photoshoot-scheduling"
            className={`${tabBtn} ${
              tab === "scheduling"
                ? "border-violet-600 text-violet-700 dark:text-violet-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
            onClick={() => setTab("scheduling")}
          >
            Scheduling
          </button>
        ) : null}
      </div>

      {tab === "calendar" && (
        <section
          id="panel-photoshoot-calendar"
          role="tabpanel"
          aria-labelledby="tab-photoshoot-calendar"
          className="min-h-[12rem]"
        >
          {calendarError ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {calendarError}
            </p>
          ) : null}
          {!assignModalOpen && assignError ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {assignError}
            </p>
          ) : null}
          <PhotoshootCalendar
            rows={calendarRows}
            isLoading={calendarLoading}
          />
          {showAssignUi ? (
            <div className="mt-8">
              <DataTable
                data={calendarRows}
                columns={calendarAssignColumns}
                tableId="portal.photoshoot.assign"
                isLoading={calendarLoading}
                emptyMessage="No scheduled photoshoots to assign."
                hideEmptyState={!!calendarError}
                searchPlaceholder="Search SKU, date, assigned photographer, item…"
                getRowId={(r) => r.id}
                getRowAriaLabel={(r) =>
                  `Photoshoot ${r.sku}, ${r.itemLabel}`
                }
                rowSelection={assignRowSelection}
                toolbarRight={
                  assignSelectedIds.size > 0 ? (
                    <button
                      type="button"
                      onClick={onAssignToolbarClick}
                      disabled={assignBusy}
                      className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
                    >
                      {assignBusy
                        ? "Assigning…"
                        : canAssignToOthers
                          ? `Assign to Photographer (${assignSelectedIds.size})`
                          : `Assign to me (${assignSelectedIds.size})`}
                    </button>
                  ) : null
                }
              />
            </div>
          ) : null}
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
                      Assign to photographer
                    </h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {assignSelectedIds.size} photoshoot
                      {assignSelectedIds.size === 1 ? "" : "s"} selected.
                    </p>
                    <label
                      className={`${formLabelClass} mt-4`}
                      htmlFor="assign-photographer-select"
                    >
                      Photographer
                    </label>
                    <select
                      id="assign-photographer-select"
                      className={formFieldClass}
                      value={assignEmployeeId}
                      onChange={(e) => setAssignEmployeeId(e.target.value)}
                      disabled={assignBusy || photographersLoading}
                    >
                      <option value="">
                        {photographersLoading
                          ? "Loading…"
                          : "Select photographer"}
                      </option>
                      {photographers.map((a) => (
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
                        disabled={assignBusy || photographersLoading}
                        onClick={() =>
                          void submitAssignPhotographer(assignEmployeeId)
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

      {tab === "scheduling" && canSchedule && (
        <section
          id="panel-photoshoot-scheduling"
          role="tabpanel"
          aria-labelledby="tab-photoshoot-scheduling"
          className="min-h-[12rem] space-y-6"
        >
          <div className="max-w-xs">
            <label htmlFor={scheduleDateId} className={fieldLabel}>
              Select schedule
            </label>
            <DatePickerField
              id={scheduleDateId}
              value={scheduleDate}
              onChange={setScheduleDate}
              triggerClassName={dateTriggerClass}
              placeholder="Select schedule"
              dialogAriaLabel="Choose schedule date"
              disablePast
            />
          </div>

          {inventoryError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {inventoryError}
            </p>
          ) : null}

          <DataTable
            data={photoshootRows}
            columns={photoshootColumns}
            tableId="portal.photoshoot"
            isLoading={inventoryLoading}
            emptyMessage="No inventory items with status For Photoshoot."
            hideEmptyState={!!inventoryError}
            searchPlaceholder="Search SKU, photoshoot date, item, inclusions, consignor…"
            getRowId={(r) => r.id}
            getRowAriaLabel={(r) => `Inventory item ${r.sku}, ${r.itemLabel}`}
            rowSelection={{
              selectedIds,
              onToggleRow,
              onTogglePage,
            }}
          />

          {createError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {createError}
            </p>
          ) : null}

          {showCreate ? (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={createSubmitting}
                onClick={() => void handleCreate()}
              >
                Create
              </button>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
