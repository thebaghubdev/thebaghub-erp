import { type ReactNode, useMemo, useState } from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type PaginationState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { TablePaginationBar } from "../TablePaginationBar";

const inputClass =
  "w-full min-h-8 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

const thBase =
  "px-2 py-2 text-left text-[0.65rem] font-semibold uppercase tracking-wide sm:px-3 sm:py-2.5 sm:text-xs text-slate-600 dark:text-slate-400";

const tdBase =
  "min-w-0 px-2 py-2 align-top text-xs sm:px-3 sm:py-2.5 sm:text-sm";

/** Leading checkbox column: minimal width (table-fixed layouts). */
const isCheckboxColumnId = (id: string) =>
  id === "__select" || id === "select";

const thCheckbox = `${thBase} w-9 max-w-9 px-1 text-center sm:w-10 sm:max-w-10 sm:px-1.5`;
const tdCheckbox = `${tdBase} w-9 max-w-9 px-1 text-center align-middle sm:w-10 sm:max-w-10 sm:px-1.5`;

/** Case-insensitive substring match on stringified cell value. */
const includesStringFilter: FilterFn<unknown> = (
  row,
  columnId,
  filterValue,
) => {
  const q = String(filterValue ?? "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  const v = row.getValue(columnId);
  if (v == null) return false;
  return String(v).toLowerCase().includes(q);
};

/**
 * Search across all primitive values on the row (for global search box).
 */
function globalMultiColumnFilter<T extends object>(
  row: { original: T },
  _columnId: string,
  filterValue: unknown,
): boolean {
  const q = String(filterValue ?? "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  const obj = row.original as Record<string, unknown>;
  return Object.values(obj).some((v) => {
    if (v == null) return false;
    if (typeof v === "object") return false;
    return String(v).toLowerCase().includes(q);
  });
}

export type DataTableProps<TData extends object> = {
  data: TData[];
  /** Use `any` for cell value type so string/boolean columns type-check with `createColumnHelper`. */
  columns: ColumnDef<TData, any>[];
  /** Shown while loading and data is empty */
  isLoading?: boolean;
  emptyMessage?: string;
  /** When true, no “empty” row is shown when `data` is empty (e.g. parent shows only an error). */
  hideEmptyState?: boolean;
  /** When filters/search yield no rows */
  noResultsMessage?: string;
  searchPlaceholder?: string;
  /** Applied to <table> e.g. min-w-[1020px] */
  tableClassName?: string;
  /** Stable row id for React keys (defaults to JSON index — pass if rows have id) */
  getRowId?: (originalRow: TData, index: number) => string;
  /** When set, each body row is clickable (e.g. navigate to detail). Filter inputs stay in the header only. */
  onRowClick?: (row: TData) => void;
  /** Accessible name for clickable rows (defaults to a generic label). */
  getRowAriaLabel?: (row: TData) => string;
  /** Plural noun for the pagination summary (default "items"). */
  paginationItemLabel?: string;
  /** Shown on the right of the search row (e.g. bulk actions). */
  toolbarRight?: ReactNode;
  /** When set, a leading checkbox column is shown; requires `getRowId`. */
  rowSelection?: {
    selectedIds: ReadonlySet<string>;
    onToggleRow: (id: string, selected: boolean) => void;
    onTogglePage: (ids: string[], selected: boolean) => void;
  };
};

export function DataTable<TData extends object>({
  data,
  columns,
  isLoading = false,
  emptyMessage = "No data.",
  hideEmptyState = false,
  noResultsMessage = "No rows match your search or filters.",
  searchPlaceholder = "Search all columns…",
  tableClassName = "w-full min-w-[640px] table-fixed border-collapse text-left",
  getRowId,
  onRowClick,
  getRowAriaLabel,
  paginationItemLabel = "items",
  toolbarRight,
  rowSelection,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const selectionKey = rowSelection
    ? [...rowSelection.selectedIds].sort().join(",")
    : "";

  const tableColumns = useMemo(() => {
    if (!rowSelection || !getRowId) {
      return columns;
    }
    const rs = rowSelection;
    const selectColumn: ColumnDef<TData, unknown> = {
      id: "__select",
      header: ({ table }) => {
        const pageRows = table.getPaginationRowModel().rows;
        const ids = pageRows.map((r) => r.id);
        const allSelected =
          ids.length > 0 && ids.every((id) => rs.selectedIds.has(id));
        const someSelected = ids.some((id) => rs.selectedIds.has(id));
        return (
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = !allSelected && someSelected;
            }}
            onChange={(e) => {
              e.stopPropagation();
              rs.onTogglePage(ids, e.target.checked);
            }}
            aria-label="Select all rows on this page"
            className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900"
          />
        );
      },
      cell: ({ row }) => {
        const id = getRowId(row.original, row.index);
        return (
          <input
            type="checkbox"
            checked={rs.selectedIds.has(id)}
            onChange={(e) => {
              e.stopPropagation();
              rs.onToggleRow(id, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select row"
            className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900"
          />
        );
      },
      enableSorting: false,
      enableColumnFilter: false,
    };
    return [selectColumn, ...columns];
  }, [columns, getRowId, rowSelection, selectionKey]);

  const colCount = tableColumns.length;

  const defaultColumn = useMemo(
    () => ({
      filterFn: includesStringFilter as FilterFn<TData>,
    }),
    [],
  );

  const table = useReactTable<TData>({
    data,
    columns: tableColumns,
    defaultColumn,
    state: { sorting, globalFilter, columnFilters, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: globalMultiColumnFilter as FilterFn<TData>,
    getRowId: getRowId
      ? (original, index) => getRowId(original as TData, index)
      : undefined,
  });

  const showEmpty = !hideEmptyState && !isLoading && data.length === 0;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const displayRows = table.getPaginationRowModel().rows;
  const showNoResults =
    !isLoading && data.length > 0 && filteredCount === 0;

  const filterHeaderGroup = table.getHeaderGroups()[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="sr-only" htmlFor="data-table-global-search">
          Search table
        </label>
        <input
          id="data-table-global-search"
          type="search"
          value={globalFilter ?? ""}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder}
          className={`${inputClass} max-w-md`}
          autoComplete="off"
        />
        {toolbarRight ? (
          <div className="flex shrink-0 justify-end sm:ml-auto">{toolbarRight}</div>
        ) : null}
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm [-webkit-overflow-scrolling:touch] dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto overscroll-x-contain">
        <table className={tableClassName}>
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className={
                      isCheckboxColumnId(header.column.id) ? thCheckbox : thBase
                    }
                  >
                    {header.isPlaceholder ? null : isCheckboxColumnId(
                        header.column.id,
                      ) ? (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    ) : (
                      <button
                        type="button"
                        className={
                          header.column.getCanSort()
                            ? "flex w-full cursor-pointer select-none items-center gap-1 text-left font-semibold hover:text-violet-700 dark:hover:text-violet-300"
                            : "block w-full text-left"
                        }
                        onClick={header.column.getToggleSortingHandler()}
                        disabled={!header.column.getCanSort()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {header.column.getCanSort() ? (
                          <span className="inline-block w-4 text-violet-600 dark:text-violet-400">
                            {{
                              asc: "↑",
                              desc: "↓",
                            }[header.column.getIsSorted() as string] ?? "↕"}
                          </span>
                        ) : null}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
            <tr className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-950/40">
              {filterHeaderGroup?.headers.map((header) => (
                <th
                  key={`f-${header.id}`}
                  className={`${
                    isCheckboxColumnId(header.column.id) ? thCheckbox : thBase
                  } pb-2 pt-0 font-normal normal-case`}
                >
                  {header.column.getCanFilter() ? (
                    <input
                      type="search"
                      value={(header.column.getFilterValue() ?? "") as string}
                      onChange={(e) =>
                        header.column.setFilterValue(e.target.value)
                      }
                      placeholder="Filter…"
                      className={inputClass}
                      aria-label={`Filter ${header.column.id}`}
                    />
                  ) : (
                    <span className="block h-8" aria-hidden />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {isLoading && data.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                >
                  Loading…
                </td>
              </tr>
            )}
            {showEmpty && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {showNoResults && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                >
                  {noResultsMessage}
                </td>
              </tr>
            )}
            {!isLoading &&
              !showEmpty &&
              displayRows.map((row) => (
                <tr
                  key={row.id}
                  className={
                    onRowClick
                      ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }
                  onClick={
                    onRowClick ? () => onRowClick(row.original) : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={
                    onRowClick
                      ? (getRowAriaLabel?.(row.original) ??
                        "Open row details")
                      : undefined
                  }
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={
                        isCheckboxColumnId(cell.column.id)
                          ? tdCheckbox
                          : tdBase
                      }
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
        </div>
        <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40 sm:px-4">
          <TablePaginationBar
            totalCount={filteredCount}
            pageIndex={table.getState().pagination.pageIndex}
            pageSize={table.getState().pagination.pageSize}
            onPageIndexChange={(i) => table.setPageIndex(i)}
            onPageSizeChange={(size) => {
              table.setPageSize(size);
              table.setPageIndex(0);
            }}
            disabled={isLoading && data.length === 0}
            itemLabel={paginationItemLabel}
          />
        </div>
      </div>
    </div>
  );
}
