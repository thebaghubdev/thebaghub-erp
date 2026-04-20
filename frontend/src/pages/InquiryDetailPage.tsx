import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { TablePaginationBar } from "../components/TablePaginationBar";
import { usePortalAuth } from "../context/portal-auth";
import { useClientPagination } from "../hooks/useClientPagination";
import { PhpPriceInput } from "../components/PhpPriceInput";
import { apiFetch } from "../lib/api";
import { InquiryStatusBadge } from "../components/InquiryStatusBadge";
import { formatOfferTransactionLabel } from "../lib/format-offer-transaction-type";
import { formatPhpDisplay, parsePhpStringToNumber } from "../lib/format-php";

type TransactionType = "consignment" | "direct_purchase";

type ClientOfferConfirmation = {
  paymentMethod: "check_pickup" | "cash_pickup" | "direct_deposit";
  bankDetails: {
    accountNumber: string;
    accountName: string;
    bank: "bdo" | "bpi" | "other";
    branch: string;
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
  clientOfferConfirmation?: ClientOfferConfirmation | null;
  /** Staff-only notes persisted on the inquiry row. */
  notes: string | null;
  isWalkIn: boolean;
  walkInBranch: string | null;
  contractStartDate: string | null;
  contractExpirationDate: string | null;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
    images: Array<{ key: string; url: string }>;
  };
  authenticatedReturnDetail?: AuthenticatedReturnDetail;
};

function canShowStaffActions(status: string): boolean {
  const s = status.trim().toLowerCase();
  if (
    s === "for_delivery_scheduled" ||
    s === "for_pullout_scheduled" ||
    s === "for_processing"
  ) {
    return false;
  }
  return (
    s === "pending" ||
    s === "for_offer_confirmation" ||
    s === "for_delivery" ||
    s === "for_pullout"
  );
}

function isPending(status: string): boolean {
  return status.trim().toLowerCase() === "pending";
}

function formatClientPaymentMethod(
  m: ClientOfferConfirmation["paymentMethod"],
): string {
  if (m === "check_pickup") return "Check pickup";
  if (m === "cash_pickup") return "Cash pickup";
  if (m === "direct_deposit") return "Direct deposit";
  return m;
}

function formatClientBank(
  b: NonNullable<ClientOfferConfirmation["bankDetails"]>["bank"],
): string {
  if (b === "bdo") return "BDO";
  if (b === "bpi") return "BPI";
  return "Other";
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
  const { token } = usePortalAuth();
  const [detail, setDetail] = useState<InquiryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [txnType, setTxnType] = useState<TransactionType>("consignment");
  const [offerPriceInput, setOfferPriceInput] = useState("");
  const [actionBusy, setActionBusy] = useState<
    "decline" | "offer" | "notes" | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [declineConfirmOpen, setDeclineConfirmOpen] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const offerModalTitleId = useId();
  const notesModalTitleId = useId();
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
    if (!offerModalOpen || !detail) return;
    if (!detail.consentDirectPurchase) {
      setTxnType("consignment");
    }
  }, [offerModalOpen, detail]);

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

  const confirmDecline = useCallback(async () => {
    if (!id || !token) return;
    setActionError(null);
    setActionBusy("decline");
    try {
      const res = await apiFetch(
        `/api/inquiries/${id}/decline`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as InquiryDetail;
      setDetail(data);
      setAuditRows(null);
      setDeclineConfirmOpen(false);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not decline inquiry",
      );
    } finally {
      setActionBusy(null);
    }
  }, [id, token]);

  const openOfferModal = useCallback(() => {
    if (!detail) return;
    setActionError(null);
    setTxnType("consignment");
    setOfferPriceInput(
      detail.offerPrice != null && detail.offerPrice !== ""
        ? (() => {
            const n = parsePhpStringToNumber(String(detail.offerPrice));
            return n != null ? n.toFixed(2) : String(detail.offerPrice);
          })()
        : "",
    );
    setOfferModalOpen(true);
  }, [detail]);

  const submitOffer = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!id || !token || !detail) return;
      const price = parsePhpStringToNumber(offerPriceInput);
      if (price == null || price <= 0) {
        setActionError("Enter a valid offer price greater than zero.");
        return;
      }
      const tx: TransactionType = detail.consentDirectPurchase
        ? txnType
        : "consignment";
      setActionError(null);
      setActionBusy("offer");
      try {
        const res = await apiFetch(
          `/api/inquiries/${id}/offer`,
          {
            method: "POST",
            body: JSON.stringify({
              transactionType: tx,
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
    [id, token, detail, offerPriceInput, txnType],
  );

  const openNotesModal = useCallback(() => {
    if (!detail) return;
    setActionError(null);
    setNotesDraft(detail.notes ?? "");
    setNotesModalOpen(true);
  }, [detail]);

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

  const form = detail?.itemSnapshot.form ?? {};

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

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      {actionError &&
      !offerModalOpen &&
      !declineConfirmOpen &&
      !notesModalOpen ? (
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
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {detail.sku}
              </h1>
              <InquiryStatusBadge status={detail.status} />
            </div>
            {detail.itemLabel && detail.itemLabel !== "Item" ? (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {detail.itemLabel}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={actionBusy !== null}
                onClick={openNotesModal}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {actionBusy === "notes" ? "Saving…" : "Update Notes"}
              </button>
              {canShowStaffActions(detail.status) ? (
                <>
                  <button
                    type="button"
                    disabled={actionBusy !== null}
                    onClick={() => {
                      setActionError(null);
                      setDeclineConfirmOpen(true);
                    }}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-800 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-slate-950 dark:text-red-200 dark:hover:bg-red-950/40"
                  >
                    {actionBusy === "decline" ? "Declining…" : "Decline"}
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy !== null}
                    onClick={openOfferModal}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                  >
                    {isPending(detail.status)
                      ? "Make an offer"
                      : "Update the offer"}
                  </button>
                </>
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

            {detail.offerPrice != null && detail.offerPrice !== "" ? (
              <dl className="mt-4 rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">
                      Offer transaction
                    </dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">
                      {formatOfferTransactionLabel(detail.offerTransactionType)}
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
                          {detail.clientOfferConfirmation.bankDetails.accountName}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          Account number
                        </dt>
                        <dd className="font-mono text-xs">
                          {detail.clientOfferConfirmation.bankDetails.accountNumber}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          Branch
                        </dt>
                        <dd>{detail.clientOfferConfirmation.bankDetails.branch}</dd>
                      </div>
                    </>
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
                    {detail.walkInBranch?.trim()
                      ? detail.walkInBranch
                      : "—"}
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
            </dl>

            {isAuthenticatedReturnedStatus(detail.status) &&
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
                      Reasons for returning
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
                        disabled={auditLoading && (auditRows?.length ?? 0) === 0}
                        itemLabel="entries"
                      />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            <th scope="col" className="py-2 pr-3">
                              Property
                            </th>
                            <th scope="col" className="py-2 pr-3">
                              From
                            </th>
                            <th scope="col" className="py-2 pr-3">
                              To
                            </th>
                            <th scope="col" className="py-2 pr-3">
                              Updated by
                            </th>
                            <th scope="col" className="py-2">
                              Date
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                          {auditPagination.pageItems.map((row) => (
                            <tr key={row.id}>
                              <td className="max-w-[12rem] py-2 pr-3 align-top font-medium text-slate-800 dark:text-slate-200">
                                {row.propertyName}
                              </td>
                              <td className="max-w-[14rem] py-2 pr-3 align-top whitespace-pre-wrap break-words text-slate-600 dark:text-slate-400">
                                {row.fromValue ?? "—"}
                              </td>
                              <td className="max-w-[14rem] py-2 pr-3 align-top whitespace-pre-wrap break-words text-slate-600 dark:text-slate-400">
                                {row.toValue ?? "—"}
                              </td>
                              <td className="py-2 pr-3 align-top text-slate-700 dark:text-slate-300">
                                {row.updatedBy}
                              </td>
                              <td className="py-2 align-top text-slate-600 dark:text-slate-400">
                                <SubmittedAtCell iso={row.updatedAt} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
                      {isPending(detail.status)
                        ? "Make an offer"
                        : "Update the offer"}
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
                          htmlFor="offer-txn-type"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Transaction type
                        </label>
                        <select
                          id="offer-txn-type"
                          value={
                            detail.consentDirectPurchase
                              ? txnType
                              : "consignment"
                          }
                          onChange={(e) =>
                            setTxnType(e.target.value as TransactionType)
                          }
                          disabled={
                            !detail.consentDirectPurchase || actionBusy !== null
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
                        >
                          <option value="consignment">Consignment</option>
                          <option value="direct_purchase">
                            Direct purchase
                          </option>
                        </select>
                        {!detail.consentDirectPurchase ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            The consignor did not consent to direct purchase;
                            only consignment is available.
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <label
                          htmlFor="offer-price"
                          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                        >
                          Offer price (PHP)
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
                            : isPending(detail.status)
                              ? "Submit offer"
                              : "Update the offer"}
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
        </>
      )}

      <ConfirmDialog
        open={declineConfirmOpen}
        title="Decline this inquiry?"
        description="Its status will be set to declined. The consignor will see this inquiry as no longer active."
        confirmLabel="Decline"
        cancelLabel="Cancel"
        danger
        busy={actionBusy === "decline"}
        errorMessage={actionError}
        onCancel={() => {
          if (actionBusy !== null) return;
          setActionError(null);
          setDeclineConfirmOpen(false);
        }}
        onConfirm={confirmDecline}
      />
    </div>
  );
}
