import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClientAuth } from "../context/client-auth";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay } from "../lib/format-php";

type CatalogItem = {
  id: string;
  sku: string;
  itemLabel: string;
  brand: string | null;
  category: string | null;
  productName: string;
  price: string | null;
  imageUrl: string | null;
  status: string;
};

const searchInputClassName =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";

function catalogItemSearchText(item: CatalogItem): string {
  return [
    item.productName,
    item.itemLabel,
    item.sku,
    item.brand,
    item.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isOnHold(status: string): boolean {
  return status.trim().toLowerCase() === "on hold";
}

const catalogActionBtn =
  "group relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

const catalogActionTooltip =
  "pointer-events-none absolute bottom-full right-0 z-10 mb-1 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[0.65rem] font-medium text-white shadow-lg group-hover:block group-focus-visible:block";

export function ItemCatalogPage() {
  const { token } = useClientAuth();
  const navigate = useNavigate();
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalogItems;
    return catalogItems.filter((item) => catalogItemSearchText(item).includes(q));
  }, [catalogItems, search]);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setCatalogLoading(false);
      return;
    }

    setCatalogLoading(true);
    setCatalogError(null);
    (async () => {
      try {
        const res = await apiFetch("/api/client/item-catalog", {}, token);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as CatalogItem[];
        if (!cancelled) setCatalogItems(data);
      } catch (e) {
        if (!cancelled) {
          setCatalogError(
            e instanceof Error ? e.message : "Failed to load item catalog",
          );
          setCatalogItems([]);
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="w-full min-w-0">
      {!catalogLoading && catalogItems.length > 0 ? (
        <label className="mb-4 block">
          <span className="sr-only">Search catalog</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product, SKU, brand, or category…"
            className={searchInputClassName}
            autoComplete="off"
          />
        </label>
      ) : null}

      {catalogError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {catalogError}
        </p>
      ) : null}
      {catalogLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm leading-relaxed text-slate-600">
            Loading item catalog…
          </p>
        </div>
      ) : catalogItems.length === 0 && !catalogError ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm leading-relaxed text-slate-600">
            No items are available for purchase yet.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm leading-relaxed text-slate-600">
            No items match your search.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="relative aspect-square bg-slate-100">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.productName}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-slate-400">
                    No photo
                  </div>
                )}
                {isOnHold(item.status) ? (
                  <span className="absolute bottom-2 left-2 rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-medium text-amber-800 shadow-sm">
                    On Hold
                  </span>
                ) : null}
              </div>
              <div className="space-y-1.5 p-3">
                <p className="break-words text-sm font-semibold leading-snug text-slate-900">
                  {item.productName}
                </p>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-slate-500">{item.sku}</p>
                    <p className="truncate text-sm font-semibold tabular-nums text-violet-700">
                      {formatPhpDisplay(item.price)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {isOnHold(item.status) ? (
                      <button
                        type="button"
                        className={catalogActionBtn}
                        aria-label="Add to waitlist"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden
                          className="h-3.5 w-3.5 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M19 8v6" />
                          <path d="M22 11h-6" />
                        </svg>
                        <span className={catalogActionTooltip}>
                          Add to waitlist
                        </span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={catalogActionBtn}
                          aria-label="Order now"
                          onClick={() => navigate(`/catalog/${item.id}/order`)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden
                            className="h-3.5 w-3.5 shrink-0"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="8" cy="21" r="1" />
                            <circle cx="19" cy="21" r="1" />
                            <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h8.89a2 2 0 0 0 2-1.58l1.31-6.47H5.12" />
                          </svg>
                          <span className={catalogActionTooltip}>Order now</span>
                        </button>
                        <button
                          type="button"
                          className={catalogActionBtn}
                          aria-label="Set appointment"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden
                            className="h-3.5 w-3.5 shrink-0"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="3" y="4" width="18" height="18" rx="2" />
                            <path d="M16 2v4" />
                            <path d="M8 2v4" />
                            <path d="M3 10h18" />
                            <path d="M9 16l2 2 4-4" />
                          </svg>
                          <span className={catalogActionTooltip}>
                            Set appointment
                          </span>
                        </button>
                        <button
                          type="button"
                          className={catalogActionBtn}
                          aria-label="Reserve now"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden
                            className="h-3.5 w-3.5 shrink-0"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                          </svg>
                          <span className={catalogActionTooltip}>
                            Reserve now
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
