import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { DataTable } from "../components/data-table/DataTable";
import { DatePickerField } from "../components/DatePickerField";
import {
  PhotoshootCalendar,
  type PhotoshootCalendarRow,
} from "../components/PhotoshootCalendar";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";

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

const fieldLabel =
  "block text-sm font-medium text-slate-700 dark:text-slate-300";

const dateTriggerClass =
  "mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-950";

const columnHelper = createColumnHelper<InventoryRow>();

const photoshootColumns = [
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
  columnHelper.accessor("consignorName", {
    header: "Consignor",
    cell: ({ getValue }) => (
      <span className="break-words font-medium text-slate-900 dark:text-slate-100">
        {getValue() ?? "—"}
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
  const { token } = usePortalAuth();
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
    if (tab !== "calendar") return;
    void loadPhotoshoots();
  }, [tab, loadPhotoshoots]);

  useEffect(() => {
    if (tab !== "scheduling") return;
    void loadInventory();
  }, [tab, loadInventory]);

  const photoshootRows = useMemo(
    () => rows.filter((r) => r.status === FOR_PHOTOSHOOT_STATUS),
    [rows],
  );

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

  const showCreate = Boolean(scheduleDate.trim()) && selectedIds.size > 0;

  const handleCreate = async () => {
    if (!token || !scheduleDate.trim() || selectedIds.size === 0) return;
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
          <PhotoshootCalendar
            rows={calendarRows}
            isLoading={calendarLoading}
          />
        </section>
      )}

      {tab === "scheduling" && (
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
            isLoading={inventoryLoading}
            emptyMessage="No inventory items with status For Photoshoot."
            hideEmptyState={!!inventoryError}
            searchPlaceholder="Search SKU, item, inclusions, consignor…"
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
