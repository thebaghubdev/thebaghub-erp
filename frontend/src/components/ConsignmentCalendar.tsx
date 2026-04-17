/**
 * Large month grid with schedules shown **inside** day cells (similar layout to
 * marketing calendars like PageDone’s month blocks — implemented in-app with
 * Tailwind + date-fns; no paid template required).
 */
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
import {
  branchLabel,
  modeOfTransferLabel,
  scheduleTypeLabel,
  type BranchCode,
} from "../lib/consignment-schedule-labels";

export type CalendarScheduleRow = {
  id: string;
  deliveryDate: string;
  /** e.g. `scheduled`, `rescheduled` */
  status: string;
  type: string;
  modeOfTransfer: string;
  branch: string;
  inquiryCount: number;
  rescheduleReason?: string | null;
};

function isScheduleRescheduled(status: string | undefined): boolean {
  return status?.trim().toLowerCase() === "rescheduled";
}

/** Delivery calendar day is before today (local). Unreceived schedules only appear in the calendar. */
function isSchedulePastDue(deliveryDateIso: string, now = new Date()): boolean {
  const deliveryKey = dayKeyFromIso(deliveryDateIso);
  const todayKey = format(startOfDay(now), "yyyy-MM-dd");
  return deliveryKey < todayKey;
}

type Props = {
  schedules: CalendarScheduleRow[];
  isLoading?: boolean;
};

function dayKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function schedulesByDayKey(rows: CalendarScheduleRow[]) {
  const m = new Map<string, CalendarScheduleRow[]>();
  for (const s of rows) {
    const k = dayKeyFromIso(s.deliveryDate);
    const list = m.get(k);
    if (list) list.push(s);
    else m.set(k, [s]);
  }
  return m;
}

/** Total inquiry rows across all schedules on this day (respects branch filter). */
function totalItemsOnDay(daySchedules: CalendarScheduleRow[]): number {
  return daySchedules.reduce(
    (sum, s) => sum + (Number.isFinite(s.inquiryCount) ? s.inquiryCount : 0),
    0,
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type BranchFilter = "all" | BranchCode;

function normalizeBranchCode(branch: string): BranchCode {
  return branch.trim().toLowerCase() === "makati" ? "makati" : "pasig";
}

export function ConsignmentCalendar({ schedules, isLoading }: Props) {
  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const [branchFilter, setBranchFilter] = useState<BranchFilter>("all");

  const filteredSchedules = useMemo(() => {
    if (branchFilter === "all") return schedules;
    return schedules.filter(
      (s) => normalizeBranchCode(s.branch) === branchFilter,
    );
  }, [schedules, branchFilter]);

  const byDay = useMemo(
    () => schedulesByDayKey(filteredSchedules),
    [filteredSchedules],
  );

  const gridDays = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [viewMonth]);

  const schedulesForSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    const k = format(selectedDay, "yyyy-MM-dd");
    return byDay.get(k) ?? [];
  }, [byDay, selectedDay]);

  const selectedDayItemTotal = useMemo(
    () => totalItemsOnDay(schedulesForSelectedDay),
    [schedulesForSelectedDay],
  );

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
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <label
              htmlFor="calendar-branch-filter"
              className="text-sm text-slate-600 dark:text-slate-400"
            >
              Branch
            </label>
            <select
              id="calendar-branch-filter"
              value={branchFilter}
              onChange={(e) =>
                setBranchFilter(e.target.value as BranchFilter)
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="all">All branches</option>
              <option value="pasig">Pasig</option>
              <option value="makati">Makati</option>
            </select>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={() => {
                const now = new Date();
                setViewMonth(startOfMonth(now));
                setSelectedDay(startOfDay(now));
              }}
            >
              Today
            </button>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          {isLoading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-slate-600 backdrop-blur-sm dark:bg-slate-900/70 dark:text-slate-300">
              Loading…
            </div>
          ) : null}

          {/* Weekday header — matches PageDone-style top row */}
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

          {/* Day cells with events inside */}
          <div className="grid grid-cols-7">
            {gridDays.map((day) => {
              const k = format(day, "yyyy-MM-dd");
              const inMonth = isSameMonth(day, viewMonth);
              const dayItems = byDay.get(k) ?? [];
              const dayItemTotal = totalItemsOnDay(dayItems);
              const isSel = selectedDay && isSameDay(day, selectedDay);
              const itemCountTitle =
                branchFilter === "all"
                  ? `${dayItemTotal} inquiry ${dayItemTotal === 1 ? "item" : "items"} this day`
                  : `${dayItemTotal} inquiry ${dayItemTotal === 1 ? "item" : "items"} (${branchLabel(branchFilter)} only)`;

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
                    {dayItemTotal > 0 ? (
                      <span
                        className="max-w-[3.25rem] shrink-0 truncate text-right text-[0.6rem] font-semibold tabular-nums leading-tight text-violet-700 dark:text-violet-300 sm:max-w-none sm:text-[0.65rem]"
                        title={itemCountTitle}
                      >
                        {dayItemTotal}{" "}
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          items
                        </span>
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                    {dayItems.slice(0, 3).map((s) => {
                      const pastDue = isSchedulePastDue(s.deliveryDate);
                      const rescheduled =
                        isScheduleRescheduled(s.status) && !pastDue;
                      return (
                        <div
                          key={s.id}
                          className={
                            pastDue
                              ? "rounded-md border-l-2 border-red-600 bg-red-50 px-1.5 py-1 dark:border-red-500 dark:bg-red-950/50"
                              : rescheduled
                                ? "rounded-md border-l-2 border-amber-500 bg-amber-50 px-1.5 py-1 dark:border-amber-400 dark:bg-amber-950/45"
                                : "rounded-md border-l-2 border-violet-500 bg-violet-50 px-1.5 py-1 dark:border-violet-400 dark:bg-violet-950/50"
                          }
                        >
                          {pastDue ? (
                            <p className="mb-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-red-800 dark:text-red-200">
                              Past Due
                            </p>
                          ) : rescheduled ? (
                            <p className="mb-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                              Rescheduled
                            </p>
                          ) : null}
                          <p
                            className={
                              pastDue
                                ? "line-clamp-2 text-[0.65rem] font-medium leading-snug text-red-950 dark:text-red-50 sm:text-xs"
                                : rescheduled
                                  ? "line-clamp-2 text-[0.65rem] font-medium leading-snug text-amber-950 dark:text-amber-50 sm:text-xs"
                                  : "line-clamp-2 text-[0.65rem] font-medium leading-snug text-violet-900 dark:text-violet-100 sm:text-xs"
                            }
                          >
                            {scheduleTypeLabel(s.type)} ·{" "}
                            {modeOfTransferLabel(s.type, s.modeOfTransfer)}
                          </p>
                          <p
                            className={
                              pastDue
                                ? "mt-0.5 hidden text-[0.6rem] text-red-800/95 sm:block dark:text-red-200/95"
                                : rescheduled
                                  ? "mt-0.5 hidden text-[0.6rem] text-amber-800/95 sm:block dark:text-amber-200/95"
                                  : "mt-0.5 hidden text-[0.6rem] text-violet-700/90 sm:block dark:text-violet-300/90"
                            }
                          >
                            {branchLabel(s.branch)} · {s.inquiryCount} items
                          </p>
                        </div>
                      );
                    })}
                    {dayItems.length > 3 ? (
                      <span className="text-[0.6rem] font-medium text-slate-500 dark:text-slate-400">
                        +{dayItems.length - 3} more
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
            {selectedDay
              ? format(selectedDay, "MMMM d, yyyy")
              : "Select a day"}
          </h3>
          {selectedDay ? (
            <p className="mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {selectedDayItemTotal} inquiry{" "}
              {selectedDayItemTotal === 1 ? "item" : "items"}
              {branchFilter !== "all"
                ? ` · ${branchLabel(branchFilter)} only`
                : ""}
            </p>
          ) : null}
        </div>
        {!selectedDay ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Click a day on the grid for a full list of schedules.
          </p>
        ) : schedulesForSelectedDay.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            {branchFilter === "all"
              ? "No schedules on this date."
              : `No ${branchLabel(branchFilter)} schedules on this date.`}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {schedulesForSelectedDay.map((s) => {
              const pastDue = isSchedulePastDue(s.deliveryDate);
              const rescheduled =
                isScheduleRescheduled(s.status) && !pastDue;
              const label = `${scheduleTypeLabel(s.type)}, ${branchLabel(s.branch)}`;
              return (
                <li key={s.id}>
                  <Link
                    to={`/portal/consignment-scheduling/${s.id}`}
                    aria-label={`Open schedule details: ${label}`}
                    className={
                      pastDue
                        ? "block rounded-lg border border-red-300 bg-red-50/95 px-3 py-2 text-sm transition-colors hover:bg-red-100/95 focus-visible:outline focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-800/70 dark:bg-red-950/45 dark:hover:bg-red-950/65 dark:focus-visible:ring-red-600"
                        : rescheduled
                          ? "block rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm transition-colors hover:bg-amber-100/90 focus-visible:outline focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-800/60 dark:bg-amber-950/35 dark:hover:bg-amber-950/55 dark:focus-visible:ring-amber-600"
                          : "block rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm transition-colors hover:bg-slate-100/90 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-950/50 dark:hover:bg-slate-800/60"
                    }
                  >
                    {pastDue ? (
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-800 dark:text-red-200">
                        Past Due
                      </p>
                    ) : rescheduled ? (
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                        Rescheduled
                      </p>
                    ) : null}
                    <p
                      className={
                        pastDue
                          ? "font-medium text-red-950 dark:text-red-50"
                          : rescheduled
                            ? "font-medium text-amber-950 dark:text-amber-50"
                            : "font-medium text-slate-900 dark:text-slate-100"
                      }
                    >
                      {scheduleTypeLabel(s.type)} ·{" "}
                      {modeOfTransferLabel(s.type, s.modeOfTransfer)}
                    </p>
                    <p
                      className={
                        pastDue
                          ? "mt-1 text-red-800/95 dark:text-red-200/90"
                          : rescheduled
                            ? "mt-1 text-amber-800/95 dark:text-amber-200/90"
                            : "mt-1 text-slate-600 dark:text-slate-400"
                      }
                    >
                      Branch: {branchLabel(s.branch)} · Items: {s.inquiryCount}
                    </p>
                  </Link>
                </li>
              );
            })}
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
