import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { branchLabel } from "../lib/consignment-schedule-labels";
import { formatOfferTransactionLabel } from "../lib/format-offer-transaction-type";
import { formatPhpDisplay } from "../lib/format-php";

type InventoryDetailForStaff = {
  id: string;
  sku: string;
  dateReceived: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  transactionType: string | null;
  currentBranch: string;
  inquiryId: string | null;
  inquirySku: string | null;
  consignorId: string | null;
  consignorName: string | null;
  consignorEmail: string | null;
  consignorPhone: string | null;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
  };
  assignedToEmployeeId?: string | null;
  assignedToName?: string | null;
};

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

export function InventoryItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = usePortalAuth();
  const [detail, setDetail] = useState<InventoryDetailForStaff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const data = (await res.json()) as InventoryDetailForStaff;
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
          to="/portal/inventory"
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to inventory
        </Link>
      </div>
    );
  }

  const form = detail.itemSnapshot.form;
  const brand = str(form.brand);
  const itemModel = str(form.itemModel);
  const brandModelSubtitle =
    brand && itemModel ? `${brand} — ${itemModel}` : brand || itemModel || "—";

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Inventory item
          </p>
          <h1 className="mt-1 break-all font-mono text-xl font-semibold text-slate-900 dark:text-slate-100">
            {detail.sku}
          </h1>
          <p className="mt-2 break-words text-base text-slate-700 dark:text-slate-300">
            {brandModelSubtitle}
          </p>
        </div>
        <Link
          to="/portal/inventory"
          className="shrink-0 text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to inventory
        </Link>
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Record
          </h2>
          {detail.inquiryId ? (
            <Link
              to={`/portal/inquiries/${detail.inquiryId}`}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-900 transition-colors hover:bg-violet-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-900/80"
            >
              View inquiry
            </Link>
          ) : null}
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm text-slate-800 dark:text-slate-200 sm:grid-cols-2">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">
              Date received
            </dt>
            <dd>
              <SubmittedAtCell iso={detail.dateReceived} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Status</dt>
            <dd>
              <InventoryStatusBadge status={detail.status} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Transaction</dt>
            <dd>
              {formatOfferTransactionLabel(
                detail.transactionType as
                  | "consignment"
                  | "direct_purchase"
                  | null,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Branch</dt>
            <dd>{branchLabel(detail.currentBranch)}</dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Created</dt>
            <dd>
              <SubmittedAtCell iso={detail.createdAt} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Last updated</dt>
            <dd>
              <SubmittedAtCell iso={detail.updatedAt} />
            </dd>
          </div>
        </dl>
      </div>

      {detail.consignorName ||
      detail.consignorEmail ||
      detail.consignorPhone ||
      detail.consignorId ? (
        <div className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Consignor
          </h2>
          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm text-slate-800 dark:text-slate-200 sm:grid-cols-2">
            {detail.consignorName ? (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Name</dt>
                <dd className="font-medium">{detail.consignorName}</dd>
              </div>
            ) : null}
            {detail.consignorEmail ? (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                <dd className="break-all">{detail.consignorEmail}</dd>
              </div>
            ) : null}
            {detail.consignorPhone ? (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Phone</dt>
                <dd>{detail.consignorPhone}</dd>
              </div>
            ) : null}
            {detail.consignorId ? (
              <div className="sm:col-span-2">
                <dt className="text-slate-500 dark:text-slate-400">
                  Client ID
                </dt>
                <dd className="break-all font-mono text-xs">
                  {detail.consignorId}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      <div className={cardClass}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Item details
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm text-slate-800 dark:text-slate-200 sm:grid-cols-2">
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
              <dt className="text-slate-500 dark:text-slate-400">Material</dt>
              <dd>{str(form.material)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Condition</dt>
            <dd>{str(form.condition) || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500 dark:text-slate-400">Inclusions</dt>
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
                {formatPhpDisplay(str(form.consignmentSellingPrice))}
              </dd>
            </div>
          ) : null}
          {str(form.directPurchaseSellingPrice) ? (
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                Direct purchase selling price
              </dt>
              <dd className="tabular-nums">
                {formatPhpDisplay(str(form.directPurchaseSellingPrice))}
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
              Direct purchase &amp; terms: {yesNo(form.consentDirectPurchase)}
              <br />
              Price nomination (market research):{" "}
              {yesNo(form.consentPriceNomination)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500 dark:text-slate-400">
              Snapshot client item ID
            </dt>
            <dd className="break-all font-mono text-xs">
              {detail.itemSnapshot.clientItemId}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
