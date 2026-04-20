import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";

type HorizontalScrollMirrorProps = {
  children: ReactNode;
  /** Classes for the bottom scroll container that wraps `children`. */
  bottomClassName?: string;
  /** Extra classes for the top scrollbar strip (border etc.). */
  topClassName?: string;
};

/**
 * Renders a second horizontal scrollbar above the content, synced with the
 * main scroll container below (for tables with pagination above headers).
 */
export function HorizontalScrollMirror({
  children,
  bottomClassName = "",
  topClassName = "",
}: HorizontalScrollMirrorProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  const syncSpacerWidth = useCallback(() => {
    const bottom = bottomRef.current;
    const top = topRef.current;
    const spacer = spacerRef.current;
    if (!bottom || !spacer) return;
    spacer.style.width = `${bottom.scrollWidth}px`;
    if (top) top.scrollLeft = bottom.scrollLeft;
  }, []);

  const onTopScroll = useCallback(() => {
    const bottom = bottomRef.current;
    const top = topRef.current;
    if (!bottom || !top) return;
    if (bottom.scrollLeft !== top.scrollLeft) {
      bottom.scrollLeft = top.scrollLeft;
    }
  }, []);

  const onBottomScroll = useCallback(() => {
    const bottom = bottomRef.current;
    const top = topRef.current;
    if (!bottom || !top) return;
    if (top.scrollLeft !== bottom.scrollLeft) {
      top.scrollLeft = bottom.scrollLeft;
    }
  }, []);

  useLayoutEffect(() => {
    const bottom = bottomRef.current;
    if (!bottom) return;

    syncSpacerWidth();

    const ro = new ResizeObserver(() => {
      syncSpacerWidth();
    });
    ro.observe(bottom);
    const table = bottom.querySelector("table");
    if (table) ro.observe(table);

    return () => ro.disconnect();
  }, [syncSpacerWidth]);

  const bottomClasses =
    `app-themed-scrollbar min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] ${bottomClassName}`.trim();

  const topClasses =
    `app-themed-scrollbar min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch] border-b border-slate-200 dark:border-slate-800 ${topClassName}`.trim();

  return (
    <>
      <div
        ref={topRef}
        className={topClasses}
        onScroll={onTopScroll}
        aria-hidden
      >
        <div ref={spacerRef} className="h-px" />
      </div>
      <div ref={bottomRef} className={bottomClasses} onScroll={onBottomScroll}>
        {children}
      </div>
    </>
  );
}
