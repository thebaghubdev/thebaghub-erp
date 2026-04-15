import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import type { ClientProfile } from "../context/auth-user";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { OfferSignatureField } from "../components/OfferSignatureField";
import { TermsScrollAgreeModal } from "../components/TermsScrollAgreeModal";
import { useClientAuth } from "../context/client-auth";
import { apiFetch } from "../lib/api";
import { SubmittedAtCell } from "../components/SubmittedAtCell";
import { modeOfTransferLabel } from "../lib/consignment-schedule-labels";
import { formatInquiryStatus } from "../lib/format-inquiry-status";
import { formatPhpDisplay } from "../lib/format-php";

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

type ClientInquiryDetail = {
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
  /** Set when staff has scheduled this item for delivery. */
  deliverySchedule?: {
    deliveryDate: string;
    modeOfTransfer: string;
  } | null;
  itemSnapshot: {
    clientItemId: string;
    form: Record<string, unknown>;
    images: Array<{ key: string; url: string }>;
  };
};

function canClientCancelInquiry(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === "pending" || s === "for_offer_confirmation";
}

function isAwaitingOfferConfirmation(status: string): boolean {
  return status.trim().toLowerCase() === "for_offer_confirmation";
}

/** Extra photos only while the inquiry is still triage / offer phase. */
function canClientAddPhotos(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === "pending" || s === "for_offer_confirmation";
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

/** Bank details from My account profile, ready for confirm-offer API. */
function bankDetailsFromProfile(
  c: ClientProfile | null | undefined,
): NonNullable<ClientOfferConfirmation["bankDetails"]> | null {
  if (!c) return null;
  const bank = c.bankCode;
  if (bank !== "bdo" && bank !== "bpi" && bank !== "other") return null;
  const accountNumber = (c.bankAccountNumber ?? "").trim();
  const accountName = (c.bankAccountName ?? "").trim();
  const branch = (c.bankBranch ?? "").trim();
  if (!accountNumber || !accountName || !branch) return null;
  return { bank, accountNumber, accountName, branch };
}

function displayOrDash(v: string | null | undefined): string {
  const t = v?.trim();
  return t ? t : "—";
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

function formatOfferTransactionLabel(t: TransactionType | null): string {
  if (t === "direct_purchase") return "Direct purchase";
  if (t === "consignment") return "Consignment";
  return "—";
}

function formatDatePurchased(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function yesNo(v: unknown): string {
  return v === true || v === "true" ? "Yes" : "No";
}

const cardClass = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";

const CONSIGNMENT_TERMS_URL = "/terms/consignment.txt";

export function ClientConsignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useClientAuth();
  const [detail, setDetail] = useState<ClientInquiryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmFormError, setConfirmFormError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<
    "check_pickup" | "cash_pickup" | "direct_deposit"
  >("check_pickup");
  const [consignmentTermsAccepted, setConsignmentTermsAccepted] =
    useState(false);
  const [termsAgreementModalOpen, setTermsAgreementModalOpen] = useState(false);
  const [offerSignatureFile, setOfferSignatureFile] = useState<File | null>(
    null,
  );
  const [signatureFieldKey, setSignatureFieldKey] = useState(0);
  const confirmOfferTitleId = useId();

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch(
        `/api/client/consignment-inquiry/${id}`,
        {},
        token,
      );
      if (res.status === 404) {
        setError("Inquiry not found.");
        setDetail(null);
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as ClientInquiryDetail;
      setDetail(data);
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

  const confirmCancelInquiry = useCallback(async () => {
    if (!id || !token) return;
    setActionError(null);
    setCancelBusy(true);
    try {
      const res = await apiFetch(
        `/api/client/consignment-inquiry/${id}/cancel`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as ClientInquiryDetail;
      setDetail(data);
      setCancelConfirmOpen(false);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not cancel inquiry",
      );
    } finally {
      setCancelBusy(false);
    }
  }, [id, token]);

  const uploadMorePhotos = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || !id || !token) return;
      setUploadError(null);
      setUploadBusy(true);
      try {
        const fd = new FormData();
        for (const file of files) {
          fd.append("photos", file);
        }
        const res = await apiFetch(
          `/api/client/consignment-inquiry/${id}/photos`,
          { method: "POST", body: fd },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as ClientInquiryDetail;
        setDetail(data);
      } catch (e) {
        setUploadError(
          e instanceof Error ? e.message : "Could not upload photos",
        );
      } finally {
        setUploadBusy(false);
      }
    },
    [id, token],
  );

  const openConfirmOfferModal = useCallback(() => {
    setConfirmFormError(null);
    setPaymentMethod("check_pickup");
    setConsignmentTermsAccepted(false);
    setOfferSignatureFile(null);
    setSignatureFieldKey((k) => k + 1);
    setConfirmModalOpen(true);
  }, []);

  const submitConfirmOffer = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!id || !token) return;
      if (!consignmentTermsAccepted) {
        setConfirmFormError(
          "You must read and agree to The Bag Hub Consignment Terms and Conditions.",
        );
        return;
      }
      if (!offerSignatureFile) {
        setConfirmFormError(
          "Please add your signature by drawing or uploading an image.",
        );
        return;
      }
      let savedBankDetails: NonNullable<
        ClientOfferConfirmation["bankDetails"]
      > | null = null;
      if (paymentMethod === "direct_deposit") {
        savedBankDetails = bankDetailsFromProfile(user?.client);
        if (!savedBankDetails) {
          setConfirmFormError(
            "Your saved bank details are incomplete. Add or update them on My account, then return here to confirm.",
          );
          return;
        }
      }
      setConfirmFormError(null);
      setConfirmBusy(true);
      try {
        const payload: Record<string, unknown> = { paymentMethod };
        if (paymentMethod === "direct_deposit" && savedBankDetails) {
          payload.bankDetails = savedBankDetails;
        }
        const fd = new FormData();
        fd.append("payload", JSON.stringify(payload));
        fd.append("signature", offerSignatureFile);
        const res = await apiFetch(
          `/api/client/consignment-inquiry/${id}/confirm-offer`,
          { method: "POST", body: fd },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as ClientInquiryDetail;
        setDetail(data);
        setConfirmModalOpen(false);
      } catch (err) {
        setConfirmFormError(
          err instanceof Error ? err.message : "Could not confirm offer",
        );
      } finally {
        setConfirmBusy(false);
      }
    },
    [id, token, paymentMethod, user, consignmentTermsAccepted, offerSignatureFile],
  );

  const form = detail?.itemSnapshot.form ?? {};

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/consignments"
          className="text-sm font-medium text-violet-700 hover:text-violet-900"
        >
          ← Back to consignments
        </Link>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {actionError && !cancelConfirmOpen ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {actionError}
        </p>
      ) : null}

      {loading && <p className="text-sm text-slate-600">Loading…</p>}

      {!loading && detail && (
        <>
          <div className={cardClass}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-xl font-semibold text-slate-900">
                {detail.sku}
              </h1>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-700">
                {formatInquiryStatus(detail.status)}
              </span>
            </div>
            {detail.itemLabel && detail.itemLabel !== "Item" ? (
              <p className="mt-1 text-sm text-slate-600">{detail.itemLabel}</p>
            ) : null}

            {canClientCancelInquiry(detail.status) ||
            isAwaitingOfferConfirmation(detail.status) ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {canClientCancelInquiry(detail.status) ? (
                  <button
                    type="button"
                    disabled={cancelBusy}
                    onClick={() => {
                      setActionError(null);
                      setCancelConfirmOpen(true);
                    }}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-800 shadow-sm hover:bg-red-50 disabled:opacity-50"
                  >
                    {cancelBusy ? "Cancelling…" : "Cancel"}
                  </button>
                ) : null}
                {isAwaitingOfferConfirmation(detail.status) ? (
                  <button
                    type="button"
                    disabled={confirmBusy}
                    onClick={() => {
                      setActionError(null);
                      openConfirmOfferModal();
                    }}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
                  >
                    Confirm offer
                  </button>
                ) : null}
              </div>
            ) : null}

            {detail.status.trim().toLowerCase() === "for_delivery_scheduled" &&
            detail.deliverySchedule ? (
              <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/80 p-3 text-sm dark:border-violet-900/50 dark:bg-violet-950/30">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-900 dark:text-violet-200">
                  Scheduled delivery
                </h3>
                <dl className="mt-2 space-y-2 text-slate-800 dark:text-slate-200">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">
                      Delivery date
                    </dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">
                      <SubmittedAtCell
                        iso={detail.deliverySchedule.deliveryDate}
                        showTime={false}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">
                      Mode of transfer
                    </dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">
                      {modeOfTransferLabel(
                        "delivery",
                        detail.deliverySchedule.modeOfTransfer,
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}

            {detail.offerPrice != null && detail.offerPrice !== "" ? (
              <dl className="mt-4 rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <div>
                    <dt className="text-slate-500">Offer type</dt>
                    <dd className="font-medium text-slate-900">
                      {formatOfferTransactionLabel(detail.offerTransactionType)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Offer price</dt>
                    <dd className="tabular-nums font-medium text-slate-900">
                      {formatPhpDisplay(detail.offerPrice)}
                    </dd>
                  </div>
                </div>
              </dl>
            ) : null}

            {detail.clientOfferConfirmation ? (
              <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/80 p-3 text-sm">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                  Your payment preference
                </h3>
                <dl className="mt-2 space-y-2 text-slate-800">
                  <div>
                    <dt className="text-slate-500">Preferred payment method</dt>
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
                        <dt className="text-slate-500">Bank</dt>
                        <dd>
                          {formatClientBank(
                            detail.clientOfferConfirmation.bankDetails.bank,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Account name</dt>
                        <dd>
                          {detail.clientOfferConfirmation.bankDetails.accountName}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Account number</dt>
                        <dd className="font-mono text-xs">
                          {
                            detail.clientOfferConfirmation.bankDetails
                              .accountNumber
                          }
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Branch</dt>
                        <dd>{detail.clientOfferConfirmation.bankDetails.branch}</dd>
                      </div>
                    </>
                  ) : null}
                  {detail.clientOfferConfirmation.signatureUrl ? (
                    <div>
                      <dt className="text-slate-500">Signature</dt>
                      <dd className="mt-1">
                        <img
                          src={detail.clientOfferConfirmation.signatureUrl}
                          alt="Your signature"
                          className="max-h-36 max-w-full rounded border border-slate-200 bg-white object-contain"
                          loading="lazy"
                        />
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ) : null}
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Item details
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm text-slate-800 sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Model</dt>
                <dd className="font-medium">{str(form.itemModel) || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Brand</dt>
                <dd>{str(form.brand) || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Category</dt>
                <dd>{str(form.category) || "—"}</dd>
              </div>
              {str(form.serialNumber) ? (
                <div>
                  <dt className="text-slate-500">Serial number</dt>
                  <dd className="break-all font-mono text-xs sm:text-sm">
                    {str(form.serialNumber)}
                  </dd>
                </div>
              ) : null}
              {str(form.color) ? (
                <div>
                  <dt className="text-slate-500">Color</dt>
                  <dd>{str(form.color)}</dd>
                </div>
              ) : null}
              {str(form.material) ? (
                <div>
                  <dt className="text-slate-500">Material</dt>
                  <dd>{str(form.material)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-slate-500">Condition</dt>
                <dd>{str(form.condition) || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Inclusions</dt>
                <dd className="whitespace-pre-wrap">
                  {str(form.inclusions) || "—"}
                </dd>
              </div>
              {form.datePurchased ? (
                <div>
                  <dt className="text-slate-500">Date purchased</dt>
                  <dd>{formatDatePurchased(form.datePurchased)}</dd>
                </div>
              ) : null}
              {str(form.sourceOfPurchase) ? (
                <div>
                  <dt className="text-slate-500">Source of purchase</dt>
                  <dd>{str(form.sourceOfPurchase)}</dd>
                </div>
              ) : null}
              {str(form.consignmentSellingPrice) ? (
                <div>
                  <dt className="text-slate-500">Consignment selling price</dt>
                  <dd className="tabular-nums">
                    {formatPhpDisplay(str(form.consignmentSellingPrice))}
                  </dd>
                </div>
              ) : null}
              {str(form.directPurchaseSellingPrice) ? (
                <div>
                  <dt className="text-slate-500">
                    Direct purchase selling price
                  </dt>
                  <dd className="tabular-nums">
                    {formatPhpDisplay(str(form.directPurchaseSellingPrice))}
                  </dd>
                </div>
              ) : null}
              {str(form.specialInstructions) ? (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">Special instructions</dt>
                  <dd className="whitespace-pre-wrap">
                    {str(form.specialInstructions)}
                  </dd>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Consents</dt>
                <dd className="text-sm">
                  Allow direct purchase: {yesNo(form.consentDirectPurchase)}
                </dd>
              </div>
            </dl>
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Photos
              {detail.photoCount > 0 ? (
                <span className="ml-2 font-normal normal-case text-slate-500">
                  ({detail.photoCount})
                </span>
              ) : null}
            </h2>
            {canClientAddPhotos(detail.status) ? (
              <div className="mt-3">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  aria-label="Add more photos"
                  disabled={uploadBusy}
                  onChange={(e) => {
                    // Copy files before clearing the input — clearing invalidates the FileList.
                    const picked = e.target.files
                      ? Array.from(e.target.files)
                      : [];
                    e.target.value = "";
                    void uploadMorePhotos(picked);
                  }}
                />
                <button
                  type="button"
                  disabled={uploadBusy}
                  onClick={() => photoInputRef.current?.click()}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  {uploadBusy ? "Uploading…" : "Add photos"}
                </button>
                {uploadError ? (
                  <p className="mt-2 text-sm text-red-700">{uploadError}</p>
                ) : null}
              </div>
            ) : null}
            {detail.itemSnapshot.images.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                {canClientAddPhotos(detail.status)
                  ? "No photos yet — add some above."
                  : "No photos uploaded."}
              </p>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {detail.itemSnapshot.images.map((img) => (
                  <li
                    key={img.key}
                    className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
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
        </>
      )}

      {confirmModalOpen && detail && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby={confirmOfferTitleId}
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50"
                aria-label="Close confirm offer form"
                onClick={() => {
                  if (confirmBusy) return;
                  setConfirmModalOpen(false);
                }}
              />
              <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                <h2
                  id={confirmOfferTitleId}
                  className="text-base font-semibold text-slate-900"
                >
                  Confirm offer
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Choose how you would like to receive payment for this offer.
                </p>
                <form
                  onSubmit={(e) => void submitConfirmOffer(e)}
                  className="mt-4 space-y-4"
                >
                  <div>
                    <label
                      htmlFor="client-payment-method"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Your preferred payment method
                    </label>
                    <select
                      id="client-payment-method"
                      value={paymentMethod}
                      onChange={(e) =>
                        setPaymentMethod(
                          e.target.value as typeof paymentMethod,
                        )
                      }
                      disabled={confirmBusy}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:bg-slate-100"
                    >
                      <option value="check_pickup">Check pickup</option>
                      <option value="cash_pickup">Cash pickup</option>
                      <option value="direct_deposit">Direct deposit</option>
                    </select>
                  </div>

                  {paymentMethod === "direct_deposit" ? (
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                      <p className="text-sm text-slate-700">
                        Direct deposit uses the bank account saved on{" "}
                        <Link
                          to="/my-account"
                          className="font-medium text-violet-700 hover:underline"
                        >
                          My account
                        </Link>
                        . Make sure these details are up to date before
                        confirming; you can only change them there.
                      </p>
                      <dl className="space-y-2 text-sm">
                        <div>
                          <dt className="text-slate-500">Bank</dt>
                          <dd className="font-medium text-slate-900">
                            {(() => {
                              const bc = user?.client?.bankCode;
                              return bc === "bdo" ||
                                bc === "bpi" ||
                                bc === "other"
                                ? formatClientBank(bc)
                                : "—";
                            })()}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Account name</dt>
                          <dd className="text-slate-900">
                            {displayOrDash(user?.client?.bankAccountName)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Account number</dt>
                          <dd className="font-mono text-xs text-slate-900">
                            {displayOrDash(user?.client?.bankAccountNumber)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Branch</dt>
                          <dd className="text-slate-900">
                            {displayOrDash(user?.client?.bankBranch)}
                          </dd>
                        </div>
                      </dl>
                      {!bankDetailsFromProfile(user?.client) ? (
                        <p
                          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                          role="status"
                        >
                          Your bank details are incomplete.{" "}
                          <Link
                            to="/my-account"
                            className="font-medium text-amber-950 underline"
                          >
                            Open My account
                          </Link>{" "}
                          to add or update them, then return here to confirm.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex items-start gap-2 pt-1">
                    <input
                      id="offer-consignment-terms"
                      type="checkbox"
                      checked={consignmentTermsAccepted}
                      onChange={(e) => {
                        if (!e.target.checked) {
                          setConsignmentTermsAccepted(false);
                        }
                      }}
                      onClick={(e) => {
                        if (!consignmentTermsAccepted) {
                          e.preventDefault();
                          setConfirmFormError(null);
                          setTermsAgreementModalOpen(true);
                        }
                      }}
                      disabled={confirmBusy}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500 disabled:opacity-50"
                    />
                    <label
                      htmlFor="offer-consignment-terms"
                      className="text-sm leading-snug text-slate-700"
                    >
                      I agree to The Bag Hub Consignment Terms and Conditions.
                    </label>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      Signature
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Draw your signature or upload a clear image of it.
                    </p>
                    <div className="mt-2">
                      <OfferSignatureField
                        key={signatureFieldKey}
                        disabled={confirmBusy}
                        onSignatureChange={setOfferSignatureFile}
                      />
                    </div>
                  </div>

                  {confirmFormError ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      {confirmFormError}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap justify-end gap-2 pt-2">
                    <button
                      type="button"
                      disabled={confirmBusy}
                      onClick={() => setConfirmModalOpen(false)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={
                        confirmBusy ||
                        !consignmentTermsAccepted ||
                        !offerSignatureFile
                      }
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {confirmBusy ? "Submitting…" : "Submit"}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      <TermsScrollAgreeModal
        open={termsAgreementModalOpen}
        onClose={() => setTermsAgreementModalOpen(false)}
        onAgree={() => {
          setConsignmentTermsAccepted(true);
          setTermsAgreementModalOpen(false);
        }}
        url={CONSIGNMENT_TERMS_URL}
        title="Consignment — terms and conditions"
      />

      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Cancel this inquiry?"
        description="Your inquiry will be marked as cancelled. You can still view it here, but The Bag Hub will treat it as withdrawn."
        cancelLabel="Keep inquiry"
        confirmLabel="Yes, cancel"
        danger
        busy={cancelBusy}
        errorMessage={actionError}
        onCancel={() => {
          if (cancelBusy) return;
          setActionError(null);
          setCancelConfirmOpen(false);
        }}
        onConfirm={confirmCancelInquiry}
      />
    </div>
  );
}
