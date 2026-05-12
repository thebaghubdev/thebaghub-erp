import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ItemAuthenticationStatusBadge } from "../components/ItemAuthenticationStatusBadge";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";

type InventoryAuthenticationDetail = {
  id: string;
  sku: string;
  dateReceived: string;
  status: string;
  assignedToName: string | null;
  authenticationStatus: string;
  thirdPartyAuthentication: {
    selectedAuthenticator: "LegitGrails" | "Entrupy" | null;
    certificateLink: string | null;
    certificatePhotos: string[];
    notes: string | null;
  } | null;
  reauthenticationNotes: string | null;
};

type MetricEntryApi = {
  authenticationMetricId: string;
  notes: string | null;
  metricStatus: string | null;
  photos: string[] | null;
};

type AuthenticationMetricDef = {
  id: string;
  metric: string;
};

function verdictLabel(
  status: string | null,
): { text: string; tone: "ok" | "bad" | "muted" | "neutral" } {
  const v = (status ?? "").trim().toLowerCase();
  if (v === "pass") return { text: "Passed", tone: "ok" };
  if (v === "fail") return { text: "Failed", tone: "bad" };
  if (v === "skip") return { text: "Skipped", tone: "muted" };
  return { text: "—", tone: "neutral" };
}

function verdictToneClass(
  tone: "ok" | "bad" | "muted" | "neutral",
): string {
  switch (tone) {
    case "ok":
      return "text-emerald-800 dark:text-emerald-300";
    case "bad":
      return "text-red-700 dark:text-red-300";
    case "muted":
      return "text-slate-600 dark:text-slate-400";
    default:
      return "text-slate-500 dark:text-slate-500";
  }
}

function thirdPartyIsEmpty(
  t: InventoryAuthenticationDetail["thirdPartyAuthentication"],
): boolean {
  if (!t) return true;
  return (
    t.selectedAuthenticator == null &&
    (t.certificateLink == null || t.certificateLink.trim() === "") &&
    t.certificatePhotos.length === 0 &&
    (t.notes == null || t.notes.trim() === "")
  );
}

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

const btnGhost =
  "inline-flex shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-900 transition-colors hover:bg-violet-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-900/80";

export function ItemAuthenticationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = usePortalAuth();
  const [detail, setDetail] = useState<InventoryAuthenticationDetail | null>(
    null,
  );
  const [metricRows, setMetricRows] = useState<MetricEntryApi[]>([]);
  const [metricDefs, setMetricDefs] = useState<AuthenticationMetricDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const [inventoryRes, metricsRes, defsRes] = await Promise.all([
        apiFetch(`/api/inventory/${id}`, {}, token),
        apiFetch(`/api/inventory/${id}/item-authentication-metrics`, {}, token),
        apiFetch("/api/authentication-metrics", {}, token),
      ]);

      if (!inventoryRes.ok) {
        throw new Error(
          inventoryRes.status === 404
            ? "Inventory item not found."
            : `Request failed (${inventoryRes.status})`,
        );
      }

      const inv = (await inventoryRes.json()) as InventoryAuthenticationDetail;
      setDetail(inv);

      if (!metricsRes.ok) {
        throw new Error(`Metrics request failed (${metricsRes.status})`);
      }
      const rows = (await metricsRes.json()) as MetricEntryApi[];
      setMetricRows(rows);

      if (defsRes.ok) {
        const defs = (await defsRes.json()) as AuthenticationMetricDef[];
        setMetricDefs(Array.isArray(defs) ? defs : []);
      } else {
        setMetricDefs([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setDetail(null);
      setMetricRows([]);
      setMetricDefs([]);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const metricLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of metricDefs) {
      m.set(d.id, d.metric);
    }
    return m;
  }, [metricDefs]);

  if (loading) {
    return (
      <div className="text-sm text-slate-600 dark:text-slate-400">Loading…</div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error ?? "Unable to load authentication details."}
        </p>
        <Link
          to="/portal/inventory"
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to inventory
        </Link>
      </div>
    );
  }

  const isPending =
    detail.authenticationStatus.trim().toLowerCase() === "pending";

  const hasThirdPartyStored = !thirdPartyIsEmpty(detail.thirdPartyAuthentication);
  const reauthNotes =
    detail.reauthenticationNotes != null &&
    detail.reauthenticationNotes.trim() !== ""
      ? detail.reauthenticationNotes.trim()
      : "";

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Authentication results
          </p>
          <h1 className="mt-1 break-all font-mono text-xl font-semibold text-slate-900 dark:text-slate-100">
            {detail.sku}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Inventory status:
            </span>
            <InventoryStatusBadge status={detail.status} />
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm text-slate-800 dark:text-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-slate-500 dark:text-slate-400">
                Authentication status
              </dt>
              <dd>
                <ItemAuthenticationStatusBadge
                  status={detail.authenticationStatus}
                />
              </dd>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-slate-500 dark:text-slate-400">
                Assigned authenticator
              </dt>
              <dd>{detail.assignedToName ?? "—"}</dd>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-slate-500 dark:text-slate-400">
                Date received
              </dt>
              <dd>
                <SubmittedAtCell iso={detail.dateReceived} />
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link to={`/portal/inventory/${detail.id}`} className={btnGhost}>
            ← Item details
          </Link>
          <Link to="/portal/inventory" className={btnGhost}>
            Inventory list
          </Link>
        </div>
      </div>

      {isPending ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Authentication is still pending. Checklist entries below may be
          incomplete until the authenticator finishes.
        </p>
      ) : null}

      {(hasThirdPartyStored || reauthNotes) && (
        <div className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Third-party authentication
          </h2>
          {reauthNotes ? (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Reauthentication notes (staff / consignor)
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">
                {reauthNotes}
              </p>
            </div>
          ) : null}
          {hasThirdPartyStored && detail.thirdPartyAuthentication ? (
            <dl className="mt-4 space-y-4 text-sm text-slate-800 dark:text-slate-200">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Provider</dt>
                <dd>
                  {detail.thirdPartyAuthentication.selectedAuthenticator ??
                    "—"}
                </dd>
              </div>
              {detail.thirdPartyAuthentication.certificateLink &&
              detail.thirdPartyAuthentication.certificateLink.trim() !== "" ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Certificate / report link
                  </dt>
                  <dd className="break-all">
                    <a
                      href={
                        detail.thirdPartyAuthentication.certificateLink.trim()
                      }
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-violet-700 underline hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100"
                    >
                      {detail.thirdPartyAuthentication.certificateLink.trim()}
                    </a>
                  </dd>
                </div>
              ) : null}
              {detail.thirdPartyAuthentication.notes &&
              detail.thirdPartyAuthentication.notes.trim() !== "" ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Certificate notes
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap">
                    {detail.thirdPartyAuthentication.notes.trim()}
                  </dd>
                </div>
              ) : null}
              {detail.thirdPartyAuthentication.certificatePhotos.length > 0 ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400 mb-2">
                    Certificate photos
                  </dt>
                  <dd>
                    <ul className="flex flex-wrap gap-3">
                      {detail.thirdPartyAuthentication.certificatePhotos.map(
                        (url, i) => (
                          <li key={`${url}-${i}`}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="block rounded-lg ring-2 ring-transparent transition hover:ring-violet-400"
                            >
                              <img
                                src={url}
                                alt=""
                                className="h-28 max-w-[10rem] rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                              />
                            </a>
                          </li>
                        ),
                      )}
                    </ul>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : !reauthNotes ? (
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
              No third-party certificate data recorded for this item.
            </p>
          ) : null}
        </div>
      )}

      <div className={cardClass}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Authentication checklist
        </h2>
        {metricRows.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            No checklist rows recorded for this item.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-700">
            {metricRows.map((row, idx) => {
              const verdict = verdictLabel(row.metricStatus);
              const metricName =
                metricLabelById.get(row.authenticationMetricId) ??
                `Metric (${row.authenticationMetricId.slice(0, 8)}…)`;
              const photos =
                Array.isArray(row.photos) && row.photos.length > 0
                  ? row.photos
                  : [];
              const notesTrim =
                row.notes != null ? String(row.notes).trim() : "";
              return (
                <li
                  key={`${row.authenticationMetricId}-${idx}`}
                  className="py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-medium text-slate-900 dark:text-slate-100">
                      {metricName}
                    </h3>
                    <span
                      className={`text-sm font-medium ${verdictToneClass(verdict.tone)}`}
                    >
                      {verdict.text}
                    </span>
                  </div>
                  {notesTrim ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                      {notesTrim}
                    </p>
                  ) : null}
                  {photos.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {photos.map((src, pi) => (
                        <li key={`${src}-${pi}`}>
                          <a
                            href={src}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="block rounded-md ring-2 ring-transparent transition hover:ring-violet-400"
                          >
                            <img
                              src={src}
                              alt=""
                              className="h-24 max-w-[8rem] rounded-md border border-slate-200 object-cover dark:border-slate-700"
                            />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
