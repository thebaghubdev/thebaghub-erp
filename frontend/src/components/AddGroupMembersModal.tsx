import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { EmployeeMultiSelect } from "./EmployeeMultiSelect";
import { apiFetch } from "../lib/api";
import {
  readApiMessage,
  type MessagingEmployeeOption,
} from "./CreateConversationModal";

type EmployeesResponse = {
  employees: MessagingEmployeeOption[];
};

type Props = {
  open: boolean;
  token: string;
  excludedUserIds: string[];
  busy?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onAdd: (memberUserIds: string[]) => Promise<void>;
};

function employeeLabel(e: MessagingEmployeeOption): string {
  const name = `${e.firstName} ${e.lastName}`.trim();
  return e.position ? `${name} · ${e.position}` : name;
}

export function AddGroupMembersModal({
  open,
  token,
  excludedUserIds,
  busy = false,
  errorMessage = null,
  onCancel,
  onAdd,
}: Props) {
  const titleId = useId();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [employees, setEmployees] = useState<MessagingEmployeeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const excluded = useMemo(() => new Set(excludedUserIds), [excludedUserIds]);

  const resetForm = useCallback(() => {
    setSelectedIds([]);
    setLoadError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const res = await apiFetch("/api/messaging/employees", {}, token);
        const body = (await res.json().catch(() => null)) as
          | EmployeesResponse
          | { message?: string | string[] }
          | null;
        if (!res.ok) {
          if (!cancelled) {
            setLoadError(readApiMessage(body, "Could not load employees"));
          }
          return;
        }
        const data = body as EmployeesResponse;
        if (!cancelled) {
          setEmployees(data.employees ?? []);
        }
      } catch {
        if (!cancelled) setLoadError("Could not load employees");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, token, resetForm]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  const candidates = useMemo(
    () => employees.filter((e) => !excluded.has(e.userId)),
    [employees, excluded],
  );

  if (!open || typeof document === "undefined") return null;

  const groupOptions = candidates.map((e) => ({
    id: e.userId,
    label: employeeLabel(e),
  }));

  const canSubmit =
    !busy && !loading && !loadError && selectedIds.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Dismiss"
        disabled={busy}
        onClick={() => !busy && onCancel()}
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2
          id={titleId}
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          Add staff
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Add other staff members to this group conversation.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading employees…</p>
        ) : loadError ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {loadError}
          </p>
        ) : candidates.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Everyone is already in this conversation.
          </p>
        ) : (
          <div className="mt-4">
            <EmployeeMultiSelect
              label="Staff"
              options={groupOptions}
              selectedIds={selectedIds}
              disabled={busy}
              onChange={setSelectedIds}
            />
          </div>
        )}

        {errorMessage ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void onAdd(selectedIds)}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            {busy ? "Please wait…" : "Add"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
