import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DatePickerField } from "../components/DatePickerField";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { TablePaginationBar } from "../components/TablePaginationBar";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { useClientPagination } from "../hooks/useClientPagination";
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
    inclusions: string;
  }>;
};

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800";

const btnDanger =
  "inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40";

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 disabled:pointer-events-none dark:bg-violet-600 dark:hover:bg-violet-500";

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

/** Item form fields for receipt verification (matches inquiry snapshot; excludes photos & special instructions). */
type ReceiptItemFormState = {
  itemModel: string;
  brand: string;
  category: string;
  serialNumber: string;
  color: string;
  material: string;
  condition: string;
  inclusions: string;
  datePurchased: string;
  sourceOfPurchase: string;
};

function strForm(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function datePurchasedToInputValue(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}

function formStateFromItemSnapshot(
  form: Record<string, unknown>,
): ReceiptItemFormState {
  return {
    itemModel: strForm(form.itemModel),
    brand: strForm(form.brand),
    category: strForm(form.category),
    serialNumber: strForm(form.serialNumber),
    color: strForm(form.color),
    material: strForm(form.material),
    condition: strForm(form.condition),
    inclusions: strForm(form.inclusions),
    datePurchased: datePurchasedToInputValue(form.datePurchased),
    sourceOfPurchase: strForm(form.sourceOfPurchase),
  };
}

/** Matches staff inquiry item label (brand + model). */
function itemLabelFromReceiptForm(f: ReceiptItemFormState): string {
  const brand = f.brand.trim();
  const model = f.itemModel.trim();
  if (!brand && !model) return "Item";
  if (!brand) return model;
  if (!model) return brand;
  return `${brand} — ${model}`;
}

function validateReceiptFormRequired(f: ReceiptItemFormState): string | null {
  if (!f.itemModel.trim()) return "Model is required.";
  if (!f.brand.trim()) return "Brand is required.";
  if (!f.category.trim()) return "Category is required.";
  if (!f.condition.trim()) return "Condition is required.";
  if (!f.inclusions.trim()) return "Inclusions is required.";
  return null;
}

const verifyInputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

type ConsignPicklists = { brands: string[]; categories: string[] };

export function ConsignmentScheduleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = usePortalAuth();
  const [detail, setDetail] = useState<ConsignmentScheduleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scheduleInquiriesPagination = useClientPagination(
    detail?.inquiries ?? [],
  );

  const rescheduleTitleId = useId();
  const reschedulePickerId = useId();
  const rescheduleReasonId = useId();
  const receivedModalTitleId = useId();
  const itemVerifyModalTitleId = useId();
  const verifyFieldId = useId();

  const itemVerifySeq = useRef(0);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleYmd, setRescheduleYmd] = useState("");
  const [rescheduleReasonText, setRescheduleReasonText] = useState("");
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [receivedOpen, setReceivedOpen] = useState(false);
  const [receivedChecked, setReceivedChecked] = useState<Record<string, boolean>>(
    {},
  );
  /** Edits from the review modal, submitted with receive. */
  const [receiptItemEdits, setReceiptItemEdits] = useState<
    Record<string, ReceiptItemFormState>
  >({});
  const [receiveBusy, setReceiveBusy] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  const [itemVerifyInquiryId, setItemVerifyInquiryId] = useState<string | null>(
    null,
  );
  const [itemVerifySku, setItemVerifySku] = useState("");
  const [itemVerifyLoading, setItemVerifyLoading] = useState(false);
  const [itemVerifyError, setItemVerifyError] = useState<string | null>(null);
  const [itemVerifyValidationError, setItemVerifyValidationError] = useState<
    string | null
  >(null);
  const [itemVerifyForm, setItemVerifyForm] =
    useState<ReceiptItemFormState | null>(null);

  const [consignPicklists, setConsignPicklists] = useState<ConsignPicklists>({
    brands: [],
    categories: [],
  });
  const [picklistsLoading, setPicklistsLoading] = useState(false);
  const [picklistsError, setPicklistsError] = useState<string | null>(null);

  const loadConsignPicklists = useCallback(async () => {
    if (!token) return;
    setPicklistsError(null);
    setPicklistsLoading(true);
    try {
      const res = await apiFetch(
        "/api/client/consignment-form/options",
        {},
        token,
      );
      if (!res.ok) {
        throw new Error(`Could not load options (${res.status})`);
      }
      const data = (await res.json()) as ConsignPicklists;
      setConsignPicklists({
        brands: Array.isArray(data.brands) ? data.brands : [],
        categories: Array.isArray(data.categories) ? data.categories : [],
      });
    } catch (e) {
      setPicklistsError(
        e instanceof Error ? e.message : "Could not load form options",
      );
    } finally {
      setPicklistsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!receivedOpen || !token) return;
    void loadConsignPicklists();
  }, [receivedOpen, token, loadConsignPicklists]);

  useEffect(() => {
    setItemVerifyValidationError(null);
  }, [itemVerifyForm]);

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

  const openReceived = useCallback(() => {
    if (!detail?.inquiries.length) return;
    const next: Record<string, boolean> = {};
    for (const q of detail.inquiries) next[q.id] = false;
    setReceivedChecked(next);
    setReceiptItemEdits({});
    setReceiveError(null);
    setPicklistsError(null);
    itemVerifySeq.current += 1;
    setItemVerifyInquiryId(null);
    setItemVerifyForm(null);
    setItemVerifyError(null);
    setItemVerifyLoading(false);
    setReceivedOpen(true);
  }, [detail]);

  const closeReceived = useCallback(() => {
    itemVerifySeq.current += 1;
    setItemVerifyInquiryId(null);
    setItemVerifyForm(null);
    setItemVerifyError(null);
    setItemVerifyLoading(false);
    setReceivedOpen(false);
  }, []);

  const closeItemVerify = useCallback(() => {
    itemVerifySeq.current += 1;
    setItemVerifyInquiryId(null);
    setItemVerifyForm(null);
    setItemVerifyError(null);
    setItemVerifyValidationError(null);
    setItemVerifyLoading(false);
  }, []);

  const beginItemVerify = useCallback(
    async (inquiryId: string, sku: string) => {
      if (!token) return;
      const seq = ++itemVerifySeq.current;
      setItemVerifyInquiryId(inquiryId);
      setItemVerifySku(sku);
      setItemVerifyError(null);
      setItemVerifyValidationError(null);
      setItemVerifyForm(null);
      setItemVerifyLoading(true);
      try {
        const res = await apiFetch(`/api/inquiries/${inquiryId}`, {}, token);
        if (seq !== itemVerifySeq.current) return;
        if (!res.ok) {
          setItemVerifyError(await readApiErrorMessage(res));
          return;
        }
        const data = (await res.json()) as {
          sku: string;
          itemSnapshot: { form: Record<string, unknown> };
        };
        if (seq !== itemVerifySeq.current) return;
        setItemVerifySku(data.sku);
        setItemVerifyForm(
          formStateFromItemSnapshot(data.itemSnapshot?.form ?? {}),
        );
      } catch (e) {
        if (seq !== itemVerifySeq.current) return;
        setItemVerifyError(
          e instanceof Error ? e.message : "Failed to load inquiry.",
        );
      } finally {
        if (seq === itemVerifySeq.current) setItemVerifyLoading(false);
      }
    },
    [token],
  );

  const continueItemVerify = useCallback(() => {
    if (!itemVerifyInquiryId || !itemVerifyForm) return;
    const validation = validateReceiptFormRequired(itemVerifyForm);
    if (validation) {
      setItemVerifyValidationError(validation);
      return;
    }
    const id = itemVerifyInquiryId;
    setReceiptItemEdits((prev) => ({ ...prev, [id]: itemVerifyForm }));
    setReceivedChecked((prev) => ({ ...prev, [id]: true }));
    closeItemVerify();
  }, [itemVerifyInquiryId, itemVerifyForm, closeItemVerify]);

  useEffect(() => {
    if (!receivedOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !itemVerifyInquiryId) closeReceived();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [receivedOpen, itemVerifyInquiryId, closeReceived]);

  useEffect(() => {
    if (!itemVerifyInquiryId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !itemVerifyLoading) closeItemVerify();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [itemVerifyInquiryId, itemVerifyLoading, closeItemVerify]);

  const submitReceiveAll = useCallback(async () => {
    if (!id || !token || !detail) return;
    const missing = detail.inquiries.some((q) => !receiptItemEdits[q.id]);
    if (missing) {
      setReceiveError(
        "Open each item’s review form and continue so every line has saved details.",
      );
      return;
    }
    setReceiveError(null);
    setReceiveBusy(true);
    try {
      const res = await apiFetch(
        `/api/consignment-schedules/${id}/receive-items`,
        {
          method: "POST",
          body: JSON.stringify({
            items: detail.inquiries.map((q) => ({
              inquiryId: q.id,
              form: receiptItemEdits[q.id],
            })),
          }),
        },
        token,
      );
      if (!res.ok) {
        setReceiveError(await readApiErrorMessage(res));
        return;
      }
      setReceivedOpen(false);
      navigate("/portal/inventory");
    } catch (e) {
      setReceiveError(
        e instanceof Error ? e.message : "Could not record received items.",
      );
    } finally {
      setReceiveBusy(false);
    }
  }, [id, token, detail, receiptItemEdits, navigate]);

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
                  className={btnPrimary}
                  onClick={openReceived}
                  disabled={!!loading || detail.inquiries.length === 0}
                >
                  Complete
                </button>
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
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="overflow-x-auto">
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
                      {scheduleInquiriesPagination.pageItems.map((row) => (
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
                <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40 sm:px-4">
                  <TablePaginationBar
                    totalCount={scheduleInquiriesPagination.totalCount}
                    pageIndex={scheduleInquiriesPagination.pageIndex}
                    pageSize={scheduleInquiriesPagination.pageSize}
                    onPageIndexChange={scheduleInquiriesPagination.setPageIndex}
                    onPageSizeChange={scheduleInquiriesPagination.setPageSize}
                    itemLabel="inquiries"
                  />
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}

      {receivedOpen && detail && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby={receivedModalTitleId}
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50"
                aria-label="Close"
                onClick={closeReceived}
              />
              <div className="relative z-10 flex max-h-[min(90vh,52rem)] w-full max-w-5xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <div className="shrink-0 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                  <h2
                    id={receivedModalTitleId}
                    className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                  >
                    Confirm receipt
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Check off each item below to confirm it was received. All
                    items must be checked before you can continue.
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] table-fixed border-collapse text-left text-sm">
                      <thead className="border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th
                            scope="col"
                            className="w-10 pb-2 pr-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                          >
                            <span className="sr-only">Confirm item received</span>
                          </th>
                          <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            SKU
                          </th>
                          <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Item
                          </th>
                          <th className="pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Inclusions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {detail.inquiries.map((row) => (
                          <tr key={row.id}>
                            <td className="py-2.5 pr-2 align-top">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900"
                                checked={!!receivedChecked[row.id]}
                                onChange={() => {
                                  if (receivedChecked[row.id]) {
                                    setReceivedChecked((prev) => ({
                                      ...prev,
                                      [row.id]: false,
                                    }));
                                    setReceiptItemEdits((prev) => {
                                      const next = { ...prev };
                                      delete next[row.id];
                                      return next;
                                    });
                                  } else {
                                    void beginItemVerify(row.id, row.sku);
                                  }
                                }}
                                aria-label={`Mark received ${row.sku}`}
                              />
                            </td>
                            <td className="py-2.5 pr-3 align-top font-mono text-xs text-slate-900 dark:text-slate-100">
                              {row.sku}
                            </td>
                            <td className="py-2.5 pr-3 align-top text-slate-800 dark:text-slate-200">
                              {receiptItemEdits[row.id]
                                ? itemLabelFromReceiptForm(
                                    receiptItemEdits[row.id],
                                  )
                                : row.itemLabel}
                            </td>
                            <td className="py-2.5 align-top whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                              {receiptItemEdits[row.id]
                                ? receiptItemEdits[row.id].inclusions.trim() ||
                                  "—"
                                : (row.inclusions ?? "—")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="shrink-0 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
                  {receiveError ? (
                    <p
                      className="mb-3 text-sm text-red-600 dark:text-red-400"
                      role="alert"
                    >
                      {receiveError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={receiveBusy}
                      onClick={closeReceived}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={
                        receiveBusy ||
                        detail.inquiries.length === 0 ||
                        !detail.inquiries.every((q) => receivedChecked[q.id])
                      }
                      onClick={() => void submitReceiveAll()}
                    >
                      {receiveBusy ? "Saving…" : "All Items Received"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {itemVerifyInquiryId && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[110] flex items-end justify-center p-4 sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby={itemVerifyModalTitleId}
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/60"
                aria-label="Close"
                onClick={closeItemVerify}
              />
              <div className="relative z-10 flex max-h-[min(92vh,44rem)] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <div className="shrink-0 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                  <h2
                    id={itemVerifyModalTitleId}
                    className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                  >
                    Review item details
                  </h2>
                  <p className="mt-1 font-mono text-sm text-slate-600 dark:text-slate-400">
                    {itemVerifySku}
                  </p>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Confirm the item information below matches what was
                    received. Edit if needed, then continue to mark this line
                    as received.
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  {itemVerifyLoading ? (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Loading inquiry…
                    </p>
                  ) : null}
                  {itemVerifyError ? (
                    <div className="space-y-3">
                      <p
                        className="text-sm text-red-600 dark:text-red-400"
                        role="alert"
                      >
                        {itemVerifyError}
                      </p>
                      <button
                        type="button"
                        className={btnSecondary}
                        onClick={() => {
                          if (itemVerifyInquiryId) {
                            void beginItemVerify(
                              itemVerifyInquiryId,
                              itemVerifySku,
                            );
                          }
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  ) : null}
                  {picklistsError && itemVerifyForm ? (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                      {picklistsError}
                      <button
                        type="button"
                        className="ml-2 font-medium text-violet-700 underline dark:text-violet-400"
                        onClick={() => void loadConsignPicklists()}
                      >
                        Retry
                      </button>
                    </div>
                  ) : null}
                  {!itemVerifyLoading && !itemVerifyError && itemVerifyForm ? (
                    <div className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`${verifyFieldId}-model`}
                          className="font-medium text-slate-700 dark:text-slate-300"
                        >
                          Model{" "}
                          <span className="text-red-600 dark:text-red-400">
                            *
                          </span>
                        </label>
                        <input
                          id={`${verifyFieldId}-model`}
                          type="text"
                          value={itemVerifyForm.itemModel}
                          onChange={(e) =>
                            setItemVerifyForm((prev) =>
                              prev
                                ? { ...prev, itemModel: e.target.value }
                                : null,
                            )
                          }
                          className={verifyInputClass}
                          autoComplete="off"
                          required
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`${verifyFieldId}-brand`}
                          className="font-medium text-slate-700 dark:text-slate-300"
                        >
                          Brand
                        </label>
                        <select
                          id={`${verifyFieldId}-brand`}
                          value={itemVerifyForm.brand}
                          onChange={(e) =>
                            setItemVerifyForm((prev) =>
                              prev
                                ? { ...prev, brand: e.target.value }
                                : null,
                            )
                          }
                          className={verifyInputClass}
                          disabled={picklistsLoading || !!picklistsError}
                          required
                        >
                          <option value="">Select brand</option>
                          {consignPicklists.brands.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                        {!picklistsLoading &&
                        !picklistsError &&
                        consignPicklists.brands.length === 0 ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            No brands configured. Add options under Settings →
                            Brands we consign.
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <label
                          htmlFor={`${verifyFieldId}-category`}
                          className="font-medium text-slate-700 dark:text-slate-300"
                        >
                          Category{" "}
                          <span className="text-red-600 dark:text-red-400">
                            *
                          </span>
                        </label>
                        <select
                          id={`${verifyFieldId}-category`}
                          value={itemVerifyForm.category}
                          onChange={(e) =>
                            setItemVerifyForm((prev) =>
                              prev
                                ? { ...prev, category: e.target.value }
                                : null,
                            )
                          }
                          className={verifyInputClass}
                          disabled={picklistsLoading || !!picklistsError}
                          required
                        >
                          <option value="">Select category</option>
                          {consignPicklists.categories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        {!picklistsLoading &&
                        !picklistsError &&
                        consignPicklists.categories.length === 0 ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            No categories configured. Add options under Settings
                            → Item categories.
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <label
                          htmlFor={`${verifyFieldId}-serial`}
                          className="font-medium text-slate-700 dark:text-slate-300"
                        >
                          Serial number{" "}
                          <span className="font-normal text-slate-500 dark:text-slate-400">
                            (Optional)
                          </span>
                        </label>
                        <input
                          id={`${verifyFieldId}-serial`}
                          type="text"
                          value={itemVerifyForm.serialNumber}
                          onChange={(e) =>
                            setItemVerifyForm((prev) =>
                              prev
                                ? { ...prev, serialNumber: e.target.value }
                                : null,
                            )
                          }
                          className={`${verifyInputClass} font-mono text-xs sm:text-sm`}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`${verifyFieldId}-color`}
                          className="font-medium text-slate-700 dark:text-slate-300"
                        >
                          Color
                        </label>
                        <input
                          id={`${verifyFieldId}-color`}
                          type="text"
                          value={itemVerifyForm.color}
                          onChange={(e) =>
                            setItemVerifyForm((prev) =>
                              prev
                                ? { ...prev, color: e.target.value }
                                : null,
                            )
                          }
                          className={verifyInputClass}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`${verifyFieldId}-material`}
                          className="font-medium text-slate-700 dark:text-slate-300"
                        >
                          Material{" "}
                          <span className="font-normal text-slate-500 dark:text-slate-400">
                            (Optional)
                          </span>
                        </label>
                        <input
                          id={`${verifyFieldId}-material`}
                          type="text"
                          value={itemVerifyForm.material}
                          onChange={(e) =>
                            setItemVerifyForm((prev) =>
                              prev
                                ? { ...prev, material: e.target.value }
                                : null,
                            )
                          }
                          className={verifyInputClass}
                          autoComplete="off"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label
                          htmlFor={`${verifyFieldId}-condition`}
                          className="font-medium text-slate-700 dark:text-slate-300"
                        >
                          Condition{" "}
                          <span className="text-red-600 dark:text-red-400">
                            *
                          </span>
                        </label>
                        <input
                          id={`${verifyFieldId}-condition`}
                          type="text"
                          value={itemVerifyForm.condition}
                          onChange={(e) =>
                            setItemVerifyForm((prev) =>
                              prev
                                ? { ...prev, condition: e.target.value }
                                : null,
                            )
                          }
                          className={verifyInputClass}
                          autoComplete="off"
                          required
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label
                          htmlFor={`${verifyFieldId}-inclusions`}
                          className="font-medium text-slate-700 dark:text-slate-300"
                        >
                          Inclusions{" "}
                          <span className="text-red-600 dark:text-red-400">
                            *
                          </span>
                        </label>
                        <textarea
                          id={`${verifyFieldId}-inclusions`}
                          value={itemVerifyForm.inclusions}
                          onChange={(e) =>
                            setItemVerifyForm((prev) =>
                              prev
                                ? { ...prev, inclusions: e.target.value }
                                : null,
                            )
                          }
                          rows={3}
                          className={verifyInputClass}
                          required
                        />
                      </div>
                    </div>
                  ) : null}
                  {itemVerifyValidationError ? (
                    <p
                      className="mt-4 text-sm text-red-600 dark:text-red-400"
                      role="alert"
                    >
                      {itemVerifyValidationError}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={closeItemVerify}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={
                        itemVerifyLoading ||
                        !!itemVerifyError ||
                        !itemVerifyForm
                      }
                      onClick={continueItemVerify}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

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
