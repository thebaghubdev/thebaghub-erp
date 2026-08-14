import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { apiFetch } from "../lib/api";
import { useFeatureAccess } from "../lib/use-feature-access";
import { formatPhpDisplay } from "../lib/format-php";
import { usePortalAuth } from "../context/portal-auth";

type ItemPosting = {
  id: string;
  postingDate: string | null;
  productName: string;
  collections: string[];
  tags: string[];
  productDescription: string | null;
  selectedPhotosSnapshot: Array<Record<string, unknown>>;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  shopifyPostedAt: string | null;
};

type InventoryDetailForStaff = {
  id: string;
  sku: string;
  status: string;
  consignorName: string | null;
  tbhSellingPrice: string | null;
  creditCardPrice: string | null;
  itemSnapshot: {
    form: Record<string, unknown>;
  };
  itemPosting: ItemPosting | null;
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function formatPostingDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

export function PostingItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const { token } = usePortalAuth();
  const { canEdit, readOnly } = useFeatureAccess("posting");
  const [detail, setDetail] = useState<InventoryDetailForStaff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shopifyBusy, setShopifyBusy] = useState(false);
  const [shopifyError, setShopifyError] = useState<string | null>(null);
  const [shopifyMessage, setShopifyMessage] = useState<string | null>(null);
  const [linkProductId, setLinkProductId] = useState("");
  const [linkingProduct, setLinkingProduct] = useState(false);

  const load = useCallback(async () => {
    if (!itemId || !token) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/inventory/${itemId}`, {}, token);
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "Inventory item not found."
            : `Request failed (${res.status})`,
        );
      }
      const data = (await res.json()) as InventoryDetailForStaff;
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load posting item");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [itemId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const parseApiError = async (res: Response, fallback: string) => {
    let msg = fallback;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) msg = body.message.join("; ");
      else if (typeof body.message === "string" && body.message.trim()) {
        msg = body.message.trim();
      }
    } catch {
      /* ignore */
    }
    return msg;
  };

  const postToShopify = useCallback(async () => {
    if (!canEdit || !itemId || !token) return;
    setShopifyBusy(true);
    setShopifyError(null);
    setShopifyMessage(null);
    try {
      const res = await apiFetch(
        `/api/inventory/${itemId}/post-to-shopify`,
        { method: "POST" },
        token,
      );
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, `Could not post to Shopify (${res.status}).`),
        );
      }
      const body = (await res.json()) as {
        productId?: string;
        status?: string;
      };
      await load();
      setShopifyMessage(
        body.productId
          ? `Posted to Shopify. Product ID: ${body.productId}`
          : "Posted to Shopify.",
      );
    } catch (e) {
      setShopifyError(
        e instanceof Error ? e.message : "Could not post to Shopify.",
      );
    } finally {
      setShopifyBusy(false);
    }
  }, [canEdit, itemId, token, load]);

  const linkShopifyProduct = useCallback(async () => {
    if (!canEdit || !itemId || !token) return;
    const productId = linkProductId.trim();
    if (!productId) return;
    setLinkingProduct(true);
    setShopifyError(null);
    setShopifyMessage(null);
    try {
      const res = await apiFetch(
        `/api/inventory/${itemId}/link-shopify-product`,
        {
          method: "POST",
          body: JSON.stringify({ shopifyProductId: productId }),
        },
        token,
      );
      if (!res.ok) {
        throw new Error(
          await parseApiError(
            res,
            `Could not link Shopify product (${res.status}).`,
          ),
        );
      }
      const body = (await res.json()) as { productId?: string };
      setLinkProductId("");
      await load();
      setShopifyMessage(
        body.productId
          ? `Linked to Shopify product ${body.productId}. Edits to the post will sync automatically.`
          : "Linked to Shopify product.",
      );
    } catch (e) {
      setShopifyError(
        e instanceof Error ? e.message : "Could not link Shopify product.",
      );
    } finally {
      setLinkingProduct(false);
    }
  }, [canEdit, itemId, token, linkProductId, load]);

  if (loading) {
    return (
      <div className="text-sm text-slate-600 dark:text-slate-400">Loading…</div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error ?? "Unable to load this posting item."}
        </p>
        <Link
          to="/portal/posting"
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to Posting
        </Link>
      </div>
    );
  }

  const posting = detail.itemPosting;
  const form = detail.itemSnapshot.form;
  const itemLabel =
    [str(form.brand), str(form.itemModel)].filter(Boolean).join(" ") || "—";
  const isForPosting = detail.status === "For Posting";
  const isPosted = detail.status === "Available For Purchase";
  const shopifyProductId = posting?.shopifyProductId ?? null;
  const canPostToShopify = canEdit && isForPosting;
  const canEditPost = canEdit && !!posting && (isForPosting || isPosted);
  const needsShopifyLink = isPosted && !shopifyProductId;

  return (
    <div className="w-full min-w-0 space-y-6">
      {readOnly ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          You have view-only access to this feature.
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Posting item
          </p>
          <h1 className="mt-1 break-all font-mono text-xl font-semibold text-slate-900 dark:text-slate-100">
            {detail.sku}
          </h1>
          <p className="mt-2 break-words text-base text-slate-700 dark:text-slate-300">
            {posting?.productName || itemLabel}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              to={`/portal/inventory/${detail.id}`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              View in inventory
            </Link>
            {canEditPost ? (
              <Link
                to={`/portal/editing/${detail.id}`}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
              >
                Edit post
              </Link>
            ) : null}
            {canPostToShopify ? (
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={shopifyBusy || !posting}
                onClick={() => void postToShopify()}
              >
                {shopifyBusy ? "Posting…" : "Post to Shopify"}
              </button>
            ) : null}
          </div>
        </div>
        <Link
          to="/portal/posting"
          className="shrink-0 text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to Posting
        </Link>
      </div>

      {shopifyError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {shopifyError}
        </p>
      ) : null}
      {shopifyMessage ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {shopifyMessage}
        </p>
      ) : null}

      {needsShopifyLink ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Shopify product ID missing
          </h2>
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
            This item was posted before product IDs were tracked. Paste the
            Shopify product ID below so future edits sync automatically.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="min-w-[12rem] flex-1 text-sm">
              <span className="mb-1 block font-medium text-amber-900 dark:text-amber-100">
                Shopify product ID
              </span>
              <input
                type="text"
                value={linkProductId}
                onChange={(e) => setLinkProductId(e.target.value)}
                placeholder="e.g. 8234567890123"
                className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <button
              type="button"
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={linkingProduct || !linkProductId.trim()}
              onClick={() => void linkShopifyProduct()}
            >
              {linkingProduct ? "Linking…" : "Link product"}
            </button>
          </div>
        </section>
      ) : null}

      <section className={cardClass}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Posting details
        </h2>
        {!posting ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            No posting data has been saved for this item yet.
          </p>
        ) : (
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm text-slate-800 dark:text-slate-200 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Status</dt>
              <dd>
                <InventoryStatusBadge status={detail.status} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                Posting schedule
              </dt>
              <dd>{formatPostingDate(posting.postingDate)}</dd>
            </div>
            {shopifyProductId ? (
              <>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Shopify product ID
                  </dt>
                  <dd className="break-all font-mono">{shopifyProductId}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Posted to Shopify
                  </dt>
                  <dd>{formatPostingDate(posting.shopifyPostedAt)}</dd>
                </div>
              </>
            ) : null}
            <div className="sm:col-span-2">
              <dt className="text-slate-500 dark:text-slate-400">
                Product name
              </dt>
              <dd>{posting.productName || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                Collections
              </dt>
              <dd>
                {posting.collections.length
                  ? posting.collections.join(", ")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Tags</dt>
              <dd>{posting.tags.length ? posting.tags.join(", ") : "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                Credit card price
              </dt>
              <dd className="tabular-nums">
                {formatPhpDisplay(detail.creditCardPrice)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                TBH selling price
              </dt>
              <dd className="tabular-nums">
                {formatPhpDisplay(detail.tbhSellingPrice)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Consignor</dt>
              <dd>{detail.consignorName ?? "—"}</dd>
            </div>
          </dl>
        )}
      </section>

      {posting ? (
        <>
          <section className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Product description
            </h2>
            {posting.productDescription ? (
              <div
                className="mt-4 text-sm leading-relaxed text-slate-800 dark:text-slate-200 [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
                dangerouslySetInnerHTML={{
                  __html: posting.productDescription,
                }}
              />
            ) : (
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                No product description saved.
              </p>
            )}
          </section>

          <section className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Selected photos
            </h2>
            {posting.selectedPhotosSnapshot.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                No photos selected.
              </p>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {posting.selectedPhotosSnapshot.map((photo, idx) => {
                  const url = str(photo.url);
                  return (
                    <li
                      key={`${str(photo.key) || url || idx}-${idx}`}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"
                    >
                      {url ? (
                        <img
                          src={url}
                          alt=""
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center text-xs text-slate-500">
                          No preview
                        </div>
                      )}
                      <p className="px-2 py-1 text-xs text-slate-600 dark:text-slate-400">
                        Position {idx + 1}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
