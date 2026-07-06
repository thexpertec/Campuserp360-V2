import { useState, useCallback, useRef } from "react";

function cellKey(rowId: string, field: string): string {
  return `${rowId}::${field}`;
}

export interface GridEditHook {
  editMode: boolean;
  enterEditMode: () => void;
  discardEdits: () => void;
  getCellValue: (rowId: string, field: string, original: string) => string;
  setCellValue: (rowId: string, field: string, value: string) => void;
  isCellDirty: (rowId: string, field: string, original: string) => boolean;
  hasChanges: boolean;
  pending: Record<string, string>;
  registerCellRef: (rowId: string, field: string, el: HTMLElement | null) => void;
  handleCellKeyDown: (
    e: React.KeyboardEvent,
    rowIdx: number,
    colIdx: number,
    editableFields: string[],
    totalRows: number,
  ) => void;
}

export function useGridEdit<TRow extends { referenceId: string }>(
  rows: TRow[],
): GridEditHook {
  const [editMode, setEditMode] = useState(false);
  const [pending, setPending] = useState<Record<string, string>>({});
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());

  const enterEditMode = useCallback(() => {
    setPending({});
    setEditMode(true);
  }, []);

  const discardEdits = useCallback(() => {
    setPending({});
    setEditMode(false);
  }, []);

  const getCellValue = useCallback(
    (rowId: string, field: string, original: string): string => {
      const k = cellKey(rowId, field);
      return k in pending ? pending[k] : original;
    },
    [pending],
  );

  const setCellValue = useCallback((rowId: string, field: string, value: string) => {
    const k = cellKey(rowId, field);
    setPending((p) => ({ ...p, [k]: value }));
  }, []);

  const isCellDirty = useCallback(
    (rowId: string, field: string, original: string): boolean => {
      const k = cellKey(rowId, field);
      return k in pending && pending[k] !== original;
    },
    [pending],
  );

  const hasChanges = Object.keys(pending).length > 0;

  const registerCellRef = useCallback(
    (rowId: string, field: string, el: HTMLElement | null) => {
      const k = cellKey(rowId, field);
      if (el) cellRefs.current.set(k, el);
      else cellRefs.current.delete(k);
    },
    [],
  );

  const focusCell = useCallback(
    (rowIdx: number, colIdx: number, editableFields: string[], totalRows: number) => {
      if (rowIdx < 0 || rowIdx >= totalRows) return;
      const row = rows[rowIdx];
      if (!row) return;
      const field = editableFields[colIdx];
      if (!field) return;
      const el = cellRefs.current.get(cellKey(row.referenceId, field));
      if (el) {
        (el as HTMLInputElement).focus();
        if ((el as HTMLInputElement).select) (el as HTMLInputElement).select();
      }
    },
    [rows],
  );

  const handleCellKeyDown = useCallback(
    (
      e: React.KeyboardEvent,
      rowIdx: number,
      colIdx: number,
      editableFields: string[],
      totalRows: number,
    ) => {
      const lastCol = editableFields.length - 1;
      switch (e.key) {
        case "Enter":
        case "ArrowDown":
          e.preventDefault();
          focusCell(rowIdx + 1, colIdx, editableFields, totalRows);
          break;
        case "ArrowUp":
          e.preventDefault();
          focusCell(rowIdx - 1, colIdx, editableFields, totalRows);
          break;
        case "ArrowLeft":
          if (colIdx > 0) {
            e.preventDefault();
            focusCell(rowIdx, colIdx - 1, editableFields, totalRows);
          }
          break;
        case "ArrowRight":
          if (colIdx < lastCol) {
            e.preventDefault();
            focusCell(rowIdx, colIdx + 1, editableFields, totalRows);
          }
          break;
        case "Tab":
          e.preventDefault();
          if (e.shiftKey) {
            if (colIdx > 0) focusCell(rowIdx, colIdx - 1, editableFields, totalRows);
            else focusCell(rowIdx - 1, lastCol, editableFields, totalRows);
          } else {
            if (colIdx < lastCol) focusCell(rowIdx, colIdx + 1, editableFields, totalRows);
            else focusCell(rowIdx + 1, 0, editableFields, totalRows);
          }
          break;
        case "Escape":
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
          discardEdits();
          break;
      }
    },
    [focusCell, discardEdits],
  );

  return {
    editMode,
    enterEditMode,
    discardEdits,
    getCellValue,
    setCellValue,
    isCellDirty,
    hasChanges,
    pending,
    registerCellRef,
    handleCellKeyDown,
  };
}
