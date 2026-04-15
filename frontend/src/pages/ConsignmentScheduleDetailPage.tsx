import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DatePickerField } from "../components/DatePickerField";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import {
  branchLabel,
  modeOfTransferLabel,
  scheduleTypeLabel,
} from "../lib/consignment-schedule-labels";

type ConsignmentScheduleDetail = {
  id: string;
  deliveryDate: string;
  status: string;
  type: string;
  modeOfTransfer: string;
  branch: string;
  createdAt: string;
  createdByName: string;
  inquiryCount: number;
  rescheduleReason?: string | null;
  inquiries: Array<{
    id: string;
    sku: string;
    status: string;
    itemLabel: string;
  }>;
};

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800";

const btnDanger =
  "inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40";

const dateTriggerClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

function isoDeliveryToYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatScheduleStatus(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "scheduled") return "Scheduled";
  if (s === "rescheduled") return "Rescheduled";
  if (!s) return status;
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function readApiErrorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(j.message)) return j.message.join("; ");
    if (typeof j.message === "string") return j.message;
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export function ConsignmentScheduleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = usePortalAuth();
  const [detail, setDetail] = useState<ConsignmentScheduleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rescheduleTitleId = useId();
  const reschedulePickerId = useId();
  const rescheduleReasonId = useId();

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleYmd, setRescheduleYmd] = useState("");
  const [rescheduleReasonText, setRescheduleReasonText] = useState("");
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !token) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/consignment-schedules/${id}`, {}, token);
      if (res.status === 404) {
        setError("Schedule not found.");
        setDetail(null);
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as ConsignmentScheduleDetail;
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schedule");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReschedule = useCallback(() => {
    if (!detail) return;
    setRescheduleYmd(isoDeliveryToYmd(detail.deliveryDate));
    setRescheduleReasonText("");
    setRescheduleError(null);
    setRescheduleOpen(true);
  }, [detail]);

  const closeReschedule = useCallback(() => {
    if (rescheduleBusy) return;
    setRescheduleOpen(false);
    setRescheduleError(null);
  }, [rescheduleBusy]);

  useEffect(() => {
    if (!rescheduleOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !rescheduleBusy) closeReschedule();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rescheduleOpen, rescheduleBusy, closeReschedule]);

  const submitReschedule = useCallback(async () => {
    if (!id || !token || !rescheduleYmd.trim()) {
      setRescheduleError("Please select a delivery date.");
      return;
    }
    if (!rescheduleReasonText.trim()) {
      setRescheduleError("Please enter a reschedule reason.");
      return;
    }
    setRescheduleError(null);
    setRescheduleBusy(true);
    try {
      const res = await apiFetch(
        `/api/consignment-schedules/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            deliveryDate: rescheduleYmd.trim(),
            rescheduleReason: rescheduleReasonText.trim(),
          }),
        },
        token,
      );
      if (!res.ok) {
        setRescheduleError(await readApiErrorMessage(res));
        return;
      }
      const data = (await res.json()) as ConsignmentScheduleDetail;
      setDetail(data);
      setRescheduleOpen(false);
    } catch (e) {
      setRescheduleError(
        e instanceof Error ? e.message : "Could not reschedule.",
      );
    } finally {
      setRescheduleBusy(false);
    }
  }, [id, token, rescheduleYmd, rescheduleReasonText]);

  const confirmDelete = useCallback(async () => {
    if (!id || !token) return;
    setDeleteError(null);
    setDeleteBusy(true);
    try {
      const res = await apiFetch(
        `/api/consignment-schedules/${id}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) {
        setDeleteError(await readApiErrorMessage(res));
        return;
      }
      setDeleteOpen(false);
      navigate("/portal/consignment-scheduling");
    } catch (e) {
      setDeleteError(
        e instanceof Error ? e.message : "Could not delete schedule.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }, [id, token, navigate]);

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/portal/consignment-scheduling"
          className="text-sm font-medium text-violet-700 hover:text-violet-900 dark:text-violet-400 dark:hover:text-violet-300"
        >
          ← Back to consignment scheduling
        </Link>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      {loading && !detail ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>
      ) : null}

      {detail ? (
        <>
          <section className={cardClass}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {scheduleTypeLabel(detail.type)} schedule
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {detail.inquiryCount}{" "}
                  {detail.inquiryCount === 1 ? "inquiry" : "inquiries"} in this
                  batch.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={openReschedule}
                  disabled={!!loading}
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  className={btnDanger}
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteOpen(true);
                  }}
                  disabled={!!loading}
                >
                  Delete
                </button>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Delivery date
                </dt>
                <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                  <SubmittedAtCell
                    iso={detail.deliveryDate}
                    showTime={false}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Status</dt>
                <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                  {formatScheduleStatus(detail.status)}
                </dd>
              </div>
              {detail.status.trim().toLowerCase() === "rescheduled" ? (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500 dark:text-slate-400">
                    Reschedule reason
                  </dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-slate-900 dark:text-slate-100">
                    {detail.rescheduleReason?.trim()
                      ? detail.rescheduleReason
                      : "—"}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Mode</dt>
                <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                  {modeOfTransferLabel(detail.type, detail.modeOfTransfer)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Branch</dt>
                <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                  {branchLabel(detail.branch)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Created</dt>
                <dd className="mt-0.5 text-slate-600 dark:text-slate-400">
                  <SubmittedAtCell iso={detail.createdAt} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Created by
                </dt>
                <dd className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                  {detail.createdByName}
                </dd>
              </div>
            </dl>
          </section>

          <section className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Inquiries in this schedule
            </h2>
            {detail.inquiries.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                No inquiries linked.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] table-fixed border-collapse text-left text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        SKU
                      </th>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Item
                      </th>
                      <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {detail.inquiries.map((row) => (
                      <tr key={row.id}>
                        <td className="py-2 pr-3 align-top font-mono text-xs text-slate-900 dark:text-slate-100">
                          {row.sku}
                        </td>
                        <td className="py-2 pr-3 align-top text-slate-800 dark:text-slate-200">
                          {row.itemLabel}
                        </td>
                        <td className="py-2 text-right align-top">
                          <Link
                            to={`/portal/inquiries/${row.id}`}
                            className="font-medium text-violet-700 hover:underline dark:text-violet-400"
                          >
                            View inquiry
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {rescheduleOpen && detail && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby={rescheduleTitleId}
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50"
                aria-label="Close"
                disabled={rescheduleBusy}
                onClick={closeReschedule}
              />
              <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <h2
                  id={rescheduleTitleId}
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  Reschedule delivery
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Choose a new delivery date and explain why. The schedule
                  status will be set to Rescheduled.
                </p>
                <div className="mt-4">
                  <label
                    htmlFor={reschedulePickerId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    New delivery date
                  </label>
                  <DatePickerField
                    id={reschedulePickerId}
                    value={rescheduleYmd}
                    onChange={setRescheduleYmd}
                    disabled={rescheduleBusy}
                    triggerClassName={dateTriggerClass}
                    placeholder="Select date"
                    dialogAriaLabel="Choose new delivery date"
                  />
                </div>
                <div className="mt-4">
                  <label
                    htmlFor={rescheduleReasonId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Reschedule reason{" "}
                    <span className="text-red-600 dark:text-red-400">*</span>
                  </label>
                  <textarea
                    id={rescheduleReasonId}
                    value={rescheduleReasonText}
                    onChange={(e) => setRescheduleReasonText(e.target.value)}
                    disabled={rescheduleBusy}
                    rows={4}
                    required
                    placeholder="e.g. Client requested a different date…"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                {rescheduleError ? (
                  <p
                    className="mt-3 text-sm text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {rescheduleError}
                  </p>
                ) : null}
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className={btnSecondary}
                    disabled={rescheduleBusy}
                    onClick={closeReschedule}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                    disabled={rescheduleBusy}
                    onClick={() => void submitReschedule()}
                  >
                    {rescheduleBusy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this schedule?"
        description={
          detail?.type === "pullout"
            ? "This will remove the schedule from the consignment calendar. Inquiries in this batch will return to “For Pullout” (no longer scheduled). This cannot be undone."
            : "This will remove the schedule from the consignment calendar. Inquiries in this batch will return to “For Delivery” (no longer scheduled). This cannot be undone."
        }
        cancelLabel="Cancel"
        confirmLabel="Delete schedule"
        danger
        busy={deleteBusy}
        errorMessage={deleteError}
        onCancel={() => !deleteBusy && setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
