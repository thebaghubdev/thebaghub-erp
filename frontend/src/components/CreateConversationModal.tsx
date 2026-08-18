import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { EmployeeMultiSelect } from "./EmployeeMultiSelect";
import { apiFetch } from "../lib/api";

export type MessagingEmployeeOption = {
  userId: string;
  firstName: string;
  lastName: string;
  position: string;
};

export type CreatedChannelRef = {
  channelType: string;
  channelId: string;
  cid: string;
};

type ConversationKind = "direct" | "group";

type EmployeesResponse = {
  employees: MessagingEmployeeOption[];
  withoutDirectMessage: MessagingEmployeeOption[];
};

type Props = {
  open: boolean;
  token: string;
  busy?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onCreate: (payload: {
    kind: ConversationKind;
    memberUserIds: string[];
    name?: string;
  }) => Promise<void>;
};

const fieldClass =
  "box-border h-10 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-0 text-sm leading-5 text-slate-900 outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

function employeeLabel(e: MessagingEmployeeOption): string {
  const name = `${e.firstName} ${e.lastName}`.trim();
  return e.position ? `${name} · ${e.position}` : name;
}

export function CreateConversationModal({
  open,
  token,
  busy = false,
  errorMessage = null,
  onCancel,
  onCreate,
}: Props) {
  const titleId = useId();
  const [kind, setKind] = useState<ConversationKind>("direct");
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dmUserId, setDmUserId] = useState("");
  const [employees, setEmployees] = useState<MessagingEmployeeOption[]>([]);
  const [dmCandidates, setDmCandidates] = useState<MessagingEmployeeOption[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setKind("direct");
    setGroupName("");
    setSelectedIds([]);
    setDmUserId("");
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
          setDmCandidates(data.withoutDirectMessage ?? []);
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

  if (!open || typeof document === "undefined") return null;

  const groupOptions = employees.map((e) => ({
    id: e.userId,
    label: employeeLabel(e),
  }));

  const canSubmit =
    !busy &&
    !loading &&
    !loadError &&
    (kind === "group"
      ? groupName.trim().length > 0 && selectedIds.length > 0
      : dmUserId.length > 0);

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
          Create conversation
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Start a direct message or a group chat with other staff.
        </p>

        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">
            Conversation type
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <label
              className={[
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                kind === "direct"
                  ? "border-violet-400 bg-violet-50 text-violet-900 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800",
              ].join(" ")}
            >
              <input
                type="radio"
                name="conversation-kind"
                value="direct"
                checked={kind === "direct"}
                disabled={busy}
                onChange={() => {
                  setKind("direct");
                  setSelectedIds([]);
                  setGroupName("");
                }}
              />
              Direct message
            </label>
            <label
              className={[
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                kind === "group"
                  ? "border-violet-400 bg-violet-50 text-violet-900 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800",
              ].join(" ")}
            >
              <input
                type="radio"
                name="conversation-kind"
                value="group"
                checked={kind === "group"}
                disabled={busy}
                onChange={() => {
                  setKind("group");
                  setDmUserId("");
                }}
              />
              Group conversation
            </label>
          </div>
        </fieldset>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading employees…</p>
        ) : loadError ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {loadError}
          </p>
        ) : kind === "group" ? (
          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="group-name"
                className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Group name
              </label>
              <input
                id="group-name"
                type="text"
                required
                maxLength={80}
                disabled={busy}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className={fieldClass}
                placeholder="e.g. Warehouse team"
              />
            </div>
            <EmployeeMultiSelect
              label="Members"
              options={groupOptions}
              selectedIds={selectedIds}
              disabled={busy}
              onChange={setSelectedIds}
            />
          </div>
        ) : dmCandidates.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            You already have a conversation with every staff member.
          </p>
        ) : (
          <div className="mt-4">
            <label
              htmlFor="dm-employee"
              className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Employee
            </label>
            <select
              id="dm-employee"
              disabled={busy}
              value={dmUserId}
              onChange={(e) => setDmUserId(e.target.value)}
              className={fieldClass}
            >
              <option value="">Select an employee…</option>
              {dmCandidates.map((e) => (
                <option key={e.userId} value={e.userId}>
                  {employeeLabel(e)}
                </option>
              ))}
            </select>
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
            onClick={() =>
              void onCreate(
                kind === "group"
                  ? {
                      kind: "group",
                      memberUserIds: selectedIds,
                      name: groupName.trim(),
                    }
                  : { kind: "direct", memberUserIds: [dmUserId] },
              )
            }
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            {busy ? "Please wait…" : "Create"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function readApiMessage(
  body: unknown,
  fallback: string,
): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
    if (Array.isArray(message) && message.every((x) => typeof x === "string")) {
      return message.join(" ");
    }
  }
  return fallback;
}
