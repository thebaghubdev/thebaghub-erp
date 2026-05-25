import {
  type CSSProperties,
  type DragEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { HorizontalScrollMirror } from "../HorizontalScrollMirror";
import {
  loadTablePreference,
  saveTablePreference,
  type TablePreferenceConfig,
} from "../../lib/table-preferences";
import {
  type Column,
  type ColumnPinningState,
  type ColumnOrderState,
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
  "max-w-[10rem] min-w-0 break-words px-2 py-2 text-left text-[0.65rem] font-semibold uppercase tracking-wide sm:px-3 sm:py-2.5 sm:text-xs text-slate-600 dark:text-slate-400";

const tdBase =
  "max-w-[10rem] min-w-0 break-words px-2 py-2 align-top text-xs sm:px-3 sm:py-2.5 sm:text-sm";

/** Leading checkbox column: narrow; no max-w cap (checkbox only). */
const isCheckboxColumnId = (id: string) =>
  id === "__select" || id === "select";

const thCheckbox =
  "w-9 max-w-9 min-w-0 px-1 py-2 text-center text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400 sm:w-10 sm:max-w-10 sm:px-1.5 sm:py-2.5 sm:text-xs";
const tdCheckbox =
  "w-9 max-w-9 min-w-0 px-1 py-2 text-center align-middle text-xs sm:w-10 sm:max-w-10 sm:px-1.5 sm:py-2.5 sm:text-sm";

// TanStack column helpers produce value-specific column defs; DataTable accepts any cell value.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DataTableColumnDef<TData extends object> = ColumnDef<TData, any>;

/** Case-insensitive substring match on stringified cell value. */
function includesStringFilter(
  row: { getValue: (columnId: string) => unknown },
  columnId: string,
  filterValue: unknown,
): boolean {
  const q = String(filterValue ?? "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  const v = row.getValue(columnId);
  if (v == null) return false;
  return String(v).toLowerCase().includes(q);
}

/** Exact match on columns that use a select filter (e.g. status, category). */
function buildTableFilterFn<TData extends object>(
  exactMatchColumnIds: ReadonlySet<string>,
): FilterFn<TData> {
  return (row, columnId, filterValue) => {
    if (exactMatchColumnIds.has(columnId)) {
      const q = String(filterValue ?? "").trim();
      if (!q) return true;
      const v = row.getValue(columnId);
      if (v == null) return false;
      return String(v) === q;
    }
    return includesStringFilter(row, columnId, filterValue) as boolean;
  };
}

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

const BRAND_FILTER_LIST_CAP = 80;

/** Distinct non-empty `brand` field values from table rows (for filter suggestions). */
function uniqueBrandsFromRows<TData extends object>(rows: TData[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const v = (row as Record<string, unknown>)["brand"];
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t) seen.add(t);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

function mergeBrandSuggestions(
  fromData: string[],
  extras: string[] | undefined,
): string[] {
  if (!extras?.length) return fromData;
  const merged = new Set(fromData);
  for (const b of extras) {
    const t = typeof b === "string" ? b.trim() : "";
    if (t) merged.add(t);
  }
  return [...merged].sort((a, b) => a.localeCompare(b));
}

function getColumnDefId<TData extends object>(
  column: DataTableColumnDef<TData>,
  index: number,
): string {
  if (typeof column.id === "string" && column.id) return column.id;
  const accessorKey = (column as { accessorKey?: unknown }).accessorKey;
  if (typeof accessorKey === "string" && accessorKey) return accessorKey;
  return `column_${index}`;
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function stableStringify(value: TablePreferenceConfig): string {
  return JSON.stringify(value);
}

function parseColumnIdsKey(key: string): string[] {
  return key ? key.split("\u001f") : [];
}

function uniqueValidIds(
  ids: string[] | undefined,
  validColumnIds: ReadonlySet<string>,
): string[] {
  if (!ids?.length) return [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!validColumnIds.has(id) || isCheckboxColumnId(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
  }
  return [...seen];
}

function buildColumnOrderFromPreference(
  preferenceOrder: string[] | undefined,
  tableColumnIds: string[],
): string[] {
  const validColumnIds = new Set(tableColumnIds);
  const ordered = uniqueValidIds(preferenceOrder, validColumnIds);
  const orderedSet = new Set(ordered);
  return [
    ...tableColumnIds.filter(isCheckboxColumnId),
    ...ordered,
    ...tableColumnIds.filter(
      (id) => !isCheckboxColumnId(id) && !orderedSet.has(id),
    ),
  ];
}

function buildTablePreferenceConfig({
  sorting,
  globalFilter,
  columnFilters,
  columnOrder,
  columnPinning,
  pageSize,
  tableColumnIds,
}: {
  sorting: SortingState;
  globalFilter: string;
  columnFilters: ColumnFiltersState;
  columnOrder: ColumnOrderState;
  columnPinning: ColumnPinningState;
  pageSize: number;
  tableColumnIds: string[];
}): TablePreferenceConfig {
  const validColumnIds = new Set(tableColumnIds);
  const order = uniqueValidIds(columnOrder, validColumnIds);
  const pinnedLeft = uniqueValidIds(columnPinning.left, validColumnIds);
  const pinnedRight = uniqueValidIds(columnPinning.right, validColumnIds);
  const validSorting = sorting.filter(
    (sort) => validColumnIds.has(sort.id) && !isCheckboxColumnId(sort.id),
  );
  const validFilters = columnFilters.filter(
    (filter) =>
      validColumnIds.has(filter.id) && !isCheckboxColumnId(filter.id),
  );

  return {
    version: 1,
    ...(order.length ? { columnOrder: order } : {}),
    ...(pinnedLeft.length || pinnedRight.length
      ? { columnPinning: { left: pinnedLeft, right: pinnedRight } }
      : {}),
    ...(validSorting.length ? { sorting: validSorting } : {}),
    ...(validFilters.length ? { columnFilters: validFilters } : {}),
    ...(globalFilter ? { globalFilter } : {}),
    pagination: { pageSize },
  };
}

function sanitizeLoadedPreference(
  preference: TablePreferenceConfig | null,
  tableColumnIds: string[],
): TablePreferenceConfig {
  const validColumnIds = new Set(tableColumnIds);
  const pinnedLeft = uniqueValidIds(
    preference?.columnPinning?.left,
    validColumnIds,
  );
  const pinnedRight = uniqueValidIds(
    preference?.columnPinning?.right,
    validColumnIds,
  );
  return buildTablePreferenceConfig({
    sorting:
      preference?.sorting?.filter(
        (sort) => validColumnIds.has(sort.id) && !isCheckboxColumnId(sort.id),
      ) ?? [],
    globalFilter: preference?.globalFilter ?? "",
    columnFilters:
      preference?.columnFilters?.filter(
        (filter) =>
          validColumnIds.has(filter.id) && !isCheckboxColumnId(filter.id),
      ) ?? [],
    columnOrder: buildColumnOrderFromPreference(
      preference?.columnOrder,
      tableColumnIds,
    ),
    columnPinning: { left: pinnedLeft, right: pinnedRight },
    pageSize: preference?.pagination?.pageSize ?? 10,
    tableColumnIds,
  });
}

function pinnedColumnStyle<TData extends object>(
  column: Column<TData, unknown>,
): CSSProperties | undefined {
  if (column.getIsPinned() !== "left") return undefined;
  return { left: `${column.getStart("left")}px` };
}

function pinnedColumnClass<TData extends object>(
  column: Column<TData, unknown>,
  backgroundClass: string,
  zIndexClass: string,
): string {
  if (column.getIsPinned() !== "left") return "";
  return `sticky ${zIndexClass} ${backgroundClass} shadow-[2px_0_0_rgba(148,163,184,0.25)]`;
}

function BrandColumnFilter<TData extends object>({
  column,
  suggestions,
  listId,
  inputClassName,
}: {
  column: Column<TData, unknown>;
  suggestions: string[];
  listId: string;
  inputClassName: string;
}) {
  const raw = String(column.getFilterValue() ?? "");
  const q = raw.trim().toLowerCase();
  const options = useMemo(() => {
    const matched = q
      ? suggestions.filter((b) => b.toLowerCase().includes(q))
      : suggestions;
    return matched.slice(0, BRAND_FILTER_LIST_CAP);
  }, [suggestions, q]);

  return (
    <>
      <input
        type="search"
        value={raw}
        onChange={(e) => column.setFilterValue(e.target.value)}
        list={listId}
        placeholder="Search brand…"
        className={inputClassName}
        aria-label="Filter brand"
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </>
  );
}

export type StatusFilterOption = { value: string; label: string };

function TableSelectColumnFilter<TData extends object>({
  column,
  options,
  inputClassName,
  emptyOptionLabel,
  ariaLabel,
}: {
  column: Column<TData, unknown>;
  options: StatusFilterOption[];
  inputClassName: string;
  emptyOptionLabel: string;
  ariaLabel: string;
}) {
  const raw = String(column.getFilterValue() ?? "");
  return (
    <select
      value={raw}
      onChange={(e) => column.setFilterValue(e.target.value)}
      className={`${inputClassName} cursor-pointer`}
      aria-label={ariaLabel}
    >
      <option value="">{emptyOptionLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export type DataTableProps<TData extends object> = {
  data: TData[];
  /** Use `any` for cell value type so string/boolean columns type-check with `createColumnHelper`. */
  columns: DataTableColumnDef<TData>[];
  /** Stable identifier used to persist per-user table preferences. */
  tableId?: string;
  /** Shown while loading and data is empty */
  isLoading?: boolean;
  emptyMessage?: string;
  /** When true, no “empty” row is shown when `data` is empty (e.g. parent shows only an error). */
  hideEmptyState?: boolean;
  /** When filters/search yield no rows */
  noResultsMessage?: string;
  searchPlaceholder?: string;
  /** Applied to <table> (default uses w-max min-w-full so wide tables can scroll horizontally). */
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
  /**
   * Extra brand names for the Brand column filter datalist (merged with distinct
   * `brand` values from `data`), e.g. configured picklist from settings.
   */
  brandFilterSuggestions?: string[];
  /**
   * When set, the `status` column filter is a select of these enum values (exact match).
   */
  statusFilterOptions?: StatusFilterOption[];
  /**
   * When set, the `category` column filter is a select of these values (exact match).
   */
  categoryFilterOptions?: StatusFilterOption[];
  /** When set, a leading checkbox column is shown; requires `getRowId`. */
  rowSelection?: {
    selectedIds: ReadonlySet<string>;
    onToggleRow: (id: string, selected: boolean) => void;
    onTogglePage: (ids: string[], selected: boolean) => void;
    /** When false, the row checkbox is disabled and excluded from “select all on this page”. */
    isRowSelectable?: (row: TData) => boolean;
  };
};

export function DataTable<TData extends object>({
  data,
  columns,
  tableId,
  isLoading = false,
  emptyMessage = "No data.",
  hideEmptyState = false,
  noResultsMessage = "No rows match your search or filters.",
  searchPlaceholder = "Search all columns…",
  tableClassName = "w-max min-w-full border-collapse text-left",
  getRowId,
  onRowClick,
  getRowAriaLabel,
  paginationItemLabel = "items",
  toolbarRight,
  brandFilterSuggestions,
  statusFilterOptions,
  categoryFilterOptions,
  rowSelection,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
    left: [],
    right: [],
  });
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [preferencesHydrated, setPreferencesHydrated] = useState(!tableId);
  const lastSavedPreferenceJsonRef = useRef<string | null>(null);
  const saveSequenceRef = useRef(0);
  const globalSearchId = useId();
  const brandFilterListId = useId();

  const brandSuggestions = useMemo(
    () =>
      mergeBrandSuggestions(
        uniqueBrandsFromRows(data),
        brandFilterSuggestions,
      ),
    [data, brandFilterSuggestions],
  );

  const tableColumns = useMemo(() => {
    if (!rowSelection || !getRowId) {
      return columns;
    }
    const rs = rowSelection;
    const rowCanSelect = (original: TData) =>
      rs.isRowSelectable ? rs.isRowSelectable(original) : true;
    const selectColumn: ColumnDef<TData, unknown> = {
      id: "__select",
      header: ({ table }) => {
        const pageRows = table.getPaginationRowModel().rows;
        const ids = pageRows
          .filter((r) => rowCanSelect(r.original as TData))
          .map((r) => r.id);
        const allSelected =
          ids.length > 0 && ids.every((id) => rs.selectedIds.has(id));
        const someSelected = ids.some((id) => rs.selectedIds.has(id));
        return (
          <input
            type="checkbox"
            checked={allSelected}
            disabled={ids.length === 0}
            ref={(el) => {
              if (el) el.indeterminate = !allSelected && someSelected;
            }}
            onChange={(e) => {
              e.stopPropagation();
              rs.onTogglePage(ids, e.target.checked);
            }}
            aria-label="Select all rows on this page"
            className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900"
          />
        );
      },
      cell: ({ row }) => {
        const id = getRowId(row.original, row.index);
        const selectable = rowCanSelect(row.original as TData);
        return (
          <input
            type="checkbox"
            disabled={!selectable}
            checked={rs.selectedIds.has(id)}
            onChange={(e) => {
              e.stopPropagation();
              rs.onToggleRow(id, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={selectable ? "Select row" : "Row cannot be selected"}
            className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900"
          />
        );
      },
      enableSorting: false,
      enableColumnFilter: false,
    };
    return [selectColumn, ...columns];
  }, [columns, getRowId, rowSelection]);

  const tableColumnIds = useMemo(
    () => tableColumns.map((column, index) => getColumnDefId(column, index)),
    [tableColumns],
  );
  const tableColumnIdsKey = useMemo(
    () => tableColumnIds.join("\u001f"),
    [tableColumnIds],
  );

  useEffect(() => {
    setColumnOrder((current) => {
      const knownIds = new Set(tableColumnIds);
      const next = [
        ...current.filter((id) => knownIds.has(id)),
        ...tableColumnIds.filter((id) => !current.includes(id)),
      ];
      if (
        next.length === current.length &&
        next.every((id, index) => id === current[index])
      ) {
        return current;
      }
      return next;
    });
  }, [tableColumnIds]);

  useEffect(() => {
    setColumnPinning((current) => {
      const pinnedLeft = new Set(current.left ?? []);
      const left = tableColumnIds.filter(
        (id) => pinnedLeft.has(id) && !isCheckboxColumnId(id),
      );
      if (
        left.length === (current.left?.length ?? 0) &&
        left.every((id, index) => id === current.left?.[index])
      ) {
        return current;
      }
      return { ...current, left };
    });
  }, [tableColumnIds]);

  useEffect(() => {
    if (!tableId) {
      setPreferencesHydrated(true);
      lastSavedPreferenceJsonRef.current = null;
      return;
    }

    let cancelled = false;
    setPreferencesHydrated(false);

    void (async () => {
      let loadedPreference: TablePreferenceConfig | null = null;
      try {
        loadedPreference = await loadTablePreference(tableId);
      } catch {
        loadedPreference = null;
      }

      if (cancelled) return;

      const columnIds = parseColumnIdsKey(tableColumnIdsKey);
      const sanitizedPreference = sanitizeLoadedPreference(
        loadedPreference,
        columnIds,
      );
      const nextColumnOrder = buildColumnOrderFromPreference(
        sanitizedPreference.columnOrder,
        columnIds,
      );
      const nextColumnPinning = sanitizedPreference.columnPinning ?? {
        left: [],
        right: [],
      };
      const nextSorting = sanitizedPreference.sorting ?? [];
      const nextColumnFilters = sanitizedPreference.columnFilters ?? [];
      const nextGlobalFilter = sanitizedPreference.globalFilter ?? "";
      const nextPageSize = sanitizedPreference.pagination?.pageSize ?? 10;

      setSorting(nextSorting);
      setGlobalFilter(nextGlobalFilter);
      setColumnFilters(nextColumnFilters);
      setColumnOrder(nextColumnOrder);
      setColumnPinning(nextColumnPinning);
      setPagination({ pageIndex: 0, pageSize: nextPageSize });
      lastSavedPreferenceJsonRef.current = stableStringify(
        buildTablePreferenceConfig({
          sorting: nextSorting,
          globalFilter: nextGlobalFilter,
          columnFilters: nextColumnFilters,
          columnOrder: nextColumnOrder,
          columnPinning: nextColumnPinning,
          pageSize: nextPageSize,
          tableColumnIds: columnIds,
        }),
      );
      setPreferencesHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [tableId, tableColumnIdsKey]);

  const setColumnFrozen = (columnId: string, frozen: boolean) => {
    if (isCheckboxColumnId(columnId)) return;
    setColumnPinning((current) => {
      const currentLeft = new Set(current.left ?? []);
      if (frozen) currentLeft.add(columnId);
      else currentLeft.delete(columnId);
      const left = tableColumnIds.filter((id) => currentLeft.has(id));
      return { ...current, left };
    });
  };

  const moveDraggedColumn = (
    targetColumnId: string,
    insertAfterTarget: boolean,
  ) => {
    if (
      !draggedColumnId ||
      draggedColumnId === targetColumnId ||
      isCheckboxColumnId(draggedColumnId) ||
      isCheckboxColumnId(targetColumnId)
    ) {
      return;
    }

    setColumnOrder((current) => {
      const fromIndex = current.indexOf(draggedColumnId);
      const targetIndex = current.indexOf(targetColumnId);
      if (fromIndex === -1 || targetIndex === -1) return current;

      const adjustedTargetIndex =
        insertAfterTarget && fromIndex > targetIndex
          ? targetIndex + 1
          : insertAfterTarget
            ? targetIndex
            : fromIndex < targetIndex
              ? targetIndex - 1
              : targetIndex;

      return moveItem(current, fromIndex, adjustedTargetIndex);
    });
  };

  const colCount = tableColumns.length;

  const statusFilterSelect =
    statusFilterOptions != null && statusFilterOptions.length > 0;
  const categoryFilterSelect =
    categoryFilterOptions != null && categoryFilterOptions.length > 0;

  const exactFilterColumnIds = useMemo(() => {
    const ids = new Set<string>();
    if (statusFilterSelect) ids.add("status");
    if (categoryFilterSelect) ids.add("category");
    return ids;
  }, [statusFilterSelect, categoryFilterSelect]);

  const defaultColumn = useMemo(
    () => ({
      filterFn: buildTableFilterFn<TData>(exactFilterColumnIds),
    }),
    [exactFilterColumnIds],
  );

  const table = useReactTable<TData>({
    data,
    columns: tableColumns,
    defaultColumn,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      columnOrder,
      columnPinning,
      pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnOrderChange: setColumnOrder,
    onColumnPinningChange: setColumnPinning,
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

  const currentPreferenceConfig = useMemo(
    () =>
      buildTablePreferenceConfig({
        sorting,
        globalFilter,
        columnFilters,
        columnOrder,
        columnPinning,
        pageSize: pagination.pageSize,
        tableColumnIds: parseColumnIdsKey(tableColumnIdsKey),
      }),
    [
      sorting,
      globalFilter,
      columnFilters,
      columnOrder,
      columnPinning,
      pagination.pageSize,
      tableColumnIdsKey,
    ],
  );

  useEffect(() => {
    if (!tableId || !preferencesHydrated) return;

    const currentPreferenceJson = stableStringify(currentPreferenceConfig);
    if (currentPreferenceJson === lastSavedPreferenceJsonRef.current) return;

    const saveSequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = saveSequence;

    void saveTablePreference(tableId, currentPreferenceConfig)
      .then(() => {
        if (saveSequenceRef.current === saveSequence) {
          lastSavedPreferenceJsonRef.current = currentPreferenceJson;
        }
      })
      .catch(() => {
        // Preference failures should not interrupt table usage.
      });
  }, [
    tableId,
    preferencesHydrated,
    currentPreferenceConfig,
  ]);

  const showEmpty = !hideEmptyState && !isLoading && data.length === 0;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const displayRows = table.getPaginationRowModel().rows;
  const showNoResults =
    !isLoading && data.length > 0 && filteredCount === 0;

  const filterHeaderGroup = table.getHeaderGroups()[0];
  const hasActiveFiltersOrSorting =
    sorting.length > 0 ||
    columnFilters.length > 0 ||
    String(globalFilter ?? "").trim() !== "";

  const resetFiltersAndSorting = () => {
    setSorting([]);
    setColumnFilters([]);
    setGlobalFilter("");
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  const getDropAfterTarget = (e: DragEvent<HTMLTableCellElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientX > rect.left + rect.width / 2;
  };

  const handleColumnDragStart = (
    e: DragEvent<HTMLTableCellElement>,
    columnId: string,
  ) => {
    if (isCheckboxColumnId(columnId)) return;
    setDraggedColumnId(columnId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", columnId);
  };

  const handleColumnDragOver = (
    e: DragEvent<HTMLTableCellElement>,
    columnId: string,
  ) => {
    if (
      !draggedColumnId ||
      draggedColumnId === columnId ||
      isCheckboxColumnId(columnId)
    ) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleColumnDrop = (
    e: DragEvent<HTMLTableCellElement>,
    columnId: string,
  ) => {
    e.preventDefault();
    moveDraggedColumn(columnId, getDropAfterTarget(e));
    setDraggedColumnId(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="sr-only" htmlFor={globalSearchId}>
          Search table
        </label>
        <input
          id={globalSearchId}
          type="search"
          value={globalFilter ?? ""}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder}
          className={`${inputClass} max-w-md`}
          autoComplete="off"
        />
        <div className="flex shrink-0 flex-wrap justify-end gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={resetFiltersAndSorting}
            disabled={!hasActiveFiltersOrSorting}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Reset filters
          </button>
          {toolbarRight}
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm [-webkit-overflow-scrolling:touch] dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40 sm:px-4">
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
        <HorizontalScrollMirror>
        <table className={tableClassName}>
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    style={pinnedColumnStyle(
                      header.column as Column<TData, unknown>,
                    )}
                    draggable={!isCheckboxColumnId(header.column.id)}
                    onDragStart={(e) =>
                      handleColumnDragStart(e, header.column.id)
                    }
                    onDragOver={(e) =>
                      handleColumnDragOver(e, header.column.id)
                    }
                    onDrop={(e) => handleColumnDrop(e, header.column.id)}
                    onDragEnd={() => setDraggedColumnId(null)}
                    title={
                      isCheckboxColumnId(header.column.id)
                        ? undefined
                        : "Drag column header to reorder"
                    }
                    className={`${
                      isCheckboxColumnId(header.column.id) ? thCheckbox : thBase
                    } ${pinnedColumnClass(
                      header.column as Column<TData, unknown>,
                      "bg-slate-50 dark:bg-slate-950",
                      "z-30",
                    )} ${
                      isCheckboxColumnId(header.column.id)
                        ? ""
                        : "cursor-grab transition-colors active:cursor-grabbing"
                    } ${
                      draggedColumnId === header.column.id
                        ? "bg-violet-50 opacity-70 dark:bg-violet-950/30"
                        : ""
                    }`}
                  >
                    {header.isPlaceholder ? null : isCheckboxColumnId(
                        header.column.id,
                      ) ? (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    ) : (
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          className={
                            header.column.getCanSort()
                              ? "flex min-w-0 flex-1 cursor-pointer select-none items-center gap-1 text-left font-semibold hover:text-violet-700 dark:hover:text-violet-300"
                              : "block min-w-0 flex-1 text-left"
                          }
                          onClick={header.column.getToggleSortingHandler()}
                          disabled={!header.column.getCanSort()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getCanSort() ? (
                            <span className="inline-block w-4 shrink-0 text-violet-600 dark:text-violet-400">
                              {{
                                asc: "↑",
                                desc: "↓",
                              }[header.column.getIsSorted() as string] ?? "↕"}
                            </span>
                          ) : null}
                        </button>
                        <input
                          type="checkbox"
                          checked={header.column.getIsPinned() === "left"}
                          onChange={(e) =>
                            setColumnFrozen(
                              header.column.id,
                              e.target.checked,
                            )
                          }
                          onClick={(e) => e.stopPropagation()}
                          onDragStart={(e) => e.stopPropagation()}
                          aria-label={`Freeze ${header.column.id} column`}
                          title="Freeze column"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900"
                        />
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
            <tr className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-950/40">
              {filterHeaderGroup?.headers.map((header) => (
                <th
                  key={`f-${header.id}`}
                  style={pinnedColumnStyle(
                    header.column as Column<TData, unknown>,
                  )}
                  className={`${
                    isCheckboxColumnId(header.column.id) ? thCheckbox : thBase
                  } ${pinnedColumnClass(
                    header.column as Column<TData, unknown>,
                    "bg-slate-50 dark:bg-slate-950",
                    "z-20",
                  )} pb-2 pt-0 font-normal normal-case`}
                >
                  {header.column.getCanFilter() ? (
                    header.column.id === "brand" ? (
                      <BrandColumnFilter
                        column={
                          header.column as Column<TData, unknown>
                        }
                        suggestions={brandSuggestions}
                        listId={brandFilterListId}
                        inputClassName={inputClass}
                      />
                    ) : header.column.id === "status" &&
                      (statusFilterOptions?.length ?? 0) > 0 ? (
                      <TableSelectColumnFilter
                        column={header.column as Column<TData, unknown>}
                        options={statusFilterOptions ?? []}
                        inputClassName={inputClass}
                        emptyOptionLabel="All statuses"
                        ariaLabel="Filter status"
                      />
                    ) : header.column.id === "category" &&
                      (categoryFilterOptions?.length ?? 0) > 0 ? (
                      <TableSelectColumnFilter
                        column={header.column as Column<TData, unknown>}
                        options={categoryFilterOptions ?? []}
                        inputClassName={inputClass}
                        emptyOptionLabel="All categories"
                        ariaLabel="Filter category"
                      />
                    ) : (
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
                    )
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
                      style={pinnedColumnStyle(
                        cell.column as Column<TData, unknown>,
                      )}
                      className={
                        `${
                          isCheckboxColumnId(cell.column.id)
                            ? tdCheckbox
                            : tdBase
                        } ${pinnedColumnClass(
                          cell.column as Column<TData, unknown>,
                          "bg-white dark:bg-slate-900",
                          "z-10",
                        )}`
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
        </HorizontalScrollMirror>
      </div>
    </div>
  );
}
