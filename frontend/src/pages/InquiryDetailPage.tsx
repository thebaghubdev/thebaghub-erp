import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";

type InquiryDetail = {
  id: string;
  sku: string;
  itemLabel: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  consignorName: string;
  consignorEmail: string;
  consignorPhone: string;
  brand: string;
  category: string;
  itemModel: string;
  serialNumber: string;
  condition: string;
  inclusions: string;
  consignmentSellingPrice: string;
  directPurchaseSellingPrice: string;
  consentDirectPurchase: boolean;
  consentPriceNomination: boolean;
  photoCount: number;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
    images: Array<{ key: string; url: string }>;
  };
};

function formatInquiryStatus(status: string) {
  return status.replace(/_/g, " ");
}

function formatDatePurchased(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function yesNo(v: unknown): string {
  return v === true || v === "true" ? "Yes" : "No";
}

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

export function InquiryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = usePortalAuth();
  const [detail, setDetail] = useState<InquiryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/inquiries/${id}`, {}, token);
      if (res.status === 404) {
        setError("Inquiry not found.");
        setDetail(null);
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as InquiryDetail;
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inquiry");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const form = detail?.itemSnapshot.form ?? {};

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/portal/inquiries"
          className="text-sm font-medium text-violet-700 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100"
        >
          ← Back to inquiries
        </Link>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      {loading && (
        <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>
      )}

      {!loading && detail && (
        <>
          <div className={cardClass}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {detail.sku}
              </h1>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {formatInquiryStatus(detail.status)}
              </span>
            </div>
            {detail.itemLabel && detail.itemLabel !== "Item" ? (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {detail.itemLabel}
              </p>
            ) : null}
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Submitted
                </dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  <SubmittedAtCell iso={detail.createdAt} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Last updated
                </dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  <SubmittedAtCell iso={detail.updatedAt} />
                </dd>
              </div>
            </dl>
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Consignor
            </h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Name</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">
                  {detail.consignorName}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                <dd className="break-all text-slate-800 dark:text-slate-200">
                  {detail.consignorEmail}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Phone</dt>
                <dd className="text-slate-800 dark:text-slate-200">
                  {detail.consignorPhone}
                </dd>
              </div>
            </dl>
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Item details
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm text-slate-800 dark:text-slate-200 sm:grid-cols-2">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Model</dt>
                <dd className="font-medium">{str(form.itemModel) || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Brand</dt>
                <dd>{str(form.brand) || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Category</dt>
                <dd>{str(form.category) || "—"}</dd>
              </div>
              {str(form.serialNumber) ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Serial number
                  </dt>
                  <dd className="break-all font-mono text-xs sm:text-sm">
                    {str(form.serialNumber)}
                  </dd>
                </div>
              ) : null}
              {str(form.color) ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Color</dt>
                  <dd>{str(form.color)}</dd>
                </div>
              ) : null}
              {str(form.material) ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Material
                  </dt>
                  <dd>{str(form.material)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Condition
                </dt>
                <dd>{str(form.condition) || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500 dark:text-slate-400">
                  Inclusions
                </dt>
                <dd className="whitespace-pre-wrap">
                  {str(form.inclusions) || "—"}
                </dd>
              </div>
              {form.datePurchased ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Date purchased
                  </dt>
                  <dd>{formatDatePurchased(form.datePurchased)}</dd>
                </div>
              ) : null}
              {str(form.sourceOfPurchase) ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Source of purchase
                  </dt>
                  <dd>{str(form.sourceOfPurchase)}</dd>
                </div>
              ) : null}
              {str(form.consignmentSellingPrice) ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Consignment selling price
                  </dt>
                  <dd className="tabular-nums">
                    {str(form.consignmentSellingPrice)}
                  </dd>
                </div>
              ) : null}
              {str(form.directPurchaseSellingPrice) ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Direct purchase selling price
                  </dt>
                  <dd className="tabular-nums">
                    {str(form.directPurchaseSellingPrice)}
                  </dd>
                </div>
              ) : null}
              {str(form.specialInstructions) ? (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500 dark:text-slate-400">
                    Special instructions
                  </dt>
                  <dd className="whitespace-pre-wrap">
                    {str(form.specialInstructions)}
                  </dd>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <dt className="text-slate-500 dark:text-slate-400">Consents</dt>
                <dd className="text-sm">
                  Direct purchase &amp; terms:{" "}
                  {yesNo(form.consentDirectPurchase)}
                  <br />
                  Price nomination (market research):{" "}
                  {yesNo(form.consentPriceNomination)}
                </dd>
              </div>
            </dl>
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Photos
              {detail.photoCount > 0 ? (
                <span className="ml-2 font-normal normal-case text-slate-500">
                  ({detail.photoCount})
                </span>
              ) : null}
            </h2>
            {detail.itemSnapshot.images.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                No photos uploaded.
              </p>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {detail.itemSnapshot.images.map((img) => (
                  <li
                    key={img.key}
                    className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"
                  >
                    <a
                      href={img.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500"
                    >
                      <img
                        src={img.url}
                        alt=""
                        className="aspect-square w-full object-cover"
                        loading="lazy"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
