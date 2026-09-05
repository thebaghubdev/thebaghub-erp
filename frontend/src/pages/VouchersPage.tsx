import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/data-table/DataTable";
import { DatePickerField } from "../components/DatePickerField";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { useUnsavedChangesGuard } from "../context/unsaved-changes";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay } from "../lib/format-php";
import { useFeatureAccess } from "../lib/use-feature-access";
import {
  formatVoucherDate,
  formatVoucherNumberDisplay,
  voucherStatusBadgeClass,
  voucherStatusLabel,
} from "../lib/vouchers-display";

type VouchersTab = "all" | "create";

type VoucherListRow = {
  id: string;
  voucherNumber: number | null;
  clientId: string;
  clientName: string;
  amount: string;
  expirationDate: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
  updatedByName: string;
};

type ClientAccountRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

const dateTriggerClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const tabBtn =
  "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

function formatClientSummary(c: ClientAccountRow): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  const primary = name || c.username;
  return `${primary} · ${c.email}`;
}

function compareClients(a: ClientAccountRow, b: ClientAccountRow): number {
  const aLast = a.lastName.trim().toLowerCase();
  const bLast = b.lastName.trim().toLowerCase();
  if (aLast !== bLast) return aLast.localeCompare(bLast);
  return a.firstName
    .trim()
    .toLowerCase()
    .localeCompare(b.firstName.trim().toLowerCase());
}

export function VouchersPage() {
  const { token } = usePortalAuth();
  const { canEdit, readOnly } = useFeatureAccess("vouchers");
  const expirationDateId = useId();

  const [tab, setTab] = useState<VouchersTab>("all");
  const [rows, setRows] = useState<VoucherListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [forfeitTarget, setForfeitTarget] = useState<VoucherListRow | null>(
    null,
  );
  const [forfeitBusy, setForfeitBusy] = useState(false);
  const [forfeitError, setForfeitError] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientAccountRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);

  const [selectedClientId, setSelectedClientId] = useState("");
  const [amount, setAmount] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tabLeaveOpen, setTabLeaveOpen] = useState(false);

  const createDirty =
    tab === "create" &&
    (selectedClientId !== "" ||
      amount.trim() !== "" ||
      expirationDate !== "" ||
      notes.trim() !== "");

  useUnsavedChangesGuard({
    isDirty: createDirty,
    bypass: saveBusy,
    description: "You have unsaved changes to this voucher. Leave this page?",
  });

  const loadVouchers = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/vouchers", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as VoucherListRow[];
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vouchers");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadClients = useCallback(async () => {
    setClientsError(null);
    setClientsLoading(true);
    try {
      const res = await apiFetch("/api/accounts/clients", {}, token);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as ClientAccountRow[];
      setClients([...data].sort(compareClients));
    } catch (e) {
      setClientsError(
        e instanceof Error ? e.message : "Failed to load client accounts",
      );
      setClients([]);
    } finally {
      setClientsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === "all") void loadVouchers();
  }, [tab, loadVouchers]);

  useEffect(() => {
    if (tab === "create") void loadClients();
  }, [tab, loadClients]);

  const resetCreateForm = useCallback(() => {
    setSelectedClientId("");
    setAmount("");
    setExpirationDate("");
    setNotes("");
    setSaveError(null);
  }, []);

  useEffect(() => {
    if (tab === "all") resetCreateForm();
  }, [tab, resetCreateForm]);

  const handleForfeit = useCallback(async () => {
    if (!canEdit || !forfeitTarget) return;
    setForfeitBusy(true);
    setForfeitError(null);
    try {
      const res = await apiFetch(
        `/api/vouchers/${forfeitTarget.id}/forfeit`,
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
      setForfeitTarget(null);
      await loadVouchers();
    } catch (e) {
      setForfeitError(
        e instanceof Error ? e.message : "Failed to forfeit voucher",
      );
    } finally {
      setForfeitBusy(false);
    }
  }, [canEdit, forfeitTarget, token, loadVouchers]);

  const handleCreate = useCallback(async () => {
    if (!canEdit) return;
    setSaveError(null);
    if (!selectedClientId) {
      setSaveError("Select a client.");
      return;
    }
    if (!amount.trim()) {
      setSaveError("Enter an amount.");
      return;
    }
    if (!expirationDate.trim()) {
      setSaveError("Select an expiration date.");
      return;
    }

    setSaveBusy(true);
    try {
      const res = await apiFetch(
        "/api/vouchers",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: selectedClientId,
            amount: amount.trim(),
            expirationDate,
            notes: notes.trim() || undefined,
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
      resetCreateForm();
      await loadVouchers();
      setTab("all");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to create voucher");
    } finally {
      setSaveBusy(false);
    }
  }, [
    canEdit,
    selectedClientId,
    amount,
    expirationDate,
    notes,
    token,
    resetCreateForm,
    loadVouchers,
  ]);

  const listColumnHelper = createColumnHelper<VoucherListRow>();

  const listColumns = useMemo(
    () => [
      listColumnHelper.accessor("voucherNumber", {
        header: "Voucher #",
        cell: ({ getValue }) => (
          <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
            {formatVoucherNumberDisplay(getValue())}
          </span>
        ),
      }),
      listColumnHelper.accessor("clientName", {
        header: "Client",
        cell: ({ getValue }) => (
          <span className="font-medium text-slate-900 dark:text-slate-100">
            {getValue()}
          </span>
        ),
      }),
      listColumnHelper.accessor("amount", {
        header: "Amount",
        cell: ({ getValue }) => formatPhpDisplay(getValue()),
      }),
      listColumnHelper.accessor("expirationDate", {
        header: "Expiration",
        cell: ({ getValue }) => formatVoucherDate(getValue()),
      }),
      listColumnHelper.accessor("status", {
        header: "Status",
        cell: ({ getValue }) => {
          const status = getValue();
          return (
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${voucherStatusBadgeClass(status)}`}
            >
              {voucherStatusLabel(status)}
            </span>
          );
        },
      }),
      listColumnHelper.accessor("notes", {
        header: "Notes",
        cell: ({ getValue }) => {
          const value = getValue()?.trim();
          if (!value) return "—";
          return (
            <span className="max-w-[14rem] min-w-[7rem] whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">
              {value}
            </span>
          );
        },
      }),
      listColumnHelper.accessor("createdByName", {
        header: "Created by",
      }),
      listColumnHelper.accessor("createdAt", {
        header: "Created at",
        cell: ({ getValue }) => <SubmittedAtCell iso={getValue()} />,
      }),
      listColumnHelper.accessor("updatedByName", {
        header: "Updated by",
      }),
      listColumnHelper.accessor("updatedAt", {
        header: "Updated at",
        cell: ({ getValue }) => <SubmittedAtCell iso={getValue()} />,
      }),
      listColumnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => {
          if (
            readOnly ||
            row.original.status.trim().toLowerCase() !== "active"
          ) {
            return null;
          }
          return (
            <button
              type="button"
              className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
              onClick={(e) => {
                e.stopPropagation();
                setForfeitTarget(row.original);
                setForfeitError(null);
              }}
            >
              Forfeit
            </button>
          );
        },
      }),
    ],
    [listColumnHelper, readOnly],
  );

  return (
    <div className="w-full min-w-0">
      {readOnly ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          You have view-only access to this feature.
        </p>
      ) : null}
      <ConfirmDialog
        open={tabLeaveOpen}
        title="Unsaved changes"
        description="You have unsaved changes to this voucher. Switch tabs anyway?"
        cancelLabel="Stay"
        confirmLabel="Switch tab"
        onCancel={() => setTabLeaveOpen(false)}
        onConfirm={() => {
          setTab("all");
          setTabLeaveOpen(false);
        }}
      />
      <div
        className="mb-6 flex items-end gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Credit vouchers sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          id="tab-vouchers-all"
          aria-controls="panel-vouchers-all"
          className={`${tabBtn} ${
            tab === "all"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => {
            if (tab === "create" && createDirty) {
              setTabLeaveOpen(true);
              return;
            }
            setTab("all");
          }}
        >
          All Vouchers
        </button>
        {!readOnly ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "create"}
            id="tab-vouchers-create"
            aria-controls="panel-vouchers-create"
            className={`${tabBtn} ${
              tab === "create"
                ? "border-violet-600 text-violet-700 dark:text-violet-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
            onClick={() => setTab("create")}
          >
            Create voucher
          </button>
        ) : null}
      </div>

      {tab === "all" && (
        <section
          id="panel-vouchers-all"
          role="tabpanel"
          aria-labelledby="tab-vouchers-all"
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
            tableId="vouchers-all"
            data={rows}
            columns={listColumns}
            isLoading={loading}
            emptyMessage="No vouchers yet."
            hideEmptyState={!!error}
            getRowId={(r) => r.id}
          />
        </section>
      )}

      {tab === "create" && !readOnly && (
        <section
          id="panel-vouchers-create"
          role="tabpanel"
          aria-labelledby="tab-vouchers-create"
          className="min-h-[12rem] max-w-xl space-y-4"
        >
          {clientsError ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            >
              {clientsError}
            </p>
          ) : null}

          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Client
            <select
              className={fieldClass}
              value={selectedClientId}
              disabled={clientsLoading}
              onChange={(e) => setSelectedClientId(e.target.value)}
            >
              <option value="">
                {clientsLoading ? "Loading clients…" : "Select a client"}
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatClientSummary(c)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Amount
            <input
              type="number"
              min={0}
              step="0.01"
              className={fieldClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>

          <div>
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Expiration date
            </span>
            <DatePickerField
              id={expirationDateId}
              value={expirationDate}
              onChange={setExpirationDate}
              triggerClassName={`mt-1 ${dateTriggerClass}`}
              disablePast
              dialogAriaLabel="Choose voucher expiration date"
            />
          </div>

          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Notes
            <textarea
              className={`${fieldClass} min-h-[6rem] resize-y`}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {saveError ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            >
              {saveError}
            </p>
          ) : null}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={saveBusy}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleCreate()}
            >
              {saveBusy ? "Saving…" : "Save voucher"}
            </button>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={forfeitTarget != null}
        title="Forfeit voucher?"
        description={
          forfeitTarget
            ? forfeitTarget.voucherNumber != null
              ? `Forfeit voucher #${forfeitTarget.voucherNumber} (${formatPhpDisplay(forfeitTarget.amount)}) for ${forfeitTarget.clientName}? This cannot be undone.`
              : `Forfeit the ${formatPhpDisplay(forfeitTarget.amount)} voucher for ${forfeitTarget.clientName}? This cannot be undone.`
            : ""
        }
        confirmLabel="Forfeit"
        danger
        busy={forfeitBusy}
        errorMessage={forfeitError}
        onCancel={() => {
          if (forfeitBusy) return;
          setForfeitTarget(null);
          setForfeitError(null);
        }}
        onConfirm={handleForfeit}
      />
    </div>
  );
}
