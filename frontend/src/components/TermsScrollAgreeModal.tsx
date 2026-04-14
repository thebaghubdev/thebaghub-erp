import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called when the user scrolls through the terms and clicks I agree. */
  onAgree: () => void;
  /** Public URL, e.g. `/terms/consignment.txt` */
  url: string;
  title: string;
};

/**
 * Terms viewer: user must scroll to the bottom (or content fits without scrolling)
 * before "I agree" is enabled.
 */
export function TermsScrollAgreeModal({
  open,
  onClose,
  onAgree,
  url,
  title,
}: Props) {
  const titleId = useId();
  const cacheRef = useRef<Map<string, string>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);

  useEffect(() => {
    if (!open) return;

    const cached = cacheRef.current.get(url);
    if (cached) {
      setBody(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setBody(null);

    void fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return res.text();
      })
      .then((text) => {
        const trimmed = text.trim();
        if (!cancelled) {
          cacheRef.current.set(url, trimmed);
          setBody(trimmed);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load terms. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open) {
      setReachedEnd(false);
      return;
    }
    const el = scrollRef.current;
    if (!el || body === null) return;

    const measure = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const tolerance = 8;
      if (scrollHeight <= clientHeight + tolerance) {
        setReachedEnd(true);
        return;
      }
      setReachedEnd(scrollTop + clientHeight >= scrollHeight - tolerance);
    };

    el.scrollTop = 0;
    measure();

    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [open, body]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close terms"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(85vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          {loading && (
            <p className="text-sm text-slate-600">Loading…</p>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
          {!loading && !error && body !== null && (
            <div
              className="text-sm leading-relaxed text-slate-700 [&_li]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: body }}
            />
          )}
        </div>
        <div className="shrink-0 border-t border-slate-200 px-4 py-3">
          <p className="mb-2 text-xs text-slate-500">
            {reachedEnd
              ? "You may accept the terms below."
              : "Scroll to the end of the terms to enable I agree."}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="button"
              disabled={!reachedEnd || loading || !!error}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                onAgree();
              }}
            >
              I agree
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
