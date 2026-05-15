import { createColumnHelper } from "@tanstack/react-table";
import { format } from "date-fns";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { DataTable } from "../components/data-table/DataTable";
import { DatePickerField } from "../components/DatePickerField";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import {
  PostingCalendar,
  type PostingCalendarRow,
} from "../components/PostingCalendar";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";

type PostingTab = "calendar" | "scheduling";

const FOR_POSTING_STATUS = "For Posting";

type InventoryRow = {
  id: string;
  sku: string;
  consignorName: string | null;
  status: string;
  itemLabel: string;
  inclusions: string;
};

type PostingSchedulingRow = InventoryRow & {
  postingDateLabel: string;
};

function formatPostingDateCell(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return format(d, "MMM d, yyyy h:mm a");
}

function combineScheduleDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function hourPeriodToTime(hourRaw: string, period: string): string {
  const hour = Number(hourRaw);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return "";
  if (period !== "AM" && period !== "PM") return "";
  const hour24 =
    period === "AM" ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;
  return `${String(hour24).padStart(2, "0")}:00`;
}

const fieldLabel =
  "block text-sm font-medium text-slate-700 dark:text-slate-300";

const dateTriggerClass =
  "mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-950";

const columnHelper = createColumnHelper<PostingSchedulingRow>();

const postingColumns = [
  columnHelper.accessor("sku", {
    header: "SKU",
    cell: ({ getValue }) => (
      <span className="break-all font-mono text-[0.65rem] leading-snug text-slate-900 sm:text-xs dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("postingDateLabel", {
    id: "postingDate",
    header: "Posting date",
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

export function PostingPage() {
  const [tab, setTab] = useState<PostingTab>("calendar");
  const scheduleDateId = useId();
  const scheduleTimeId = useId();
  const { token } = usePortalAuth();
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleHour, setScheduleHour] = useState("");
  const [schedulePeriod, setSchedulePeriod] = useState<"AM" | "PM">("AM");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const [calendarRows, setCalendarRows] = useState<PostingCalendarRow[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const loadPostings = useCallback(async () => {
    if (!token) return;
    setCalendarError(null);
    setCalendarLoading(true);
    try {
      const res = await apiFetch("/api/inventory/item-postings", {}, token);
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as PostingCalendarRow[];
      setCalendarRows(data);
    } catch (e) {
      setCalendarError(
        e instanceof Error ? e.message : "Failed to load posting schedule",
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
    if (tab !== "calendar" && tab !== "scheduling") return;
    void loadPostings();
  }, [tab, loadPostings]);

  useEffect(() => {
    if (tab !== "scheduling") return;
    void loadInventory();
  }, [tab, loadInventory]);

  const postingDateByInventoryId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of calendarRows) {
      if (r.postingDate) m.set(r.inventoryItemId, r.postingDate);
    }
    return m;
  }, [calendarRows]);

  const postingRows = useMemo((): PostingSchedulingRow[] => {
    return rows
      .filter((r) => r.status === FOR_POSTING_STATUS)
      .map((r) => {
        const iso = postingDateByInventoryId.get(r.id);
        return {
          ...r,
          postingDateLabel: iso ? formatPostingDateCell(iso) : "",
        };
      });
  }, [rows, postingDateByInventoryId]);

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

  const showSchedule =
    Boolean(scheduleDate.trim()) &&
    Boolean(hourPeriodToTime(scheduleHour, schedulePeriod)) &&
    selectedIds.size > 0;

  const handleSchedule = async () => {
    const scheduleTime = hourPeriodToTime(scheduleHour, schedulePeriod);
    if (!token || !scheduleDate.trim() || !scheduleTime || selectedIds.size === 0) {
      return;
    }
    setScheduleError(null);
    setScheduleSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/inventory/item-postings/schedule",
        {
          method: "PATCH",
          body: JSON.stringify({
            postingDate: combineScheduleDateTime(
              scheduleDate.trim().slice(0, 10),
              scheduleTime.trim(),
            ),
            inventoryItemIds: [...selectedIds],
          }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      setSelectedIds(new Set());
      setScheduleDate("");
      setScheduleHour("");
      setSchedulePeriod("AM");
      setTab("calendar");
      void loadPostings();
      void loadInventory();
    } catch (e) {
      setScheduleError(e instanceof Error ? e.message : "Schedule failed");
    } finally {
      setScheduleSubmitting(false);
    }
  };

  const tabBtn =
    "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

  return (
    <div className="w-full min-w-0">
      <div
        className="mb-6 flex items-end gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Posting sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "calendar"}
          id="tab-posting-calendar"
          aria-controls="panel-posting-calendar"
          className={`${tabBtn} ${
            tab === "calendar"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => setTab("calendar")}
        >
          Posting Calendar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "scheduling"}
          id="tab-posting-scheduling"
          aria-controls="panel-posting-scheduling"
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
          id="panel-posting-calendar"
          role="tabpanel"
          aria-labelledby="tab-posting-calendar"
          className="min-h-[12rem]"
        >
          {calendarError ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {calendarError}
            </p>
          ) : null}
          <PostingCalendar
            rows={calendarRows.filter((row) => row.postingDate)}
            isLoading={calendarLoading}
          />
        </section>
      )}

      {tab === "scheduling" && (
        <section
          id="panel-posting-scheduling"
          role="tabpanel"
          aria-labelledby="tab-posting-scheduling"
          className="min-h-[12rem] space-y-6"
        >
          <div className="grid max-w-xl gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div>
              <label htmlFor={scheduleDateId} className={fieldLabel}>
                Select schedule date
              </label>
              <DatePickerField
                id={scheduleDateId}
                value={scheduleDate}
                onChange={setScheduleDate}
                triggerClassName={dateTriggerClass}
                placeholder="Select date"
                dialogAriaLabel="Choose posting schedule date"
                disablePast
              />
            </div>
            <div>
              <label htmlFor={scheduleTimeId} className={fieldLabel}>
                Time
              </label>
              <div className="mt-1 flex rounded-lg border border-slate-300 bg-white shadow-sm focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500 dark:border-slate-600 dark:bg-slate-950">
                <input
                  id={scheduleTimeId}
                  type="number"
                  min={1}
                  max={12}
                  inputMode="numeric"
                  placeholder="Hour"
                  value={scheduleHour}
                  onChange={(e) => setScheduleHour(e.target.value)}
                  className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <select
                  value={schedulePeriod}
                  onChange={(e) =>
                    setSchedulePeriod(e.target.value === "PM" ? "PM" : "AM")
                  }
                  className="rounded-r-lg border-l border-slate-300 bg-transparent px-2 py-2 text-sm text-slate-900 outline-none dark:border-slate-600 dark:text-slate-100"
                  aria-label="Posting time period"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>

          {inventoryError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {inventoryError}
            </p>
          ) : null}

          <DataTable
            data={postingRows}
            columns={postingColumns}
            isLoading={inventoryLoading}
            emptyMessage="No inventory items with status For Posting."
            hideEmptyState={!!inventoryError}
            searchPlaceholder="Search SKU, posting date, item, inclusions, consignor…"
            getRowId={(r) => r.id}
            getRowAriaLabel={(r) => `Inventory item ${r.sku}, ${r.itemLabel}`}
            rowSelection={{
              selectedIds,
              onToggleRow,
              onTogglePage,
            }}
          />

          {scheduleError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {scheduleError}
            </p>
          ) : null}

          {showSchedule ? (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={scheduleSubmitting}
                onClick={() => void handleSchedule()}
              >
                {scheduleSubmitting ? "Scheduling…" : "Schedule"}
              </button>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
