import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { OrderInstallmentSchedule } from "../components/OrderInstallmentSchedule";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { useClientAuth } from "../context/client-auth";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay } from "../lib/format-php";
import { paymentTypeLabel } from "../lib/order-status-filter-options";
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
  holdingPeriod: string | null;
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

const cardClass =
  "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";

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
          {detail.paymentType === "full_payment" ? (
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
        </dl>
      </div>

      {detail.paymentType === "layaway" &&
      detail.status === "For Payment" &&
      detail.installments.length > 0 ? (
        <OrderInstallmentSchedule
          orderId={detail.id}
          token={token}
          layawayPrice={detail.layawayPrice}
          installments={detail.installments}
          mode="client"
          onUpdated={(installments) =>
            setDetail((prev) => (prev ? { ...prev, installments } : prev))
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
    </div>
  );
}
