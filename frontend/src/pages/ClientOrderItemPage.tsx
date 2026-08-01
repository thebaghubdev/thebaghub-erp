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
import { useClientAuth } from "../context/client-auth";
import { TermsScrollAgreeModal } from "../components/TermsScrollAgreeModal";
import { OfferSignatureField } from "../components/OfferSignatureField";
import { apiFetch } from "../lib/api";
import { getLayawayEligibility } from "../lib/layaway-eligibility";
import {
  calculateLayawayPricing,
  clampLayawayMonths,
  DEFAULT_LAYAWAY_MONTHS,
  layawayMonthlyRateLabel,
  MAX_LAYAWAY_MONTHS,
  MIN_LAYAWAY_MONTHS,
} from "../lib/layaway-pricing";
import {
  isInstallmentPaymentType,
  orderPaymentTypeOptions,
  type OrderPaymentType,
} from "../lib/order-status-filter-options";
import {
  formatPhpAmount,
  formatPhpDisplay,
  parsePhpStringToNumber,
} from "../lib/format-php";
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
  brand: string | null;
  category: string | null;
  productName: string;
  price: string | null;
  creditCardPrice: string | null;
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

const LAYAWAY_TERMS_URL = "/terms/layaway.txt";
const ORDER_SALES_CONTRACT_TERMS_URL = "/terms/order-sales-contract.txt";

const formFieldClassName =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";

const selectFieldClassName = formFieldClassName;

const readonlyFormFieldClassName = `${formFieldClassName} bg-slate-50`;

const backLinkClassName =
  "mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:underline";

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
    <Link to="/catalog" className={backLinkClassName}>
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
                  <th
                    key={`${cell.label}-label`}
                    className={labelCellClassName}
                  >
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

export function ClientOrderItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { token, user } = useClientAuth();
  const [item, setItem] = useState<CatalogItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photosModalOpen, setPhotosModalOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<OrderPaymentType>("full_payment");
  const [layawayMonths, setLayawayMonths] = useState(
    String(DEFAULT_LAYAWAY_MONTHS),
  );
  const [layawayTermsAccepted, setLayawayTermsAccepted] = useState(false);
  const [layawayTermsModalOpen, setLayawayTermsModalOpen] = useState(false);
  const [orderTermsAccepted, setOrderTermsAccepted] = useState(false);
  const [orderTermsModalOpen, setOrderTermsModalOpen] = useState(false);
  const [orderSignatureFile, setOrderSignatureFile] = useState<File | null>(
    null,
  );
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
          label: "Best price",
          value: formatPhpDisplay(item.price),
          valueColSpan: 3,
        },
      ],
      [
        {
          label: "Credit card price",
          value: formatPhpDisplay(item.creditCardPrice),
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

  const itemPrice = useMemo(
    () => (item ? parsePhpStringToNumber(String(item.price ?? "")) : null),
    [item],
  );

  const layawayEligibility = useMemo(() => {
    if (!item) return { allowed: true, reasons: [] as string[] };
    const rating =
      typeof item.itemDetails.rating === "string"
        ? item.itemDetails.rating
        : item.itemDetails.rating == null
          ? null
          : String(item.itemDetails.rating);
    return getLayawayEligibility(rating, item.category);
  }, [item]);

  const isCreditLine = Boolean(user?.client?.isCreditLine);
  const paymentTypeOptions = useMemo(
    () => orderPaymentTypeOptions(isCreditLine),
    [isCreditLine],
  );

  useEffect(() => {
    if (!layawayEligibility.allowed && paymentType === "layaway") {
      setPaymentType("full_payment");
      setLayawayTermsAccepted(false);
      setLayawayTermsModalOpen(false);
      setOrderSignatureFile(null);
      setSignatureFieldKey((k) => k + 1);
    }
  }, [layawayEligibility.allowed, paymentType]);

  useEffect(() => {
    if (!isCreditLine && paymentType === "credit_line") {
      setPaymentType("full_payment");
      setOrderSignatureFile(null);
      setSignatureFieldKey((k) => k + 1);
    }
  }, [isCreditLine, paymentType]);

  const layawayMonthsNumber = useMemo(() => {
    const n = Number.parseInt(layawayMonths, 10);
    return Number.isFinite(n) ? n : null;
  }, [layawayMonths]);

  const layawayPricing = useMemo(() => {
    if (itemPrice == null || layawayMonthsNumber == null) return null;
    return calculateLayawayPricing(itemPrice, layawayMonthsNumber);
  }, [itemPrice, layawayMonthsNumber]);

  const layawayPriceDisplay =
    layawayPricing != null ? formatPhpAmount(layawayPricing.layawayPrice) : "—";
  const monthlyPaymentDisplay =
    layawayPricing != null
      ? formatPhpAmount(layawayPricing.monthlyPayment)
      : "—";
  const layawayRateNote =
    itemPrice != null
      ? `Layaway rate for this item: ${layawayMonthlyRateLabel(itemPrice)} per month.`
      : null;

  const canSubmitOrder =
    !submitBusy &&
    orderSignatureFile != null &&
    orderTermsAccepted &&
    isOrderPickupFormValid(pickupForm) &&
    (!isInstallmentPaymentType(paymentType) || layawayTermsAccepted);

  const handleSubmitOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!itemId || !token || !canSubmitOrder || !orderSignatureFile) return;

    if (
      isInstallmentPaymentType(paymentType) &&
      layawayMonthsNumber == null
    ) {
      setSubmitError("Please enter a valid number of layaway months.");
      return;
    }

    setSubmitError(null);
    setSubmitBusy(true);
    try {
      const payload: Record<string, unknown> = {
        inventoryItemId: itemId,
        paymentType,
        ...orderPickupPayloadFields(pickupForm),
      };
      if (isInstallmentPaymentType(paymentType)) {
        payload.layawayMonths = layawayMonthsNumber;
      }

      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      fd.append("signature", orderSignatureFile);

      const res = await apiFetch(
        "/api/client/orders",
        { method: "POST", body: fd },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));

      const data = (await res.json()) as { id: string };
      navigate(`/orders/${data.id}`, { replace: true });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Could not submit order",
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
        onSubmit={handleSubmitOrder}
      >
        {submitError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {submitError}
          </p>
        ) : null}
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Order Form</h1>
        </div>

        <DescriptionTable rows={descriptionRows} />

        <DescriptionTable rows={customerDetailsRows} />

        <label className="block">
          <span className="text-xs font-medium text-slate-500">
            Payment type
          </span>
          <select
            value={paymentType}
            onChange={(e) => {
              const next = e.target.value as OrderPaymentType;
              if (next === "layaway" && !layawayEligibility.allowed) return;
              if (next === "credit_line" && !isCreditLine) return;
              setPaymentType(next);
              setOrderSignatureFile(null);
              setSignatureFieldKey((k) => k + 1);
              if (next !== "layaway" && next !== "credit_line") {
                setLayawayTermsAccepted(false);
                setLayawayTermsModalOpen(false);
              }
            }}
            className={selectFieldClassName}
          >
            {paymentTypeOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={
                  option.value === "layaway" && !layawayEligibility.allowed
                }
              >
                {option.label}
              </option>
            ))}
          </select>
          {!layawayEligibility.allowed ? (
            <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {layawayEligibility.reasons.join(" ")}
            </p>
          ) : null}
        </label>

        {isInstallmentPaymentType(paymentType) ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">
                No. of months
              </span>
              <input
                type="number"
                min={MIN_LAYAWAY_MONTHS}
                max={MAX_LAYAWAY_MONTHS}
                step={1}
                value={layawayMonths}
                onChange={(e) =>
                  setLayawayMonths(clampLayawayMonths(e.target.value))
                }
                className={formFieldClassName}
              />
              <p className="mt-1 text-xs text-slate-500">
                Layaway is available for {MIN_LAYAWAY_MONTHS} to{" "}
                {MAX_LAYAWAY_MONTHS} months only.
              </p>
              {layawayRateNote ? (
                <p className="mt-1 text-xs text-slate-500">{layawayRateNote}</p>
              ) : null}
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-500">
                Layaway price
              </span>
              <input
                type="text"
                value={layawayPriceDisplay}
                readOnly
                className={readonlyFormFieldClassName}
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-500">
                Monthly payment
              </span>
              <input
                type="text"
                value={monthlyPaymentDisplay}
                readOnly
                className={readonlyFormFieldClassName}
              />
            </label>

            <div className="flex items-start gap-2 pt-1">
              <input
                id="layaway-terms"
                type="checkbox"
                checked={layawayTermsAccepted}
                onChange={(e) => {
                  if (!e.target.checked) {
                    setLayawayTermsAccepted(false);
                  }
                }}
                onClick={(e) => {
                  if (!layawayTermsAccepted) {
                    e.preventDefault();
                    setLayawayTermsModalOpen(true);
                  }
                }}
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <label
                htmlFor="layaway-terms"
                className="text-sm leading-snug text-slate-700"
              >
                I have read and agree to the Layaway Terms and Conditions.
              </label>
            </div>
          </div>
        ) : null}

        <OrderPickupFormFields
          values={pickupForm}
          onChange={setPickupForm}
          disabled={submitBusy}
        />

        <div className="flex items-start gap-2 pt-1">
          <input
            id="order-sales-contract-terms"
            type="checkbox"
            checked={orderTermsAccepted}
            onChange={(e) => {
              if (!e.target.checked) {
                setOrderTermsAccepted(false);
              }
            }}
            onClick={(e) => {
              if (!orderTermsAccepted) {
                e.preventDefault();
                setOrderTermsModalOpen(true);
              }
            }}
            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
          />
          <label
            htmlFor="order-sales-contract-terms"
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
              onSignatureChange={setOrderSignatureFile}
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            type="submit"
            disabled={!canSubmitOrder}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitBusy ? "Submitting…" : "Submit"}
          </button>
        </div>
      </form>

      <TermsScrollAgreeModal
        open={layawayTermsModalOpen}
        onClose={() => setLayawayTermsModalOpen(false)}
        onAgree={() => {
          setLayawayTermsAccepted(true);
          setLayawayTermsModalOpen(false);
        }}
        url={LAYAWAY_TERMS_URL}
        title="Layaway — terms and conditions"
      />

      <TermsScrollAgreeModal
        open={orderTermsModalOpen}
        onClose={() => setOrderTermsModalOpen(false)}
        onAgree={() => {
          setOrderTermsAccepted(true);
          setOrderTermsModalOpen(false);
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
