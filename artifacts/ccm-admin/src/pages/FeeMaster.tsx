import { useState, useEffect, useRef, Fragment, useContext } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDate, formatCurrency } from "@/lib/locale";
import { useAdminNames } from "@/components/AuditStamp";
import { useSearch, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminFeeTypes,
  getListAdminFeeTypesQueryKey,
  useCreateAdminFeeType,
  useUpdateAdminFeeType,
  useDeleteAdminFeeType,
  useAdminReorderFeeTypes,
  useAdminReorderClasses,
  useGetAdminFeeSchedule,
  getGetAdminFeeScheduleQueryKey,
  useSaveAdminFeeSchedule,
  useListAdminFeeChallans,
  getListAdminFeeChallansQueryKey,
  useGenerateBulkAdminFeeChallans,
  useCollectAdminFeeChallans,
  getCollectAdminFeeChallansQueryKey,
  useMarkAdminFeeChallanPaid,
  useDeleteAdminFeeChallan,
  useListAdminAcademicYears,
  useListAdminClasses,
  useListAdminSections,
  useListAdminStudents,
  getListAdminStudentsQueryKey,
  useListAdminBankAccounts,
  getListAdminBankAccountsQueryKey,
  type FeeType,
  type FeeChallan,
  type CollectFeeRow,
  type CashBankAccount,
} from "@workspace/api-client-react";
import { FeeTypeDuration, FeeTypeFeeCategory } from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { JEViewerButton } from "@/components/JEViewerButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { openPrintWindow } from "@/lib/print-utils";
import { useDefaultYear } from "@/hooks/use-default-year";
import {
  Plus, Minus, Pencil, Trash2, Loader2, Tags, Receipt, Wallet, Zap, Search,
  CheckCircle2, AlertCircle, Users, User, Filter, Hash, Printer,
  Building2, ExternalLink, RefreshCw, Banknote, GripVertical, GripHorizontal, Lock,
} from "lucide-react";
import { TabStudentWise, FeeGridDirtyProvider, FeeGridDirtyCtx } from "./fee/StudentWiseFee";
import { BulkFeeCollection } from "./accounts/BulkFeeCollection";

const API = (import.meta.env.VITE_API_BASE as string) || "";

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "fee-types",        label: "Fee Types",              icon: Tags    },
  { key: "fee-schedule",     label: "Fee Structure",          icon: Wallet  },
  { key: "student-wise",     label: "Students Fee Structure", icon: User    },
  { key: "generate-challan", label: "Generate Challan",       icon: Zap     },
  { key: "print-challan",    label: "Print Challan",          icon: Printer },
  { key: "collect",          label: "Collect Fee",            icon: Receipt },
  { key: "bulk-collection",  label: "Bulk Collection",        icon: Banknote },
] as const;

type TabKey = typeof TABS[number]["key"];

// ─── Shared constants ─────────────────────────────────────────────────────────

const DURATION_LABELS: Record<string, string> = {
  once:            "One-time",
  single:          "Single Month",
  "bi-monthly":    "Bi-Monthly (2 mo.)",
  "tri-monthly":   "Tri-Monthly (3 mo.)",
  "tetra-monthly": "Tetra-Monthly (4 mo.)",
  "six-monthly":   "Six-Monthly (6 mo.)",
  annual:          "Annual (12 mo.)",
  monthly:         "Monthly",
  "optional-months": "Selected Months",
};

// System fine fee types are seeded in every tenant and cannot be deleted — they
// are wired into the Chart of Accounts and fine-calculation logic by these codes.
const SYSTEM_FEE_CODES = new Set(["attendance-fine", "late-fee-fine"]);

const STATUS_META: Record<string, { label: string; classes: string }> = {
  pending:       { label: "Pending",       classes: "bg-amber-100 text-amber-700" },
  paid:          { label: "Paid",          classes: "bg-emerald-100 text-emerald-700" },
  overdue:       { label: "Overdue",       classes: "bg-red-100 text-red-700" },
  not_generated: { label: "Not Generated", classes: "bg-slate-100 text-slate-600" },
  partial:       { label: "Partial",       classes: "bg-orange-100 text-orange-700" },
};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function today() { return new Date().toISOString().slice(0, 10); }
// Builds "YYYY-MM" from local year/month, not toISOString() (which converts
// to UTC first and rolls day-1 midnight back a month for positive UTC offsets).
function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const DURATION_MONTH_COUNT: Record<string, number> = {
  once: 0, single: 1, "bi-monthly": 2, "tri-monthly": 3,
  "tetra-monthly": 4, "six-monthly": 6, annual: 12,
  monthly: 1, "optional-months": 1,
};

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + (n - 1);
  const ey = Math.floor(total / 12);
  const em = (total % 12) + 1;
  return `${ey}-${String(em).padStart(2, "0")}`;
}

// ─── Shared: Fee Type Checkboxes ──────────────────────────────────────────────

function FeeTypeChecks({
  feeTypes, selected, onToggle, onAll, onNone,
}: {
  feeTypes: FeeType[];
  selected: string[];
  onToggle: (id: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Fee Types</Label>
        <div className="flex gap-1.5">
          <button onClick={onAll} className="text-xs text-blue-600 hover:underline">All</button>
          <span className="text-slate-300">·</span>
          <button onClick={onNone} className="text-xs text-slate-500 hover:underline">None</button>
        </div>
      </div>
      <div className="space-y-1.5">
        {feeTypes.map(ft => (
          <label key={ft.id} className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-border px-3 py-2 hover:bg-slate-50 transition-colors">
            <Checkbox
              checked={selected.includes(ft.id)}
              onCheckedChange={() => onToggle(ft.id)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 leading-tight">{ft.name}</p>
              <p className="text-[11px] text-slate-400 font-mono">{ft.feeCode} · {DURATION_LABELS[ft.duration]}</p>
            </div>
          </label>
        ))}
        {feeTypes.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No active fee types. Add some in the Fee Types tab.</p>
        )}
      </div>
    </div>
  );
}

// ─── Tab 1: Fee Types ─────────────────────────────────────────────────────────

type FeeTypeRow = {
  _rowId: string;
  name: string;
  feeCode: string;
  feeCategory: string;
  duration: string;
  sortOrder: string;
  description: string;
  active: boolean;
};

function mkFtRow(): FeeTypeRow {
  return { _rowId: crypto.randomUUID(), name: "", feeCode: "", feeCategory: "tuition", duration: "single", sortOrder: "0", description: "", active: true };
}

function ftPayload(row: FeeTypeRow) {
  return {
    name: row.name.trim(),
    feeCode: row.feeCode.trim().toLowerCase().replace(/\s+/g, "-"),
    feeCategory: row.feeCategory as FeeTypeFeeCategory,
    duration: row.duration as FeeTypeDuration,
    description: row.description.trim() || undefined,
    active: row.active,
    sortOrder: parseInt(row.sortOrder) || 0,
  };
}

function SortableFeeTypeRow({
  ft, onEdit, onDelete,
}: {
  ft: FeeType;
  onEdit: (ft: FeeType) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ft.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging ? "#f0f9ff" : undefined,
    zIndex: isDragging ? 10 : undefined,
    position: "relative",
  };
  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-slate-50/60 transition-colors">
      <td className="w-8 px-2 py-3 text-center">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors touch-none align-middle"
          title="Drag to reorder"
          tabIndex={-1}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      <td className="px-4 py-3 font-semibold text-slate-800">{ft.name}</td>
      <td className="px-4 py-3 font-mono text-xs text-slate-600">{ft.feeCode}</td>
      <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{ft.feeCategory === "tuition" ? "Tuition" : "Non-Tuition"}</td>
      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{DURATION_LABELS[ft.duration] ?? ft.duration}</td>
      <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell max-w-[200px] truncate">{ft.description ?? "—"}</td>
      <td className="px-4 py-3">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
          ft.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
          {ft.active ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1 justify-end">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(ft)}><Pencil className="h-3.5 w-3.5" /></Button>
          {SYSTEM_FEE_CODES.has(ft.feeCode) ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-slate-400 cursor-not-allowed"
              disabled
              title="System fee type — required by the fine & accounts setup and cannot be deleted"
            >
              <Lock className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => onDelete(ft.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function TabFeeTypes() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: feeTypesRaw = [], isLoading } = useListAdminFeeTypes();
  const feeTypes = feeTypesRaw as FeeType[];

  const createMut = useCreateAdminFeeType();
  const updateMut = useUpdateAdminFeeType();
  const deleteMut = useDeleteAdminFeeType({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListAdminFeeTypesQueryKey() }); setDelId(null); toast({ title: "Fee type deleted" }); },
      onError:   (err: Error) => toast({ title: "Failed to delete fee type", description: (err as any)?.data?.error ?? err.message, variant: "destructive" }),
    },
  });

  const [open, setOpen]     = useState(false);
  const [editFt, setEditFt] = useState<FeeType | null>(null);
  const [rows, setRows]     = useState<FeeTypeRow[]>([mkFtRow()]);
  const [busy, setBusy]     = useState(false);
  const [delId, setDelId]   = useState<string | null>(null);
  const gridRef             = useRef<HTMLDivElement>(null);

  // ── Drag-to-reorder ──
  const [items, setItems] = useState<FeeType[]>([]);
  useEffect(() => {
    setItems(prev =>
      prev.length === feeTypes.length && prev.every((p, i) => p === feeTypes[i]) ? prev : feeTypes,
    );
  }, [feeTypes]);
  const reorderMut = useAdminReorderFeeTypes({
    mutation: {
      onError: () => {
        toast({ title: "Reorder failed", variant: "destructive" });
        qc.invalidateQueries({ queryKey: getListAdminFeeTypesQueryKey() });
      },
    },
  });
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  function handleFtDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    reorderMut.mutate({ data: { order: next.map(i => i.id) } });
  }

  function openCreate() { setEditFt(null); setRows([mkFtRow()]); setOpen(true); }
  function openEdit(ft: FeeType) {
    setEditFt(ft);
    setRows([{ _rowId: crypto.randomUUID(), name: ft.name, feeCode: ft.feeCode, feeCategory: ft.feeCategory, duration: ft.duration, sortOrder: String(ft.sortOrder), description: ft.description ?? "", active: ft.active }]);
    setOpen(true);
  }
  function upd(rowId: string, k: keyof FeeTypeRow, v: string | boolean) {
    setRows(p => p.map(r => r._rowId === rowId ? { ...r, [k]: v } : r));
  }
  function addRow() { setRows(p => [...p, mkFtRow()]); }
  function removeRow(rowId: string) { setRows(p => p.length > 1 ? p.filter(r => r._rowId !== rowId) : p); }

  function focusCell(ri: number, ci: number) {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-r="${ri}"][data-c="${ci}"]`);
    el?.focus();
  }
  function nav(e: React.KeyboardEvent, ri: number, ci: number, colCount: number) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (ri === rows.length - 1) { addRow(); setTimeout(() => focusCell(ri + 1, ci), 20); }
      else focusCell(ri + 1, ci);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (ri > 0) focusCell(ri - 1, ci);
    } else if (e.key === "ArrowRight" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); if (ci < colCount - 1) focusCell(ri, ci + 1);
    } else if (e.key === "ArrowLeft" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); if (ci > 0) focusCell(ri, ci - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (ri === rows.length - 1) { addRow(); setTimeout(() => focusCell(ri + 1, 0), 20); }
      else focusCell(ri + 1, 0);
    }
  }

  async function handleSave() {
    const valid = rows.filter(r => r.name.trim() && r.feeCode.trim());
    if (!valid.length) { toast({ title: "Fill Name and Fee Code for at least one row", variant: "destructive" }); return; }
    setBusy(true);
    try {
      if (editFt) {
        await updateMut.mutateAsync({ id: editFt.id, data: ftPayload(valid[0]) });
        toast({ title: "Fee type updated" });
      } else {
        for (const row of valid) await createMut.mutateAsync({ data: ftPayload(row) });
        toast({ title: `${valid.length} fee type${valid.length > 1 ? "s" : ""} created` });
      }
      qc.invalidateQueries({ queryKey: getListAdminFeeTypesQueryKey() });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.data?.error ?? err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const cell = "w-full h-9 px-2.5 text-sm bg-transparent border-0 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 transition-colors placeholder:text-slate-300";
  const ready = rows.filter(r => r.name.trim() && r.feeCode.trim()).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading…" : `${feeTypes.length} fee type${feeTypes.length !== 1 ? "s" : ""}`}
        </p>
        <Button size="sm" className="gap-1.5 h-8" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" /> Add Fee Type
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : feeTypes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
          <Tags className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">No fee types yet</p>
          <Button size="sm" variant="outline" className="mt-1 h-7 text-xs" onClick={openCreate}>Add the first one</Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-white shadow-sm">
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleFtDragEnd}>
            <SortableContext items={items.map(ft => ft.id)} strategy={verticalListSortingStrategy}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-border">
                    <th className="w-8 px-2 py-2.5"></th>
                    {["Name","Code","Category","Duration","Description","Status",""].map((h, i) => (
                      <th key={i} className={cn("text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500",
                        i === 2 && "hidden sm:table-cell", i === 3 && "hidden md:table-cell",
                        i === 4 && "hidden lg:table-cell", i === 6 && "w-20")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map(ft => (
                    <SortableFeeTypeRow key={ft.id} ft={ft} onEdit={openEdit} onDelete={setDelId} />
                  ))}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* ── Spreadsheet Dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[1120px] w-[96vw] p-0 gap-0 overflow-hidden">

          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">{editFt ? "Edit Fee Type" : "Add Fee Types"}</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {editFt
                  ? "Update the fee head details below."
                  : "Add multiple fee types at once — each row becomes one fee type."}
              </p>
            </div>
            {!editFt && (
              <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-1.5 font-mono shrink-0 ml-4">
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">↑↓</span> rows &nbsp;
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">Tab</span> columns &nbsp;
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">Enter</span> next row
              </div>
            )}
          </div>

          {/* Grid */}
          <div className="overflow-x-auto max-h-[44vh] overflow-y-auto" ref={gridRef}>
            <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
              <colgroup>
                <col style={{ width: 36 }} />
                <col style={{ minWidth: 200 }} />
                <col style={{ minWidth: 130 }} />
                <col style={{ minWidth: 130 }} />
                <col style={{ minWidth: 140 }} />
                <col style={{ width: 72 }} />
                <col style={{ minWidth: 220 }} />
                <col style={{ width: 64 }} />
                <col style={{ width: 38 }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 border-b-2 border-slate-200 select-none">
                  <th className="py-2.5 text-center text-[10px] text-slate-400 border-r border-slate-200">#</th>
                  {[
                    { l: "Name",        req: true  },
                    { l: "Fee Code",    req: true  },
                    { l: "Category",    req: false },
                    { l: "Duration",    req: false },
                    { l: "Sort",        req: false },
                    { l: "Description", req: false },
                    { l: "Active",      req: false },
                  ].map(({ l, req }) => (
                    <th key={l} className="px-2.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-r border-slate-200 last:border-r-0 whitespace-nowrap">
                      {l}{req && <span className="text-red-400 ml-0.5">*</span>}
                    </th>
                  ))}
                  <th className="border-l border-slate-200" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={row._rowId} className={cn("border-b border-slate-100 group/row", ri % 2 === 0 ? "bg-white" : "bg-slate-50/30")}>
                    {/* Row number */}
                    <td className="text-center text-[11px] text-slate-400 border-r border-slate-100 select-none py-0 font-mono">{ri + 1}</td>

                    {/* Name */}
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={0} value={row.name} placeholder="e.g. Tuition Fee"
                        onChange={e => upd(row._rowId, "name", e.target.value)}
                        onKeyDown={e => nav(e, ri, 0, 6)}
                        className={cell} />
                    </td>

                    {/* Fee Code */}
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={1} value={row.feeCode} placeholder="tf-001"
                        onChange={e => upd(row._rowId, "feeCode", e.target.value)}
                        onKeyDown={e => nav(e, ri, 1, 6)}
                        className={cn(cell, "font-mono tracking-wide")} />
                    </td>

                    {/* Category */}
                    <td className="p-0 border-r border-slate-100">
                      <select data-r={ri} data-c={2} value={row.feeCategory}
                        onChange={e => upd(row._rowId, "feeCategory", e.target.value)}
                        className={cn(cell, "cursor-pointer pr-1")}>
                        <option value="tuition">Tuition</option>
                        <option value="non-tuition">Non-Tuition</option>
                      </select>
                    </td>

                    {/* Duration */}
                    <td className="p-0 border-r border-slate-100">
                      <select data-r={ri} data-c={3} value={row.duration}
                        onChange={e => upd(row._rowId, "duration", e.target.value)}
                        className={cn(cell, "cursor-pointer pr-1")}>
                        <option value="once">One-time</option>
                        <option value="single">Single Month</option>
                        <option value="bi-monthly">Bi-Monthly (2 mo.)</option>
                        <option value="tri-monthly">Tri-Monthly (3 mo.)</option>
                        <option value="tetra-monthly">Tetra-Monthly (4 mo.)</option>
                        <option value="six-monthly">Six-Monthly (6 mo.)</option>
                        <option value="annual">Annual (12 mo.)</option>
                      </select>
                    </td>

                    {/* Sort Order */}
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={4} type="number" min={0} value={row.sortOrder}
                        onChange={e => upd(row._rowId, "sortOrder", e.target.value)}
                        onKeyDown={e => nav(e, ri, 4, 6)}
                        className={cn(cell, "text-right")} />
                    </td>

                    {/* Description */}
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={5} value={row.description} placeholder="Optional notes"
                        onChange={e => upd(row._rowId, "description", e.target.value)}
                        onKeyDown={e => nav(e, ri, 5, 6)}
                        className={cell} />
                    </td>

                    {/* Active */}
                    <td className="border-r border-slate-100 text-center align-middle py-0">
                      <input data-r={ri} data-c={6} type="checkbox" checked={row.active}
                        onChange={e => upd(row._rowId, "active", e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 accent-emerald-600 cursor-pointer" />
                    </td>

                    {/* Remove */}
                    <td className="text-center align-middle py-0">
                      <button onClick={() => removeRow(row._rowId)} disabled={rows.length === 1}
                        title="Remove row"
                        className="h-9 w-9 flex items-center justify-center mx-auto text-slate-300 hover:text-red-500 disabled:opacity-0 disabled:cursor-not-allowed transition-colors">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Row footer */}
          {!editFt && (
            <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60">
              <button onClick={addRow}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors font-medium">
                <Plus className="h-3.5 w-3.5" /> Add Row
              </button>
            </div>
          )}

          {/* Save footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white">
            <p className="text-xs text-slate-400">
              {ready > 0
                ? <><span className="font-semibold text-slate-700">{ready}</span> of {rows.length} rows ready</>
                : <span className="text-amber-500">Fill Name + Fee Code to enable save</span>}
            </p>
            <div className="flex gap-2.5">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handleSave} disabled={busy || ready === 0}>
                {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                {editFt ? "Save Changes" : `Save ${ready} Fee Type${ready !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ── */}
      <Dialog open={!!delId} onOpenChange={o => { if (!o) setDelId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Fee Type?</DialogTitle>
            <DialogDescription>Challans already generated retain the data.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelId(null)} disabled={deleteMut.isPending}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMut.isPending} onClick={() => delId && deleteMut.mutate({ id: delId })}>
              {deleteMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab 2: Fee Schedule ──────────────────────────────────────────────────────

type MatrixFeeType = { id: string; name: string; feeCode: string };
type MatrixClass = { id: string; code: string; name: string };

function SortableColHeader({
  ft, colW, dragDisabled,
}: {
  ft: MatrixFeeType;
  colW: number;
  dragDisabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `col:${ft.id}` });
  const style: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: isDragging ? 50 : 30,
    width: colW,
    minWidth: colW,
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <th ref={setNodeRef} style={style}
      className="bg-[#f0f2f5] border-b-2 border-r border-slate-300 last:border-r-0 px-3 py-2 text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
      {!dragDisabled && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors touch-none mx-auto block -mt-0.5 mb-0.5"
          title="Drag to reorder column"
          tabIndex={-1}
        >
          <GripHorizontal className="h-3.5 w-3.5" />
        </button>
      )}
      <p className="leading-tight truncate" title={ft.name}>{ft.name}</p>
      <p className="font-mono font-normal normal-case text-[10px] text-slate-400 mt-0.5 truncate">{ft.feeCode}</p>
    </th>
  );
}

function SortableClassRow({
  cls, ri, feeTypes, amounts, activeCell, dragDisabled,
  colW, rowHdrW, setCell, setActiveCell, handleKeyDown, setCellRef,
}: {
  cls: MatrixClass;
  ri: number;
  feeTypes: MatrixFeeType[];
  amounts: Record<string, Record<string, string>>;
  activeCell: [number, number] | null;
  dragDisabled: boolean;
  colW: number;
  rowHdrW: number;
  setCell: (classCode: string, feeTypeId: string, val: string) => void;
  setActiveCell: (cell: [number, number] | null) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, ri: number, ci: number) => void;
  setCellRef: (ri: number, ci: number, el: HTMLInputElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `row:${cls.id}` });
  const rowStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 30 : undefined,
    position: isDragging ? "relative" : undefined,
  };
  return (
    <tr ref={setNodeRef} style={rowStyle}>
      {/* Row header (sticky left) */}
      <td style={{ position: "sticky", left: 0, zIndex: 20, width: rowHdrW }}
        className={cn(
          "border-b border-r-2 border-slate-300 px-3 py-0 cursor-default",
          ri % 2 === 0 ? "bg-[#f7f8fa]" : "bg-[#f0f2f5]",
        )}>
        <div className="flex items-center gap-1.5 py-2">
          {!dragDisabled && (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors touch-none shrink-0"
              title="Drag to reorder row"
              tabIndex={-1}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-xs whitespace-nowrap leading-tight">{cls.name}</p>
            <p className="text-[10px] text-slate-400 font-mono">{cls.code}</p>
          </div>
        </div>
      </td>

      {/* Data cells */}
      {feeTypes.map((ft, ci) => {
        const isActive = activeCell?.[0] === ri && activeCell?.[1] === ci;
        return (
          <td key={ft.id}
            style={{ width: colW, padding: 0, position: "relative", height: "1px" }}
            className={cn(
              "border-b border-r border-slate-200 last:border-r-0",
              ri % 2 === 0 ? "bg-white" : "bg-[#fafafa]",
              isActive && "!bg-[#e8f0fe] z-10",
            )}>
            {isActive && (
              <div className="absolute inset-0 pointer-events-none"
                style={{ boxShadow: "inset 0 0 0 2px #1a73e8", zIndex: 2 }} />
            )}
            <div className="relative" style={{ height: "100%", minHeight: 40 }}>
              <span
                className="absolute left-0 top-0 bottom-0 z-10 flex items-center pl-2 text-xs text-slate-400 pointer-events-none select-none"
                style={{ width: 26 }}>
                Rs
              </span>
              {!isActive && (
                <span
                  className="absolute inset-0 flex items-center justify-end pr-2 pointer-events-none select-none"
                  style={{ paddingLeft: 28 }}>
                  <span className={cn(
                    "font-mono text-sm truncate",
                    amounts[cls.code]?.[ft.id] ? "text-slate-800" : "text-slate-300",
                  )}>
                    {amounts[cls.code]?.[ft.id] || "0"}
                  </span>
                </span>
              )}
              <input
                ref={el => setCellRef(ri, ci, el)}
                type="number" min={0} step={100}
                value={amounts[cls.code]?.[ft.id] ?? ""}
                onChange={e => setCell(cls.code, ft.id, e.target.value)}
                onFocus={e => { setActiveCell([ri, ci]); e.target.select(); }}
                onKeyDown={e => handleKeyDown(e, ri, ci)}
                placeholder="0"
                className={cn(
                  "absolute inset-0 text-right font-mono text-sm border-0 ring-0 outline-none",
                  "focus:outline-none focus:ring-0",
                  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                  isActive
                    ? "bg-transparent text-slate-900 placeholder:text-slate-300"
                    : "opacity-0 cursor-pointer",
                )}
                style={{ paddingLeft: 28, paddingRight: 8 }}
              />
            </div>
          </td>
        );
      })}
    </tr>
  );
}

function TabFeeSchedule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: yearsRaw = [] } = useListAdminAcademicYears();
  const years = yearsRaw as any[];
  const [yearId, setYearId] = useState("");
  const defaultYearId = useDefaultYear();
  useEffect(() => { if (defaultYearId && !yearId) setYearId(defaultYearId); }, [defaultYearId, yearId]);

  const { data: matrix, isLoading } = useGetAdminFeeSchedule(
    { academicYearId: yearId },
    { query: { enabled: !!yearId, queryKey: getGetAdminFeeScheduleQueryKey({ academicYearId: yearId }) } },
  );

  const [amounts, setAmounts] = useState<Record<string, Record<string, string>>>({});
  const [activeCell, setActiveCell] = useState<[number, number] | null>(null);
  const cellRefs = useRef<(HTMLInputElement | null)[][]>([]);
  const [applyDialog, setApplyDialog] = useState<"closed" | "confirm" | "overwrite-confirm">("closed");
  const [applying, setApplying] = useState(false);
  const [orderedFeeTypes, setOrderedFeeTypes] = useState<MatrixFeeType[]>([]);
  const [orderedClasses, setOrderedClasses] = useState<MatrixClass[]>([]);

  useEffect(() => {
    if (!matrix) return;
    cellRefs.current = matrix.classes.map(() => matrix.feeTypes.map(() => null));
    const init: Record<string, Record<string, string>> = {};
    for (const cls of matrix.classes) {
      init[cls.code] = {};
      for (const ft of matrix.feeTypes) {
        const saved = (matrix.amounts as any)[cls.code]?.[ft.id];
        init[cls.code][ft.id] = saved != null ? String(saved) : "";
      }
    }
    setAmounts(init);
    setActiveCell(null);
    setOrderedFeeTypes(matrix.feeTypes.map(ft => ({ id: ft.id, name: ft.name, feeCode: ft.feeCode })));
    setOrderedClasses(matrix.classes.map(c => ({ id: c.id, code: c.code, name: c.name })));
  }, [matrix]);

  const saveMut = useSaveAdminFeeSchedule({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetAdminFeeScheduleQueryKey({ academicYearId: yearId }) });
        toast({ title: "Fee schedule saved" });
      },
      onError: (err: Error) => toast({ title: "Save failed", description: (err as any)?.data?.error ?? err.message, variant: "destructive" }),
    },
  });

  // ── Drag-to-reorder (columns = fee types, rows = classes) ──
  const gridSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const reorderFtMut = useAdminReorderFeeTypes({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListAdminFeeTypesQueryKey() }),
      onError: () => {
        toast({ title: "Reorder failed", variant: "destructive" });
        qc.invalidateQueries({ queryKey: getGetAdminFeeScheduleQueryKey({ academicYearId: yearId }) });
      },
    },
  });
  const reorderClsMut = useAdminReorderClasses({
    mutation: {
      onError: () => {
        toast({ title: "Reorder failed", variant: "destructive" });
        qc.invalidateQueries({ queryKey: getGetAdminFeeScheduleQueryKey({ academicYearId: yearId }) });
      },
    },
  });
  function handleGridDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const aid = String(active.id), oid = String(over.id);
    if (aid.startsWith("col:") && oid.startsWith("col:")) {
      const oldIndex = orderedFeeTypes.findIndex(f => f.id === aid.slice(4));
      const newIndex = orderedFeeTypes.findIndex(f => f.id === oid.slice(4));
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(orderedFeeTypes, oldIndex, newIndex);
      setOrderedFeeTypes(next);
      reorderFtMut.mutate({ data: { order: next.map(f => f.id) } });
    } else if (aid.startsWith("row:") && oid.startsWith("row:")) {
      const oldIndex = orderedClasses.findIndex(c => c.id === aid.slice(4));
      const newIndex = orderedClasses.findIndex(c => c.id === oid.slice(4));
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(orderedClasses, oldIndex, newIndex);
      setOrderedClasses(next);
      reorderClsMut.mutate({ data: { order: next.map(c => c.id) } });
    }
  }
  const setCellRef = (ri: number, ci: number, el: HTMLInputElement | null) => {
    if (!cellRefs.current[ri]) cellRefs.current[ri] = [];
    cellRefs.current[ri][ci] = el;
  };

  function setCell(classCode: string, feeTypeId: string, val: string) {
    setAmounts(p => ({ ...p, [classCode]: { ...p[classCode], [feeTypeId]: val } }));
  }

  async function applyToStudents(mode: "fill" | "overwrite") {
    if (!yearId) return;
    setApplying(true);
    setApplyDialog("closed");
    try {
      const token = getToken();
      const r = await fetch(`${API}/api/admin/fee-schedule/apply-to-students`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ academicYearId: yearId, mode }),
      });
      const rawText = await r.text().catch(() => "");
      const isHtml = rawText.trimStart().startsWith("<!DOCTYPE") ||
        rawText.trimStart().startsWith("<!doctype") ||
        rawText.trimStart().startsWith("<html");
      if (isHtml) throw new Error("Service unavailable — please try again");
      let body: Record<string, unknown> = {};
      try { body = rawText ? JSON.parse(rawText) : {}; } catch { body = {}; }
      if (!r.ok) throw new Error((body.error as string | undefined) ?? `HTTP ${r.status}`);
      const count = (body.applied as number | undefined) ?? 0;
      toast({
        title: count > 0
          ? `Applied — ${count} student fee record${count !== 1 ? "s" : ""} ${mode === "overwrite" ? "set" : "created"}`
          : "No new records needed — all students already have fees set for this year",
      });
    } catch (e: any) {
      toast({ title: e.message ?? "Failed to apply fees", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  }

  function handleSave() {
    if (!matrix) return;
    const entries: { classCode: string; feeTypeId: string; amount: number }[] = [];
    for (const cls of matrix.classes)
      for (const ft of matrix.feeTypes) {
        const amt = parseInt(amounts[cls.code]?.[ft.id] ?? "");
        if (!isNaN(amt) && amt >= 0) entries.push({ classCode: cls.code, feeTypeId: ft.id, amount: amt });
      }
    saveMut.mutate({ data: { academicYearId: yearId, entries } });
  }

  function moveTo(r: number, c: number) {
    if (!matrix) return;
    const nr = Math.max(0, Math.min(matrix.classes.length - 1, r));
    const nc = Math.max(0, Math.min(matrix.feeTypes.length - 1, c));
    const el = cellRefs.current[nr]?.[nc];
    if (el) { el.focus(); el.select(); }
    setActiveCell([nr, nc]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, ri: number, ci: number) {
    if (!matrix) return;
    const rows = matrix.classes.length;
    const cols = matrix.feeTypes.length;
    switch (e.key) {
      case "ArrowRight": e.preventDefault(); moveTo(ri, ci + 1); break;
      case "ArrowLeft":  e.preventDefault(); moveTo(ri, ci - 1); break;
      case "ArrowDown":  e.preventDefault(); moveTo(ri + 1, ci); break;
      case "ArrowUp":    e.preventDefault(); moveTo(ri - 1, ci); break;
      case "Tab":        e.preventDefault(); e.shiftKey ? moveTo(ri, ci - 1) : moveTo(ri, ci + 1); break;
      case "Enter":      e.preventDefault(); e.shiftKey ? moveTo(ri - 1, ci) : moveTo(ri + 1, ci); break;
      case "Home":       e.preventDefault(); e.ctrlKey ? moveTo(0, 0) : moveTo(ri, 0); break;
      case "End":        e.preventDefault(); e.ctrlKey ? moveTo(rows - 1, cols - 1) : moveTo(ri, cols - 1); break;
    }
  }

  const COL_W = 140;
  const ROW_HDR_W = 172;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <Label className="shrink-0 text-sm">Academic Year</Label>
          <Select value={yearId} onValueChange={setYearId}>
            <SelectTrigger className="w-44 h-8"><SelectValue placeholder="Select year…" /></SelectTrigger>
            <SelectContent>{years.map((y: any) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50"
            onClick={() => setApplyDialog("confirm")}
            disabled={applying || !yearId || !matrix}>
            {applying
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…</>
              : <><Users className="h-3.5 w-3.5" /> Apply to Students</>}
          </Button>
          <Button size="sm" className="h-8 gap-1.5 bg-slate-900 hover:bg-slate-700 text-white" onClick={handleSave} disabled={saveMut.isPending || !matrix}>
            {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Save Schedule
          </Button>
        </div>
      </div>

      {/* Apply to students — confirmation dialog */}
      <Dialog open={applyDialog !== "closed"} onOpenChange={o => { if (!o) setApplyDialog("closed"); }}>
        <DialogContent className="max-w-md">
          {applyDialog === "confirm" && (<>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" /> Apply Class/Program Fees to All Students
              </DialogTitle>
              <DialogDescription className="pt-1 space-y-2 text-sm">
                <p>This will create individual fee records for every student based on their class fee structure for the selected year.</p>
                <p className="font-medium text-slate-700">Students who already have a custom fee set will <span className="underline">not</span> be changed. Locked (paid) fees are always skipped.</p>
                <p className="text-slate-500">To also reset existing custom fees back to class defaults, use <span className="font-mono text-xs bg-slate-100 px-1 rounded">Overwrite All</span> below.</p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setApplyDialog("closed")}>Cancel</Button>
              <Button variant="outline" size="sm" className="text-rose-600 border-rose-200 hover:bg-rose-50"
                onClick={() => setApplyDialog("overwrite-confirm")}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Overwrite All
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => applyToStudents("fill")}>
                <Users className="h-3.5 w-3.5 mr-1" /> Apply (Fill Missing)
              </Button>
            </DialogFooter>
          </>)}
          {applyDialog === "overwrite-confirm" && (<>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-700">
                <AlertCircle className="h-4 w-4" /> Overwrite All Student Fees?
              </DialogTitle>
              <DialogDescription className="pt-1 text-sm">
                <p>This will <strong>replace every student's fee amount</strong> for this year with the class default — including any individually adjusted fees. Paid (locked) fees are still protected.</p>
                <p className="mt-2 font-medium text-rose-600">This cannot be undone.</p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setApplyDialog("confirm")}>← Back</Button>
              <Button size="sm" variant="destructive" onClick={() => applyToStudents("overwrite")}>
                Yes, Overwrite All
              </Button>
            </DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>

      {!yearId ? (
        <p className="text-sm text-muted-foreground text-center py-16">Select an academic year to view the schedule.</p>
      ) : isLoading ? (
        <div className="space-y-px">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-none first:rounded-t-xl last:rounded-b-xl" />)}</div>
      ) : !matrix || matrix.feeTypes.length === 0 ? (
        <p className="text-center py-16 text-sm text-muted-foreground">No fee types defined yet — add them in the Fee Types tab first.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto shadow-sm bg-white select-none"
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setActiveCell(null); }}>
          <DndContext sensors={gridSensors} collisionDetection={closestCenter} onDragEnd={handleGridDragEnd}>
            <table className="border-collapse text-sm" style={{ tableLayout: "fixed", width: ROW_HDR_W + COL_W * orderedFeeTypes.length }}>
              {/* ─── Header row ─── */}
              <thead>
                <SortableContext items={orderedFeeTypes.map(ft => `col:${ft.id}`)} strategy={horizontalListSortingStrategy}>
                  <tr>
                    {/* Corner */}
                    <th style={{ position: "sticky", top: 0, left: 0, zIndex: 40, width: ROW_HDR_W, minWidth: ROW_HDR_W }}
                      className="bg-[#f0f2f5] border-b-2 border-r-2 border-slate-300 px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
                      CLASS
                    </th>
                    {orderedFeeTypes.map(ft => (
                      <SortableColHeader key={ft.id} ft={ft} colW={COL_W} dragDisabled={activeCell !== null} />
                    ))}
                  </tr>
                </SortableContext>
              </thead>

              {/* ─── Data rows ─── */}
              <tbody>
                <SortableContext items={orderedClasses.map(c => `row:${c.id}`)} strategy={verticalListSortingStrategy}>
                  {orderedClasses.map((cls, ri) => (
                    <SortableClassRow
                      key={cls.id}
                      cls={cls}
                      ri={ri}
                      feeTypes={orderedFeeTypes}
                      amounts={amounts}
                      activeCell={activeCell}
                      dragDisabled={activeCell !== null}
                      colW={COL_W}
                      rowHdrW={ROW_HDR_W}
                      setCell={setCell}
                      setActiveCell={setActiveCell}
                      handleKeyDown={handleKeyDown}
                      setCellRef={setCellRef}
                    />
                  ))}
                </SortableContext>
              </tbody>
            </table>
          </DndContext>

          {/* Keyboard hint */}
          <div className="sticky bottom-0 left-0 flex items-center gap-4 px-4 py-1.5 bg-[#f0f2f5] border-t border-slate-200 text-[10px] text-slate-400 font-mono">
            <span>↑↓←→ navigate</span>
            <span>Tab / Shift+Tab  move right / left</span>
            <span>Enter  move down</span>
            <span>Home / End  first / last column</span>
            <span>Ctrl+Home  A1</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Generate Challan ────────────────────────────────────────────────────

function TabGenerateChallan() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const defaultYearId = useDefaultYear();

  const { data: yearsRaw = [] } = useListAdminAcademicYears();
  const years = yearsRaw as any[];
  const { data: classesRaw = [] } = useListAdminClasses();
  const classes = classesRaw as any[];
  const { data: sectionsRaw = [] } = useListAdminSections();
  const sections = sectionsRaw as any[];
  const { data: feeTypesRaw = [] } = useListAdminFeeTypes();
  const feeTypes = (feeTypesRaw as FeeType[]).filter(ft => ft.active);

  const sectionMap = Object.fromEntries(sections.map((s: any) => [s.id, s.name])) as Record<string, string>;
  const classMap   = Object.fromEntries(classes.map((c: any) => [c.code, c.name])) as Record<string, string>;

  const [yearId, setYearId]             = useState("");
  const [feeTypeIds, setFeeTypeIds]     = useState<string[]>([]);
  const [periodStart, setPeriodStart]   = useState(thisMonth());
  const [issueDate, setIssueDate]       = useState(today());
  const [dueDate, setDueDate]           = useState(today());

  const [selectedClasses, setSelectedClasses]   = useState<string[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [statusFilter, setStatusFilter]         = useState("active");
  const [searchQ, setSearchQ]                   = useState("");

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [result, setResult]         = useState<{ generated: number; skipped: number; students: number } | null>(null);

  useEffect(() => { if (!yearId && defaultYearId) setYearId(defaultYearId); }, [defaultYearId]);
  useEffect(() => { setCheckedIds(new Set()); }, [yearId]);

  const studentParams = {
    classCodes: selectedClasses.length > 0 ? selectedClasses.join(",") : undefined,
    sectionIds: selectedSections.length > 0 ? selectedSections.join(",") : undefined,
    status: statusFilter === "all" ? undefined : statusFilter || undefined,
    q: searchQ || undefined,
    pageSize: 200,
  };
  const { data: studentsPage, isFetching: studentsLoading } = useListAdminStudents(studentParams, {
    query: { queryKey: getListAdminStudentsQueryKey(studentParams) },
  });
  const students: any[] = (studentsPage as any)?.items ?? [];

  // Any selected fee type that is period-based (not "once") requires a period start month
  const needsPeriod = feeTypes.some(ft => feeTypeIds.includes(ft.id) && ft.duration !== "once");

  function toggleClass(code: string) {
    setSelectedClasses(p => p.includes(code) ? p.filter(x => x !== code) : [...p, code]);
    setCheckedIds(new Set());
  }
  function toggleSection(id: string) {
    setSelectedSections(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    setCheckedIds(new Set());
  }
  function toggleStudent(id: string) {
    setCheckedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll()  { setCheckedIds(new Set(students.map(s => s.id))); }
  function clearAll()   { setCheckedIds(new Set()); }
  function toggleFt(id: string) { setFeeTypeIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); }

  const allChecked  = students.length > 0 && students.every(s => checkedIds.has(s.id));
  const someChecked = checkedIds.size > 0;

  const bulkMut = useGenerateBulkAdminFeeChallans({
    mutation: {
      onSuccess: (data: any) => {
        setResult(data);
        const zeroed = data.zeroed ?? 0;
        toast({
          title: `Generated ${data.generated} challans for ${data.students} students`,
          description: zeroed > 0 ? `${zeroed} skipped (zero amount)` : undefined,
        });
      },
      onError: (err: Error) => toast({ title: "Generation failed", description: (err as any)?.data?.error ?? err.message, variant: "destructive" }),
    },
  });

  function handleGenerate() {
    if (!yearId)           { toast({ title: "Select an academic year", variant: "destructive" }); return; }
    if (!someChecked)      { toast({ title: "Select at least one student", variant: "destructive" }); return; }
    if (!feeTypeIds.length){ toast({ title: "Select at least one fee type", variant: "destructive" }); return; }
    if (!issueDate || !dueDate) { toast({ title: "Fill issue and due dates", variant: "destructive" }); return; }
    if (needsPeriod && !periodStart) { toast({ title: "Period start month is required", variant: "destructive" }); return; }
    bulkMut.mutate({
      data: {
        academicYearId: yearId,
        studentIds: Array.from(checkedIds),
        feeTypeIds,
        periodStart: needsPeriod ? periodStart : undefined,
        issueDate,
        dueDate,
        skipDuplicates: true,
      },
    });
  }

  const { dirtyCount: studentFeeDirty } = useContext(FeeGridDirtyCtx);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Unsaved student fee override warning */}
      {studentFeeDirty > 0 && (
        <div className="lg:col-span-3 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <span>
            <strong>Unsaved fee overrides:</strong> You have {studentFeeDirty} unsaved change{studentFeeDirty !== 1 ? "s" : ""} in the Students Fee Structure tab.
            Save them first — overrides not yet saved will not be applied to challans generated here.
          </span>
        </div>
      )}

      {/* Left: filters + student roster */}
      <div className="lg:col-span-2 space-y-4">

        {/* Filter card */}
        <div className="rounded-2xl border border-border bg-white shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Academic Year <span className="text-red-500">*</span></Label>
              <Select value={yearId} onValueChange={setYearId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select year…" /></SelectTrigger>
                <SelectContent>{years.map((y: any) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setCheckedIds(new Set()); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">
              Classes <span className="text-slate-400 font-normal">(leave blank for all)</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {classes.map((c: any) => (
                <button key={c.code} onClick={() => toggleClass(c.code)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
                    selectedClasses.includes(c.code)
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-300 hover:border-slate-500",
                  )}>
                  {c.name}
                </button>
              ))}
              {selectedClasses.length > 0 && (
                <button onClick={() => { setSelectedClasses([]); setCheckedIds(new Set()); }}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold text-slate-400 hover:text-slate-600 border border-dashed border-slate-300">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">
              Sections <span className="text-slate-400 font-normal">(leave blank for all)</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {sections.map((s: any) => (
                <button key={s.id} onClick={() => toggleSection(s.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
                    selectedSections.includes(s.id)
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-300 hover:border-slate-500",
                  )}>
                  {s.name}
                </button>
              ))}
              {selectedSections.length > 0 && (
                <button onClick={() => { setSelectedSections([]); setCheckedIds(new Set()); }}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold text-slate-400 hover:text-slate-600 border border-dashed border-slate-300">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={searchQ} onChange={e => { setSearchQ(e.target.value); setCheckedIds(new Set()); }}
              placeholder="Search name or Register ID…" className="pl-8 h-9 text-sm" />
          </div>
        </div>

        {/* Student table */}
        <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-slate-50">
            <div className="flex items-center gap-3">
              <Checkbox checked={allChecked} onCheckedChange={v => v ? selectAll() : clearAll()} />
              <span className="text-xs font-semibold text-slate-600">
                {studentsLoading ? "Loading…" : `${students.length} student${students.length !== 1 ? "s" : ""}`}
              </span>
              <span className="text-xs font-bold text-slate-900">{checkedIds.size} selected</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={selectAll} disabled={students.length === 0}
                className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-40">
                Select all on this page
              </button>
              <span className="text-slate-300 select-none">·</span>
              <button onClick={clearAll} disabled={!someChecked}
                className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-40">
                Deselect all
              </button>
            </div>
          </div>

          {studentsLoading ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : students.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">No students match the current filters</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-10 px-3 py-2"></th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Applicant ID</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Class</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Section</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Family ID</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Guardian Name</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.map((s: any) => (
                    <tr key={s.id}
                      className={cn("hover:bg-slate-50 cursor-pointer transition-colors", checkedIds.has(s.id) && "bg-blue-50")}
                      onClick={() => toggleStudent(s.id)}>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <Checkbox checked={checkedIds.has(s.id)} onCheckedChange={() => toggleStudent(s.id)} />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{s.applicantId}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{s.fullName}</td>
                      <td className="px-3 py-2.5 text-slate-600">{classMap[s.classCode] ?? s.classCode}</td>
                      <td className="px-3 py-2.5 text-slate-600">{sectionMap[s.sectionId] ?? "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{(s as any).guardianFamilyId ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-600">{s.guardianName || s.fatherName || "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                          s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                        )}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Result summary */}
        {result && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Students",  value: result.students,  color: "bg-blue-100 text-blue-700"     },
              { label: "Generated", value: result.generated, color: "bg-emerald-100 text-emerald-700" },
              { label: "Skipped",   value: result.skipped,   color: "bg-slate-100 text-slate-600"   },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-border bg-white px-4 py-3 text-center">
                <span className={cn("inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xl font-extrabold", s.color)}>{s.value}</span>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <Button
          className="gap-1.5 w-full sm:w-auto"
          onClick={handleGenerate}
          disabled={bulkMut.isPending || !someChecked || feeTypeIds.length === 0}>
          {bulkMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {someChecked
            ? `Generate Challans for ${checkedIds.size} Student${checkedIds.size !== 1 ? "s" : ""}`
            : "Generate Challans"}
        </Button>
      </div>

      {/* Right: fee params */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-white shadow-sm p-4">
          <FeeTypeChecks
            feeTypes={feeTypes}
            selected={feeTypeIds}
            onToggle={toggleFt}
            onAll={() => setFeeTypeIds(feeTypes.map(ft => ft.id))}
            onNone={() => setFeeTypeIds([])}
          />
        </div>
        <div className="rounded-2xl border border-border bg-white shadow-sm p-4 space-y-3">
          {needsPeriod && (
            <div className="space-y-1.5">
              <Label>Period Start Month <span className="text-red-500">*</span></Label>
              <Input type="month" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="h-9" />
              {periodStart && (() => {
                const previews = feeTypes
                  .filter(ft => feeTypeIds.includes(ft.id) && ft.duration !== "once")
                  .map(ft => {
                    const n = DURATION_MONTH_COUNT[ft.duration] ?? 1;
                    const end = addMonths(periodStart, n);
                    return `${ft.name}: ${fmtMonth(periodStart)}${n > 1 ? ` – ${fmtMonth(end)}` : ""}`;
                  });
                return previews.length > 0 ? (
                  <ul className="text-[11px] text-slate-500 space-y-0.5 mt-1">
                    {previews.map((p, i) => <li key={i} className="font-mono">{p}</li>)}
                  </ul>
                ) : null;
              })()}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Issue Date <span className="text-red-500">*</span></Label>
            <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label>Due Date <span className="text-red-500">*</span></Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-9" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 5: Collect Fee ───────────────────────────────────────────────────────

function TabCollectFee() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const defaultYearId = useDefaultYear();

  const { data: yearsRaw = [] } = useListAdminAcademicYears();
  const years = yearsRaw as any[];
  const { data: classesRaw = [] } = useListAdminClasses();
  const classes = classesRaw as any[];
  const { data: sectionsRaw = [] } = useListAdminSections();
  const sections = sectionsRaw as any[];
  const { data: feeTypesRaw = [] } = useListAdminFeeTypes();
  const feeTypes = (feeTypesRaw as FeeType[]).filter(ft => ft.active);

  const [yearId, setYearId]                       = useState("");
  const [selectedClasses, setSelectedClasses]     = useState<string[]>([]);
  const [selectedSections, setSelectedSections]   = useState<string[]>([]);
  const [month, setMonth]                         = useState("");
  const [searchQ, setSearchQ]                     = useState("");
  const [filterFeeTypeIds, setFilterFeeTypeIds]   = useState<string[]>([]);

  useEffect(() => { if (!yearId && defaultYearId) setYearId(defaultYearId); }, [defaultYearId]);

  const collectParams = {
    academicYearId: yearId || "",
    classCodes:  selectedClasses.length  > 0 ? selectedClasses.join(",")  : undefined,
    sectionIds:  selectedSections.length > 0 ? selectedSections.join(",") : undefined,
    month: month || undefined,
  };
  const collectQKey = getCollectAdminFeeChallansQueryKey(collectParams);
  const { data: rows = [], isLoading } = useCollectAdminFeeChallans(
    collectParams,
    { query: { enabled: !!yearId, queryKey: collectQKey } },
  );
  const collectRows = rows as CollectFeeRow[];

  // Resolve collectedBy names for audit trail in pending-approval challans
  const allChallanCollectorIds = collectRows.flatMap(row =>
    (row.challans ?? []).map((c: any) => c.collectedBy as string | null | undefined)
  );
  const challanAuditNames = useAdminNames(allChallanCollectorIds);

  const visibleRows = collectRows.filter(row => {
    if (row.status === "not_generated") return false;
    if (filterFeeTypeIds.length > 0) {
      if (!row.challans?.some(c => filterFeeTypeIds.includes((c as any).feeTypeId))) return false;
    }
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      return (
        (row.fullName ?? "").toLowerCase().includes(q) ||
        (row.applicantId ?? "").toLowerCase().includes(q) ||
        (row.fatherName ?? "").toLowerCase().includes(q) ||
        (row.guardianName ?? "").toLowerCase().includes(q) ||
        (row.guardianMobile ?? "").toLowerCase().includes(q) ||
        (row.guardianFamilyId ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const notGenCount    = visibleRows.filter(r => r.status === "not_generated").length;
  const pendingCount   = visibleRows.filter(r => r.status === "pending" || r.status === "partial").length;
  const totalCollected = visibleRows.reduce((s, r) => s + r.paidAmount, 0);

  const { data: bankAccountsRaw = [] } = useListAdminBankAccounts();
  const bankAccounts = bankAccountsRaw as CashBankAccount[];
  const cashAccounts = bankAccounts.filter(a => a.type === "cash" && a.isActive);
  const bankOnlyAccounts = bankAccounts.filter(a => a.type === "bank" && a.isActive);
  const allAccounts = [...cashAccounts, ...bankOnlyAccounts];

  const [markPaidStudent, setMarkPaidStudent]       = useState<CollectFeeRow | null>(null);
  const [selectedChallanIds, setSelectedChallanIds] = useState<string[]>([]);
  const [challanAmts, setChallanAmts]               = useState<Record<string, number>>({});
  const [bankAccountId, setBankAccountId]           = useState<string | null>(null);
  const [receiptNumber, setReceiptNumber]           = useState("");
  const [paidDate, setPaidDate]                     = useState(today());
  const [paidDateError, setPaidDateError]           = useState("");
  const [remarks, setRemarks]                       = useState("");
  const [submitting, setSubmitting]                 = useState(false);

  const markPaidMut = useMarkAdminFeeChallanPaid();

  useEffect(() => {
    if (markPaidStudent !== null) {
      qc.invalidateQueries({ queryKey: getListAdminBankAccountsQueryKey() });
      if (allAccounts.length === 1) {
        setBankAccountId(allAccounts[0].id);
      }
    }
  }, [markPaidStudent !== null]);

  function resetPaymentDialog() {
    setMarkPaidStudent(null); setSelectedChallanIds([]); setChallanAmts({});
    setBankAccountId(null); setReceiptNumber("");
    setPaidDate(today()); setPaidDateError(""); setRemarks("");
  }

  function toggleChallan(challanId: string, challanAmount: number) {
    if (challanAmount <= 0) return;
    const isSelected = selectedChallanIds.includes(challanId);
    if (isSelected) {
      setSelectedChallanIds(prev => prev.filter(id => id !== challanId));
      setChallanAmts(prev => { const n = { ...prev }; delete n[challanId]; return n; });
    } else {
      setSelectedChallanIds(prev => [...prev, challanId]);
      setChallanAmts(prev => ({ ...prev, [challanId]: challanAmount }));
    }
  }

  async function handleConfirmPayment() {
    if (selectedChallanIds.length === 0) return;
    if (paidDate > today()) { setPaidDateError("Payment date cannot be in the future"); return; }
    setPaidDateError("");
    setSubmitting(true);
    let successCount = 0;
    const composedRemarks = [
      receiptNumber.trim() ? `Rcpt# ${receiptNumber.trim()}` : "",
      remarks.trim(),
    ].filter(Boolean).join(" | ");
    for (const id of selectedChallanIds) {
      try {
        await markPaidMut.mutateAsync({
          id,
          data: {
            paidAmount:    challanAmts[id] || undefined,
            bankAccountId: bankAccountId || undefined,
            paidAt:        paidDate || undefined,
            remarks:       composedRemarks || undefined,
          },
        });
        successCount++;
      } catch (err: any) {
        const msg: string = err?.data?.error ?? err?.message ?? "";
        if (msg.toLowerCase().includes("date") || err?.data?.field === "paidAt") {
          setPaidDateError(msg);
        } else {
          toast({ title: `Failed: ${id}`, description: msg, variant: "destructive" });
        }
      }
    }
    setSubmitting(false);
    if (successCount > 0) {
      qc.invalidateQueries({ queryKey: collectQKey });
      toast({ title: `${successCount} payment${successCount > 1 ? "s" : ""} recorded` });
      resetPaymentDialog();
    }
  }

  function toggleClass(code: string)   { setSelectedClasses(p => p.includes(code) ? p.filter(x => x !== code) : [...p, code]); }
  function toggleSection(id: string)   { setSelectedSections(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); }
  function toggleFeeType(id: string)   { setFilterFeeTypeIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Left: filter card + summary + table */}
      <div className="lg:col-span-2 space-y-4">

        {/* Filter card */}
        <div className="rounded-2xl border border-border bg-white shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Academic Year <span className="text-red-500">*</span></Label>
              <Select value={yearId} onValueChange={setYearId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Year…" /></SelectTrigger>
                <SelectContent>{years.map((y: any) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Month <span className="text-slate-400 font-normal">(leave blank for all)</span></Label>
              <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">
              Classes <span className="text-slate-400 font-normal">(leave blank for all)</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {classes.map((c: any) => (
                <button key={c.code} onClick={() => toggleClass(c.code)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
                    selectedClasses.includes(c.code)
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-300 hover:border-slate-500",
                  )}>
                  {c.name}
                </button>
              ))}
              {selectedClasses.length > 0 && (
                <button onClick={() => setSelectedClasses([])}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold text-slate-400 hover:text-slate-600 border border-dashed border-slate-300">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">
              Sections <span className="text-slate-400 font-normal">(leave blank for all)</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {sections.map((s: any) => (
                <button key={s.id} onClick={() => toggleSection(s.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
                    selectedSections.includes(s.id)
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-300 hover:border-slate-500",
                  )}>
                  {s.name}
                </button>
              ))}
              {selectedSections.length > 0 && (
                <button onClick={() => setSelectedSections([])}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold text-slate-400 hover:text-slate-600 border border-dashed border-slate-300">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={searchQ} onChange={e => setSearchQ(e.target.value)}
              placeholder="Search name, Applicant ID, father, guardian, phone, family ID…"
              className="pl-8 h-9 text-sm" />
          </div>
        </div>

        {/* Summary cards */}
        {!isLoading && collectRows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Showing",       value: visibleRows.length, color: "bg-indigo-100 text-indigo-700" },
              { label: "Not Generated", value: notGenCount,        color: "bg-slate-100 text-slate-600"  },
              { label: "Pending",       value: pendingCount,       color: "bg-amber-100 text-amber-700"  },
              { label: "Collected",     value: formatCurrency(totalCollected), color: "bg-emerald-100 text-emerald-700" },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 shadow-sm">
                <span className={cn("flex h-8 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-extrabold min-w-8", s.color)}>{s.value}</span>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        {!yearId ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
            <Users className="h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">Select an academic year to load students</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : visibleRows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-16">
            {collectRows.length === 0 ? "No students found for this selection." : "No rows match the current search / fee-type filter."}
          </p>
        ) : (
          <div className="rounded-2xl border border-border overflow-auto bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-border">
                  {["Student","Father / Guardian","Applicant ID","Class/Program","Period","Amount","Paid","Pending","Status",""].map((h, i) => (
                    <th key={i} className={cn("text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap",
                      i === 1 && "hidden md:table-cell",
                      i === 3 && "hidden sm:table-cell",
                      i === 4 && "hidden sm:table-cell",
                      i === 9 && "w-24")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleRows.map(row => (
                  <tr key={row.studentId} className={cn("hover:bg-slate-50/60 transition-colors",
                    row.status === "not_generated" && "opacity-60")}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 text-sm">{row.fullName}</p>
                      {row.guardianFamilyId && (
                        <p className="text-[10px] font-mono text-slate-400">{row.guardianFamilyId}</p>
                      )}
                      {(row.challanNumbers?.length ?? 0) > 0 && (
                        <p className="text-[10px] font-mono text-slate-400">{row.challanNumbers?.[0]}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs hidden md:table-cell">
                      <p>{row.guardianName || row.fatherName || "—"}</p>
                      {row.guardianMobile && <p className="font-mono text-[11px] text-slate-400">{row.guardianMobile}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.applicantId}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs hidden sm:table-cell">{row.classCode}</td>
                    <td className="px-4 py-3 text-xs hidden sm:table-cell">
                      {(() => {
                        const challans = (row.challans ?? []) as any[];
                        if (challans.length === 0) return <span className="text-slate-400">—</span>;
                        const labels = Array.from(new Set(challans.map(c => {
                          const ps = c.periodMonthStart ?? c.month;
                          const pe = c.periodMonthEnd;
                          if (!ps) return null;
                          return (pe && pe !== ps) ? `${fmtMonth(ps)} – ${fmtMonth(pe)}` : fmtMonth(ps);
                        }).filter(Boolean)));
                        if (labels.length === 0) return <span className="text-slate-400">—</span>;
                        return (
                          <div className="space-y-0.5">
                            {labels.map(l => (
                              <p key={l} className="font-mono text-slate-700 whitespace-nowrap">{l}</p>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      {row.totalAmount > 0 ? formatCurrency(row.totalAmount) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-emerald-700 text-sm">
                      {row.paidAmount > 0 ? formatCurrency(row.paidAmount) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-red-600 text-sm">
                      {row.pendingAmount > 0 ? formatCurrency(row.pendingAmount) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        STATUS_META[row.status]?.classes ?? "bg-slate-100 text-slate-600")}>
                        {STATUS_META[row.status]?.label ?? row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(row.status === "pending" || row.status === "partial") && (row.challans?.length ?? 0) > 0 && (
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => {
                            setMarkPaidStudent(row);
                            setSelectedChallanIds([]);
                            setChallanAmts({});
                            setBankAccountId(null);
                            setPaidDate(today());
                            setRemarks("");
                          }}>
                          Collect
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right: fee type filter panel */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-white shadow-sm p-4">
          <FeeTypeChecks
            feeTypes={feeTypes}
            selected={filterFeeTypeIds}
            onToggle={toggleFeeType}
            onAll={() => setFilterFeeTypeIds(feeTypes.map(ft => ft.id))}
            onNone={() => setFilterFeeTypeIds([])}
          />
          {filterFeeTypeIds.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-400">
              Showing rows with a challan for selected fee type(s).
            </p>
          )}
        </div>
      </div>

      {/* Collect Payment dialog — wide split-screen */}
      <Dialog open={!!markPaidStudent} onOpenChange={o => { if (!o) resetPaymentDialog(); }}>
        <DialogContent className="max-w-4xl p-0 gap-0 flex flex-col max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b border-border shrink-0">
            <DialogTitle className="text-base font-bold text-slate-900">
              Collect Payment — {markPaidStudent?.fullName}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">
              {markPaidStudent?.applicantId} · {markPaidStudent?.classCode?.toUpperCase()}
              {(markPaidStudent?.guardianName || markPaidStudent?.fatherName) ? ` · ${markPaidStudent.guardianName || markPaidStudent.fatherName}` : ""}
              {markPaidStudent?.guardianMobile ? ` · ${markPaidStudent.guardianMobile}` : ""}
            </DialogDescription>
          </div>

          {/* Body: split left / right — fills remaining height, scrolls internally */}
          <div className="grid grid-cols-2 divide-x divide-border flex-1 min-h-0 overflow-hidden">

            {/* ── LEFT: All fee types ── */}
            <div className="flex flex-col overflow-hidden">
              <p className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-border bg-slate-50 shrink-0">
                Due Fee Types
              </p>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">

                {/* Already paid */}
                {(markPaidStudent?.challans?.filter(c => c.status === "paid")?.length ?? 0) > 0 && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Already Paid</p>
                    {markPaidStudent?.challans?.filter(c => c.status === "paid").map(c => (
                      <div key={c.id} className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{c.feeTypeName}</p>
                          <p className="text-[11px] text-slate-500 font-mono">{(() => { const ps = (c as any).periodMonthStart ?? c.month; const pe = (c as any).periodMonthEnd; return ps ? (pe && pe !== ps ? `${fmtMonth(ps)} – ${fmtMonth(pe)}` : fmtMonth(ps)) : c.issueDate; })()}</p>
                        </div>
                        <p className="text-sm font-bold text-emerald-700 shrink-0">{formatCurrency(c.amount)}</p>
                        <JEViewerButton sourceRefId={c.id} />
                      </div>
                    ))}
                    <div className="border-t border-dashed border-border my-1" />
                  </>
                )}

                {/* Selectable / pending challans — checkboxes, multi-select */}
                {markPaidStudent?.challans?.filter(c => c.status !== "paid").length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No pending challans</p>
                ) : (() => {
                  const pendingChallans = markPaidStudent?.challans?.filter(c => c.status !== "paid" && c.amount > 0) ?? [];
                  const allSelected = pendingChallans.length > 0 && pendingChallans.every(c => selectedChallanIds.includes(c.id));
                  return (<>
                    <div className="flex items-center justify-between px-1 pb-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none" onClick={() => {
                        if (allSelected) {
                          setSelectedChallanIds(prev => prev.filter(id => !pendingChallans.some(c => c.id === id)));
                          setChallanAmts(prev => {
                            const n = { ...prev };
                            pendingChallans.forEach(c => delete n[c.id]);
                            return n;
                          });
                        } else {
                          const newIds = pendingChallans.map(c => c.id);
                          setSelectedChallanIds(prev => Array.from(new Set([...prev, ...newIds])));
                          setChallanAmts(prev => {
                            const n = { ...prev };
                            pendingChallans.forEach(c => { n[c.id] = c.amount; });
                            return n;
                          });
                        }
                      }}>
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={() => {}}
                          onClick={e => e.stopPropagation()}
                          className="shrink-0"
                        />
                        <span className="text-xs font-semibold text-slate-600">
                          {allSelected ? "Clear All" : "Select All Due"}
                        </span>
                      </label>
                      <span className="text-[11px] text-slate-400">{pendingChallans.length} pending</span>
                    </div>
                    {pendingChallans.map(c => {
                    const checked = selectedChallanIds.includes(c.id);
                    return (
                      <label key={c.id}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors",
                          checked
                            ? "border-slate-900 bg-slate-50 shadow-sm"
                            : "border-border hover:border-slate-400 hover:bg-slate-50/50",
                        )}
                        onClick={() => toggleChallan(c.id, c.amount)}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleChallan(c.id, c.amount)}
                          className="mt-0.5 shrink-0"
                          onClick={e => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 leading-tight">{c.feeTypeName}</p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {(() => { const ps = (c as any).periodMonthStart ?? c.month; const pe = (c as any).periodMonthEnd; return ps ? (pe && pe !== ps ? `${fmtMonth(ps)} – ${fmtMonth(pe)}` : fmtMonth(ps)) : c.issueDate; })()}
                            {c.dueDate ? ` · Due: ${c.dueDate}` : ""}
                          </p>
                          {(c as any).status === "pending_approval" && (c as any).collectedBy && challanAuditNames[(c as any).collectedBy] && (
                            <p className="text-[10px] text-amber-600 mt-0.5 italic">
                              Collected by {challanAuditNames[(c as any).collectedBy]} — awaiting approval
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-slate-900">Rs {c.amount.toLocaleString()}</p>
                          <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full", STATUS_META[c.status]?.classes)}>
                            {STATUS_META[c.status]?.label}
                          </span>
                        </div>
                      </label>
                    );
                    })}
                  </>);
                })()}
              </div>
            </div>

            {/* ── RIGHT: Account + per-challan amounts + date + remarks ── */}
            <div className="flex flex-col overflow-hidden">
              <p className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-border bg-slate-50 shrink-0">
                Received Into
              </p>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {/* Flat account list */}
                <div className="space-y-1.5">
                  <Label>Received Into <span className="text-red-500">*</span></Label>
                  {allAccounts.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-slate-50 px-4 py-6 text-center space-y-1.5">
                      <p className="text-sm font-medium text-slate-600">No accounts set up yet.</p>
                      <a href="/admin/accounts?tab=setup" target="_blank"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <ExternalLink className="h-3 w-3" /> Set up an account →
                      </a>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {allAccounts.map(a => {
                        const isCash = a.type === "cash";
                        const isSelected = bankAccountId === a.id;
                        return (
                          <label key={a.id}
                            className={cn(
                              "flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors",
                              isSelected
                                ? isCash ? "border-emerald-500 bg-emerald-50" : "border-blue-500 bg-blue-50"
                                : "border-border hover:bg-slate-50",
                            )}>
                            <input type="radio" name="bankAcct" className="sr-only"
                              checked={isSelected}
                              onChange={() => setBankAccountId(a.id)} />
                            <div className={cn("h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                              isSelected
                                ? isCash ? "border-emerald-500 bg-emerald-500" : "border-blue-500 bg-blue-500"
                                : "border-slate-300")}>
                              {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-semibold text-slate-800 leading-tight">{a.accountTitle}</p>
                                <span className={cn(
                                  "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                  isCash ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700",
                                )}>
                                  {isCash ? "Cash" : "Bank"}
                                </span>
                              </div>
                              {a.notes && <p className="text-[11px] text-slate-400">{a.notes}</p>}
                              {a.bankName && <p className="text-[11px] text-slate-500">{a.bankName}</p>}
                              {a.ibanNumber && <p className="text-[11px] font-mono text-slate-400">{a.ibanNumber}</p>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Per-challan amount inputs (shown when ≥1 challan selected) */}
                {selectedChallanIds.length > 0 && (() => {
                  const grandTotal = selectedChallanIds.reduce((sum, id) => sum + (challanAmts[id] ?? 0), 0);
                  return (
                    <div className="space-y-2">
                      <Label>Amounts <span className="text-red-500">*</span></Label>
                      {selectedChallanIds.map(id => {
                        const c = markPaidStudent?.challans?.find(x => x.id === id);
                        if (!c) return null;
                        const amt = challanAmts[id] ?? c.amount;
                        const isPartial = amt < c.amount;
                        return (
                          <div key={id} className="rounded-xl border border-border px-3 py-2.5 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-700 leading-tight truncate">{c.feeTypeName}</p>
                              {isPartial && (
                                <span className="text-[10px] font-bold text-amber-600 shrink-0">Partial</span>
                              )}
                            </div>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">Rs</span>
                              <Input
                                type="number"
                                min={1}
                                max={c.amount}
                                value={amt}
                                onChange={e => setChallanAmts(prev => ({ ...prev, [id]: Number(e.target.value) || 0 }))}
                                className="h-8 pl-9 text-sm"
                              />
                            </div>
                          </div>
                        );
                      })}
                      {selectedChallanIds.length > 1 && (
                        <div className="flex items-center justify-between px-1 pt-1 border-t border-dashed border-border">
                          <p className="text-xs font-bold text-slate-600">Grand Total</p>
                          <p className="text-sm font-bold text-slate-900">Rs {grandTotal.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {selectedChallanIds.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border bg-slate-50 px-4 py-5 text-center">
                    <p className="text-sm text-slate-400">Select one or more fee types on the left to enter amounts.</p>
                  </div>
                )}

                {/* Payment Date */}
                <div className="space-y-1.5">
                  <Label>Payment Date</Label>
                  <Input
                    type="date"
                    value={paidDate}
                    max={today()}
                    onChange={e => { setPaidDate(e.target.value); if (e.target.value <= today()) setPaidDateError(""); }}
                    className={cn("h-9", paidDateError && "border-red-400 focus-visible:ring-red-400")}
                  />
                  {paidDateError && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />{paidDateError}
                    </p>
                  )}
                </div>

                {/* Receipt No. — cash accounts only */}
                {allAccounts.find(a => a.id === bankAccountId)?.type === "cash" && (
                  <div className="space-y-1.5">
                    <Label>Receipt No. <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <Input
                      type="text"
                      value={receiptNumber}
                      onChange={e => setReceiptNumber(e.target.value)}
                      placeholder="e.g. 00123"
                      className="h-9"
                    />
                  </div>
                )}

                {/* Remarks */}
                <div className="space-y-1.5">
                  <Label>Remarks <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <Textarea
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    rows={3}
                    placeholder="e.g. Bank Alfalah ref #12345"
                    className="resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer — always visible, never scrolls */}
          {(() => {
            const confirmDisabled =
              selectedChallanIds.length === 0 ||
              selectedChallanIds.some(id => !challanAmts[id] || challanAmts[id] <= 0) ||
              submitting ||
              !bankAccountId;
            return (
              <div className="flex flex-col gap-2 px-6 py-4 border-t border-border bg-slate-50 shrink-0">
                {allAccounts.length === 0 && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 leading-snug">
                      <span className="font-semibold">No accounts configured</span>
                      {" — "}
                      <a href="/admin/accounts?tab=setup" target="_blank" className="underline hover:text-amber-900">
                        set up an account first
                      </a>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    {selectedChallanIds.length === 0
                      ? "No fee types selected"
                      : `${selectedChallanIds.length} fee type${selectedChallanIds.length > 1 ? "s" : ""} selected`}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={resetPaymentDialog} disabled={submitting}>
                      Cancel
                    </Button>
                    <Button
                      disabled={confirmDisabled}
                      onClick={handleConfirmPayment}>
                      {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                      Confirm Payment
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab 6: Print Challan ─────────────────────────────────────────────────────

const CHALLAN_MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtMonth(raw: string | null | undefined): string {
  if (!raw) return "—";
  const parts = raw.split("-");
  if (parts.length < 2) return raw;
  const [y, m] = parts;
  const idx = Number(m) - 1;
  return (idx >= 0 && idx < 12) ? `${CHALLAN_MONTH_ABBR[idx]} ${y}` : raw;
}

function amountInWords(n: number): string {
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
    "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function below100(x: number): string {
    return x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? " " + ones[x % 10] : "");
  }
  function below1000(x: number): string {
    return x < 100 ? below100(x) : ones[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " + below100(x % 100) : "");
  }
  const rupees = Math.floor(Math.abs(n));
  if (rupees === 0) return "Zero Rupees Only";
  let result = "";
  if (rupees >= 100000) result += below1000(Math.floor(rupees / 100000)) + " Lakh ";
  if (rupees % 100000 >= 1000) result += below1000(Math.floor((rupees % 100000) / 1000)) + " Thousand ";
  if (rupees % 1000 > 0) result += below1000(rupees % 1000);
  return result.trim() + " Rupees Only";
}

type ChallanBankAccount = {
  id: string;
  accountTitle: string;
  bankName: string | null;
  ibanNumber: string | null;
};

type ChallanDisplaySettings = {
  phone?: string;
  address?: string;
  institutionCode?: string;
  showSection?: boolean;
  showFeeDesc?: boolean;
  showBankAccounts?: boolean;
  showInstructions?: boolean;
  hideZeroRows?: boolean;
  bankAccountIds?: string[];
};

function buildChallanHtml(
  collectRows: CollectFeeRow[],
  schoolName = "Cadet College Murree",
  opts: {
    sectionMap?: Record<string, string>;
    city?: string;
    phone?: string;
    logoUrl?: string;
    settings?: ChallanDisplaySettings;
    bankAccounts?: ChallanBankAccount[];
  } = {},
) {
  const { sectionMap = {}, logoUrl = "" } = opts;
  const s = opts.settings ?? {};

  const phone            = s.phone    ?? opts.phone    ?? "";
  const address          = s.address  ?? opts.city     ?? "";
  const showSection      = s.showSection      !== false;
  const showFeeDesc      = s.showFeeDesc      !== false;
  const showBankAccounts = s.showBankAccounts === true;
  const showInstructions = s.showInstructions !== false;
  const hideZeroRows     = s.hideZeroRows     === true;

  const selectedBankIds  = s.bankAccountIds ?? [];
  const allBankAccounts  = opts.bankAccounts ?? [];
  const displayBankAccounts = showBankAccounts
    ? (selectedBankIds.length > 0
        ? allBankAccounts.filter(a => selectedBankIds.includes(a.id))
        : allBankAccounts)
    : [];

  const bankBlock = displayBankAccounts.length > 0
    ? `<div class="bank-block">
        <div class="bank-lbl">Bank Account Details:</div>
        ${displayBankAccounts.map(a => `
          <div class="bank-acct">
            ${a.bankName ? `<div class="bank-line"><span class="bank-k">Bank Name:</span> <span class="bank-v">${a.bankName}</span></div>` : ""}
            <div class="bank-line"><span class="bank-k">Account Title:</span> <span class="bank-v">${a.accountTitle}</span></div>
            ${a.ibanNumber ? `<div class="bank-line"><span class="bank-k">Account No:</span> <span class="bank-v bank-num">${a.ibanNumber}</span></div>` : ""}
          </div>`).join("")}
       </div>`
    : "";

  const pageParts: string[] = [];

  for (const r of collectRows) {
    const allItems = (r.challans ?? []) as any[];
    if (allItems.length === 0) continue;

    const itemsToRender = hideZeroRows
      ? allItems.filter((c: any) => (Number(c.amount) || 0) > 0)
      : allItems;
    if (itemsToRender.length === 0) continue;

    const total       = itemsToRender.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);
    const grossTotal  = itemsToRender.reduce((s: number, c: any) => s + (Number(c.grossAmount) || Number(c.amount) || 0), 0);
    const totalDiscount  = Math.max(0, grossTotal - total);
    const totalSurcharge = Math.max(0, total - grossTotal);
    const issueDate   = (allItems[0] as any)?.issueDate ? formatDate((allItems[0] as any).issueDate) : "—";
    const dueDate     = allItems[0]?.dueDate ? formatDate(allItems[0].dueDate) : "—";
    const sectionName = r.sectionId ? (sectionMap[r.sectionId] ?? r.sectionId) : "—";
    const studentName = (r.fullName ?? "").toUpperCase();
    const words       = amountInWords(total);

    const feeRows = itemsToRender.filter((c: any) => (Number(c.grossAmount) || Number(c.amount) || 0) > 0).map((c: any) => {
      const periodStart    = c.periodMonthStart ?? c.month;
      const periodEnd      = c.periodMonthEnd;
      const gross          = Number(c.grossAmount) || Number(c.amount) || 0;
      const discount       = Number(c.discountAmount) || 0;
      const hasDiscount    = discount > 0;
      let periodLabel: string;
      if (!periodStart) {
        periodLabel = "—";
      } else if (periodEnd && periodEnd !== periodStart) {
        periodLabel = `${fmtMonth(periodStart)} – ${fmtMonth(periodEnd)}`;
      } else {
        periodLabel = fmtMonth(periodStart);
      }
      const desc = showFeeDesc && c.feeTypeDescription ? `<div class="fee-desc">${c.feeTypeDescription}</div>` : "";
      const displayAmount = hasDiscount ? gross : (Number(c.amount) || 0);
      return `
            <tr>
              <td class="td tl">${c.feeTypeName ?? "—"}${desc}</td>
              <td class="td tc">${periodLabel}</td>
              <td class="td tr">Rs. ${displayAmount.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>`;
    }).join("");

    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" class="logo-img" alt="logo" />`
      : `<div class="logo-box"></div>`;

    const sectionRow = showSection
      ? `<tr><td class="il">Program:</td><td class="iv">${(r.classCode ?? "").toUpperCase()}</td><td class="il">Section:</td><td class="iv">${sectionName}</td></tr>`
      : `<tr><td class="il">Program:</td><td class="iv" colspan="3">${(r.classCode ?? "").toUpperCase()}</td></tr>`;

    const makeCopy = (label: string) => `
        <div class="copy">
          <div class="hdr">
            ${logoHtml}
            <div class="school-info">
              <div class="school-name">${schoolName}</div>
              ${address ? `<div class="school-meta">${address}</div>` : ""}
              ${phone ? `<div class="school-meta">UAN: ${phone}</div>` : ""}
            </div>
          </div>
          <div class="copy-label">${label}</div>
          <div class="student-name">${studentName}</div>
          <table class="info-tbl">
            <tr><td class="il">Father Name:</td><td class="iv" colspan="3">${r.fatherName ?? "—"}</td></tr>
            <tr><td class="il">Register ID:</td><td class="iv">${r.applicantId}</td><td class="il">&nbsp;</td><td class="iv"></td></tr>
            ${sectionRow}
            <tr><td class="il">Issue Date:</td><td class="iv">${issueDate}</td><td class="il">Due Date:</td><td class="iv">${dueDate}</td></tr>
          </table>
          <table class="fee-tbl">
            <thead><tr>
              <th class="th tl">Fees Type</th>
              <th class="th tc">Challan</th>
              <th class="th tr">Payable</th>
            </tr></thead>
            <tbody>${feeRows}</tbody>
            <tfoot>
              ${totalDiscount > 0 ? `
              <tr>
                <td class="td tl" colspan="2" style="color:#059669;">Fee Concession</td>
                <td class="td tr" style="color:#059669;">− Rs. ${totalDiscount.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>` : ""}
              ${totalSurcharge > 0 ? `
              <tr>
                <td class="td tl" colspan="2" style="color:#d97706;">Fee Adjustment (Surcharge)</td>
                <td class="td tr" style="color:#d97706;">+ Rs. ${totalSurcharge.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>` : ""}
              <tr>
                <td class="td tl bold" colspan="2">Total Payable Amount</td>
                <td class="td tr bold">Rs. ${total.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            </tfoot>
          </table>
          ${showInstructions ? `<div class="words-row"><span class="wl">Amount in Words:</span> <span class="wv">${words}</span></div>` : ""}
          ${bankBlock}
          ${showInstructions ? `<div class="sig-row">Signature &amp; Stamp</div>` : ""}
        </div>`;

    pageParts.push(`
      <div class="page">
        ${makeCopy("Fee Challan (Student Copy)")}
        ${makeCopy("Fee Challan (Office Copy)")}
        ${makeCopy("Fee Challan (Bank Copy)")}
      </div>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Fee Challans</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 10px; }
    @page { size: A4 landscape; margin: 8mm; }
    .toolbar { text-align: center; padding: 8px 0 12px; }
    .toolbar button { padding: 6px 18px; font-size: 13px; cursor: pointer; border: none; border-radius: 4px; margin: 0 4px; }
    .btn-print { background: #1e293b; color: #fff; }
    .btn-close  { background: #e2e8f0; color: #1e293b; }

    .page {
      display: flex;
      flex-direction: row;
      width: 100%;
      border: 1px solid #bbb;
      break-after: page;
      page-break-after: always;
      margin-bottom: 12px;
    }
    .page:last-child { margin-bottom: 0; }

    .copy {
      flex: 1;
      padding: 7px 9px;
      border-right: 1.5px dashed #999;
      display: flex;
      flex-direction: column;
      font-size: 10px;
      min-width: 0;
    }
    .copy:last-child { border-right: none; }

    .hdr { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 3px; gap: 6px; }
    .logo-box { width: 34px; height: 34px; border: 1px solid #999; flex-shrink: 0; }
    .logo-img { width: 34px; height: 34px; object-fit: contain; flex-shrink: 0; }
    .school-info { text-align: right; }
    .school-name { font-weight: 800; font-size: 11px; line-height: 1.2; }
    .school-meta { font-size: 8.5px; color: #555; }

    .copy-label {
      text-align: center; font-weight: 700; font-size: 9.5px;
      border-top: 1px solid #999; border-bottom: 1px solid #999;
      padding: 2px 0; margin-bottom: 3px;
    }
    .student-name {
      text-align: center; font-weight: 800; font-size: 11px;
      background: #f3f4f6; border: 1px solid #d1d5db;
      padding: 3px 4px; margin-bottom: 4px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .info-tbl { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    .info-tbl .il { font-size: 8.5px; color: #555; white-space: nowrap; padding: 1px 4px 1px 0; width: 1%; }
    .info-tbl .iv { font-size: 8.5px; font-weight: 700; padding: 1px 6px 1px 0; }

    .fee-tbl { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
    .th { padding: 3px 5px; border: 1px solid #374151; background: #f3f4f6; font-weight: 700; font-size: 8.5px; }
    .td { padding: 2px 5px; border: 1px solid #d1d5db; font-size: 8.5px; }
    .tl { text-align: left; }
    .fee-desc { font-size: 7.5px; color: #6b7280; font-style: italic; margin-top: 1px; }
    .tc { text-align: center; }
    .tr { text-align: right; white-space: nowrap; }
    .bold { font-weight: 800; }

    .words-row { font-size: 8.5px; border-bottom: 1px solid #ccc; padding-bottom: 16px; margin-bottom: 6px; }
    .wl { font-weight: 700; }
    .wv { font-style: italic; color: #333; margin-left: 3px; }
    .sig-row { font-size: 8.5px; color: #333; margin-top: auto; padding-top: 6px; }
    .bank-block { font-size: 8px; border-top: 1px dashed #ccc; margin-top: 5px; padding-top: 4px; }
    .bank-lbl { font-weight: 700; margin-bottom: 2px; font-size: 8px; color: #374151; }
    .bank-acct { margin-bottom: 3px; padding-bottom: 3px; }
    .bank-acct:not(:last-child) { border-bottom: 1px dotted #ddd; }
    .bank-line { margin-bottom: 1px; white-space: normal; word-break: break-word; line-height: 1.3; }
    .bank-k { font-weight: 700; color: #374151; }
    .bank-v { color: #111827; font-weight: 600; }
    .bank-num { font-family: 'Courier New', monospace; letter-spacing: 0.3px; }

    @media print {
      .toolbar { display: none !important; }
      .page { border: none; margin-bottom: 0; break-after: page; page-break-after: always; }
      .page:last-child { break-after: auto; page-break-after: auto; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">🖨 Print</button>
    <button class="btn-close"  onclick="window.close()">Close</button>
  </div>
  ${pageParts.join("\n")}
</body>
</html>`;
}

function buildBankChallanHtml(
  collectRows: CollectFeeRow[],
  schoolName = "Cadet College Murree",
  opts: {
    sectionMap?: Record<string, string>;
    city?: string;
    phone?: string;
    logoUrl?: string;
    logoUrlRight?: string;
    settings?: ChallanDisplaySettings;
    bankAccounts?: ChallanBankAccount[];
  } = {},
) {
  const { sectionMap = {}, logoUrl = "", logoUrlRight = "" } = opts;
  const s = opts.settings ?? {};

  const address      = s.address ?? opts.city ?? "";
  const hideZeroRows = s.hideZeroRows === true;
  const showSection  = s.showSection !== false;

  const selectedBankIds = s.bankAccountIds ?? [];
  const allBankAccounts = opts.bankAccounts ?? [];
  const displayBankAccounts = selectedBankIds.length > 0
    ? allBankAccounts.filter(a => selectedBankIds.includes(a.id))
    : allBankAccounts;

  const pageParts: string[] = [];

  for (const r of collectRows) {
    const allItems = (r.challans ?? []) as any[];
    if (allItems.length === 0) continue;

    const itemsToRender = hideZeroRows
      ? allItems.filter((c: any) => (Number(c.amount) || 0) > 0)
      : allItems;
    if (itemsToRender.length === 0) continue;

    const total          = itemsToRender.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);
    const grossTotal     = itemsToRender.reduce((s: number, c: any) => s + (Number(c.grossAmount) || Number(c.amount) || 0), 0);
    const totalDiscount  = Math.max(0, grossTotal - total);
    const totalSurcharge = Math.max(0, total - grossTotal);
    const issueDate    = (allItems[0] as any)?.issueDate ? formatDate((allItems[0] as any).issueDate) : "";
    const dueDate      = allItems[0]?.dueDate ? formatDate(allItems[0].dueDate) : "";
    const sectionName  = r.sectionId ? (sectionMap[r.sectionId] ?? r.sectionId) : "";
    const studentName  = (r.fullName ?? "").toUpperCase();
    const words        = amountInWords(total);
    const classCode    = (r.classCode ?? "").toUpperCase();

    const firstPeriod = (() => {
      const c = allItems[0] as any;
      const start = c?.periodMonthStart ?? c?.month;
      const end   = c?.periodMonthEnd;
      if (!start) return "";
      if (end && end !== start) return `${fmtMonth(start)} – ${fmtMonth(end)}`;
      return fmtMonth(start);
    })();

    const logoLeftHtml = logoUrl
      ? `<img src="${logoUrl}" class="logo-img" alt="logo" />`
      : `<div class="logo-placeholder"></div>`;
    const logoRightHtml = logoUrlRight
      ? `<img src="${logoUrlRight}" class="logo-img" alt="logo" />`
      : (logoUrl ? `<img src="${logoUrl}" class="logo-img" alt="logo" />` : `<div class="logo-placeholder"></div>`);

    const bankInfoBlock = displayBankAccounts.length > 0
      ? displayBankAccounts.map(a => `
          <div class="bank-name">${a.bankName ?? a.accountTitle}</div>
          ${address ? `<div class="bank-branch">${address}</div>` : ""}
          ${a.ibanNumber ? `<div class="bank-detail">Collection Account: ${a.ibanNumber}</div>` : ""}
          <div class="bank-detail">Account Title: ${a.accountTitle}</div>`).join(`<div class="bank-sep"></div>`)
      : `<div class="bank-name">&nbsp;</div><div class="bank-detail">&nbsp;</div>`;

    let rowNum = 0;
    const feeRows = itemsToRender.map((c: any) => {
      const gross    = Number(c.grossAmount) || Number(c.amount) || 0;
      const discount = Number(c.discountAmount) || 0;
      const net      = Number(c.amount) || 0;
      const display  = discount > 0 ? gross : net;
      if (display === 0 && hideZeroRows) return "";
      rowNum++;
      return `<tr>
        <td class="btd bc">${rowNum}.</td>
        <td class="btd bl">${c.feeTypeName ?? "—"}</td>
        <td class="btd br">${display > 0 ? display.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : ""}</td>
      </tr>`;
    }).join("");

    const makeBankCopy = (label: string) => `
      <div class="bcopy">
        <div class="blabel">${label}</div>
        <div class="bhdr">
          <div class="blogo">${logoLeftHtml}</div>
          <div class="bschool">
            ${s.institutionCode ? `<div class="bschool-code">(${s.institutionCode})</div>` : ""}
            <div class="bschool-name">${schoolName}</div>
          </div>
          <div class="blogo">${logoRightHtml}</div>
        </div>
        <div class="bbank-block">
          ${bankInfoBlock}
        </div>
        <table class="binfo-tbl">
          <tr>
            <td class="bil">Challan No</td><td class="biv">${r.applicantId ?? ""}</td>
            <td class="bil">Fee Month</td><td class="biv">${firstPeriod}</td>
            <td class="bil">Issue Date:</td><td class="biv">${issueDate}</td>
          </tr>
          <tr>
            <td class="bil">Student ID</td><td class="biv">${r.applicantId ?? ""}</td>
            <td class="bil">Semester:</td><td class="biv">${sectionName}</td>
            <td class="bil">Due Date:</td><td class="biv">${dueDate}</td>
          </tr>
        </table>
        <table class="bstud-tbl">
          <tr><td class="bsl">Course:</td><td class="bsv" colspan="3">${classCode}</td></tr>
          <tr><td class="bsl">Name of Student:</td><td class="bsv" colspan="3">${studentName}</td></tr>
          <tr><td class="bsl">Father Name:</td><td class="bsv" colspan="3">${r.fatherName ?? ""}</td></tr>
        </table>
        <table class="bfee-tbl">
          <thead>
            <tr>
              <th class="bth bc" style="width:20px">S. No</th>
              <th class="bth bl">Description</th>
              <th class="bth br" style="width:56px">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${feeRows}
          </tbody>
          <tfoot>
            ${totalDiscount > 0 ? `<tr>
              <td class="btd bc"></td>
              <td class="btd bl" style="color:#059669;font-weight:700">Fee Concession</td>
              <td class="btd br" style="color:#059669;">−${totalDiscount.toLocaleString("en-PK")}</td>
            </tr>` : ""}
            ${totalSurcharge > 0 ? `<tr>
              <td class="btd bc"></td>
              <td class="btd bl" style="color:#d97706;font-weight:700">Fee Adjustment (Surcharge)</td>
              <td class="btd br" style="color:#d97706;">+${totalSurcharge.toLocaleString("en-PK")}</td>
            </tr>` : ""}
            <tr>
              <td class="btd bc bfooter-lbl" colspan="2">Total (Amount in Number)</td>
              <td class="btd br bfooter-val">${total.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
            </tr>
            <tr>
              <td class="btd bl bfooter-lbl" colspan="2">Total (Amount in Words)</td>
              <td class="btd br bfooter-val">${words}</td>
            </tr>
            <tr>
              <td class="btd bl bfooter-lbl" colspan="2">Payable within Due Date</td>
              <td class="btd br bfooter-val"></td>
            </tr>
            <tr>
              <td class="btd bl bfooter-lbl" colspan="2">Payable After Due Date</td>
              <td class="btd br bfooter-val"></td>
            </tr>
          </tfoot>
        </table>
        <div class="bsig-area">
          <div class="bsig-row">
            <span>Depositor Name: ____________</span>
            <span style="margin-left:8px">Mobile# ______________</span>
          </div>
          <div class="bsig-row" style="margin-top:4px">CNIC Number___________________________</div>
          <div class="bsig-line">
            <span>Depositor Signature</span>
            <span>Bank Signature</span>
          </div>
        </div>
        <div class="bnote">
          <strong>Note:</strong> In case of any query / correction in fee voucher please contact college.
          Amount once paid, not refundable
        </div>
        <div class="bdisclaimer">
          <strong>${displayBankAccounts[0]?.bankName ?? "Bank"} Disclaimer</strong><br/>
          Cash/Cheque should always be deposited at the respective counter and electronic
          computer-generated receipt printed through flatbed printer on deposit slip/
          challan should be obtained before leaving the counter, please be sure to check the
          receipt and satisfy that complete details including account number and amount
          deposit are correctly printed failing which the bank will not be responsible
        </div>
        <div class="burdu" dir="rtl">
          بینک/چیک متعلقہ کاؤنٹر پر جمع کرایا جائے اور ڈپازٹ سلپ/چالان پر کمپیوٹر سے پرنٹ شدہ رسید
          حاصل کی جائے۔ رقم ادا ہونے کے بعد واپس نہیں ہوگی۔
        </div>
      </div>`;

    pageParts.push(`
      <div class="bpage">
        ${makeBankCopy("Bank Copy")}
        ${makeBankCopy("College Copy")}
        ${makeBankCopy("Student Copy")}
      </div>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Fee Challans</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 9px; }
    @page { size: A4 landscape; margin: 6mm; }
    .toolbar { text-align: center; padding: 8px 0 12px; }
    .toolbar button { padding: 6px 18px; font-size: 13px; cursor: pointer; border: none; border-radius: 4px; margin: 0 4px; }
    .btn-print { background: #1e293b; color: #fff; }
    .btn-close  { background: #e2e8f0; color: #1e293b; }

    .bpage {
      display: flex; flex-direction: row;
      width: 100%; break-after: page; page-break-after: always;
      margin-bottom: 12px;
    }
    .bpage:last-child { margin-bottom: 0; }

    .bcopy {
      flex: 1; padding: 5px 7px;
      border-right: 1.5px dashed #888;
      display: flex; flex-direction: column;
      font-size: 9px; min-width: 0;
    }
    .bcopy:last-child { border-right: none; }

    .blabel {
      text-align: center; font-weight: 700; font-size: 9px;
      border: 1px solid #333; padding: 2px 0; margin-bottom: 3px;
      background: #f0f0f0;
    }
    .bhdr { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
    .blogo { flex-shrink: 0; }
    .logo-img { width: 32px; height: 32px; object-fit: contain; }
    .logo-placeholder { width: 32px; height: 32px; border: 1px solid #999; }
    .bschool { flex: 1; text-align: center; }
    .bschool-code { font-size: 9px; color: #555; margin-bottom: 1px; }
    .bschool-name { font-weight: 900; font-size: 10.5px; text-transform: uppercase; line-height: 1.3; }

    .bbank-block {
      border: 1px solid #333; padding: 3px 5px; margin-bottom: 3px;
      background: #fafafa; font-size: 8.5px;
    }
    .bank-name { font-weight: 800; font-size: 9.5px; }
    .bank-branch { font-size: 8px; color: #444; }
    .bank-detail { font-size: 8px; color: #222; }
    .bank-sep { border-top: 1px dashed #ccc; margin: 2px 0; }

    .binfo-tbl { width: 100%; border-collapse: collapse; margin-bottom: 2px; }
    .binfo-tbl td { border: 1px solid #333; padding: 1.5px 3px; font-size: 8.5px; }
    .bil { background: #f3f4f6; font-weight: 700; white-space: nowrap; width: 1%; }
    .biv { min-width: 30px; }

    .bstud-tbl { width: 100%; border-collapse: collapse; margin-bottom: 2px; }
    .bstud-tbl td { border: 1px solid #333; padding: 2px 4px; font-size: 8.5px; }
    .bsl { background: #f3f4f6; font-weight: 700; white-space: nowrap; width: 1%; }
    .bsv { font-weight: 700; }

    .bfee-tbl { width: 100%; border-collapse: collapse; margin-bottom: 2px; }
    .bth { padding: 2px 4px; border: 1px solid #333; background: #f3f4f6; font-weight: 700; font-size: 8.5px; }
    .btd { padding: 2px 4px; border: 1px solid #333; font-size: 8.5px; }
    .bc { text-align: center; }
    .bl { text-align: left; }
    .br { text-align: right; white-space: nowrap; }
    .bfooter-lbl { font-weight: 700; font-size: 8px; }
    .bfooter-val { font-size: 8px; }

    .bsig-area { margin-top: 4px; font-size: 8.5px; }
    .bsig-row { margin-bottom: 2px; }
    .bsig-line {
      display: flex; justify-content: space-between;
      border-top: 1px solid #666; margin-top: 14px; padding-top: 2px;
      font-size: 8px; font-weight: 700;
    }

    .bnote {
      margin-top: 4px; font-size: 7.5px; color: #333;
      border-top: 1px solid #ccc; padding-top: 3px;
    }
    .bdisclaimer {
      margin-top: 3px; font-size: 7px; color: #444;
      border-top: 1px dashed #ccc; padding-top: 3px; line-height: 1.35;
    }
    .burdu {
      margin-top: 3px; font-size: 7px; color: #333; line-height: 1.4;
      border-top: 1px solid #999; padding-top: 3px;
      font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', Arial, sans-serif;
    }

    @media print {
      .toolbar { display: none !important; }
      .bpage { margin-bottom: 0; break-after: page; page-break-after: always; }
      .bpage:last-child { break-after: auto; page-break-after: auto; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">🖨 Print</button>
    <button class="btn-close"  onclick="window.close()">Close</button>
  </div>
  ${pageParts.join("\n")}
</body>
</html>`;
}

function TabPrintChallan() {
  const { toast } = useToast();
  const defaultYearId = useDefaultYear();

  const { data: yearsRaw   = [] } = useListAdminAcademicYears();
  const { data: classesRaw = [] } = useListAdminClasses();
  const { data: sectionsRaw = [] } = useListAdminSections();
  const years    = yearsRaw   as any[];
  const classes  = classesRaw as any[];
  const sections = sectionsRaw as any[];

  const [yearId,           setYearId]           = useState("");
  const [selectedClasses,  setSelectedClasses]  = useState<string[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [month,            setMonth]            = useState("");
  const [searchQ,          setSearchQ]          = useState("");
  const [selected,         setSelected]         = useState<Set<string>>(new Set());

  useEffect(() => { if (!yearId && defaultYearId) setYearId(defaultYearId); }, [defaultYearId]);

  const collectParams = {
    academicYearId: yearId || "",
    classCodes:  selectedClasses.length  > 0 ? selectedClasses.join(",")  : undefined,
    sectionIds:  selectedSections.length > 0 ? selectedSections.join(",") : undefined,
    month: month || undefined,
  };
  const { data: rows = [], isLoading } = useCollectAdminFeeChallans(
    collectParams,
    { query: { enabled: !!yearId, queryKey: getCollectAdminFeeChallansQueryKey(collectParams) } },
  );
  const collectRows = rows as CollectFeeRow[];

  const visibleRows = collectRows.filter(row => {
    if (!searchQ.trim()) return true;
    const q = searchQ.toLowerCase();
    return (
      (row.fullName ?? "").toLowerCase().includes(q) ||
      (row.applicantId ?? "").toLowerCase().includes(q) ||
      (row.fatherName ?? "").toLowerCase().includes(q) ||
      (row.guardianName ?? "").toLowerCase().includes(q) ||
      (row.guardianMobile ?? "").toLowerCase().includes(q) ||
      (row.guardianFamilyId ?? "").toLowerCase().includes(q)
    );
  });

  // Reset selection when the filter changes (not on collectRows — that's a new [] ref each render while loading)
  const filterKey = `${yearId}|${selectedClasses.join(",")}|${selectedSections.join(",")}|${month}`;
  useEffect(() => { setSelected(new Set()); }, [filterKey]);

  const sectionMap = Object.fromEntries(sections.map((s: any) => [s.id, s.name ?? s.code ?? ""])) as Record<string, string>;

  function toggleClass(code: string)   { setSelectedClasses(p => p.includes(code) ? p.filter(x => x !== code) : [...p, code]); }
  function toggleSection(id: string)   { setSelectedSections(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); }

  async function printRows(toPrint: CollectFeeRow[]) {
    const withChallans = toPrint.filter(r => (r.challans as any[])?.length > 0);
    if (!withChallans.length) { toast({ title: "No challans to print", description: "Generate challans first from the Generate Challan tab.", variant: "destructive" }); return; }
    // Open the (process-isolated) print window synchronously, before any await,
    // so it survives popup blockers; content is delivered to it once ready.
    const printWin = openPrintWindow({
      features: "width=1100,height=750",
      onPopupBlocked: () => toast({ title: "Popup blocked", description: "Allow popups for this site and try again.", variant: "destructive" }),
    });
    const defaultLogoUrl = window.location.origin + import.meta.env.BASE_URL + "logo.png";

    const token = localStorage.getItem("ccm_admin_token") ?? "";
    const tenantId = localStorage.getItem("ccm_admin_website_tenant") ?? "";
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (tenantId) headers["X-Tenant-Id"] = tenantId;

    const [settingsRes, bankRes, printSettingsRes] = await Promise.allSettled([
      fetch("/api/admin/settings/challan", { headers }).then(r => r.ok ? r.json() : null),
      fetch("/api/admin/bank-accounts",    { headers }).then(r => r.ok ? r.json() : []),
      fetch("/api/admin/print-settings",   { headers }).then(r => r.ok ? r.json() : null),
    ]);
    const settings      = settingsRes.status      === "fulfilled" ? settingsRes.value      : null;
    const bankAccounts  = bankRes.status          === "fulfilled" ? (bankRes.value ?? [])  : [];
    const printSettings = printSettingsRes.status === "fulfilled" ? printSettingsRes.value : null;
    const instituteName: string = printSettings?.instituteName ?? "";

    const logoUrl = settings?.logoUrl
      ? (settings.logoUrl.startsWith("http") ? settings.logoUrl : window.location.origin + settings.logoUrl)
      : defaultLogoUrl;
    const logoUrlRight = settings?.logoUrlRight
      ? (settings.logoUrlRight.startsWith("http") ? settings.logoUrlRight : window.location.origin + settings.logoUrlRight)
      : undefined;

    const html = settings?.activeTemplate === "bank-challan"
      ? buildBankChallanHtml(withChallans, instituteName || undefined, { sectionMap, logoUrl, logoUrlRight, settings, bankAccounts })
      : buildChallanHtml(withChallans, instituteName || undefined, { sectionMap, logoUrl, settings, bankAccounts });
    printWin.print(html);
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === visibleRows.length) setSelected(new Set());
    else setSelected(new Set(visibleRows.map(r => r.studentId)));
  }

  const generatedRows = visibleRows.filter(r => (r.challans as any[])?.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter card */}
      <div className="rounded-2xl border border-border bg-white shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Academic Year <span className="text-red-500">*</span></Label>
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Year…" /></SelectTrigger>
              <SelectContent>{years.map((y: any) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Month <span className="text-slate-400 font-normal">(leave blank for all)</span></Label>
            <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-9" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600">
            Classes <span className="text-slate-400 font-normal">(leave blank for all)</span>
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {classes.map((c: any) => (
              <button key={c.code} onClick={() => toggleClass(c.code)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
                  selectedClasses.includes(c.code)
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-300 hover:border-slate-500",
                )}>
                {c.name}
              </button>
            ))}
            {selectedClasses.length > 0 && (
              <button onClick={() => setSelectedClasses([])}
                className="px-2.5 py-1 rounded-full text-xs font-semibold text-slate-400 hover:text-slate-600 border border-dashed border-slate-300">
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600">
            Sections <span className="text-slate-400 font-normal">(leave blank for all)</span>
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {sections.map((s: any) => (
              <button key={s.id} onClick={() => toggleSection(s.id)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
                  selectedSections.includes(s.id)
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-300 hover:border-slate-500",
                )}>
                {s.name}
              </button>
            ))}
            {selectedSections.length > 0 && (
              <button onClick={() => setSelectedSections([])}
                className="px-2.5 py-1 rounded-full text-xs font-semibold text-slate-400 hover:text-slate-600 border border-dashed border-slate-300">
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Search name, Applicant ID, father, guardian, phone, family ID…"
            className="pl-8 h-9 text-sm" />
        </div>
      </div>

      {/* Actions bar */}
      {yearId && !isLoading && visibleRows.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-white px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <Checkbox
              checked={selected.size === visibleRows.length && visibleRows.length > 0}
              onCheckedChange={toggleAll}
            />
            <span>
              {selected.size > 0
                ? `${selected.size} selected`
                : `${generatedRows.length} challan${generatedRows.length !== 1 ? "s" : ""} ready to print`}
            </span>
          </div>
          <div className="flex gap-2">
            {selected.size > 0 && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5"
                onClick={() => printRows(visibleRows.filter(r => selected.has(r.studentId)))}>
                <Printer className="h-3.5 w-3.5" />
                Print Selected ({selected.size})
              </Button>
            )}
            <Button size="sm" className="h-8 gap-1.5 bg-slate-900 hover:bg-slate-700"
              onClick={() => printRows(generatedRows)}
              disabled={generatedRows.length === 0}>
              <Printer className="h-3.5 w-3.5" />
              Print All ({generatedRows.length})
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {!yearId ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
          <Printer className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">Select an academic year to load students</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : visibleRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
          <Users className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">
            {collectRows.length === 0 ? "No students found for the selected filters." : "No rows match the current search."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    checked={selected.size === visibleRows.length && visibleRows.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700 text-xs uppercase tracking-wide">Student</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700 text-xs uppercase tracking-wide hidden sm:table-cell">Challan #</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700 text-xs uppercase tracking-wide">Amount</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700 text-xs uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700 text-xs uppercase tracking-wide">Print</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRows.map(r => {
                const hasChallan = (r.challans as any[])?.length > 0;
                return (
                  <tr key={r.studentId} className={cn("transition-colors", selected.has(r.studentId) ? "bg-blue-50" : "hover:bg-slate-50")}>
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selected.has(r.studentId)}
                        onCheckedChange={() => toggleSelect(r.studentId)}
                        disabled={!hasChallan}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{r.fullName}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{r.applicantId} · {r.classCode?.toUpperCase()}</p>
                      {r.fatherName && <p className="text-[11px] text-slate-400">{r.fatherName}</p>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {r.challanNumbers?.length
                        ? r.challanNumbers.map((n: string) => (
                            <span key={n} className="inline-block bg-slate-100 text-slate-600 text-[11px] font-mono px-1.5 py-0.5 rounded mr-1">{n}</span>
                          ))
                        : <span className="text-slate-400 text-xs italic">Not generated</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      {hasChallan ? formatCurrency(r.totalAmount) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full", STATUS_META[r.status]?.classes)}>
                        {STATUS_META[r.status]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        size="sm" variant="outline"
                        className="h-7 px-2 gap-1 text-xs"
                        disabled={!hasChallan}
                        onClick={() => printRows([r])}>
                        <Printer className="h-3 w-3" />Print
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function FeeMaster() {
  const search  = useSearch();
  const [, nav] = useLocation();
  const tab = (new URLSearchParams(search).get("tab") ?? "fee-types") as TabKey;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Fee Master</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Define fee heads, set schedules, generate & collect challans</p>
      </div>

      <div className="flex gap-0.5 border-b border-border overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => nav(`/fee-master?tab=${t.key}`, { replace: true })}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap -mb-px",
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700",
            )}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <FeeGridDirtyProvider>
        <div>
          {tab === "fee-types"        && <TabFeeTypes />}
          {tab === "fee-schedule"     && <TabFeeSchedule />}
          {tab === "student-wise"     && <TabStudentWise />}
          {tab === "generate-challan" && <TabGenerateChallan />}
          {tab === "print-challan"    && <TabPrintChallan />}
          {tab === "collect"          && <TabCollectFee />}
          {tab === "bulk-collection"  && <BulkFeeCollection />}
        </div>
      </FeeGridDirtyProvider>
    </div>
  );
}
