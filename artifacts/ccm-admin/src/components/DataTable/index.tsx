import React, { useState, useRef, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPrintSettings, buildPrintHtml, escapeHtml, printHtmlDocument } from "@/lib/print-utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Download,
  GripVertical,
  LayoutGrid,
  Loader2,
  PenLine,
  Printer,
  Rows3,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useColState } from "./useColState";
import type { DataTableProps, Density } from "./types";

const DENSITY_PY: Record<Density, string> = {
  compact: "py-1.5",
  comfortable: "py-2.5",
  spacious: "py-4",
};

// Build string rows in chunks, yielding to the event loop between chunks so a
// large export/print build (thousands of rows) doesn't lock the main thread.
async function buildRowsChunked<T>(
  items: readonly T[],
  render: (item: T, index: number) => string,
  chunkSize = 500,
): Promise<string[]> {
  const out: string[] = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    out[i] = render(items[i], i);
    if (i > 0 && i % chunkSize === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  return out;
}

function SortIndicator({
  colKey,
  sortKeys,
}: {
  colKey: string;
  sortKeys: { key: string; dir: "asc" | "desc" }[];
}) {
  const idx = sortKeys.findIndex((k) => k.key === colKey);
  if (idx === -1)
    return (
      <ChevronsUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-400" />
    );
  const { dir } = sortKeys[idx];
  return (
    <span className="flex items-center gap-0.5">
      {dir === "asc" ? (
        <ChevronUp className="h-3 w-3 text-blue-600" />
      ) : (
        <ChevronDown className="h-3 w-3 text-blue-600" />
      )}
      {sortKeys.length > 1 && (
        <span className="text-[9px] font-bold text-blue-500 leading-none">
          {idx + 1}
        </span>
      )}
    </span>
  );
}

export function DataTable<T extends { id: string }>({
  tableId,
  title,
  subtitle,
  action,
  filters,
  toolbarSlot,
  columns,
  data,
  total,
  isLoading,
  page = 1,
  pageSize = 30,
  onPageChange,
  clientPaginate = false,
  onSaveRow,
  rowActions,
  renderExpanded,
  bulkActions,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  exportFilename,
  printTitle,
  sortState,
  onSortChange,
}: DataTableProps<T>) {
  const { toast } = useToast();
  const colState = useColState(tableId, columns);

  const orderedCols = colState.colOrder
    .map((k) => columns.find((c) => c.key === k)!)
    .filter((c) => c && colState.visibility[c.key] !== false);

  // ── Sort ──────────────────────────────────────────────────────────────────
  const [sortKeys, setSortKeys] = useState<
    { key: string; dir: "asc" | "desc" }[]
  >([]);

  const sortedData = useMemo(() => {
    if (onSortChange) return data;
    if (sortKeys.length === 0) return data;
    return [...data].sort((a, b) => {
      for (const { key, dir } of sortKeys) {
        const col = columns.find((c) => c.key === key);
        if (!col?.getText) continue;
        const av = col.getText(a).toLowerCase();
        const bv = col.getText(b).toLowerCase();
        const cmp = av.localeCompare(bv);
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }, [data, sortKeys, onSortChange]);

  function handleHeaderSort(key: string, shiftKey: boolean) {
    const col = columns.find((c) => c.key === key);
    if (!col?.sortable) return;
    if (onSortChange) {
      const current = sortState ?? [];
      const existing = current.find((k) => k.key === key);
      if (shiftKey) {
        if (!existing) onSortChange([...current, { key, dir: "asc" }]);
        else if (existing.dir === "asc")
          onSortChange(current.map((k) => k.key === key ? { ...k, dir: "desc" as const } : k));
        else onSortChange(current.filter((k) => k.key !== key));
      } else {
        if (!existing) onSortChange([{ key, dir: "asc" }]);
        else if (existing.dir === "asc") onSortChange([{ key, dir: "desc" }]);
        else onSortChange([]);
      }
      return;
    }
    setSortKeys((prev) => {
      const existing = prev.find((k) => k.key === key);
      if (shiftKey) {
        if (!existing) return [...prev, { key, dir: "asc" }];
        if (existing.dir === "asc")
          return prev.map((k) => (k.key === key ? { ...k, dir: "desc" } : k));
        return prev.filter((k) => k.key !== key);
      } else {
        if (!existing) return [{ key, dir: "asc" }];
        if (existing.dir === "asc") return [{ key, dir: "desc" }];
        return [];
      }
    });
  }

  const effectiveSortKeys = onSortChange ? (sortState ?? []) : sortKeys;

  // ── Client-side pagination ────────────────────────────────────────────────
  // When `clientPaginate` is set the parent hands us the full dataset; we render
  // only the current page of rows but keep sort/export/print/selection working
  // on the complete `sortedData`.
  const [clientPage, setClientPage] = useState(1);
  const clientTotalPages =
    clientPaginate && pageSize ? Math.ceil(sortedData.length / pageSize) : 0;
  useEffect(() => {
    if (clientPaginate && clientPage > Math.max(1, clientTotalPages)) {
      setClientPage(1);
    }
  }, [clientPaginate, clientPage, clientTotalPages]);
  const pageOffset = clientPaginate ? (clientPage - 1) * pageSize : 0;
  const visibleData = clientPaginate
    ? sortedData.slice(pageOffset, pageOffset + pageSize)
    : sortedData;

  // ── Column drag-to-reorder ─────────────────────────────────────────────
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // ── Column resize ──────────────────────────────────────────────────────
  function startResize(key: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colState.widths[key] ?? 150;
    function onMove(me: MouseEvent) {
      colState.setWidths({
        ...colState.widths,
        [key]: Math.max(60, startW + me.clientX - startX),
      });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Selection ─────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClickIdx, setLastClickIdx] = useState<number | null>(null);
  const allSelected =
    sortedData.length > 0 && sortedData.every((r) => selected.has(r.id));

  function clearSelection() {
    setSelected(new Set());
  }
  function toggleRow(id: string, idx: number, shiftKey: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickIdx !== null) {
        const [lo, hi] = [
          Math.min(lastClickIdx, idx),
          Math.max(lastClickIdx, idx),
        ];
        sortedData.slice(lo, hi + 1).forEach((r) => next.add(r.id));
      } else {
        next.has(id) ? next.delete(id) : next.add(id);
      }
      return next;
    });
    setLastClickIdx(idx);
  }
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) sortedData.forEach((r) => next.delete(r.id));
      else sortedData.forEach((r) => next.add(r.id));
      return next;
    });
  }

  // ── Expanded rows ──────────────────────────────────────────────────────
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  function toggleExpand(id: string) {
    setExpandedRows((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  // ── Inline editing ─────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<
    Record<string, Record<string, string>>
  >({});
  const [savingAll, setSavingAll] = useState(false);
  const savingRowsRef = useRef<Set<string>>(new Set());
  const pendingCount = Object.keys(pendingEdits).length;
  const editableCols = orderedCols.filter((c) => c.editable);

  function setCellEdit(rowId: string, colKey: string, value: string) {
    setPendingEdits((p) => ({
      ...p,
      [rowId]: { ...(p[rowId] ?? {}), [colKey]: value },
    }));
  }

  async function saveRow(id: string) {
    const edits = pendingEdits[id];
    if (!edits || Object.keys(edits).length === 0) return;
    if (savingRowsRef.current.has(id)) return;
    savingRowsRef.current.add(id);
    try {
      await onSaveRow?.(id, edits);
      setPendingEdits((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      toast({ title: "Saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      savingRowsRef.current.delete(id);
    }
  }

  async function saveAll() {
    setSavingAll(true);
    try {
      await Promise.all(Object.keys(pendingEdits).map((id) => saveRow(id)));
    } finally {
      setSavingAll(false);
      setEditMode(false);
    }
  }

  function focusCell(rowId: string, colKey: string) {
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-cell="${rowId}:${colKey}"]`,
      );
      if (el) {
        el.focus();
        (el as HTMLInputElement).select?.();
      }
    }, 0);
  }

  function handleCellKeyDown(
    e: React.KeyboardEvent<Element>,
    row: T,
    colKey: string,
    rowIdx: number,
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      void saveRow(row.id);
      const next = sortedData[rowIdx + 1];
      if (next) focusCell(next.id, colKey);
    } else if (e.key === "Tab") {
      e.preventDefault();
      void saveRow(row.id);
      const colIdx = editableCols.findIndex((c) => c.key === colKey);
      if (e.shiftKey) {
        if (colIdx > 0) focusCell(row.id, editableCols[colIdx - 1].key);
        else if (rowIdx > 0)
          focusCell(
            sortedData[rowIdx - 1].id,
            editableCols[editableCols.length - 1].key,
          );
      } else {
        if (colIdx < editableCols.length - 1)
          focusCell(row.id, editableCols[colIdx + 1].key);
        else {
          const next = sortedData[rowIdx + 1];
          if (next) focusCell(next.id, editableCols[0].key);
        }
      }
    } else if (e.key === "Escape") {
      setPendingEdits((p) => {
        const n = { ...p };
        delete n[row.id];
        return n;
      });
    }
  }

  // ── Export / Print ─────────────────────────────────────────────────────
  function getTargets() {
    return selected.size > 0
      ? sortedData.filter((r) => selected.has(r.id))
      : sortedData;
  }

  async function exportCSV() {
    const targets = getTargets();
    const header = orderedCols.map((c) => c.label).join(",");
    const rows = await buildRowsChunked(targets, (r) =>
      orderedCols
        .map((c) => `"${(c.getText?.(r) ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {
      href: url,
      download: `${exportFilename ?? tableId}-${new Date().toISOString().slice(0, 10)}.csv`,
    }).click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: `${targets.length} rows` });
  }

  async function copyToClipboard() {
    const targets = getTargets();
    const header = orderedCols.map((c) => c.label).join("\t");
    const rows = await buildRowsChunked(targets, (r) =>
      orderedCols.map((c) => c.getText?.(r) ?? "").join("\t"),
    );
    await navigator.clipboard.writeText([header, ...rows].join("\n"));
    toast({ title: "Copied", description: `${targets.length} rows` });
  }

  async function printTable() {
    const settings = await fetchPrintSettings();
    const targets = sortedData;
    const pt = printTitle ?? title;

    const bodyRows = await buildRowsChunked(targets, (r, i) =>
      `<tr style="${i % 2 === 1 ? "background:#f8fafc" : ""}">${orderedCols.map((c) => `<td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;vertical-align:middle">${escapeHtml(c.getText?.(r) ?? "") || "—"}</td>`).join("")}</tr>`,
    );
    const tableHtml = `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px">
  <thead><tr>${orderedCols.map((c) => `<th style="background:#f1f5f9;font-weight:700;text-align:left;padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
  <tbody>${bodyRows.join("")}</tbody>
</table>`;

    const html = buildPrintHtml(tableHtml, settings, pt);
    printHtmlDocument(html);
  }

  const totalCols = 1 + orderedCols.length + (rowActions ? 1 : 0);
  const totalPages =
    total !== undefined && pageSize ? Math.ceil(total / pageSize) : 0;
  const selectedIds = Array.from(selected);

  return (
    <div className="flex flex-col gap-4 max-w-[1600px] mx-auto">
      {/* Zone 1: Title  Zone 2: Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1
            className="text-2xl font-extrabold tracking-tight"
            style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {action}
      </div>

      {/* Zone 3: Filters */}
      {filters}

      {/* Bulk selection bar */}
      {selected.size > 0 && bulkActions && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
          <span className="text-sm font-bold text-blue-800">
            {selected.size} selected
          </span>
          <div className="h-4 w-px bg-blue-200" />
          {bulkActions(selectedIds, clearSelection)}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-muted-foreground"
            onClick={clearSelection}
          >
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      )}

      {/* Zone 4 + 5 + 6: Table card */}
      <div
        className={cn(
          "rounded-2xl border bg-white shadow-sm overflow-hidden flex flex-col transition-all duration-150",
          editMode
            ? "border-amber-300 ring-2 ring-amber-200"
            : "border-border",
        )}
      >
        {/* Zone 4: Toolbar */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-slate-50/60 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Edit / Save / Cancel */}
            {onSaveRow && (
              <>
                {!editMode ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-slate-600 text-xs font-semibold"
                    onClick={() => setEditMode(true)}
                  >
                    <PenLine className="h-3.5 w-3.5" /> Edit
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                      onClick={() => void saveAll()}
                      disabled={savingAll}
                    >
                      {savingAll ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                          Saving…
                        </>
                      ) : (
                        <>
                          <CheckCheck className="h-3.5 w-3.5" />
                          {pendingCount > 0
                            ? `Save ${pendingCount} row${pendingCount > 1 ? "s" : ""}`
                            : "Done"}
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-slate-500"
                      onClick={() => {
                        setPendingEdits({});
                        setEditMode(false);
                      }}
                      disabled={savingAll}
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> Cancel
                    </Button>
                  </div>
                )}
                <div className="h-4 w-px bg-slate-200" />
              </>
            )}

            {/* Columns hide/show */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-slate-600 text-xs"
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  Show / Hide
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columns.map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.key}
                    checked={colState.visibility[col.key] !== false}
                    onCheckedChange={(checked) =>
                      colState.setVisibility({
                        ...colState.visibility,
                        [col.key]: !!checked,
                      })
                    }
                    className="text-sm"
                  >
                    {col.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <button
                  className="w-full text-left text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded"
                  onClick={() => colState.setVisibility(colState.defaultVis)}
                >
                  Reset to defaults
                </button>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Density */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-slate-600 text-xs capitalize"
                >
                  <Rows3 className="h-3.5 w-3.5" /> {colState.density}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  Row Density
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(["compact", "comfortable", "spacious"] as Density[]).map(
                  (d) => (
                    <DropdownMenuItem
                      key={d}
                      onClick={() => colState.setDensity(d)}
                      className={cn(
                        "text-sm cursor-pointer capitalize",
                        colState.density === d && "font-semibold text-blue-600",
                      )}
                    >
                      {d}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Extra toolbar slot */}
            {toolbarSlot}

            <div className="h-4 w-px bg-slate-200" />

            {/* Print */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-slate-600 text-xs"
              onClick={() => { void printTable(); }}
            >
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>

            {selected.size === 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-slate-600 text-xs"
                  onClick={() => void exportCSV()}
                >
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-slate-600 text-xs"
                  onClick={() => void copyToClipboard()}
                >
                  <Clipboard className="h-3.5 w-3.5" /> Copy
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {editMode && (
              <span className="text-[11px] text-amber-700 font-semibold flex items-center gap-1">
                <PenLine className="h-3 w-3" />
                Editing — click any cell · Tab to move · Esc to revert row
                {pendingCount > 0 && (
                  <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-800">
                    {pendingCount} unsaved
                  </span>
                )}
              </span>
            )}
            {!editMode && (
              <span className="text-[11px] font-semibold text-slate-400">
                {isLoading ? "Loading…" : `${sortedData.length} rows`}
              </span>
            )}
          </div>
        </div>

        {/* Zone 5 + 6: Table */}
        <div className="overflow-x-auto">
          <table
            className="w-full text-sm"
            style={{
              tableLayout: "fixed",
              minWidth:
                orderedCols.reduce(
                  (s, c) =>
                    s + (colState.widths[c.key] ?? c.defaultWidth ?? 150),
                  0,
                ) +
                (rowActions ? 64 : 0) +
                40,
            }}
          >
            {/* Zone 5: Column headers */}
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-border">
              <tr>
                <th
                  className="w-10 px-3 py-2.5 text-left"
                  style={{ width: 40 }}
                >
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                {orderedCols.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "relative select-none py-2.5 pl-3 pr-1 text-left transition-colors",
                      dropTarget === col.key && "bg-blue-100",
                      dragCol === col.key && "opacity-40",
                    )}
                    style={{
                      width: colState.widths[col.key] ?? col.defaultWidth ?? 150,
                    }}
                    draggable
                    onDragStart={() => setDragCol(col.key)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropTarget(col.key);
                    }}
                    onDrop={() => {
                      if (!dragCol || dragCol === col.key) {
                        setDragCol(null);
                        setDropTarget(null);
                        return;
                      }
                      const order = [...colState.colOrder];
                      const fromIdx = order.indexOf(dragCol);
                      const toIdx = order.indexOf(col.key);
                      if (fromIdx !== -1 && toIdx !== -1) {
                        order.splice(fromIdx, 1);
                        order.splice(toIdx, 0, dragCol);
                        colState.setRawOrder(order);
                      }
                      setDragCol(null);
                      setDropTarget(null);
                    }}
                    onDragEnd={() => {
                      setDragCol(null);
                      setDropTarget(null);
                    }}
                  >
                    <button
                      onClick={(e) =>
                        col.sortable && handleHeaderSort(col.key, e.shiftKey)
                      }
                      className={cn(
                        "group flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 w-full",
                        col.sortable && "hover:text-slate-700 cursor-pointer",
                      )}
                    >
                      <GripVertical className="h-3 w-3 text-slate-300 cursor-grab shrink-0" />
                      {col.label}
                      {col.sortable && (
                        <SortIndicator
                          colKey={col.key}
                          sortKeys={effectiveSortKeys}
                        />
                      )}
                    </button>
                    <div
                      className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize flex items-center justify-center group"
                      onMouseDown={(e) => startResize(col.key, e)}
                    >
                      <div className="w-px h-4 bg-border group-hover:bg-slate-400 transition-colors" />
                    </div>
                  </th>
                ))}
                {rowActions && (
                  <th
                    className="py-2.5 px-3 text-right"
                    style={{ width: 64 }}
                  />
                )}
              </tr>
            </thead>

            {/* Zone 6: Rows */}
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-4 rounded" />
                    </td>
                    {orderedCols.map((c) => (
                      <td key={c.key} className="px-3 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                    {rowActions && (
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-8 ml-auto" />
                      </td>
                    )}
                  </tr>
                ))
              ) : sortedData.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} className="h-52 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                      {emptyIcon}
                      <p className="font-semibold text-foreground">
                        {emptyTitle ?? "No records found"}
                      </p>
                      {emptyDescription && (
                        <p className="text-sm">{emptyDescription}</p>
                      )}
                      {emptyAction}
                    </div>
                  </td>
                </tr>
              ) : (
                visibleData.map((row, localIdx) => {
                  const rowIdx = pageOffset + localIdx;
                  const isSelected = selected.has(row.id);
                  const isExpanded = expandedRows.has(row.id);
                  const edits = pendingEdits[row.id];
                  const isSavingRow = savingRowsRef.current.has(row.id);
                  const py = DENSITY_PY[colState.density];

                  return (
                    <>
                      <tr
                        key={row.id}
                        className={cn(
                          "group transition-colors",
                          isSelected
                            ? "bg-blue-50/60"
                            : "hover:bg-slate-50/60",
                          isExpanded && "bg-blue-50/30",
                          editMode && edits && "bg-amber-50/40",
                          isSavingRow && "opacity-60",
                        )}
                        onClick={(e) => {
                          if (editMode) return;
                          if (
                            (e.target as HTMLElement).closest(
                              "button,a,input,select,[role=checkbox]",
                            )
                          )
                            return;
                          if (renderExpanded) toggleExpand(row.id);
                        }}
                      >
                        <td
                          className="px-3 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => {}}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRow(
                                row.id,
                                rowIdx,
                                (e as React.MouseEvent).shiftKey,
                              );
                            }}
                          />
                        </td>

                        {orderedCols.map((col) => {
                          if (editMode && col.editable) {
                            const val =
                              pendingEdits[row.id]?.[col.key] ??
                              col.getEditValue?.(row) ??
                              "";
                            const cellProps = {
                              "data-cell": `${row.id}:${col.key}`,
                              onBlur: () => void saveRow(row.id),
                              onKeyDown: (e: React.KeyboardEvent<Element>) =>
                                handleCellKeyDown(e, row, col.key, rowIdx),
                            };
                            return (
                              <td
                                key={col.key}
                                className={cn("px-2", py)}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {col.renderEdit ? (
                                  col.renderEdit(
                                    val,
                                    (v) => setCellEdit(row.id, col.key, v),
                                    cellProps,
                                  )
                                ) : (
                                  <input
                                    {...cellProps}
                                    type="text"
                                    value={val}
                                    onChange={(e) =>
                                      setCellEdit(
                                        row.id,
                                        col.key,
                                        e.target.value,
                                      )
                                    }
                                    className="w-full text-xs border border-slate-200 rounded px-2 py-1 bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                                  />
                                )}
                              </td>
                            );
                          }
                          return (
                            <td
                              key={col.key}
                              className={cn("px-3 truncate", py)}
                              style={{
                                maxWidth:
                                  colState.widths[col.key] ??
                                  col.defaultWidth ??
                                  150,
                              }}
                            >
                              {col.render(row)}
                            </td>
                          );
                        })}

                        {rowActions && (
                          <td
                            className="px-3 py-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {editMode ? (
                              edits ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                                  ● edited
                                </span>
                              ) : null
                            ) : (
                              <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                {rowActions(row)}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>

                      {isExpanded && !editMode && renderExpanded && (
                        <React.Fragment key={`${row.id}-exp`}>
                          {renderExpanded(row, totalCols, () =>
                            toggleExpand(row.id),
                          )}
                        </React.Fragment>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && onPageChange && (
          <div className="flex items-center justify-between border-t border-border bg-slate-50/60 px-4 py-2.5">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {total?.toLocaleString()} total
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg =
                  totalPages <= 5
                    ? i + 1
                    : page <= 3
                      ? i + 1
                      : page >= totalPages - 2
                        ? totalPages - 4 + i
                        : page - 2 + i;
                return (
                  <Button
                    key={pg}
                    variant={pg === page ? "default" : "ghost"}
                    size="sm"
                    className="h-7 w-7 p-0 text-xs"
                    onClick={() => onPageChange(pg)}
                  >
                    {pg}
                  </Button>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Client-side pagination */}
        {clientPaginate && clientTotalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border bg-slate-50/60 px-4 py-2.5">
            <span className="text-xs text-muted-foreground">
              Page {clientPage} of {clientTotalPages} ·{" "}
              {sortedData.length.toLocaleString()} total
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setClientPage((p) => Math.max(1, p - 1))}
                disabled={clientPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(5, clientTotalPages) }, (_, i) => {
                const pg =
                  clientTotalPages <= 5
                    ? i + 1
                    : clientPage <= 3
                      ? i + 1
                      : clientPage >= clientTotalPages - 2
                        ? clientTotalPages - 4 + i
                        : clientPage - 2 + i;
                return (
                  <Button
                    key={pg}
                    variant={pg === clientPage ? "default" : "ghost"}
                    size="sm"
                    className="h-7 w-7 p-0 text-xs"
                    onClick={() => setClientPage(pg)}
                  >
                    {pg}
                  </Button>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() =>
                  setClientPage((p) => Math.min(clientTotalPages, p + 1))
                }
                disabled={clientPage >= clientTotalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export type { ColDef, DataTableProps } from "./types";
