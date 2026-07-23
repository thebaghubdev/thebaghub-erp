import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FullPaymentProofUpload } from "../components/FullPaymentProofUpload";
import { OrderInstallmentSchedule } from "../components/OrderInstallmentSchedule";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { useClientAuth } from "../context/client-auth";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay } from "../lib/format-php";
import {
  isFullPaymentLike,
  paymentTypeLabel,
} from "../lib/order-status-filter-options";
import { isForPickupOrderStatus } from "../lib/order-pickup-labels";
import type { OrderInstallmentRow } from "../lib/order-installments";

type ClientOrderDetail = {
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
  holdingPeriod: string | null;
  declineReason: string | null;
  signatureUrl: string | null;
  createdAt: string;
  updatedAt: string;
  inventoryItem: {
    id: string;
    sku: string;
    itemLabel: string;
  };
  installments: OrderInstallmentRow[];
};

const cardClass = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";

const actionBtnClassName =
  "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";

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
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export function ClientOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useClientAuth();
  const [detail, setDetail] = useState<ClientOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itemReceivedConfirmOpen, setItemReceivedConfirmOpen] = useState(false);
  const [itemReceivedBusy, setItemReceivedBusy] = useState(false);
  const [itemReceivedError, setItemReceivedError] = useState<string | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!id || !token) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/client/orders/${id}`, {}, token);
      if (!res.ok) {
        const msg =
          res.status === 404
            ? "Order not found."
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }
      const data = (await res.json()) as ClientOrderDetail;
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

  const confirmItemReceived = useCallback(async () => {
    if (!id || !token) return;
    setItemReceivedError(null);
    setItemReceivedBusy(true);
    try {
      const res = await apiFetch(
        `/api/client/orders/${id}/item-received`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as ClientOrderDetail;
      setDetail(data);
      setItemReceivedConfirmOpen(false);
    } catch (e) {
      setItemReceivedError(
        e instanceof Error ? e.message : "Could not mark item as received",
      );
    } finally {
      setItemReceivedBusy(false);
    }
  }, [id, token]);

  if (loading) {
    return <p className="text-sm text-slate-600">Loading order…</p>;
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error ?? "Unable to load this order."}
        </p>
        <Link
          to="/orders"
          className="text-sm font-medium text-violet-700 hover:underline"
        >
          ← Back to orders
        </Link>
      </div>
    );
  }

  const isPaidOrder = detail.status === "Paid";
  const isForPickupOrder = isForPickupOrderStatus(detail.status);
  const isItemReceivedOrder = detail.status === "Item Received";
  const isPostPaymentOrder =
    isPaidOrder || isForPickupOrder || isItemReceivedOrder;
  const showReservationPaymentProofs =
    detail.paymentType === "full_payment" &&
    (detail.status === "Reservation" ||
      ((isPaidOrder || isForPickupOrder || isItemReceivedOrder) &&
        detail.reservationPaymentProofUrl != null));
  const showFullPaymentProof =
    detail.paymentType === "full_payment" &&
    (detail.status === "For Payment" ||
      ((isPaidOrder || isForPickupOrder || isItemReceivedOrder) &&
        detail.reservationPaymentProofUrl == null));
  const showLayawaySchedule =
    detail.paymentType === "layaway" &&
    (detail.status === "For Payment" ||
      isPaidOrder ||
      isForPickupOrder ||
      isItemReceivedOrder) &&
    detail.installments.length > 0;

  return (
    <div className="w-full min-w-0 space-y-4">
      <Link
        to="/orders"
        className="inline-flex text-sm font-medium text-violet-700 hover:underline"
      >
        ← Back to orders
      </Link>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Order
        </p>
        <h1 className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
          #{detail.orderNumber}
        </h1>
        <p className="mt-1 break-words text-sm text-slate-700">
          {detail.inventoryItem.itemLabel}
        </p>
      </div>

      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-slate-900">Order details</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailField label="Status">
            <OrderStatusBadge status={detail.status} />
          </DetailField>
          <DetailField label="Payment type">
            {paymentTypeLabel(detail.paymentType)}
          </DetailField>
          <DetailField label="Submitted">
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
                      className="ml-2 inline-flex items-center justify-center rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-900 transition-colors hover:bg-violet-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500"
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
          ) : isFullPaymentLike(detail.paymentType) ? (
            <DetailField label="Full payment price">
              {formatPhpDisplay(detail.fullPaymentPrice)}
            </DetailField>
          ) : (
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
            </>
          )}
          {detail.declineReason ? (
            <DetailField label="Reason">
              <span className="whitespace-pre-wrap break-words">
                {detail.declineReason}
              </span>
            </DetailField>
          ) : null}
        </dl>
        {showReservationPaymentProofs ? (
          <>
            <FullPaymentProofUpload<ClientOrderDetail>
              orderId={detail.id}
              token={token}
              apiBase="/api/client/orders"
              endpointPath="reservation-payment-proof"
              proofUrl={detail.reservationPaymentProofUrl}
              title="Reservation fee proof of payment"
              uploadLabel="Upload reservation proof"
              readOnly={isPostPaymentOrder}
              onUpdated={setDetail}
            />
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">
                Remaining balance
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {formatPhpDisplay(detail.remainingBalancePrice)}
              </p>
              <FullPaymentProofUpload<ClientOrderDetail>
                orderId={detail.id}
                token={token}
                apiBase="/api/client/orders"
                endpointPath="full-payment-proof"
                proofUrl={detail.fullPaymentProofUrl}
                title="Remaining balance proof of payment"
                uploadLabel="Upload remaining balance proof"
                readOnly={isPostPaymentOrder}
                onUpdated={setDetail}
              />
            </div>
          </>
        ) : null}
        {showFullPaymentProof ? (
          <FullPaymentProofUpload<ClientOrderDetail>
            orderId={detail.id}
            token={token}
            apiBase="/api/client/orders"
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
            readOnly={isPostPaymentOrder}
            onUpdated={setDetail}
          />
        ) : null}
      </div>

      {isForPickupOrder ? (
        <div className={cardClass}>
          <h2 className="text-sm font-semibold text-slate-900">Order actions</h2>
          <div className="mt-4">
            <button
              type="button"
              className={actionBtnClassName}
              disabled={itemReceivedBusy}
              onClick={() => {
                setItemReceivedError(null);
                setItemReceivedConfirmOpen(true);
              }}
            >
              Item Received
            </button>
          </div>
        </div>
      ) : null}

      {showLayawaySchedule ? (
        <OrderInstallmentSchedule
          orderId={detail.id}
          token={token}
          layawayPrice={detail.layawayPrice}
          installments={detail.installments}
          mode="client"
          readOnly={isPostPaymentOrder}
          onUpdated={(update) =>
            setDetail((prev) =>
              prev ? { ...prev, installments: update.installments } : prev,
            )
          }
        />
      ) : null}

      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-slate-900">Item</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailField label="SKU">
            <span className="break-all font-mono text-sm">
              {detail.inventoryItem.sku}
            </span>
          </DetailField>
          <DetailField label="Product">
            {detail.inventoryItem.itemLabel}
          </DetailField>
        </dl>
      </div>

      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-slate-900">Signature</h2>
        {detail.signatureUrl ? (
          <div className="mt-4">
            <img
              src={detail.signatureUrl}
              alt="Your signature"
              className="max-h-48 max-w-full rounded-lg border border-slate-200 bg-white object-contain"
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-600">—</p>
        )}
      </div>

      <ConfirmDialog
        open={itemReceivedConfirmOpen}
        title="Confirm item received?"
        description="This will mark your order as Item Received. The inventory item will be recorded as Sold under warranty."
        confirmLabel="Item Received"
        cancelLabel="Cancel"
        busy={itemReceivedBusy}
        errorMessage={itemReceivedError}
        onCancel={() => {
          if (itemReceivedBusy) return;
          setItemReceivedError(null);
          setItemReceivedConfirmOpen(false);
        }}
        onConfirm={confirmItemReceived}
      />
    </div>
  );
}
