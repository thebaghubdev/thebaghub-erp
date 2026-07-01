import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FullPaymentProofUpload } from "../components/FullPaymentProofUpload";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { OrderInstallmentSchedule } from "../components/OrderInstallmentSchedule";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay } from "../lib/format-php";
import {
  MAX_LAYAWAY_MONTHS,
  MIN_LAYAWAY_MONTHS,
} from "../lib/layaway-pricing";
import { paymentTypeLabel } from "../lib/order-status-filter-options";
import type { OrderInstallmentRow } from "../lib/order-installments";

type OrderDetail = {
  id: string;
  orderNumber: number;
  status: string;
  paymentType: string;
  layawayMonths: number | null;
  layawayPrice: string | null;
  layawayMonthlyPayment: string | null;
  fullPaymentPrice: string | null;
  fullPaymentTotalPrice: string | null;
  remainingBalancePrice: string | null;
  reservationPaymentProofUrl: string | null;
  fullPaymentProofUrl: string | null;
  shippingFeeCareOf: string | null;
  shippingFeeProofUrl: string | null;
  holdingPeriod: string | null;
  layawayPaymentStartDate: string | null;
  consignorPaymentRelease: number | null;
  declineReason: string | null;
  signatureUrl: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    contactNumber: string;
    completeAddress: string | null;
  };
  inventoryItem: {
    id: string;
    sku: string;
    itemLabel: string;
    status: string;
  };
  installments: OrderInstallmentRow[];
};

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

const recordActionBtn =
  "inline-flex shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-900 transition-colors hover:bg-violet-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-900/80";

const layawayApproveBtn =
  "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500";

const layawayDeclineBtn =
  "rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-800 shadow-sm hover:bg-red-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-900 dark:bg-slate-950 dark:text-red-200 dark:hover:bg-red-950/40";

const layawayUpdateTermsBtn =
  "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800";

function isForLayawayApproval(status: string): boolean {
  return status.trim().toLowerCase() === "for layaway approval";
}

function isCancellableOrderStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === "for payment" || normalized === "paid";
}

function isReservationOrderStatus(status: string): boolean {
  return status.trim().toLowerCase() === "reservation";
}

function isCancelledOrderStatus(status: string): boolean {
  return status.trim().toLowerCase() === "cancelled";
}

function displayOrDash(value: string | null | undefined): string {
  if (value == null) return "—";
  const text = value.trim();
  return text ? text : "—";
}

function formatOrderDate(raw: string | null | undefined): string {
  if (raw == null || raw.trim() === "") return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
}

function normalizeMoneyInput(raw: string | null | undefined): string {
  const value = Number.parseFloat(raw ?? "");
  return Number.isFinite(value) ? value.toFixed(2) : "";
}

function parsePositiveMoney(raw: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(raw.trim())) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function consignorPaymentReleaseLabel(paymentNumber: number): string {
  const mod10 = paymentNumber % 10;
  const mod100 = paymentNumber % 100;
  let suffix = "th";
  if (mod100 < 11 || mod100 > 13) {
    if (mod10 === 1) suffix = "st";
    else if (mod10 === 2) suffix = "nd";
    else if (mod10 === 3) suffix = "rd";
  }
  return `${paymentNumber}${suffix} payment`;
}

function consignorPaymentReleaseOptions(months: number | null) {
  if (months == null || months < 1) return [];
  return Array.from({ length: months }, (_, index) => {
    const paymentNumber = index + 1;
    return {
      value: String(paymentNumber),
      label: consignorPaymentReleaseLabel(paymentNumber),
    };
  });
}

const formSelectClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

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

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-800 dark:text-slate-200">{children}</dd>
    </div>
  );
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = usePortalAuth();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [declineConfirmOpen, setDeclineConfirmOpen] = useState(false);
  const [declineBusy, setDeclineBusy] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [reservationCancelConfirmOpen, setReservationCancelConfirmOpen] =
    useState(false);
  const [reservationCancelBusy, setReservationCancelBusy] = useState(false);
  const [reservationCancelError, setReservationCancelError] = useState<
    string | null
  >(null);
  const [termsConfirmOpen, setTermsConfirmOpen] = useState(false);
  const [termsBusy, setTermsBusy] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [termsMonths, setTermsMonths] = useState("");
  const [termsPrice, setTermsPrice] = useState("");
  const [approveConsignorPaymentRelease, setApproveConsignorPaymentRelease] =
    useState("");
  const [termsConsignorPaymentRelease, setTermsConsignorPaymentRelease] =
    useState("");
  const [outForDeliveryOpen, setOutForDeliveryOpen] = useState(false);
  const [outForDeliveryBusy, setOutForDeliveryBusy] = useState(false);
  const [outForDeliveryError, setOutForDeliveryError] = useState<string | null>(
    null,
  );
  const [shippingFeeCareOf, setShippingFeeCareOf] = useState("");
  const [shippingFeeProofFile, setShippingFeeProofFile] = useState<File | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/orders/${id}`, {}, token);
      if (!res.ok) {
        const msg =
          res.status === 404
            ? "Order not found."
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }
      const data = (await res.json()) as OrderDetail;
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load order");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmApproveLayaway = useCallback(async () => {
    if (!id || !token) return;
    const consignorPaymentRelease = Number.parseInt(
      approveConsignorPaymentRelease,
      10,
    );
    if (!Number.isFinite(consignorPaymentRelease) || consignorPaymentRelease < 1) {
      setApproveError("Please select a consignor payment release.");
      return;
    }

    setApproveError(null);
    setApproveBusy(true);
    try {
      const res = await apiFetch(
        `/api/orders/${id}/approve-layaway`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consignorPaymentRelease }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderDetail;
      setDetail(data);
      setApproveConfirmOpen(false);
      setApproveConsignorPaymentRelease("");
    } catch (e) {
      setApproveError(
        e instanceof Error ? e.message : "Could not approve layaway order",
      );
    } finally {
      setApproveBusy(false);
    }
  }, [approveConsignorPaymentRelease, id, token]);

  const confirmDeclineLayaway = useCallback(async () => {
    if (!id || !token) return;
    const reason = declineReason.trim();
    if (!reason) {
      setDeclineError("Please enter a reason for declining this layaway order.");
      return;
    }

    setDeclineError(null);
    setDeclineBusy(true);
    try {
      const res = await apiFetch(
        `/api/orders/${id}/decline-layaway`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderDetail;
      setDetail(data);
      setDeclineConfirmOpen(false);
      setDeclineReason("");
    } catch (e) {
      setDeclineError(
        e instanceof Error ? e.message : "Could not decline layaway order",
      );
    } finally {
      setDeclineBusy(false);
    }
  }, [declineReason, id, token]);

  const confirmCancelOrder = useCallback(async () => {
    if (!id || !token) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setCancelError("Please enter a reason for cancelling this order.");
      return;
    }

    setCancelError(null);
    setCancelBusy(true);
    try {
      const res = await apiFetch(
        `/api/orders/${id}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderDetail;
      setDetail(data);
      setCancelConfirmOpen(false);
      setCancelReason("");
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : "Could not cancel order");
    } finally {
      setCancelBusy(false);
    }
  }, [cancelReason, id, token]);

  const confirmCancelReservation = useCallback(async () => {
    if (!id || !token) return;

    setReservationCancelError(null);
    setReservationCancelBusy(true);
    try {
      const res = await apiFetch(
        `/api/orders/${id}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Reservation cancelled" }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderDetail;
      setDetail(data);
      setReservationCancelConfirmOpen(false);
    } catch (e) {
      setReservationCancelError(
        e instanceof Error ? e.message : "Could not cancel reservation",
      );
    } finally {
      setReservationCancelBusy(false);
    }
  }, [id, token]);

  const termsMonthsNumber = useMemo(() => {
    if (!/^\d+$/.test(termsMonths.trim())) return null;
    const value = Number.parseInt(termsMonths, 10);
    if (value < MIN_LAYAWAY_MONTHS || value > MAX_LAYAWAY_MONTHS) return null;
    return value;
  }, [termsMonths]);

  const termsPriceNumber = useMemo(
    () => parsePositiveMoney(termsPrice),
    [termsPrice],
  );

  const termsMonthlyPayment =
    termsMonthsNumber != null && termsPriceNumber != null
      ? (termsPriceNumber / termsMonthsNumber).toFixed(2)
      : "";

  const termsFormValid =
    termsMonthsNumber != null &&
    termsPriceNumber != null &&
    termsConsignorPaymentRelease !== "" &&
    !termsBusy;

  const approvePaymentReleaseOptions = useMemo(
    () => consignorPaymentReleaseOptions(detail?.layawayMonths ?? null),
    [detail?.layawayMonths],
  );

  const termsPaymentReleaseOptions = useMemo(
    () => consignorPaymentReleaseOptions(termsMonthsNumber),
    [termsMonthsNumber],
  );

  const openUpdateTermsDialog = useCallback(() => {
    if (!detail) return;
    setTermsError(null);
    setTermsMonths(detail.layawayMonths != null ? String(detail.layawayMonths) : "");
    setTermsPrice(normalizeMoneyInput(detail.layawayPrice));
    setTermsConsignorPaymentRelease(
      detail.consignorPaymentRelease != null
        ? String(detail.consignorPaymentRelease)
        : "",
    );
    setTermsConfirmOpen(true);
  }, [detail]);

  const confirmUpdateLayawayTerms = useCallback(async () => {
    if (!id || !token || termsMonthsNumber == null || termsPriceNumber == null) {
      setTermsError("Enter valid layaway months and layaway price.");
      return;
    }
    const consignorPaymentRelease = Number.parseInt(
      termsConsignorPaymentRelease,
      10,
    );
    if (!Number.isFinite(consignorPaymentRelease) || consignorPaymentRelease < 1) {
      setTermsError("Please select a consignor payment release.");
      return;
    }

    setTermsError(null);
    setTermsBusy(true);
    try {
      const res = await apiFetch(
        `/api/orders/${id}/update-layaway-terms`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            layawayMonths: termsMonthsNumber,
            layawayPrice: termsPriceNumber.toFixed(2),
            consignorPaymentRelease,
          }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderDetail;
      setDetail(data);
      setTermsConfirmOpen(false);
      setTermsConsignorPaymentRelease("");
    } catch (e) {
      setTermsError(
        e instanceof Error ? e.message : "Could not update layaway terms",
      );
    } finally {
      setTermsBusy(false);
    }
  }, [
    id,
    termsConsignorPaymentRelease,
    termsMonthsNumber,
    termsPriceNumber,
    token,
  ]);

  const confirmOutForDelivery = useCallback(async () => {
    if (!id || !token) return;
    if (!shippingFeeCareOf) {
      setOutForDeliveryError("Please select who covers the shipping fee.");
      return;
    }
    if (shippingFeeCareOf === "The Bag Hub" && !shippingFeeProofFile) {
      setOutForDeliveryError(
        "Please upload proof of payment for the shipping fee.",
      );
      return;
    }

    setOutForDeliveryError(null);
    setOutForDeliveryBusy(true);
    try {
      const fd = new FormData();
      fd.append("shippingFeeCareOf", shippingFeeCareOf);
      if (shippingFeeProofFile) {
        fd.append("proof", shippingFeeProofFile);
      }
      const res = await apiFetch(
        `/api/orders/${id}/out-for-delivery`,
        { method: "POST", body: fd },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderDetail;
      setDetail(data);
      setOutForDeliveryOpen(false);
      setShippingFeeCareOf("");
      setShippingFeeProofFile(null);
    } catch (e) {
      setOutForDeliveryError(
        e instanceof Error
          ? e.message
          : "Could not mark order as out for delivery",
      );
    } finally {
      setOutForDeliveryBusy(false);
    }
  }, [id, shippingFeeCareOf, shippingFeeProofFile, token]);

  if (loading) {
    return (
      <div className="text-sm text-slate-600 dark:text-slate-400">Loading…</div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error ?? "Unable to load this order."}
        </p>
        <Link
          to="/portal/orders"
          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to orders
        </Link>
      </div>
    );
  }

  const customerName =
    `${detail.customer.firstName} ${detail.customer.lastName}`.trim() ||
    detail.customer.email;
  const anyActionBusy =
    approveBusy ||
    declineBusy ||
    termsBusy ||
    cancelBusy ||
    reservationCancelBusy ||
    outForDeliveryBusy;
  const isPaidOrder = detail.status === "Paid";
  const isOutForDeliveryOrder = detail.status === "Out for delivery";
  const showReservationPaymentProofs =
    detail.paymentType === "full_payment" &&
    (detail.status === "Reservation" ||
      (isPaidOrder && detail.reservationPaymentProofUrl != null));
  const showFullPaymentProof =
    detail.paymentType === "full_payment" &&
    (detail.status === "For Payment" ||
      (isPaidOrder && detail.reservationPaymentProofUrl == null));
  const showLayawaySchedule =
    detail.paymentType === "layaway" &&
    (detail.status === "For Payment" || isPaidOrder || isOutForDeliveryOrder) &&
    detail.installments.length > 0;

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Order
          </p>
          <h1 className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            #{detail.orderNumber}
          </h1>
          <p className="mt-2 break-words text-base text-slate-700 dark:text-slate-300">
            {detail.inventoryItem.itemLabel}
          </p>
        </div>
        <Link
          to="/portal/orders"
          className="shrink-0 text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to orders
        </Link>
      </div>

      {isForLayawayApproval(detail.status) ? (
        <div className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Layaway approval
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={layawayApproveBtn}
              disabled={anyActionBusy}
              onClick={() => {
                setApproveError(null);
                setApproveConsignorPaymentRelease("");
                setApproveConfirmOpen(true);
              }}
            >
              Approve
            </button>
            <button
              type="button"
              className={layawayDeclineBtn}
              disabled={anyActionBusy}
              onClick={() => {
                setDeclineError(null);
                setDeclineReason("");
                setDeclineConfirmOpen(true);
              }}
            >
              Decline
            </button>
            <button
              type="button"
              className={layawayUpdateTermsBtn}
              disabled={anyActionBusy}
              onClick={openUpdateTermsDialog}
            >
              Update terms
            </button>
          </div>
        </div>
      ) : null}

      {isReservationOrderStatus(detail.status) ? (
        <div className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Reservation actions
          </h2>
          <div className="mt-4">
            <button
              type="button"
              className={layawayDeclineBtn}
              disabled={anyActionBusy}
              onClick={() => {
                setReservationCancelError(null);
                setReservationCancelConfirmOpen(true);
              }}
            >
              Cancel reservation
            </button>
          </div>
        </div>
      ) : null}

      {isCancellableOrderStatus(detail.status) || isPaidOrder ? (
        <div className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Order actions
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {isPaidOrder ? (
              <button
                type="button"
                className={layawayApproveBtn}
                disabled={anyActionBusy}
                onClick={() => {
                  setOutForDeliveryError(null);
                  setShippingFeeCareOf("");
                  setShippingFeeProofFile(null);
                  setOutForDeliveryOpen(true);
                }}
              >
                Out for delivery
              </button>
            ) : null}
            {isCancellableOrderStatus(detail.status) ? (
              <button
                type="button"
                className={layawayDeclineBtn}
                disabled={anyActionBusy}
                onClick={() => {
                  setCancelError(null);
                  setCancelReason("");
                  setCancelConfirmOpen(true);
                }}
              >
                Cancel order
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showLayawaySchedule ? (
        <OrderInstallmentSchedule
          orderId={detail.id}
          token={token}
          layawayPrice={detail.layawayPrice}
          installments={detail.installments}
          mode="staff"
          readOnly={isPaidOrder || isOutForDeliveryOrder}
          onUpdated={(installments) =>
            setDetail((prev) => (prev ? { ...prev, installments } : prev))
          }
          onMarkPaid={(updated) =>
            setDetail((prev) =>
              prev
                ? { ...prev, status: updated.status, installments: updated.installments }
                : prev,
            )
          }
        />
      ) : null}

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Order details
          </h2>
          <Link
            to={`/portal/inventory/${detail.inventoryItem.id}`}
            className={recordActionBtn}
          >
            View inventory item
          </Link>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <DetailField label="Status">
            <OrderStatusBadge status={detail.status} />
          </DetailField>
          <DetailField label="Payment type">
            {paymentTypeLabel(detail.paymentType)}
          </DetailField>
          <DetailField label="Created">
            <SubmittedAtCell iso={detail.createdAt} />
          </DetailField>
          <DetailField label="Last updated">
            <SubmittedAtCell iso={detail.updatedAt} />
          </DetailField>
          <DetailField label="Holding period ends">
            {detail.holdingPeriod ? (
              <SubmittedAtCell iso={detail.holdingPeriod} />
            ) : (
              "—"
            )}
          </DetailField>
          {detail.status === "Reservation" ? (
            <>
              <DetailField label="Reservation fee">
                <div className="space-y-2">
                  <span>{formatPhpDisplay(detail.fullPaymentPrice)}</span>
                  {detail.reservationPaymentProofUrl ? (
                    <a
                      href={detail.reservationPaymentProofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex items-center justify-center rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-900 transition-colors hover:bg-violet-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-900/80"
                    >
                      View proof
                    </a>
                  ) : null}
                </div>
              </DetailField>
              <DetailField label="Full payment price">
                {formatPhpDisplay(detail.fullPaymentTotalPrice)}
              </DetailField>
            </>
          ) : detail.paymentType === "full_payment" &&
            !isCancelledOrderStatus(detail.status) ? (
            <DetailField label="Full payment price">
              {formatPhpDisplay(detail.fullPaymentPrice)}
            </DetailField>
          ) : detail.paymentType === "layaway" ? (
            <>
              <DetailField label="Layaway months">
                {detail.layawayMonths ?? "—"}
              </DetailField>
              <DetailField label="Layaway price">
                {formatPhpDisplay(detail.layawayPrice)}
              </DetailField>
              <DetailField label="Monthly payment">
                {formatPhpDisplay(detail.layawayMonthlyPayment)}
              </DetailField>
              <DetailField label="Layaway payment start date">
                {formatOrderDate(detail.layawayPaymentStartDate)}
              </DetailField>
              {detail.consignorPaymentRelease != null ? (
                <DetailField label="Consignor payment release">
                  {consignorPaymentReleaseLabel(detail.consignorPaymentRelease)}
                </DetailField>
              ) : null}
            </>
          ) : null}
          {detail.declineReason ? (
            <DetailField label="Reason">
              <span className="whitespace-pre-wrap break-words">
                {detail.declineReason}
              </span>
            </DetailField>
          ) : null}
          {detail.shippingFeeCareOf ? (
            <DetailField label="Shipping fee care of">
              {detail.shippingFeeCareOf}
            </DetailField>
          ) : null}
        </dl>
        {detail.shippingFeeProofUrl ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Shipping fee proof of payment
            </p>
            <a
              href={detail.shippingFeeProofUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center justify-center rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-900 transition-colors hover:bg-violet-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-900/80"
            >
              View proof
            </a>
          </div>
        ) : null}
        {showReservationPaymentProofs ? (
          <>
            <FullPaymentProofUpload<OrderDetail>
              orderId={detail.id}
              token={token}
              apiBase="/api/orders"
              endpointPath="reservation-payment-proof"
              proofUrl={detail.reservationPaymentProofUrl}
              title="Reservation fee proof of payment"
              uploadLabel="Upload reservation proof"
              readOnly={isPaidOrder || isOutForDeliveryOrder}
              onUpdated={setDetail}
            />
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Remaining balance
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatPhpDisplay(detail.remainingBalancePrice)}
              </p>
              <FullPaymentProofUpload<OrderDetail>
                orderId={detail.id}
                token={token}
                apiBase="/api/orders"
                endpointPath="full-payment-proof"
                proofUrl={detail.fullPaymentProofUrl}
                title="Remaining balance proof of payment"
                uploadLabel="Upload remaining balance proof"
                allowMarkPaid={!isPaidOrder && !isOutForDeliveryOrder}
                readOnly={isPaidOrder || isOutForDeliveryOrder}
                confirmTitle="Mark remaining balance as paid?"
                confirmDescription="This reservation order will be marked as paid. Make sure the uploaded remaining balance proof has been reviewed."
                onUpdated={setDetail}
              />
            </div>
          </>
        ) : null}
        {showFullPaymentProof ? (
          <FullPaymentProofUpload<OrderDetail>
            orderId={detail.id}
            token={token}
            apiBase="/api/orders"
            endpointPath="full-payment-proof"
            proofUrl={detail.fullPaymentProofUrl}
            title={
              detail.reservationPaymentProofUrl
                ? "Remaining balance proof of payment"
                : "Proof of payment"
            }
            uploadLabel={
              detail.reservationPaymentProofUrl
                ? "Upload remaining balance proof"
                : "Upload proof of payment"
            }
            allowMarkPaid={!isPaidOrder && !isOutForDeliveryOrder}
            readOnly={isPaidOrder || isOutForDeliveryOrder}
            onUpdated={setDetail}
          />
        ) : null}
      </div>

      <div className={cardClass}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Customer
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <DetailField label="Name">{customerName}</DetailField>
          <DetailField label="Email">{displayOrDash(detail.customer.email)}</DetailField>
          <DetailField label="Contact number">
            {displayOrDash(detail.customer.contactNumber)}
          </DetailField>
          <DetailField label="Complete address">
            {displayOrDash(detail.customer.completeAddress)}
          </DetailField>
        </dl>
      </div>

      <div className={cardClass}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Item
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <DetailField label="SKU">
            <span className="break-all font-mono text-sm">{detail.inventoryItem.sku}</span>
          </DetailField>
          <DetailField label="Item">
            {detail.inventoryItem.itemLabel}
          </DetailField>
          <DetailField label="Inventory status">
            <InventoryStatusBadge status={detail.inventoryItem.status} />
          </DetailField>
        </dl>
      </div>

      <div className={cardClass}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Signature
        </h2>
        {detail.signatureUrl ? (
          <div className="mt-4">
            <img
              src={detail.signatureUrl}
              alt="Customer signature"
              className="max-h-48 max-w-full rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700"
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">—</p>
        )}
      </div>

      <ConfirmDialog
        open={approveConfirmOpen}
        title="Approve layaway order?"
        description={
          <div className="space-y-3">
            <p>
              The order status will change to For Payment and the layaway payment
              start date will be set to today.
            </p>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Consignor payment release
              </span>
              <select
                value={approveConsignorPaymentRelease}
                onChange={(e) => setApproveConsignorPaymentRelease(e.target.value)}
                disabled={approveBusy || approvePaymentReleaseOptions.length === 0}
                className={formSelectClass}
              >
                <option value="">Select…</option>
                {approvePaymentReleaseOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
        confirmLabel="Approve"
        cancelLabel="Cancel"
        busy={approveBusy}
        confirmDisabled={!approveConsignorPaymentRelease}
        errorMessage={approveError}
        onCancel={() => {
          if (approveBusy) return;
          setApproveError(null);
          setApproveConsignorPaymentRelease("");
          setApproveConfirmOpen(false);
        }}
        onConfirm={confirmApproveLayaway}
      />
      <ConfirmDialog
        open={declineConfirmOpen}
        title="Decline layaway order?"
        description={
          <div className="space-y-3">
            <p>
              The order status will change to Declined and the item will become
              available for purchase again.
            </p>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Reason for decline
              </span>
              <textarea
                value={declineReason}
                onChange={(e) => {
                  setDeclineReason(e.target.value);
                  if (declineError) setDeclineError(null);
                }}
                rows={4}
                maxLength={1000}
                disabled={declineBusy}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="Explain why this layaway order is being declined."
              />
            </label>
          </div>
        }
        confirmLabel="Decline"
        cancelLabel="Cancel"
        danger
        busy={declineBusy}
        confirmDisabled={!declineReason.trim()}
        errorMessage={declineError}
        onCancel={() => {
          if (declineBusy) return;
          setDeclineError(null);
          setDeclineConfirmOpen(false);
          setDeclineReason("");
        }}
        onConfirm={confirmDeclineLayaway}
      />
      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Cancel order?"
        description={
          <div className="space-y-3">
            <p>
              The order status will change to Cancelled and the item will become
              available for purchase again.
            </p>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Reason for cancelling
              </span>
              <textarea
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value);
                  if (cancelError) setCancelError(null);
                }}
                rows={4}
                maxLength={1000}
                disabled={cancelBusy}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="Explain why this order is being cancelled."
              />
            </label>
          </div>
        }
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        danger
        busy={cancelBusy}
        confirmDisabled={!cancelReason.trim()}
        errorMessage={cancelError}
        onCancel={() => {
          if (cancelBusy) return;
          setCancelError(null);
          setCancelConfirmOpen(false);
          setCancelReason("");
        }}
        onConfirm={confirmCancelOrder}
      />
      <ConfirmDialog
        open={reservationCancelConfirmOpen}
        title="Cancel reservation?"
        description="The order status will change to Cancelled and the item will become available for purchase again."
        confirmLabel="Cancel reservation"
        cancelLabel="Keep reservation"
        danger
        busy={reservationCancelBusy}
        errorMessage={reservationCancelError}
        onCancel={() => {
          if (reservationCancelBusy) return;
          setReservationCancelError(null);
          setReservationCancelConfirmOpen(false);
        }}
        onConfirm={confirmCancelReservation}
      />
      <ConfirmDialog
        open={termsConfirmOpen}
        title="Update layaway terms?"
        description={
          <div className="space-y-3">
            <p>
              Save the revised terms and move this order to For Payment. The
              installment schedule will use these values.
            </p>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Layaway months
              </span>
              <input
                type="number"
                min={MIN_LAYAWAY_MONTHS}
                max={MAX_LAYAWAY_MONTHS}
                step={1}
                value={termsMonths}
                onChange={(e) => {
                  setTermsMonths(e.target.value);
                  setTermsConsignorPaymentRelease("");
                  if (termsError) setTermsError(null);
                }}
                disabled={termsBusy}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                Allowed range: {MIN_LAYAWAY_MONTHS} to {MAX_LAYAWAY_MONTHS} months.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Layaway price
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={termsPrice}
                onChange={(e) => {
                  setTermsPrice(e.target.value);
                  if (termsError) setTermsError(null);
                }}
                disabled={termsBusy}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="0.00"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Monthly payment
              </span>
              <input
                type="text"
                value={termsMonthlyPayment}
                readOnly
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Calculated automatically"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Consignor payment release
              </span>
              <select
                value={termsConsignorPaymentRelease}
                onChange={(e) =>
                  setTermsConsignorPaymentRelease(e.target.value)
                }
                disabled={termsBusy || termsPaymentReleaseOptions.length === 0}
                className={formSelectClass}
              >
                <option value="">Select…</option>
                {termsPaymentReleaseOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
        confirmLabel="Save terms"
        cancelLabel="Cancel"
        busy={termsBusy}
        confirmDisabled={!termsFormValid}
        errorMessage={termsError}
        onCancel={() => {
          if (termsBusy) return;
          setTermsError(null);
          setTermsConsignorPaymentRelease("");
          setTermsConfirmOpen(false);
        }}
        onConfirm={confirmUpdateLayawayTerms}
      />

      {outForDeliveryOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal
          aria-labelledby="out-for-delivery-title"
          onClick={() => {
            if (!outForDeliveryBusy) setOutForDeliveryOpen(false);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="out-for-delivery-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Out for delivery
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              The order and inventory item will be marked as out for delivery.
              Waitlisted clients will be notified that this item is no longer
              available.
            </p>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Shipping fee care of
                </span>
                <select
                  value={shippingFeeCareOf}
                  onChange={(e) => {
                    setShippingFeeCareOf(e.target.value);
                    if (e.target.value !== "The Bag Hub") {
                      setShippingFeeProofFile(null);
                    }
                    if (outForDeliveryError) setOutForDeliveryError(null);
                  }}
                  disabled={outForDeliveryBusy}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">Select…</option>
                  <option value="The Bag Hub">The Bag Hub</option>
                  <option value="Client">Client</option>
                </select>
              </label>
              {shippingFeeCareOf === "The Bag Hub" ? (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Proof of payment for shipping fee
                  </span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    disabled={outForDeliveryBusy}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setShippingFeeProofFile(file);
                      if (outForDeliveryError) setOutForDeliveryError(null);
                    }}
                    className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-violet-900 hover:file:bg-violet-100 disabled:opacity-50 dark:text-slate-300 dark:file:bg-violet-950/60 dark:file:text-violet-100"
                  />
                </label>
              ) : null}
              {outForDeliveryError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  {outForDeliveryError}
                </p>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
              <button
                type="button"
                disabled={outForDeliveryBusy}
                onClick={() => {
                  if (outForDeliveryBusy) return;
                  setOutForDeliveryOpen(false);
                  setOutForDeliveryError(null);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  outForDeliveryBusy ||
                  !shippingFeeCareOf ||
                  (shippingFeeCareOf === "The Bag Hub" && !shippingFeeProofFile)
                }
                onClick={() => void confirmOutForDelivery()}
                className={layawayApproveBtn}
              >
                {outForDeliveryBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
