import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { DataTable } from "../components/data-table/DataTable";
import { PhpPriceInput } from "../components/PhpPriceInput";
import { SearchableSelect } from "../components/SearchableSelect";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { canAssignWorkToOthers } from "../lib/employee-position";
import { formatPhpDisplay, parsePhpStringToNumber } from "../lib/format-php";
import { orderPaymentStatusBadgeClass } from "../lib/order-payments";
import { isPaymentConfirmed } from "../lib/payment-status";
import { useFeatureAccess } from "../lib/use-feature-access";
import {
  walkInAuthResultBadgeClassName,
  walkInAuthStatusBadgeClassName,
} from "../lib/walk-in-authentication-status-badge";

const COMPLETED = "Completed";
const ITEM_CATEGORIES_KEY = "item_categories";
const BRANDS_WE_CONSIGN_KEY = "brands_we_consign";

type WalkInAuthRow = {
  id: string;
  sku: string;
  branch: string;
  clientName: string;
  itemLabel: string;
  brand: string;
  category: string;
  paymentAmount: string;
  paymentStatus: string;
  status: string;
  result: string | null;
  salesAssociateName: string | null;
  assignedToName: string | null;
  assignedToId: string | null;
  createdAt: string;
};

type AuthenticatorOption = { id: string; displayName: string };

type SettingApiRow = { key: string; type: string; value: string };

type CreateForm = {
  firstName: string;
  lastName: string;
  contactNumber: string;
  email: string;
  branch: "Pasig" | "Makati" | "";
  itemModel: string;
  brand: string;
  category: string;
  serialNumber: string;
  color: string;
  material: string;
  inclusions: string;
  paymentAmount: string;
};

const emptyCreateForm = (): CreateForm => ({
  firstName: "",
  lastName: "",
  contactNumber: "",
  email: "",
  branch: "",
  itemModel: "",
  brand: "",
  category: "",
  serialNumber: "",
  color: "",
  material: "",
  inclusions: "",
  paymentAmount: "",
});

const fieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
const labelClass =
  "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";

function parseStringArraySetting(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

async function readApiErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    const m = body.message;
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m.map((x) => String(x)).join("; ");
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

const columnHelper = createColumnHelper<WalkInAuthRow>();

type TabId = "queue" | "create";

export function WalkInAuthenticationPage() {
  const { token, user } = usePortalAuth();
  const { canEdit, readOnly } = useFeatureAccess("walk-in-authentication");
  const canAssignToOthers = canAssignWorkToOthers(
    Boolean(user?.isAdmin),
    user?.employee?.position,
  );
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>("queue");
  const [rows, setRows] = useState<WalkInAuthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [authenticators, setAuthenticators] = useState<AuthenticatorOption[]>(
    [],
  );
  const [authenticatorsLoading, setAuthenticatorsLoading] = useState(false);
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const assignModalTitleId = useId();

  const [form, setForm] = useState<CreateForm>(emptyCreateForm);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/walk-in-authentication", {}, token);
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as WalkInAuthRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token || tab !== "create") return;
    void (async () => {
      try {
        const res = await apiFetch("/api/settings", {}, token);
        if (!res.ok) return;
        const data = (await res.json()) as SettingApiRow[];
        const byKey = new Map(data.map((r) => [r.key, r.value]));
        setBrands(parseStringArraySetting(byKey.get(BRANDS_WE_CONSIGN_KEY)));
        setCategories(parseStringArraySetting(byKey.get(ITEM_CATEGORIES_KEY)));
      } catch {
        /* ignore */
      }
    })();
  }, [token, tab]);

  useEffect(() => {
    if (!assignModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !assignBusy) setAssignModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assignModalOpen, assignBusy]);

  const patchForm = useCallback((partial: Partial<CreateForm>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  const toggleRow = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const togglePage = useCallback((ids: string[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const rowSelection = useMemo(
    () => ({
      selectedIds,
      onToggleRow: toggleRow,
      onTogglePage: togglePage,
      isRowSelectable: (r: WalkInAuthRow) =>
        r.status !== COMPLETED && isPaymentConfirmed(r.paymentStatus),
    }),
    [selectedIds, toggleRow, togglePage],
  );

  const openAssignModal = useCallback(async () => {
    if (!canEdit || !token) return;
    setAssignError(null);
    setAssignEmployeeId("");
    setAssignModalOpen(true);
    setAuthenticatorsLoading(true);
    try {
      const res = await apiFetch(
        "/api/walk-in-authentication/authenticators",
        {},
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as AuthenticatorOption[];
      setAuthenticators(Array.isArray(data) ? data : []);
    } catch (e) {
      setAssignError(
        e instanceof Error ? e.message : "Failed to load authenticators",
      );
      setAuthenticators([]);
    } finally {
      setAuthenticatorsLoading(false);
    }
  }, [canEdit, token]);

  const submitAssign = useCallback(
    async (employeeId: string) => {
      if (!canEdit || !token) return;
      if (!employeeId.trim()) {
        setAssignError("Select an authenticator.");
        return;
      }
      if (selectedIds.size === 0) return;
      setAssignBusy(true);
      setAssignError(null);
      try {
        const res = await apiFetch(
          "/api/walk-in-authentication/batch-assign-authenticator",
          {
            method: "POST",
            body: JSON.stringify({
              ids: [...selectedIds],
              employeeId: employeeId.trim(),
            }),
          },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        setAssignModalOpen(false);
        setSelectedIds(new Set());
        await load();
      } catch (e) {
        setAssignError(
          e instanceof Error ? e.message : "Could not assign authenticator",
        );
      } finally {
        setAssignBusy(false);
      }
    },
    [canEdit, token, selectedIds, load],
  );

  const assignSelectedToSelf = useCallback(async () => {
    const myId = user?.employee?.id?.trim();
    if (!myId) {
      setAssignError("Your account is not linked to an employee record.");
      return;
    }
    await submitAssign(myId);
  }, [user?.employee?.id, submitAssign]);

  const onAssignClick = useCallback(() => {
    if (canAssignToOthers) {
      void openAssignModal();
      return;
    }
    void assignSelectedToSelf();
  }, [canAssignToOthers, openAssignModal, assignSelectedToSelf]);

  const submitCreate = useCallback(async () => {
    if (!canEdit || !token) return;
    setCreateError(null);
    setCreateSuccess(null);

    const required: Array<[keyof CreateForm, string]> = [
      ["firstName", "First name"],
      ["lastName", "Last name"],
      ["contactNumber", "Contact number"],
      ["email", "Email"],
      ["branch", "Branch"],
      ["itemModel", "Item model"],
      ["brand", "Brand"],
      ["category", "Category"],
      ["paymentAmount", "Payment amount"],
    ];
    for (const [key, label] of required) {
      if (!String(form[key]).trim()) {
        setCreateError(`${label} is required.`);
        return;
      }
    }
    const amount = parsePhpStringToNumber(form.paymentAmount);
    if (amount == null || amount < 0) {
      setCreateError("Enter a valid payment amount.");
      return;
    }
    if (!proofFile) {
      setCreateError("Proof of payment is required.");
      return;
    }

    setCreateBusy(true);
    try {
      const fd = new FormData();
      fd.append("firstName", form.firstName.trim());
      fd.append("lastName", form.lastName.trim());
      fd.append("contactNumber", form.contactNumber.trim());
      fd.append("email", form.email.trim());
      fd.append("branch", form.branch);
      fd.append("itemModel", form.itemModel.trim());
      fd.append("brand", form.brand.trim());
      fd.append("category", form.category.trim());
      if (form.serialNumber.trim())
        fd.append("serialNumber", form.serialNumber.trim());
      if (form.color.trim()) fd.append("color", form.color.trim());
      if (form.material.trim()) fd.append("material", form.material.trim());
      if (form.inclusions.trim())
        fd.append("inclusions", form.inclusions.trim());
      fd.append("paymentAmount", amount.toFixed(2));
      fd.append("proof", proofFile);

      const res = await apiFetch(
        "/api/walk-in-authentication",
        { method: "POST", body: fd },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const created = (await res.json()) as { id: string; sku: string };
      setForm(emptyCreateForm());
      setProofFile(null);
      setCreateSuccess(`Created ${created.sku}`);
      await load();
      setTab("queue");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Could not create");
    } finally {
      setCreateBusy(false);
    }
  }, [canEdit, token, form, proofFile, load]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("sku", {
        header: "SKU",
        cell: (info) => (
          <span className="font-medium text-violet-700 dark:text-violet-300">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("clientName", { header: "Client" }),
      columnHelper.accessor("itemLabel", { header: "Item" }),
      columnHelper.accessor("branch", { header: "Branch" }),
      columnHelper.accessor("paymentAmount", {
        header: "Payment",
        cell: (info) => (
          <span className="inline-flex flex-col gap-1">
            <span>{formatPhpDisplay(info.getValue())}</span>
            <span
              className={orderPaymentStatusBadgeClass(
                info.row.original.paymentStatus,
              )}
            >
              {info.row.original.paymentStatus}
            </span>
          </span>
        ),
      }),
      columnHelper.accessor("salesAssociateName", {
        header: "Sales",
        cell: (info) => info.getValue() ?? "—",
      }),
      columnHelper.accessor("assignedToName", {
        header: "Authenticator",
        cell: (info) => info.getValue() ?? "—",
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <span className={walkInAuthStatusBadgeClassName(info.getValue())}>
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("result", {
        header: "Result",
        cell: (info) => {
          const v = info.getValue();
          if (!v) return "—";
          return <span className={walkInAuthResultBadgeClassName(v)}>{v}</span>;
        },
      }),
      columnHelper.accessor("createdAt", {
        header: "Submitted",
        cell: (info) => <SubmittedAtCell iso={info.getValue()} />,
      }),
    ],
    [],
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {readOnly ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          You have view-only access to this feature.
        </p>
      ) : null}

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          type="button"
          className={[
            "px-3 py-2 text-sm font-medium",
            tab === "queue"
              ? "border-b-2 border-violet-600 text-violet-800 dark:text-violet-200"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400",
          ].join(" ")}
          onClick={() => setTab("queue")}
        >
          Queue
        </button>
        {!readOnly ? (
          <button
            type="button"
            className={[
              "px-3 py-2 text-sm font-medium",
              tab === "create"
                ? "border-b-2 border-violet-600 text-violet-800 dark:text-violet-200"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400",
            ].join(" ")}
            onClick={() => setTab("create")}
          >
            Create
          </button>
        ) : null}
      </div>

      {tab === "queue" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {!readOnly ? (
              <button
                type="button"
                disabled={selectedIds.size === 0 || assignBusy}
                onClick={onAssignClick}
                className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {assignBusy
                  ? "Assigning…"
                  : canAssignToOthers
                    ? `Assign to Authenticator (${selectedIds.size})`
                    : `Assign to me (${selectedIds.size})`}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              Refresh
            </button>
          </div>

          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </p>
          )}
          {!assignModalOpen && assignError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {assignError}
            </p>
          ) : null}
          {createSuccess && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              {createSuccess}
            </p>
          )}

          <DataTable
            tableId="portal.walk-in-authentication.queue"
            columns={columns}
            data={rows}
            isLoading={loading}
            emptyMessage="No walk-in authentications yet."
            hideEmptyState={!!error}
            searchPlaceholder="Search…"
            statusFilterOptions={[
              { label: "Pending", value: "Pending" },
              { label: "Assigned", value: "Assigned" },
              { label: "Completed", value: "Completed" },
            ]}
            getRowId={(r) => r.id}
            onRowClick={(r) =>
              navigate(`/portal/walk-in-authentication/${r.id}`)
            }
            getRowAriaLabel={(r) =>
              `Walk-in authentication ${r.sku}, ${r.clientName}`
            }
            rowSelection={rowSelection}
            paginationItemLabel="inquiries"
          />
        </>
      )}

      {tab === "create" && !readOnly && (
        <form
          className="mx-auto flex w-full max-w-2xl flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submitCreate();
          }}
        >
          {createError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {createError}
            </p>
          )}

          <section className="grid gap-3 sm:grid-cols-2">
            <h2 className="sm:col-span-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Client
            </h2>
            <div>
              <label className={labelClass} htmlFor="wia-first-name">
                First name
              </label>
              <input
                id="wia-first-name"
                className={fieldClass}
                value={form.firstName}
                onChange={(e) => patchForm({ firstName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="wia-last-name">
                Last name
              </label>
              <input
                id="wia-last-name"
                className={fieldClass}
                value={form.lastName}
                onChange={(e) => patchForm({ lastName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="wia-contact">
                Contact number
              </label>
              <input
                id="wia-contact"
                className={fieldClass}
                value={form.contactNumber}
                onChange={(e) => patchForm({ contactNumber: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="wia-email">
                Email
              </label>
              <input
                id="wia-email"
                type="email"
                className={fieldClass}
                value={form.email}
                onChange={(e) => patchForm({ email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="wia-branch">
                Branch
              </label>
              <select
                id="wia-branch"
                className={fieldClass}
                value={form.branch}
                onChange={(e) =>
                  patchForm({
                    branch: e.target.value as CreateForm["branch"],
                  })
                }
                required
              >
                <option value="">Select branch</option>
                <option value="Pasig">Pasig</option>
                <option value="Makati">Makati</option>
              </select>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <h2 className="sm:col-span-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Item
            </h2>
            <div>
              <label className={labelClass} htmlFor="wia-model">
                Model
              </label>
              <input
                id="wia-model"
                className={fieldClass}
                value={form.itemModel}
                onChange={(e) => patchForm({ itemModel: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="wia-brand">
                Brand
              </label>
              <SearchableSelect
                id="wia-brand"
                className={fieldClass}
                value={form.brand}
                options={brands}
                onChange={(brand) => patchForm({ brand })}
                placeholder="Select brand"
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="wia-category">
                Category
              </label>
              <select
                id="wia-category"
                className={fieldClass}
                value={form.category}
                onChange={(e) => patchForm({ category: e.target.value })}
                required
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="wia-serial">
                Serial number (optional)
              </label>
              <input
                id="wia-serial"
                className={fieldClass}
                value={form.serialNumber}
                onChange={(e) => patchForm({ serialNumber: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="wia-color">
                Color (optional)
              </label>
              <input
                id="wia-color"
                className={fieldClass}
                value={form.color}
                onChange={(e) => patchForm({ color: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="wia-material">
                Material (optional)
              </label>
              <input
                id="wia-material"
                className={fieldClass}
                value={form.material}
                onChange={(e) => patchForm({ material: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="wia-inclusions">
                Inclusions (optional)
              </label>
              <textarea
                id="wia-inclusions"
                className={fieldClass}
                rows={2}
                value={form.inclusions}
                onChange={(e) => patchForm({ inclusions: e.target.value })}
              />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <h2 className="sm:col-span-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Payment
            </h2>
            <div>
              <label className={labelClass} htmlFor="wia-payment">
                Payment amount
              </label>
              <PhpPriceInput
                id="wia-payment"
                className={`${fieldClass} pl-8`}
                value={form.paymentAmount}
                onChange={(v) => patchForm({ paymentAmount: v })}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="wia-proof">
                Proof of payment
              </label>
              <input
                id="wia-proof"
                type="file"
                accept="image/*,application/pdf"
                className="block w-full text-sm text-slate-700 dark:text-slate-200"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
          </section>

          <button
            type="submit"
            disabled={createBusy}
            className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {createBusy ? "Submitting…" : "Submit walk-in authentication"}
          </button>
        </form>
      )}

      {assignModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onClick={() => {
              if (!assignBusy) setAssignModalOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={assignModalTitleId}
              className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id={assignModalTitleId}
                className="text-lg font-semibold text-slate-900 dark:text-slate-100"
              >
                Assign to Authenticator
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {selectedIds.size} selected
              </p>
              {assignError && (
                <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">
                  {assignError}
                </p>
              )}
              <label className={`${labelClass} mt-3`} htmlFor="wia-assign-emp">
                Authenticator
              </label>
              <select
                id="wia-assign-emp"
                className={fieldClass}
                value={assignEmployeeId}
                disabled={authenticatorsLoading || assignBusy}
                onChange={(e) => setAssignEmployeeId(e.target.value)}
              >
                <option value="">
                  {authenticatorsLoading ? "Loading…" : "Select…"}
                </option>
                {authenticators.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName}
                  </option>
                ))}
              </select>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={assignBusy}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
                  onClick={() => setAssignModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={assignBusy}
                  className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => void submitAssign(assignEmployeeId)}
                >
                  {assignBusy ? "Assigning…" : "Assign"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
