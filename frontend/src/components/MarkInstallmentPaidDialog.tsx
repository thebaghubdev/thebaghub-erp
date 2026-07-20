import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { DatePickerField } from "./DatePickerField";
import { PhpPriceInput } from "./PhpPriceInput";
import { apiFetch } from "../lib/api";
import { formatPhpAmount, formatPhpDisplay, parsePhpStringToNumber } from "../lib/format-php";
import { resolvePenaltyAmount } from "../lib/installment-penalty";
import {
  dueDateInputValue,
  readApiErrorMessage,
  type OrderInstallmentRow,
} from "../lib/order-installments";

type OrderInstallmentScheduleUpdate = {
  installments: OrderInstallmentRow[];
  status?: string;
};

type MarkInstallmentPaidDialogProps = {
  open: boolean;
  orderId: string;
  token: string | null;
  installment: OrderInstallmentRow | null;
  consignorPaymentRelease: number | null;
  busy: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onUpdated: (update: OrderInstallmentScheduleUpdate) => void;
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

export function MarkInstallmentPaidDialog({
  open,
  orderId,
  token,
  installment,
  consignorPaymentRelease,
  busy,
  errorMessage,
  onCancel,
  onUpdated,
  onBusyChange,
  onErrorChange,
}: MarkInstallmentPaidDialogProps) {
  const titleId = useId();
  const descId = useId();
  const proofInputId = useId();
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
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
      clearProofPreview();
      setDropActive(false);
      return;
    }
    if (!installment) return;
    setPaymentDate(dueDateInputValue(installment.paymentDate) || todayYmd());
    clearProofPreview();
    setDropActive(false);
    onErrorChange(null);
  }, [clearProofPreview, installment, onErrorChange, open]);

  useEffect(() => {
    if (!open || !installment) return;
    const paymentDateValue =
      paymentDate.trim() || dueDateInputValue(installment.paymentDate) || todayYmd();
    const amountDue = parsePhpStringToNumber(installment.amountDue) ?? 0;
    const penalty = resolvePenaltyAmount(
      amountDue,
      installment.amountPaid,
      installment.dueDate,
      paymentDateValue,
      installment.penalty,
      installment.penaltyOverridden,
    );
    setAmountPaid((amountDue + penalty).toFixed(2));
  }, [installment, open, paymentDate]);

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

  if (!open || !installment || typeof document === "undefined") return null;

  const isConsignorRelease =
    consignorPaymentRelease != null &&
    installment.installmentNumber === consignorPaymentRelease;
  const hasExistingProof = installment.proofUrl != null;
  const installmentAmountDue = parsePhpStringToNumber(installment.amountDue) ?? 0;
  const penaltyAmount = resolvePenaltyAmount(
    installmentAmountDue,
    installment.amountPaid,
    installment.dueDate,
    paymentDate.trim() || todayYmd(),
    installment.penalty,
    installment.penaltyOverridden,
  );
  const totalDue = installmentAmountDue + penaltyAmount;
  const canSubmit =
    amountPaid.trim() !== "" &&
    paymentDate.trim() !== "" &&
    (proofPreview != null || hasExistingProof);

  const submit = async () => {
    if (!token || busy || !canSubmit) return;
    onBusyChange(true);
    onErrorChange(null);
    try {
      const fd = new FormData();
      fd.append("amountPaid", amountPaid.trim());
      fd.append("paymentDate", paymentDate.trim());
      if (proofPreview) {
        fd.append("proof", proofPreview.file);
      }
      const res = await apiFetch(
        `/api/orders/${orderId}/installments/${installment.installmentNumber}/mark-paid`,
        { method: "POST", body: fd },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as OrderInstallmentScheduleUpdate;
      onUpdated(data);
    } catch (e) {
      onErrorChange(
        e instanceof Error ? e.message : "Could not mark installment as paid",
      );
    } finally {
      onBusyChange(false);
    }
  };

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
          Mark {installment.installmentLabel} as paid
        </h2>
        <p
          id={descId}
          className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400"
        >
          {isConsignorRelease
            ? "Enter the payment details below. This will mark the installment as paid and add this item to the consignor payments report."
            : "Enter the payment details below to mark this installment as paid."}
        </p>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40">
            <div className="flex justify-between gap-3 text-slate-700 dark:text-slate-300">
              <span>Installment due</span>
              <span className="tabular-nums">
                {formatPhpDisplay(installment.amountDue)}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-3 text-slate-700 dark:text-slate-300">
              <span>
                Penalty
                {!installment.penaltyOverridden ? (
                  <span className="ml-1 text-xs text-slate-500">(auto)</span>
                ) : null}
              </span>
              <span className="tabular-nums">{formatPhpAmount(penaltyAmount)}</span>
            </div>
            <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2 font-medium text-slate-900 dark:border-slate-700 dark:text-slate-100">
              <span>Total due</span>
              <span className="tabular-nums">{formatPhpAmount(totalDue)}</span>
            </div>
          </div>

          <div>
            <label
              htmlFor="mark-paid-amount"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Amount paid
            </label>
            <PhpPriceInput
              id="mark-paid-amount"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white py-2 pl-7 pr-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              value={amountPaid}
              onChange={setAmountPaid}
              disabled={busy}
            />
          </div>

          <div>
            <label
              htmlFor="mark-paid-date"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Payment date
            </label>
            <DatePickerField
              id="mark-paid-date"
              value={paymentDate}
              onChange={setPaymentDate}
              disabled={busy}
              placeholder="Select payment date"
              dialogAriaLabel="Choose payment date"
              triggerClassName="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Proof of payment
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Upload an image or PDF. The file is saved when you mark as paid.
            </p>
            {hasExistingProof ? (
              <a
                href={installment.proofUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
              >
                View existing proof
              </a>
            ) : null}
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
        </div>

        {errorMessage ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
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
            disabled={busy || !canSubmit}
            onClick={() => void submit()}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {busy ? "Please wait…" : "Mark as paid"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
