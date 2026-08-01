import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type { PhotoshootCalendarRow } from "../components/PhotoshootCalendar";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { RichTextEditor } from "../components/RichTextEditor";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { formatOfferTransactionLabel } from "../lib/format-offer-transaction-type";
import { formatPhpDisplay } from "../lib/format-php";

const BRANDS_WE_CONSIGN_KEY = "brands_we_consign";

type SettingApiRow = {
  key: string;
  type: string;
  value: string;
};

type ShopifyCollectionOption = {
  id: string;
  title: string;
  handle: string;
};

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

function brandsWeConsignFromSettings(rows: SettingApiRow[]): string[] {
  const brandRow = rows.find((r) => r.key === BRANDS_WE_CONSIGN_KEY);
  if (brandRow?.type !== "string[]") return [];
  return [...parseStringArraySetting(brandRow.value)].sort((a, b) =>
    a.localeCompare(b),
  );
}

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
  inquiryOfferPrice: string | null;
  tbhSellingPrice: string | null;
  creditCardPrice: string | null;
  enableDiscount: boolean;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
  };
  authenticationDetails: {
    dimensions: string | null;
    rating: string | null;
    marketPrice: string | null;
    retailPrice: string | null;
    marketResearchNotes: string | null;
    marketResearchLink: string | null;
    authenticatorNotes: string | null;
  } | null;
  itemPosting: {
    id: string;
    postingDate: string | null;
    productName: string;
    collections: string[];
    tags: string[];
    productDescription: string | null;
    selectedPhotosSnapshot: Array<Record<string, unknown>>;
    shopifyProductId: string | null;
  } | null;
  authenticationStatus: string;
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayValue(v: unknown): string {
  return escapeHtml(str(v) || "—");
}

function buildProductName(form: Record<string, unknown>): string {
  return [str(form.brand), str(form.itemModel)].filter(Boolean).join(" ");
}

const VIP_DISCOUNT_NOTICE = "Item not subject to VIP Discount";

function normalizeVipNoticeGap(html: string): string {
  const escaped = VIP_DISCOUNT_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(
    new RegExp(`(${escaped})<br>\\s*<br>\\s*(Condition\\s*:)`, "gi"),
    "$1<br>$2",
  );
}

function applyVipDiscountNoticeToDescription(
  html: string,
  enableDiscount: boolean,
): string {
  if (enableDiscount || !html.trim()) return html;
  if (html.includes(VIP_DISCOUNT_NOTICE)) {
    return normalizeVipNoticeGap(html);
  }
  const paragraphPattern = /<p(\s[^>]*)?>\s*Condition\s*:/i;
  const match = paragraphPattern.exec(html);
  if (match) {
    return normalizeVipNoticeGap(
      html.replace(
        paragraphPattern,
        `<p${match[1] ?? ""}>${VIP_DISCOUNT_NOTICE}<br>Condition:`,
      ),
    );
  }
  const matchInline = /Condition\s*:/i.exec(html);
  if (!matchInline || matchInline.index == null) return html;
  return normalizeVipNoticeGap(
    html.slice(0, matchInline.index) +
      `${VIP_DISCOUNT_NOTICE}<br>` +
      html.slice(matchInline.index),
  );
}

function buildPostDescriptionHtml(
  form: Record<string, unknown>,
  auth: InventoryDetailForStaff["authenticationDetails"],
  enableDiscount: boolean,
): string {
  const title = buildProductName(form) || "—";
  const conditionLines = [
    ...(enableDiscount ? [] : [escapeHtml(VIP_DISCOUNT_NOTICE)]),
    `Condition: ${displayValue(auth?.rating)}`,
    `Inclusions: ${displayValue(form.inclusions)}`,
    `Dimensions: ${displayValue(auth?.dimensions)}`,
  ];

  return [
    `<p>${escapeHtml(title)}</p>`,
    `<p>${conditionLines.join("<br>")}</p>`,
    "<p>We offer layaway installments or use your BDO credit card for up to 12 months installment — Just ask us how!</p>",
    "<p>Disclaimer: The Bag Hub is neither affiliated nor related with any of the brands posted in our page/account. All trademarks and brand names are sole properties of their respective owners.</p>",
  ].join("");
}

function selectedPhotoKeysFromSnapshot(
  snapshot: Array<Record<string, unknown>>,
): string[] {
  return [...snapshot]
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((photo) => str(photo.key))
    .filter(Boolean);
}

const MIN_PHOTOSHOOT_PHOTOS_FOR_POSTING = 1;

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

const fieldLabel =
  "block text-sm font-medium text-slate-700 dark:text-slate-300";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

export function EditingItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const { token } = usePortalAuth();
  const productNameId = useId();
  const collectionId = useId();
  const tagsId = useId();
  const postDescId = useId();

  const [detail, setDetail] = useState<InventoryDetailForStaff | null>(null);
  const [photoshootRow, setPhotoshootRow] =
    useState<PhotoshootCalendarRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [productName, setProductName] = useState("");
  const [collectionValue, setCollectionValue] = useState("");
  const [shopifyCollections, setShopifyCollections] = useState<
    ShopifyCollectionOption[]
  >([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [postDescription, setPostDescription] = useState("");
  const [postingSaving, setPostingSaving] = useState(false);
  const [postingSubmitting, setPostingSubmitting] = useState(false);
  const [postingError, setPostingError] = useState<string | null>(null);
  const [postingMessage, setPostingMessage] = useState<string | null>(null);
  const [tagBrandOptions, setTagBrandOptions] = useState<string[]>([]);
  const [tagsSelected, setTagsSelected] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  /** Photoshoot image keys in click order (badges show 1…n). */
  const [photoSelectionOrder, setPhotoSelectionOrder] = useState<string[]>([]);

  useEffect(() => {
    setPhotoSelectionOrder([]);
  }, [itemId]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/api/settings", {}, token);
        if (!res.ok || cancelled) return;
        const rows = (await res.json()) as SettingApiRow[];
        if (cancelled) return;
        setTagBrandOptions(brandsWeConsignFromSettings(rows));
      } catch {
        if (!cancelled) setTagBrandOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setCollectionsLoading(true);
    setCollectionsError(null);
    void (async () => {
      try {
        const res = await apiFetch("/api/shopify/collections", {}, token);
        if (cancelled) return;
        if (!res.ok) {
          let msg = `Could not load collections (${res.status}).`;
          try {
            const body = (await res.json()) as {
              message?: string | string[];
            };
            const m = body.message;
            if (Array.isArray(m)) msg = m.join("; ");
            else if (typeof m === "string" && m.trim()) msg = m.trim();
          } catch {
            /* ignore */
          }
          setShopifyCollections([]);
          setCollectionsError(msg);
          return;
        }
        const json = (await res.json()) as {
          collections?: ShopifyCollectionOption[];
        };
        if (cancelled) return;
        setShopifyCollections(
          Array.isArray(json.collections) ? json.collections : [],
        );
        setCollectionsError(null);
      } catch {
        if (!cancelled) {
          setShopifyCollections([]);
          setCollectionsError("Could not load collections.");
        }
      } finally {
        if (!cancelled) setCollectionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    setCollectionValue((prev) =>
      prev === ""
        ? prev
        : shopifyCollections.some((c) => c.id === prev)
          ? prev
          : "",
    );
  }, [shopifyCollections]);

  const load = useCallback(async () => {
    if (!itemId || !token) return;
    setError(null);
    setLoading(true);
    try {
      const [detailRes, shootRes] = await Promise.all([
        apiFetch(`/api/inventory/${itemId}`, {}, token),
        apiFetch(`/api/inventory/${itemId}/item-photoshoot`, {}, token),
      ]);
      if (!detailRes.ok) {
        const msg =
          detailRes.status === 404
            ? "Inventory item not found."
            : `Request failed (${detailRes.status})`;
        throw new Error(msg);
      }
      const detailJson = (await detailRes.json()) as InventoryDetailForStaff;
      setDetail(detailJson);
      const enableDiscount = detailJson.enableDiscount ?? false;
      const posting = detailJson.itemPosting;
      if (posting) {
        setProductName(posting.productName);
        setCollectionValue(posting.collections[0] ?? "");
        setTagsSelected(posting.tags);
        setPostDescription(
          applyVipDiscountNoticeToDescription(
            posting.productDescription ?? "",
            enableDiscount,
          ),
        );
        setPhotoSelectionOrder(
          selectedPhotoKeysFromSnapshot(posting.selectedPhotosSnapshot),
        );
      } else {
        setProductName(buildProductName(detailJson.itemSnapshot.form));
        setCollectionValue("");
        setTagsSelected([]);
        setPostDescription(
          normalizeVipNoticeGap(
            buildPostDescriptionHtml(
              detailJson.itemSnapshot.form,
              detailJson.authenticationDetails,
              enableDiscount,
            ),
          ),
        );
      }

      if (!shootRes.ok) {
        setPhotoshootRow(null);
      } else {
        const shootJson =
          (await shootRes.json()) as PhotoshootCalendarRow | null;
        setPhotoshootRow(shootJson);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load item");
      setDetail(null);
      setPhotoshootRow(null);
    } finally {
      setLoading(false);
    }
  }, [itemId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePhotoshootPhoto = useCallback((key: string) => {
    setPhotoSelectionOrder((prev) => {
      const idx = prev.indexOf(key);
      if (idx >= 0) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
  }, []);

  const shootPhotosChronological = useMemo(() => {
    return [...(photoshootRow?.photos ?? [])];
  }, [photoshootRow]);

  const filteredTagOptions = useMemo(() => {
    const query = tagQuery.trim().toLowerCase();
    return tagBrandOptions.filter((tag) => {
      const alreadySelected = tagsSelected.some(
        (selected) => selected.toLowerCase() === tag.toLowerCase(),
      );
      if (alreadySelected) return false;
      if (!query) return true;
      return tag.toLowerCase().includes(query);
    });
  }, [tagBrandOptions, tagQuery, tagsSelected]);

  const addTag = useCallback((tag: string) => {
    const next = tag.trim();
    if (!next) return;
    setTagsSelected((prev) =>
      prev.some((selected) => selected.toLowerCase() === next.toLowerCase())
        ? prev
        : [...prev, next],
    );
    setTagQuery("");
  }, []);

  const removeTag = useCallback((tag: string) => {
    setTagsSelected((prev) => prev.filter((selected) => selected !== tag));
  }, []);

  useEffect(() => {
    const keys = new Set((photoshootRow?.photos ?? []).map((p) => p.key));
    setPhotoSelectionOrder((prev) => prev.filter((k) => keys.has(k)));
  }, [photoshootRow]);

  const savePosting = useCallback(
    async (options: { submitForPosting: boolean }) => {
      if (!itemId || !token) return;
      if (options.submitForPosting) setPostingSubmitting(true);
      else setPostingSaving(true);
      setPostingError(null);
      setPostingMessage(null);
      try {
        if (!productName.trim()) {
          throw new Error("Product name is required.");
        }
        if (!collectionValue.trim()) {
          throw new Error("Collection is required.");
        }
        if (photoSelectionOrder.length < MIN_PHOTOSHOOT_PHOTOS_FOR_POSTING) {
          throw new Error(
            `Select at least ${MIN_PHOTOSHOOT_PHOTOS_FOR_POSTING} photoshoot photo for posting (selected: ${photoSelectionOrder.length}).`,
          );
        }
        const photosByKey = new Map(
          (photoshootRow?.photos ?? []).map((photo) => [photo.key, photo]),
        );
        const selectedPhotosSnapshot = photoSelectionOrder.flatMap(
          (key, idx) => {
            const photo = photosByKey.get(key);
            if (!photo) return [];
            return [
              {
                key: photo.key,
                url: photo.url,
                position: idx + 1,
              },
            ];
          },
        );
        const res = await apiFetch(
          `/api/inventory/${itemId}/item-posting`,
          {
            method: options.submitForPosting ? "POST" : "PATCH",
            body: JSON.stringify({
              productName: productName.trim(),
              collections: collectionValue ? [collectionValue] : [],
              tags: tagsSelected,
              productDescription: postDescription.trim() || null,
              selectedPhotosSnapshot,
            }),
          },
          token,
        );
        if (!res.ok) {
          let msg = `Could not save posting data (${res.status}).`;
          try {
            const body = (await res.json()) as {
              message?: string | string[];
            };
            if (Array.isArray(body.message)) msg = body.message.join("; ");
            else if (typeof body.message === "string" && body.message.trim()) {
              msg = body.message.trim();
            }
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
        const body = (await res.json()) as {
          status?: string;
          shopifyUpdated?: boolean;
        };
        setDetail((prev) =>
          prev && body.status ? { ...prev, status: body.status } : prev,
        );
        setPostingMessage(
          options.submitForPosting
            ? body.shopifyUpdated
              ? "Posting data saved and Shopify listing updated."
              : detail?.status === "Available For Purchase"
                ? "Posting data saved."
                : "Posting data saved and item moved to For Posting."
            : body.shopifyUpdated
              ? "Changes saved and Shopify listing updated."
              : detail?.status === "Available For Purchase" &&
                  !detail.itemPosting?.shopifyProductId
                ? "Changes saved. Link a Shopify product to enable automatic updates."
                : "Changes saved.",
        );
      } catch (err) {
        setPostingError(
          err instanceof Error ? err.message : "Could not save posting data.",
        );
      } finally {
        if (options.submitForPosting) setPostingSubmitting(false);
        else setPostingSaving(false);
      }
    },
    [
      collectionValue,
      itemId,
      photoSelectionOrder,
      photoshootRow,
      postDescription,
      productName,
      tagsSelected,
      detail,
      token,
    ],
  );

  const submitPosting = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      await savePosting({ submitForPosting: true });
    },
    [savePosting],
  );

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
          to="/portal/editing"
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to Editing
        </Link>
      </div>
    );
  }

  const form = detail.itemSnapshot.form;
  const auth = detail.authenticationDetails;
  const brand = str(form.brand);
  const itemModel = str(form.itemModel);
  const brandModelSubtitle =
    brand && itemModel ? `${brand} — ${itemModel}` : brand || itemModel || "—";
  const isForPosting = detail.status === "For Posting";
  const isPosted = detail.status === "Available For Purchase";
  const selectedPhotoCount = photoSelectionOrder.length;
  const hasEnoughPhotos =
    selectedPhotoCount >= MIN_PHOTOSHOOT_PHOTOS_FOR_POSTING;
  const canSavePosting = hasEnoughPhotos && !postingSaving && !postingSubmitting;

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Item editing
          </p>
          <h1 className="mt-1 break-all font-mono text-xl font-semibold text-slate-900 dark:text-slate-100">
            {detail.sku}
          </h1>
          <p className="mt-2 break-words text-base text-slate-700 dark:text-slate-300">
            {brandModelSubtitle}
          </p>
        </div>
        <Link
          to={isPosted ? `/portal/posting/${detail.id}` : "/portal/editing"}
          className="shrink-0 text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          {isPosted ? "← Back to listing" : "← Back to Editing"}
        </Link>
      </div>

      {isPosted ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
          This item is live on Shopify. Saving changes here will update the
          Shopify listing automatically
          {detail.itemPosting?.shopifyProductId
            ? "."
            : " once a Shopify product is linked from the listing page."}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <section className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Item details
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm text-slate-800 dark:text-slate-200 sm:grid-cols-2">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Status</dt>
                <dd>
                  <InventoryStatusBadge status={detail.status} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Transaction
                </dt>
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
                <dt className="text-slate-500 dark:text-slate-400">Category</dt>
                <dd>{str(form.category) || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Rating</dt>
                <dd>{str(auth?.rating) || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Dimensions
                </dt>
                <dd>{str(auth?.dimensions) || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500 dark:text-slate-400">
                  Inclusions
                </dt>
                <dd className="whitespace-pre-wrap">
                  {str(form.inclusions) || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Market price
                </dt>
                <dd className="tabular-nums">
                  {formatPhpDisplay(str(auth?.marketPrice))}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Retail price
                </dt>
                <dd className="tabular-nums">
                  {formatPhpDisplay(str(auth?.retailPrice))}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Consignor price (offer)
                </dt>
                <dd className="tabular-nums">
                  {formatPhpDisplay(detail.inquiryOfferPrice)}
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
                <dt className="text-slate-500 dark:text-slate-400">
                  Credit card price
                </dt>
                <dd className="tabular-nums">
                  {formatPhpDisplay(detail.creditCardPrice)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  VIP discount
                </dt>
                <dd>{detail.enableDiscount ? "Yes" : "No"}</dd>
              </div>
              {detail.consignorName ? (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500 dark:text-slate-400">
                    Consignor
                  </dt>
                  <dd className="font-medium">{detail.consignorName}</dd>
                </div>
              ) : null}
              {str(form.serialNumber) ? (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500 dark:text-slate-400">
                    Serial number
                  </dt>
                  <dd className="break-all font-mono text-xs">
                    {str(form.serialNumber)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Photoshoot photos
            </h2>
            {shootPhotosChronological.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                No photoshoot photos saved for this item.
              </p>
            ) : (
              <>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                  Select at least {MIN_PHOTOSHOOT_PHOTOS_FOR_POSTING} photo
                  below for posting. Numbers show the order they will appear.
                </p>
                <p
                  className={`mt-2 text-sm tabular-nums ${
                    hasEnoughPhotos
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-amber-800 dark:text-amber-200"
                  }`}
                  aria-live="polite"
                >
                  {selectedPhotoCount} photo
                  {selectedPhotoCount === 1 ? "" : "s"} selected
                  {!hasEnoughPhotos
                    ? ` (${MIN_PHOTOSHOOT_PHOTOS_FOR_POSTING} required)`
                    : ""}
                </p>
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {shootPhotosChronological.map((img) => {
                    const selIdx = photoSelectionOrder.indexOf(img.key);
                    const rank = selIdx >= 0 ? selIdx + 1 : null;
                    const selected = rank != null;
                    return (
                      <li key={img.key} className="aspect-square">
                        <button
                          type="button"
                          className={`relative h-full w-full overflow-hidden rounded-xl bg-slate-100 shadow-sm ring-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:bg-slate-800 dark:ring-offset-slate-950 ${
                            selected
                              ? "ring-2 ring-violet-600 ring-offset-2 dark:ring-violet-400"
                              : "ring-1 ring-slate-200 dark:ring-slate-600"
                          }`}
                          onClick={() => togglePhotoshootPhoto(img.key)}
                          aria-pressed={selected}
                          aria-label={
                            selected
                              ? `Photo selected, position ${rank}. Click to remove from selection.`
                              : "Select photo for ordering"
                          }
                        >
                          <img
                            src={img.url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                          {rank != null ? (
                            <span
                              className="absolute right-1.5 top-1.5 flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-violet-600 px-2 text-xs font-bold tabular-nums text-white shadow-md ring-2 ring-white dark:ring-slate-900"
                              aria-hidden
                            >
                              {rank}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        </div>

        <div className="min-w-0">
          <form
            className={cardClass}
            noValidate
            aria-label="Listing draft"
            onSubmit={(e) => void submitPosting(e)}
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Listing fields
            </h2>
            <div className="mt-6 space-y-5">
              <div>
                <label htmlFor={productNameId} className={fieldLabel}>
                  Product name
                </label>
                <input
                  id={productNameId}
                  type="text"
                  autoComplete="off"
                  required
                  className={inputClass}
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor={collectionId} className={fieldLabel}>
                  Collection
                </label>
                <select
                  id={collectionId}
                  className={inputClass}
                  aria-busy={collectionsLoading}
                  value={collectionValue}
                  onChange={(e) => setCollectionValue(e.target.value)}
                  disabled={collectionsLoading}
                  required
                >
                  <option value="">
                    {collectionsLoading
                      ? "Loading collections…"
                      : "Select collection…"}
                  </option>
                  {shopifyCollections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <p
                  className="mt-1 text-xs text-slate-500 dark:text-slate-400"
                  aria-live="polite"
                >
                  {collectionsError
                    ? collectionsError
                    : !collectionsLoading && shopifyCollections.length === 0
                      ? "No Shopify collections returned."
                      : ""}
                </p>
              </div>

              <div>
                <label htmlFor={tagsId} className={fieldLabel}>
                  Tags
                </label>
                <div className="mt-1 h-[6rem] overflow-y-auto rounded-lg border border-slate-300 bg-white p-2 shadow-sm focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500 dark:border-slate-600 dark:bg-slate-950">
                  {tagsSelected.length > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {tagsSelected.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950/50 dark:text-violet-200"
                        >
                          {tag}
                          <button
                            type="button"
                            className="rounded-full px-1 text-violet-500 hover:bg-violet-100 hover:text-violet-800 dark:text-violet-300 dark:hover:bg-violet-900"
                            onClick={() => removeTag(tag)}
                            aria-label={`Remove ${tag}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <input
                      id={tagsId}
                      type="text"
                      autoComplete="off"
                      className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                      placeholder="Search or add tag…"
                      value={tagQuery}
                      onChange={(e) => setTagQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        addTag(tagQuery);
                      }}
                      aria-describedby={`${tagsId}-hint`}
                    />
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      onClick={() => addTag(tagQuery)}
                      disabled={!tagQuery.trim()}
                    >
                      Add
                    </button>
                  </div>
                  {filteredTagOptions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                      {filteredTagOptions.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-slate-700 dark:text-slate-200 dark:hover:border-violet-700 dark:hover:bg-violet-950/50 dark:hover:text-violet-200"
                          onClick={() => addTag(tag)}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <p
                  id={`${tagsId}-hint`}
                  className="mt-1 text-xs text-slate-500 dark:text-slate-400"
                >
                  You can search for existing tags or add a new tag.
                </p>
              </div>

              <div>
                <label htmlFor={postDescId} className={fieldLabel}>
                  Product description
                </label>
                <RichTextEditor
                  id={postDescId}
                  value={postDescription}
                  onChange={setPostDescription}
                />
              </div>
              {postingError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  {postingError}
                </p>
              ) : null}
              {postingMessage ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  {postingMessage}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  disabled={!canSavePosting}
                  title={
                    hasEnoughPhotos
                      ? undefined
                      : `Select at least ${MIN_PHOTOSHOOT_PHOTOS_FOR_POSTING} photoshoot photo`
                  }
                  onClick={() => void savePosting({ submitForPosting: false })}
                >
                  {postingSaving ? "Saving…" : "Save changes"}
                </button>
                {!isForPosting && !isPosted ? (
                  <button
                    type="submit"
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!canSavePosting}
                    title={
                      hasEnoughPhotos
                        ? undefined
                        : `Select at least ${MIN_PHOTOSHOOT_PHOTOS_FOR_POSTING} photoshoot photo`
                    }
                  >
                    {postingSubmitting ? "Submitting…" : "Submit for posting"}
                  </button>
                ) : null}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
