import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { OrderInstallmentSchedule } from "../components/OrderInstallmentSchedule";
import { OrderPaymentsSection } from "../components/OrderPaymentsSection";
import { computeInstallmentVoucherAmountDue } from "../components/UseVoucherDialog";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { useClientAuth } from "../context/client-auth";
import type { ClientProfile } from "../context/auth-user";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay, parsePhpStringToNumber } from "../lib/format-php";
import {
  isFullPaymentLike,
  isInstallmentPaymentType,
  isItemReceivedOrderStatus,
  paymentTypeLabel,
} from "../lib/order-status-filter-options";
import {
  courierServiceLabel,
  isForPickupOrderStatus,
  pickupBranchLabel,
  pickupOptionLabel,
} from "../lib/order-pickup-labels";
import type { OrderInstallmentRow } from "../lib/order-installments";
import type { OrderPaymentRow } from "../lib/order-payments";
import {
  canPrintLayawayAgreement,
  openLayawayAgreementPrintTab,
  type LayawayAgreementDetail,
} from "../lib/layaway-agreement-print";
import {
  canPrintOrderSalesContract,
  openOrderSalesContractPrintTab,
  type OrderSalesContractDetail,
} from "../lib/order-sales-contract-print";
import { isVoucherApplicableOrderStatus } from "../lib/order-voucher-payment";

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
  creditCardPrice: string | null;
  remainingBalancePrice: string | null;
  orderTotalPrice: string | null;
  reservationPaymentProofUrl: string | null;
  fullPaymentProofUrl: string | null;
  holdingPeriod: string | null;
  layawayPaymentStartDate: string | null;
  declineReason: string | null;
  convertedToLayawayAt: string | null;
  signatureUrl: string | null;
  pickupOption: string | null;
  pickupBranch: string | null;
  courierService: string | null;
  createdAt: string;
  updatedAt: string;
  inventoryItem: {
    id: string;
    sku: string;
    itemLabel: string;
  };
  installments: OrderInstallmentRow[];
  payments: OrderPaymentRow[];
};

const cardClass = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";

const actionBtnClassName =
  "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryActionBtnClassName =
  "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50";

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

function toClientLayawayAgreementDetail(
  detail: ClientOrderDetail,
  client: ClientProfile | null | undefined,
): LayawayAgreementDetail {
  const customerName =
    `${client?.firstName ?? ""} ${client?.lastName ?? ""}`.trim() ||
    client?.email ||
    "—";
  return {
    orderNumber: detail.orderNumber,
    customer: {
      name: customerName,
      email: client?.email ?? "—",
      contactNumber: client?.contactNumber ?? "—",
      completeAddress: client?.completeAddress ?? null,
    },
    inventoryItem: {
      sku: detail.inventoryItem.sku,
      itemLabel: detail.inventoryItem.itemLabel,
    },
    layawayMonths: detail.layawayMonths,
    layawayPrice: detail.layawayPrice,
    layawayMonthlyPayment: detail.layawayMonthlyPayment,
    layawayPaymentStartDate: detail.layawayPaymentStartDate,
    pickupOption: detail.pickupOption,
    pickupBranch: detail.pickupBranch,
    courierService: detail.courierService,
    installments: detail.installments,
    signatureUrl: detail.signatureUrl,
  };
}

function toClientOrderSalesContractDetail(
  detail: ClientOrderDetail,
  client: ClientProfile | null | undefined,
): OrderSalesContractDetail {
  const customerName =
    `${client?.firstName ?? ""} ${client?.lastName ?? ""}`.trim() ||
    client?.email ||
    "—";
  return {
    orderNumber: detail.orderNumber,
    status: detail.status,
    paymentType: detail.paymentType,
    documentDate: detail.updatedAt,
    customer: {
      name: customerName,
      email: client?.email ?? "—",
      contactNumber: client?.contactNumber ?? "—",
      completeAddress: client?.completeAddress ?? null,
    },
    inventoryItem: {
      sku: detail.inventoryItem.sku,
      itemLabel: detail.inventoryItem.itemLabel,
    },
    orderTotalPrice: detail.orderTotalPrice,
    layawayPrice: detail.layawayPrice,
    pickupOption: detail.pickupOption,
    assignedToName: null,
    installments: detail.installments,
    payments: detail.payments,
    signatureUrl: detail.signatureUrl,
  };
}

export function ClientOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useClientAuth();
  const [detail, setDetail] = useState<ClientOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
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

  const handleVoucherApplied = useCallback(
    async (orderDetail?: unknown) => {
      if (orderDetail) {
        setDetail(orderDetail as ClientOrderDetail);
      } else {
        await load();
      }
    },
    [load],
  );

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
  const isItemReceivedOrder = isItemReceivedOrderStatus(detail.status);
  const isPostPaymentOrder =
    isPaidOrder || isForPickupOrder || isItemReceivedOrder;
  const installmentScheduleReadOnly =
    detail.paymentType === "credit_line"
      ? detail.status === "Item Received - Paid"
      : isPostPaymentOrder;
  const showOrderPayments =
    detail.paymentType === "full_payment" &&
    (detail.status === "For Payment" ||
      detail.status === "Reservation" ||
      isPostPaymentOrder);
  const showPriorFullPayments =
    detail.paymentType === "layaway" &&
    detail.convertedToLayawayAt != null &&
    (detail.payments?.length ?? 0) > 0;
  const orderPaymentsReadOnly = isPostPaymentOrder;
  const showHoldingPeriodNotice =
    detail.paymentType === "full_payment" &&
    detail.status === "For Payment" &&
    detail.holdingPeriod != null;
  const showLayawaySchedule =
    isInstallmentPaymentType(detail.paymentType) &&
    detail.installments.length > 0 &&
    (detail.paymentType === "credit_line"
      ? detail.status === "For pick-up" ||
        detail.status === "Item Received - Unpaid" ||
        detail.status === "Item Received - Paid"
      : detail.status === "For Payment" ||
        isPaidOrder ||
        isForPickupOrder ||
        isItemReceivedOrder);

  const voucherApplicable = isVoucherApplicableOrderStatus(detail.status);
  const fullPaymentVoucherDue =
    parsePhpStringToNumber(detail.remainingBalancePrice ?? "") ?? 0;
  const installmentVoucherDue = computeInstallmentVoucherAmountDue(
    detail.installments,
  );
  const canUseFullPaymentVoucher =
    voucherApplicable && !orderPaymentsReadOnly && fullPaymentVoucherDue > 0;
  const canUseInstallmentVoucher =
    showLayawaySchedule &&
    isInstallmentPaymentType(detail.paymentType) &&
    voucherApplicable &&
    !installmentScheduleReadOnly &&
    installmentVoucherDue > 0;
  const showPrintLayawayAgreement = canPrintLayawayAgreement(detail);
  const showPrintOrderSalesContract = canPrintOrderSalesContract(detail.status);

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

      {showHoldingPeriodNotice ? (
        <p
          className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm leading-relaxed text-amber-950"
          role="status"
        >
          This order has a 3-hour holding period. Upload your proof of payment
          before the holding period ends (see below). If payment is not
          confirmed in time, your order will be automatically cancelled.
        </p>
      ) : null}

      {printError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {printError}
        </p>
      ) : null}

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Order details
          </h2>
          {showPrintLayawayAgreement ? (
            <button
              type="button"
              className={secondaryActionBtnClassName}
              onClick={() => {
                setPrintError(null);
                void openLayawayAgreementPrintTab(
                  toClientLayawayAgreementDetail(detail, user?.client),
                ).catch((err) => {
                  setPrintError(
                    err instanceof Error
                      ? err.message
                      : "Could not open layaway agreement",
                  );
                });
              }}
            >
              Print layaway agreement
            </button>
          ) : null}
          {showPrintOrderSalesContract ? (
            <button
              type="button"
              className={secondaryActionBtnClassName}
              onClick={() => {
                setPrintError(null);
                void openOrderSalesContractPrintTab(
                  toClientOrderSalesContractDetail(detail, user?.client),
                ).catch((err) => {
                  setPrintError(
                    err instanceof Error
                      ? err.message
                      : "Could not open sales contract",
                  );
                });
              }}
            >
              Print acknowledgement receipt & sales contract
            </button>
          ) : null}
        </div>
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
              <DetailField label="Best price">
                {formatPhpDisplay(detail.fullPaymentTotalPrice)}
              </DetailField>
              <DetailField label="Credit card price">
                {formatPhpDisplay(detail.creditCardPrice)}
              </DetailField>
            </>
          ) : isInstallmentPaymentType(detail.paymentType) ? (
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
          ) : isFullPaymentLike(detail.paymentType) ? (
            <>
              <DetailField label="Best price">
                {formatPhpDisplay(detail.fullPaymentPrice)}
              </DetailField>
              <DetailField label="Credit card price">
                {formatPhpDisplay(detail.creditCardPrice)}
              </DetailField>
            </>
          ) : null}
          {detail.declineReason ? (
            <DetailField label="Reason">
              <span className="whitespace-pre-wrap break-words">
                {detail.declineReason}
              </span>
            </DetailField>
          ) : null}
          {detail.pickupOption ? (
            <DetailField label="Pick-up option">
              {pickupOptionLabel(detail.pickupOption)}
            </DetailField>
          ) : null}
          {detail.pickupBranch ? (
            <DetailField label="Branch">
              {pickupBranchLabel(detail.pickupBranch)}
            </DetailField>
          ) : null}
          {detail.courierService ? (
            <DetailField label="Courier service">
              {courierServiceLabel(detail.courierService)}
            </DetailField>
          ) : null}
        </dl>
      </div>

      {showOrderPayments ? (
        <div className={cardClass}>
          <OrderPaymentsSection
            orderId={detail.id}
            token={token}
            payments={detail.payments ?? []}
            remainingBalancePrice={detail.remainingBalancePrice}
            orderTotalPrice={detail.orderTotalPrice}
            mode="client"
            readOnly={orderPaymentsReadOnly}
            canUseVoucher={canUseFullPaymentVoucher}
            voucherAmountDue={fullPaymentVoucherDue}
            onVoucherApplied={handleVoucherApplied}
            onUpdated={(update) =>
              setDetail((prev) =>
                prev
                  ? {
                      ...prev,
                      payments: update.payments,
                      remainingBalancePrice: update.remainingBalancePrice,
                      holdingPeriod: update.holdingPeriod,
                      ...(update.orderTotalPrice !== undefined
                        ? { orderTotalPrice: update.orderTotalPrice }
                        : {}),
                      ...(update.fullPaymentTotalPrice !== undefined
                        ? {
                            fullPaymentTotalPrice: update.fullPaymentTotalPrice,
                          }
                        : {}),
                      ...(update.status != null
                        ? { status: update.status }
                        : {}),
                    }
                  : prev,
              )
            }
          />
        </div>
      ) : null}

      {showPriorFullPayments ? (
        <div className={cardClass}>
          <OrderPaymentsSection
            orderId={detail.id}
            token={token}
            payments={detail.payments ?? []}
            remainingBalancePrice={null}
            orderTotalPrice={null}
            mode="client"
            readOnly
            sectionTitle="Payments before layaway conversion"
            onUpdated={() => undefined}
          />
          <p className="mt-3 text-xs text-slate-500">
            Credit from confirmed payments has been applied to your layaway
            schedule below.
          </p>
        </div>
      ) : null}

      {isForPickupOrder && detail.paymentType !== "credit_line" ? (
        <div className={cardClass}>
          <h2 className="text-sm font-semibold text-slate-900">
            Order actions
          </h2>
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
          readOnly={installmentScheduleReadOnly}
          canUseVoucher={canUseInstallmentVoucher}
          voucherAmountDue={installmentVoucherDue}
          onVoucherApplied={handleVoucherApplied}
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
