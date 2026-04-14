import {
  createColumnHelper,
  type CellContext,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "./data-table/DataTable";
import { DatePickerField } from "./DatePickerField";
import { SubmittedAtCell } from "./SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import {
  branchLabel,
  DELIVERY_MODE_OPTIONS,
  modeOfTransferLabel,
  PULLOUT_MODE_OPTIONS,
  type BranchCode,
  type ScheduleKind,
  scheduleTypeLabel,
} from "../lib/consignment-schedule-labels";
import { formatInquiryStatus } from "../lib/format-inquiry-status";

type WizardInquiryRow = {
  id: string;
  sku: string;
  itemLabel: string;
  status: string;
  createdAt: string;
  consignorName: string;
  brand: string;
  category: string;
  itemModel: string;
};

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500";

const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800";

const fieldLabel =
  "block text-sm font-medium text-slate-700 dark:text-slate-300";

const inputSelectClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const dateTriggerClass =
  "mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const inquiryColHelper = createColumnHelper<WizardInquiryRow>();

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

type Props = {
  onScheduleSaved?: () => void;
};

export function CreateScheduleWizard({ onScheduleSaved }: Props) {
  const { token } = usePortalAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("delivery");
  const [mode, setMode] = useState<string>(DELIVERY_MODE_OPTIONS[0].value);
  const [branch, setBranch] = useState<BranchCode>("pasig");
  const [deliveryDate, setDeliveryDate] = useState("");

  const [inquiries, setInquiries] = useState<WizardInquiryRow[]>([]);
  const [inquiryLoading, setInquiryLoading] = useState(false);
  const [inquiryError, setInquiryError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    if (scheduleKind === "delivery") {
      setMode(DELIVERY_MODE_OPTIONS[0].value);
    } else {
      setMode(PULLOUT_MODE_OPTIONS[0].value);
    }
  }, [scheduleKind]);

  useEffect(() => {
    setSelectedIds([]);
  }, [scheduleKind]);

  const modeOptions =
    scheduleKind === "delivery" ? DELIVERY_MODE_OPTIONS : PULLOUT_MODE_OPTIONS;

  const loadInquiries = useCallback(async () => {
    setInquiryError(null);
    setInquiryLoading(true);
    const status =
      scheduleKind === "delivery" ? "for_delivery" : "for_pullout";
    try {
      const res = await apiFetch(
        `/api/inquiries?status=${encodeURIComponent(status)}`,
        {},
        token,
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as WizardInquiryRow[];
      setInquiries(Array.isArray(data) ? data : []);
    } catch (e) {
      setInquiries([]);
      setInquiryError(
        e instanceof Error ? e.message : "Failed to load inquiries",
      );
    } finally {
      setInquiryLoading(false);
    }
  }, [scheduleKind, token]);

  useEffect(() => {
    if (step !== 2) return;
    void loadInquiries();
  }, [step, loadInquiries]);

  const toggleId = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }, []);

  const toggleAllVisible = useCallback(
    (checked: boolean) => {
      const ids = inquiries.map((r) => r.id);
      setSelectedIds((prev) => {
        if (!checked) {
          return prev.filter((id) => !ids.includes(id));
        }
        const set = new Set([...prev, ...ids]);
        return [...set];
      });
    },
    [inquiries],
  );

  const allSelected =
    inquiries.length > 0 &&
    inquiries.every((r) => selectedIds.includes(r.id));

  const selectedRows = useMemo(() => {
    const set = new Set(selectedIds);
    return inquiries.filter((r) => set.has(r.id));
  }, [inquiries, selectedIds]);

  const canAdvanceFromStep1 =
    deliveryDate.trim() !== "" && mode !== "";

  const goNextFromStep1 = () => {
    setStep1Error(null);
    if (!canAdvanceFromStep1) {
      setStep1Error(
        "Choose type, mode of transfer, branch, and delivery date to continue.",
      );
      return;
    }
    setStep(2);
  };

  const goNextFromStep2 = () => {
    setStep(3);
  };

  const saveSchedule = async () => {
    setSaveError(null);
    if (!canAdvanceFromStep1) {
      setSaveError("Complete schedule details before saving.");
      return;
    }
    if (selectedIds.length === 0) {
      setSaveError("Select at least one inquiry.");
      return;
    }
    setSaveLoading(true);
    try {
      const res = await apiFetch(
        "/api/consignment-schedules",
        {
          method: "POST",
          body: JSON.stringify({
            type: scheduleKind,
            modeOfTransfer: mode,
            branch,
            deliveryDate,
            inquiryIds: selectedIds,
          }),
        },
        token,
      );
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res));
      }
      onScheduleSaved?.();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save schedule");
    } finally {
      setSaveLoading(false);
    }
  };

  const inquiryColumns = useMemo(
    () => [
      inquiryColHelper.display({
        id: "select",
        header: () => (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => toggleAllVisible(e.target.checked)}
            disabled={inquiryLoading || inquiries.length === 0}
            className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            aria-label="Select all inquiries in list"
          />
        ),
        cell: ({ row }: CellContext<WizardInquiryRow, unknown>) => (
          <input
            type="checkbox"
            checked={selectedIds.includes(row.original.id)}
            onChange={(e) => toggleId(row.original.id, e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            aria-label={`Select inquiry ${row.original.sku}`}
          />
        ),
      }),
      inquiryColHelper.accessor("sku", {
        header: "SKU",
        cell: ({ getValue }) => (
          <span className="break-all font-mono text-[0.65rem] text-slate-900 dark:text-slate-100">
            {getValue()}
          </span>
        ),
      }),
      inquiryColHelper.accessor("consignorName", {
        header: "Consignor",
        cell: ({ getValue }) => (
          <span className="break-words font-medium">{getValue()}</span>
        ),
      }),
      inquiryColHelper.accessor("itemModel", {
        header: "Model",
        cell: ({ getValue }) => (
          <span className="break-words text-slate-800 dark:text-slate-200">
            {getValue()}
          </span>
        ),
      }),
      inquiryColHelper.accessor((row) => formatInquiryStatus(row.status), {
        id: "status",
        header: "Status",
        cell: ({ getValue }) => (
          <span className="capitalize text-slate-700 dark:text-slate-300">
            {getValue()}
          </span>
        ),
      }),
      inquiryColHelper.accessor("createdAt", {
        header: "Submitted",
        sortingFn: "alphanumeric",
        cell: ({ row }) => (
          <span className="text-slate-600 dark:text-slate-400">
            <SubmittedAtCell iso={row.original.createdAt} />
          </span>
        ),
      }),
    ],
    [
      allSelected,
      inquiryLoading,
      inquiries.length,
      selectedIds,
      toggleAllVisible,
      toggleId,
    ],
  );

  const deliveryDateLabel = useMemo(() => {
    if (!deliveryDate.trim()) return "—";
    try {
      const d = new Date(deliveryDate + "T12:00:00");
      if (Number.isNaN(d.getTime())) return deliveryDate;
      return format(d, "MMM d, yyyy");
    } catch {
      return deliveryDate;
    }
  }, [deliveryDate]);

  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        Step {step} of 3 — Create schedule
      </p>

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Define the schedule
          </h2>
          {step1Error && (
            <p
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
              role="alert"
            >
              {step1Error}
            </p>
          )}
          <div>
            <label htmlFor="sched-type" className={fieldLabel}>
              Type
            </label>
            <select
              id="sched-type"
              value={scheduleKind}
              onChange={(e) =>
                setScheduleKind(e.target.value as ScheduleKind)
              }
              className={inputSelectClass}
            >
              <option value="delivery">Delivery</option>
              <option value="pullout">Pullout</option>
            </select>
          </div>
          <div>
            <label htmlFor="sched-mode" className={fieldLabel}>
              Mode of transfer
            </label>
            <select
              id="sched-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className={inputSelectClass}
            >
              {modeOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sched-branch" className={fieldLabel}>
              Branch
            </label>
            <select
              id="sched-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value as BranchCode)}
              className={inputSelectClass}
            >
              <option value="pasig">Pasig</option>
              <option value="makati">Makati</option>
            </select>
          </div>
          <div>
            <label htmlFor="sched-delivery-date" className={fieldLabel}>
              Delivery date
            </label>
            <DatePickerField
              id="sched-delivery-date"
              value={deliveryDate}
              onChange={setDeliveryDate}
              triggerClassName={dateTriggerClass}
              placeholder="Select delivery date"
              dialogAriaLabel="Choose delivery date"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              className={btnPrimary}
              onClick={goNextFromStep1}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Select inquiry items
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Showing inquiries with status{" "}
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {scheduleKind === "delivery" ? "For Delivery" : "For Pullout"}
            </span>
            . Select one or more rows.
          </p>
          {inquiryError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {inquiryError}
            </p>
          )}
          <DataTable<WizardInquiryRow>
            data={inquiries}
            columns={inquiryColumns}
            isLoading={inquiryLoading}
            emptyMessage="No inquiries match this status yet."
            hideEmptyState={!!inquiryError}
            getRowId={(row) => row.id}
            getRowAriaLabel={(row) => `Inquiry ${row.sku}`}
            tableClassName="w-full min-w-[640px] table-fixed border-collapse text-left"
          />
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button type="button" className={btnPrimary} onClick={goNextFromStep2}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Review
          </h2>
          {saveError && (
            <p
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              {saveError}
            </p>
          )}
          <dl className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4 text-sm dark:border-slate-700 dark:bg-slate-950/50 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Type</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {scheduleTypeLabel(scheduleKind)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                Mode of transfer
              </dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {modeOfTransferLabel(scheduleKind, mode)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Branch</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {branchLabel(branch)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                Delivery date
              </dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {deliveryDateLabel}
              </dd>
            </div>
          </dl>
          <div>
            <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Selected inquiries ({selectedIds.length})
            </h3>
            {selectedRows.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                No inquiries selected.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                {selectedRows.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                      {r.sku}
                    </span>
                    <span className="min-w-0 flex-1 text-slate-800 dark:text-slate-200">
                      {r.itemLabel || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setStep(2)}
              disabled={saveLoading}
            >
              Back
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void saveSchedule()}
              disabled={saveLoading || selectedIds.length === 0}
            >
              {saveLoading ? "Saving…" : "Save schedule"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
