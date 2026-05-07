import { format } from "date-fns";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PhotoshootCalendarRow } from "../components/PhotoshootCalendar";
import { usePortalAuth } from "../context/portal-auth";
import { apiFetch } from "../lib/api";
import { randomId } from "../lib/random-id";

const dropzoneClass =
  "flex min-h-[14rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-6 py-12 text-center transition-colors hover:border-violet-400 hover:bg-violet-50/50 focus-within:ring-2 focus-within:ring-violet-500 dark:border-slate-600 dark:bg-slate-900/60 dark:hover:border-violet-500 dark:hover:bg-violet-950/40 sm:min-h-[18rem]";

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-950";

const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-950";

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  if (file.type !== "") return false;
  const name = file.name.trim();
  if (!name) return false;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(name);
}

/** `YYYY-MM-DD` → locale medium string without UTC shift. */
function formatPhotoshootDateCell(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  return format(
    new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
    "MMM d, yyyy",
  );
}

type PhotoEntry =
  | { id: string; kind: "saved"; key: string; url: string }
  | { id: string; kind: "local"; file: File; previewUrl: string };

function entriesFromMetaPhotos(
  photos: PhotoshootCalendarRow["photos"] | undefined,
): PhotoEntry[] {
  return (photos ?? []).map((p) => ({
    id: randomId(),
    kind: "saved" as const,
    key: p.key,
    url: p.url,
  }));
}

async function readApiErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    const msg = body.message;
    if (typeof msg === "string") return msg;
    if (Array.isArray(msg)) return msg.join(", ");
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export function PhotoshootItemPage() {
  const { photoshootId } = useParams<{ photoshootId: string }>();
  const { token } = usePortalAuth();
  const inputId = useId();
  const [meta, setMeta] = useState<PhotoshootCalendarRow | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [photoEntries, setPhotoEntries] = useState<PhotoEntry[]>([]);
  const [saveSaving, setSaveSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const photoEntriesRef = useRef<PhotoEntry[]>([]);
  photoEntriesRef.current = photoEntries;

  useEffect(() => {
    return () => {
      for (const e of photoEntriesRef.current) {
        if (e.kind === "local") URL.revokeObjectURL(e.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!photoshootId || !token) {
      setMetaLoading(false);
      if (!photoshootId) setMetaError("Missing photoshoot id");
      return;
    }
    let cancelled = false;
    (async () => {
      setMetaError(null);
      setMetaLoading(true);
      try {
        const res = await apiFetch(
          `/api/inventory/item-photoshoots/${photoshootId}`,
          {},
          token,
        );
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const data = (await res.json()) as PhotoshootCalendarRow;
        if (!cancelled) {
          setMeta(data);
          setPhotoEntries(entriesFromMetaPhotos(data.photos));
        }
      } catch (e) {
        if (!cancelled) {
          setMeta(null);
          setPhotoEntries([]);
          setMetaError(
            e instanceof Error ? e.message : "Failed to load photoshoot",
          );
        }
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photoshootId, token]);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const list = Array.from(fileList).filter(isImageFile);
    if (list.length === 0) return;
    setPhotoEntries((prev) => [
      ...prev,
      ...list.map((file) => ({
        id: randomId(),
        kind: "local" as const,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }, []);

  const removeAt = useCallback((id: string) => {
    setPhotoEntries((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img?.kind === "local") URL.revokeObjectURL(img.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const handleSaveChanges = useCallback(async () => {
    if (!token || !photoshootId) return;
    setSaveError(null);
    setSaveSaving(true);
    try {
      const formData = new FormData();
      const retain = photoEntries
        .filter(
          (e): e is Extract<PhotoEntry, { kind: "saved" }> =>
            e.kind === "saved",
        )
        .map((e) => e.key);
      formData.append("retainKeys", JSON.stringify(retain));
      for (const e of photoEntries) {
        if (e.kind === "local") {
          formData.append("photos", e.file);
        }
      }
      const res = await apiFetch(
        `/api/inventory/item-photoshoots/${photoshootId}/photos`,
        { method: "PATCH", body: formData },
        token,
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as PhotoshootCalendarRow;
      setMeta(data);
      setPhotoEntries((prev) => {
        for (const e of prev) {
          if (e.kind === "local") URL.revokeObjectURL(e.previewUrl);
        }
        return entriesFromMetaPhotos(data.photos);
      });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaveSaving(false);
    }
  }, [token, photoshootId, photoEntries]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  if (metaLoading) {
    return (
      <div className="text-sm text-slate-600 dark:text-slate-400">Loading…</div>
    );
  }

  if (metaError || !meta) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {metaError ?? "Photoshoot not found."}
        </p>
        <Link
          to="/portal/photoshoot"
          className="text-sm font-medium text-violet-700 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100"
        >
          ← Back to Photoshoot
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <Link
          to="/portal/photoshoot"
          className="text-sm font-medium text-violet-700 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100"
        >
          ← Back to Photoshoot
        </Link>
      </div>

      <header className="space-y-2 border-b border-slate-200 pb-4 dark:border-slate-700">
        <p className="break-all font-mono text-sm font-semibold text-violet-800 dark:text-violet-200">
          {meta.sku}
        </p>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {meta.itemLabel}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Scheduled: {formatPhotoshootDateCell(meta.photoshootDate)}
          {meta.consignorName ? ` · ${meta.consignorName}` : null}
        </p>
        <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-start sm:gap-3">
          <button
            type="button"
            className={btnSecondary}
            disabled={saveSaving}
            onClick={() => void handleSaveChanges()}
          >
            {saveSaving ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className={btnPrimary} onClick={() => {}}>
            Finish photoshoot
          </button>
        </div>
        {saveError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
        ) : null}
      </header>

      <div>
        <h2 className="sr-only">Upload photos</h2>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-label="Upload photoshoot images"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <label
          htmlFor={inputId}
          className={`${dropzoneClass} ${dragActive ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-950/50" : ""}`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDragActive(false);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={onDrop}
        >
          <svg
            className="h-14 w-14 text-slate-400 dark:text-slate-500"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
            />
          </svg>
          <span className="text-base font-medium text-slate-800 dark:text-slate-100">
            Drop photos here or click to browse
          </span>
          <span className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
            PNG, JPG, WebP, HEIC, GIF — multiple files.
          </span>
        </label>
      </div>

      {photoEntries.length > 0 ? (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
            Photos ({photoEntries.length})
          </h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photoEntries.map((img) => (
              <li
                key={img.id}
                className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm dark:border-slate-600 dark:bg-slate-800"
              >
                <img
                  src={img.kind === "saved" ? img.url : img.previewUrl}
                  alt={
                    img.kind === "saved"
                      ? `Photoshoot ${img.key.split("/").pop() ?? "photo"}`
                      : img.file.name
                  }
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAt(img.id)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-slate-900/80 px-2 py-1 text-xs font-medium text-white hover:bg-slate-900"
                >
                  Remove
                </button>
                <p className="absolute bottom-0 left-0 right-0 truncate bg-black/55 px-2 py-1 text-[10px] text-white">
                  {img.kind === "saved"
                    ? (img.key.split("/").pop() ?? img.key)
                    : img.file.name}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
