import {
  useCallback,
  useEffect,
  useId,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../lib/api";

type PhotoKeyUrl = { key: string; url: string };

type ConsignorPaymentDetail = {
  id: string;
  auditDate: string;
  status: string;
  groups: unknown[];
};

type PhotoPreview = {
  id: string;
  file?: File;
  previewUrl: string;
  storageKey?: string;
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

function revokePreviews(previews: PhotoPreview[]): void {
  for (const preview of previews) {
    if (preview.file) URL.revokeObjectURL(preview.previewUrl);
  }
}

function previewsFromSavedPhotos(photos: PhotoKeyUrl[]): PhotoPreview[] {
  return photos.map((photo) => ({
    id: randomId(),
    previewUrl: photo.url,
    storageKey: photo.key,
  }));
}

export function ConsignorPaymentDepositSlipModal({
  open,
  paymentId,
  groupId,
  consignorName,
  initialPhotos,
  token,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  paymentId: string;
  groupId: string;
  consignorName: string;
  initialPhotos: PhotoKeyUrl[];
  token: string | null;
  onClose: () => void;
  onSaved: (detail: ConsignorPaymentDetail) => void;
  onError: (message: string | null) => void;
}) {
  const titleId = useId();
  const inputId = useId();
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhotos(previewsFromSavedPhotos(initialPhotos));
    setDropActive(false);
    setFormError(null);
    onError(null);
  }, [open, initialPhotos, onError]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  useEffect(() => {
    return () => revokePreviews(photos.filter((p) => p.file));
  }, [photos]);

  const addPhotoFiles = useCallback((fileList: FileList | File[]) => {
    const list = Array.from(fileList).filter(isImageFile);
    if (list.length === 0) return;
    setPhotos((prev) => [
      ...prev,
      ...list.map((file) => ({
        id: randomId(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }, []);

  const removePhotoAt = useCallback((photoId: string) => {
    setPhotos((prev) => {
      const img = prev.find((p) => p.id === photoId);
      if (img?.file) URL.revokeObjectURL(img.previewUrl);
      return prev.filter((p) => p.id !== photoId);
    });
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    setPhotos((prev) => {
      revokePreviews(prev.filter((p) => p.file));
      return [];
    });
    onClose();
  }, [busy, onClose]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || busy) return;

    if (photos.length === 0) {
      setFormError("At least one deposit slip photo is required.");
      return;
    }

    setFormError(null);
    onError(null);
    setBusy(true);
    try {
      const retainedKeys = photos
        .map((p) => p.storageKey)
        .filter((key): key is string => typeof key === "string" && key !== "");
      const fd = new FormData();
      fd.append("retainedKeys", JSON.stringify(retainedKeys));
      for (const photo of photos) {
        if (photo.file) fd.append("photos", photo.file);
      }
      const res = await apiFetch(
        `/api/consignor-payments/${paymentId}/groups/${groupId}/deposit-slip`,
        { method: "POST", body: fd },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as ConsignorPaymentDetail;
      onSaved(data);
      handleClose();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not save deposit slip";
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
        aria-label="Close deposit slip modal"
        disabled={busy}
        onClick={handleClose}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2
          id={titleId}
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          Deposit slip
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {consignorName}
        </p>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Deposit slip photos
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Upload one or more deposit slip images. Files are saved when you
              submit.
            </p>
            <input
              id={`${inputId}-photos`}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              aria-label="Select deposit slip photos"
              disabled={busy}
              onChange={(e) => {
                if (e.target.files?.length) addPhotoFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <label
              htmlFor={`${inputId}-photos`}
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
                  addPhotoFiles(e.dataTransfer.files);
                }
              }}
            >
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                Drop deposit slip photos here or click to choose
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                PNG, JPG, or other image formats.
              </span>
            </label>
            {photos.length > 0 ? (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((photo) => (
                  <li
                    key={photo.id}
                    className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-800"
                  >
                    <div className="relative aspect-square">
                      <img
                        src={photo.previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhotoAt(photo.id)}
                        disabled={busy}
                        className="absolute right-1 top-1 rounded bg-slate-900/70 px-2 py-0.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
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
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
            >
              {busy ? "Saving…" : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
