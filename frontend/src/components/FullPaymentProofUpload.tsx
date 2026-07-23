import { useCallback, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { apiFetch } from "../lib/api";
import { readApiErrorMessage } from "../lib/order-installments";

type FullPaymentProofUploadProps<TDetail> = {
  orderId: string;
  token: string | null;
  apiBase: string;
  endpointPath?: string;
  proofUrl: string | null;
  title?: string;
  uploadLabel?: string;
  noProofLabel?: string;
  confirmTitle?: string;
  confirmDescription?: string;
  allowMarkPaid?: boolean;
  requireProofForMarkPaid?: boolean;
  hideUpload?: boolean;
  readOnly?: boolean;
  onUpdated: (detail: TDetail) => void;
};

export function FullPaymentProofUpload<TDetail>({
  orderId,
  token,
  apiBase,
  endpointPath = "full-payment-proof",
  proofUrl,
  title = "Proof of payment",
  uploadLabel = "Upload proof of payment",
  noProofLabel = "No proof uploaded yet.",
  confirmTitle = "Mark full payment as paid?",
  confirmDescription = "This order will be marked as paid. Make sure the uploaded proof of payment has been reviewed.",
  allowMarkPaid = false,
  requireProofForMarkPaid = true,
  hideUpload = false,
  readOnly = false,
  onUpdated,
}: FullPaymentProofUploadProps<TDetail>) {
  const [busyKey, setBusyKey] = useState<"upload" | "mark-paid" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markPaidConfirmOpen, setMarkPaidConfirmOpen] = useState(false);
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);

  const uploadProof = useCallback(
    async (file: File) => {
      if (!token) return;
      setBusyKey("upload");
      setError(null);
      try {
        const fd = new FormData();
        fd.append("proof", file);
        const res = await apiFetch(
          `${apiBase}/${orderId}/${endpointPath}`,
          { method: "POST", body: fd },
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as TDetail;
        onUpdated(data);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not upload proof of payment",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [apiBase, endpointPath, onUpdated, orderId, token],
  );

  const confirmMarkPaid = useCallback(async () => {
    if (!token) return;
    setBusyKey("mark-paid");
    setMarkPaidError(null);
    try {
      const res = await apiFetch(
        `${apiBase}/${orderId}/mark-paid`,
        { method: "POST" },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as TDetail;
      onUpdated(data);
      setMarkPaidConfirmOpen(false);
    } catch (e) {
      setMarkPaidError(
        e instanceof Error ? e.message : "Could not mark order as paid",
      );
    } finally {
      setBusyKey(null);
    }
  }, [apiBase, onUpdated, orderId, token]);

  const uploadBusy = busyKey === "upload";
  const markPaidBusy = busyKey === "mark-paid";
  const canShowMarkPaid =
    !readOnly &&
    allowMarkPaid &&
    (!requireProofForMarkPaid || proofUrl != null);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {title}
          </p>
          {proofUrl ? (
            <a
              href={proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
            >
              View uploaded proof
            </a>
          ) : (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {noProofLabel}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && !hideUpload ? (
            <label className="inline-flex cursor-pointer items-center">
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                disabled={uploadBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadProof(file);
                }}
              />
              <span className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-900 transition-colors hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-900/80">
                {uploadBusy ? "Uploading…" : uploadLabel}
              </span>
            </label>
          ) : null}
          {canShowMarkPaid ? (
            <button
              type="button"
              disabled={markPaidBusy}
              onClick={() => {
                setMarkPaidError(null);
                setMarkPaidConfirmOpen(true);
              }}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              Mark as paid
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {allowMarkPaid ? (
        <ConfirmDialog
          open={markPaidConfirmOpen}
          title={confirmTitle}
          description={confirmDescription}
          confirmLabel="Mark as paid"
          busy={markPaidBusy}
          errorMessage={markPaidError}
          onCancel={() => {
            if (!markPaidBusy) setMarkPaidConfirmOpen(false);
          }}
          onConfirm={confirmMarkPaid}
        />
      ) : null}
    </div>
  );
}
