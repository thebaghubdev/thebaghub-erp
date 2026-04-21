const selectClass =
  "min-h-9 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

const iconNavBtnClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700";

function ChevronLeftIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 19.5 8.25 12l7.5-7.5"
      />
    </svg>
  );
}

function ChevronRightIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m8.25 4.5 7.5 7.5-7.5 7.5"
      />
    </svg>
  );
}

export type TablePaginationBarProps = {
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  onPageIndexChange: (index: number) => void;
  onPageSizeChange: (size: number) => void;
  disabled?: boolean;
  /** Plural noun in the summary line (e.g. "items", "accounts"). */
  itemLabel?: string;
};

export function TablePaginationBar({
  totalCount,
  pageIndex,
  pageSize,
  onPageIndexChange,
  onPageSizeChange,
  disabled = false,
  itemLabel = "items",
}: TablePaginationBarProps) {
  const pageCount =
    totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  const lastPageIndex = pageCount === 0 ? 0 : pageCount - 1;
  const safeIndex =
    pageCount === 0 ? 0 : Math.min(pageIndex, lastPageIndex);

  const from =
    totalCount === 0 ? 0 : safeIndex * pageSize + 1;
  const to = Math.min((safeIndex + 1) * pageSize, totalCount);

  const canPrev = totalCount > 0 && safeIndex > 0 && !disabled;
  const canNext =
    totalCount > 0 && safeIndex < lastPageIndex && !disabled;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {totalCount === 0 ? (
          <>
            <span className="font-medium text-slate-800 dark:text-slate-200">
              0
            </span>{" "}
            {itemLabel}
          </>
        ) : (
          <>
            Showing{" "}
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {from}–{to}
            </span>{" "}
            of{" "}
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {totalCount}
            </span>{" "}
            {itemLabel}
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <span className="whitespace-nowrap">Per page</span>
          <select
            className={`${selectClass} w-auto min-w-[5.5rem] pr-7`}
            value={pageSize}
            disabled={disabled}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={iconNavBtnClass}
            disabled={!canPrev}
            onClick={() => onPageIndexChange(safeIndex - 1)}
            aria-label="Previous page"
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className={iconNavBtnClass}
            disabled={!canNext}
            onClick={() => onPageIndexChange(safeIndex + 1)}
            aria-label="Next page"
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
