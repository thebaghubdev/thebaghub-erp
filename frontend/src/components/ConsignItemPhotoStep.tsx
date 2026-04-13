import { useCallback, useId, useRef, useState } from "react";
import type { LocalConsignImage } from "../types/consign-inquiry";

/** Served from `public/photo-guide/` (kept in sync with `src/assets/photo-guide/`). */
const PHOTO_GUIDELINES_URL = "/photo-guide/guidelines.html";

const dropzoneClass =
  "flex min-h-[11rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center transition-colors hover:border-violet-400 hover:bg-violet-50/50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

type Props = {
  images: LocalConsignImage[];
  onChange: (images: LocalConsignImage[]) => void;
};

export function ConsignItemPhotoStep({ images, onChange }: Props) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const list = Array.from(fileList).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (list.length === 0) return;
      const next: LocalConsignImage[] = [
        ...images,
        ...list.map((file) => ({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ];
      onChange(next);
    },
    [images, onChange],
  );

  const removeAt = useCallback(
    (id: string) => {
      const img = images.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      onChange(images.filter((i) => i.id !== id));
    },
    [images, onChange],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2 text-sm leading-relaxed text-slate-600">
        <p className="font-medium text-slate-800">
          Add at least one photo for this item (required).
        </p>
        <p>
          Include pictures of the item from multiple angles and any important
          details. If you have a{" "}
          <span className="font-medium text-slate-800">purchase receipt</span>,
          upload a clear photo of it here as well when available.
        </p>
        <p>
          Please refer to our{" "}
          <a
            href={PHOTO_GUIDELINES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-violet-700 underline-offset-2 hover:text-violet-900 hover:underline"
          >
            photo guidelines
          </a>{" "}
          (opens in a new tab)
        </p>
      </div>

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-label="Upload item images"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        role="button"
        tabIndex={0}
        className={`${dropzoneClass} ${dragActive ? "border-violet-500 bg-violet-50" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
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
          className="h-10 w-10 text-slate-400"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
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
        <span className="text-sm font-medium text-slate-800">
          Drop images here or click to upload
        </span>
        <span className="text-xs text-slate-500">
          PNG, JPG, WebP, GIF — multiple files
        </span>
      </div>

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img) => (
            <li
              key={img.id}
              className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 aspect-square"
            >
              <img
                src={img.previewUrl}
                alt={img.file.name}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAt(img.id)}
                className="absolute right-1.5 top-1.5 rounded-full bg-slate-900/75 px-2 py-0.5 text-xs font-medium text-white hover:bg-slate-900"
              >
                Remove
              </button>
              <p className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-2 py-1 text-[10px] text-white">
                {img.file.name}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
