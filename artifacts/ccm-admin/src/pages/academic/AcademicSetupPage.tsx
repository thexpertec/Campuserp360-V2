import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminAcademicYears, getListAdminAcademicYearsQueryKey, getListActiveAcademicYearsQueryKey,
  useCreateAdminAcademicYear, useUpdateAdminAcademicYear, useDeleteAdminAcademicYear, useAdminReorderAcademicYears,
  useListAdminClassCategories, getListAdminClassCategoriesQueryKey, getListActiveClassCategoriesQueryKey,
  useCreateAdminClassCategory, useUpdateAdminClassCategory, useDeleteAdminClassCategory, useAdminReorderClassCategories,
  useListAdminClasses, getListAdminClassesQueryKey, getListActiveClassesQueryKey,
  useCreateAdminClass, useUpdateAdminClass, useDeleteAdminClass, useAdminReorderClasses,
  useListAdminSections, getListAdminSectionsQueryKey, getListActiveSectionsQueryKey,
  useCreateAdminSection, useUpdateAdminSection, useDeleteAdminSection, useAdminReorderSections,
  useListAdminSubjects, getListAdminSubjectsQueryKey, getListActiveSubjectsQueryKey,
  useCreateAdminSubject, useUpdateAdminSubject, useDeleteAdminSubject, useAdminReorderSubjects,
} from "@workspace/api-client-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CalendarRange, Layers, GraduationCap, Grid2x2, BookOpen,
  Plus, Trash2, Search, Loader2, CheckCircle2, ChevronDown, X, Star, Lock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Sheet = "years" | "categories" | "classes" | "sections" | "subjects";

type ColType = "text" | "number" | "select" | "multiselect" | "color" | "toggle";

type SheetCol = {
  key: string;
  label: string;
  width: number;
  type: ColType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  readOnlyForExisting?: boolean;
};

type SheetDef = {
  key: Sheet;
  label: string;
  icon: React.ElementType;
  color: string;
  cols: SheetCol[];
};

// ─── Sheet definitions ────────────────────────────────────────────────────────

const SUBJECT_TYPES = [
  { value: "theory",    label: "Theory"    },
  { value: "practical", label: "Practical" },
  { value: "combined",  label: "Combined"  },
];

const TERM_TYPES = [
  { value: "annual",   label: "Annual"   },
  { value: "semester", label: "Semester" },
];

function buildSheets(
  categoryOptions: { value: string; label: string }[],
  yearOptions: { value: string; label: string }[],
  sectionOptions: { value: string; label: string }[],
  subjectOptions: { value: string; label: string }[],
): SheetDef[] {
  return [
    {
      key: "years", label: "Academic Years", icon: CalendarRange, color: "#6366f1",
      cols: [
        { key: "name", label: "Year Name", width: 260, type: "text", required: true, placeholder: "e.g. 2025–2026" },
        { key: "active", label: "Active", width: 90, type: "toggle" },
      ],
    },
    {
      key: "categories", label: "Categories", icon: Layers, color: "#0891b2",
      cols: [
        { key: "name",   label: "Category Name", width: 260, type: "text",   required: true, placeholder: "e.g. Junior, Senior" },
        { key: "active", label: "Active",         width: 90,  type: "toggle" },
      ],
    },
    {
      key: "sections", label: "Sections", icon: Grid2x2, color: "#d97706",
      cols: [
        { key: "name",     label: "Section Name", width: 200, type: "text",   required: true, placeholder: "e.g. Alpha, Bravo" },
        { key: "capacity", label: "Capacity",     width: 110, type: "number", placeholder: "0"  },
        { key: "active",   label: "Active",       width: 90,  type: "toggle" },
      ],
    },
    {
      key: "subjects", label: "Subjects", icon: BookOpen, color: "#dc2626",
      cols: [
        { key: "code",      label: "Code",         width: 110, type: "text",   required: true, placeholder: "e.g. MATH", readOnlyForExisting: true  },
        { key: "name",      label: "Subject Name", width: 200, type: "text",   required: true, placeholder: "e.g. Mathematics" },
        { key: "type",      label: "Type",         width: 130, type: "select", options: SUBJECT_TYPES },
        { key: "active",    label: "Active",       width: 90,  type: "toggle" },
      ],
    },
    {
      key: "classes", label: "Classes/Programs", icon: GraduationCap, color: "#059669",
      cols: [
        { key: "code",           label: "Code",     width: 120, type: "text",        required: true, placeholder: "e.g. class-7", readOnlyForExisting: true  },
        { key: "name",           label: "Name",     width: 180, type: "text",        required: true, placeholder: "e.g. Class VII" },
        { key: "academicYearIds", label: "Sessions",   width: 200, type: "multiselect", options: yearOptions,    placeholder: "Pick sessions…" },
        { key: "termType",       label: "Term Type",  width: 130, type: "select",      options: TERM_TYPES,      required: true },
        { key: "termCount",      label: "# Terms",    width: 90,  type: "number",                               placeholder: "1" },
        { key: "categoryId",     label: "Category",   width: 140, type: "select",      options: categoryOptions, placeholder: "Select…" },
        { key: "sectionIds",     label: "Sections", width: 200, type: "multiselect", options: sectionOptions, placeholder: "Pick sections…" },
        { key: "subjectIds",     label: "Subjects", width: 240, type: "multiselect", options: subjectOptions, placeholder: "Pick subjects…" },
        { key: "seats",          label: "Total Seats", width: 100, type: "number",   placeholder: "0" },
        { key: "active",         label: "Active",   width: 90,  type: "toggle" },
      ],
    },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getField(row: any, key: string): string {
  if (row === null || row === undefined) return "";
  const v = row[key];
  if (v === null || v === undefined) return "";
  return String(v);
}

function NEW_ID() { return "__new__"; }
function isNew(id: string) { return id === "__new__"; }

function buildBlank(cols: SheetCol[]): Record<string, string> {
  const v: Record<string, string> = {};
  for (const c of cols) {
    if (c.type === "toggle") v[c.key] = "true";
    else if (c.type === "number") v[c.key] = "";
    else if (c.type === "select" && c.options?.length) v[c.key] = c.options[0].value;
    else v[c.key] = "";
  }
  return v;
}

// ─── SingleSelect cell — searchable panel (portalled) ────────────────────────

interface SelectCellProps {
  val: string;
  col: SheetCol;
  rowId: string;
  isNewRow: boolean;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onCellEdit: (rowId: string, col: string, value: string) => void;
  onSave: (rowId: string) => void;
}

function SelectCell({
  val, col, rowId, isNewRow, focused,
  onFocus, onBlur, onKeyDown, onCellEdit, onSave,
}: SelectCellProps) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const panelRef        = useRef<HTMLDivElement>(null);
  const searchRef       = useRef<HTMLInputElement>(null);
  const suppressBlurRef = useRef(false);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [query, setQuery]     = useState("");

  useEffect(() => {
    if (focused && containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      const panelWidth = Math.max(r.width, 200);
      const spaceBelow = window.innerHeight - r.bottom;
      const top = spaceBelow > 200 ? r.bottom + 2 : r.top - 204;
      setDropPos({ top, left: r.left, width: panelWidth });
      setQuery("");
      setTimeout(() => searchRef.current?.focus(), 30);
    } else {
      setDropPos(null);
      setQuery("");
    }
  }, [focused]);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return col.options!;
    const q = query.toLowerCase();
    return col.options!.filter(o => o.label.toLowerCase().includes(q));
  }, [col.options, query]);

  const selectedLabel = col.options!.find(o => o.value === val)?.label ?? "";

  function pick(optValue: string) {
    onCellEdit(rowId, col.key, optValue);
    if (!isNewRow) onSave(rowId);
    onBlur();
  }

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={0}
        data-cell={`${rowId}:${col.key}`}
        onFocus={onFocus}
        onBlur={e => {
          if (suppressBlurRef.current) return;
          if (panelRef.current?.contains(e.relatedTarget as Node)) return;
          onBlur();
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "w-full h-full flex items-center gap-1 px-2 overflow-hidden cursor-pointer outline-none select-none",
          focused ? "bg-indigo-50" : "hover:bg-slate-50",
        )}
      >
        {selectedLabel ? (
          <span className="text-[12.5px] flex-1 truncate text-slate-800">{selectedLabel}</span>
        ) : (
          <span className="text-slate-300 text-[12px] flex-1">{col.placeholder ?? "Select…"}</span>
        )}
        <ChevronDown className={cn("h-3 w-3 text-slate-400 shrink-0 transition-transform", focused ? "rotate-180" : "")} />
      </div>

      {focused && dropPos && createPortal(
        <div
          ref={panelRef}
          tabIndex={-1}
          style={{ position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          onMouseDown={e => {
            e.preventDefault();
            suppressBlurRef.current = true;
            requestAnimationFrame(() => { suppressBlurRef.current = false; });
          }}
          onBlur={e => {
            if (suppressBlurRef.current) return;
            if (!panelRef.current?.contains(e.relatedTarget as Node) &&
                !containerRef.current?.contains(e.relatedTarget as Node)) {
              onBlur();
            }
          }}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${col.label.toLowerCase()}…`}
              className="flex-1 text-[12.5px] outline-none bg-transparent placeholder:text-slate-300"
            />
            {query && (
              <button onMouseDown={e => { e.preventDefault(); setQuery(""); }}
                className="text-slate-400 hover:text-slate-600">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="overflow-y-auto max-h-48">
            {!col.required && (
              <div
                onMouseDown={e => { e.preventDefault(); pick(""); }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none transition-colors italic",
                  val === "" ? "bg-indigo-50 text-indigo-700" : "text-slate-400 hover:bg-slate-50",
                )}
              >
                <span className="text-[13px]">— None —</span>
              </div>
            )}
            {filteredOptions.length === 0 && (
              <p className="px-4 py-4 text-[12px] text-slate-400 text-center italic">No matches found</p>
            )}
            {filteredOptions.map(opt => (
              <div
                key={opt.value}
                onMouseDown={e => { e.preventDefault(); pick(opt.value); }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none transition-colors",
                  val === opt.value ? "bg-indigo-50 hover:bg-indigo-100" : "hover:bg-slate-50",
                )}
              >
                <div className={cn(
                  "h-[16px] w-[16px] rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
                  val === opt.value ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-white",
                )}>
                  {val === opt.value && <div className="h-[6px] w-[6px] rounded-full bg-white" />}
                </div>
                <span className={cn(
                  "text-[13px] flex-1",
                  val === opt.value ? "text-indigo-900 font-medium" : "text-slate-700",
                )}>
                  {opt.label}
                </span>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── MultiSelect cell — searchable panel (portalled to escape overflow clipping) ──

interface MultiSelectCellProps {
  val: string;
  col: SheetCol;
  rowId: string;
  isNewRow: boolean;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onCellEdit: (rowId: string, col: string, value: string) => void;
  onSave: (rowId: string, patch: Record<string, string>) => void;
}

function MultiSelectCell({
  val, col, rowId, isNewRow, focused,
  onFocus, onBlur, onKeyDown, onCellEdit, onSave,
}: MultiSelectCellProps) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const panelRef        = useRef<HTMLDivElement>(null);
  const searchRef       = useRef<HTMLInputElement>(null);
  const suppressBlurRef = useRef(false);
  const [dropPos, setDropPos]   = useState<{ top: number; left: number; width: number } | null>(null);
  const [query,   setQuery]     = useState("");

  // Local selection state — governs checkbox display immediately on click,
  // without depending on the parent draft-clear/refetch round-trip.
  const [localIds, setLocalIds] = useState<string[]>(() =>
    val ? val.split(",").filter(Boolean) : [],
  );

  // Sync local state when the authoritative val changes from outside
  // (e.g. fresh server data after a refetch).
  // Guard: skip the sync while the panel is open so that the optimistic
  // localIds set by toggle() isn't wiped by the stale val that results from
  // saveExistingRow() clearing cellValues before the API responds.
  useEffect(() => {
    if (focused) return;
    setLocalIds(val ? val.split(",").filter(Boolean) : []);
  }, [val, focused]);

  // Position the panel below the trigger whenever it opens
  useEffect(() => {
    if (focused && containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      const panelWidth = Math.max(r.width, 280);
      // flip up if near bottom of viewport
      const spaceBelow = window.innerHeight - r.bottom;
      const top = spaceBelow > 240 ? r.bottom + 4 : r.top - 244;
      setDropPos({ top, left: r.left, width: panelWidth });
      setQuery("");
      setTimeout(() => searchRef.current?.focus(), 30);
    } else {
      setDropPos(null);
      setQuery("");
    }
  }, [focused]);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return col.options!;
    const q = query.toLowerCase();
    return col.options!.filter(o => o.label.toLowerCase().includes(q));
  }, [col.options, query]);

  function toggle(optValue: string) {
    const checked = localIds.includes(optValue);
    const newIds  = checked
      ? localIds.filter(id => id !== optValue)
      : [...localIds, optValue];
    setLocalIds(newIds);
    const newVal  = newIds.join(",");
    onCellEdit(rowId, col.key, newVal);
    if (!isNewRow) onSave(rowId, { [col.key]: newVal });
  }

  function selectAll() {
    const allIds = filteredOptions.map(o => o.value);
    const merged = Array.from(new Set([...localIds, ...allIds]));
    setLocalIds(merged);
    const newVal = merged.join(",");
    onCellEdit(rowId, col.key, newVal);
    if (!isNewRow) onSave(rowId, { [col.key]: newVal });
  }

  function clearAll() {
    setLocalIds([]);
    onCellEdit(rowId, col.key, "");
    if (!isNewRow) onSave(rowId, { [col.key]: "" });
  }

  const selectedLabels = localIds
    .map(id => col.options!.find(o => o.value === id)?.label)
    .filter(Boolean) as string[];

  const allFilteredSelected = filteredOptions.length > 0 &&
    filteredOptions.every(o => localIds.includes(o.value));

  return (
    <>
      {/* Trigger chip */}
      <div
        ref={containerRef}
        tabIndex={0}
        data-cell={`${rowId}:${col.key}`}
        onFocus={onFocus}
        onBlur={e => {
          if (suppressBlurRef.current) return;
          if (panelRef.current?.contains(e.relatedTarget as Node)) return;
          onBlur();
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "w-full h-full flex items-center gap-1 px-2 overflow-hidden cursor-pointer outline-none select-none",
          focused ? "bg-indigo-50" : "hover:bg-slate-50",
        )}
      >
        {selectedLabels.length === 0 ? (
          <span className="text-slate-300 text-[12px] flex-1">{col.placeholder ?? "None"}</span>
        ) : (
          <span className="flex items-center gap-1 flex-1 overflow-hidden min-w-0">
            {selectedLabels.slice(0, 3).map((label, i) => (
              <span key={i} className="inline-flex items-center px-1.5 py-0 rounded text-[11px] bg-indigo-100 text-indigo-700 whitespace-nowrap shrink-0">
                {label}
              </span>
            ))}
            {selectedLabels.length > 3 && (
              <span className="text-[11px] text-slate-500 shrink-0">+{selectedLabels.length - 3}</span>
            )}
          </span>
        )}
        <ChevronDown className={cn("h-3 w-3 text-slate-400 shrink-0 transition-transform", focused ? "rotate-180" : "")} />
      </div>

      {/* Portal panel */}
      {focused && dropPos && createPortal(
        <div
          ref={panelRef}
          tabIndex={-1}
          style={{ position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          onMouseDown={e => {
            e.preventDefault();
            suppressBlurRef.current = true;
            requestAnimationFrame(() => { suppressBlurRef.current = false; });
          }}
          onBlur={e => {
            if (suppressBlurRef.current) return;
            if (!panelRef.current?.contains(e.relatedTarget as Node) &&
                !containerRef.current?.contains(e.relatedTarget as Node)) {
              onBlur();
            }
          }}
        >
          {/* Search bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${col.label.toLowerCase()}…`}
              className="flex-1 text-[12.5px] outline-none bg-transparent placeholder:text-slate-300"
            />
            {query && (
              <button onMouseDown={e => { e.preventDefault(); setQuery(""); }}
                className="text-slate-400 hover:text-slate-600">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Select-all / Clear bar */}
          {col.options!.length > 0 && (
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50">
              <button
                onMouseDown={e => { e.preventDefault(); allFilteredSelected ? clearAll() : selectAll(); }}
                className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
              >
                {allFilteredSelected ? "Deselect all" : "Select all"}
                {query ? " filtered" : ""}
              </button>
              {localIds.length > 0 && (
                <button
                  onMouseDown={e => { e.preventDefault(); clearAll(); }}
                  className="text-[11px] text-slate-500 hover:text-red-500 flex items-center gap-1"
                >
                  <X className="h-2.5 w-2.5" /> Clear ({localIds.length})
                </button>
              )}
            </div>
          )}

          {/* Options list */}
          <div className="overflow-y-auto max-h-48">
            {filteredOptions.length === 0 && (
              <p className="px-4 py-4 text-[12px] text-slate-400 text-center italic">
                {col.options!.length === 0 ? "No options available yet" : "No matches found"}
              </p>
            )}
            {filteredOptions.map(opt => {
              const checked = localIds.includes(opt.value);
              return (
                <div
                  key={opt.value}
                  onMouseDown={e => { e.preventDefault(); toggle(opt.value); }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none transition-colors",
                    checked ? "bg-indigo-50 hover:bg-indigo-100" : "hover:bg-slate-50",
                  )}
                >
                  {/* Big visual checkbox */}
                  <div className={cn(
                    "h-4.5 w-4.5 rounded flex items-center justify-center shrink-0 border transition-colors",
                    "h-[18px] w-[18px]",
                    checked ? "bg-indigo-600 border-indigo-600" : "border-slate-300 bg-white",
                  )}>
                    {checked && <CheckCircle2 className="h-3 w-3 text-white" />}
                  </div>
                  <span className={cn(
                    "text-[13px] flex-1",
                    checked ? "text-indigo-900 font-medium" : "text-slate-700",
                  )}>
                    {opt.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer count */}
          {localIds.length > 0 && (
            <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500">
              {localIds.length} selected
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Spreadsheet table ────────────────────────────────────────────────────────

interface SpreadsheetTableProps {
  sheet: SheetDef;
  rows: any[];
  isLoading: boolean;
  isSaving: boolean;
  onSaveRow: (id: string | undefined, values: Record<string, string>) => void;
  onDeleteRows: (ids: string[]) => void;
  onSetDefault?: (id: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => void;
}

const COL_WIDTHS_TOKEN_KEY = "ccm_admin_token";

function authHdr(): Record<string, string> {
  const t = localStorage.getItem(COL_WIDTHS_TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function fetchColWidths(sheetKey: string): Promise<Record<string, number>> {
  try {
    const r = await fetch(`/api/admin/settings/column-widths`, { headers: authHdr() });
    if (!r.ok) return {};
    const data = await r.json() as Record<string, Record<string, number>>;
    return data[sheetKey] ?? {};
  } catch { return {}; }
}

async function saveColWidths(sheetKey: string, widths: Record<string, number>) {
  try {
    await fetch(`/api/admin/settings/column-widths`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHdr() },
      body: JSON.stringify({ sheetKey, widths }),
    });
  } catch { /* silent */ }
}

function SortableSheetRow({
  id, dragDisabled, className, children,
}: {
  id: string;
  dragDisabled: boolean;
  className?: string;
  children: (handle: { attributes: any; listeners: any }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: dragDisabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging ? "#eef2ff" : undefined,
    position: isDragging ? "relative" : undefined,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <tr ref={setNodeRef} style={style} className={className}>
      {children({ attributes, listeners })}
    </tr>
  );
}

function SpreadsheetTable({
  sheet, rows, isLoading, isSaving, onSaveRow, onDeleteRows, onSetDefault, onReorder,
}: SpreadsheetTableProps) {
  const { toast } = useToast();
  const [focusedCell, setFocusedCell] = useState<{ rowId: string; col: string } | null>(null);
  const [cellValues, setCellValues] = useState<Record<string, Record<string, string>>>({});
  const cellValuesRef = useRef<Record<string, Record<string, string>>>({});
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>(buildBlank(sheet.cols));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const savingRef = useRef<Set<string>>(new Set());
  const dirtyRef  = useRef<Set<string>>(new Set());
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Drag-to-reorder ────────────────────────────────────────────────────────
  const [orderedRows, setOrderedRows] = useState<any[]>(rows);
  useEffect(() => { setOrderedRows(rows); }, [rows]);
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const dragDisabled = !!search.trim() || focusedCell !== null || dirtyRef.current.size > 0;
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedRows.findIndex((r: any) => r.id === active.id);
    const newIndex = orderedRows.findIndex((r: any) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(orderedRows, oldIndex, newIndex);
    setOrderedRows(next);
    onReorder(next.map((r: any) => r.id));
  }

  // ── Column widths (global, persisted server-side) ──────────────────────────
  const [colWidths, setColWidthsState] = useState<Record<string, number>>({});
  const colWidthsRef = useRef<Record<string, number>>({});

  function setColWidths(w: Record<string, number>) {
    colWidthsRef.current = w;
    setColWidthsState(w);
  }

  function effectiveWidth(col: SheetCol) {
    return colWidthsRef.current[col.key] ?? col.width;
  }

  // Load saved widths from server when sheet changes
  useEffect(() => {
    fetchColWidths(sheet.key).then(setColWidths);
  }, [sheet.key]);

  // Drag-resize handler
  function handleResizeStart(col: SheetCol, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = effectiveWidth(col);

    function onMove(me: MouseEvent) {
      const newW = Math.max(48, startWidth + (me.clientX - startX));
      const next = { ...colWidthsRef.current, [col.key]: newW };
      colWidthsRef.current = next;
      setColWidthsState({ ...next });
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      saveColWidths(sheet.key, colWidthsRef.current);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Reset local state when sheet changes
  useEffect(() => {
    setFocusedCell(null);
    cellValuesRef.current = {};
    setCellValues({});
    setNewRowValues(buildBlank(sheet.cols));
    setSelected(new Set());
    setSearch("");
  }, [sheet.key]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!search.trim()) return orderedRows;
    const q = search.toLowerCase();
    return orderedRows.filter(r =>
      sheet.cols.some(c => {
        const v = getField(r, c.key).toLowerCase();
        return v.includes(q);
      })
    );
  }, [orderedRows, search, sheet.cols]);

  // Cell display value (local edit overrides server value)
  function displayValue(rowId: string, col: string, serverRow: any): string {
    return cellValues[rowId]?.[col] ?? getField(serverRow, col);
  }

  function newDisplayValue(col: string): string {
    return newRowValues[col] ?? "";
  }

  // ── Focus helpers ─────────────────────────────────────────────────────────

  const editableCols = sheet.cols; // all cols are editable

  function focusCell(rowId: string, col: string) {
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-cell="${rowId}:${col}"]`);
      if (el) { el.focus(); (el as HTMLInputElement).select?.(); }
    }, 0);
  }

  function nextCellDown(rowId: string, col: string) {
    // Find next row
    const allRowIds = [...filteredRows.map((r: any) => r.id), NEW_ID()];
    const curIdx = allRowIds.indexOf(rowId);
    if (curIdx < allRowIds.length - 1) focusCell(allRowIds[curIdx + 1], col);
  }

  function nextCellRight(rowId: string, col: string) {
    const curColIdx = editableCols.findIndex(c => c.key === col);
    if (curColIdx < editableCols.length - 1) {
      focusCell(rowId, editableCols[curColIdx + 1].key);
    } else {
      // wrap to first col of next row
      const allRowIds = [...filteredRows.map((r: any) => r.id), NEW_ID()];
      const curRowIdx = allRowIds.indexOf(rowId);
      if (curRowIdx < allRowIds.length - 1) focusCell(allRowIds[curRowIdx + 1], editableCols[0].key);
    }
  }

  function prevCellLeft(rowId: string, col: string) {
    const curColIdx = editableCols.findIndex(c => c.key === col);
    if (curColIdx > 0) {
      focusCell(rowId, editableCols[curColIdx - 1].key);
    } else {
      const allRowIds = [...filteredRows.map((r: any) => r.id), NEW_ID()];
      const curRowIdx = allRowIds.indexOf(rowId);
      if (curRowIdx > 0) focusCell(allRowIds[curRowIdx - 1], editableCols[editableCols.length - 1].key);
    }
  }

  // ── Cell change & keyboard ────────────────────────────────────────────────

  function setCellEdit(rowId: string, col: string, value: string) {
    if (isNew(rowId)) {
      setNewRowValues(p => ({ ...p, [col]: value }));
    } else {
      cellValuesRef.current = {
        ...cellValuesRef.current,
        [rowId]: { ...(cellValuesRef.current[rowId] ?? {}), [col]: value },
      };
      setCellValues(cellValuesRef.current);
      dirtyRef.current.add(rowId);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, rowId: string, col: string) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isNew(rowId)) saveNewRow();
      else saveExistingRow(rowId);
      nextCellDown(rowId, col);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (isNew(rowId)) saveNewRowIfReady();
      else saveExistingRow(rowId);
      if (e.shiftKey) prevCellLeft(rowId, col);
      else nextCellRight(rowId, col);
    } else if (e.key === "Escape") {
      if (isNew(rowId)) setNewRowValues(buildBlank(sheet.cols));
      else {
        delete cellValuesRef.current[rowId];
        setCellValues({ ...cellValuesRef.current });
        dirtyRef.current.delete(rowId);
      }
      (e.target as HTMLElement).blur();
    }
  }

  function handleBlur(rowId: string) {
    if (isNew(rowId)) return; // new row saves only on Enter/Tab
    if (!dirtyRef.current.has(rowId)) return;
    saveExistingRow(rowId);
  }

  // ── Save logic ───────────────────────────────────────────────────────────

  function saveExistingRow(rowId: string) {
    const edits = cellValuesRef.current[rowId];
    if (!edits || Object.keys(edits).length === 0) { dirtyRef.current.delete(rowId); return; }
    if (savingRef.current.has(rowId)) return;
    // Merge edits with current server row
    const serverRow = rows.find(r => r.id === rowId);
    if (!serverRow) return;
    const merged: Record<string, string> = {};
    for (const c of sheet.cols) merged[c.key] = edits[c.key] ?? getField(serverRow, c.key);
    savingRef.current.add(rowId);
    dirtyRef.current.delete(rowId);
    onSaveRow(rowId, merged);
    // Clear local edits after save
    delete cellValuesRef.current[rowId];
    setCellValues({ ...cellValuesRef.current });
    savingRef.current.delete(rowId);
  }

  function saveExistingRowWithPatch(rowId: string, patch: Record<string, string>) {
    const serverRow = rows.find((r: any) => r.id === rowId);
    if (!serverRow) return;
    const edits = { ...(cellValuesRef.current[rowId] ?? {}), ...patch };
    cellValuesRef.current = { ...cellValuesRef.current };
    delete cellValuesRef.current[rowId];
    const merged: Record<string, string> = {};
    for (const c of sheet.cols) merged[c.key] = edits[c.key] ?? getField(serverRow, c.key);
    onSaveRow(rowId, merged);
    setCellValues({ ...cellValuesRef.current });
    dirtyRef.current.delete(rowId);
  }

  // Debounced save — batches rapid select/multiselect changes into one request
  function scheduleSave(rowId: string, delay = 400) {
    clearTimeout(debounceTimers.current[rowId]);
    debounceTimers.current[rowId] = setTimeout(() => {
      delete debounceTimers.current[rowId];
      saveExistingRow(rowId);
    }, delay);
  }

  function saveNewRow() {
    const required = sheet.cols.filter(c => c.required);
    const missing  = required.find(c => !newRowValues[c.key]?.trim());
    if (missing) { toast({ title: `${missing.label} is required`, variant: "destructive" }); return; }
    onSaveRow(undefined, newRowValues);
    setNewRowValues(buildBlank(sheet.cols));
    // Move focus to new row first col after save
    setTimeout(() => focusCell(NEW_ID(), sheet.cols[0].key), 100);
  }

  function saveNewRowIfReady() {
    const required = sheet.cols.filter(c => c.required);
    const allFilled = required.every(c => newRowValues[c.key]?.trim());
    if (allFilled) saveNewRow();
  }

  // ── Selection & delete ───────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSelectAll() {
    if (selected.size === filteredRows.length && filteredRows.length > 0) setSelected(new Set());
    else setSelected(new Set(filteredRows.map((r: any) => r.id)));
  }
  function handleDeleteSelected() {
    const deletedIds = new Set([...selected]);
    setOrderedRows(prev => prev.filter((r: any) => !deletedIds.has(r.id)));
    onDeleteRows([...selected]);
    setSelected(new Set());
    setDeleteConfirm(false);
  }

  // ── Cell rendering ────────────────────────────────────────────────────────

  function renderCell(rowId: string, col: SheetCol, isNewRow = false) {
    const val   = isNewRow ? newDisplayValue(col.key) : displayValue(rowId, col.key, rows.find(r => r.id === rowId));

    if (col.readOnlyForExisting && !isNewRow) {
      return (
        <div
          className="w-full h-full px-2 text-[12.5px] text-slate-400 bg-slate-50 flex items-center gap-1.5 cursor-default select-text"
          title="Subject code is set at creation and cannot be changed"
        >
          <Lock className="h-3 w-3 text-slate-300 shrink-0" />
          <span>{val}</span>
        </div>
      );
    }

    const attrs = {
      "data-cell": `${rowId}:${col.key}`,
      onFocus:     () => setFocusedCell({ rowId, col: col.key }),
      onBlur:      () => { setFocusedCell(null); handleBlur(rowId); },
      onKeyDown:   (e: React.KeyboardEvent) => handleKeyDown(e, rowId, col.key),
    };

    if (col.type === "toggle") {
      return (
        <label className="flex items-center justify-center cursor-pointer h-full w-full" onClick={e => e.stopPropagation()}>
          <input
            {...attrs}
            type="checkbox"
            checked={val === "true" || val === "1"}
            onChange={e => { setCellEdit(rowId, col.key, e.target.checked ? "true" : "false"); if (!isNewRow) saveExistingRow(rowId); }}
            className="h-4 w-4 rounded accent-indigo-600 cursor-pointer"
          />
        </label>
      );
    }

    if (col.type === "color") {
      return (
        <div className="flex items-center gap-1.5 px-1">
          <input type="color" value={val || "#6366f1"}
            onChange={e => setCellEdit(rowId, col.key, e.target.value)}
            onBlur={() => handleBlur(rowId)}
            className="h-6 w-6 rounded cursor-pointer border-0 bg-transparent p-0" />
          <span className="font-mono text-[11px] text-slate-400">{val}</span>
        </div>
      );
    }

    if (col.type === "select" && col.options) {
      const isFocused = focusedCell?.rowId === rowId && focusedCell?.col === col.key;
      return (
        <SelectCell
          val={val}
          col={col}
          rowId={rowId}
          isNewRow={isNewRow}
          focused={isFocused}
          onFocus={() => setFocusedCell({ rowId, col: col.key })}
          onBlur={() => { setFocusedCell(null); handleBlur(rowId); }}
          onKeyDown={(e) => handleKeyDown(e, rowId, col.key)}
          onCellEdit={setCellEdit}
          onSave={(rid) => scheduleSave(rid)}
        />
      );
    }

    if (col.type === "multiselect" && col.options) {
      const isFocused = focusedCell?.rowId === rowId && focusedCell?.col === col.key;
      return (
        <MultiSelectCell
          val={val}
          col={col}
          rowId={rowId}
          isNewRow={isNewRow}
          focused={isFocused}
          onFocus={() => setFocusedCell({ rowId, col: col.key })}
          onBlur={() => { setFocusedCell(null); handleBlur(rowId); }}
          onKeyDown={(e) => handleKeyDown(e, rowId, col.key)}
          onCellEdit={setCellEdit}
          onSave={(rid) => scheduleSave(rid)}
        />
      );
    }

    return (
      <input
        {...attrs}
        type={col.type === "number" ? "number" : "text"}
        value={val}
        placeholder={col.placeholder}
        onChange={e => setCellEdit(rowId, col.key, e.target.value)}
        className="w-full h-full px-2 text-[12.5px] bg-transparent outline-none focus:bg-indigo-50 placeholder:text-slate-300"
      />
    );
  }

  const allSelected = filteredRows.length > 0 && selected.size === filteredRows.length;

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder={`Search ${sheet.label.toLowerCase()}…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 h-7 text-xs rounded-lg border border-slate-200 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
          />
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" className="h-7 text-xs gap-1.5"
              onClick={() => setDeleteConfirm(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size} row{selected.size > 1 ? "s" : ""}
            </Button>
          )}
          <Button size="sm" className="h-7 text-xs gap-1.5" style={{ backgroundColor: sheet.color, borderColor: sheet.color }}
            onClick={() => { setNewRowValues(buildBlank(sheet.cols)); setTimeout(() => focusCell(NEW_ID(), sheet.cols[0].key), 50); }}>
            <Plus className="h-3.5 w-3.5" /> Add Row
          </Button>
          <span className="text-[11px] text-slate-400 ml-2">
            {isLoading ? "Loading…" : `${filteredRows.length} row${filteredRows.length !== 1 ? "s" : ""}`}
            {search && rows.length !== filteredRows.length && ` of ${rows.length}`}
          </span>
          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />}
        </div>
      </div>

      {/* Spreadsheet grid */}
      <div className="overflow-auto flex-1">
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <table className="w-full text-sm border-collapse" style={{ minWidth: sheet.cols.reduce((s, c) => s + effectiveWidth(c), 0) + 100 }}>

          {/* Header */}
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100 border-b-2 border-slate-300">
              <th className="w-10 px-3 py-2 text-left border-r border-slate-200" style={{ width: 40 }}>
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
              </th>
              <th className="w-10 px-2 py-2 text-[10px] font-bold text-slate-400 border-r border-slate-200 text-center" style={{ width: 36 }}>
                #
              </th>
              {sheet.cols.map(col => {
                const w = effectiveWidth(col);
                return (
                  <th
                    key={col.key}
                    className="px-3 py-2 text-left border-r border-slate-200 last:border-r-0 relative group/col select-none"
                    style={{ width: w, minWidth: w }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{col.label}</span>
                    {col.required && <span className="text-red-400 ml-0.5">*</span>}
                    {/* Resize handle */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center z-20"
                      onMouseDown={(e) => handleResizeStart(col, e)}
                      title="Drag to resize column"
                    >
                      <div className="w-[3px] h-4 rounded-full bg-slate-300 opacity-0 group-hover/col:opacity-100 transition-opacity" />
                    </div>
                  </th>
                );
              })}
              {onSetDefault && (
                <th className="w-16 px-2 py-2 text-center border-l border-slate-200" style={{ width: 56 }}>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Default</span>
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-3 py-2 border-r border-slate-100"><Skeleton className="h-4 w-4" /></td>
                  <td className="px-2 py-2 border-r border-slate-100"><Skeleton className="h-4 w-4 mx-auto" /></td>
                  {sheet.cols.map(c => <td key={c.key} className="px-3 py-2 border-r border-slate-100 last:border-r-0"><Skeleton className="h-4" /></td>)}
                  {onSetDefault && <td className="px-2 py-2 border-l border-slate-100"><Skeleton className="h-4 w-4 mx-auto" /></td>}
                </tr>
              ))
            ) : filteredRows.length === 0 && !search ? null : (
              <SortableContext items={filteredRows.map((r: any) => r.id)} strategy={verticalListSortingStrategy}>
              {filteredRows.map((row: any, rowIdx: number) => {
                const isSel    = selected.has(row.id);
                const isFocRow = focusedCell?.rowId === row.id;
                const isDirty  = dirtyRef.current.has(row.id);

                return (
                  <SortableSheetRow
                    key={row.id}
                    id={row.id}
                    dragDisabled={dragDisabled}
                    className={cn(
                      "group/row border-b border-slate-100 transition-colors",
                      isSel    ? "bg-indigo-50"   : "hover:bg-slate-50/60",
                      isFocRow && !isSel && "bg-indigo-50/40",
                    )}
                  >
                    {({ attributes, listeners }) => (<>
                    {/* Checkbox */}
                    <td className="px-3 py-0 border-r border-slate-100 h-9" style={{ width: 40 }}>
                      <Checkbox checked={isSel} onCheckedChange={() => toggleSelect(row.id)} />
                    </td>

                    {/* Row number / drag handle */}
                    <td className="px-2 py-0 border-r border-slate-100 text-center h-9" style={{ width: 36 }}>
                      <div className="relative flex items-center justify-center h-full">
                        <span className={cn(
                          "text-[10px]",
                          isDirty ? "text-amber-500 font-bold" : "text-slate-300",
                          !dragDisabled && "group-hover/row:opacity-0 transition-opacity",
                        )}>
                          {isDirty ? "●" : rowIdx + 1}
                        </span>
                        {!dragDisabled && (
                          <button
                            {...attributes}
                            {...listeners}
                            type="button"
                            tabIndex={-1}
                            title="Drag to reorder"
                            className="absolute inset-0 m-auto flex items-center justify-center opacity-0 group-hover/row:opacity-100 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 transition-opacity touch-none"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Data cells */}
                    {sheet.cols.map(col => (
                      <td
                        key={col.key}
                        className={cn(
                          "border-r border-slate-100 last:border-r-0 h-9 p-0",
                          focusedCell?.rowId === row.id && focusedCell?.col === col.key && "ring-2 ring-inset ring-indigo-400 bg-white",
                        )}
                        style={{ width: effectiveWidth(col) }}
                      >
                        {renderCell(row.id, col)}
                      </td>
                    ))}

                    {/* Set as Default button */}
                    {onSetDefault && (
                      <td className="border-l border-slate-100 h-9 text-center px-1" style={{ width: 56 }}>
                        <button
                          type="button"
                          title={row.isDefault ? "Current default year" : "Set as default year"}
                          onClick={() => !row.isDefault && onSetDefault(row.id)}
                          className={cn(
                            "inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors",
                            row.isDefault
                              ? "text-amber-400 cursor-default"
                              : "text-slate-300 hover:text-amber-400 hover:bg-amber-50",
                          )}
                        >
                          <Star className={cn("h-4 w-4", row.isDefault && "fill-amber-400")} />
                        </button>
                      </td>
                    )}
                    </>)}
                  </SortableSheetRow>
                );
              })}
              </SortableContext>
            )}

            {/* New row */}
            <tr className="border-b-2 border-dashed border-indigo-200 bg-indigo-50/20">
              <td className="px-3 py-0 border-r border-indigo-100 h-9" style={{ width: 40 }}>
                <Plus className="h-3.5 w-3.5 text-indigo-300 mx-auto" />
              </td>
              <td className="px-2 py-0 border-r border-indigo-100 text-center h-9" style={{ width: 36 }}>
                <span className="text-[10px] text-indigo-300">new</span>
              </td>
              {sheet.cols.map(col => (
                <td
                  key={col.key}
                  className={cn(
                    "border-r border-indigo-100 last:border-r-0 h-9 p-0",
                    focusedCell?.rowId === NEW_ID() && focusedCell?.col === col.key && "ring-2 ring-inset ring-indigo-400 bg-white",
                  )}
                  style={{ width: effectiveWidth(col) }}
                >
                  {renderCell(NEW_ID(), col, true)}
                </td>
              ))}
              {onSetDefault && <td className="border-l border-indigo-100 h-9" style={{ width: 56 }} />}
            </tr>

            {/* Empty state hint */}
            {!isLoading && filteredRows.length === 0 && !search && (
              <tr>
                <td colSpan={sheet.cols.length + 2 + (onSetDefault ? 1 : 0)} className="px-4 py-8 text-center">
                  <p className="text-sm text-slate-400">No {sheet.label.toLowerCase()} yet.</p>
                  <p className="text-xs text-slate-300 mt-1">Type into the row above and press Enter to add the first one.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </DndContext>
      </div>

      {/* Keyboard hint footer */}
      <div className="px-4 py-1.5 border-t border-slate-100 bg-slate-50/60 shrink-0 flex items-center gap-4">
        <span className="text-[10px] text-slate-400">
          <kbd className="px-1 py-0.5 rounded border border-slate-200 bg-white text-[9px] font-mono">Enter</kbd>
          {" "}move down &nbsp;
          <kbd className="px-1 py-0.5 rounded border border-slate-200 bg-white text-[9px] font-mono">Tab</kbd>
          {" "}move right &nbsp;
          <kbd className="px-1 py-0.5 rounded border border-slate-200 bg-white text-[9px] font-mono">Shift+Tab</kbd>
          {" "}move left &nbsp;
          <kbd className="px-1 py-0.5 rounded border border-slate-200 bg-white text-[9px] font-mono">Esc</kbd>
          {" "}revert cell
        </span>
        {selected.size > 0 && (
          <span className="text-[10px] font-semibold text-indigo-600 ml-auto">{selected.size} selected</span>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} row{selected.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected {sheet.label.toLowerCase()} entries. Existing records that reference them keep their stored values. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteSelected}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AcademicSetupPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeSheet, setActiveSheet] = useState<Sheet>("years");

  // ── Data queries ─────────────────────────────────────────────────────────

  const { data: years,      isLoading: yearsLoading      } = useListAdminAcademicYears();
  const { data: categories, isLoading: catsLoading        } = useListAdminClassCategories();
  const { data: classes,    isLoading: classesLoading     } = useListAdminClasses();
  const { data: sections,   isLoading: sectionsLoading    } = useListAdminSections();
  const { data: subjects,   isLoading: subjectsLoading    } = useListAdminSubjects();

  // ── Invalidators ─────────────────────────────────────────────────────────

  function invYears()    { qc.invalidateQueries({ queryKey: getListAdminAcademicYearsQueryKey() }); qc.invalidateQueries({ queryKey: getListActiveAcademicYearsQueryKey() }); }
  function invCats()     { qc.invalidateQueries({ queryKey: getListAdminClassCategoriesQueryKey() }); qc.invalidateQueries({ queryKey: getListActiveClassCategoriesQueryKey() }); }
  function invClasses()  { qc.invalidateQueries({ queryKey: getListAdminClassesQueryKey() }); qc.invalidateQueries({ queryKey: getListActiveClassesQueryKey() }); }
  function invSections() { qc.invalidateQueries({ queryKey: getListAdminSectionsQueryKey() }); qc.invalidateQueries({ queryKey: getListActiveSectionsQueryKey() }); }
  function invSubjects() { qc.invalidateQueries({ queryKey: getListAdminSubjectsQueryKey() }); qc.invalidateQueries({ queryKey: getListActiveSubjectsQueryKey() }); }

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createYear  = useCreateAdminAcademicYear({ mutation: { onSuccess: () => { invYears();    toast({ title: "Academic Year added"   }); } } });
  const updateYear  = useUpdateAdminAcademicYear({ mutation: {
    onSuccess: (updated) => {
      qc.setQueryData(getListAdminAcademicYearsQueryKey(), (old: any) =>
        Array.isArray(old) ? old.map((y: any) => y.id === updated.id ? updated : y) : old);
      toast({ title: "Academic Year updated" });
    },
    onError: () => { invYears(); toast({ title: "Failed to update academic year", variant: "destructive" }); },
  } });
  const deleteYear  = useDeleteAdminAcademicYear({ mutation: { onSuccess: () => { invYears();    toast({ title: "Academic Year removed" }); } } });

  const createCat   = useCreateAdminClassCategory({ mutation: { onSuccess: () => { invCats();    toast({ title: "Category added"   }); } } });
  const updateCat   = useUpdateAdminClassCategory({ mutation: {
    onSuccess: (updated) => {
      qc.setQueryData(getListAdminClassCategoriesQueryKey(), (old: any) =>
        Array.isArray(old) ? old.map((c: any) => c.id === updated.id ? updated : c) : old);
      toast({ title: "Category updated" });
    },
    onError: () => { invCats(); toast({ title: "Failed to update category", variant: "destructive" }); },
  } });
  const deleteCat   = useDeleteAdminClassCategory({ mutation: { onSuccess: () => { invCats();    toast({ title: "Category removed" }); } } });

  const createClass = useCreateAdminClass({ mutation: { onSuccess: () => { invClasses();  toast({ title: "Class/Program added"   }); } } });
  const updateClass = useUpdateAdminClass({ mutation: {
    onSuccess: () => { invClasses(); toast({ title: "Class/Program updated" }); },
    onError: (err: any) => { invClasses(); toast({ title: err?.message || "Failed to update class", variant: "destructive" }); },
  } });
  const deleteClass = useDeleteAdminClass({ mutation: { onSuccess: () => { invClasses();  toast({ title: "Class/Program removed" }); } } });

  const createSection = useCreateAdminSection({ mutation: { onSuccess: () => { invSections(); toast({ title: "Section added"   }); } } });
  const updateSection = useUpdateAdminSection({ mutation: {
    onSuccess: () => { invSections(); toast({ title: "Section updated" }); },
    onError: () => { invSections(); toast({ title: "Failed to update section", variant: "destructive" }); },
  } });
  const deleteSection = useDeleteAdminSection({ mutation: { onSuccess: () => { invSections(); toast({ title: "Section removed" }); } } });

  const createSubject = useCreateAdminSubject({ mutation: { onSuccess: () => { invSubjects(); toast({ title: "Subject added"   }); } } });
  const updateSubject = useUpdateAdminSubject({ mutation: {
    onSuccess: () => { invSubjects(); toast({ title: "Subject updated" }); },
    onError: (err: any) => {
      invSubjects();
      toast({ title: err?.message || "Failed to update subject", variant: "destructive" });
    },
  } });
  const deleteSubject = useDeleteAdminSubject({ mutation: { onSuccess: () => { invSubjects(); toast({ title: "Subject removed" }); } } });

  const reorderYears    = useAdminReorderAcademicYears({  mutation: { onSuccess: invYears,    onError: () => { toast({ title: "Reorder failed", variant: "destructive" }); invYears();    } } });
  const reorderCats     = useAdminReorderClassCategories({ mutation: { onSuccess: invCats,    onError: () => { toast({ title: "Reorder failed", variant: "destructive" }); invCats();     } } });
  const reorderClasses  = useAdminReorderClasses({         mutation: { onSuccess: invClasses, onError: () => { toast({ title: "Reorder failed", variant: "destructive" }); invClasses();  } } });
  const reorderSections = useAdminReorderSections({        mutation: { onSuccess: invSections, onError: () => { toast({ title: "Reorder failed", variant: "destructive" }); invSections(); } } });
  const reorderSubjects = useAdminReorderSubjects({        mutation: { onSuccess: invSubjects, onError: () => { toast({ title: "Reorder failed", variant: "destructive" }); invSubjects(); } } });

  function handleReorder(sheet: Sheet, orderedIds: string[]) {
    const body = { data: { order: orderedIds } };
    switch (sheet) {
      case "years":      reorderYears.mutate(body);    break;
      case "categories": reorderCats.mutate(body);     break;
      case "classes":    reorderClasses.mutate(body);  break;
      case "sections":   reorderSections.mutate(body); break;
      case "subjects":   reorderSubjects.mutate(body); break;
    }
  }

  const isSaving =
    createYear.isPending || updateYear.isPending || deleteYear.isPending ||
    createCat.isPending  || updateCat.isPending  || deleteCat.isPending  ||
    createClass.isPending || updateClass.isPending || deleteClass.isPending ||
    createSection.isPending || updateSection.isPending || deleteSection.isPending ||
    createSubject.isPending || updateSubject.isPending || deleteSubject.isPending;

  // ── Save handlers ─────────────────────────────────────────────────────────

  const categoryOptions = useCallback(
    () => (categories ?? []).map((c: any) => ({ value: c.id, label: c.name })),
    [categories]
  );
  const yearOptions = useCallback(
    () => (years ?? []).map((y: any) => ({ value: y.id, label: y.name })),
    [years]
  );
  const sectionOptions = useCallback(
    () => (sections ?? []).map((s: any) => ({ value: s.id, label: s.name })),
    [sections]
  );
  const subjectOptions = useCallback(
    () => (subjects ?? []).map((s: any) => ({ value: s.id, label: `${s.code} – ${s.name}` })),
    [subjects]
  );

  function handleSaveRow(sheet: Sheet, id: string | undefined, v: Record<string, string>) {
    const active = v.active !== "false";
    if (sheet === "years") {
      const data = { name: v.name.trim(), active, sortOrder: 0 };
      id ? updateYear.mutate({ id, data }) : createYear.mutate({ data });
    } else if (sheet === "categories") {
      const data = { name: v.name.trim(), active, sortOrder: 0 };
      id ? updateCat.mutate({ id, data }) : createCat.mutate({ data });
    } else if (sheet === "classes") {
      const seats = parseInt(v.seats) || 0;
      const termCountRaw = parseInt(v.termCount);
      const termCount = isNaN(termCountRaw) || termCountRaw <= 0 ? null : termCountRaw;
      const termType = v.termType || "annual";
      const academicYearIds = v.academicYearIds ? v.academicYearIds.split(",").filter(Boolean) : [];
      const sectionIds = v.sectionIds ? v.sectionIds.split(",").filter(Boolean) : [];
      const subjectIds = v.subjectIds ? v.subjectIds.split(",").filter(Boolean) : [];
      if (id) {
        const data = { name: v.name.trim(), categoryId: v.categoryId || null, termType, termCount, seats, active, academicYearIds, sectionIds, subjectIds };
        updateClass.mutate({ id, data });
      } else {
        const data = { code: v.code.trim(), name: v.name.trim(), categoryId: v.categoryId || null, termType, termCount, seats, active, sortOrder: 0, academicYearIds, sectionIds, subjectIds };
        createClass.mutate({ data });
      }
    } else if (sheet === "sections") {
      const capacityVal = parseInt(v.capacity);
      const capacity = isNaN(capacityVal) ? undefined : capacityVal;
      const data = { name: v.name.trim(), capacity, active, sortOrder: 0 };
      id ? updateSection.mutate({ id, data }) : createSection.mutate({ data });
    } else if (sheet === "subjects") {
      const subjectType = (v.type || "theory") as "theory" | "practical" | "combined";
      if (id) {
        const data = { code: v.code.trim(), name: v.name.trim(), type: subjectType, maxMarks: 100, passMarks: 33, active };
        updateSubject.mutate({ id, data });
      } else {
        const data = { code: v.code.trim(), name: v.name.trim(), type: subjectType, isElective: false, maxMarks: 100, passMarks: 33, active, sortOrder: 0 };
        createSubject.mutate({ data });
      }
    }
  }

  function handleDeleteRows(sheet: Sheet, ids: string[]) {
    if (sheet === "years")      ids.forEach(id => deleteYear.mutate({ id }));
    else if (sheet === "categories") ids.forEach(id => deleteCat.mutate({ id }));
    else if (sheet === "classes")    ids.forEach(id => deleteClass.mutate({ id }));
    else if (sheet === "sections")   ids.forEach(id => deleteSection.mutate({ id }));
    else if (sheet === "subjects")   ids.forEach(id => deleteSubject.mutate({ id }));
  }

  async function handleSetYearDefault(id: string) {
    try {
      const res = await fetch(`/api/admin/academic-years/${id}/set-default`, {
        method: "POST",
        headers: authHdr(),
      });
      if (!res.ok) throw new Error("Failed");
      qc.invalidateQueries({ queryKey: getListAdminAcademicYearsQueryKey() });
      qc.invalidateQueries({ queryKey: getListActiveAcademicYearsQueryKey() });
      toast({ title: "Default academic year updated" });
    } catch {
      toast({ title: "Failed to set default year", variant: "destructive" });
    }
  }

  // ── Sheet definitions ─────────────────────────────────────────────────────

  const sheets = buildSheets(categoryOptions(), yearOptions(), sectionOptions(), subjectOptions());

  // Flatten class rows so spreadsheet cells can read academicYearId / sectionIds / subjectIds directly
  const flattenedClasses = useMemo(() =>
    ((classes as any[]) ?? []).map((row: any) => ({
      ...row,
      academicYearIds: (row.academicYears ?? []).map((y: any) => y.id).join(","),
      sectionIds: (row.sections ?? []).map((s: any) => s.id).join(","),
      subjectIds: (row.subjects ?? []).map((s: any) => s.id).join(","),
    })),
  [classes]);

  const sheetData: Record<Sheet, { rows: any[]; isLoading: boolean }> = {
    years:      { rows: (years      as any[]) ?? [], isLoading: yearsLoading      },
    categories: { rows: (categories as any[]) ?? [], isLoading: catsLoading       },
    classes:    { rows: flattenedClasses,             isLoading: classesLoading    },
    sections:   { rows: (sections   as any[]) ?? [], isLoading: sectionsLoading   },
    subjects:   { rows: (subjects   as any[]) ?? [], isLoading: subjectsLoading   },
  };

  const currentSheet = sheets.find(s => s.key === activeSheet)!;
  const { rows, isLoading } = sheetData[activeSheet];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden" style={{ height: "calc(100vh - 220px)", minHeight: 520 }}>

      {/* Sheet tabs (Excel-style) */}
      <div className="flex items-end gap-0 px-4 pt-3 border-b-2 border-slate-200 bg-slate-50 shrink-0">
        <div className="flex items-center gap-1 mr-4 mb-2">
          <CheckCircle2 className="h-4 w-4 text-slate-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Academic Setup</span>
        </div>
        {sheets.map(s => {
          const active = s.key === activeSheet;
          const Icon = s.icon;
          const rowCount = sheetData[s.key].rows.length;
          return (
            <button
              key={s.key}
              onClick={() => setActiveSheet(s.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold rounded-t-lg border border-b-0 transition-all relative -mb-0.5",
                active
                  ? "bg-white border-slate-200 text-slate-800 shadow-sm z-10"
                  : "bg-transparent border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/60",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: active ? s.color : undefined }} />
              {s.label}
              {rowCount > 0 && (
                <span className={cn(
                  "text-[10px] font-bold rounded-full px-1.5 py-0 min-w-[18px] text-center",
                  active ? "text-white" : "bg-slate-200 text-slate-500",
                )} style={active ? { backgroundColor: s.color } : {}}>
                  {rowCount}
                </span>
              )}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" style={{ backgroundColor: s.color }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Spreadsheet */}
      <SpreadsheetTable
        key={activeSheet}
        sheet={currentSheet}
        rows={rows}
        isLoading={isLoading}
        isSaving={isSaving}
        onSaveRow={(id, values) => handleSaveRow(activeSheet, id, values)}
        onDeleteRows={ids => handleDeleteRows(activeSheet, ids)}
        onSetDefault={activeSheet === "years" ? handleSetYearDefault : undefined}
        onReorder={ids => handleReorder(activeSheet, ids)}
      />
    </div>
  );
}
