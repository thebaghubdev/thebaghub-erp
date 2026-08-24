import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyPageUrlButton } from "../components/CopyPageUrlButton";
import { InventoryStatusBadge } from "../components/InventoryStatusBadge";
import { OrderInstallmentSchedule } from "../components/OrderInstallmentSchedule";
import { OrderPaymentsSection } from "../components/OrderPaymentsSection";
import { computeInstallmentVoucherAmountDue } from "../components/UseVoucherDialog";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { canBypassOrderAssignment, isGeneralManagerPosition } from "../lib/employee-position";
import { formatPhpDisplay, parsePhpStringToNumber } from "../lib/format-php";
import { useFeatureAccess } from "../lib/use-feature-access";
import {
  calculateLayawayPricing,
  DEFAULT_LAYAWAY_MONTHS,
  layawayMonthlyRateLabel,
  MAX_LAYAWAY_MONTHS,
  MIN_LAYAWAY_MONTHS,
} from "../lib/layaway-pricing";
import {
  isFullPaymentLike,
  isInstallmentApprovalStatus,
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
import { computeConfirmedPaymentsTotal } from "../lib/order-payments";
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
  creditCardPrice: string | null;
  remainingBalancePrice: string | null;
  orderTotalPrice: string | null;
  reservationPaymentProofUrl: string | null;
  fullPaymentProofUrl: string | null;
  shippingFeeCareOf: string | null;
  shippingFeeProofUrl: string | null;
  pickupOption: string | null;
  pickupBranch: string | null;
  courierService: string | null;
  holdingPeriod: string | null;
  layawayPaymentStartDate: string | null;
  consignorPaymentRelease: number | null;
  convertedToLayawayAt: string | null;
  declineReason: string | null;
  signatureUrl: string | null;
  assignedToEmployeeId: string | null;
  assignedToName: string | null;
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
  payments: OrderPaymentRow[];
};

const RESERVATION_FEE = 5_000;

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

const recordActionBtn =
  "inline-flex shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-900 transition-colors hover:bg-violet-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-900/80";

const layawayApproveBtn =
  "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500";

const primaryActionBtn =
  "rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500";

const layawayDeclineBtn =
  "rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-800 shadow-sm hover:bg-red-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-900 dark:bg-slate-950 dark:text-red-200 dark:hover:bg-red-950/40";

const layawayUpdateTermsBtn =
  "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800";

function isAwaitingInstallmentApproval(status: string): boolean {
  return isInstallmentApprovalStatus(status);
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

function toLayawayAgreementDetail(detail: OrderDetail): LayawayAgreementDetail {
  const customerName =
    `${detail.customer.firstName} ${detail.customer.lastName}`.trim() ||
    detail.customer.email;
  return {
    orderNumber: detail.orderNumber,
    customer: {
      name: customerName,
      email: detail.customer.email,
      contactNumber: detail.customer.contactNumber,
      completeAddress: detail.customer.completeAddress,
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

function toOrderSalesContractDetail(detail: OrderDetail): OrderSalesContractDetail {
  const customerName =
    `${detail.customer.firstName} ${detail.customer.lastName}`.trim() ||
    detail.customer.email;
  return {
    orderNumber: detail.orderNumber,
    status: detail.status,
    paymentType: detail.paymentType,
    documentDate: detail.updatedAt,
    customer: {
      name: customerName,
      email: detail.customer.email,
      contactNumber: detail.customer.contactNumber,
      completeAddress: detail.customer.completeAddress,
    },
    inventoryItem: {
      sku: detail.inventoryItem.sku,
      itemLabel: detail.inventoryItem.itemLabel,
    },
    orderTotalPrice: detail.orderTotalPrice,
    layawayPrice: detail.layawayPrice,
    pickupOption: detail.pickupOption,
    assignedToName: detail.assignedToName,
    installments: detail.installments,
    payments: detail.payments,
    signatureUrl: detail.signatureUrl,
  };
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
  const { token, user } = usePortalAuth();
  const feature = useFeatureAccess("orders");
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
  const [forPickupModalFromPaid, setForPickupModalFromPaid] = useState(false);
  const [outForDeliveryBusy, setOutForDeliveryBusy] = useState(false);
  const [outForDeliveryError, setOutForDeliveryError] = useState<string | null>(
    null,
  );
  const [shippingFeeCareOf, setShippingFeeCareOf] = useState("");
  const [shippingFeeProofFile, setShippingFeeProofFile] = useState<File | null>(
    null,
  );
  const [pickupOption, setPickupOption] = useState("");
  const [pickupBranch, setPickupBranch] = useState("");
  const [courierService, setCourierService] = useState("");
  const [itemReceivedConfirmOpen, setItemReceivedConfirmOpen] = useState(false);
  const [itemReceivedBusy, setItemReceivedBusy] = useState(false);
  const [itemReceivedError, setItemReceivedError] = useState<string | null>(
    null,
  );
  const [printError, setPrintError] = useState<string | null>(null);
  const [convertConfirmOpen, setConvertConfirmOpen] = useState(false);
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertMonths, setConvertMonths] = useState(
    String(DEFAULT_LAYAWAY_MONTHS),
  );
  const [convertPrice, setConvertPrice] = useState("");
  const [convertConsignorPaymentRelease, setConvertConsignorPaymentRelease] =
    useState("");

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

  const handleVoucherApplied = useCallback(
    async (orderDetail?: unknown) => {
      if (orderDetail) {
        setDetail(orderDetail as OrderDetail);
      } else {
        await load();
      }
    },
    [load],
  );

  const roleCanEditOrder = useMemo(() => {
    if (!detail) return false;
    if (
      canBypassOrderAssignment(Boolean(user?.isAdmin), user?.employee?.position)
    ) {
      return true;
    }
    const assigneeId = detail.assignedToEmployeeId;
    if (assigneeId == null) return false;
    const myEmployeeId = user?.employee?.id;
    if (!myEmployeeId) return false;
    return myEmployeeId === assigneeId;
  }, [detail, user]);

  const canEditOrder = roleCanEditOrder && feature.canEdit;
  const isGeneralManager = isGeneralManagerPosition(user?.employee?.position);

  const confirmApproveLayaway = useCallback(async () => {
    if (!id || !token || !detail) return;
    const isCreditLineOrder = detail.paymentType === "credit_line";
    const consignorPaymentRelease = Number.parseInt(
      approveConsignorPaymentRelease,
      10,
    );
    if (
      !isCreditLineOrder &&
      (!Number.isFinite(consignorPaymentRelease) || consignorPaymentRelease < 1)
    ) {
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
          body: JSON.stringify(
            isCreditLineOrder ? {} : { consignorPaymentRelease },
          ),
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
        e instanceof Error
          ? e.message
          : `Could not approve ${isCreditLineOrder ? "credit line" : "layaway"} order`,
      );
    } finally {
      setApproveBusy(false);
    }
  }, [approveConsignorPaymentRelease, detail, id, token]);

  const confirmDeclineLayaway = useCallback(async () => {
    if (!id || !token) return;
    const reason = declineReason.trim();
    if (!reason) {
      setDeclineError(
        "Please enter a reason for declining this layaway order.",
      );
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
    (detail?.paymentType === "credit_line" ||
      termsConsignorPaymentRelease !== "") &&
    !termsBusy;

  const convertItemPrice = useMemo(() => {
    const raw = detail?.fullPaymentPrice ?? detail?.orderTotalPrice;
    if (raw == null) return null;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [detail?.fullPaymentPrice, detail?.orderTotalPrice]);

  const convertMonthsNumber = useMemo(() => {
    if (!/^\d+$/.test(convertMonths.trim())) return null;
    const value = Number.parseInt(convertMonths, 10);
    if (value < MIN_LAYAWAY_MONTHS || value > MAX_LAYAWAY_MONTHS) return null;
    return value;
  }, [convertMonths]);

  const convertPriceNumber = useMemo(
    () => parsePositiveMoney(convertPrice),
    [convertPrice],
  );

  const convertMonthlyPayment =
    convertMonthsNumber != null && convertPriceNumber != null
      ? (convertPriceNumber / convertMonthsNumber).toFixed(2)
      : "";

  const convertPaymentReleaseOptions = useMemo(
    () => consignorPaymentReleaseOptions(convertMonthsNumber),
    [convertMonthsNumber],
  );

  const convertConfirmedCredit = useMemo(() => {
    if (!detail) return 0;
    let credit = computeConfirmedPaymentsTotal(detail.payments ?? []);
    if (
      isReservationOrderStatus(detail.status) &&
      detail.reservationPaymentProofUrl != null
    ) {
      credit += RESERVATION_FEE;
    }
    return credit;
  }, [detail]);

  const convertRemainingBalance =
    convertPriceNumber != null
      ? Math.max(0, convertPriceNumber - convertConfirmedCredit)
      : null;

  const convertFormValid =
    convertMonthsNumber != null &&
    convertPriceNumber != null &&
    convertConsignorPaymentRelease !== "" &&
    convertRemainingBalance != null &&
    convertRemainingBalance > 0 &&
    !convertBusy;

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
    setTermsMonths(
      detail.layawayMonths != null ? String(detail.layawayMonths) : "",
    );
    setTermsPrice(normalizeMoneyInput(detail.layawayPrice));
    setTermsConsignorPaymentRelease(
      detail.consignorPaymentRelease != null
        ? String(detail.consignorPaymentRelease)
        : "",
    );
    setTermsConfirmOpen(true);
  }, [detail]);

  const openConvertToLayawayDialog = useCallback(() => {
    if (!detail) return;
    setConvertError(null);
    const months = DEFAULT_LAYAWAY_MONTHS;
    setConvertMonths(String(months));
    const itemPrice = Number.parseFloat(
      detail.fullPaymentPrice ?? detail.orderTotalPrice ?? "",
    );
    const pricing =
      Number.isFinite(itemPrice) && itemPrice > 0
        ? calculateLayawayPricing(itemPrice, months)
        : null;
    setConvertPrice(pricing != null ? pricing.layawayPrice.toFixed(2) : "");
    setConvertConsignorPaymentRelease("");
    setConvertConfirmOpen(true);
  }, [detail]);

  const confirmConvertToLayaway = useCallback(async () => {
    if (
      !id ||
      !token ||
      !detail ||
      convertMonthsNumber == null ||
      convertPriceNumber == null
    ) {
      setConvertError("Enter valid layaway months and layaway price.");
      return;
    }
    const consignorPaymentRelease = Number.parseInt(
      convertConsignorPaymentRelease,
      10,
    );
    if (
      !Number.isFinite(consignorPaymentRelease) ||
      consignorPaymentRelease < 1
    ) {
      setConvertError("Please select a consignor payment release.");
      return;
    }
    if (convertRemainingBalance != null && convertRemainingBalance <= 0) {
      setConvertError(
        "Confirmed payments already cover this layaway price. Mark the order as paid instead.",
      );
      return;
    }

    setConvertError(null);
    setConvertBusy(true);
    try {
      const res = await apiFetch(
        `/api/orders/${id}/convert-to-layaway`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            layawayMonths: convertMonthsNumber,
            layawayPrice: convertPriceNumber.toFixed(2),
            consignorPaymentRelease,
          }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderDetail;
      setDetail(data);
      setConvertConfirmOpen(false);
      setConvertConsignorPaymentRelease("");
    } catch (e) {
      setConvertError(
        e instanceof Error ? e.message : "Could not convert to layaway",
      );
    } finally {
      setConvertBusy(false);
    }
  }, [
    convertConsignorPaymentRelease,
    convertMonthsNumber,
    convertPriceNumber,
    convertRemainingBalance,
    detail,
    id,
    token,
  ]);

  const confirmUpdateLayawayTerms = useCallback(async () => {
    if (
      !id ||
      !token ||
      !detail ||
      termsMonthsNumber == null ||
      termsPriceNumber == null
    ) {
      setTermsError("Enter valid layaway months and layaway price.");
      return;
    }
    const isCreditLineOrder = detail.paymentType === "credit_line";
    const consignorPaymentRelease = Number.parseInt(
      termsConsignorPaymentRelease,
      10,
    );
    if (
      !isCreditLineOrder &&
      (!Number.isFinite(consignorPaymentRelease) || consignorPaymentRelease < 1)
    ) {
      setTermsError("Please select a consignor payment release.");
      return;
    }

    setTermsError(null);
    setTermsBusy(true);
    try {
      const body: Record<string, unknown> = {
        layawayMonths: termsMonthsNumber,
        layawayPrice: termsPriceNumber.toFixed(2),
      };
      if (!isCreditLineOrder) {
        body.consignorPaymentRelease = consignorPaymentRelease;
      }
      const res = await apiFetch(
        `/api/orders/${id}/update-layaway-terms`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
    detail,
    id,
    termsConsignorPaymentRelease,
    termsMonthsNumber,
    termsPriceNumber,
    token,
  ]);

  const openForPickupModal = useCallback(
    (fromPaid: boolean) => {
      if (!detail) return;
      setOutForDeliveryError(null);
      setShippingFeeCareOf(detail.shippingFeeCareOf ?? "");
      setShippingFeeProofFile(null);
      setPickupOption(detail.pickupOption ?? "");
      setPickupBranch(detail.pickupBranch ?? "");
      setCourierService(detail.courierService ?? "");
      setForPickupModalFromPaid(fromPaid);
      setOutForDeliveryOpen(true);
    },
    [detail],
  );

  const confirmForPickup = useCallback(async () => {
    if (!id || !token) return;
    if (!pickupOption) {
      setOutForDeliveryError("Please select a pick-up option.");
      return;
    }
    if (
      (pickupOption === "store_pickup" ||
        pickupOption === "in_store_purchase") &&
      !pickupBranch
    ) {
      setOutForDeliveryError("Please select a branch.");
      return;
    }
    if (pickupOption === "courier_delivery") {
      if (!courierService) {
        setOutForDeliveryError("Please select a courier service.");
        return;
      }
      if (!shippingFeeCareOf) {
        setOutForDeliveryError("Please select who covers the shipping fee.");
        return;
      }
      if (shippingFeeCareOf === "The Bag Hub" && !shippingFeeProofFile) {
        const hasExistingProof = Boolean(detail?.shippingFeeProofUrl);
        if (!hasExistingProof) {
          setOutForDeliveryError(
            "Please upload proof of payment for the shipping fee.",
          );
          return;
        }
      }
    }

    setOutForDeliveryError(null);
    setOutForDeliveryBusy(true);
    try {
      const fd = new FormData();
      fd.append("pickupOption", pickupOption);
      if (
        pickupOption === "store_pickup" ||
        pickupOption === "in_store_purchase"
      ) {
        fd.append("pickupBranch", pickupBranch);
      }
      if (pickupOption === "courier_delivery") {
        fd.append("courierService", courierService);
        fd.append("shippingFeeCareOf", shippingFeeCareOf);
        if (shippingFeeProofFile) {
          fd.append("proof", shippingFeeProofFile);
        }
      }
      const res = await apiFetch(
        `/api/orders/${id}/for-pick-up`,
        { method: "POST", body: fd },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderDetail;
      setDetail(data);
      setOutForDeliveryOpen(false);
      setShippingFeeCareOf("");
      setShippingFeeProofFile(null);
      setPickupOption("");
      setPickupBranch("");
      setCourierService("");
    } catch (e) {
      setOutForDeliveryError(
        e instanceof Error ? e.message : "Could not mark order as for pick-up",
      );
    } finally {
      setOutForDeliveryBusy(false);
    }
  }, [
    courierService,
    detail,
    id,
    pickupBranch,
    pickupOption,
    shippingFeeCareOf,
    shippingFeeProofFile,
    token,
  ]);

  const confirmItemReceived = useCallback(async () => {
    if (!id || !token) return;
    setItemReceivedError(null);
    setItemReceivedBusy(true);
    try {
      const res = await apiFetch(
        `/api/orders/${id}/item-received`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderDetail;
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
    convertBusy ||
    cancelBusy ||
    reservationCancelBusy ||
    outForDeliveryBusy ||
    itemReceivedBusy;
  const actionsLocked = anyActionBusy || !canEditOrder;
  const isPaidOrder = detail.status === "Paid";
  const isForPickupOrder = isForPickupOrderStatus(detail.status);
  const isCreditLineOrder = detail.paymentType === "credit_line";
  const isItemReceivedOrder = isItemReceivedOrderStatus(detail.status);
  const isPostPaymentOrder =
    isPaidOrder || isForPickupOrder || isItemReceivedOrder;
  const installmentScheduleReadOnly = isCreditLineOrder
    ? detail.status === "Item Received - Paid"
    : isPostPaymentOrder || !canEditOrder;
  const showOrderPayments =
    detail.paymentType === "full_payment" &&
    (detail.status === "For Payment" ||
      detail.status === "Reservation" ||
      isPostPaymentOrder);
  const showPriorFullPayments =
    detail.paymentType === "layaway" &&
    detail.convertedToLayawayAt != null &&
    (detail.payments?.length ?? 0) > 0;
  const showConvertToLayaway =
    detail.paymentType === "full_payment" &&
    (detail.status === "For Payment" ||
      isReservationOrderStatus(detail.status));
  const orderPaymentsReadOnly = isPostPaymentOrder || !canEditOrder;
  const showLayawaySchedule =
    isInstallmentPaymentType(detail.paymentType) &&
    detail.installments.length > 0 &&
    (isCreditLineOrder
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
  const showPrintOrderSalesContract = canPrintOrderSalesContract(
    detail.status,
    detail.inventoryItem.status,
  );

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Order
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-1">
            <h1 className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              #{detail.orderNumber}
            </h1>
            <CopyPageUrlButton
              path={`/portal/orders/${detail.id}`}
              label="Copy order URL"
            />
          </div>
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

      {feature.readOnly ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          You have view-only access to this feature.
        </p>
      ) : null}

      {!canEditOrder && !feature.readOnly ? (
        <p
          className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100"
          role="status"
        >
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200">
            View only
          </span>
          <span className="mt-2 block sm:mt-0 sm:ml-2 sm:inline">
            {detail.assignedToEmployeeId ? (
              <>
                This order is assigned to{" "}
                <span className="font-medium">
                  {detail.assignedToName ?? "a sales associate"}
                </span>
                .
              </>
            ) : (
              "This order is not assigned to a sales associate yet."
            )}{" "}
            You can review the order below, but your account cannot approve,
            cancel, upload proofs, or change installment details.
          </span>
        </p>
      ) : null}

      {printError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {printError}
        </p>
      ) : null}

      {isAwaitingInstallmentApproval(detail.status) ? (
        <div className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            {isCreditLineOrder ? "Credit line approval" : "Layaway approval"}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={layawayApproveBtn}
              disabled={actionsLocked}
              onClick={() => {
                setApproveError(null);
                setApproveConsignorPaymentRelease(
                  detail.consignorPaymentRelease != null
                    ? String(detail.consignorPaymentRelease)
                    : "",
                );
                setApproveConfirmOpen(true);
              }}
            >
              Approve
            </button>
            <button
              type="button"
              className={layawayDeclineBtn}
              disabled={actionsLocked}
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
              disabled={actionsLocked}
              onClick={openUpdateTermsDialog}
            >
              Update terms
            </button>
          </div>
          {detail.convertedToLayawayAt != null ? (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              Converted from full payment. Confirmed payments will be applied as
              credit to the layaway schedule when this order is approved or
              terms are saved.
            </p>
          ) : null}
        </div>
      ) : null}

      {isReservationOrderStatus(detail.status) ? (
        <div className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Reservation actions
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {showConvertToLayaway ? (
              <button
                type="button"
                className={primaryActionBtn}
                disabled={actionsLocked}
                onClick={openConvertToLayawayDialog}
              >
                Convert to layaway
              </button>
            ) : null}
            <button
              type="button"
              className={layawayDeclineBtn}
              disabled={actionsLocked}
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
                disabled={actionsLocked}
                onClick={() => openForPickupModal(true)}
              >
                For pick-up
              </button>
            ) : null}
            {showConvertToLayaway &&
            !isReservationOrderStatus(detail.status) ? (
              <button
                type="button"
                className={primaryActionBtn}
                disabled={actionsLocked}
                onClick={openConvertToLayawayDialog}
              >
                Convert to layaway
              </button>
            ) : null}
            {isCancellableOrderStatus(detail.status) ? (
              <button
                type="button"
                className={layawayDeclineBtn}
                disabled={actionsLocked}
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

      {isForPickupOrder ? (
        <div className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Order actions
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryActionBtn}
              disabled={actionsLocked}
              onClick={() => openForPickupModal(false)}
            >
              Edit pick-up details
            </button>
            <button
              type="button"
              className={layawayApproveBtn}
              disabled={actionsLocked}
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
          consignorPaymentRelease={
            isCreditLineOrder ? null : detail.consignorPaymentRelease
          }
          mode="staff"
          readOnly={installmentScheduleReadOnly}
          canUseVoucher={canUseInstallmentVoucher}
          voucherAmountDue={installmentVoucherDue}
          customerId={detail.customer.id}
          onVoucherApplied={handleVoucherApplied}
          onUpdated={(update) =>
            setDetail((prev) =>
              prev
                ? {
                    ...prev,
                    installments: update.installments,
                    ...(update.status != null ? { status: update.status } : {}),
                  }
                : prev,
            )
          }
          canRequestPenaltyWaive={canEditOrder}
          canDecidePenaltyWaive={isGeneralManager}
        />
      ) : null}

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Order details
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {showPrintLayawayAgreement ? (
              <button
                type="button"
                className={layawayUpdateTermsBtn}
                onClick={() => {
                  setPrintError(null);
                  void openLayawayAgreementPrintTab(
                    toLayawayAgreementDetail(detail),
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
                className={layawayUpdateTermsBtn}
                onClick={() => {
                  setPrintError(null);
                  void openOrderSalesContractPrintTab(
                    toOrderSalesContractDetail(detail),
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
            <Link
              to={`/portal/inventory/${detail.inventoryItem.id}`}
              className={recordActionBtn}
            >
              View inventory item
            </Link>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <DetailField label="Assigned to">
            {detail.assignedToName?.trim() || "—"}
          </DetailField>
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
              <DetailField label="Best price">
                {formatPhpDisplay(detail.fullPaymentTotalPrice)}
              </DetailField>
              <DetailField label="Credit card price">
                {formatPhpDisplay(detail.creditCardPrice)}
              </DetailField>
            </>
          ) : isFullPaymentLike(detail.paymentType) &&
            !isCancelledOrderStatus(detail.status) ? (
            <>
              <DetailField label="Best price">
                {formatPhpDisplay(detail.fullPaymentPrice)}
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
              <DetailField label="Layaway payment start date">
                {formatOrderDate(detail.layawayPaymentStartDate)}
              </DetailField>
              {!isCreditLineOrder && detail.consignorPaymentRelease != null ? (
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
      </div>

      {showOrderPayments ? (
        <div className={cardClass}>
          <OrderPaymentsSection
            orderId={detail.id}
            token={token}
            payments={detail.payments ?? []}
            remainingBalancePrice={detail.remainingBalancePrice}
            orderTotalPrice={detail.orderTotalPrice}
            mode="staff"
            readOnly={orderPaymentsReadOnly}
            allowMarkOrderPaid={!isPostPaymentOrder && canEditOrder}
            canUseVoucher={canUseFullPaymentVoucher}
            voucherAmountDue={fullPaymentVoucherDue}
            customerId={detail.customer.id}
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
            mode="staff"
            readOnly
            sectionTitle="Payments before layaway conversion"
            onUpdated={() => undefined}
          />
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Credit from confirmed payments has been applied to the layaway
            schedule below.
          </p>
        </div>
      ) : null}

      <div className={cardClass}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Customer
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <DetailField label="Name">{customerName}</DetailField>
          <DetailField label="Email">
            {displayOrDash(detail.customer.email)}
          </DetailField>
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
            <span className="inline-flex min-w-0 items-center gap-1">
              <span className="break-all font-mono text-sm">
                {detail.inventoryItem.sku}
              </span>
              <CopyPageUrlButton
                path={`/portal/inventory/${detail.inventoryItem.id}`}
                label="Copy item URL"
              />
            </span>
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
        title={
          isCreditLineOrder
            ? "Approve credit line order?"
            : "Approve layaway order?"
        }
        description={
          <div className="space-y-3">
            <p>
              {isCreditLineOrder
                ? "The order status will change to For pick-up and the installment schedule will begin today. The client can receive the item once staff marks it as received."
                : "The order status will change to For Payment and the layaway payment start date will be set to today."}
            </p>
            {detail?.convertedToLayawayAt != null ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100">
                Confirmed full-payment credit will be applied to the installment
                schedule when you approve.
              </p>
            ) : null}
            {!isCreditLineOrder ? (
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Consignor payment release
                </span>
                <select
                  value={approveConsignorPaymentRelease}
                  onChange={(e) =>
                    setApproveConsignorPaymentRelease(e.target.value)
                  }
                  disabled={
                    approveBusy || approvePaymentReleaseOptions.length === 0
                  }
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
            ) : null}
          </div>
        }
        confirmLabel="Approve"
        cancelLabel="Cancel"
        busy={approveBusy}
        confirmDisabled={!isCreditLineOrder && !approveConsignorPaymentRelease}
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
              {detail?.paymentType === "credit_line"
                ? "Save the revised terms and move this order to For pick-up. The installment schedule will use these values."
                : "Save the revised terms and move this order to For Payment. The installment schedule will use these values."}
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
                Allowed range: {MIN_LAYAWAY_MONTHS} to {MAX_LAYAWAY_MONTHS}{" "}
                months.
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
            {detail?.paymentType !== "credit_line" ? (
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Consignor payment release
                </span>
                <select
                  value={termsConsignorPaymentRelease}
                  onChange={(e) =>
                    setTermsConsignorPaymentRelease(e.target.value)
                  }
                  disabled={
                    termsBusy || termsPaymentReleaseOptions.length === 0
                  }
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
            ) : null}
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

      <ConfirmDialog
        open={convertConfirmOpen}
        title="Convert to layaway?"
        description={
          <div className="space-y-3">
            <p>
              This order will move to{" "}
              <span className="font-medium">For Layaway Approval</span>. After a
              staff member approves it, confirmed payments already recorded will
              be kept and applied as credit toward the layaway schedule.
            </p>
            {convertConfirmedCredit > 0 ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100">
                Confirmed payment credit to apply on approval:{" "}
                <span className="font-medium tabular-nums">
                  {formatPhpDisplay(String(convertConfirmedCredit.toFixed(2)))}
                </span>
              </p>
            ) : null}
            {convertItemPrice != null ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Suggested layaway rate:{" "}
                {layawayMonthlyRateLabel(convertItemPrice)} per month (based on
                item price).
              </p>
            ) : null}
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Layaway months
              </span>
              <input
                type="number"
                min={MIN_LAYAWAY_MONTHS}
                max={MAX_LAYAWAY_MONTHS}
                step={1}
                value={convertMonths}
                onChange={(e) => {
                  const nextMonths = e.target.value;
                  setConvertMonths(nextMonths);
                  setConvertConsignorPaymentRelease("");
                  if (convertError) setConvertError(null);
                  const parsed = Number.parseInt(nextMonths, 10);
                  if (
                    convertItemPrice != null &&
                    Number.isInteger(parsed) &&
                    parsed >= MIN_LAYAWAY_MONTHS &&
                    parsed <= MAX_LAYAWAY_MONTHS
                  ) {
                    const pricing = calculateLayawayPricing(
                      convertItemPrice,
                      parsed,
                    );
                    if (pricing != null) {
                      setConvertPrice(pricing.layawayPrice.toFixed(2));
                    }
                  }
                }}
                disabled={convertBusy}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                Allowed range: {MIN_LAYAWAY_MONTHS} to {MAX_LAYAWAY_MONTHS}{" "}
                months.
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
                value={convertPrice}
                onChange={(e) => {
                  setConvertPrice(e.target.value);
                  if (convertError) setConvertError(null);
                }}
                disabled={convertBusy}
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
                value={convertMonthlyPayment}
                readOnly
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Calculated automatically"
              />
            </label>
            {convertRemainingBalance != null ? (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Remaining layaway balance after credit:{" "}
                <span className="font-medium tabular-nums">
                  {formatPhpDisplay(convertRemainingBalance.toFixed(2))}
                </span>
              </p>
            ) : null}
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Consignor payment release
              </span>
              <select
                value={convertConsignorPaymentRelease}
                onChange={(e) =>
                  setConvertConsignorPaymentRelease(e.target.value)
                }
                disabled={
                  convertBusy || convertPaymentReleaseOptions.length === 0
                }
                className={formSelectClass}
              >
                <option value="">Select…</option>
                {convertPaymentReleaseOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
        confirmLabel="Submit for layaway approval"
        cancelLabel="Cancel"
        busy={convertBusy}
        confirmDisabled={!convertFormValid}
        errorMessage={convertError}
        onCancel={() => {
          if (convertBusy) return;
          setConvertError(null);
          setConvertConsignorPaymentRelease("");
          setConvertConfirmOpen(false);
        }}
        onConfirm={confirmConvertToLayaway}
      />

      {outForDeliveryOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal
          aria-labelledby="for-pickup-title"
          onClick={() => {
            if (!outForDeliveryBusy) setOutForDeliveryOpen(false);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="for-pickup-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              {forPickupModalFromPaid ? "For pick-up" : "Edit pick-up details"}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {forPickupModalFromPaid
                ? "Confirm or update how the client will receive this item. The order and inventory item will be marked as for pick-up. Waitlisted clients will be notified that this item is no longer available."
                : "Update how the client will receive this item. For courier delivery, set who covers the shipping fee when ready."}
            </p>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Pick-up options
                </span>
                <select
                  value={pickupOption}
                  onChange={(e) => {
                    setPickupOption(e.target.value);
                    setPickupBranch("");
                    setCourierService("");
                    setShippingFeeCareOf("");
                    setShippingFeeProofFile(null);
                    if (outForDeliveryError) setOutForDeliveryError(null);
                  }}
                  disabled={outForDeliveryBusy}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">Select…</option>
                  <option value="store_pickup">Store pick-up</option>
                  <option value="courier_delivery">Courier delivery</option>
                  <option value="in_store_purchase">In-store purchase</option>
                </select>
              </label>
              {pickupOption === "store_pickup" ||
              pickupOption === "in_store_purchase" ? (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Branch
                  </span>
                  <select
                    value={pickupBranch}
                    onChange={(e) => {
                      setPickupBranch(e.target.value);
                      if (outForDeliveryError) setOutForDeliveryError(null);
                    }}
                    disabled={outForDeliveryBusy}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">Select…</option>
                    <option value="makati">Makati</option>
                    <option value="pasig">Pasig</option>
                  </select>
                </label>
              ) : null}
              {pickupOption === "courier_delivery" ? (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Courier service
                    </span>
                    <select
                      value={courierService}
                      onChange={(e) => {
                        setCourierService(e.target.value);
                        if (outForDeliveryError) setOutForDeliveryError(null);
                      }}
                      disabled={outForDeliveryBusy}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="">Select…</option>
                      <option value="lbc">LBC</option>
                      <option value="third_party">Third-party</option>
                    </select>
                  </label>
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
                </>
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
                  setPickupOption("");
                  setPickupBranch("");
                  setCourierService("");
                  setShippingFeeCareOf("");
                  setShippingFeeProofFile(null);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  outForDeliveryBusy ||
                  !pickupOption ||
                  ((pickupOption === "store_pickup" ||
                    pickupOption === "in_store_purchase") &&
                    !pickupBranch) ||
                  (pickupOption === "courier_delivery" &&
                    (!courierService ||
                      !shippingFeeCareOf ||
                      (shippingFeeCareOf === "The Bag Hub" &&
                        !shippingFeeProofFile &&
                        !detail?.shippingFeeProofUrl)))
                }
                onClick={() => void confirmForPickup()}
                className={layawayApproveBtn}
              >
                {outForDeliveryBusy
                  ? "Saving…"
                  : forPickupModalFromPaid
                    ? "Mark for pick-up"
                    : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={itemReceivedConfirmOpen}
        title="Confirm item received?"
        description="This will mark the order as Item Received and update the inventory item to Sold under warranty."
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
