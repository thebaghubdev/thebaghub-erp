import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { useClientAuth } from "../context/client-auth";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay } from "../lib/format-php";

type CatalogItemDetail = {
  id: string;
  sku: string;
  itemLabel: string;
  brand: string | null;
  category: string | null;
  productName: string;
  price: string | null;
  priceComparison: string | null;
  productDescription: string | null;
  dateReceived: string;
  status: string;
  transactionType: string | null;
  currentBranch: string;
  enableDiscount: boolean;
  collections: string[];
  tags: string[];
  photos: Array<{ key: string; url: string; position: number | null }>;
  itemDetails: Record<string, unknown>;
};

const labelCellClassName =
  "border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm font-normal text-slate-600 align-top w-28 sm:w-32";
const valueCellClassName =
  "border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-900 align-top break-words whitespace-normal";

const backLinkClassName =
  "mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:underline";

const readonlyInputClassName =
  "mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900";

const readonlyTextareaClassName =
  "mt-1 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900";

function ArrowLeftIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
      />
    </svg>
  );
}

function BackToCatalogLink() {
  return (
    <Link to="/purchases" className={backLinkClassName}>
      <ArrowLeftIcon />
      Back to item catalog
    </Link>
  );
}

function displayOrDash(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value).trim();
  return text ? text : "—";
}

function DescriptionTable({
  rows,
}: {
  rows: Array<
    Array<{ label: string; value: ReactNode; valueColSpan?: number }>
  >;
}) {
  return (
    <div className="rounded-lg border border-slate-200">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-28 sm:w-32" />
          <col />
          <col className="w-28 sm:w-32" />
          <col />
        </colgroup>
        <tbody>
          {rows.map((cells, rowIndex) => (
            <tr key={rowIndex}>
              {cells.flatMap((cell) => {
                if (!cell.label) {
                  return [
                    <td
                      key={`${rowIndex}-value`}
                      colSpan={4}
                      className={valueCellClassName}
                    >
                      {cell.value}
                    </td>,
                  ];
                }

                return [
                  <th key={`${cell.label}-label`} className={labelCellClassName}>
                    {cell.label}
                  </th>,
                  <td
                    key={`${cell.label}-value`}
                    colSpan={cell.valueColSpan}
                    className={valueCellClassName}
                  >
                    {cell.value}
                  </td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ClientOrderItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const { token, user } = useClientAuth();
  const [item, setItem] = useState<CatalogItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photosModalOpen, setPhotosModalOpen] = useState(false);
  const photosModalTitleId = useId();

  useEffect(() => {
    let cancelled = false;
    if (!itemId || !token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await apiFetch(
          `/api/client/item-catalog/${itemId}`,
          {},
          token,
        );
        if (res.status === 404) throw new Error("Item not found.");
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as CatalogItemDetail;
        if (!cancelled) setItem(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load item");
          setItem(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itemId, token]);

  useEffect(() => {
    if (!photosModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhotosModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photosModalOpen]);

  const descriptionRows = useMemo(() => {
    if (!item) return [];
    const viewPhotosValue =
      item.photos.length > 0 ? (
        <button
          type="button"
          onClick={() => setPhotosModalOpen(true)}
          className="text-sm font-medium text-violet-700 hover:underline"
        >
          View photos
        </button>
      ) : (
        <span className="text-slate-500">No photos available</span>
      );

    return [
      [{ label: "SKU", value: item.sku, valueColSpan: 3 }],
      [{ label: "Photos", value: viewPhotosValue, valueColSpan: 3 }],
      [{ label: "Product name", value: item.productName, valueColSpan: 3 }],
      [
        {
          label: "Price",
          value: formatPhpDisplay(item.price),
          valueColSpan: 3,
        },
      ],
      [
        {
          label: "Inclusions",
          value: displayOrDash(item.itemDetails.inclusions),
          valueColSpan: 3,
        },
      ],
      [
        {
          label: "Rating",
          value: displayOrDash(item.itemDetails.rating),
        },
        {
          label: "Dimensions",
          value: displayOrDash(item.itemDetails.dimensions),
        },
      ],
    ];
  }, [item]);

  const customerName = useMemo(() => {
    const client = user?.client;
    if (!client) return "—";
    const name = `${client.firstName} ${client.lastName}`.trim();
    return name || "—";
  }, [user]);

  const customerContactNumber = user?.client?.contactNumber?.trim() || "—";
  const customerEmail = user?.client?.email?.trim() || user?.username || "—";
  const customerCompleteAddress =
    user?.client?.completeAddress?.trim() || "—";

  if (loading) {
    return <p className="text-sm text-slate-600">Loading item…</p>;
  }

  if (error || !item) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error ?? "Unable to load this item."}
        </p>
        <BackToCatalogLink />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackToCatalogLink />

      <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Order Request Form
          </h1>
        </div>

        <DescriptionTable rows={descriptionRows} />

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">
              Customer name
            </span>
            <input
              type="text"
              value={customerName}
              readOnly
              className={readonlyInputClassName}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-500">
              Contact number
            </span>
            <input
              type="text"
              value={customerContactNumber}
              readOnly
              className={readonlyInputClassName}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-500">Email</span>
            <input
              type="email"
              value={customerEmail}
              readOnly
              className={readonlyInputClassName}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-500">
              Complete address
            </span>
            <textarea
              value={customerCompleteAddress}
              readOnly
              rows={3}
              className={readonlyTextareaClassName}
            />
          </label>
        </div>
      </form>

      {photosModalOpen &&
      item.photos.length > 0 &&
      typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby={photosModalTitleId}
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50"
                aria-label="Close photos"
                onClick={() => setPhotosModalOpen(false)}
              />
              <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <h2
                    id={photosModalTitleId}
                    className="text-base font-semibold text-slate-900"
                  >
                    Item photos
                  </h2>
                  <button
                    type="button"
                    onClick={() => setPhotosModalOpen(false)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {item.photos.map((photo) => (
                    <img
                      key={photo.key}
                      src={photo.url}
                      alt=""
                      className="aspect-square w-full rounded-xl bg-slate-100 object-cover"
                      loading="lazy"
                    />
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
