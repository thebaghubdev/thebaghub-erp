const selectClass =
  "min-h-9 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

const btnClass =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700";

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
            className={btnClass}
            disabled={!canPrev}
            onClick={() => onPageIndexChange(safeIndex - 1)}
            aria-label="Previous page"
          >
            Previous
          </button>
          <button
            type="button"
            className={btnClass}
            disabled={!canNext}
            onClick={() => onPageIndexChange(safeIndex + 1)}
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
