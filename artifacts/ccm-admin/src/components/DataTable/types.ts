import type React from "react";

export type Density = "compact" | "comfortable" | "spacious";

export type CellProps = {
  "data-cell": string;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<Element>) => void;
};

export interface ColDef<T> {
  key: string;
  label: string;
  defaultVisible?: boolean;
  defaultWidth?: number;
  sortable?: boolean;
  editable?: boolean;
  render: (row: T) => React.ReactNode;
  getText?: (row: T) => string;
  getEditValue?: (row: T) => string;
  renderEdit?: (
    value: string,
    onChange: (v: string) => void,
    cellProps: CellProps,
  ) => React.ReactNode;
}

export interface DataTableProps<T extends { id: string }> {
  tableId: string;
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  filters?: React.ReactNode;
  toolbarSlot?: React.ReactNode;
  columns: ColDef<T>[];
  data: T[];
  total?: number;
  isLoading?: boolean;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  /**
   * When true, the table receives the full dataset in `data` and paginates it
   * internally — only the current page of rows is rendered to the DOM, while
   * sort/export/print/selection still operate on the complete dataset. Use this
   * for aggregate views (merit list, enrollment) that need every row in memory
   * for ranking/stats but must not render thousands of rows at once.
   */
  clientPaginate?: boolean;
  onSaveRow?: (id: string, edits: Record<string, string>) => Promise<void>;
  rowActions?: (row: T) => React.ReactNode;
  renderExpanded?: (row: T, colSpan: number, onClose: () => void) => React.ReactNode;
  bulkActions?: (selectedIds: string[], clearSelection: () => void) => React.ReactNode;
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  exportFilename?: string;
  printTitle?: string;
  sortState?: { key: string; dir: "asc" | "desc" }[];
  onSortChange?: (newSort: { key: string; dir: "asc" | "desc" }[]) => void;
}
