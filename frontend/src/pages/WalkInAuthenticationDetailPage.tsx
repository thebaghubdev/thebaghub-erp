import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  MetricAuthCard,
  type MetricDraftValue,
  type MetricVerdict,
} from "../components/MetricAuthCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PhpPriceInput } from "../components/PhpPriceInput";
import { SearchableSelect } from "../components/SearchableSelect";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import {
  type AuthenticationMetricApi,
  filterMetricsForItem,
  groupMetricsByMetricCategory,
  sortMetricsForDisplay,
} from "../lib/filter-authentication-metrics";
import { formatPhpDisplay, parsePhpStringToNumber } from "../lib/format-php";
import { orderPaymentStatusBadgeClass } from "../lib/order-payments";
import { isPaymentAwaitingVerification } from "../lib/payment-status";
import { useFeatureAccess } from "../lib/use-feature-access";
import {
  walkInAuthResultBadgeClassName,
  walkInAuthStatusBadgeClassName,
} from "../lib/walk-in-authentication-status-badge";

const ASSIGNED = "Assigned";
const COMPLETED = "Completed";
const RESULTS = ["Authentic", "Not authentic", "Inconclusive"] as const;

const ITEM_CATEGORIES_KEY = "item_categories";
const BRANDS_WE_CONSIGN_KEY = "brands_we_consign";

type SettingApiRow = { key: string; type: string; value: string };

type DetailPayload = {
  id: string;
  sku: string;
  branch: string;
  firstName: string;
  lastName: string;
  contactNumber: string;
  email: string;
  itemModel: string;
  brand: string;
  category: string;
  serialNumber: string | null;
  color: string | null;
  material: string | null;
  inclusions: string | null;
  paymentAmount: string;
  paymentProof: Array<{ key: string; url: string }>;
  paymentStatus: string;
  status: string;
  result: string | null;
  salesAssociateName: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  dimensions: string | null;
  marketPrice: string | null;
  retailPrice: string | null;
  marketResearchNotes: string | null;
  marketResearchLink: string | null;
  authenticatorNotes: string | null;
  thirdPartyAuthentication: {
    selectedAuthenticator: "LegitGrails" | "Entrupy" | null;
    certificateLink: string | null;
    certificatePhotos: string[];
    notes: string | null;
  };
  metrics: Array<{
    id: string;
    authenticationMetricId: string;
    notes: string | null;
    metricStatus: string | null;
    photos: string[];
  }>;
};

const fieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
const labelClass =
  "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";

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

function emptyDraft(): MetricDraftValue {
  return { metricStatus: null, notes: "", photos: [], files: [] };
}

export function WalkInAuthenticationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = usePortalAuth();

  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyConfirmOpen, setVerifyConfirmOpen] = useState(false);

  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [catalogMetrics, setCatalogMetrics] = useState<AuthenticationMetricApi[]>(
    [],
  );

  const [itemModel, setItemModel] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [color, setColor] = useState("");
  const [material, setMaterial] = useState("");
  const [inclusions, setInclusions] = useState("");

  const [dimensions, setDimensions] = useState("");
  const [marketPrice, setMarketPrice] = useState("");
  const [retailPrice, setRetailPrice] = useState("");
  const [marketResearchNotes, setMarketResearchNotes] = useState("");
  const [marketResearchLink, setMarketResearchLink] = useState("");
  const [authenticatorNotes, setAuthenticatorNotes] = useState("");

  const [thirdPartyAuthenticator, setThirdPartyAuthenticator] = useState<
    "" | "LegitGrails" | "Entrupy"
  >("");
  const [certificateLink, setCertificateLink] = useState("");
  const [certificateNotes, setCertificateNotes] = useState("");
  const [certificatePhotos, setCertificatePhotos] = useState<string[]>([]);
  const [certificateFiles, setCertificateFiles] = useState<File[]>([]);

  const [draftByMetricId, setDraftByMetricId] = useState<
    Record<string, MetricDraftValue>
  >({});
  const [result, setResult] = useState<string>("");

  const myEmployeeId = user?.employee?.id ?? null;
  const feature = useFeatureAccess("walk-in-authentication");
  const paymentVerification = useFeatureAccess("payment-verification");
  const canVerifyPayments = paymentVerification.canEdit;

  const roleCanEdit = useMemo(() => {
    if (!detail) return false;
    if (detail.status !== ASSIGNED) return false;
    if (user?.isAdmin) return true;
    return (
      !!myEmployeeId &&
      !!detail.assignedToId &&
      myEmployeeId === detail.assignedToId
    );
  }, [detail, user?.isAdmin, myEmployeeId]);

  const canEdit = roleCanEdit && feature.canEdit;

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/walk-in-authentication/${id}`, {}, token);
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as DetailPayload;
      setDetail(data);
      setItemModel(data.itemModel ?? "");
      setBrand(data.brand ?? "");
      setCategory(data.category ?? "");
      setSerialNumber(data.serialNumber ?? "");
      setColor(data.color ?? "");
      setMaterial(data.material ?? "");
      setInclusions(data.inclusions ?? "");
      setDimensions(data.dimensions ?? "");
      setMarketPrice(data.marketPrice ?? "");
      setRetailPrice(data.retailPrice ?? "");
      setMarketResearchNotes(data.marketResearchNotes ?? "");
      setMarketResearchLink(data.marketResearchLink ?? "");
      setAuthenticatorNotes(data.authenticatorNotes ?? "");
      setThirdPartyAuthenticator(
        data.thirdPartyAuthentication?.selectedAuthenticator ?? "",
      );
      setCertificateLink(
        data.thirdPartyAuthentication?.certificateLink ?? "",
      );
      setCertificateNotes(data.thirdPartyAuthentication?.notes ?? "");
      setCertificatePhotos(
        Array.isArray(data.thirdPartyAuthentication?.certificatePhotos)
          ? [...data.thirdPartyAuthentication.certificatePhotos]
          : [],
      );
      setCertificateFiles([]);
      setResult(data.result ?? "");

      const drafts: Record<string, MetricDraftValue> = {};
      for (const m of data.metrics ?? []) {
        drafts[m.authenticationMetricId] = {
          metricStatus: (m.metricStatus as MetricVerdict | null) ?? null,
          notes: m.notes ?? "",
          photos: Array.isArray(m.photos) ? [...m.photos] : [],
          files: [],
        };
      }
      setDraftByMetricId(drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const [settingsRes, metricsRes] = await Promise.all([
          apiFetch("/api/settings", {}, token),
          apiFetch("/api/authentication-metrics", {}, token),
        ]);
        if (settingsRes.ok) {
          const settings = (await settingsRes.json()) as SettingApiRow[];
          const byKey = new Map(settings.map((r) => [r.key, r.value]));
          setBrands(parseStringArraySetting(byKey.get(BRANDS_WE_CONSIGN_KEY)));
          setCategories(
            parseStringArraySetting(byKey.get(ITEM_CATEGORIES_KEY)),
          );
        }
        if (metricsRes.ok) {
          const metrics = (await metricsRes.json()) as AuthenticationMetricApi[];
          setCatalogMetrics(Array.isArray(metrics) ? metrics : []);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [token]);

  const filteredMetrics = useMemo(
    () =>
      sortMetricsForDisplay(
        filterMetricsForItem(catalogMetrics, category, brand, itemModel),
      ),
    [catalogMetrics, category, brand, itemModel],
  );

  const groupedMetrics = useMemo(
    () => groupMetricsByMetricCategory(filteredMetrics),
    [filteredMetrics],
  );

  const persist = useCallback(async () => {
    if (!token || !id || !detail) return;
    if (!canEdit) {
      throw new Error("Only the assigned authenticator can save changes.");
    }

    const normalizedMarketPrice = (() => {
      const n = parsePhpStringToNumber(marketPrice);
      return n != null && n >= 0 ? n.toFixed(2) : marketPrice.trim();
    })();
    const normalizedRetailPrice = (() => {
      const n = parsePhpStringToNumber(retailPrice);
      return n != null && n >= 0 ? n.toFixed(2) : retailPrice.trim();
    })();

    const rows = await Promise.all(
      filteredMetrics.map(async (m) => {
        const d = draftByMetricId[m.id] ?? emptyDraft();
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

    const thirdPartyExtra = certificateFiles.length
      ? await filesToDataUrls(certificateFiles)
      : [];
    const certPhotosMerged = [...certificatePhotos, ...thirdPartyExtra];

    const res = await apiFetch(
      `/api/walk-in-authentication/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          rows,
          itemSnapshot: {
            itemModel,
            brand,
            category,
            serialNumber,
            color,
            material,
            inclusions,
          },
          authenticationDetails: {
            dimensions,
            marketPrice: normalizedMarketPrice,
            retailPrice: normalizedRetailPrice,
            marketResearchNotes,
            marketResearchLink,
            authenticatorNotes,
          },
          thirdPartyAuthentication: {
            selectedAuthenticator:
              thirdPartyAuthenticator === "" ? null : thirdPartyAuthenticator,
            certificateLink:
              certificateLink.trim() === "" ? null : certificateLink.trim(),
            certificatePhotos:
              certPhotosMerged.length > 0 ? certPhotosMerged : null,
            notes:
              certificateNotes.trim() === "" ? null : certificateNotes.trim(),
          },
        }),
      },
      token,
    );
    if (!res.ok) throw new Error(await readApiErrorMessage(res));
    await load();
  }, [
    token,
    id,
    detail,
    canEdit,
    filteredMetrics,
    draftByMetricId,
    itemModel,
    brand,
    category,
    serialNumber,
    color,
    material,
    inclusions,
    dimensions,
    marketPrice,
    retailPrice,
    marketResearchNotes,
    marketResearchLink,
    authenticatorNotes,
    thirdPartyAuthenticator,
    certificateLink,
    certificateNotes,
    certificatePhotos,
    certificateFiles,
    load,
  ]);

  const onSave = useCallback(async () => {
    setActionError(null);
    setActionOk(null);
    setBusy(true);
    try {
      await persist();
      setActionOk("Changes saved.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }, [persist]);

  const onComplete = useCallback(async () => {
    if (!token || !id) return;
    if (!RESULTS.includes(result as (typeof RESULTS)[number])) {
      setActionError("Select an authentication result before marking as done.");
      return;
    }
    setActionError(null);
    setActionOk(null);
    setBusy(true);
    try {
      await persist();
      const res = await apiFetch(
        `/api/walk-in-authentication/${id}/complete`,
        {
          method: "POST",
          body: JSON.stringify({ result }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      setActionOk("Marked as done.");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not complete");
    } finally {
      setBusy(false);
    }
  }, [token, id, result, persist, load]);

  const confirmVerifyPayment = useCallback(async () => {
    if (!token || !id) return;
    setActionError(null);
    setActionOk(null);
    setBusy(true);
    try {
      const res = await apiFetch(
        `/api/walk-in-authentication/${id}/payment-verify`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as DetailPayload;
      setDetail(data);
      setVerifyConfirmOpen(false);
      setActionOk("Payment verified.");
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not verify payment",
      );
    } finally {
      setBusy(false);
    }
  }, [token, id]);

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-500">Loading walk-in authentication…</div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <p className="text-sm text-rose-700 dark:text-rose-300">
          {error ?? "Not found"}
        </p>
        <Link
          to="/portal/walk-in-authentication"
          className="text-sm font-medium text-violet-700 underline dark:text-violet-300"
        >
          Back to queue
        </Link>
      </div>
    );
  }

  const readOnly = !canEdit;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      {feature.readOnly ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          You have view-only access to this feature.
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/portal/walk-in-authentication"
            className="text-sm text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
          >
            ← Walk-in Authentication
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {detail.sku}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={walkInAuthStatusBadgeClassName(detail.status)}>
              {detail.status}
            </span>
            {detail.result && (
              <span className={walkInAuthResultBadgeClassName(detail.result)}>
                {detail.result}
              </span>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSave()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              Save changes
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onComplete()}
              className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Mark as done
            </button>
          </div>
        )}
      </div>

      {actionError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {actionError}
        </p>
      )}
      {actionOk && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {actionOk}
        </p>
      )}

      {detail.status === "Pending" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          This inquiry is pending assignment. Assign an authenticator from the
          queue before editing authentication fields.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          Client & payment
        </h2>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="block text-xs text-slate-500">Name</span>
          {detail.firstName} {detail.lastName}
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="block text-xs text-slate-500">Contact</span>
          {detail.contactNumber}
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="block text-xs text-slate-500">Email</span>
          {detail.email}
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="block text-xs text-slate-500">Branch</span>
          {detail.branch}
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="block text-xs text-slate-500">Payment amount</span>
          {formatPhpDisplay(detail.paymentAmount)}
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="block text-xs text-slate-500">Payment status</span>
          <span className="mt-1 inline-flex items-center gap-2">
            <span className={orderPaymentStatusBadgeClass(detail.paymentStatus)}>
              {detail.paymentStatus}
            </span>
            {canVerifyPayments &&
            isPaymentAwaitingVerification(detail.paymentStatus) ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setActionError(null);
                  setVerifyConfirmOpen(true);
                }}
                className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-900/80"
              >
                Verify payment
              </button>
            ) : null}
          </span>
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="block text-xs text-slate-500">Sales associate</span>
          {detail.salesAssociateName ?? "—"}
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="block text-xs text-slate-500">Authenticator</span>
          {detail.assignedToName ?? "—"}
        </p>
        <div className="sm:col-span-2">
          <span className="block text-xs text-slate-500">Proof of payment</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {detail.paymentProof.length === 0 && (
              <span className="text-sm text-slate-500">None</span>
            )}
            {detail.paymentProof.map((p) => (
              <a
                key={p.key}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-violet-700 underline dark:text-violet-300"
              >
                View proof
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          Item details
        </h2>
        <div>
          <label className={labelClass} htmlFor="wia-d-model">
            Model
          </label>
          <input
            id="wia-d-model"
            className={fieldClass}
            value={itemModel}
            disabled={readOnly}
            onChange={(e) => setItemModel(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="wia-d-brand">
            Brand
          </label>
          <SearchableSelect
            id="wia-d-brand"
            className={fieldClass}
            value={brand}
            options={brands}
            disabled={readOnly}
            onChange={setBrand}
            placeholder="Select brand"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="wia-d-category">
            Category
          </label>
          <select
            id="wia-d-category"
            className={fieldClass}
            value={category}
            disabled={readOnly}
            onChange={(e) => setCategory(e.target.value)}
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
          <label className={labelClass} htmlFor="wia-d-serial">
            Serial number
          </label>
          <input
            id="wia-d-serial"
            className={fieldClass}
            value={serialNumber}
            disabled={readOnly}
            onChange={(e) => setSerialNumber(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="wia-d-color">
            Color
          </label>
          <input
            id="wia-d-color"
            className={fieldClass}
            value={color}
            disabled={readOnly}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="wia-d-material">
            Material
          </label>
          <input
            id="wia-d-material"
            className={fieldClass}
            value={material}
            disabled={readOnly}
            onChange={(e) => setMaterial(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="wia-d-inclusions">
            Inclusions
          </label>
          <textarea
            id="wia-d-inclusions"
            className={fieldClass}
            rows={2}
            value={inclusions}
            disabled={readOnly}
            onChange={(e) => setInclusions(e.target.value)}
          />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          Authentication details
        </h2>
        <div>
          <label className={labelClass} htmlFor="wia-d-dimensions">
            Dimensions (optional)
          </label>
          <input
            id="wia-d-dimensions"
            className={fieldClass}
            value={dimensions}
            disabled={readOnly}
            onChange={(e) => setDimensions(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="wia-d-market-price">
            Market price (optional)
          </label>
          <PhpPriceInput
            id="wia-d-market-price"
            className={`${fieldClass} pl-8`}
            value={marketPrice}
            disabled={readOnly}
            onChange={setMarketPrice}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="wia-d-retail-price">
            Retail price (optional)
          </label>
          <PhpPriceInput
            id="wia-d-retail-price"
            className={`${fieldClass} pl-8`}
            value={retailPrice}
            disabled={readOnly}
            onChange={setRetailPrice}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="wia-d-research-notes">
            Market research notes (optional)
          </label>
          <textarea
            id="wia-d-research-notes"
            className={fieldClass}
            rows={2}
            value={marketResearchNotes}
            disabled={readOnly}
            onChange={(e) => setMarketResearchNotes(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="wia-d-research-link">
            Market research link (optional)
          </label>
          <input
            id="wia-d-research-link"
            className={fieldClass}
            value={marketResearchLink}
            disabled={readOnly}
            onChange={(e) => setMarketResearchLink(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="wia-d-auth-notes">
            Authenticator notes
          </label>
          <textarea
            id="wia-d-auth-notes"
            className={fieldClass}
            rows={3}
            value={authenticatorNotes}
            disabled={readOnly}
            onChange={(e) => setAuthenticatorNotes(e.target.value)}
          />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          Third-party authentication
        </h2>
        <div>
          <label className={labelClass} htmlFor="wia-d-tp-auth">
            Provider
          </label>
          <select
            id="wia-d-tp-auth"
            className={fieldClass}
            value={thirdPartyAuthenticator}
            disabled={readOnly}
            onChange={(e) =>
              setThirdPartyAuthenticator(
                e.target.value as "" | "LegitGrails" | "Entrupy",
              )
            }
          >
            <option value="">None</option>
            <option value="LegitGrails">LegitGrails</option>
            <option value="Entrupy">Entrupy</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="wia-d-cert-link">
            Certificate link
          </label>
          <input
            id="wia-d-cert-link"
            className={fieldClass}
            value={certificateLink}
            disabled={readOnly}
            onChange={(e) => setCertificateLink(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="wia-d-cert-notes">
            Certificate notes
          </label>
          <textarea
            id="wia-d-cert-notes"
            className={fieldClass}
            rows={2}
            value={certificateNotes}
            disabled={readOnly}
            onChange={(e) => setCertificateNotes(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <span className={labelClass}>Certificate photos</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {certificatePhotos.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block h-16 w-16 overflow-hidden rounded border border-slate-200 dark:border-slate-700"
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
          {!readOnly && (
            <input
              type="file"
              accept="image/*"
              multiple
              className="mt-2 block w-full text-sm"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) {
                  setCertificateFiles((prev) => [...prev, ...files]);
                }
                e.target.value = "";
              }}
            />
          )}
          {certificateFiles.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {certificateFiles.length} new photo(s) pending save
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="wia-auth-metrics-heading">
        <div>
          <h2
            id="wia-auth-metrics-heading"
            className="text-sm font-semibold text-slate-900 dark:text-slate-100"
          >
            Authentication metrics
          </h2>
        </div>
        {!category.trim() ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            This item has no category. Add a category to match default metrics.
          </p>
        ) : null}
        {category.trim() && groupedMetrics.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No authentication metrics apply to this item’s category, brand, and
            model.
          </p>
        ) : null}
        {groupedMetrics.length > 0 ? (
          <div className="flex flex-col gap-3">
            {groupedMetrics.map((group) => (
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
                    {group.metrics.map((m) => (
                      <MetricAuthCard
                        key={m.id}
                        metricName={m.metric}
                        description={m.description}
                        readOnly={readOnly}
                        value={draftByMetricId[m.id] ?? emptyDraft()}
                        onChange={(next) =>
                          setDraftByMetricId((prev) => ({
                            ...prev,
                            [m.id]: next,
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </section>

      {(canEdit || detail.status === COMPLETED) && (
        <section>
          <label className={labelClass} htmlFor="wia-d-result">
            Authentication result
          </label>
          <select
            id="wia-d-result"
            className={fieldClass}
            value={result}
            disabled={readOnly || detail.status === COMPLETED}
            onChange={(e) => setResult(e.target.value)}
          >
            <option value="">Select result</option>
            {RESULTS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {canEdit && (
            <p className="mt-1 text-xs text-slate-500">
              Required when marking as done.
            </p>
          )}
        </section>
      )}

      <ConfirmDialog
        open={verifyConfirmOpen}
        title="Verify walk-in authentication payment?"
        description="This confirms the proof of payment. The item can then be assigned to an authenticator."
        confirmLabel="Verify payment"
        cancelLabel="Cancel"
        busy={busy}
        errorMessage={actionError}
        onCancel={() => {
          if (busy) return;
          setVerifyConfirmOpen(false);
        }}
        onConfirm={confirmVerifyPayment}
      />
    </div>
  );
}
