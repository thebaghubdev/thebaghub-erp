import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ConfirmDialog } from "./ConfirmDialog";
import { DatePickerField } from "./DatePickerField";
import { PhpPriceInput } from "./PhpPriceInput";
import { apiFetch } from "../lib/api";
import { formatPhpDisplay, parsePhpStringToNumber } from "../lib/format-php";
import {
  BANK_TRANSFER_ACCOUNT_OPTIONS,
  ORDER_PAYMENT_MODE_OPTIONS,
  composeOrderPaymentMode,
  isBankTransferPaymentMode,
  readApiErrorMessage,
  type OrderPaymentRow,
  type OrderPaymentsUpdate,
} from "../lib/order-payments";

type UploadOrderPaymentDialogProps = {
  open: boolean;
  orderId: string;
  token: string | null;
  mode?: "staff" | "client";
  remainingBalancePrice: string | null;
  busy: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onUpdated: (update: OrderPaymentsUpdate) => void;
  onBusyChange: (busy: boolean) => void;
  onErrorChange: (message: string | null) => void;
};

type ProofPreview = {
  file: File;
  previewUrl: string;
  isImage: boolean;
};

const dropzoneClass =
  "flex min-h-[10rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-center transition-colors hover:border-violet-400 hover:bg-violet-50/50 focus-within:outline focus-within:ring-2 focus-within:ring-violet-500 dark:border-slate-600 dark:bg-slate-900/60 dark:hover:border-violet-500 dark:hover:bg-violet-950/40 dark:focus-within:ring-violet-400";

const formPriceInputClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

const formDatePickerClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";

function todayYmd(): string {
  return format(new Date(), "yyyy-MM-dd");
}

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

function isAcceptedProofFile(file: File): boolean {
  return isImageFile(file) || isPdfFile(file);
}

function revokeProofPreview(preview: ProofPreview | null): void {
  if (preview?.isImage) {
    URL.revokeObjectURL(preview.previewUrl);
  }
}

function proofPreviewFromFile(file: File): ProofPreview {
  return {
    file,
    previewUrl: isImageFile(file) ? URL.createObjectURL(file) : "",
    isImage: isImageFile(file),
  };
}

export function UploadOrderPaymentDialog({
  open,
  orderId,
  token,
  mode = "staff",
  busy,
  errorMessage,
  onCancel,
  onUpdated,
  onBusyChange,
  onErrorChange,
}: UploadOrderPaymentDialogProps) {
  const titleId = useId();
  const descId = useId();
  const proofInputId = useId();
  const [phase, setPhase] = useState<"form" | "confirm">("form");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [modeOfPayment, setModeOfPayment] = useState<string>(
    ORDER_PAYMENT_MODE_OPTIONS[0],
  );
  const [bankTransferAccount, setBankTransferAccount] = useState("");
  const [proofPreview, setProofPreview] = useState<ProofPreview | null>(null);
  const [dropActive, setDropActive] = useState(false);

  const clearProofPreview = useCallback(() => {
    setProofPreview((prev) => {
      revokeProofPreview(prev);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setPhase("form");
      clearProofPreview();
      setDropActive(false);
      return;
    }
    setPaymentDate(todayYmd());
    setAmountPaid("");
    setModeOfPayment(ORDER_PAYMENT_MODE_OPTIONS[0]);
    setBankTransferAccount("");
    clearProofPreview();
    setPhase("form");
    onErrorChange(null);
  }, [clearProofPreview, onErrorChange, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel, open]);

  useEffect(() => {
    return () => revokeProofPreview(proofPreview);
  }, [proofPreview]);

  const setProofFile = useCallback((file: File | null) => {
    setProofPreview((prev) => {
      revokeProofPreview(prev);
      return file ? proofPreviewFromFile(file) : null;
    });
  }, []);

  const addProofFiles = useCallback(
    (fileList: FileList | File[]) => {
      const file = Array.from(fileList).find(isAcceptedProofFile);
      if (!file) return;
      setProofFile(file);
    },
    [setProofFile],
  );

  const persistedModeOfPayment = composeOrderPaymentMode(
    modeOfPayment,
    bankTransferAccount,
  );

  const submitConfirm = useCallback(async () => {
    if (!token || busy || !proofPreview) return;
    onBusyChange(true);
    onErrorChange(null);
    try {
      const fd = new FormData();
      fd.append("proof", proofPreview.file);
      fd.append("amountPaid", amountPaid.trim());
      fd.append("paymentDate", paymentDate.trim());
      fd.append("modeOfPayment", persistedModeOfPayment);
      const apiBase =
        mode === "client"
          ? `/api/client/orders/${orderId}`
          : `/api/orders/${orderId}`;
      const res = await apiFetch(
        `${apiBase}/payments`,
        { method: "POST", body: fd },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderPaymentsUpdate & {
        payments: OrderPaymentRow[];
        remainingBalancePrice: string | null;
        holdingPeriod: string | null;
      };
      onUpdated({
        payments: data.payments,
        remainingBalancePrice: data.remainingBalancePrice,
        holdingPeriod: data.holdingPeriod,
      });
      onCancel();
    } catch (e) {
      onErrorChange(
        e instanceof Error ? e.message : "Could not upload proof of payment",
      );
    } finally {
      onBusyChange(false);
    }
  }, [
    amountPaid,
    busy,
    mode,
    persistedModeOfPayment,
    onBusyChange,
    onCancel,
    onErrorChange,
    onUpdated,
    orderId,
    paymentDate,
    proofPreview,
    token,
  ]);

  if (!open || typeof document === "undefined") return null;

  const canSaveForm =
    proofPreview != null &&
    amountPaid.trim() !== "" &&
    paymentDate.trim() !== "" &&
    modeOfPayment.trim() !== "" &&
    (!isBankTransferPaymentMode(modeOfPayment) ||
      bankTransferAccount.trim() !== "") &&
    parsePhpStringToNumber(amountPaid) != null;

  if (phase === "confirm") {
    return (
      <ConfirmDialog
        open
        title="Submit for verification?"
        description={
          <>
            Submit a payment of{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {formatPhpDisplay(amountPaid)}
            </span>{" "}
            via {persistedModeOfPayment} on {paymentDate} for payment
            verification?
          </>
        }
        confirmLabel="Submit for verification"
        busy={busy}
        errorMessage={errorMessage}
        onCancel={() => {
          if (!busy) setPhase("form");
        }}
        onConfirm={submitConfirm}
      />
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Dismiss"
        disabled={busy}
        onClick={() => !busy && onCancel()}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2
          id={titleId}
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          Upload proof of payment
        </h2>
        <p
          id={descId}
          className="mt-2 text-sm text-slate-600 dark:text-slate-400"
        >
          Add the proof and payment details. The payment will be sent for
          verification and will not be marked as paid yet.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Proof of payment
            </p>
            <input
              id={proofInputId}
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              aria-label="Select proof of payment"
              disabled={busy}
              onChange={(e) => {
                if (e.target.files?.length) addProofFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <label
              htmlFor={proofInputId}
              className={`${dropzoneClass} mt-2 ${dropActive ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-950/50" : ""}`}
              onDragEnter={(e) => {
                e.preventDefault();
                setDropActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropActive(false);
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDropActive(false);
                if (e.dataTransfer.files?.length) {
                  addProofFiles(e.dataTransfer.files);
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
            {proofPreview ? (
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-800">
                {proofPreview.isImage ? (
                  <div className="relative aspect-[4/3]">
                    <img
                      src={proofPreview.previewUrl}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={clearProofPreview}
                      className="absolute right-2 top-2 rounded bg-slate-900/70 px-2 py-0.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {proofPreview.file.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        PDF document
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={clearProofPreview}
                      className="shrink-0 rounded bg-slate-900/70 px-2 py-0.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="upload-order-payment-amount"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Paid amount
            </label>
            <PhpPriceInput
              id="upload-order-payment-amount"
              className={formPriceInputClass}
              value={amountPaid}
              disabled={busy}
              onChange={setAmountPaid}
            />
          </div>
          <div>
            <label
              htmlFor="upload-order-payment-date"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Payment date
            </label>
            <DatePickerField
              id="upload-order-payment-date"
              value={paymentDate}
              disabled={busy}
              onChange={setPaymentDate}
              placeholder="Select payment date"
              dialogAriaLabel="Choose payment date"
              triggerClassName={formDatePickerClass}
            />
          </div>
          <div>
            <label
              htmlFor="upload-order-payment-mode"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Mode of payment
            </label>
            <select
              id="upload-order-payment-mode"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              value={modeOfPayment}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value;
                setModeOfPayment(next);
                if (!isBankTransferPaymentMode(next)) {
                  setBankTransferAccount("");
                }
              }}
            >
              {ORDER_PAYMENT_MODE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {isBankTransferPaymentMode(modeOfPayment) ? (
              <div className="mt-3">
                <label
                  htmlFor="upload-order-payment-bank"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Bank account
                </label>
                <select
                  id="upload-order-payment-bank"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  value={bankTransferAccount}
                  disabled={busy}
                  onChange={(e) => setBankTransferAccount(e.target.value)}
                >
                  <option value="">Select bank account</option>
                  {BANK_TRANSFER_ACCOUNT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </div>

        {errorMessage ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !canSaveForm}
            onClick={() => {
              onErrorChange(null);
              setPhase("confirm");
            }}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
