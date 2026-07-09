import {
  useCallback,
  useEffect,
  useId,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../lib/api";

type ConsignorPaymentDetail = {
  id: string;
  auditDate: string;
  status: string;
  groups: unknown[];
};

type PhotoPreview = {
  id: string;
  file: File;
  previewUrl: string;
};

const dropzoneClass =
  "flex min-h-[10rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-center transition-colors hover:border-violet-400 hover:bg-violet-50/50 focus-within:outline focus-within:ring-2 focus-within:ring-violet-500 dark:border-slate-600 dark:bg-slate-900/60 dark:hover:border-violet-500 dark:hover:bg-violet-950/40 dark:focus-within:ring-violet-400";

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  if (file.type !== "") return false;
  const name = file.name.trim();
  if (!name) return false;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(name);
}

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readApiErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join("; ");
    if (typeof body.message === "string") return body.message;
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export function ConsignorPaymentUnableToSendModal({
  open,
  paymentId,
  groupId,
  consignorName,
  token,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  paymentId: string;
  groupId: string;
  consignorName: string;
  token: string | null;
  onClose: () => void;
  onSaved: (detail: ConsignorPaymentDetail) => void;
  onError: (message: string | null) => void;
}) {
  const titleId = useId();
  const reasonId = useId();
  const inputId = useId();
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState<PhotoPreview | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setPhoto(null);
    setDropActive(false);
    setFormError(null);
    onError(null);
  }, [open, onError]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.previewUrl);
    };
  }, [photo]);

  const setPhotoFile = useCallback((file: File | null) => {
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      if (!file) return null;
      return {
        id: randomId(),
        file,
        previewUrl: URL.createObjectURL(file),
      };
    });
  }, []);

  const addPhotoFile = useCallback(
    (fileList: FileList | File[]) => {
      const file = Array.from(fileList).find(isImageFile);
      if (file) setPhotoFile(file);
    },
    [setPhotoFile],
  );

  const handleClose = useCallback(() => {
    if (busy) return;
    setPhotoFile(null);
    onClose();
  }, [busy, onClose, setPhotoFile]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || busy) return;

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setFormError("Reason is required.");
      return;
    }

    setFormError(null);
    onError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("reason", trimmedReason);
      if (photo?.file) fd.append("photo", photo.file);
      const res = await apiFetch(
        `/api/consignor-payments/${paymentId}/groups/${groupId}/unable-to-send`,
        { method: "POST", body: fd },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as ConsignorPaymentDetail;
      onSaved(data);
      handleClose();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not mark as unable to send";
      setFormError(msg);
      onError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close unable to send modal"
        disabled={busy}
        onClick={handleClose}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2
          id={titleId}
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          Unable to send payment
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {consignorName}
        </p>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor={reasonId}
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Reason <span className="text-red-600">*</span>
            </label>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              required
              disabled={busy}
              placeholder="Explain why the payment could not be sent…"
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Supporting image
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Optional. Included in the email to the consignor if provided.
            </p>
            <input
              id={`${inputId}-photo`}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Select supporting image"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) addPhotoFile([file]);
              }}
            />
            <label
              htmlFor={`${inputId}-photo`}
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
                  addPhotoFile(e.dataTransfer.files);
                }
              }}
            >
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                Drop an image here or click to choose
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                PNG, JPG, or other image formats.
              </span>
            </label>
            {photo ? (
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-800">
                <div className="relative aspect-video max-h-48">
                  <img
                    src={photo.previewUrl}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoFile(null)}
                    disabled={busy}
                    className="absolute right-1 top-1 rounded bg-slate-900/70 px-2 py-0.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {formError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-600">
            <button
              type="button"
              disabled={busy}
              onClick={handleClose}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !token}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
