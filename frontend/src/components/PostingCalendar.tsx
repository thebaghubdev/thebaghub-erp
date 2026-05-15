import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

export type PostingCalendarRow = {
  id: string;
  inventoryItemId: string;
  postingDate: string | null;
  sku: string;
  itemLabel: string;
  inclusions: string;
  consignorName: string | null;
  productName: string;
  collections: string[];
  tags: string[];
};

type Props = {
  rows: PostingCalendarRow[];
  isLoading?: boolean;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function dayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return format(d, "yyyy-MM-dd");
}

function postingTimeLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "h:mm a");
}

function postingsByDayKey(rows: PostingCalendarRow[]) {
  const m = new Map<string, PostingCalendarRow[]>();
  for (const r of rows) {
    if (!r.postingDate) continue;
    const k = dayKeyFromIso(r.postingDate);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  for (const [, list] of m) {
    list.sort((a, b) => {
      const at = a.postingDate ? new Date(a.postingDate).getTime() : 0;
      const bt = b.postingDate ? new Date(b.postingDate).getTime() : 0;
      if (at !== bt) return at - bt;
      return a.sku.localeCompare(b.sku);
    });
  }
  return m;
}

export function PostingCalendar({ rows, isLoading }: Props) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));

  const byDay = useMemo(() => postingsByDayKey(rows), [rows]);

  const gridDays = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [viewMonth]);

  const rowsForSelectedDay = useMemo(() => {
    const k = format(selectedDay, "yyyy-MM-dd");
    return byDay.get(k) ?? [];
  }, [byDay, selectedDay]);

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {format(viewMonth, "MMMM yyyy")}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label="Previous month"
                onClick={() => setViewMonth((d) => subMonths(d, 1))}
              >
                <ChevronLeftIcon />
              </button>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label="Next month"
                onClick={() => setViewMonth((d) => addMonths(d, 1))}
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>
          <button
            type="button"
            className="self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 sm:self-auto"
            onClick={() => {
              const now = new Date();
              setViewMonth(startOfMonth(now));
              setSelectedDay(startOfDay(now));
            }}
          >
            Today
          </button>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          {isLoading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-slate-600 backdrop-blur-sm dark:bg-slate-900/70 dark:text-slate-300">
              Loading…
            </div>
          ) : null}
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-600">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="border-r border-slate-200 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 last:border-r-0 dark:border-slate-600 dark:text-slate-400 sm:text-sm"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {gridDays.map((day) => {
              const k = format(day, "yyyy-MM-dd");
              const inMonth = isSameMonth(day, viewMonth);
              const dayRows = byDay.get(k) ?? [];
              const isSel = isSameDay(day, selectedDay);
              const count = dayRows.length;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelectedDay(startOfDay(day))}
                  className={[
                    "flex min-h-[5.5rem] flex-col items-stretch border-b border-r border-slate-200 p-1.5 text-left transition-colors last:border-r-0 sm:min-h-[7rem] sm:p-2.5",
                    "hover:bg-violet-50/80 dark:border-slate-600 dark:hover:bg-violet-950/30",
                    inMonth
                      ? "bg-white dark:bg-slate-900"
                      : "bg-slate-50 dark:bg-slate-950/80",
                    isSel
                      ? "ring-2 ring-inset ring-violet-500 dark:ring-violet-400"
                      : "",
                  ].join(" ")}
                >
                  <div className="mb-1 flex w-full min-w-0 items-start justify-between gap-0.5">
                    <span
                      className={[
                        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold sm:h-7 sm:w-7",
                        !inMonth && "text-slate-400 dark:text-slate-500",
                        inMonth &&
                          isToday(day) &&
                          "bg-violet-600 text-white dark:bg-violet-600",
                        inMonth &&
                          !isToday(day) &&
                          "text-slate-800 dark:text-slate-100",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {format(day, "d")}
                    </span>
                    {count > 0 ? (
                      <span
                        className="max-w-[3.25rem] shrink-0 truncate text-right text-[0.6rem] font-semibold tabular-nums leading-tight text-violet-700 dark:text-violet-300 sm:max-w-none sm:text-[0.65rem]"
                        title={`${count} scheduled SKU${count === 1 ? "" : "s"}`}
                      >
                        {count}{" "}
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          SKU{count === 1 ? "" : "s"}
                        </span>
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                    {dayRows.slice(0, 4).map((r) => (
                      <div
                        key={r.id}
                        className="truncate rounded border-l-2 border-violet-500 bg-violet-50 px-1 py-0.5 text-[0.6rem] font-mono font-medium leading-tight text-violet-900 dark:border-violet-400 dark:bg-violet-950/50 dark:text-violet-100 sm:text-[0.65rem]"
                        title={`${r.sku} · ${r.productName || r.itemLabel}`}
                      >
                        {postingTimeLabel(r.postingDate)} · {r.sku}
                      </div>
                    ))}
                    {dayRows.length > 4 ? (
                      <span className="text-[0.6rem] font-medium text-slate-500 dark:text-slate-400">
                        +{dayRows.length - 4} more
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <aside className="w-full shrink-0 xl:sticky xl:top-4 xl:w-80">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {format(selectedDay, "MMMM d, yyyy")}
          </h3>
          <p className="mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {rowsForSelectedDay.length} scheduled{" "}
            {rowsForSelectedDay.length === 1 ? "item" : "items"}
          </p>
        </div>
        {rowsForSelectedDay.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No postings on this date.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rowsForSelectedDay.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/portal/posting/${r.inventoryItemId}`}
                  aria-label={`Open posting draft for ${r.sku}`}
                  className="block rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm transition-colors hover:bg-slate-100/90 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-950/50 dark:hover:bg-slate-800/60"
                >
                  <p className="break-all font-mono text-[0.65rem] font-semibold text-violet-800 dark:text-violet-200 sm:text-xs">
                    {r.sku}
                  </p>
                  <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                    {r.productName || r.itemLabel}
                  </p>
                  <p className="mt-1 text-xs font-medium text-violet-700 dark:text-violet-300">
                    Time: {postingTimeLabel(r.postingDate) || "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Consignor: {r.consignorName ?? "—"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
