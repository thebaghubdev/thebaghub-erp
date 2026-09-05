import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/data-table/DataTable";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import {
  LOGISTICS_BRANCH_OPTIONS,
  branchLabel,
  type BranchCode,
} from "../lib/consignment-schedule-labels";
import {
  LOGISTICS_MODE_OPTIONS,
  LOGISTICS_TRANSFER_STATUS,
  formatLogisticsTransferDate,
  isInventoryEligibleForLogistics,
  logisticsStatusBadgeClass,
} from "../lib/logistics-display";
import { useFeatureAccess } from "../lib/use-feature-access";

function isPendingDispatchStatus(status: string): boolean {
  return (
    status.trim().toLowerCase() ===
    LOGISTICS_TRANSFER_STATUS.pendingDispatch.toLowerCase()
  );
}

function isInTransitStatus(status: string): boolean {
  return (
    status.trim().toLowerCase() ===
    LOGISTICS_TRANSFER_STATUS.inTransit.toLowerCase()
  );
}

function canCancelTransfer(status: string): boolean {
  return isPendingDispatchStatus(status) || isInTransitStatus(status);
}

type LogisticsTab = "all" | "create";

type LogisticsListRow = {
  id: string;
  transferDate: string;
  sendingBranch: string;
  receivingBranch: string;
  modeOfTransfer: string;
  status: string;
  itemCount: number;
  createdAt: string;
  createdByName: string;
  trackingName: string;
  trackingNumber: string;
};

type LogisticsItemRow = {
  id: string;
  inventoryItemId: string;
  sku: string;
  itemLabel: string;
  status: string;
  currentBranch: string;
  logisticsStatus: string;
};

type LogisticsDetail = LogisticsListRow & {
  reasonForTransfer: string;
  notes: string | null;
  items: LogisticsItemRow[];
};

type InventoryPickerRow = {
  id: string;
  sku: string;
  status: string;
  currentBranch: string;
  itemLabel: string;
  logisticsStatus: string;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

const listColumnHelper = createColumnHelper<LogisticsListRow>();

const logisticsListColumns = [
  listColumnHelper.accessor("transferDate", {
    header: "Transfer date",
    cell: ({ getValue }) => formatLogisticsTransferDate(getValue()),
  }),
  listColumnHelper.display({
    id: "route",
    header: "Route",
    cell: ({ row }) =>
      `${branchLabel(row.original.sendingBranch)} → ${branchLabel(row.original.receivingBranch)}`,
  }),
  listColumnHelper.accessor("modeOfTransfer", {
    header: "Mode",
  }),
  listColumnHelper.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => {
      const status = getValue();
      return (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${logisticsStatusBadgeClass(status)}`}
        >
          {status}
        </span>
      );
    },
  }),
  listColumnHelper.accessor("itemCount", {
    header: "Items",
  }),
  listColumnHelper.accessor("trackingName", {
    header: "Driver / courier",
  }),
  listColumnHelper.accessor("createdByName", {
    header: "Created by",
  }),
  listColumnHelper.accessor("createdAt", {
    header: "Created",
    cell: ({ getValue }) => <SubmittedAtCell iso={getValue()} />,
  }),
];

const pickerColumnHelper = createColumnHelper<InventoryPickerRow>();

function buildPickerColumns(params: {
  selectableInventory: InventoryPickerRow[];
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
}) {
  const { selectableInventory, selectedIds, setSelectedIds } = params;
  return [
    pickerColumnHelper.display({
      id: "__select",
      header: () => {
        const eligibleIds = selectableInventory.map((r) => r.id);
        const allSelected =
          eligibleIds.length > 0 &&
          eligibleIds.every((id) => selectedIds.has(id));
        return (
          <input
            type="checkbox"
            aria-label="Select all eligible items"
            checked={allSelected}
            disabled={eligibleIds.length === 0}
            onChange={() => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (allSelected) {
                  for (const id of eligibleIds) next.delete(id);
                } else {
                  for (const id of eligibleIds) next.add(id);
                }
                return next;
              });
            }}
          />
        );
      },
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.original.sku}`}
          checked={selectedIds.has(row.original.id)}
          onChange={() => {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (next.has(row.original.id)) next.delete(row.original.id);
              else next.add(row.original.id);
              return next;
            });
          }}
        />
      ),
    }),
    pickerColumnHelper.accessor("sku", {
      header: "SKU",
      cell: ({ getValue }) => (
        <span className="font-mono text-xs">{getValue()}</span>
      ),
    }),
    pickerColumnHelper.accessor("itemLabel", {
      header: "Item",
    }),
    pickerColumnHelper.accessor("status", {
      header: "Status",
      cell: ({ row }) => (
        <InventoryStatusBadge status={row.original.status} />
      ),
    }),
  ];
}

const itemModalColumnHelper = createColumnHelper<LogisticsItemRow>();

const logisticsItemColumns = [
  itemModalColumnHelper.accessor("sku", {
    header: "SKU",
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-slate-900 dark:text-slate-100">
        {getValue()}
      </span>
    ),
  }),
  itemModalColumnHelper.accessor("itemLabel", {
    header: "Item",
    cell: ({ getValue }) => (
      <span className="text-slate-800 dark:text-slate-200">{getValue()}</span>
    ),
  }),
  itemModalColumnHelper.accessor("status", {
    header: "Status",
    cell: ({ row }) => (
      <InventoryStatusBadge status={row.original.status} />
    ),
  }),
  itemModalColumnHelper.accessor("currentBranch", {
    header: "Branch",
    cell: ({ getValue }) => (
      <span className="text-slate-800 dark:text-slate-200">
        {branchLabel(getValue())}
      </span>
    ),
  }),
];

function todayDateInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function LogisticsPage() {
  const { token } = usePortalAuth();
  const { canEdit, readOnly } = useFeatureAccess("logistics");
  const [tab, setTab] = useState<LogisticsTab>("all");
  const [rows, setRows] = useState<LogisticsListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogisticsDetail | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [reservedInventoryIds, setReservedInventoryIds] = useState<Set<string>>(
    () => new Set(),
  );

  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [transferDate, setTransferDate] = useState(todayDateInputValue);
  const [sendingBranch, setSendingBranch] = useState<BranchCode | "">("");
  const [receivingBranch, setReceivingBranch] = useState<BranchCode | "">("");
  const [reasonForTransfer, setReasonForTransfer] = useState("");
  const [modeOfTransfer, setModeOfTransfer] = useState("");
  const [trackingName, setTrackingName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [inventoryRows, setInventoryRows] = useState<InventoryPickerRow[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadLogistics = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/logistics", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as LogisticsListRow[];
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logistics");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === "all") void loadLogistics();
  }, [tab, loadLogistics]);

  const loadInventory = useCallback(async () => {
    setInventoryError(null);
    setInventoryLoading(true);
    try {
      const [invRes, reservedRes] = await Promise.all([
        apiFetch("/api/inventory", {}, token),
        apiFetch("/api/logistics/reserved-item-ids", {}, token),
      ]);
      if (!invRes.ok) throw new Error(`Request failed (${invRes.status})`);
      const data = (await invRes.json()) as InventoryPickerRow[];
      setInventoryRows(data);
      if (reservedRes.ok) {
        const ids = (await reservedRes.json()) as string[];
        setReservedInventoryIds(new Set(ids));
      } else {
        setReservedInventoryIds(new Set());
      }
    } catch (e) {
      setInventoryError(
        e instanceof Error ? e.message : "Failed to load inventory",
      );
      setInventoryRows([]);
      setReservedInventoryIds(new Set());
    } finally {
      setInventoryLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === "create") void loadInventory();
  }, [tab, loadInventory]);

  const resetWizard = useCallback(() => {
    setWizardStep(1);
    setTransferDate(todayDateInputValue());
    setSendingBranch("");
    setReceivingBranch("");
    setReasonForTransfer("");
    setModeOfTransfer("");
    setTrackingName("");
    setTrackingNumber("");
    setNotes("");
    setSelectedIds(new Set());
    setSaveError(null);
  }, []);

  useEffect(() => {
    if (tab === "all") resetWizard();
  }, [tab, resetWizard]);

  const openDetail = useCallback(
    async (id: string) => {
      setDetailOpen(true);
      setDetailLoading(true);
      setDetailError(null);
      setDetail(null);
      try {
        const res = await apiFetch(`/api/logistics/${id}`, {}, token);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as LogisticsDetail;
        setDetail(data);
      } catch (e) {
        setDetailError(
          e instanceof Error ? e.message : "Failed to load transfer details",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [token],
  );

  const closeDetail = () => {
    if (completeBusy || dispatchBusy || cancelBusy) return;
    setDetailOpen(false);
    setCompleteOpen(false);
    setDispatchOpen(false);
    setCancelOpen(false);
    setCompleteError(null);
    setDispatchError(null);
    setCancelError(null);
  };

  const step1Valid = useMemo(() => {
    return (
      transferDate.trim() !== "" &&
      sendingBranch !== "" &&
      receivingBranch !== "" &&
      sendingBranch !== receivingBranch &&
      reasonForTransfer.trim() !== "" &&
      modeOfTransfer !== "" &&
      trackingName.trim() !== "" &&
      trackingNumber.trim() !== ""
    );
  }, [
    transferDate,
    sendingBranch,
    receivingBranch,
    reasonForTransfer,
    modeOfTransfer,
    trackingName,
    trackingNumber,
  ]);

  const selectableInventory = useMemo(() => {
    if (!sendingBranch) return [];
    const branchNorm = sendingBranch.toLowerCase();
    return inventoryRows.filter(
      (r) =>
        r.currentBranch.trim().toLowerCase() === branchNorm &&
        isInventoryEligibleForLogistics(r) &&
        !reservedInventoryIds.has(r.id),
    );
  }, [inventoryRows, sendingBranch, reservedInventoryIds]);

  const pickerColumns = useMemo(
    () =>
      buildPickerColumns({
        selectableInventory,
        selectedIds,
        setSelectedIds,
      }),
    [selectableInventory, selectedIds],
  );

  const handleSaveTransfer = async () => {
    if (!canEdit) return;
    if (selectedIds.size === 0) {
      setSaveError("Select at least one inventory item.");
      return;
    }
    setSaveBusy(true);
    setSaveError(null);
    try {
      const res = await apiFetch(
        "/api/logistics",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transferDate,
            sendingBranch,
            receivingBranch,
            reasonForTransfer: reasonForTransfer.trim(),
            modeOfTransfer,
            trackingName: trackingName.trim(),
            trackingNumber: trackingNumber.trim(),
            notes: notes.trim() || undefined,
            inventoryItemIds: [...selectedIds],
          }),
        },
        token,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const msg = body?.message;
        const text = Array.isArray(msg)
          ? msg.join(", ")
          : typeof msg === "string"
            ? msg
            : `Request failed (${res.status})`;
        throw new Error(text);
      }
      resetWizard();
      setTab("all");
      await loadLogistics();
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Failed to create transfer",
      );
    } finally {
      setSaveBusy(false);
    }
  };

  const handleCompleteTransfer = async () => {
    if (!canEdit || !detail) return;
    setCompleteBusy(true);
    setCompleteError(null);
    try {
      const res = await apiFetch(
        `/api/logistics/${detail.id}/complete`,
        { method: "POST" },
        token,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const msg = body?.message;
        const text = Array.isArray(msg)
          ? msg.join(", ")
          : typeof msg === "string"
            ? msg
            : `Request failed (${res.status})`;
        throw new Error(text);
      }
      const updated = (await res.json()) as LogisticsDetail;
      setDetail(updated);
      setCompleteOpen(false);
      setDetailOpen(false);
      await loadLogistics();
      void loadInventory();
    } catch (e) {
      setCompleteError(
        e instanceof Error ? e.message : "Failed to complete transfer",
      );
    } finally {
      setCompleteBusy(false);
    }
  };

  const handleDispatchTransfer = async () => {
    if (!canEdit || !detail) return;
    setDispatchBusy(true);
    setDispatchError(null);
    try {
      const res = await apiFetch(
        `/api/logistics/${detail.id}/dispatch`,
        { method: "POST" },
        token,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const msg = body?.message;
        const text = Array.isArray(msg)
          ? msg.join(", ")
          : typeof msg === "string"
            ? msg
            : `Request failed (${res.status})`;
        throw new Error(text);
      }
      const updated = (await res.json()) as LogisticsDetail;
      setDetail(updated);
      setDispatchOpen(false);
      await loadLogistics();
      void loadInventory();
    } catch (e) {
      setDispatchError(
        e instanceof Error ? e.message : "Failed to confirm dispatch",
      );
    } finally {
      setDispatchBusy(false);
    }
  };

  const handleCancelTransfer = async () => {
    if (!canEdit || !detail) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      const res = await apiFetch(
        `/api/logistics/${detail.id}/cancel`,
        { method: "POST" },
        token,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const msg = body?.message;
        const text = Array.isArray(msg)
          ? msg.join(", ")
          : typeof msg === "string"
            ? msg
            : `Request failed (${res.status})`;
        throw new Error(text);
      }
      setCancelOpen(false);
      setDetailOpen(false);
      setDetail(null);
      await loadLogistics();
      void loadInventory();
    } catch (e) {
      setCancelError(
        e instanceof Error ? e.message : "Failed to cancel transfer",
      );
    } finally {
      setCancelBusy(false);
    }
  };

  const tabBtn =
    "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

  return (
    <div className="w-full min-w-0">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Logistics
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Transfer inventory between branches and track in-transit items.
        </p>
      </div>

      {readOnly ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          You have view-only access to this feature.
        </p>
      ) : null}

      <div
        className="mb-6 flex items-end gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Logistics sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          id="tab-logistics-all"
          aria-controls="panel-logistics-all"
          className={`${tabBtn} ${
            tab === "all"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => setTab("all")}
        >
          All Transactions
        </button>
        {!readOnly ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "create"}
            id="tab-logistics-create"
            aria-controls="panel-logistics-create"
            className={`${tabBtn} ${
              tab === "create"
                ? "border-violet-600 text-violet-700 dark:text-violet-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
            onClick={() => setTab("create")}
          >
            Create Transaction
          </button>
        ) : null}
      </div>

      {tab === "all" && (
        <section
          id="panel-logistics-all"
          role="tabpanel"
          aria-labelledby="tab-logistics-all"
        >
          {error ? (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            >
              {error}
            </p>
          ) : null}
          <DataTable
            tableId="logistics-all"
            data={rows}
            columns={logisticsListColumns}
            isLoading={loading}
            emptyMessage="No transfers yet."
            hideEmptyState={!!error}
            getRowId={(r) => r.id}
            onRowClick={(r) => void openDetail(r.id)}
            getRowAriaLabel={(r) =>
              `Transfer ${formatLogisticsTransferDate(r.transferDate)}, ${branchLabel(r.sendingBranch)} to ${branchLabel(r.receivingBranch)}`
            }
          />
        </section>
      )}

      {tab === "create" && !readOnly && (
        <section
          id="panel-logistics-create"
          role="tabpanel"
          aria-labelledby="tab-logistics-create"
          className="min-h-[12rem] max-w-3xl space-y-6"
        >
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            Step {wizardStep} of 2 —{" "}
            {wizardStep === 1 ? "Transfer details" : "Select inventory items"}
          </p>

          {wizardStep === 1 ? (
            <div className="grid max-w-xl gap-4">
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                Transfer date
                <input
                  type="date"
                  className={fieldClass}
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                Sending branch
                <select
                  className={fieldClass}
                  value={sendingBranch}
                  onChange={(e) => {
                    const v = e.target.value as BranchCode | "";
                    setSendingBranch(v);
                    setReceivingBranch((prev) => (prev === v ? "" : prev));
                    setSelectedIds(new Set());
                  }}
                >
                  <option value="">Select branch…</option>
                  {LOGISTICS_BRANCH_OPTIONS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                Receiving branch
                <select
                  className={fieldClass}
                  value={receivingBranch}
                  disabled={!sendingBranch}
                  onChange={(e) =>
                    setReceivingBranch(e.target.value as BranchCode | "")
                  }
                >
                  <option value="">
                    {sendingBranch ? "Select branch…" : "Select sending branch first"}
                  </option>
                  {LOGISTICS_BRANCH_OPTIONS.map((b) => (
                    <option
                      key={b.value}
                      value={b.value}
                      disabled={b.value === sendingBranch}
                    >
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                Reason for transfer
                <textarea
                  className={fieldClass}
                  rows={3}
                  value={reasonForTransfer}
                  onChange={(e) => setReasonForTransfer(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                Mode of transfer
                <select
                  className={fieldClass}
                  value={modeOfTransfer}
                  onChange={(e) => setModeOfTransfer(e.target.value)}
                >
                  <option value="">Select mode…</option>
                  {LOGISTICS_MODE_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                Driver / courier name
                <input
                  type="text"
                  className={fieldClass}
                  value={trackingName}
                  onChange={(e) => setTrackingName(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                Vehicle plate no. / tracking no.
                <input
                  type="text"
                  className={fieldClass}
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                Notes{" "}
                <span className="font-normal text-slate-500">(optional)</span>
                <textarea
                  className={fieldClass}
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={!step1Valid}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                  onClick={() => setWizardStep(2)}
                >
                  Next: select items
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {inventoryError ? (
                <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                  {inventoryError}
                </p>
              ) : null}
              {saveError ? (
                <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                  {saveError}
                </p>
              ) : null}
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Showing items at{" "}
                <strong>{branchLabel(sendingBranch)}</strong> that are eligible
                for transfer ({selectableInventory.length} item
                {selectableInventory.length === 1 ? "" : "s"}).
              </p>
              {inventoryLoading ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Loading inventory…
                </p>
              ) : (
                <DataTable
                  tableId="logistics-create-items"
                  data={selectableInventory}
                  columns={pickerColumns}
                />
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  onClick={() => setWizardStep(1)}
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={saveBusy || selectedIds.size === 0}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                  onClick={() => void handleSaveTransfer()}
                >
                  {saveBusy ? "Saving…" : "Save transfer"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {detailOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby="logistics-detail-title"
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50"
                aria-label="Close"
                onClick={closeDetail}
              />
              <div className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <div className="relative border-b border-slate-200 px-4 py-3 pr-12 dark:border-slate-800">
                  <button
                    type="button"
                    className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    aria-label="Close dialog"
                    disabled={completeBusy || dispatchBusy || cancelBusy}
                    onClick={closeDetail}
                  >
                    <span className="text-2xl leading-none" aria-hidden>
                      ×
                    </span>
                  </button>
                  <h2
                    id="logistics-detail-title"
                    className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                  >
                    Transfer details
                  </h2>
                  {detail ? (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {formatLogisticsTransferDate(detail.transferDate)} ·{" "}
                      {branchLabel(detail.sendingBranch)} →{" "}
                      {branchLabel(detail.receivingBranch)} ·{" "}
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${logisticsStatusBadgeClass(detail.status)}`}
                      >
                        {detail.status}
                      </span>
                    </p>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 text-slate-900 dark:text-slate-100">
                  {detailLoading ? (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Loading…
                    </p>
                  ) : detailError ? (
                    <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                      {detailError}
                    </p>
                  ) : detail ? (
                    <div className="space-y-4">
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">
                            Mode
                          </dt>
                          <dd className="font-medium text-slate-900 dark:text-slate-100">
                            {detail.modeOfTransfer}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">
                            Driver / courier
                          </dt>
                          <dd className="font-medium text-slate-900 dark:text-slate-100">
                            {detail.trackingName}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">
                            Tracking / plate
                          </dt>
                          <dd className="font-medium text-slate-900 dark:text-slate-100">
                            {detail.trackingNumber}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">
                            Created by
                          </dt>
                          <dd className="font-medium text-slate-900 dark:text-slate-100">
                            {detail.createdByName}
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-slate-500 dark:text-slate-400">
                            Reason
                          </dt>
                          <dd className="whitespace-pre-wrap font-medium text-slate-900 dark:text-slate-100">
                            {detail.reasonForTransfer}
                          </dd>
                        </div>
                        {detail.notes ? (
                          <div className="sm:col-span-2">
                            <dt className="text-slate-500 dark:text-slate-400">
                              Notes
                            </dt>
                            <dd className="whitespace-pre-wrap font-medium text-slate-900 dark:text-slate-100">
                              {detail.notes}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      <DataTable
                        tableId={`logistics-detail-${detail.id}`}
                        data={detail.items}
                        columns={logisticsItemColumns}
                      />
                    </div>
                  ) : null}
                </div>
                {detail && !readOnly && canCancelTransfer(detail.status) ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
                    <button
                      type="button"
                      className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40"
                      onClick={() => {
                        setCancelError(null);
                        setCancelOpen(true);
                      }}
                    >
                      Cancel Transfer
                    </button>
                    <div className="flex flex-wrap justify-end gap-2">
                      {isPendingDispatchStatus(detail.status) ? (
                        <button
                          type="button"
                          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500"
                          onClick={() => {
                            setDispatchError(null);
                            setDispatchOpen(true);
                          }}
                        >
                          Confirm dispatch
                        </button>
                      ) : null}
                      {isInTransitStatus(detail.status) ? (
                        <button
                          type="button"
                          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500"
                          onClick={() => {
                            setCompleteError(null);
                            setCompleteOpen(true);
                          }}
                        >
                          All Items Received
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel this transfer?"
        description={
          detail
            ? `This will cancel the transfer and release ${detail.items.length} item${detail.items.length === 1 ? "" : "s"} as In Stock at ${branchLabel(detail.sendingBranch)}.`
            : ""
        }
        confirmLabel="Cancel Transfer"
        danger
        busy={cancelBusy}
        errorMessage={cancelError}
        onCancel={() => {
          if (!cancelBusy) setCancelOpen(false);
        }}
        onConfirm={() => void handleCancelTransfer()}
      />

      <ConfirmDialog
        open={dispatchOpen}
        title="Confirm dispatch?"
        description={
          detail
            ? `Items will leave ${branchLabel(detail.sendingBranch)} and be marked In Transit (${detail.items.length} item${detail.items.length === 1 ? "" : "s"}).`
            : ""
        }
        confirmLabel="Confirm dispatch"
        busy={dispatchBusy}
        errorMessage={dispatchError}
        onCancel={() => {
          if (!dispatchBusy) setDispatchOpen(false);
        }}
        onConfirm={() => void handleDispatchTransfer()}
      />

      <ConfirmDialog
        open={completeOpen}
        title="Mark all items as received?"
        description={
          detail
            ? `This will complete the transfer to ${branchLabel(detail.receivingBranch)} and set ${detail.items.length} item(s) back to In Stock at that branch.`
            : ""
        }
        confirmLabel="Confirm received"
        busy={completeBusy}
        errorMessage={completeError}
        onCancel={() => {
          if (!completeBusy) setCompleteOpen(false);
        }}
        onConfirm={() => void handleCompleteTransfer()}
      />
    </div>
  );
}
