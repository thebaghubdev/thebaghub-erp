import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { branchLabel } from "../lib/consignment-schedule-labels";
import {
  CLIENT_VIP_STATUS_OPTIONS,
  formatClientBank,
  formatClientPaymentMethod,
  formatClientVipStatus,
  clientVipStatusBadgeClassName,
  type ClientVipStatus,
} from "../lib/client-payment-preference";
import { formatPhpDisplay } from "../lib/format-php";

type ClientAccountDetail = {
  id: string;
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  completeAddress: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  bankCode: string | null;
  preferredPaymentMethod:
    | "check_pickup"
    | "cash_pickup"
    | "direct_deposit"
    | null;
  preferredPaymentBranch: "pasig" | "makati" | null;
  vipStatus: "Regular" | "Gold" | "Diamond";
  totalConsignments: number;
  totalPurchases: number;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

const backLinkClass =
  "inline-flex items-center text-sm font-medium text-violet-700 hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200";

const fieldClass =
  "box-border h-10 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-0 text-sm leading-5 text-slate-900 outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

const iconEditButtonClass =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100";

function displayOrDash(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? text : "—";
}

function formatTimestamp(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString();
}

function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm text-slate-900 dark:text-slate-100 ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function ClientAccountDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { token } = usePortalAuth();
  const [detail, setDetail] = useState<ClientAccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vipEditOpen, setVipEditOpen] = useState(false);
  const [vipEditValue, setVipEditValue] = useState<ClientVipStatus>("Regular");
  const [vipEditError, setVipEditError] = useState<string | null>(null);
  const [vipEditSaving, setVipEditSaving] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!token || !clientId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/accounts/clients/${clientId}`, {}, token);
      if (res.status === 404) {
        throw new Error("Client not found.");
      }
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const data = (await res.json()) as ClientAccountDetail;
      setDetail(data);
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : "Failed to load client");
    } finally {
      setLoading(false);
    }
  }, [clientId, token]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  function openVipEdit() {
    if (!detail) return;
    setVipEditError(null);
    setVipEditValue(detail.vipStatus);
    setVipEditOpen(true);
  }

  function closeVipEdit() {
    setVipEditOpen(false);
    setVipEditError(null);
  }

  async function submitVipEdit(e: FormEvent) {
    e.preventDefault();
    if (!detail || !token || !clientId) return;
    setVipEditError(null);
    setVipEditSaving(true);
    try {
      const res = await apiFetch(
        `/api/accounts/clients/${clientId}/vip-status`,
        {
          method: "PATCH",
          body: JSON.stringify({ vipStatus: vipEditValue }),
        },
        token,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const msg = body?.message;
        throw new Error(
          Array.isArray(msg)
            ? msg.join(", ")
            : typeof msg === "string"
              ? msg
              : `Request failed (${res.status})`,
        );
      }
      const updated = (await res.json()) as ClientAccountDetail;
      setDetail(updated);
      closeVipEdit();
    } catch (err) {
      setVipEditError(
        err instanceof Error ? err.message : "Failed to update VIP status",
      );
    } finally {
      setVipEditSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Link to="/portal/clients" className={backLinkClass}>
          ← Back to Clients
        </Link>
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error ?? "Client not found."}
        </p>
      </div>
    );
  }

  const fullName = `${detail.firstName} ${detail.lastName}`.trim();
  const bankCode =
    detail.bankCode === "bdo" ||
    detail.bankCode === "bpi" ||
    detail.bankCode === "other"
      ? detail.bankCode
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/portal/clients" className={backLinkClass}>
            ← Back to Clients
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {fullName || detail.username}
          </h1>
          <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
            {detail.username}
          </p>
        </div>
      </div>

      <section className={cardClass}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Account
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Name" value={fullName || "—"} />
          <DetailField label="Username" value={detail.username} mono />
          <DetailField label="Email" value={detail.email} />
          <DetailField label="Contact number" value={detail.contactNumber} />
          <DetailField
            label="Email verified"
            value={detail.emailVerifiedAt ? "Yes" : "No"}
          />
          <DetailField
            label="Account created"
            value={formatTimestamp(detail.createdAt)}
          />
          <DetailField
            label="Last updated"
            value={formatTimestamp(detail.updatedAt)}
          />
        </dl>
      </section>

      <section className={cardClass}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
          VIP & activity
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="flex items-center gap-1.5">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                VIP status
              </dt>
              <button
                type="button"
                onClick={openVipEdit}
                aria-label="Edit VIP status"
                className={iconEditButtonClass}
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path
                    d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            <dd className="mt-0.5">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${clientVipStatusBadgeClassName(detail.vipStatus)}`}
              >
                {formatClientVipStatus(detail.vipStatus)}
              </span>
            </dd>
          </div>
          <DetailField
            label="Total consignments"
            value={formatPhpDisplay(detail.totalConsignments)}
          />
          <DetailField
            label="Total purchases"
            value={formatPhpDisplay(detail.totalPurchases)}
          />
        </dl>
      </section>

      {vipEditOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal
          aria-labelledby="edit-vip-status-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3
              id="edit-vip-status-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Edit VIP status
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {fullName || detail.username}
            </p>

            <form onSubmit={(e) => void submitVipEdit(e)} className="mt-4 space-y-4">
              <div>
                <label
                  className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
                  htmlFor="edit-vip-status"
                >
                  VIP status
                </label>
                <select
                  id="edit-vip-status"
                  className={fieldClass}
                  value={vipEditValue}
                  onChange={(e) =>
                    setVipEditValue(e.target.value as ClientVipStatus)
                  }
                  disabled={vipEditSaving}
                >
                  {CLIENT_VIP_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              {vipEditError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  {vipEditError}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={vipEditSaving}
                  onClick={closeVipEdit}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={vipEditSaving}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                >
                  {vipEditSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <section className={cardClass}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Complete address
        </h2>
        <p className="whitespace-pre-wrap text-sm text-slate-900 dark:text-slate-100">
          {displayOrDash(detail.completeAddress)}
        </p>
      </section>

      <section className={cardClass}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Preferred payment method
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="Payment method"
            value={formatClientPaymentMethod(detail.preferredPaymentMethod)}
          />
          {detail.preferredPaymentMethod &&
          detail.preferredPaymentMethod !== "direct_deposit" ? (
            <DetailField
              label="Pickup branch"
              value={branchLabel(detail.preferredPaymentBranch ?? "pasig")}
            />
          ) : null}
        </dl>
      </section>

      <section className={cardClass}>
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Bank details (direct deposit)
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="Bank"
            value={bankCode ? formatClientBank(bankCode) : "—"}
          />
          <DetailField
            label="Account number"
            value={displayOrDash(detail.bankAccountNumber)}
            mono
          />
          <DetailField
            label="Account name"
            value={displayOrDash(detail.bankAccountName)}
          />
        </dl>
      </section>
    </div>
  );
}
