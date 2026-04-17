import { useCallback, useEffect, useId, useMemo, useState } from "react";

export type MetricVerdict = "pass" | "fail" | "skip";

export type MetricDraftValue = {
  metricStatus: MetricVerdict | null;
  notes: string;
  /** Persisted image payloads (e.g. data URLs from save). */
  photos: string[];
  /** Not yet saved (converted on save). */
  files: File[];
};

type MetricAuthCardProps = {
  metricName: string;
  description: string | null;
  value: MetricDraftValue;
  onChange: (next: MetricDraftValue) => void;
  /** When true, verdicts, notes, and photos cannot be changed. */
  readOnly?: boolean;
};

export function MetricAuthCard({
  metricName,
  description,
  value,
  onChange,
  readOnly = false,
}: MetricAuthCardProps) {
  const noteId = useId();
  const fileInputId = useId();
  const [dragOver, setDragOver] = useState(false);

  const filePreviewItems = useMemo(
    () =>
      value.files.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        url: URL.createObjectURL(file),
      })),
    [value.files],
  );

  useEffect(() => {
    return () => {
      filePreviewItems.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [filePreviewItems]);

  const patch = useCallback(
    (partial: Partial<MetricDraftValue>) => {
      onChange({ ...value, ...partial });
    },
    [value, onChange],
  );

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const arr = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
      if (arr.length === 0) return;
      patch({ files: [...value.files, ...arr] });
    },
    [value.files, patch],
  );

  const removeFile = useCallback(
    (file: File) => {
      patch({
        files: value.files.filter(
          (f) =>
            !(
              f.name === file.name &&
              f.size === file.size &&
              f.lastModified === file.lastModified
            ),
        ),
      });
    },
    [value.files, patch],
  );

  const removePhotoAt = useCallback(
    (index: number) => {
      patch({ photos: value.photos.filter((_, i) => i !== index) });
    },
    [value.photos, patch],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (readOnly) return;
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles, readOnly],
  );

  const verdictBtn = (v: MetricVerdict, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={value.metricStatus === v}
      disabled={readOnly}
      onClick={() =>
        readOnly
          ? undefined
          : patch({
              metricStatus: value.metricStatus === v ? null : v,
            })
      }
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 ${
        value.metricStatus === v
          ? v === "pass"
            ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
            : v === "fail"
              ? "border-red-500 bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200"
              : "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      }`}
    >
      {icon}
    </button>
  );

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <h3 className="min-w-0 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
            {metricName}
          </h3>
          <div className="group/info relative shrink-0 pt-0.5">
            <button
              type="button"
              className="rounded p-0.5 text-slate-400 hover:text-slate-600 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-slate-500 dark:hover:text-slate-300"
              aria-label="Metric description"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
              </svg>
            </button>
            <div
              role="tooltip"
              className="pointer-events-none invisible absolute left-0 top-full z-20 mt-1 max-w-xs rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left text-xs leading-relaxed text-slate-700 shadow-lg opacity-0 transition-opacity group-hover/info:visible group-hover/info:opacity-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 sm:max-w-sm sm:w-64"
            >
              {description?.trim() ? description : "No description."}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {verdictBtn(
            "pass",
            "Pass",
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>,
          )}
          {verdictBtn(
            "fail",
            "Fail",
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>,
          )}
          {verdictBtn(
            "skip",
            "Skip",
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>,
          )}
        </div>
      </header>
      <div className="flex flex-col gap-3 px-4 py-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor={noteId}>
            Notes
          </label>
          <input
            id={noteId}
            type="text"
            value={value.notes}
            readOnly={readOnly}
            onChange={(e) => patch({ notes: e.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 read-only:cursor-not-allowed read-only:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:read-only:bg-slate-900/80"
            placeholder="Optional notes…"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor={fileInputId}>
            Photos
          </label>
          <div
            onDragOver={(e) => {
              if (readOnly) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={readOnly ? undefined : onDrop}
            className={`rounded-lg border-2 border-dashed px-3 py-6 text-center transition-colors ${
              readOnly
                ? "cursor-not-allowed border-slate-200 bg-slate-50/30 opacity-60 dark:border-slate-600 dark:bg-slate-950/20"
                : dragOver
                  ? "border-violet-500 bg-violet-50/50 dark:bg-violet-950/20"
                  : "border-slate-200 bg-slate-50/50 dark:border-slate-600 dark:bg-slate-950/40"
            }`}
          >
            <input
              id={fileInputId}
              type="file"
              accept="image/*"
              multiple
              disabled={readOnly}
              className="sr-only"
              onChange={(e) => {
                if (readOnly) return;
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Drag images here or{" "}
              <label
                htmlFor={fileInputId}
                className={
                  readOnly
                    ? "cursor-not-allowed text-slate-500"
                    : "cursor-pointer font-medium text-violet-700 underline hover:text-violet-800 dark:text-violet-400"
                }
              >
                browse
              </label>
            </p>
            <p className="mt-1 text-[0.65rem] text-slate-500 dark:text-slate-500">
              Images are stored when you save changes.
            </p>
          </div>
          {value.photos.length > 0 || filePreviewItems.length > 0 ? (
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {value.photos.map((src, i) => (
                <li
                  key={`srv-${i}-${src.slice(0, 24)}`}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => removePhotoAt(i)}
                      className="absolute right-1 top-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[0.65rem] font-medium text-white opacity-0 transition-opacity hover:bg-slate-900 group-hover:opacity-100"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
              {filePreviewItems.map((p) => (
                <li
                  key={p.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
                >
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => removeFile(p.file)}
                      className="absolute right-1 top-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[0.65rem] font-medium text-white opacity-0 transition-opacity hover:bg-slate-900 group-hover:opacity-100"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </article>
  );
}
