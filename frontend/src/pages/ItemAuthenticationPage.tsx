import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  MetricAuthCard,
  type MetricDraftValue,
  type MetricVerdict,
} from "../components/MetricAuthCard";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import {
  type AuthenticationMetricApi,
  filterMetricsForItem,
  groupMetricsByMetricCategory,
  sortMetricsForDisplay,
} from "../lib/filter-authentication-metrics";

/** API fields used on this page only (decoupled from inventory detail UI). */
type ItemAuthenticationPayload = {
  sku: string;
  assignedToEmployeeId: string | null;
  assignedToName: string | null;
  itemSnapshot: {
    form: Record<string, unknown>;
  };
};

type MetricEntryApi = {
  authenticationMetricId: string;
  notes: string | null;
  metricStatus: string | null;
  photos: string[] | null;
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function serializeDraftRecord(d: Record<string, MetricDraftValue>): string {
  const keys = Object.keys(d).sort();
  return JSON.stringify(
    keys.map((k) => {
      const v = d[k];
      return [
        k,
        v.metricStatus,
        v.notes,
        v.photos,
        v.files.map((f) => `${f.name}:${f.size}:${f.lastModified}`),
      ];
    }),
  );
}

async function filesToDataUrls(files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of files) {
    out.push(
      await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(f);
      }),
    );
  }
  return out;
}

export function ItemAuthenticationPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = usePortalAuth();
  const [detail, setDetail] = useState<ItemAuthenticationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<AuthenticationMetricApi[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const [metricEntries, setMetricEntries] = useState<MetricEntryApi[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [draftByMetricId, setDraftByMetricId] = useState<
    Record<string, MetricDraftValue>
  >({});
  const savedSerializedRef = useRef<string>("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/inventory/${id}`, {}, token);
      if (!res.ok) {
        const msg =
          res.status === 404
            ? "Inventory item not found."
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }
      const data = (await res.json()) as ItemAuthenticationPayload;
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load item");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token || !id) return;
    let cancelled = false;
    setMetricsError(null);
    setMetricsLoading(true);
    void (async () => {
      try {
        const res = await apiFetch("/api/authentication-metrics", {}, token);
        if (!res.ok) {
          throw new Error(`Could not load metrics (${res.status})`);
        }
        const data = (await res.json()) as AuthenticationMetricApi[];
        if (!cancelled) setMetrics(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) {
          setMetricsError(
            e instanceof Error
              ? e.message
              : "Failed to load authentication metrics",
          );
          setMetrics([]);
        }
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  useEffect(() => {
    if (!token || !id) return;
    let cancelled = false;
    setEntriesLoading(true);
    void (async () => {
      try {
        const res = await apiFetch(
          `/api/inventory/${id}/item-authentication-metrics`,
          {},
          token,
        );
        if (!res.ok) {
          throw new Error(`Could not load saved metrics (${res.status})`);
        }
        const data = (await res.json()) as MetricEntryApi[];
        if (!cancelled) setMetricEntries(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setMetricEntries([]);
      } finally {
        if (!cancelled) setEntriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  const filteredMetrics = useMemo(() => {
    if (!detail) return [];
    const form = detail.itemSnapshot.form;
    const itemCategory = str(form.category);
    const brand = str(form.brand);
    const itemModel = str(form.itemModel);
    return sortMetricsForDisplay(
      filterMetricsForItem(metrics, itemCategory, brand, itemModel),
    );
  }, [detail, metrics]);

  const metricsByCategory = useMemo(
    () => groupMetricsByMetricCategory(filteredMetrics),
    [filteredMetrics],
  );

  useEffect(() => {
    if (entriesLoading || filteredMetrics.length === 0) return;
    const initial: Record<string, MetricDraftValue> = {};
    for (const m of filteredMetrics) {
      const e = metricEntries.find((x) => x.authenticationMetricId === m.id);
      initial[m.id] = {
        metricStatus: (e?.metricStatus as MetricVerdict | null) ?? null,
        notes: e?.notes ?? "",
        photos: Array.isArray(e?.photos) ? e!.photos! : [],
        files: [],
      };
    }
    setDraftByMetricId(initial);
    savedSerializedRef.current = serializeDraftRecord(initial);
  }, [filteredMetrics, metricEntries, entriesLoading]);

  const canEditMetrics = useMemo(() => {
    if (!detail) return false;
    if (user?.isAdmin) return true;
    const assigneeId = detail.assignedToEmployeeId;
    if (assigneeId == null) return true;
    const myEmployeeId = user?.employee?.id;
    if (!myEmployeeId) return false;
    return myEmployeeId === assigneeId;
  }, [detail, user]);

  const isDirty = useMemo(() => {
    if (!canEditMetrics || entriesLoading) return false;
    return serializeDraftRecord(draftByMetricId) !== savedSerializedRef.current;
  }, [draftByMetricId, canEditMetrics, entriesLoading]);

  const saveChanges = useCallback(async () => {
    if (!token || !id || !canEditMetrics) return;
    setSaveBusy(true);
    setSaveError(null);
    try {
      const rows = await Promise.all(
        filteredMetrics.map(async (m) => {
          const d = draftByMetricId[m.id];
          if (!d) return null;
          const extra = d.files.length ? await filesToDataUrls(d.files) : [];
          const photosMerged = [...d.photos, ...extra];
          return {
            authenticationMetricId: m.id,
            notes: d.notes.trim() === "" ? null : d.notes.trim(),
            metricStatus: d.metricStatus,
            photos: photosMerged.length > 0 ? photosMerged : null,
          };
        }),
      );
      const payloadRows = rows.filter(
        (r): r is NonNullable<(typeof rows)[number]> => r != null,
      );
      const res = await apiFetch(
        `/api/inventory/${id}/item-authentication-metrics`,
        {
          method: "POST",
          body: JSON.stringify({ rows: payloadRows }),
        },
        token,
      );
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = (await res.json()) as { message?: string | string[] };
          if (Array.isArray(j.message)) msg = j.message.join("; ");
          else if (typeof j.message === "string") msg = j.message;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const refreshed = await apiFetch(
        `/api/inventory/${id}/item-authentication-metrics`,
        {},
        token,
      );
      if (refreshed.ok) {
        const data = (await refreshed.json()) as MetricEntryApi[];
        setMetricEntries(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Could not save metric results",
      );
    } finally {
      setSaveBusy(false);
    }
  }, [token, id, canEditMetrics, filteredMetrics, draftByMetricId]);

  if (loading) {
    return (
      <div className="text-sm text-slate-600 dark:text-slate-400">Loading…</div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error ?? "Unable to load this item."}
        </p>
        <Link
          to="/portal/authentication"
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to authentication
        </Link>
      </div>
    );
  }

  const form = detail.itemSnapshot.form;
  const brand = str(form.brand);
  const itemModel = str(form.itemModel);
  const category = str(form.category);
  const brandModelSubtitle =
    brand && itemModel ? `${brand} — ${itemModel}` : brand || itemModel || "—";

  return (
    <div className="w-full min-w-0 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Item authentication
          </p>
          <h1 className="mt-1 break-all font-mono text-xl font-semibold text-slate-900 dark:text-slate-100">
            {detail.sku}
          </h1>
          <p className="mt-2 break-words text-base text-slate-700 dark:text-slate-300">
            {brandModelSubtitle}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Category:
            </span>{" "}
            {category || "—"}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Assigned to:
            </span>{" "}
            {detail.assignedToName ?? "—"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Link
            to="/portal/authentication"
            className="text-center text-sm font-medium text-violet-700 hover:underline dark:text-violet-300 sm:text-left"
          >
            ← Back to authentication
          </Link>
        </div>
      </div>

      {saveError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {saveError}
        </p>
      ) : null}

      <section aria-labelledby="auth-metrics-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {canEditMetrics && isDirty ? (
            <button
              type="button"
              onClick={() => void saveChanges()}
              disabled={saveBusy}
              className="shrink-0 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
            >
              {saveBusy ? "Saving…" : "Save changes"}
            </button>
          ) : null}
        </div>
        {!canEditMetrics && detail.assignedToEmployeeId ? (
          <p
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100"
            role="status"
          >
            You can view these metrics, but only{" "}
            <span className="font-medium">
              {detail.assignedToName ?? "the assigned authenticator"}
            </span>{" "}
            can authenticate this item.
          </p>
        ) : null}
        {metricsLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Loading metrics…
          </p>
        ) : null}
        {entriesLoading && !metricsLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Loading saved progress…
          </p>
        ) : null}
        {metricsError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {metricsError}
          </p>
        ) : null}
        {!metricsLoading && !metricsError && !category ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            This item has no category. Add a category on the inventory record to
            match default metrics.
          </p>
        ) : null}
        {!metricsLoading &&
        !metricsError &&
        category &&
        filteredMetrics.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No authentication metrics apply to this item’s category, brand, and
            model. Create custom metrics in Authentication → Authentication
            Metrics if needed.
          </p>
        ) : null}
        {!metricsLoading &&
        !metricsError &&
        !entriesLoading &&
        metricsByCategory.length > 0 ? (
          <div className="flex flex-col gap-3">
            {metricsByCategory.map((group) => (
              <details
                key={group.metricCategory}
                className="group/category overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm open:shadow-md dark:border-slate-700 dark:bg-slate-900"
                open
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/80 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">{group.metricCategory}</span>
                  <span
                    className="shrink-0 text-slate-400 transition-transform duration-200 group-open/category:rotate-180 dark:text-slate-500"
                    aria-hidden
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M6 9l6 6 6-6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </summary>
                <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {group.metrics.map((m) => {
                      const draft = draftByMetricId[m.id];
                      if (!draft) return null;
                      return (
                        <MetricAuthCard
                          key={m.id}
                          metricName={m.metric}
                          description={m.description}
                          value={draft}
                          onChange={(next) =>
                            setDraftByMetricId((prev) => ({
                              ...prev,
                              [m.id]: next,
                            }))
                          }
                          readOnly={!canEditMetrics}
                        />
                      );
                    })}
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
