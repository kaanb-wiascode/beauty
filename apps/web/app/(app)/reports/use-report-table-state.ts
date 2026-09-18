"use client";

import { useMemo, useState } from "react";

export type ReportSortDirection = "asc" | "desc";

export type ReportSortState<TSortKey extends string> = {
  key: TSortKey;
  direction: ReportSortDirection;
};

type UseReportTableStateOptions<TColumnKey extends string, TSortKey extends string> = {
  columns: readonly TColumnKey[];
  initialSort: ReportSortState<TSortKey>;
};

export function useReportTableState<
  TColumnKey extends string,
  TSortKey extends string,
>({ columns, initialSort }: UseReportTableStateOptions<TColumnKey, TSortKey>) {
  const [sort, setSort] = useState<ReportSortState<TSortKey>>(initialSort);
  const [visibleColumns, setVisibleColumns] = useState<ReadonlySet<TColumnKey>>(
    () => new Set(columns),
  );

  const visibleColumnList = useMemo(
    () => columns.filter((column) => visibleColumns.has(column)),
    [columns, visibleColumns],
  );

  function toggleSort(key: TSortKey) {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  }

  function toggleColumn(column: TColumnKey) {
    setVisibleColumns((current) => {
      const next = new Set(current);
      if (next.has(column)) {
        if (next.size === 1) return current;
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  }

  return {
    sort,
    setSort,
    toggleSort,
    visibleColumns,
    visibleColumnList,
    toggleColumn,
  };
}
