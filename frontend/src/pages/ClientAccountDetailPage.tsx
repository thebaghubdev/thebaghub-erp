import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { branchLabel } from "../lib/consignment-schedule-labels";
import {
  formatClientBank,
  formatClientPaymentMethod,
} from "../lib/client-payment-preference";

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
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

const backLinkClass =
  "inline-flex items-center text-sm font-medium text-violet-700 hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200";

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
