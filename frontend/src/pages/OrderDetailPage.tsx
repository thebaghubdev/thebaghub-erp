import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { OrderInstallmentSchedule } from "../components/OrderInstallmentSchedule";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay } from "../lib/format-php";
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
  holdingPeriod: string | null;
  layawayPaymentStartDate: string | null;
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
    setApproveError(null);
    setApproveBusy(true);
    try {
      const res = await apiFetch(
        `/api/orders/${id}/approve-layaway`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderDetail;
      setDetail(data);
      setApproveConfirmOpen(false);
    } catch (e) {
      setApproveError(
        e instanceof Error ? e.message : "Could not approve layaway order",
      );
    } finally {
      setApproveBusy(false);
    }
  }, [id, token]);

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
              disabled={approveBusy}
              onClick={() => {
                setApproveError(null);
                setApproveConfirmOpen(true);
              }}
            >
              Approve
            </button>
            <button type="button" className={layawayDeclineBtn}>
              Decline
            </button>
            <button type="button" className={layawayUpdateTermsBtn}>
              Update terms
            </button>
          </div>
        </div>
      ) : null}

      {detail.paymentType === "layaway" &&
      detail.status === "For Payment" &&
      detail.installments.length > 0 ? (
        <OrderInstallmentSchedule
          orderId={detail.id}
          token={token}
          layawayPrice={detail.layawayPrice}
          installments={detail.installments}
          mode="staff"
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
              <DetailField label="Layaway payment start date">
                {formatOrderDate(detail.layawayPaymentStartDate)}
              </DetailField>
            </>
          )}
        </dl>
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
        description="The order status will change to For Payment and the layaway payment start date will be set to today."
        confirmLabel="Approve"
        cancelLabel="Cancel"
        busy={approveBusy}
        errorMessage={approveError}
        onCancel={() => {
          if (approveBusy) return;
          setApproveError(null);
          setApproveConfirmOpen(false);
        }}
        onConfirm={confirmApproveLayaway}
      />
    </div>
  );
}
