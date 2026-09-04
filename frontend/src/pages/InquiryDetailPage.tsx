import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyPageUrlButton } from "../components/CopyPageUrlButton";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { HorizontalScrollMirror } from "../components/HorizontalScrollMirror";
import { TablePaginationBar } from "../components/TablePaginationBar";
import { usePortalAuth } from "../context/portal-auth";
import { useClientPagination } from "../hooks/useClientPagination";
import { PhpPriceInput } from "../components/PhpPriceInput";
import { apiFetch } from "../lib/api";
import { InquiryStatusBadge } from "../components/InquiryStatusBadge";
import { branchLabel } from "../lib/consignment-schedule-labels";
import { openConsignmentContractPrintTab } from "../lib/consignment-contract-print";
import {
  formatClientBank,
  formatClientPaymentMethod,
} from "../lib/client-payment-preference";
import { formatOfferTransactionLabel } from "../lib/format-offer-transaction-type";
import {
  formatAuditTrailValue,
  formatPhpDisplay,
  parsePhpStringToNumber,
} from "../lib/format-php";
import { randomId } from "../lib/random-id";
import { useFeatureAccess } from "../lib/use-feature-access";
import {
  isPaymentAwaitingVerification,
  isPaymentConfirmed,
} from "../lib/payment-status";
import { orderPaymentStatusBadgeClass } from "../lib/order-payments";
import { isCeoPosition } from "../lib/employee-position";

type TransactionType = "consignment" | "direct_purchase";

type ClientOfferConfirmation = {
  paymentMethod: "check_pickup" | "cash_pickup" | "direct_deposit";
  paymentBranch: "pasig" | "makati" | null;
  bankDetails: {
    accountNumber: string;
    accountName: string;
    bank: "bdo" | "bpi" | "other";
  } | null;
  signatureUrl: string;
};

type InquiryAuditRow = {
  id: string;
  propertyName: string;
  fromValue: string | null;
  toValue: string | null;
  updatedBy: string;
  updatedAt: string;
};

type AuthenticatedReturnDetail = {
  authenticationSummary: Array<{
    metric: string;
    metricStatus: string | null;
    notes: string | null;
  }>;
  priceRangeMin: string | null;
  priceRangeMax: string | null;
  returnReasons: string | null;
  returnPhotoUrls: string[];
};

type InquiryDetail = {
  id: string;
  sku: string;
  itemLabel: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  consignorName: string;
  consignorEmail: string;
  consignorPhone: string;
  consignorAddress: string;
  brand: string;
  category: string;
  itemModel: string;
  serialNumber: string;
  condition: string;
  inclusions: string;
  consignmentSellingPrice: string;
  directPurchaseSellingPrice: string;
  consentDirectPurchase: boolean;
  consentPriceNomination: boolean;
  photoCount: number;
  offerTransactionType: TransactionType | null;
  offerPrice: string | null;
  directPurchaseRequestedPrice: string | null;
  consignmentRequestedPrice: string | null;
  directPurchaseApproverNotes: string | null;
  directPurchaseRejectReason: string | null;
  originalOfferPrice: string | null;
  contractRenewalRequestedPrice: string | null;
  repricingProofUrl: string | null;
  clientOfferConfirmation?: ClientOfferConfirmation | null;
  /** Staff-only notes persisted on the inquiry row. */
  notes: string | null;
  declineReason: string | null;
  isWalkIn: boolean;
  walkInBranch: string | null;
  contractStartDate: string | null;
  contractExpirationDate: string | null;
  pulloutFee: string | null;
  pulloutReason: string | null;
  pulloutPaymentStatus: string | null;
  pulloutPaymentProofUrl: string | null;
  assignedToEmployeeId: string | null;
  assignedToName: string | null;
  /** Present when an inventory line references this inquiry. */
  linkedInventoryItemId: string | null;
  /** Present when an inventory line references this inquiry. */
  linkedInventoryItemStatus: string | null;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
    images: Array<{ key: string; url: string }>;
  };
  authenticatedReturnDetail?: AuthenticatedReturnDetail;
  /** When status is 3rd party authentication; from inquiry row. */
  thirdPartyReauthenticationReasons: string | null;
  thirdPartyPaymentStatus: string | null;
  thirdPartyPaymentProofUrls: string[];
  thirdPartyIssuePhotoUrls: string[];
  /** Visible to consignor; from `item_authentication.reauthentication_notes`. */
  thirdPartyReauthenticationNotes: string | null;
};

/** Staff can change offer price / transaction type for these statuses only. */
function canShowUpdateOfferButton(
  status: string,
  offerTransactionType: TransactionType | null,
): boolean {
  const s = status.trim().toLowerCase();
  if (s === "authenticated_new_offer") return true;
  return (
    s === "for_offer_confirmation" && offerTransactionType !== "direct_purchase"
  );
}

function isPending(status: string): boolean {
  return status.trim().toLowerCase() === "pending";
}

function isForDirectPurchaseApproval(status: string): boolean {
  return status.trim().toLowerCase() === "for_direct_purchase_approval";
}

function hasDualApprovedOffers(detail: {
  status: string;
  offerTransactionType: TransactionType | null;
  offerPrice: string | null;
  consignmentRequestedPrice: string | null;
}): boolean {
  return (
    detail.status.trim().toLowerCase() === "for_offer_confirmation" &&
    detail.offerTransactionType === "direct_purchase" &&
    detail.consignmentRequestedPrice != null &&
    detail.consignmentRequestedPrice !== "" &&
    detail.offerPrice != null &&
    detail.offerPrice !== ""
  );
}

function isThirdPartyAuthPaymentFlowStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return (
    s === "authenticated_requested_for_reauthentication" ||
    s === "authenticated_for_3rd_party"
  );
}

function isAvailableForPurchaseStatus(
  status: string | null | undefined,
): boolean {
  return status?.trim().toLowerCase() === "available for purchase";
}

function isForContractRenewalStatus(status: string): boolean {
  return status.trim().toLowerCase() === "for_contract_renewal";
}

function isForProcessingStatus(status: string): boolean {
  return status.trim().toLowerCase() === "for_processing";
}

function isPulloutRequestedStatus(status: string): boolean {
  return status.trim().toLowerCase() === "pullout_requested";
}

function canStaffPulloutInquiry(status: string): boolean {
  return isForProcessingStatus(status) || isPulloutRequestedStatus(status);
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

function formatDatePurchased(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Calendar display for contract `YYYY-MM-DD` from API (avoids UTC/local midnight shifts). */
function formatContractDateOnly(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** Non-empty client asking price; backend uses "—" when missing. */
function meaningfulSellingPrice(v: unknown): string | null {
  const s = str(v);
  if (!s || s === "—") return null;
  return s;
}

function yesNo(v: unknown): string {
  return v === true || v === "true" ? "Yes" : "No";
}

function isAuthenticatedReturnedStatus(status: string): boolean {
  return status.trim().toLowerCase() === "authenticated_returned";
}

function isAuthenticatedNewOfferStatus(status: string): boolean {
  return status.trim().toLowerCase() === "authenticated_new_offer";
}

function authMetricVerdictLabel(v: string | null): string {
  if (v === "pass") return "Passed";
  if (v === "fail") return "Failed";
  if (v === "skip") return "Skipped";
  return "—";
}

function formatSuggestedPriceRange(ar: AuthenticatedReturnDetail): string {
  const hasMin =
    ar.priceRangeMin != null && String(ar.priceRangeMin).trim() !== "";
  const hasMax =
    ar.priceRangeMax != null && String(ar.priceRangeMax).trim() !== "";
  if (!hasMin && !hasMax) return "—";
  if (hasMin && hasMax) {
    return `${formatPhpDisplay(ar.priceRangeMin)} – ${formatPhpDisplay(ar.priceRangeMax)}`;
  }
  if (hasMin) return formatPhpDisplay(ar.priceRangeMin);
  return formatPhpDisplay(ar.priceRangeMax);
}

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

const proofPaymentDropzoneClass =
  "flex min-h-[10rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-center transition-colors hover:border-violet-400 hover:bg-violet-50/50 focus-within:outline focus-within:ring-2 focus-within:ring-violet-500 dark:border-slate-600 dark:bg-slate-900/60 dark:hover:border-violet-500 dark:hover:bg-violet-950/40 dark:focus-within:ring-violet-400";

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  if (file.type !== "") return false;
  const name = file.name.trim();
  if (!name) return false;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(name);
}

function isPdfFile(file: File): boolean {
  if (file.type === "application/pdf") return true;
  return /\.pdf$/i.test(file.name.trim());
}

function isAcceptedPulloutProofFile(file: File): boolean {
  return isImageFile(file) || isPdfFile(file);
}

type ProofPaymentPreview = { id: string; file: File; previewUrl: string };

function OfferModalAskingPrices({ detail }: { detail: InquiryDetail }) {
  const consignmentAsk = meaningfulSellingPrice(detail.consignmentSellingPrice);
  const directAsk = detail.consentDirectPurchase
    ? meaningfulSellingPrice(detail.directPurchaseSellingPrice)
    : null;
  if (!consignmentAsk && !directAsk) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950/60">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Consignor asking prices
      </p>
      <dl className="mt-2 space-y-1.5">
        {consignmentAsk ? (
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
            <dt className="text-slate-600 dark:text-slate-400">
              Consignment selling price
            </dt>
            <dd className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
              {formatPhpDisplay(consignmentAsk)}
            </dd>
          </div>
        ) : null}
        {directAsk ? (
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
            <dt className="text-slate-600 dark:text-slate-400">
              Direct purchase selling price
            </dt>
            <dd className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
              {formatPhpDisplay(directAsk)}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function InquiryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = usePortalAuth();
  const { canEdit: canEditFeature, readOnly } = useFeatureAccess("inquiries");
  const paymentVerification = useFeatureAccess("payment-verification");
  const canVerifyPayments = paymentVerification.canEdit;
  const isCeo = isCeoPosition(user?.employee?.position);
  const [detail, setDetail] = useState<InquiryDetail | null>(null);
  const canEditInquiry = Boolean(
    canEditFeature &&
      (user?.isAdmin ||
        (detail?.assignedToEmployeeId != null &&
          user?.employee?.id === detail.assignedToEmployeeId)),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [offerPriceInput, setOfferPriceInput] = useState("");
  const [dpRequestModalOpen, setDpRequestModalOpen] = useState(false);
  const [dpRequestIsEdit, setDpRequestIsEdit] = useState(false);
  const [dpPriceInput, setDpPriceInput] = useState("");
  const [dpConsignmentPriceInput, setDpConsignmentPriceInput] = useState("");
  const [dpNotesInput, setDpNotesInput] = useState("");
  const [dpRejectModalOpen, setDpRejectModalOpen] = useState(false);
  const [dpRejectReason, setDpRejectReason] = useState("");
  const [dpWithdrawConfirmOpen, setDpWithdrawConfirmOpen] = useState(false);
  const [dpApproveConfirmOpen, setDpApproveConfirmOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<
    | "decline"
    | "offer"
    | "dpRequest"
    | "dpWithdraw"
    | "dpApprove"
    | "dpReject"
    | "notes"
    | "reauthenticationNotes"
    | "createNewOffer"
    | "updateConsignmentPrice"
    | "renewContract"
    | "cancelContractRenewal"
    | "uploadThirdPartyProof"
    | "markThirdPartyPaid"
    | "pullout"
    | "verifyPullout"
    | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [declineConfirmOpen, setDeclineConfirmOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [reauthNotesModalOpen, setReauthNotesModalOpen] = useState(false);
  const [reauthNotesDraft, setReauthNotesDraft] = useState("");
  const offerModalTitleId = useId();
  const dpRequestModalTitleId = useId();
  const dpRejectModalTitleId = useId();
  const notesModalTitleId = useId();
  const reauthNotesModalTitleId = useId();
  const createNewOfferModalTitleId = useId();
  const [createNewOfferModalOpen, setCreateNewOfferModalOpen] = useState(false);
  const [createNewOfferPriceInput, setCreateNewOfferPriceInput] = useState("");
  const [repricingModalOpen, setRepricingModalOpen] = useState(false);
  const [repricingOfferPriceInput, setRepricingOfferPriceInput] = useState("");
  const [repricingProof, setRepricingProof] =
    useState<ProofPaymentPreview | null>(null);
  const [repricingProofDropActive, setRepricingProofDropActive] =
    useState(false);
  const [renewContractModalOpen, setRenewContractModalOpen] = useState(false);
  const [renewContractOfferPriceInput, setRenewContractOfferPriceInput] =
    useState("");
  const [cancelRenewContractConfirmOpen, setCancelRenewContractConfirmOpen] =
    useState(false);
  const [pulloutModalOpen, setPulloutModalOpen] = useState(false);
  const [pulloutFeeInput, setPulloutFeeInput] = useState("");
  const [pulloutReasonDraft, setPulloutReasonDraft] = useState("");
  const [pulloutProof, setPulloutProof] = useState<ProofPaymentPreview | null>(
    null,
  );
  const [pulloutProofDropActive, setPulloutProofDropActive] = useState(false);
  const pulloutModalTitleId = useId();
  const pulloutProofInputId = useId();
  const [proofPaymentModalOpen, setProofPaymentModalOpen] = useState(false);
  const [proofPaymentImages, setProofPaymentImages] = useState<
    ProofPaymentPreview[]
  >([]);
  const [proofDropActive, setProofDropActive] = useState(false);
  const [markPaidConfirmOpen, setMarkPaidConfirmOpen] = useState(false);
  const [verifyPulloutConfirmOpen, setVerifyPulloutConfirmOpen] =
    useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const moreActionsMenuRef = useRef<HTMLDivElement>(null);
  const repricingModalTitleId = useId();
  const repricingProofInputId = useId();
  const renewContractModalTitleId = useId();
  const proofPaymentInputId = useId();
  const proofPaymentModalTitleId = useId();
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRows, setAuditRows] = useState<InquiryAuditRow[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const auditPagination = useClientPagination(auditRows ?? []);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/inquiries/${id}`, {}, token);
      if (res.status === 404) {
        setError("Inquiry not found.");
        setDetail(null);
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as InquiryDetail;
      setDetail(data);
      setAuditRows(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inquiry");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadAudit = useCallback(async () => {
    if (!id || !token) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await apiFetch(`/api/inquiries/${id}/audit`, {}, token);
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as InquiryAuditRow[];
      setAuditRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setAuditError(
        e instanceof Error ? e.message : "Failed to load audit trail",
      );
      setAuditRows([]);
    } finally {
      setAuditLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    if (!auditOpen || !id) return;
    if (auditRows !== null) return;
    void loadAudit();
  }, [auditOpen, id, auditRows, loadAudit]);

  useEffect(() => {
    if (!offerModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOfferModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offerModalOpen]);

  useEffect(() => {
    if (!notesModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && actionBusy === null) setNotesModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notesModalOpen, actionBusy]);

  useEffect(() => {
    if (!reauthNotesModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && actionBusy === null)
        setReauthNotesModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reauthNotesModalOpen, actionBusy]);

  useEffect(() => {
    if (!createNewOfferModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && actionBusy === null)
        setCreateNewOfferModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createNewOfferModalOpen, actionBusy]);

  const closeRepricingModal = useCallback(() => {
    if (actionBusy === "updateConsignmentPrice") return;
    setRepricingProof((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setRepricingProofDropActive(false);
    setRepricingModalOpen(false);
  }, [actionBusy]);

  useEffect(() => {
    if (!repricingModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRepricingModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [repricingModalOpen, closeRepricingModal]);

  const closeRenewContractModal = useCallback(() => {
    if (actionBusy === "renewContract") return;
    setRenewContractModalOpen(false);
  }, [actionBusy]);

  useEffect(() => {
    if (!renewContractModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRenewContractModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [renewContractModalOpen, closeRenewContractModal]);

  const closePulloutModal = useCallback(() => {
    if (actionBusy === "pullout") return;
    setPulloutProof((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setPulloutProofDropActive(false);
    setPulloutModalOpen(false);
  }, [actionBusy]);

  useEffect(() => {
    if (!pulloutModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePulloutModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pulloutModalOpen, closePulloutModal]);

  const openPulloutModal = useCallback(() => {
    setActionError(null);
    setPulloutFeeInput("");
    setPulloutReasonDraft("");
    setPulloutProof((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setPulloutProofDropActive(false);
    setPulloutModalOpen(true);
  }, []);

  const setPulloutProofFile = useCallback((fileList: FileList | File[]) => {
    const file = Array.from(fileList).find(isAcceptedPulloutProofFile);
    if (!file) return;
    setPulloutProof((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return {
        id: randomId(),
        file,
        previewUrl: isImageFile(file) ? URL.createObjectURL(file) : "",
      };
    });
  }, []);

  const removePulloutProof = useCallback(() => {
    setPulloutProof((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!moreActionsOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = moreActionsMenuRef.current;
      if (el && !el.contains(e.target as Node)) setMoreActionsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreActionsOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [moreActionsOpen]);

  const closeProofPaymentModal = useCallback(() => {
    if (actionBusy === "uploadThirdPartyProof") return;
    setProofPaymentImages((prev) => {
      for (const p of prev) {
        URL.revokeObjectURL(p.previewUrl);
      }
      return [];
    });
    setProofDropActive(false);
    setProofPaymentModalOpen(false);
  }, [actionBusy]);

  useEffect(() => {
    if (!proofPaymentModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeProofPaymentModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [proofPaymentModalOpen, closeProofPaymentModal]);

  const addProofPaymentFiles = useCallback((fileList: FileList | File[]) => {
    const list = Array.from(fileList).filter(isImageFile);
    if (list.length === 0) return;
    setProofPaymentImages((prev) => [
      ...prev,
      ...list.map((file) => ({
        id: randomId(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }, []);

  const removeProofPaymentAt = useCallback((proofId: string) => {
    setProofPaymentImages((prev) => {
      const img = prev.find((i) => i.id === proofId);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter((i) => i.id !== proofId);
    });
  }, []);

  const openRepricingModal = useCallback(() => {
    if (!detail) return;
    setActionError(null);
    setRepricingOfferPriceInput(
      detail.offerPrice != null && detail.offerPrice !== ""
        ? (() => {
            const n = parsePhpStringToNumber(String(detail.offerPrice));
            return n != null ? n.toFixed(2) : String(detail.offerPrice);
          })()
        : "",
    );
    setRepricingProof((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setRepricingProofDropActive(false);
    setRepricingModalOpen(true);
  }, [detail]);

  const setRepricingProofFile = useCallback((fileList: FileList | File[]) => {
    const file = Array.from(fileList).find(isImageFile);
    if (!file) return;
    setRepricingProof((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return {
        id: randomId(),
        file,
        previewUrl: URL.createObjectURL(file),
      };
    });
  }, []);

  const removeRepricingProof = useCallback(() => {
    setRepricingProof((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  const openRenewContractModal = useCallback(() => {
    if (!detail) return;
    setActionError(null);
    setRenewContractOfferPriceInput(
      detail.offerPrice != null && detail.offerPrice !== ""
        ? (() => {
            const n = parsePhpStringToNumber(String(detail.offerPrice));
            return n != null ? n.toFixed(2) : String(detail.offerPrice);
          })()
        : "",
    );
    setRenewContractModalOpen(true);
  }, [detail]);

  const confirmDecline = useCallback(async () => {
    if (!canEditInquiry || !id || !token) return;
    const reason = declineReason.trim();
    if (!reason) {
      setActionError("Please enter a reason for declining this inquiry.");
      return;
    }
    setActionError(null);
    setActionBusy("decline");
    try {
      const res = await apiFetch(
        `/api/inquiries/${id}/decline`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as InquiryDetail;
      setDetail(data);
      setAuditRows(null);
      setDeclineConfirmOpen(false);
      setDeclineReason("");
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not decline inquiry",
      );
    } finally {
      setActionBusy(null);
    }
  }, [canEditInquiry, declineReason, id, token]);

  const openOfferModal = useCallback(() => {
    if (!canEditInquiry || !detail) return;
    setActionError(null);
    setOfferPriceInput(
      detail.offerPrice != null && detail.offerPrice !== ""
        ? (() => {
            const n = parsePhpStringToNumber(String(detail.offerPrice));
            return n != null ? n.toFixed(2) : String(detail.offerPrice);
          })()
        : "",
    );
    setOfferModalOpen(true);
  }, [canEditFeature, canEditInquiry, detail]);

  const submitOffer = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!canEditInquiry || !id || !token || !detail) return;
      const price = parsePhpStringToNumber(offerPriceInput);
      if (price == null || price <= 0) {
        setActionError("Enter a valid offer price greater than zero.");
        return;
      }
      setActionError(null);
      setActionBusy("offer");
      try {
        const res = await apiFetch(
          `/api/inquiries/${id}/offer`,
          {
            method: "POST",
            body: JSON.stringify({
              transactionType: "consignment",
              offerPrice: price,
            }),
          },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as InquiryDetail;
        setDetail(data);
        setAuditRows(null);
        setOfferModalOpen(false);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Could not save offer",
        );
      } finally {
        setActionBusy(null);
      }
    },
    [canEditFeature, canEditInquiry, id, token, detail, offerPriceInput],
  );

  const prefillDirectPurchasePrice = useCallback((row: InquiryDetail) => {
    if (
      row.directPurchaseRequestedPrice != null &&
      row.directPurchaseRequestedPrice !== ""
    ) {
      const n = parsePhpStringToNumber(String(row.directPurchaseRequestedPrice));
      return n != null ? n.toFixed(2) : String(row.directPurchaseRequestedPrice);
    }
    const ask = parsePhpStringToNumber(row.directPurchaseSellingPrice);
    return ask != null && ask > 0 ? ask.toFixed(2) : "";
  }, []);

  const prefillConsignmentOfferPrice = useCallback((row: InquiryDetail) => {
    if (
      row.consignmentRequestedPrice != null &&
      row.consignmentRequestedPrice !== ""
    ) {
      const n = parsePhpStringToNumber(String(row.consignmentRequestedPrice));
      return n != null ? n.toFixed(2) : String(row.consignmentRequestedPrice);
    }
    const ask = parsePhpStringToNumber(row.consignmentSellingPrice);
    return ask != null && ask > 0 ? ask.toFixed(2) : "";
  }, []);

  const openDpRequestModal = useCallback(
    (asEdit: boolean) => {
      if (!canEditInquiry || !detail) return;
      setActionError(null);
      setDpRequestIsEdit(asEdit);
      setDpPriceInput(prefillDirectPurchasePrice(detail));
      setDpConsignmentPriceInput(prefillConsignmentOfferPrice(detail));
      setDpNotesInput(detail.directPurchaseApproverNotes ?? "");
      setDpRequestModalOpen(true);
    },
    [
      canEditFeature,
      canEditInquiry,
      detail,
      prefillDirectPurchasePrice,
      prefillConsignmentOfferPrice,
    ],
  );

  const submitDpRequest = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!canEditInquiry || !id || !token || !detail) return;
      const price = parsePhpStringToNumber(dpPriceInput);
      if (price == null || price <= 0) {
        setActionError("Enter a valid offer price greater than zero.");
        return;
      }
      const consignmentPrice = parsePhpStringToNumber(dpConsignmentPriceInput);
      if (consignmentPrice == null || consignmentPrice <= 0) {
        setActionError(
          "Enter a valid consignment offer price greater than zero.",
        );
        return;
      }
      setActionError(null);
      setActionBusy("dpRequest");
      try {
        const res = await apiFetch(
          `/api/inquiries/${id}/direct-purchase-approval`,
          {
            method: dpRequestIsEdit ? "PATCH" : "POST",
            body: JSON.stringify({
              offerPrice: price,
              consignmentOfferPrice: consignmentPrice,
              notes: dpNotesInput,
            }),
          },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as InquiryDetail;
        setDetail(data);
        setAuditRows(null);
        setDpRequestModalOpen(false);
      } catch (err) {
        setActionError(
          err instanceof Error
            ? err.message
            : "Could not save direct purchase request",
        );
      } finally {
        setActionBusy(null);
      }
    },
    [
      canEditFeature,
      canEditInquiry,
      id,
      token,
      detail,
      dpPriceInput,
      dpConsignmentPriceInput,
      dpNotesInput,
      dpRequestIsEdit,
    ],
  );

  const confirmWithdrawDpRequest = useCallback(async () => {
    if (!canEditInquiry || !id || !token) return;
    setActionError(null);
    setActionBusy("dpWithdraw");
    try {
      const res = await apiFetch(
        `/api/inquiries/${id}/direct-purchase-approval/withdraw`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as InquiryDetail;
      setDetail(data);
      setAuditRows(null);
      setDpWithdrawConfirmOpen(false);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Could not withdraw direct purchase request",
      );
    } finally {
      setActionBusy(null);
    }
  }, [canEditFeature, canEditInquiry, id, token]);

  const confirmApproveDp = useCallback(async () => {
    if (!canEditFeature || !id || !token) return;
    setActionError(null);
    setActionBusy("dpApprove");
    try {
      const res = await apiFetch(
        `/api/inquiries/${id}/direct-purchase-approval/approve`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as InquiryDetail;
      setDetail(data);
      setAuditRows(null);
      setDpApproveConfirmOpen(false);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Could not approve direct purchase request",
      );
    } finally {
      setActionBusy(null);
    }
  }, [canEditFeature, id, token]);

  const submitRejectDp = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!canEditFeature || !id || !token) return;
      const reason = dpRejectReason.trim();
      if (!reason) {
        setActionError("A reject reason is required.");
        return;
      }
      setActionError(null);
      setActionBusy("dpReject");
      try {
        const res = await apiFetch(
          `/api/inquiries/${id}/direct-purchase-approval/reject`,
          {
            method: "POST",
            body: JSON.stringify({ reason }),
          },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as InquiryDetail;
        setDetail(data);
        setAuditRows(null);
        setDpRejectModalOpen(false);
        setDpRejectReason("");
      } catch (err) {
        setActionError(
          err instanceof Error
            ? err.message
            : "Could not reject direct purchase request",
        );
      } finally {
        setActionBusy(null);
      }
    },
    [canEditFeature, id, token, dpRejectReason],
  );

  const openNotesModal = useCallback(() => {
    if (!canEditInquiry || !detail) return;
    setActionError(null);
    setNotesDraft(detail.notes ?? "");
    setNotesModalOpen(true);
  }, [canEditFeature, detail]);

  const openCreateNewOfferModal = useCallback(() => {
    if (!canEditInquiry || !detail?.authenticatedReturnDetail) return;
    setActionError(null);
    setCreateNewOfferPriceInput(
      detail.offerPrice != null && detail.offerPrice !== ""
        ? (() => {
            const n = parsePhpStringToNumber(String(detail.offerPrice));
            return n != null ? n.toFixed(2) : String(detail.offerPrice);
          })()
        : "",
    );
    setCreateNewOfferModalOpen(true);
  }, [canEditFeature, detail]);

  const submitAuthenticatedReturnNewOffer = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!canEditInquiry || !id || !token || !detail?.authenticatedReturnDetail)
        return;
      const price = parsePhpStringToNumber(createNewOfferPriceInput);
      if (price == null || price <= 0) {
        setActionError("Enter a valid offer price greater than zero.");
        return;
      }
      setActionError(null);
      setActionBusy("createNewOffer");
      try {
        const res = await apiFetch(
          `/api/inquiries/${id}/authenticated-return-new-offer`,
          {
            method: "POST",
            body: JSON.stringify({ offerPrice: price }),
          },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as InquiryDetail;
        setDetail(data);
        setAuditRows(null);
        setCreateNewOfferModalOpen(false);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Could not save new offer",
        );
      } finally {
        setActionBusy(null);
      }
    },
    [id, token, detail, createNewOfferPriceInput],
  );

  const submitConsignmentPriceUpdate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!id || !token || !detail) return;
      const price = parsePhpStringToNumber(repricingOfferPriceInput);
      if (price == null || price <= 0) {
        setActionError("Enter a valid new offer price greater than zero.");
        return;
      }
      if (!repricingProof) {
        setActionError("Upload proof of consignor agreement.");
        return;
      }
      setActionError(null);
      setActionBusy("updateConsignmentPrice");
      try {
        const fd = new FormData();
        fd.append("offerPrice", price.toFixed(2));
        fd.append("proof", repricingProof.file);
        const res = await apiFetch(
          `/api/inquiries/${id}/consignment-price`,
          { method: "POST", body: fd },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as InquiryDetail;
        setDetail(data);
        setAuditRows(null);
        setRepricingProof((prev) => {
          if (prev) URL.revokeObjectURL(prev.previewUrl);
          return null;
        });
        setRepricingProofDropActive(false);
        setRepricingModalOpen(false);
      } catch (err) {
        setActionError(
          err instanceof Error
            ? err.message
            : "Could not update consignment price",
        );
      } finally {
        setActionBusy(null);
      }
    },
    [
      id,
      token,
      detail,
      repricingOfferPriceInput,
      repricingProof,
      closeRepricingModal,
    ],
  );

  const submitContractRenewal = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!id || !token || !detail) return;
      const price = parsePhpStringToNumber(renewContractOfferPriceInput);
      if (price == null || price <= 0) {
        setActionError("Enter a valid new offer price greater than zero.");
        return;
      }
      setActionError(null);
      setActionBusy("renewContract");
      try {
        const res = await apiFetch(
          `/api/inquiries/${id}/contract-renewal`,
          {
            method: "POST",
            body: JSON.stringify({ offerPrice: price }),
          },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as InquiryDetail;
        setDetail(data);
        setAuditRows(null);
        setRenewContractModalOpen(false);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Could not renew contract",
        );
      } finally {
        setActionBusy(null);
      }
    },
    [id, token, detail, renewContractOfferPriceInput],
  );

  const confirmCancelContractRenewal = useCallback(async () => {
    if (!id || !token) return;
    setActionError(null);
    setActionBusy("cancelContractRenewal");
    try {
      const res = await apiFetch(
        `/api/inquiries/${id}/contract-renewal/cancel`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as InquiryDetail;
      setDetail(data);
      setAuditRows(null);
      setCancelRenewContractConfirmOpen(false);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Could not cancel contract renewal",
      );
    } finally {
      setActionBusy(null);
    }
  }, [id, token]);

  const saveNotes = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!id || !token) return;
      setActionError(null);
      setActionBusy("notes");
      try {
        const res = await apiFetch(
          `/api/inquiries/${id}/notes`,
          {
            method: "PATCH",
            body: JSON.stringify({ notes: notesDraft }),
          },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as InquiryDetail;
        setDetail(data);
        setAuditRows(null);
        setNotesModalOpen(false);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Could not save notes",
        );
      } finally {
        setActionBusy(null);
      }
    },
    [id, token, notesDraft],
  );

  const openReauthNotesModal = useCallback(() => {
    if (!detail) return;
    setActionError(null);
    setReauthNotesDraft(detail.thirdPartyReauthenticationNotes ?? "");
    setReauthNotesModalOpen(true);
  }, [detail]);

  const saveReauthenticationNotes = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!id || !token) return;
      setActionError(null);
      setActionBusy("reauthenticationNotes");
      try {
        const res = await apiFetch(
          `/api/inquiries/${id}/reauthentication-notes`,
          {
            method: "PATCH",
            body: JSON.stringify({ notes: reauthNotesDraft }),
          },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as InquiryDetail;
        setDetail(data);
        setAuditRows(null);
        setReauthNotesModalOpen(false);
      } catch (err) {
        setActionError(
          err instanceof Error
            ? err.message
            : "Could not save reauthentication notes",
        );
      } finally {
        setActionBusy(null);
      }
    },
    [id, token, reauthNotesDraft],
  );

  const saveThirdPartyPaymentProof = useCallback(async () => {
    if (!id || !token || proofPaymentImages.length === 0) return;
    setActionError(null);
    setActionBusy("uploadThirdPartyProof");
    try {
      const fd = new FormData();
      for (const p of proofPaymentImages) {
        fd.append("photos", p.file);
      }
      const res = await apiFetch(
        `/api/inquiries/${id}/third-party-payment-proof`,
        { method: "POST", body: fd },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as InquiryDetail;
      setDetail(data);
      closeProofPaymentModal();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Could not upload proof of payment",
      );
    } finally {
      setActionBusy(null);
    }
  }, [id, token, proofPaymentImages, closeProofPaymentModal]);

  const confirmMarkThirdPartyPaid = useCallback(async () => {
    if (!id || !token) return;
    setActionError(null);
    setActionBusy("markThirdPartyPaid");
    try {
      const res = await apiFetch(
        `/api/inquiries/${id}/third-party-payment-paid`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as InquiryDetail;
      setDetail(data);
      setMarkPaidConfirmOpen(false);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Could not mark as paid for 3rd party authentication",
      );
    } finally {
      setActionBusy(null);
    }
  }, [id, token]);

  const confirmVerifyPullout = useCallback(async () => {
    if (!id || !token) return;
    setActionError(null);
    setActionBusy("verifyPullout");
    try {
      const res = await apiFetch(
        `/api/inquiries/${id}/pullout-payment-verify`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as InquiryDetail;
      setDetail(data);
      setVerifyPulloutConfirmOpen(false);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Could not verify pullout payment",
      );
    } finally {
      setActionBusy(null);
    }
  }, [id, token]);

  const submitPullout = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!id || !token) return;
      const fee = parsePhpStringToNumber(pulloutFeeInput);
      if (fee == null || fee < 0) {
        setActionError("Enter a valid pullout fee.");
        return;
      }
      const reason = pulloutReasonDraft.trim();
      if (!reason) {
        setActionError("Enter a reason for pullout.");
        return;
      }
      if (fee > 0 && !pulloutProof) {
        setActionError("Upload proof of payment when a pullout fee is charged.");
        return;
      }
      setActionError(null);
      setActionBusy("pullout");
      try {
        const fd = new FormData();
        fd.append("pulloutFee", fee.toFixed(2));
        fd.append("pulloutReason", reason);
        if (pulloutProof) {
          fd.append("proof", pulloutProof.file);
        }
        const res = await apiFetch(
          `/api/inquiries/${id}/pullout`,
          { method: "POST", body: fd },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as InquiryDetail;
        setDetail(data);
        setAuditRows(null);
        setPulloutProof((prev) => {
          if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
          return null;
        });
        setPulloutProofDropActive(false);
        setPulloutModalOpen(false);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Could not save pullout",
        );
      } finally {
        setActionBusy(null);
      }
    },
    [id, token, pulloutFeeInput, pulloutReasonDraft, pulloutProof],
  );

  const form = detail?.itemSnapshot.form ?? {};
  const showThirdPartyActions =
    detail != null &&
    isThirdPartyAuthPaymentFlowStatus(detail.status) &&
    detail.linkedInventoryItemId != null;
  const showAvailableForPurchaseActions =
    detail != null &&
    isAvailableForPurchaseStatus(detail.linkedInventoryItemStatus);
  const showContractRenewalActions =
    detail != null && isForContractRenewalStatus(detail.status);
  const showPulloutAction =
    detail != null &&
    canStaffPulloutInquiry(detail.status) &&
    !isPaymentAwaitingVerification(detail.pulloutPaymentStatus) &&
    !isPaymentConfirmed(detail.pulloutPaymentStatus);
  const showPulloutVerify =
    detail != null &&
    isPaymentAwaitingVerification(detail.pulloutPaymentStatus);
  const showThirdPartyVerify =
    detail != null &&
    isThirdPartyAuthPaymentFlowStatus(detail.status) &&
    detail.status.trim().toLowerCase() ===
      "authenticated_requested_for_reauthentication" &&
    isPaymentAwaitingVerification(detail.thirdPartyPaymentStatus) &&
    detail.thirdPartyPaymentProofUrls.length > 0;
  const showPrintContractAction =
    detail != null &&
    isForProcessingStatus(detail.status) &&
    detail.contractStartDate != null &&
    detail.contractStartDate.trim() !== "";
  const showMoreActions =
    (canEditInquiry &&
      (showThirdPartyActions ||
        showAvailableForPurchaseActions ||
        showContractRenewalActions ||
        showPulloutAction)) ||
    (canVerifyPayments && (showThirdPartyVerify || showPulloutVerify)) ||
    showPrintContractAction;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/portal/inquiries"
          className="text-sm font-medium text-violet-700 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100"
        >
          ← Back to inquiries
        </Link>
      </div>

      {readOnly ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          You have view-only access to this feature.
        </p>
      ) : null}

      {!canEditInquiry &&
      !readOnly &&
      !canVerifyPayments &&
      !isCeo &&
      detail ? (
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
                This inquiry is assigned to{" "}
                <span className="font-medium">
                  {detail.assignedToName ?? "a coordinator"}
                </span>
                .
              </>
            ) : (
              "This inquiry is not assigned to a coordinator yet."
            )}
          </span>
        </p>
      ) : null}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      {actionError &&
      !offerModalOpen &&
      !dpRequestModalOpen &&
      !dpRejectModalOpen &&
      !dpWithdrawConfirmOpen &&
      !dpApproveConfirmOpen &&
      !declineConfirmOpen &&
      !notesModalOpen &&
      !reauthNotesModalOpen &&
      !createNewOfferModalOpen &&
      !repricingModalOpen &&
      !renewContractModalOpen &&
      !pulloutModalOpen &&
      !cancelRenewContractConfirmOpen ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {actionError}
        </p>
      ) : null}

      {loading && (
        <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>
      )}

      {!loading && detail && (
        <>
          <div className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <h1 className="min-w-0 break-all text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {detail.sku}
                </h1>
                <CopyPageUrlButton
                  path={`/portal/inquiries/${detail.id}`}
                  label="Copy inquiry URL"
                />
              </div>
              <InquiryStatusBadge status={detail.status} />
            </div>
            {detail.itemLabel && detail.itemLabel !== "Item" ? (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {detail.itemLabel}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Assigned to:{" "}
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {detail.assignedToName?.trim() || "—"}
              </span>
            </p>

            {detail.declineReason?.trim() ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50/80 p-3 text-sm dark:border-red-900/50 dark:bg-red-950/30">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-red-900 dark:text-red-200">
                  Decline reason
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                  {detail.declineReason.trim()}
                </p>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {canEditInquiry ? (
              <button
                type="button"
                disabled={actionBusy !== null}
                onClick={openNotesModal}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {actionBusy === "notes" ? "Saving…" : "Update Notes"}
              </button>
              ) : null}
              {detail.linkedInventoryItemId ? (
                <Link
                  to={`/portal/inventory/${detail.linkedInventoryItemId}`}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  View in Inventory
                </Link>
              ) : null}
              {canEditInquiry &&
              isAuthenticatedReturnedStatus(detail.status) &&
              detail.authenticatedReturnDetail ? (
                <button
                  type="button"
                  disabled={actionBusy !== null}
                  onClick={openCreateNewOfferModal}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  Create New Offer
                </button>
              ) : null}
              {canEditInquiry &&
              isPending(detail.status) ? (
                <button
                  type="button"
                  disabled={actionBusy !== null}
                  onClick={() => {
                    setActionError(null);
                    setDeclineReason("");
                    setDeclineConfirmOpen(true);
                  }}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-800 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-slate-950 dark:text-red-200 dark:hover:bg-red-950/40"
                >
                  {actionBusy === "decline" ? "Declining…" : "Decline"}
                </button>
              ) : null}
              {canEditInquiry &&
              isPending(detail.status) ? (
                <button
                  type="button"
                  disabled={actionBusy !== null}
                  onClick={openOfferModal}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                >
                  Create Consignment Offer
                </button>
              ) : null}
              {canEditInquiry &&
              isPending(detail.status) &&
              detail.consentDirectPurchase ? (
                <button
                  type="button"
                  disabled={actionBusy !== null}
                  onClick={() => openDpRequestModal(false)}
                  className="rounded-lg bg-fuchsia-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-fuchsia-800 disabled:opacity-50 dark:bg-fuchsia-600 dark:hover:bg-fuchsia-500"
                >
                  Request Direct Purchase Approval
                </button>
              ) : null}
              {canEditInquiry &&
              isForDirectPurchaseApproval(detail.status) &&
              !isCeo ? (
                <>
                  <button
                    type="button"
                    disabled={actionBusy !== null}
                    onClick={() => openDpRequestModal(true)}
                    className="rounded-lg bg-fuchsia-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-fuchsia-800 disabled:opacity-50 dark:bg-fuchsia-600 dark:hover:bg-fuchsia-500"
                  >
                    Edit Direct Purchase Request
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy !== null}
                    onClick={() => {
                      setActionError(null);
                      setDpWithdrawConfirmOpen(true);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Withdraw Request
                  </button>
                </>
              ) : null}
              {canEditFeature &&
              isForDirectPurchaseApproval(detail.status) &&
              isCeo ? (
                <>
                  <button
                    type="button"
                    disabled={actionBusy !== null}
                    onClick={() => {
                      setActionError(null);
                      setDpApproveConfirmOpen(true);
                    }}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy !== null}
                    onClick={() => {
                      setActionError(null);
                      setDpRejectReason("");
                      setDpRejectModalOpen(true);
                    }}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-800 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-slate-950 dark:text-red-200 dark:hover:bg-red-950/40"
                  >
                    Reject
                  </button>
                </>
              ) : null}
              {canEditInquiry &&
              canShowUpdateOfferButton(
                detail.status,
                detail.offerTransactionType,
              ) ? (
                <button
                  type="button"
                  disabled={actionBusy !== null}
                  onClick={openOfferModal}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                >
                  Update the offer
                </button>
              ) : null}
              {showMoreActions ? (
                <div className="relative" ref={moreActionsMenuRef}>
                  <button
                    type="button"
                    disabled={actionBusy !== null}
                    aria-expanded={moreActionsOpen}
                    aria-haspopup="menu"
                    onClick={() => {
                      setMoreActionsOpen((v) => !v);
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    More actions
                    <svg
                      className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                        moreActionsOpen ? "rotate-180" : ""
                      }`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <path
                        d="M6 9l6 6 6-6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {moreActionsOpen ? (
                    <ul
                      role="menu"
                      className="absolute right-0 top-full z-50 mt-1 min-w-[16rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
                    >
                      {canEditInquiry && showAvailableForPurchaseActions ? (
                        <>
                          <li role="none">
                            <button
                              type="button"
                              role="menuitem"
                              disabled={actionBusy !== null}
                              onClick={() => {
                                setActionError(null);
                                setMoreActionsOpen(false);
                                openRepricingModal();
                              }}
                              className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800"
                            >
                              Update consignment price
                            </button>
                          </li>
                          <li role="none">
                            <button
                              type="button"
                              role="menuitem"
                              disabled={actionBusy !== null}
                              onClick={() => {
                                setActionError(null);
                                setMoreActionsOpen(false);
                                openRenewContractModal();
                              }}
                              className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800"
                            >
                              Renew contract
                            </button>
                          </li>
                        </>
                      ) : null}
                      {canEditInquiry && showContractRenewalActions ? (
                        <li role="none">
                          <button
                            type="button"
                            role="menuitem"
                            disabled={actionBusy !== null}
                            onClick={() => {
                              setActionError(null);
                              setMoreActionsOpen(false);
                              setCancelRenewContractConfirmOpen(true);
                            }}
                            className="flex w-full items-center px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
                          >
                            Cancel contract renewal
                          </button>
                        </li>
                      ) : null}
                      {canEditInquiry &&
                      showThirdPartyActions &&
                      detail.status.trim().toLowerCase() ===
                        "authenticated_requested_for_reauthentication" ? (
                        <li role="none">
                          <button
                            type="button"
                            role="menuitem"
                            disabled={actionBusy !== null}
                            onClick={() => {
                              setActionError(null);
                              setMoreActionsOpen(false);
                              setProofPaymentModalOpen(true);
                            }}
                            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            Upload proof of payment
                          </button>
                        </li>
                      ) : null}
                      {canVerifyPayments && showThirdPartyVerify ? (
                        <li role="none">
                          <button
                            type="button"
                            role="menuitem"
                            disabled={actionBusy !== null}
                            onClick={() => {
                              setActionError(null);
                              setMoreActionsOpen(false);
                              setMarkPaidConfirmOpen(true);
                            }}
                            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            Verify authentication fee
                          </button>
                        </li>
                      ) : null}
                      {canEditInquiry && showThirdPartyActions ? (
                        <li role="none">
                          <button
                            type="button"
                            role="menuitem"
                            disabled={actionBusy !== null}
                            onClick={() => {
                              setActionError(null);
                              setMoreActionsOpen(false);
                              openReauthNotesModal();
                            }}
                            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            Update reauthentication notes
                          </button>
                        </li>
                      ) : null}
                      {showPrintContractAction ? (
                        <li role="none">
                          <button
                            type="button"
                            role="menuitem"
                            disabled={actionBusy !== null}
                            onClick={() => {
                              setMoreActionsOpen(false);
                              setActionError(null);
                              void openConsignmentContractPrintTab(
                                detail,
                              ).catch((err) => {
                                setActionError(
                                  err instanceof Error
                                    ? err.message
                                    : "Could not open print contract",
                                );
                              });
                            }}
                            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            Print Contract
                          </button>
                        </li>
                      ) : null}
                      {canVerifyPayments && showPulloutVerify ? (
                        <li role="none">
                          <button
                            type="button"
                            role="menuitem"
                            disabled={actionBusy !== null}
                            onClick={() => {
                              setActionError(null);
                              setMoreActionsOpen(false);
                              setVerifyPulloutConfirmOpen(true);
                            }}
                            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            Verify pullout fee
                          </button>
                        </li>
                      ) : null}
                      {canEditInquiry && showPulloutAction ? (
                        <li role="none">
                          <button
                            type="button"
                            role="menuitem"
                            disabled={actionBusy !== null}
                            onClick={() => {
                              setActionError(null);
                              setMoreActionsOpen(false);
                              openPulloutModal();
                            }}
                            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            {actionBusy === "pullout"
                              ? "Saving pullout…"
                              : "Pullout"}
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Staff notes
              </h3>
              {detail.notes != null && detail.notes !== "" ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">
                  {detail.notes}
                </p>
              ) : (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  -
                </p>
              )}
            </div>

            {detail.directPurchaseRequestedPrice != null ||
            detail.consignmentRequestedPrice != null ||
            detail.directPurchaseApproverNotes != null ||
            detail.directPurchaseRejectReason != null ? (
              <div className="mt-4 rounded-lg border border-fuchsia-200 bg-fuchsia-50/80 p-3 text-sm dark:border-fuchsia-900/50 dark:bg-fuchsia-950/30">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fuchsia-900 dark:text-fuchsia-200">
                  Direct purchase approval
                </h3>
                <dl className="mt-2 space-y-2 text-slate-800 dark:text-slate-200">
                  {detail.directPurchaseRequestedPrice != null &&
                  detail.directPurchaseRequestedPrice !== "" ? (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Direct purchase offer price
                      </dt>
                      <dd className="tabular-nums font-medium">
                        {formatPhpDisplay(detail.directPurchaseRequestedPrice)}
                      </dd>
                    </div>
                  ) : null}
                  {detail.consignmentRequestedPrice != null &&
                  detail.consignmentRequestedPrice !== "" ? (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Consignment offer price
                      </dt>
                      <dd className="tabular-nums font-medium">
                        {formatPhpDisplay(detail.consignmentRequestedPrice)}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">
                      Notes for approver
                    </dt>
                    <dd className="whitespace-pre-wrap">
                      {detail.directPurchaseApproverNotes != null &&
                      detail.directPurchaseApproverNotes !== ""
                        ? detail.directPurchaseApproverNotes
                        : "—"}
                    </dd>
                  </div>
                  {detail.directPurchaseRejectReason != null &&
                  detail.directPurchaseRejectReason !== "" ? (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Reject reason
                      </dt>
                      <dd className="whitespace-pre-wrap">
                        {detail.directPurchaseRejectReason}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ) : null}

            {detail.offerPrice != null && detail.offerPrice !== "" ? (
              <dl className="mt-4 rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {hasDualApprovedOffers(detail) ? (
                    <>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          Direct purchase offer
                        </dt>
                        <dd className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                          {formatPhpDisplay(detail.offerPrice)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          Consignment offer
                        </dt>
                        <dd className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                          {formatPhpDisplay(detail.consignmentRequestedPrice)}
                        </dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          Offer transaction
                        </dt>
                        <dd className="font-medium text-slate-900 dark:text-slate-100">
                          {formatOfferTransactionLabel(
                            detail.offerTransactionType,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          Offer price
                        </dt>
                        <dd className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                          {formatPhpDisplay(detail.offerPrice)}
                        </dd>
                      </div>
                    </>
                  )}
                  {detail.originalOfferPrice ? (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Original offer price
                      </dt>
                      <dd className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                        {formatPhpDisplay(detail.originalOfferPrice)}
                      </dd>
                    </div>
                  ) : null}
                  {detail.contractRenewalRequestedPrice ? (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Renewal requested price
                      </dt>
                      <dd className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                        {formatPhpDisplay(detail.contractRenewalRequestedPrice)}
                      </dd>
                    </div>
                  ) : null}
                  {detail.repricingProofUrl ? (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Repricing proof
                      </dt>
                      <dd>
                        <a
                          href={detail.repricingProofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-violet-700 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100"
                        >
                          View proof
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </div>
              </dl>
            ) : null}

            {detail.clientOfferConfirmation ? (
              <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/80 p-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                  Client confirmed offer
                </h3>
                <dl className="mt-2 space-y-2 text-slate-800 dark:text-slate-200">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">
                      Preferred payment method
                    </dt>
                    <dd className="font-medium">
                      {formatClientPaymentMethod(
                        detail.clientOfferConfirmation.paymentMethod,
                      )}
                    </dd>
                  </div>
                  {detail.clientOfferConfirmation.paymentMethod ===
                    "direct_deposit" &&
                  detail.clientOfferConfirmation.bankDetails ? (
                    <>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          Bank
                        </dt>
                        <dd>
                          {formatClientBank(
                            detail.clientOfferConfirmation.bankDetails.bank,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          Account name
                        </dt>
                        <dd>
                          {
                            detail.clientOfferConfirmation.bankDetails
                              .accountName
                          }
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          Account number
                        </dt>
                        <dd className="font-mono text-xs">
                          {
                            detail.clientOfferConfirmation.bankDetails
                              .accountNumber
                          }
                        </dd>
                      </div>
                    </>
                  ) : null}
                  {detail.clientOfferConfirmation.paymentMethod !==
                    "direct_deposit" &&
                  detail.clientOfferConfirmation.paymentBranch ? (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Pickup branch
                      </dt>
                      <dd>
                        {branchLabel(
                          detail.clientOfferConfirmation.paymentBranch,
                        )}
                      </dd>
                    </div>
                  ) : null}
                  {detail.clientOfferConfirmation.signatureUrl ? (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Signature
                      </dt>
                      <dd className="mt-1">
                        <img
                          src={detail.clientOfferConfirmation.signatureUrl}
                          alt="Client signature"
                          className="max-h-36 max-w-full rounded border border-slate-200 bg-white object-contain dark:border-slate-600 dark:bg-slate-950"
                          loading="lazy"
                        />
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ) : null}

            {isThirdPartyAuthPaymentFlowStatus(detail.status) ? (
              <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/80 p-3 text-sm dark:border-sky-900/50 dark:bg-sky-950/25">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-200">
                  Requested for reauthentication
                </h3>
                <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                  Reauthentication reasons
                </p>
                {detail.thirdPartyReauthenticationReasons != null &&
                detail.thirdPartyReauthenticationReasons.trim() !== "" ? (
                  <p className="mt-2 whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                    {detail.thirdPartyReauthenticationReasons}
                  </p>
                ) : (
                  <p className="mt-2 text-slate-500 dark:text-slate-400">—</p>
                )}
                <p className="mt-4 text-xs font-medium text-slate-600 dark:text-slate-400">
                  Notes
                </p>
                {detail.thirdPartyReauthenticationNotes != null &&
                detail.thirdPartyReauthenticationNotes.trim() !== "" ? (
                  <p className="mt-2 whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                    {detail.thirdPartyReauthenticationNotes}
                  </p>
                ) : (
                  <p className="mt-2 text-slate-500 dark:text-slate-400">—</p>
                )}
                {detail.thirdPartyIssuePhotoUrls.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Issue photos
                    </p>
                    <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {detail.thirdPartyIssuePhotoUrls.map((url, i) => (
                        <li
                          key={`${url}-${i}`}
                          className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                        >
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={url}
                              alt={`Issue ${i + 1}`}
                              className="aspect-square w-full object-cover"
                              loading="lazy"
                            />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="mt-4 text-xs font-medium text-slate-600 dark:text-slate-400">
                  Proof of payment
                </p>
                {detail.thirdPartyPaymentStatus ? (
                  <p className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={orderPaymentStatusBadgeClass(
                        detail.thirdPartyPaymentStatus,
                      )}
                    >
                      {detail.thirdPartyPaymentStatus}
                    </span>
                    {canVerifyPayments && showThirdPartyVerify ? (
                      <button
                        type="button"
                        disabled={actionBusy !== null}
                        onClick={() => {
                          setActionError(null);
                          setMarkPaidConfirmOpen(true);
                        }}
                        className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-900/80"
                      >
                        Verify payment
                      </button>
                    ) : null}
                  </p>
                ) : null}
                {detail.thirdPartyPaymentProofUrls.length > 0 ? (
                  <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {detail.thirdPartyPaymentProofUrls.map((url, i) => (
                      <li
                        key={`${url}-${i}`}
                        className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                      >
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={url}
                            alt={`Proof of payment ${i + 1}`}
                            className="aspect-square w-full object-cover"
                            loading="lazy"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-slate-500 dark:text-slate-400">—</p>
                )}
              </div>
            ) : null}

            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Submitted
                </dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  <SubmittedAtCell iso={detail.createdAt} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Last updated
                </dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  <SubmittedAtCell iso={detail.updatedAt} />
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500 dark:text-slate-400">
                  Walk-in consignment
                </dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  {yesNo(detail.isWalkIn)}
                </dd>
              </div>
              {detail.isWalkIn ? (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500 dark:text-slate-400">
                    Receiving branch
                  </dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {detail.walkInBranch?.trim() ? detail.walkInBranch : "—"}
                  </dd>
                </div>
              ) : null}
              {detail.contractStartDate ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Contract date
                  </dt>
                  <dd className="tabular-nums text-slate-900 dark:text-slate-100">
                    {formatContractDateOnly(detail.contractStartDate)}
                  </dd>
                </div>
              ) : null}
              {detail.contractExpirationDate ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Contract expiration
                  </dt>
                  <dd className="tabular-nums text-slate-900 dark:text-slate-100">
                    {formatContractDateOnly(detail.contractExpirationDate)}
                  </dd>
                </div>
              ) : null}
              {detail.pulloutFee != null ||
              detail.pulloutReason ||
              detail.pulloutPaymentProofUrl ? (
                <>
                  {detail.pulloutFee != null ? (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Pullout fee
                      </dt>
                      <dd className="tabular-nums text-slate-900 dark:text-slate-100">
                        {formatPhpDisplay(detail.pulloutFee)}
                      </dd>
                    </div>
                  ) : null}
                  {detail.pulloutPaymentStatus ? (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Pullout payment
                      </dt>
                      <dd>
                        <span
                          className={orderPaymentStatusBadgeClass(
                            detail.pulloutPaymentStatus,
                          )}
                        >
                          {detail.pulloutPaymentStatus}
                        </span>
                        {canVerifyPayments && showPulloutVerify ? (
                          <button
                            type="button"
                            disabled={actionBusy !== null}
                            onClick={() => {
                              setActionError(null);
                              setVerifyPulloutConfirmOpen(true);
                            }}
                            className="ml-2 inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-900/80"
                          >
                            Verify payment
                          </button>
                        ) : null}
                      </dd>
                    </div>
                  ) : null}
                  {detail.pulloutPaymentProofUrl ? (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Pullout fee proof
                      </dt>
                      <dd>
                        <a
                          href={detail.pulloutPaymentProofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-violet-700 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100"
                        >
                          View proof
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  {detail.pulloutReason ? (
                    <div className="sm:col-span-2">
                      <dt className="text-slate-500 dark:text-slate-400">
                        Pullout reason
                      </dt>
                      <dd className="whitespace-pre-wrap text-slate-900 dark:text-slate-100">
                        {detail.pulloutReason}
                      </dd>
                    </div>
                  ) : null}
                </>
              ) : null}
            </dl>

            {(isAuthenticatedReturnedStatus(detail.status) ||
              isAuthenticatedNewOfferStatus(detail.status)) &&
            detail.authenticatedReturnDetail ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm dark:border-amber-900/50 dark:bg-amber-950/25">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                  Authentication return
                </h3>
                <div className="mt-3 space-y-4 text-slate-800 dark:text-slate-200">
                  <div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Authentication result summary
                    </p>
                    {detail.authenticatedReturnDetail.authenticationSummary
                      .length === 0 ? (
                      <p className="mt-1 text-slate-600 dark:text-slate-400">
                        No metric checklist entries with pass, fail, skip, or
                        notes.
                      </p>
                    ) : (
                      <ul className="mt-2 list-outside list-disc space-y-2 pl-5">
                        {detail.authenticatedReturnDetail.authenticationSummary.map(
                          (row, idx) => (
                            <li key={`${row.metric}-${idx}`} className="pl-1">
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {row.metric}
                              </span>
                              <span className="text-slate-600 dark:text-slate-400">
                                {": "}
                              </span>
                              {row.metricStatus != null ? (
                                <span
                                  className={
                                    row.metricStatus === "pass"
                                      ? "font-semibold text-emerald-700 dark:text-emerald-400"
                                      : row.metricStatus === "fail"
                                        ? "font-semibold text-red-700 dark:text-red-400"
                                        : "font-medium text-slate-800 dark:text-slate-200"
                                  }
                                >
                                  {authMetricVerdictLabel(row.metricStatus)}
                                </span>
                              ) : null}
                              {row.metricStatus != null && row.notes ? (
                                <span className="text-slate-500 dark:text-slate-400">
                                  {", "}
                                </span>
                              ) : null}
                              {row.notes ? (
                                <span className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                                  {row.notes}
                                </span>
                              ) : null}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Suggested price range
                    </p>
                    <p className="mt-1 tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {formatSuggestedPriceRange(
                        detail.authenticatedReturnDetail,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Reasons for renegotiation
                    </p>
                    {detail.authenticatedReturnDetail.returnReasons ? (
                      <p className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                        {detail.authenticatedReturnDetail.returnReasons}
                      </p>
                    ) : (
                      <p className="mt-1 text-slate-500 dark:text-slate-400">
                        —
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Flaw photos
                    </p>
                    {detail.authenticatedReturnDetail.returnPhotoUrls.length ===
                    0 ? (
                      <p className="mt-1 text-slate-500 dark:text-slate-400">
                        —
                      </p>
                    ) : (
                      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {detail.authenticatedReturnDetail.returnPhotoUrls.map(
                          (url, i) => (
                            <li
                              key={`${url}-${i}`}
                              className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900"
                            >
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <img
                                  src={url}
                                  alt={`Flaw photo ${i + 1}`}
                                  className="h-32 w-full object-cover"
                                  loading="lazy"
                                />
                              </a>
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Consignor
            </h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Name</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">
                  {detail.consignorName}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                <dd className="break-all text-slate-800 dark:text-slate-200">
                  {detail.consignorEmail}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Phone</dt>
                <dd className="text-slate-800 dark:text-slate-200">
                  {detail.consignorPhone}
                </dd>
              </div>
            </dl>
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Item details
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm text-slate-800 dark:text-slate-200 sm:grid-cols-2">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Model</dt>
                <dd className="font-medium">{str(form.itemModel) || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Brand</dt>
                <dd>{str(form.brand) || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Category</dt>
                <dd>{str(form.category) || "—"}</dd>
              </div>
              {str(form.serialNumber) ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Serial number
                  </dt>
                  <dd className="break-all font-mono text-xs sm:text-sm">
                    {str(form.serialNumber)}
                  </dd>
                </div>
              ) : null}
              {str(form.color) ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Color</dt>
                  <dd>{str(form.color)}</dd>
                </div>
              ) : null}
              {str(form.material) ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Material
                  </dt>
                  <dd>{str(form.material)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-slate-500 dark:text-slate-400">
                  Condition
                </dt>
                <dd>{str(form.condition) || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500 dark:text-slate-400">
                  Inclusions
                </dt>
                <dd className="whitespace-pre-wrap">
                  {str(form.inclusions) || "—"}
                </dd>
              </div>
              {form.datePurchased ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Date purchased
                  </dt>
                  <dd>{formatDatePurchased(form.datePurchased)}</dd>
                </div>
              ) : null}
              {str(form.sourceOfPurchase) ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Source of purchase
                  </dt>
                  <dd>{str(form.sourceOfPurchase)}</dd>
                </div>
              ) : null}
              {str(form.consignmentSellingPrice) ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Consignment selling price
                  </dt>
                  <dd className="tabular-nums">
                    {formatPhpDisplay(str(form.consignmentSellingPrice))}
                  </dd>
                </div>
              ) : null}
              {str(form.directPurchaseSellingPrice) ? (
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Direct purchase selling price
                  </dt>
                  <dd className="tabular-nums">
                    {formatPhpDisplay(str(form.directPurchaseSellingPrice))}
                  </dd>
                </div>
              ) : null}
              {str(form.specialInstructions) ? (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500 dark:text-slate-400">
                    Special instructions
                  </dt>
                  <dd className="whitespace-pre-wrap">
                    {str(form.specialInstructions)}
                  </dd>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <dt className="text-slate-500 dark:text-slate-400">Consents</dt>
                <dd className="text-sm">
                  Direct purchase &amp; terms:{" "}
                  {yesNo(form.consentDirectPurchase)}
                  <br />
                  Price nomination (market research):{" "}
                  {yesNo(form.consentPriceNomination)}
                </dd>
              </div>
            </dl>
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Photos
              {detail.photoCount > 0 ? (
                <span className="ml-2 font-normal normal-case text-slate-500">
                  ({detail.photoCount})
                </span>
              ) : null}
            </h2>
            {detail.itemSnapshot.images.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                No photos uploaded.
              </p>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {detail.itemSnapshot.images.map((img) => (
                  <li
                    key={img.key}
                    className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"
                  >
                    <a
                      href={img.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500"
                    >
                      <img
                        src={img.url}
                        alt=""
                        className="aspect-square w-full object-cover"
                        loading="lazy"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={cardClass}>
            <button
              type="button"
              onClick={() => setAuditOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 text-left focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 rounded-lg -m-1 p-1"
              aria-expanded={auditOpen}
            >
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                AUDIT TRAIL
              </h2>
              <span className="text-slate-400" aria-hidden>
                {auditOpen ? "▼" : "▶"}
              </span>
            </button>
            {auditOpen ? (
              <div className="mt-4">
                {auditLoading ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Loading…
                  </p>
                ) : auditError ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                    {auditError}
                  </p>
                ) : auditRows && auditRows.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No audit entries yet.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40 sm:px-4">
                      <TablePaginationBar
                        totalCount={auditPagination.totalCount}
                        pageIndex={auditPagination.pageIndex}
                        pageSize={auditPagination.pageSize}
                        onPageIndexChange={auditPagination.setPageIndex}
                        onPageSizeChange={auditPagination.setPageSize}
                        disabled={
                          auditLoading && (auditRows?.length ?? 0) === 0
                        }
                        itemLabel="entries"
                      />
                    </div>
                    <HorizontalScrollMirror>
                      <table className="w-max min-w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            <th
                              scope="col"
                              className="max-w-[10rem] min-w-0 py-2 pr-3"
                            >
                              Property
                            </th>
                            <th
                              scope="col"
                              className="max-w-[10rem] min-w-0 py-2 pr-3"
                            >
                              From
                            </th>
                            <th
                              scope="col"
                              className="max-w-[10rem] min-w-0 py-2 pr-3"
                            >
                              To
                            </th>
                            <th
                              scope="col"
                              className="max-w-[10rem] min-w-0 py-2 pr-3"
                            >
                              Updated by
                            </th>
                            <th
                              scope="col"
                              className="max-w-[10rem] min-w-0 py-2"
                            >
                              Date
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                          {auditPagination.pageItems.map((row) => (
                            <tr key={row.id}>
                              <td className="max-w-[10rem] min-w-0 py-2 pr-3 align-top font-medium break-words text-slate-800 dark:text-slate-200">
                                {row.propertyName}
                              </td>
                              <td className="max-w-[10rem] min-w-0 py-2 pr-3 align-top whitespace-pre-wrap break-words text-slate-600 dark:text-slate-400">
                                {formatAuditTrailValue(
                                  row.propertyName,
                                  row.fromValue,
                                )}
                              </td>
                              <td className="max-w-[10rem] min-w-0 py-2 pr-3 align-top whitespace-pre-wrap break-words text-slate-600 dark:text-slate-400">
                                {formatAuditTrailValue(
                                  row.propertyName,
                                  row.toValue,
                                )}
                              </td>
                              <td className="max-w-[10rem] min-w-0 py-2 pr-3 align-top break-words text-slate-700 dark:text-slate-300">
                                {row.updatedBy}
                              </td>
                              <td className="max-w-[10rem] min-w-0 py-2 align-top text-slate-600 dark:text-slate-400">
                                <SubmittedAtCell iso={row.updatedAt} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </HorizontalScrollMirror>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {offerModalOpen && detail && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={offerModalTitleId}
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/50"
                    aria-label="Close offer form"
                    onClick={() =>
                      actionBusy === null && setOfferModalOpen(false)
                    }
                  />
                  <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <h2
                      id={offerModalTitleId}
                      className="text-base font-semibold text-slate-900 dark:text-slate-100"
                    >
                      {canShowUpdateOfferButton(
                        detail.status,
                        detail.offerTransactionType,
                      )
                        ? "Update the consignment offer"
                        : "Create Consignment Offer"}
                    </h2>
                    <form
                      onSubmit={(e) => void submitOffer(e)}
                      className="mt-4 space-y-4"
                    >
                      <OfferModalAskingPrices detail={detail} />
                      {actionError && offerModalOpen ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                          {actionError}
                        </p>
                      ) : null}
                      <div>
                        <label
                          htmlFor="offer-price"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Consignment offer price (PHP)
                        </label>
                        <div className="mt-1">
                          <PhpPriceInput
                            id="offer-price"
                            value={offerPriceInput}
                            onChange={setOfferPriceInput}
                            disabled={actionBusy !== null}
                            required
                            className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 pt-2">
                        <button
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={() => setOfferModalOpen(false)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={actionBusy !== null}
                          className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                        >
                          {actionBusy === "offer"
                            ? "Saving…"
                            : canShowUpdateOfferButton(
                                detail.status,
                                detail.offerTransactionType,
                              )
                              ? "Update the offer"
                              : "Create Consignment Offer"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>,
                document.body,
              )
            : null}

          {dpRequestModalOpen && detail && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={dpRequestModalTitleId}
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/50"
                    aria-label="Close direct purchase request"
                    onClick={() =>
                      actionBusy === null && setDpRequestModalOpen(false)
                    }
                  />
                  <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <h2
                      id={dpRequestModalTitleId}
                      className="text-base font-semibold text-slate-900 dark:text-slate-100"
                    >
                      {dpRequestIsEdit
                        ? "Edit Direct Purchase Request"
                        : "Request Direct Purchase Approval"}
                    </h2>
                    <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100">
                      This will notify the approver (CEO). The consignor will
                      receive both the consignment and direct purchase offers
                      only after they are approved.
                    </p>
                    <form
                      onSubmit={(e) => void submitDpRequest(e)}
                      className="mt-4 space-y-4"
                    >
                      {actionError && dpRequestModalOpen ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                          {actionError}
                        </p>
                      ) : null}
                      <div>
                        <label
                          htmlFor="dp-offer-price"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Direct Purchase Offer Price (PHP)
                        </label>
                        <div className="mt-1">
                          <PhpPriceInput
                            id="dp-offer-price"
                            value={dpPriceInput}
                            onChange={setDpPriceInput}
                            disabled={actionBusy !== null}
                            required
                            className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="dp-consignment-offer-price"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Consignment Offer Price (PHP)
                        </label>
                        <div className="mt-1">
                          <PhpPriceInput
                            id="dp-consignment-offer-price"
                            value={dpConsignmentPriceInput}
                            onChange={setDpConsignmentPriceInput}
                            disabled={actionBusy !== null}
                            required
                            className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="dp-approver-notes"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Notes for Approver
                        </label>
                        <textarea
                          id="dp-approver-notes"
                          value={dpNotesInput}
                          onChange={(e) => setDpNotesInput(e.target.value)}
                          disabled={actionBusy !== null}
                          rows={4}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 pt-2">
                        <button
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={() => setDpRequestModalOpen(false)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={actionBusy !== null}
                          className="rounded-lg bg-fuchsia-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-fuchsia-800 disabled:opacity-50 dark:bg-fuchsia-600 dark:hover:bg-fuchsia-500"
                        >
                          {actionBusy === "dpRequest"
                            ? "Saving…"
                            : dpRequestIsEdit
                              ? "Save changes"
                              : "Submit request"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>,
                document.body,
              )
            : null}

          {dpRejectModalOpen && detail && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={dpRejectModalTitleId}
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/50"
                    aria-label="Close reject form"
                    onClick={() =>
                      actionBusy === null && setDpRejectModalOpen(false)
                    }
                  />
                  <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <h2
                      id={dpRejectModalTitleId}
                      className="text-base font-semibold text-slate-900 dark:text-slate-100"
                    >
                      Reject Direct Purchase Request
                    </h2>
                    {detail.directPurchaseApproverNotes ? (
                      <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Notes for approver
                        </span>
                        {detail.directPurchaseApproverNotes}
                      </p>
                    ) : null}
                    <form
                      onSubmit={(e) => void submitRejectDp(e)}
                      className="mt-4 space-y-4"
                    >
                      {actionError && dpRejectModalOpen ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                          {actionError}
                        </p>
                      ) : null}
                      <div>
                        <label
                          htmlFor="dp-reject-reason"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Reject reason
                        </label>
                        <textarea
                          id="dp-reject-reason"
                          value={dpRejectReason}
                          onChange={(e) => setDpRejectReason(e.target.value)}
                          disabled={actionBusy !== null}
                          required
                          rows={4}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                        />
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Visible to staff only. The consignor is emailed that
                          the offer was not approved, without this reason.
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 pt-2">
                        <button
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={() => setDpRejectModalOpen(false)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={actionBusy !== null}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                        >
                          {actionBusy === "dpReject" ? "Rejecting…" : "Reject"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>,
                document.body,
              )
            : null}

          {createNewOfferModalOpen &&
          detail?.authenticatedReturnDetail &&
          typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={createNewOfferModalTitleId}
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/50"
                    aria-label="Close new offer form"
                    onClick={() =>
                      actionBusy === null && setCreateNewOfferModalOpen(false)
                    }
                  />
                  <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <h2
                      id={createNewOfferModalTitleId}
                      className="text-base font-semibold text-slate-900 dark:text-slate-100"
                    >
                      Create New Offer
                    </h2>
                    <form
                      onSubmit={(e) =>
                        void submitAuthenticatedReturnNewOffer(e)
                      }
                      className="mt-4 space-y-4"
                    >
                      <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950/60">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Suggested price range
                        </p>
                        <p className="mt-2 tabular-nums font-medium text-slate-900 dark:text-slate-100">
                          {formatSuggestedPriceRange(
                            detail.authenticatedReturnDetail,
                          )}
                        </p>
                      </div>
                      {actionError && createNewOfferModalOpen ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                          {actionError}
                        </p>
                      ) : null}
                      <div>
                        <label
                          htmlFor="new-offer-price"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          New Offer Price (PHP)
                        </label>
                        <div className="mt-1">
                          <PhpPriceInput
                            id="new-offer-price"
                            value={createNewOfferPriceInput}
                            onChange={setCreateNewOfferPriceInput}
                            disabled={actionBusy !== null}
                            required
                            className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 pt-2">
                        <button
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={() => setCreateNewOfferModalOpen(false)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={actionBusy !== null}
                          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
                        >
                          {actionBusy === "createNewOffer" ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>,
                document.body,
              )
            : null}

          {repricingModalOpen && detail && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={repricingModalTitleId}
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/50"
                    aria-label="Close consignment price update"
                    onClick={closeRepricingModal}
                  />
                  <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <h2
                      id={repricingModalTitleId}
                      className="text-base font-semibold text-slate-900 dark:text-slate-100"
                    >
                      Update consignment price
                    </h2>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      Save the consignor's agreed lower offer and upload proof
                      of agreement. The item will move to For Repricing.
                    </p>
                    <form
                      onSubmit={(e) => void submitConsignmentPriceUpdate(e)}
                      className="mt-4 space-y-4"
                    >
                      {actionError && repricingModalOpen ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                          {actionError}
                        </p>
                      ) : null}
                      <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950/60">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Current offer
                        </p>
                        <p className="mt-2 tabular-nums font-medium text-slate-900 dark:text-slate-100">
                          {detail.offerPrice
                            ? formatPhpDisplay(detail.offerPrice)
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <label
                          htmlFor="repricing-offer-price"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          New offer price (PHP)
                        </label>
                        <div className="mt-1">
                          <PhpPriceInput
                            id="repricing-offer-price"
                            value={repricingOfferPriceInput}
                            onChange={setRepricingOfferPriceInput}
                            disabled={actionBusy !== null}
                            required
                            className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Proof of consignor agreement
                        </p>
                        <input
                          id={repricingProofInputId}
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          aria-label="Select proof of consignor agreement"
                          onChange={(e) => {
                            if (e.target.files?.length)
                              setRepricingProofFile(e.target.files);
                            e.target.value = "";
                          }}
                        />
                        <label
                          htmlFor={repricingProofInputId}
                          className={`${proofPaymentDropzoneClass} mt-2 ${repricingProofDropActive ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-950/50" : ""}`}
                          onDragEnter={(e) => {
                            e.preventDefault();
                            setRepricingProofDropActive(true);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            if (
                              !e.currentTarget.contains(e.relatedTarget as Node)
                            ) {
                              setRepricingProofDropActive(false);
                            }
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "copy";
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setRepricingProofDropActive(false);
                            if (e.dataTransfer.files?.length) {
                              setRepricingProofFile(e.dataTransfer.files);
                            }
                          }}
                        >
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            Drop image here or click to choose
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            PNG, JPG, or other image formats.
                          </span>
                        </label>
                        {repricingProof ? (
                          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-800">
                            <div className="relative aspect-video">
                              <img
                                src={repricingProof.previewUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={removeRepricingProof}
                                className="absolute right-2 top-2 rounded bg-slate-900/70 px-2 py-0.5 text-xs font-medium text-white hover:bg-slate-900"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-600">
                        <button
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={closeRepricingModal}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={actionBusy !== null}
                          className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                        >
                          {actionBusy === "updateConsignmentPrice"
                            ? "Saving…"
                            : "Save"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>,
                document.body,
              )
            : null}

          {renewContractModalOpen && detail && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={renewContractModalTitleId}
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/50"
                    aria-label="Close contract renewal"
                    onClick={closeRenewContractModal}
                  />
                  <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <h2
                      id={renewContractModalTitleId}
                      className="text-base font-semibold text-slate-900 dark:text-slate-100"
                    >
                      Renew contract
                    </h2>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      Save the requested renewal price and move this inquiry to
                      For Contract Renewal.
                    </p>
                    <form
                      onSubmit={(e) => void submitContractRenewal(e)}
                      className="mt-4 space-y-4"
                    >
                      {actionError && renewContractModalOpen ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                          {actionError}
                        </p>
                      ) : null}
                      <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-950/60">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Current offer
                        </p>
                        <p className="mt-2 tabular-nums font-medium text-slate-900 dark:text-slate-100">
                          {detail.offerPrice
                            ? formatPhpDisplay(detail.offerPrice)
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <label
                          htmlFor="renew-contract-offer-price"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          New offer price (PHP)
                        </label>
                        <div className="mt-1">
                          <PhpPriceInput
                            id="renew-contract-offer-price"
                            value={renewContractOfferPriceInput}
                            onChange={setRenewContractOfferPriceInput}
                            disabled={actionBusy !== null}
                            required
                            className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-600">
                        <button
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={closeRenewContractModal}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={actionBusy !== null}
                          className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                        >
                          {actionBusy === "renewContract" ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>,
                document.body,
              )
            : null}

          {pulloutModalOpen && detail && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={pulloutModalTitleId}
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/50"
                    aria-label="Close pullout"
                    onClick={closePulloutModal}
                  />
                  <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <h2
                      id={pulloutModalTitleId}
                      className="text-base font-semibold text-slate-900 dark:text-slate-100"
                    >
                      Pullout item
                    </h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      Record the early pullout fee and reason. If a fee is
                      charged, upload proof of payment. Payment verification
                      staff must confirm it before the item moves to For
                      Pullout. A ₱0 fee proceeds immediately.
                    </p>
                    <form
                      onSubmit={(e) => void submitPullout(e)}
                      className="mt-4 space-y-3"
                    >
                      {actionError && pulloutModalOpen ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                          {actionError}
                        </p>
                      ) : null}
                      <div>
                        <label
                          htmlFor="pullout-fee"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Pullout fee (PHP)
                        </label>
                        <div className="mt-1">
                          <PhpPriceInput
                            id="pullout-fee"
                            value={pulloutFeeInput}
                            onChange={setPulloutFeeInput}
                            disabled={actionBusy !== null}
                            required
                            className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="pullout-reason"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Reason for pullout
                        </label>
                        <textarea
                          id="pullout-reason"
                          rows={4}
                          value={pulloutReasonDraft}
                          onChange={(e) =>
                            setPulloutReasonDraft(e.target.value)
                          }
                          disabled={actionBusy !== null}
                          required
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Proof of payment for pullout fee
                          <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
                            (optional)
                          </span>
                        </p>
                        <input
                          id={pulloutProofInputId}
                          type="file"
                          accept="image/*,application/pdf"
                          className="sr-only"
                          aria-label="Select proof of payment for pullout fee"
                          disabled={actionBusy !== null}
                          onChange={(e) => {
                            if (e.target.files?.length) {
                              setPulloutProofFile(e.target.files);
                            }
                            e.target.value = "";
                          }}
                        />
                        <label
                          htmlFor={pulloutProofInputId}
                          className={`${proofPaymentDropzoneClass} mt-2 ${pulloutProofDropActive ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-950/50" : ""}`}
                          onDragEnter={(e) => {
                            e.preventDefault();
                            setPulloutProofDropActive(true);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            if (
                              !e.currentTarget.contains(e.relatedTarget as Node)
                            ) {
                              setPulloutProofDropActive(false);
                            }
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "copy";
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPulloutProofDropActive(false);
                            if (e.dataTransfer.files?.length) {
                              setPulloutProofFile(e.dataTransfer.files);
                            }
                          }}
                        >
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            Drop proof here or click to choose
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            PNG, JPG, or PDF.
                          </span>
                        </label>
                        {pulloutProof ? (
                          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-800">
                            {pulloutProof.previewUrl ? (
                              <div className="relative aspect-video">
                                <img
                                  src={pulloutProof.previewUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                                <button
                                  type="button"
                                  disabled={actionBusy !== null}
                                  onClick={removePulloutProof}
                                  className="absolute right-2 top-2 rounded bg-slate-900/70 px-2 py-0.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-3 px-4 py-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {pulloutProof.file.name}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    PDF document
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  disabled={actionBusy !== null}
                                  onClick={removePulloutProof}
                                  className="shrink-0 rounded bg-slate-900/70 px-2 py-0.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-600">
                        <button
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={closePulloutModal}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={actionBusy !== null}
                          className="rounded-lg bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-cyan-800 disabled:opacity-50 dark:bg-cyan-700 dark:hover:bg-cyan-600"
                        >
                          {actionBusy === "pullout"
                            ? "Saving…"
                            : "Save pullout"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>,
                document.body,
              )
            : null}

          {notesModalOpen && detail && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={notesModalTitleId}
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/50"
                    aria-label="Close notes"
                    onClick={() =>
                      actionBusy === null && setNotesModalOpen(false)
                    }
                  />
                  <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <h2
                      id={notesModalTitleId}
                      className="text-base font-semibold text-slate-900 dark:text-slate-100"
                    >
                      Update notes
                    </h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      Internal notes for staff only. They are not visible to the
                      consignor.
                    </p>
                    <form
                      onSubmit={(e) => void saveNotes(e)}
                      className="mt-4 space-y-3"
                    >
                      {actionError && notesModalOpen ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                          {actionError}
                        </p>
                      ) : null}
                      <div>
                        <label
                          htmlFor="staff-notes"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Notes
                        </label>
                        <textarea
                          id="staff-notes"
                          rows={10}
                          value={notesDraft}
                          onChange={(e) => setNotesDraft(e.target.value)}
                          disabled={actionBusy !== null}
                          maxLength={10_000}
                          className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                          placeholder="Add context for your team…"
                        />
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {notesDraft.length.toLocaleString()} / 10,000
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 pt-1">
                        <button
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={() => {
                            setActionError(null);
                            setNotesModalOpen(false);
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={actionBusy !== null}
                          className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                        >
                          {actionBusy === "notes" ? "Saving…" : "Save notes"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>,
                document.body,
              )
            : null}

          {reauthNotesModalOpen && detail && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={reauthNotesModalTitleId}
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/50"
                    aria-label="Close reauthentication notes"
                    onClick={() =>
                      actionBusy === null && setReauthNotesModalOpen(false)
                    }
                  />
                  <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <h2
                      id={reauthNotesModalTitleId}
                      className="text-base font-semibold text-slate-900 dark:text-slate-100"
                    >
                      Update reauthentication notes
                    </h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      These notes appear under{" "}
                      <span className="font-medium">
                        Requested for reauthentication
                      </span>{" "}
                      on this inquiry for your team and the consignor.
                    </p>
                    <form
                      onSubmit={(e) => void saveReauthenticationNotes(e)}
                      className="mt-4 space-y-3"
                    >
                      {actionError && reauthNotesModalOpen ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                          {actionError}
                        </p>
                      ) : null}
                      <div>
                        <label
                          htmlFor="reauth-notes"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Reauthentication notes
                        </label>
                        <textarea
                          id="reauth-notes"
                          rows={8}
                          value={reauthNotesDraft}
                          onChange={(e) => setReauthNotesDraft(e.target.value)}
                          disabled={actionBusy !== null}
                          maxLength={20_000}
                          className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                          placeholder="e.g. next steps, coordinator contact, what to prepare…"
                        />
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {reauthNotesDraft.length.toLocaleString()} / 20,000
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 pt-1">
                        <button
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={() => {
                            setActionError(null);
                            setReauthNotesModalOpen(false);
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={actionBusy !== null}
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                        >
                          {actionBusy === "reauthenticationNotes"
                            ? "Saving…"
                            : "Save"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>,
                document.body,
              )
            : null}

          {proofPaymentModalOpen && detail && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={proofPaymentModalTitleId}
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/50"
                    aria-label="Close proof of payment modal"
                    onClick={closeProofPaymentModal}
                  />
                  <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <h2
                      id={proofPaymentModalTitleId}
                      className="text-base font-semibold text-slate-900 dark:text-slate-100"
                    >
                      Upload proof of payment
                    </h2>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      Upload one or more receipt/transfer images. Files are only
                      saved when you click Save.
                    </p>
                    <input
                      id={proofPaymentInputId}
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      aria-label="Select proof of payment images"
                      onChange={(e) => {
                        if (e.target.files?.length)
                          addProofPaymentFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <label
                      htmlFor={proofPaymentInputId}
                      className={`${proofPaymentDropzoneClass} mt-4 ${proofDropActive ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-950/50" : ""}`}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        setProofDropActive(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        if (
                          !e.currentTarget.contains(e.relatedTarget as Node)
                        ) {
                          setProofDropActive(false);
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setProofDropActive(false);
                        if (e.dataTransfer.files?.length) {
                          addProofPaymentFiles(e.dataTransfer.files);
                        }
                      }}
                    >
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        Drop images here or click to choose
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        PNG, JPG, or other image formats.
                      </span>
                    </label>
                    {proofPaymentImages.length > 0 ? (
                      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {proofPaymentImages.map((p) => (
                          <li
                            key={p.id}
                            className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-800"
                          >
                            <div className="relative aspect-square">
                              <img
                                src={p.previewUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => removeProofPaymentAt(p.id)}
                                className="absolute right-1 top-1 rounded bg-slate-900/70 px-2 py-0.5 text-xs font-medium text-white hover:bg-slate-900"
                              >
                                Remove
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-600">
                      <button
                        type="button"
                        disabled={actionBusy !== null}
                        onClick={closeProofPaymentModal}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={
                          actionBusy !== null || proofPaymentImages.length === 0
                        }
                        onClick={() => void saveThirdPartyPaymentProof()}
                        className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                      >
                        {actionBusy === "uploadThirdPartyProof"
                          ? "Saving…"
                          : "Save"}
                      </button>
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}
        </>
      )}

      <ConfirmDialog
        open={markPaidConfirmOpen}
        title="Verify 3rd party authentication fee?"
        description="This confirms the proof of payment and moves the inquiry and inventory item to For 3rd-party Authentication."
        confirmLabel="Verify payment"
        cancelLabel="Cancel"
        busy={actionBusy === "markThirdPartyPaid"}
        errorMessage={actionError}
        onCancel={() => {
          if (actionBusy !== null) return;
          setActionError(null);
          setMarkPaidConfirmOpen(false);
        }}
        onConfirm={confirmMarkThirdPartyPaid}
      />

      <ConfirmDialog
        open={verifyPulloutConfirmOpen}
        title="Verify pullout fee?"
        description="This confirms the proof of payment and moves the inquiry and inventory item to For Pullout."
        confirmLabel="Verify payment"
        cancelLabel="Cancel"
        busy={actionBusy === "verifyPullout"}
        errorMessage={actionError}
        onCancel={() => {
          if (actionBusy !== null) return;
          setActionError(null);
          setVerifyPulloutConfirmOpen(false);
        }}
        onConfirm={confirmVerifyPullout}
      />

      <ConfirmDialog
        open={cancelRenewContractConfirmOpen}
        title="Cancel contract renewal?"
        description="This will clear the requested renewal price and move the item back to Available For Purchase."
        confirmLabel="Cancel renewal"
        cancelLabel="Keep renewal"
        danger
        busy={actionBusy === "cancelContractRenewal"}
        errorMessage={actionError}
        onCancel={() => {
          if (actionBusy !== null) return;
          setActionError(null);
          setCancelRenewContractConfirmOpen(false);
        }}
        onConfirm={confirmCancelContractRenewal}
      />

      <ConfirmDialog
        open={dpWithdrawConfirmOpen}
        title="Withdraw direct purchase request?"
        description="The inquiry will return to pending. The proposed price and notes for approver are kept. The CEO will be notified."
        confirmLabel="Withdraw"
        cancelLabel="Keep request"
        busy={actionBusy === "dpWithdraw"}
        errorMessage={actionError}
        onCancel={() => {
          if (actionBusy !== null) return;
          setActionError(null);
          setDpWithdrawConfirmOpen(false);
        }}
        onConfirm={confirmWithdrawDpRequest}
      />

      <ConfirmDialog
        open={dpApproveConfirmOpen}
        title="Approve consignment and direct purchase offers?"
        description={
          detail ? (
            <div className="space-y-2">
              <p>
                Coordinators will be notified and the consignor will be emailed
                both offers. After approval, the consignor can choose
                consignment or direct purchase, or cancel.
              </p>
              {detail.directPurchaseRequestedPrice ? (
                <p>
                  Direct purchase offer price:{" "}
                  <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                    {formatPhpDisplay(detail.directPurchaseRequestedPrice)}
                  </span>
                </p>
              ) : null}
              {detail.consignmentRequestedPrice ? (
                <p>
                  Consignment offer price:{" "}
                  <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                    {formatPhpDisplay(detail.consignmentRequestedPrice)}
                  </span>
                </p>
              ) : null}
              {detail.directPurchaseApproverNotes ? (
                <p className="whitespace-pre-wrap">
                  Notes for approver: {detail.directPurchaseApproverNotes}
                </p>
              ) : null}
            </div>
          ) : (
            "Approve this direct purchase request?"
          )
        }
        confirmLabel="Approve"
        cancelLabel="Cancel"
        busy={actionBusy === "dpApprove"}
        errorMessage={actionError}
        onCancel={() => {
          if (actionBusy !== null) return;
          setActionError(null);
          setDpApproveConfirmOpen(false);
        }}
        onConfirm={confirmApproveDp}
      />

      <ConfirmDialog
        open={declineConfirmOpen}
        title="Decline this inquiry?"
        description={
          <div className="space-y-3">
            <p>
              Its status will be set to declined. The consignor will see this
              inquiry as no longer active, along with the reason you provide.
            </p>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Reason for declining{" "}
                <span className="text-red-600 dark:text-red-400">*</span>
              </span>
              <textarea
                value={declineReason}
                onChange={(e) => {
                  setDeclineReason(e.target.value);
                  if (actionError) setActionError(null);
                }}
                rows={4}
                maxLength={10000}
                disabled={actionBusy === "decline"}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="Explain why this consignment request is being declined."
              />
            </label>
          </div>
        }
        confirmLabel="Decline"
        cancelLabel="Cancel"
        danger
        busy={actionBusy === "decline"}
        confirmDisabled={!declineReason.trim()}
        errorMessage={actionError}
        onCancel={() => {
          if (actionBusy !== null) return;
          setActionError(null);
          setDeclineConfirmOpen(false);
          setDeclineReason("");
        }}
        onConfirm={confirmDecline}
      />
    </div>
  );
}
