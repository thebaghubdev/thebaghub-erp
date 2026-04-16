import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Client-side slice pagination for plain HTML tables (not DataTable).
 */
export function useClientPagination<T>(items: readonly T[]) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSizeState] = useState(10);

  const totalCount = items.length;
  const pageCount =
    totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);

  useEffect(() => {
    setPageIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (pageCount === 0) {
      if (pageIndex !== 0) setPageIndex(0);
      return;
    }
    if (pageIndex > pageCount - 1) {
      setPageIndex(pageCount - 1);
    }
  }, [pageCount, pageIndex]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPageIndex(0);
  }, []);

  const pageItems = useMemo(
    () => items.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize),
    [items, pageIndex, pageSize],
  );

  return {
    pageIndex,
    setPageIndex,
    pageSize,
    setPageSize,
    totalCount,
    pageCount,
    pageItems,
  };
}
