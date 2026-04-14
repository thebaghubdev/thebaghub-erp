import { useEffect, useId } from "react";
import { createPortal } from "react-dom";

export type NoticeDialogProps = {
  open: boolean;
  title?: string;
  message: string;
  actionLabel?: string;
  onClose: () => void;
};

/** Single-action modal for informational messages (replaces window.alert). */
export function NoticeDialog({
  open,
  title = "Notice",
  message,
  actionLabel = "OK",
  onClose,
}: NoticeDialogProps) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

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
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2
          id={titleId}
          className="text-base font-semibold text-slate-900"
        >
          {title}
        </h2>
        <p
          id={descId}
          className="mt-2 text-sm leading-relaxed text-slate-600"
        >
          {message}
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
