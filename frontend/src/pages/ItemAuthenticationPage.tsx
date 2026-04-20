import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import {
  MetricAuthCard,
  type MetricDraftValue,
  type MetricVerdict,
} from "../components/MetricAuthCard";
import { PhpPriceInput } from "../components/PhpPriceInput";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import {
  type AuthenticationMetricApi,
  filterMetricsForItem,
  groupMetricsByMetricCategory,
  sortMetricsForDisplay,
} from "../lib/filter-authentication-metrics";

const AUTHENTICATION_RATINGS_KEY = "authentication_ratings";
const FOR_AUTHENTICATION_INVENTORY_STATUS = "For Authentication";

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

type SettingApiRow = {
  key: string;
  type: string;
  value: string;
};

function parseAuthenticationRatings(settings: SettingApiRow[]): string[] {
  const row = settings.find((s) => s.key === AUTHENTICATION_RATINGS_KEY);
  if (!row || row.type !== "string[]") return [];
  try {
    const v = JSON.parse(row.value) as unknown;
    if (!Array.isArray(v)) return [];
    if (!v.every((x) => typeof x === "string")) return [];
    return v;
  } catch {
    return [];
  }
}

const authFieldLabel =
  "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";
const authInputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

/** API fields used on this page only (decoupled from inventory detail UI). */
type ItemAuthenticationPayload = {
  sku: string;
  status: string;
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

function verdictLabel(v: MetricVerdict | null): string {
  if (v === "pass") return "Passed";
  if (v === "fail") return "Failed";
  if (v === "skip") return "Skipped";
  return "—";
}

/**
 * Required Authentication details before Approve (all non-empty after trim).
 * Authenticator notes are optional.
 */
function authenticationDetailsAreComplete(p: {
  itemModel: string;
  brand: string;
  category: string;
  serialNumber: string;
  color: string;
  material: string;
  inclusions: string;
  dimensions: string;
  rating: string;
  marketPrice: string;
  retailPrice: string;
  marketResearchNotes: string;
  marketResearchLink: string;
}): boolean {
  return (
    str(p.itemModel) !== "" &&
    str(p.brand) !== "" &&
    str(p.category) !== "" &&
    str(p.serialNumber) !== "" &&
    str(p.color) !== "" &&
    str(p.material) !== "" &&
    str(p.inclusions) !== "" &&
    str(p.dimensions) !== "" &&
    str(p.rating) !== "" &&
    str(p.marketPrice) !== "" &&
    str(p.retailPrice) !== "" &&
    str(p.marketResearchNotes) !== "" &&
    str(p.marketResearchLink) !== ""
  );
}

/** Snapshot form fields persisted on `inventory_items.item_snapshot.form`. */
function serializeAuthFormFromApiForm(f: Record<string, unknown>): string {
  return JSON.stringify({
    itemModel: str(f.itemModel),
    brand: str(f.brand),
    category: str(f.category),
    serialNumber: str(f.serialNumber),
    color: str(f.color),
    material: str(f.material),
    inclusions: str(f.inclusions),
    dimensions: str(f.dimensions),
    rating: str(f.rating),
    marketPrice: str(f.marketPrice),
    retailPrice: str(f.retailPrice),
    marketResearchNotes: str(f.marketResearchNotes),
    marketResearchLink: str(f.marketResearchLink),
    authenticatorNotes: str(f.authenticatorNotes),
  });
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
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveGateMessage, setApproveGateMessage] = useState<string | null>(
    null,
  );
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveModalError, setApproveModalError] = useState<string | null>(
    null,
  );
  const approveModalTitleId = useId();

  const [authRatings, setAuthRatings] = useState<string[]>([]);
  const [authRatingsLoading, setAuthRatingsLoading] = useState(true);
  const [authRatingsError, setAuthRatingsError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState("");
  const [rating, setRating] = useState("");
  const [marketResearchNotes, setMarketResearchNotes] = useState("");
  const [marketPrice, setMarketPrice] = useState("");
  const [retailPrice, setRetailPrice] = useState("");
  const [researchSourceLink, setResearchSourceLink] = useState("");
  const [notes, setNotes] = useState("");

  const [itemFormModel, setItemFormModel] = useState("");
  const [itemFormBrand, setItemFormBrand] = useState("");
  const [itemFormCategory, setItemFormCategory] = useState("");
  const [itemFormSerial, setItemFormSerial] = useState("");
  const [itemFormColor, setItemFormColor] = useState("");
  const [itemFormMaterial, setItemFormMaterial] = useState("");
  const [itemFormInclusions, setItemFormInclusions] = useState("");

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
    if (!token) {
      setAuthRatingsLoading(false);
      return;
    }
    let cancelled = false;
    setAuthRatingsError(null);
    setAuthRatingsLoading(true);
    void (async () => {
      try {
        const res = await apiFetch("/api/settings", {}, token);
        if (!res.ok) {
          throw new Error(`Could not load settings (${res.status})`);
        }
        const data = (await res.json()) as SettingApiRow[];
        if (!cancelled) {
          setAuthRatings(parseAuthenticationRatings(data));
        }
      } catch (e) {
        if (!cancelled) {
          setAuthRatingsError(
            e instanceof Error ? e.message : "Failed to load ratings",
          );
          setAuthRatings([]);
        }
      } finally {
        if (!cancelled) setAuthRatingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

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

  useLayoutEffect(() => {
    if (!detail) return;
    const f = detail.itemSnapshot.form;
    setItemFormModel(str(f.itemModel));
    setItemFormBrand(str(f.brand));
    setItemFormCategory(str(f.category));
    setItemFormSerial(str(f.serialNumber));
    setItemFormColor(str(f.color));
    setItemFormMaterial(str(f.material));
    setItemFormInclusions(str(f.inclusions));
    setDimensions(str(f.dimensions));
    setRating(str(f.rating));
    setMarketPrice(str(f.marketPrice));
    setRetailPrice(str(f.retailPrice));
    setMarketResearchNotes(str(f.marketResearchNotes));
    setResearchSourceLink(str(f.marketResearchLink));
    setNotes(str(f.authenticatorNotes));
  }, [detail]);

  const filteredMetrics = useMemo(() => {
    if (!detail) return [];
    return sortMetricsForDisplay(
      filterMetricsForItem(
        metrics,
        itemFormCategory,
        itemFormBrand,
        itemFormModel,
      ),
    );
  }, [detail, metrics, itemFormCategory, itemFormBrand, itemFormModel]);

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

  const metricsDirty = useMemo(() => {
    if (!canEditMetrics || entriesLoading) return false;
    return serializeDraftRecord(draftByMetricId) !== savedSerializedRef.current;
  }, [draftByMetricId, canEditMetrics, entriesLoading]);

  const authFormDirty = useMemo(() => {
    if (!canEditMetrics || !detail) return false;
    const baseline = serializeAuthFormFromApiForm(detail.itemSnapshot.form);
    const current = JSON.stringify({
      itemModel: itemFormModel,
      brand: itemFormBrand,
      category: itemFormCategory,
      serialNumber: itemFormSerial,
      color: itemFormColor,
      material: itemFormMaterial,
      inclusions: itemFormInclusions,
      dimensions,
      rating,
      marketPrice,
      retailPrice,
      marketResearchNotes,
      marketResearchLink: researchSourceLink,
      authenticatorNotes: notes,
    });
    return baseline !== current;
  }, [
    canEditMetrics,
    detail,
    itemFormModel,
    itemFormBrand,
    itemFormCategory,
    itemFormSerial,
    itemFormColor,
    itemFormMaterial,
    itemFormInclusions,
    dimensions,
    rating,
    marketPrice,
    retailPrice,
    marketResearchNotes,
    researchSourceLink,
    notes,
  ]);

  const isDirty = metricsDirty || authFormDirty;

  const approveSummaryRows = useMemo(() => {
    const out: Array<{
      id: string;
      metric: string;
      metricStatus: MetricVerdict | null;
      notes: string;
    }> = [];
    for (const m of filteredMetrics) {
      const d = draftByMetricId[m.id];
      if (!d) continue;
      const notesTrim = d.notes.trim();
      const hasNotes = notesTrim !== "";
      const hasVerdict =
        d.metricStatus === "pass" ||
        d.metricStatus === "fail" ||
        d.metricStatus === "skip";
      if (!hasNotes && !hasVerdict) continue;
      out.push({
        id: m.id,
        metric: m.metric,
        metricStatus: d.metricStatus,
        notes: notesTrim,
      });
    }
    return out;
  }, [filteredMetrics, draftByMetricId]);

  useEffect(() => {
    if (!approveModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !approveBusy) setApproveModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [approveModalOpen, approveBusy]);

  useEffect(() => {
    setApproveGateMessage(null);
  }, [
    itemFormModel,
    itemFormBrand,
    itemFormCategory,
    itemFormSerial,
    itemFormColor,
    itemFormMaterial,
    itemFormInclusions,
    dimensions,
    rating,
    marketPrice,
    retailPrice,
    marketResearchNotes,
    researchSourceLink,
    notes,
  ]);

  const tryOpenApproveModal = useCallback(() => {
    if (
      !authenticationDetailsAreComplete({
        itemModel: itemFormModel,
        brand: itemFormBrand,
        category: itemFormCategory,
        serialNumber: itemFormSerial,
        color: itemFormColor,
        material: itemFormMaterial,
        inclusions: itemFormInclusions,
        dimensions,
        rating,
        marketPrice,
        retailPrice,
        marketResearchNotes,
        marketResearchLink: researchSourceLink,
      })
    ) {
      setApproveGateMessage(
        "Complete every required field in Authentication details (item details, dimensions, rating, prices, research, and link). Notes are optional.",
      );
      return;
    }
    setApproveGateMessage(null);
    setApproveModalOpen(true);
    setApproveModalError(null);
  }, [
    itemFormModel,
    itemFormBrand,
    itemFormCategory,
    itemFormSerial,
    itemFormColor,
    itemFormMaterial,
    itemFormInclusions,
    dimensions,
    rating,
    marketPrice,
    retailPrice,
    marketResearchNotes,
    researchSourceLink,
  ]);

  const confirmApproveAuthentication = useCallback(async () => {
    if (!token || !id) return;
    setApproveModalError(null);
    setApproveBusy(true);
    try {
      const res = await apiFetch(
        `/api/inventory/${id}/approve-authentication`,
        { method: "POST" },
        token,
      );
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res));
      }
      setApproveModalOpen(false);
      await load();
    } catch (e) {
      setApproveModalError(
        e instanceof Error ? e.message : "Could not approve item",
      );
    } finally {
      setApproveBusy(false);
    }
  }, [token, id, load]);

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
      const itemSnapshotForm = {
        itemModel: itemFormModel,
        brand: itemFormBrand,
        category: itemFormCategory,
        serialNumber: itemFormSerial,
        color: itemFormColor,
        material: itemFormMaterial,
        inclusions: itemFormInclusions,
        dimensions,
        rating,
        marketPrice,
        retailPrice,
        marketResearchNotes,
        marketResearchLink: researchSourceLink,
        authenticatorNotes: notes,
      };

      const res = await apiFetch(
        `/api/inventory/${id}/item-authentication-metrics`,
        {
          method: "POST",
          body: JSON.stringify({
            rows: payloadRows,
            itemSnapshotForm,
          }),
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
      await load();
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Could not save changes",
      );
    } finally {
      setSaveBusy(false);
    }
  }, [
    token,
    id,
    canEditMetrics,
    filteredMetrics,
    draftByMetricId,
    itemFormModel,
    itemFormBrand,
    itemFormCategory,
    itemFormSerial,
    itemFormColor,
    itemFormMaterial,
    itemFormInclusions,
    dimensions,
    rating,
    marketPrice,
    retailPrice,
    marketResearchNotes,
    researchSourceLink,
    notes,
    load,
  ]);

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

  const brandModelSubtitle =
    itemFormBrand && itemFormModel
      ? `${itemFormBrand} — ${itemFormModel}`
      : itemFormBrand || itemFormModel || "—";

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
            {itemFormCategory || "—"}
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

      {approveGateMessage ? (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
          role="status"
        >
          {approveGateMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3">
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
        {canEditMetrics &&
        detail.status === FOR_AUTHENTICATION_INVENTORY_STATUS ? (
          <button
            type="button"
            onClick={() => tryOpenApproveModal()}
            disabled={saveBusy || approveBusy}
            className="shrink-0 rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-500 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
          >
            Approve
          </button>
        ) : null}
      </div>

      {approveModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby={approveModalTitleId}
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50"
                aria-label="Close"
                disabled={approveBusy}
                onClick={() => {
                  if (!approveBusy) setApproveModalOpen(false);
                }}
              />
              <div className="relative z-10 flex max-h-[min(90vh,32rem)] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <div className="shrink-0 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                  <h2
                    id={approveModalTitleId}
                    className="text-base font-semibold text-slate-900 dark:text-slate-100"
                  >
                    Review metrics before approval
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Metrics with a pass, fail, skip, or notes. Confirming sets
                    this item to <span className="font-medium">For Photoshoot</span>{" "}
                    and updates contract dates on the linked inquiry when
                    applicable.
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  {approveSummaryRows.length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      No metrics with a pass, fail, skip, or notes yet. Complete
                      the checklist below first.
                    </p>
                  ) : (
                    <ul className="list-outside list-disc space-y-2 pl-5 text-sm text-slate-800 dark:text-slate-200">
                      {approveSummaryRows.map((row) => (
                        <li key={row.id} className="pl-1">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {row.metric}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400">
                            {": "}
                          </span>
                          {row.metricStatus != null ? (
                            <span
                              className={
                                row.metricStatus === "pass"
                                  ? "font-semibold text-emerald-700 dark:text-emerald-400"
                                  : row.metricStatus === "fail"
                                    ? "font-semibold text-red-700 dark:text-red-400"
                                    : "font-medium text-slate-800 dark:text-slate-200"
                              }
                            >
                              {verdictLabel(row.metricStatus)}
                            </span>
                          ) : null}
                          {row.metricStatus != null && row.notes ? (
                            <span className="text-slate-500 dark:text-slate-400">
                              {", "}
                            </span>
                          ) : null}
                          {row.notes ? (
                            <span className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                              {row.notes}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="shrink-0 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                  {approveModalError ? (
                    <p
                      className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                      role="alert"
                    >
                      {approveModalError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={approveBusy}
                      onClick={() => setApproveModalOpen(false)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      disabled={approveBusy}
                      onClick={() => void confirmApproveAuthentication()}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                    >
                      {approveBusy ? "Approving…" : "Confirm approval"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <section
        aria-labelledby="auth-detail-form-heading"
        className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        {!canEditMetrics && detail.assignedToEmployeeId ? (
          <p
            className="rounded-t-xl border-b border-slate-100 bg-amber-50/90 px-4 py-3 text-sm leading-relaxed text-amber-950 dark:border-slate-800 dark:bg-amber-950/25 dark:text-amber-100 sm:px-5"
            role="status"
          >
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200">
              View only
            </span>
            <span className="mt-2 block sm:mt-0 sm:ml-2 sm:inline">
              This item is assigned to{" "}
              <span className="font-medium">
                {detail.assignedToName ?? "an authenticator"}
              </span>{" "}
              for authentication. You can review the authentication details and
              metrics below, but your account cannot edit fields or save
              changes.
            </span>
          </p>
        ) : null}
        <details open className="group/auth-detail overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80 sm:px-5 sm:py-4 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0 text-left">
              <h2
                id="auth-detail-form-heading"
                className="text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                Authentication details
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Item details and authentication fields are saved with{" "}
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  Save changes
                </span>{" "}
                (together with metric results).
              </p>
            </div>
            <span
              className="shrink-0 text-slate-400 transition-transform duration-200 group-open/auth-detail:rotate-180 dark:text-slate-500"
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
          <div className="border-t border-slate-100 px-4 pb-4 pt-4 dark:border-slate-800 sm:px-5 sm:pb-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Item details
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="item-auth-model" className={authFieldLabel}>
                  Model
                </label>
                <input
                  id="item-auth-model"
                  type="text"
                  value={itemFormModel}
                  onChange={(e) => setItemFormModel(e.target.value)}
                  disabled={!canEditMetrics}
                  className={authInputClass}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="item-auth-brand" className={authFieldLabel}>
                  Brand
                </label>
                <input
                  id="item-auth-brand"
                  type="text"
                  value={itemFormBrand}
                  onChange={(e) => setItemFormBrand(e.target.value)}
                  disabled={!canEditMetrics}
                  className={authInputClass}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="item-auth-category" className={authFieldLabel}>
                  Category
                </label>
                <input
                  id="item-auth-category"
                  type="text"
                  value={itemFormCategory}
                  onChange={(e) => setItemFormCategory(e.target.value)}
                  disabled={!canEditMetrics}
                  className={authInputClass}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="item-auth-serial" className={authFieldLabel}>
                  Serial number
                </label>
                <input
                  id="item-auth-serial"
                  type="text"
                  value={itemFormSerial}
                  onChange={(e) => setItemFormSerial(e.target.value)}
                  disabled={!canEditMetrics}
                  className={authInputClass}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="item-auth-color" className={authFieldLabel}>
                  Color
                </label>
                <input
                  id="item-auth-color"
                  type="text"
                  value={itemFormColor}
                  onChange={(e) => setItemFormColor(e.target.value)}
                  disabled={!canEditMetrics}
                  className={authInputClass}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="item-auth-material" className={authFieldLabel}>
                  Material
                </label>
                <input
                  id="item-auth-material"
                  type="text"
                  value={itemFormMaterial}
                  onChange={(e) => setItemFormMaterial(e.target.value)}
                  disabled={!canEditMetrics}
                  className={authInputClass}
                  autoComplete="off"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label
                  htmlFor="item-auth-inclusions"
                  className={authFieldLabel}
                >
                  Inclusions
                </label>
                <textarea
                  id="item-auth-inclusions"
                  value={itemFormInclusions}
                  onChange={(e) => setItemFormInclusions(e.target.value)}
                  disabled={!canEditMetrics}
                  rows={3}
                  className={`${authInputClass} min-h-[4.5rem] resize-y whitespace-pre-wrap`}
                />
              </div>
            </div>

            <form
              className="mt-6 space-y-4 border-t border-slate-100 pt-6 dark:border-slate-800"
              onSubmit={(e) => e.preventDefault()}
            >
              {authRatingsError ? (
                <p
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
                  role="status"
                >
                  {authRatingsError} — rating dropdown may be empty.
                </p>
              ) : null}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="min-w-0">
                  <label
                    htmlFor="item-auth-dimensions"
                    className={authFieldLabel}
                  >
                    Dimensions
                  </label>
                  <input
                    id="item-auth-dimensions"
                    type="text"
                    value={dimensions}
                    onChange={(e) => setDimensions(e.target.value)}
                    disabled={!canEditMetrics}
                    className={authInputClass}
                    placeholder="e.g. 25 × 18 × 12 cm"
                    autoComplete="off"
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="item-auth-rating" className={authFieldLabel}>
                    Rating
                  </label>
                  <select
                    id="item-auth-rating"
                    value={rating}
                    onChange={(e) => setRating(e.target.value)}
                    disabled={!canEditMetrics || authRatingsLoading}
                    className={authInputClass}
                  >
                    <option value="">
                      {authRatingsLoading
                        ? "Loading ratings…"
                        : "Select rating…"}
                    </option>
                    {authRatings.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label
                    htmlFor="item-auth-market-price"
                    className={authFieldLabel}
                  >
                    Market price
                  </label>
                  <PhpPriceInput
                    id="item-auth-market-price"
                    value={marketPrice}
                    onChange={setMarketPrice}
                    disabled={!canEditMetrics}
                    className={authInputClass}
                  />
                </div>
                <div className="min-w-0">
                  <label
                    htmlFor="item-auth-retail-price"
                    className={authFieldLabel}
                  >
                    Retail price
                  </label>
                  <PhpPriceInput
                    id="item-auth-retail-price"
                    value={retailPrice}
                    onChange={setRetailPrice}
                    disabled={!canEditMetrics}
                    className={authInputClass}
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="item-auth-market-research-notes"
                  className={authFieldLabel}
                >
                  Market research notes
                </label>
                <textarea
                  id="item-auth-market-research-notes"
                  value={marketResearchNotes}
                  onChange={(e) => setMarketResearchNotes(e.target.value)}
                  disabled={!canEditMetrics}
                  rows={4}
                  className={`${authInputClass} min-h-[5rem] resize-y`}
                />
              </div>
              <div>
                <label
                  htmlFor="item-auth-research-source-link"
                  className={authFieldLabel}
                >
                  Research source link
                </label>
                <input
                  id="item-auth-research-source-link"
                  type="url"
                  inputMode="url"
                  value={researchSourceLink}
                  onChange={(e) => setResearchSourceLink(e.target.value)}
                  disabled={!canEditMetrics}
                  className={authInputClass}
                  placeholder="https://"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="item-auth-notes" className={authFieldLabel}>
                  Notes
                </label>
                <textarea
                  id="item-auth-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!canEditMetrics}
                  rows={3}
                  className={`${authInputClass} min-h-[4.5rem] resize-y`}
                />
              </div>
            </form>
          </div>
        </details>
      </section>

      <section aria-labelledby="auth-metrics-heading">
        <div className="mb-3">
          <h2
            id="auth-metrics-heading"
            className="text-sm font-semibold text-slate-900 dark:text-slate-100"
          >
            Authentication metrics
          </h2>
        </div>
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
        {!metricsLoading && !metricsError && !itemFormCategory.trim() ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            This item has no category. Add a category on the inventory record to
            match default metrics.
          </p>
        ) : null}
        {!metricsLoading &&
        !metricsError &&
        itemFormCategory.trim() &&
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
