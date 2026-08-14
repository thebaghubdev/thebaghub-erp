import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { DatePickerField } from "./DatePickerField";
import { HorizontalScrollMirror } from "./HorizontalScrollMirror";
import { SubmittedAtCell } from "./SubmittedAtCell";
import { TablePaginationBar } from "./TablePaginationBar";
import { useClientAuth } from "../context/client-auth";
import { apiFetch } from "../lib/api";
import { utcDateKeyFromIso } from "../lib/consignment-daily-limit";
import { useClientPagination } from "../hooks/useClientPagination";
import {
  branchLabel,
  DELIVERY_TIME_SLOT_OPTIONS,
  deliveryTimeSlotLabel,
  modeOfTransferLabel,
  type DeliveryTimeSlotCode,
} from "../lib/consignment-schedule-labels";

type ClientScheduleItem = {
  id: string;
  sku: string;
  itemLabel: string;
};

type ClientScheduleRow = {
  id: string;
  deliveryDate: string;
  deliveryTimeSlot: string | null;
  status: string;
  modeOfTransfer: string;
  branch: string;
  inquiryCount: number;
  items: ClientScheduleItem[];
  createdAt: string;
  hasClientRescheduled: boolean;
};

const MS_24H = 24 * 60 * 60 * 1000;

function isWithin24HoursOfDelivery(deliveryDateIso: string): boolean {
  const delivery = new Date(deliveryDateIso);
  if (Number.isNaN(delivery.getTime())) return true;
  return Date.now() >= delivery.getTime() - MS_24H;
}

function clientRescheduleEligibility(schedule: ClientScheduleRow): {
  allowed: boolean;
  disabledReason: string | null;
} {
  const status = schedule.status.trim().toLowerCase();
  if (status === "received" || status === "cancelled") {
    return {
      allowed: false,
      disabledReason: "This delivery can no longer be rescheduled.",
    };
  }
  if (schedule.hasClientRescheduled) {
    return {
      allowed: false,
      disabledReason:
        "You have already used your one-time reschedule for this delivery.",
    };
  }
  if (isWithin24HoursOfDelivery(schedule.deliveryDate)) {
    return {
      allowed: false,
      disabledReason:
        "Rescheduling is not available within 24 hours of the scheduled delivery date. You may reach out to the coordinator for assistance.",
    };
  }
  return { allowed: true, disabledReason: null };
}

function formatScheduleStatus(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "scheduled") return "Scheduled";
  if (s === "rescheduled") return "Rescheduled";
  if (s === "received") return "Received";
  if (s === "cancelled") return "Cancelled";
  return status;
}

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

type ScheduleItemsModalProps = {
  schedule: ClientScheduleRow;
  token: string | null;
  onClose: () => void;
  onRescheduled: (updated: ClientScheduleRow) => void;
};

function ClientRescheduleModal({
  schedule,
  token,
  onClose,
  onSuccess,
}: {
  schedule: ClientScheduleRow;
  token: string | null;
  onClose: () => void;
  onSuccess: (updated: ClientScheduleRow) => void;
}) {
  const titleId = useId();
  const datePickerId = useId();
  const reasonId = useId();
  const currentDateKey = useMemo(
    () => utcDateKeyFromIso(schedule.deliveryDate),
    [schedule.deliveryDate],
  );
  const [newDate, setNewDate] = useState("");
  const [newTimeSlot, setNewTimeSlot] = useState<DeliveryTimeSlotCode>(
    DELIVERY_TIME_SLOT_OPTIONS[0].value,
  );
  const [reason, setReason] = useState("");
  const [fullDates, setFullDates] = useState<string[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabledDateKeys = useMemo(
    () => [...fullDates, currentDateKey],
    [fullDates, currentDateKey],
  );

  useEffect(() => {
    setNewTimeSlot(
      (schedule.deliveryTimeSlot as DeliveryTimeSlotCode | null) ??
        DELIVERY_TIME_SLOT_OPTIONS[0].value,
    );
  }, [schedule.deliveryTimeSlot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  useEffect(() => {
    if (!token) {
      setAvailabilityLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setAvailabilityLoading(true);
      try {
        const res = await apiFetch(
          `/api/client/consignment-schedules/delivery-availability?branch=${encodeURIComponent(schedule.branch)}&itemCount=${encodeURIComponent(String(Math.max(1, schedule.inquiryCount)))}`,
          {},
          token,
        );
        if (!res.ok) throw new Error("Failed to load availability");
        const body = (await res.json()) as { fullDates?: string[] };
        if (!cancelled) {
          setFullDates(Array.isArray(body.fullDates) ? body.fullDates : []);
        }
      } catch {
        if (!cancelled) setFullDates([]);
      } finally {
        if (!cancelled) setAvailabilityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, schedule.branch, schedule.inquiryCount]);

  useEffect(() => {
    if (newDate && disabledDateKeys.includes(newDate)) {
      setNewDate("");
    }
  }, [newDate, disabledDateKeys]);

  const submit = useCallback(async () => {
    if (!token) return;
    if (!newDate.trim()) {
      setError("Please select a new delivery date.");
      return;
    }
    if (disabledDateKeys.includes(newDate.trim())) {
      setError("The selected delivery date is not available.");
      return;
    }
    if (!reason.trim()) {
      setError("Please enter a reason for rescheduling.");
      return;
    }
    if (!newTimeSlot) {
      setError("Please select a delivery time slot.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch(
        `/api/client/consignment-schedules/${schedule.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            deliveryDate: newDate.trim(),
            deliveryTimeSlot: newTimeSlot,
            rescheduleReason: reason.trim(),
          }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const body = (await res.json()) as {
        deliveryDate?: string;
        deliveryTimeSlot?: string | null;
        status?: string;
        hasClientRescheduled?: boolean;
      };
      onSuccess({
        ...schedule,
        deliveryDate: body.deliveryDate ?? schedule.deliveryDate,
        deliveryTimeSlot: body.deliveryTimeSlot ?? schedule.deliveryTimeSlot,
        status: body.status ?? "rescheduled",
        hasClientRescheduled: body.hasClientRescheduled ?? true,
      });
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not reschedule delivery.",
      );
    } finally {
      setBusy(false);
    }
  }, [token, newDate, newTimeSlot, reason, disabledDateKeys, schedule, onSuccess, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close"
        disabled={busy}
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          Reschedule delivery
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Choose a new delivery date and explain why. You can only reschedule
          once.
        </p>
        <div className="mt-4">
          <label
            htmlFor={datePickerId}
            className="block text-sm font-medium text-slate-700"
          >
            New delivery date
          </label>
          <DatePickerField
            id={datePickerId}
            value={newDate}
            onChange={setNewDate}
            disabled={busy || availabilityLoading}
            triggerClassName="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Select date"
            dialogAriaLabel="Choose new delivery date"
            disablePast
            disabledDateKeys={disabledDateKeys}
          />
          {availabilityLoading ? (
            <p className="mt-1 text-xs text-slate-500">
              Checking availability…
            </p>
          ) : null}
        </div>
        <div className="mt-4">
          <label
            htmlFor="client-reschedule-time-slot"
            className="block text-sm font-medium text-slate-700"
          >
            Delivery time slot
          </label>
          <select
            id="client-reschedule-time-slot"
            value={newTimeSlot}
            onChange={(e) =>
              setNewTimeSlot(e.target.value as DeliveryTimeSlotCode)
            }
            disabled={busy || availabilityLoading}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
          >
            {DELIVERY_TIME_SLOT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4">
          <label
            htmlFor={reasonId}
            className="block text-sm font-medium text-slate-700"
          >
            Reason for rescheduling <span className="text-red-600">*</span>
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy || availabilityLoading}
            rows={4}
            required
            placeholder="e.g. I will be out of town on the original date…"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
          />
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={
              busy ||
              availabilityLoading ||
              !newDate.trim() ||
              !newTimeSlot ||
              !reason.trim()
            }
            className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Confirm reschedule"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ScheduleItemsModal({
  schedule,
  token,
  onClose,
  onRescheduled,
}: ScheduleItemsModalProps) {
  const titleId = useId();
  const descId = useId();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const { allowed: canReschedule, disabledReason } =
    clientRescheduleEligibility(schedule);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !rescheduleOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, rescheduleOpen]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(32rem,85vh)] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            Scheduled delivery
          </h2>
          <dl
            id={descId}
            className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-2"
          >
            <div>
              <dt className="inline font-medium text-slate-500">Date: </dt>
              <dd className="inline text-slate-800">
                <SubmittedAtCell iso={schedule.deliveryDate} showTime={false} />
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-slate-500">Time slot: </dt>
              <dd className="inline text-slate-800">
                {deliveryTimeSlotLabel(schedule.deliveryTimeSlot)}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-slate-500">Branch: </dt>
              <dd className="inline text-slate-800">
                {branchLabel(schedule.branch)}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-slate-500">Mode: </dt>
              <dd className="inline text-slate-800">
                {modeOfTransferLabel("delivery", schedule.modeOfTransfer)}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-slate-500">Status: </dt>
              <dd className="inline text-slate-800">
                {formatScheduleStatus(schedule.status)}
              </dd>
            </div>
          </dl>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Items ({schedule.items.length})
          </p>
          {schedule.items.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No items on this schedule.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
              {schedule.items.map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/consignments/${item.id}`}
                    onClick={onClose}
                    className="flex flex-col gap-0.5 px-3 py-2.5 text-sm transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="font-medium text-slate-900">
                      {item.itemLabel}
                    </span>
                    <span className="text-xs text-slate-500 sm:text-sm">
                      {item.sku}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-200 px-5 py-4">
          {disabledReason ? (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {disabledReason}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setRescheduleOpen(true)}
              disabled={!canReschedule}
              className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reschedule
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
      {rescheduleOpen ? (
        <ClientRescheduleModal
          schedule={schedule}
          token={token}
          onClose={() => setRescheduleOpen(false)}
          onSuccess={(updated) => {
            onRescheduled(updated);
            setRescheduleOpen(false);
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}

type Props = {
  refreshKey?: number;
  onCreateSchedule?: () => void;
};

export function ClientMySchedulesPanel({
  refreshKey = 0,
  onCreateSchedule,
}: Props) {
  const { token } = useClientAuth();
  const [rows, setRows] = useState<ClientScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] =
    useState<ClientScheduleRow | null>(null);

  const pagination = useClientPagination(rows);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(
        "/api/client/consignment-schedules",
        {},
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as ClientScheduleRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load your schedules",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          View delivery schedules for your consignments, or create a new one.
        </p>
        {onCreateSchedule ? (
          <button
            type="button"
            onClick={onCreateSchedule}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700"
          >
            Create schedule
          </button>
        ) : null}
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
          <button
            type="button"
            className="ml-2 font-medium text-violet-700 underline"
            onClick={() => void load()}
          >
            Retry
          </button>
        </p>
      )}

      <div className="max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-3 sm:px-4">
          <TablePaginationBar
            totalCount={pagination.totalCount}
            pageIndex={pagination.pageIndex}
            pageSize={pagination.pageSize}
            onPageIndexChange={pagination.setPageIndex}
            onPageSizeChange={pagination.setPageSize}
            disabled={loading && rows.length === 0}
            itemLabel="schedules"
          />
        </div>
        <HorizontalScrollMirror>
          <table className="w-max min-w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-2 py-2.5 sm:px-4 sm:py-3">
                  Delivery date
                </th>
                <th scope="col" className="px-2 py-2.5 sm:px-4 sm:py-3">
                  Time slot
                </th>
                <th scope="col" className="px-2 py-2.5 sm:px-4 sm:py-3">
                  Branch
                </th>
                <th scope="col" className="px-2 py-2.5 sm:px-4 sm:py-3">
                  Mode
                </th>
                <th scope="col" className="px-2 py-2.5 sm:px-4 sm:py-3">
                  Items
                </th>
                <th scope="col" className="px-2 py-2.5 sm:px-4 sm:py-3">
                  Status
                </th>
                <th scope="col" className="px-2 py-2.5 sm:px-4 sm:py-3">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && !error && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No delivery schedules yet for your items. Use &quot;Create
                    schedule&quot; to book one, or contact The Bag Hub team if
                    staff arranged delivery for you.
                  </td>
                </tr>
              )}
              {pagination.pageItems.map((row) => (
                <tr
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`View items for delivery on ${row.deliveryDate}`}
                  className="cursor-pointer hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                  onClick={() => setSelectedSchedule(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedSchedule(row);
                    }
                  }}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <SubmittedAtCell iso={row.deliveryDate} showTime={false} />
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {deliveryTimeSlotLabel(row.deliveryTimeSlot)}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {branchLabel(row.branch)}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {modeOfTransferLabel("delivery", row.modeOfTransfer)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {row.inquiryCount}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {formatScheduleStatus(row.status)}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    <SubmittedAtCell iso={row.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </HorizontalScrollMirror>
      </div>

      {selectedSchedule ? (
        <ScheduleItemsModal
          schedule={selectedSchedule}
          token={token}
          onClose={() => setSelectedSchedule(null)}
          onRescheduled={(updated) => {
            setSelectedSchedule(updated);
            setRows((prev) =>
              prev.map((row) => (row.id === updated.id ? updated : row)),
            );
          }}
        />
      ) : null}
    </section>
  );
}
