import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { OfferSignatureField } from "../components/OfferSignatureField";
import { TermsScrollAgreeModal } from "../components/TermsScrollAgreeModal";
import { useClientAuth } from "../context/client-auth";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay } from "../lib/format-php";
import {
  EMPTY_ORDER_PICKUP_FORM,
  isOrderPickupFormValid,
  orderPickupPayloadFields,
  type OrderPickupFormValues,
} from "../lib/order-pickup-form";
import { OrderPickupFormFields } from "../components/OrderPickupFormFields";

type CatalogItemDetail = {
  id: string;
  sku: string;
  itemLabel: string;
  productName: string;
  price: string | null;
  status: string;
  photos: Array<{ key: string; url: string; position: number | null }>;
  itemDetails: Record<string, unknown>;
};

const ORDER_SALES_CONTRACT_TERMS_URL = "/terms/order-sales-contract.txt";
const RESERVATION_FEE_DISPLAY = "₱5,000.00";

const labelCellClassName =
  "border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm font-normal text-slate-600 align-top w-28 sm:w-32";
const valueCellClassName =
  "border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-900 align-top break-words whitespace-normal";

const fileInputClassName =
  "mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-violet-700 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";

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
    <Link
      to="/catalog"
      className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:underline"
    >
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
              {cells.flatMap((cell) => [
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
              ])}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function readApiErrorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(j.message)) return j.message.join("; ");
    if (typeof j.message === "string") return j.message;
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export function ClientReserveItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { token, user } = useClientAuth();
  const [item, setItem] = useState<CatalogItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photosModalOpen, setPhotosModalOpen] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signatureFieldKey, setSignatureFieldKey] = useState(0);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pickupForm, setPickupForm] = useState<OrderPickupFormValues>(
    EMPTY_ORDER_PICKUP_FORM,
  );
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

  const customerDetailsRows = useMemo(() => {
    const client = user?.client;
    const name = client
      ? `${client.firstName} ${client.lastName}`.trim() || "—"
      : "—";

    return [
      [{ label: "Customer name", value: name, valueColSpan: 3 }],
      [
        {
          label: "Contact number",
          value: client?.contactNumber?.trim() || "—",
          valueColSpan: 3,
        },
      ],
      [
        {
          label: "Email",
          value: client?.email?.trim() || user?.username || "—",
          valueColSpan: 3,
        },
      ],
      [
        {
          label: "Complete address",
          value: client?.completeAddress?.trim() || "—",
          valueColSpan: 3,
        },
      ],
    ];
  }, [user]);

  const canSubmit =
    !submitBusy &&
    proofFile != null &&
    signatureFile != null &&
    termsAccepted &&
    isOrderPickupFormValid(pickupForm);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!itemId || !token || !canSubmit || !proofFile || !signatureFile) return;

    setSubmitError(null);
    setSubmitBusy(true);
    try {
      const fd = new FormData();
      fd.append(
        "payload",
        JSON.stringify({
          inventoryItemId: itemId,
          ...orderPickupPayloadFields(pickupForm),
        }),
      );
      fd.append("proof", proofFile);
      fd.append("signature", signatureFile);

      const res = await apiFetch(
        "/api/client/orders/reservations",
        { method: "POST", body: fd },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));

      const data = (await res.json()) as { id: string };
      navigate(`/orders/${data.id}`, { replace: true });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Could not submit reservation",
      );
    } finally {
      setSubmitBusy(false);
    }
  };

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

      <form
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={handleSubmit}
      >
        {submitError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {submitError}
          </p>
        ) : null}

        <h1 className="text-lg font-semibold text-slate-900">
          Reservation form
        </h1>

        <DescriptionTable rows={descriptionRows} />
        <DescriptionTable rows={customerDetailsRows} />

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-relaxed text-amber-900">
          A reservation fee of {RESERVATION_FEE_DISPLAY} is required to secure
          this item. Your payment reserves the item for 3 calendar days. If the
          sale is not completed within 3 calendar days from payment, the fee is
          forfeited and cannot be transferred. Upload your proof of reservation
          payment below.
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Proof of reservation payment
          </span>
          <input
            type="file"
            accept="image/*,application/pdf"
            className={fileInputClassName}
            disabled={submitBusy}
            onChange={(e) => {
              setProofFile(e.target.files?.[0] ?? null);
              setSubmitError(null);
            }}
          />
        </label>

        <OrderPickupFormFields
          values={pickupForm}
          onChange={setPickupForm}
          disabled={submitBusy}
        />

        <div className="flex items-start gap-2 pt-1">
          <input
            id="reservation-sales-contract-terms"
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => {
              if (!e.target.checked) {
                setTermsAccepted(false);
              }
            }}
            onClick={(e) => {
              if (!termsAccepted) {
                e.preventDefault();
                setTermsModalOpen(true);
              }
            }}
            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
          />
          <label
            htmlFor="reservation-sales-contract-terms"
            className="text-sm leading-snug text-slate-700"
          >
            I have read and agree to the Terms, Conditions, and Sales Contract.
          </label>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700">Signature</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Draw your signature or upload a clear image of it.
          </p>
          <div className="mt-2">
            <OfferSignatureField
              key={signatureFieldKey}
              disabled={submitBusy}
              onSignatureChange={setSignatureFile}
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={submitBusy}
            onClick={() => {
              setProofFile(null);
              setSignatureFile(null);
              setSignatureFieldKey((k) => k + 1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitBusy ? "Submitting…" : "Submit reservation"}
          </button>
        </div>
      </form>

      <TermsScrollAgreeModal
        open={termsModalOpen}
        onClose={() => setTermsModalOpen(false)}
        onAgree={() => {
          setTermsAccepted(true);
          setTermsModalOpen(false);
        }}
        url={ORDER_SALES_CONTRACT_TERMS_URL}
        title="Terms, Conditions, and Sales Contract"
      />

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
