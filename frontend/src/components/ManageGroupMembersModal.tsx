import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EmployeeMultiSelect } from "./EmployeeMultiSelect";
import { apiFetch } from "../lib/api";
import {
  readApiMessage,
  type MessagingEmployeeOption,
} from "./CreateConversationModal";

export type GroupMemberOption = {
  userId: string;
  name: string;
};

type EmployeesResponse = {
  employees: MessagingEmployeeOption[];
};

type Props = {
  open: boolean;
  token: string;
  currentUserId: string;
  members: GroupMemberOption[];
  busy?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onSave: (payload: {
    addUserIds: string[];
    removeUserIds: string[];
  }) => Promise<void>;
};

function employeeLabel(e: MessagingEmployeeOption): string {
  const name = `${e.firstName} ${e.lastName}`.trim();
  return e.position ? `${name} · ${e.position}` : name;
}

export function ManageGroupMembersModal({
  open,
  token,
  currentUserId,
  members,
  busy = false,
  errorMessage = null,
  onCancel,
  onSave,
}: Props) {
  const titleId = useId();
  const [remainingIds, setRemainingIds] = useState<string[]>([]);
  const [addIds, setAddIds] = useState<string[]>([]);
  const [memberSnapshot, setMemberSnapshot] = useState<GroupMemberOption[]>(
    [],
  );
  const [employees, setEmployees] = useState<MessagingEmployeeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const membersRef = useRef(members);
  membersRef.current = members;

  const resetForm = useCallback(() => {
    setRemainingIds([]);
    setAddIds([]);
    setMemberSnapshot([]);
    setLoadError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }
    const snapshot = membersRef.current;
    setMemberSnapshot(snapshot);
    setRemainingIds(snapshot.map((m) => m.userId));
    setAddIds([]);
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

  const remainingSet = useMemo(() => new Set(remainingIds), [remainingIds]);
  const originalSet = useMemo(
    () => new Set(memberSnapshot.map((m) => m.userId)),
    [memberSnapshot],
  );
  const remainingMembers = useMemo(
    () => memberSnapshot.filter((m) => remainingSet.has(m.userId)),
    [memberSnapshot, remainingSet],
  );
  const desiredIds = useMemo(
    () => new Set([...remainingIds, ...addIds]),
    [remainingIds, addIds],
  );
  const addUserIds = useMemo(
    () => addIds.filter((id) => !originalSet.has(id)),
    [addIds, originalSet],
  );
  const removeUserIds = useMemo(
    () =>
      memberSnapshot
        .map((m) => m.userId)
        .filter(
          (id) =>
            id !== currentUserId &&
            originalSet.has(id) &&
            !desiredIds.has(id),
        ),
    [memberSnapshot, currentUserId, originalSet, desiredIds],
  );

  const addCandidates = useMemo(
    () =>
      employees.filter(
        (e) => e.userId !== currentUserId && !remainingSet.has(e.userId),
      ),
    [employees, currentUserId, remainingSet],
  );

  if (!open || typeof document === "undefined") return null;

  const groupOptions = addCandidates.map((e) => ({
    id: e.userId,
    label: employeeLabel(e),
  }));

  const hasChanges = addUserIds.length > 0 || removeUserIds.length > 0;
  const canSubmit = !busy && !loading && !loadError && hasChanges;

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
          Manage members
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Add or remove staff in this group conversation.
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
        ) : (
          <div className="mt-4 space-y-5">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                Members
              </p>
              {remainingMembers.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No members in this conversation.
                </p>
              ) : (
                <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                  {remainingMembers.map((member) => {
                    const isYou = member.userId === currentUserId;
                    return (
                      <li
                        key={member.userId}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <span className="min-w-0 break-words text-sm text-slate-800 dark:text-slate-100">
                          {member.name}
                          {isYou ? (
                            <span className="text-slate-500 dark:text-slate-400">
                              {" "}
                              (you)
                            </span>
                          ) : null}
                        </span>
                        {isYou ? null : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setRemainingIds((prev) =>
                                prev.filter((id) => id !== member.userId),
                              )
                            }
                            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
                          >
                            Remove
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {addCandidates.length === 0 && addIds.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Everyone else is already in this conversation.
              </p>
            ) : (
              <EmployeeMultiSelect
                label="Add staff"
                options={groupOptions}
                selectedIds={addIds}
                disabled={busy}
                onChange={(ids) => {
                  const restored = ids.filter((id) => originalSet.has(id));
                  const fresh = ids.filter((id) => !originalSet.has(id));
                  if (restored.length > 0) {
                    setRemainingIds((prev) => [
                      ...new Set([...prev, ...restored]),
                    ]);
                  }
                  setAddIds(fresh);
                }}
              />
            )}
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
              void onSave({
                addUserIds,
                removeUserIds,
              })
            }
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            {busy ? "Please wait…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
