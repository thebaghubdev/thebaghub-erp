import { useCallback, useEffect, useMemo, useState } from "react";
import { EmployeeMultiSelect } from "../components/EmployeeMultiSelect";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import {
  MANAGED_FEATURE_KEYS,
  MANAGED_FEATURE_LABELS,
  SINGLE_GRANT_FEATURE_LABELS,
  isSingleGrantFeature,
  type ManagedFeatureKey,
} from "../lib/feature-access";
import { useFeatureAccess } from "../lib/use-feature-access";

type EmployeeRow = {
  id: string;
  isAdmin: boolean;
  firstName: string;
  lastName: string;
  position: string;
};

type MatrixRow = {
  featureKey: ManagedFeatureKey;
  label: string;
  viewEmployeeIds: string[];
  editEmployeeIds: string[];
};

type DraftRow = {
  featureKey: ManagedFeatureKey;
  viewEmployeeIds: string[];
  editEmployeeIds: string[];
};

function emptyDraft(): DraftRow[] {
  return MANAGED_FEATURE_KEYS.map((featureKey) => ({
    featureKey,
    viewEmployeeIds: [],
    editEmployeeIds: [],
  }));
}

function matrixToDraft(rows: MatrixRow[]): DraftRow[] {
  const byKey = new Map(rows.map((r) => [r.featureKey, r]));
  return MANAGED_FEATURE_KEYS.map((featureKey) => {
    const row = byKey.get(featureKey);
    return {
      featureKey,
      viewEmployeeIds: [...(row?.viewEmployeeIds ?? [])],
      editEmployeeIds: [...(row?.editEmployeeIds ?? [])],
    };
  });
}

export function AccessManagementPage() {
  const { token, refreshFeatureAccess } = usePortalAuth();
  const { canEdit, readOnly } = useFeatureAccess("access-management");

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [draft, setDraft] = useState<DraftRow[]>(() => emptyDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<
    Partial<Record<ManagedFeatureKey, string>>
  >({});
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const employeeOptions = useMemo(
    () =>
      employees
        .filter((e) => !e.isAdmin)
        .map((e) => ({
          id: e.id,
          label: `${e.firstName} ${e.lastName} (${e.position})`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [employees],
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [matrixRes, empRes] = await Promise.all([
        apiFetch("/api/access-control/matrix", {}, token),
        apiFetch("/api/accounts/employees", {}, token),
      ]);
      if (!matrixRes.ok) {
        throw new Error(
          matrixRes.status === 403
            ? "You do not have access to view Access Management."
            : `Could not load access matrix (${matrixRes.status})`,
        );
      }
      if (!empRes.ok) {
        throw new Error(`Could not load employees (${empRes.status})`);
      }
      const matrix = (await matrixRes.json()) as MatrixRow[];
      const empRows = (await empRes.json()) as EmployeeRow[];
      setEmployees(empRows);
      setDraft(matrixToDraft(matrix));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateRow = (
    featureKey: ManagedFeatureKey,
    patch: Partial<Pick<DraftRow, "viewEmployeeIds" | "editEmployeeIds">>,
  ) => {
    setDraft((prev) =>
      prev.map((row) =>
        row.featureKey === featureKey ? { ...row, ...patch } : row,
      ),
    );
  };

  const handleSave = async () => {
    if (!token || !canEdit) return;
    setSaving(true);
    setSaveMessage(null);
    setError(null);
    try {
      const res = await apiFetch(
        "/api/access-control/matrix",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            features: draft.map((row) => ({
              featureKey: row.featureKey,
              viewEmployeeIds: isSingleGrantFeature(row.featureKey)
                ? []
                : row.viewEmployeeIds,
              editEmployeeIds: row.editEmployeeIds,
            })),
          }),
        },
        token,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          typeof body?.message === "string"
            ? body.message
            : Array.isArray(body?.message)
              ? body.message.join(", ")
              : `Save failed (${res.status})`;
        throw new Error(msg);
      }
      const matrix = (await res.json()) as MatrixRow[];
      setDraft(matrixToDraft(matrix));
      setRowErrors({});
      setSaveMessage("Access settings saved.");
      await refreshFeatureAccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Access Management
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Assign view-only or edit access per feature.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void handleSave()}
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-60 dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        ) : null}
      </div>

      {readOnly ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          You have view-only access. Changes cannot be saved.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {saveMessage ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          {saveMessage}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          {draft.map((row) => {
            const label = MANAGED_FEATURE_LABELS[row.featureKey];
            const rowError = rowErrors[row.featureKey];
            return (
              <section
                key={row.featureKey}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {label}
                </h2>
                {isSingleGrantFeature(row.featureKey) ? (
                  <EmployeeMultiSelect
                    label={
                      SINGLE_GRANT_FEATURE_LABELS[
                        row.featureKey as keyof typeof SINGLE_GRANT_FEATURE_LABELS
                      ] ?? "Staff with access"
                    }
                    options={employeeOptions}
                    selectedIds={row.editEmployeeIds}
                    disabled={readOnly}
                    onChange={(nextIds) => {
                      setRowErrors((prev) => {
                        const copy = { ...prev };
                        delete copy[row.featureKey];
                        return copy;
                      });
                      updateRow(row.featureKey, {
                        editEmployeeIds: nextIds,
                        viewEmployeeIds: [],
                      });
                    }}
                  />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <EmployeeMultiSelect
                      label="Edit access"
                      options={employeeOptions}
                      selectedIds={row.editEmployeeIds}
                      blockedIds={row.viewEmployeeIds}
                      disabled={readOnly}
                      onBlocked={() =>
                        setRowErrors((prev) => ({
                          ...prev,
                          [row.featureKey]:
                            "Remove the user from View only first before adding Edit access.",
                        }))
                      }
                      onChange={(nextIds) => {
                        setRowErrors((prev) => {
                          const copy = { ...prev };
                          delete copy[row.featureKey];
                          return copy;
                        });
                        updateRow(row.featureKey, { editEmployeeIds: nextIds });
                      }}
                    />
                    <EmployeeMultiSelect
                      label="View only access"
                      options={employeeOptions}
                      selectedIds={row.viewEmployeeIds}
                      blockedIds={row.editEmployeeIds}
                      disabled={readOnly}
                      onBlocked={() =>
                        setRowErrors((prev) => ({
                          ...prev,
                          [row.featureKey]:
                            "Remove the user from Edit first before adding View only access.",
                        }))
                      }
                      onChange={(nextIds) => {
                        setRowErrors((prev) => {
                          const copy = { ...prev };
                          delete copy[row.featureKey];
                          return copy;
                        });
                        updateRow(row.featureKey, { viewEmployeeIds: nextIds });
                      }}
                    />
                  </div>
                )}
                {rowError ? (
                  <p
                    className="mt-2 text-sm text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {rowError}
                  </p>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
