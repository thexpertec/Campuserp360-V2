import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListAdminAcademicYears } from "@workspace/api-client-react";
import { format, parseISO, isValid } from "date-fns";
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { getToken } from "@/lib/auth";
import { fetchPrintSettings, buildPrintHtml, escapeHtml, printHtmlDocument } from "@/lib/print-utils";
import {
  Plus, X, Printer, RefreshCw, Save, LayoutGrid, Shuffle,
  Calendar as CalendarIcon, GripVertical,
} from "lucide-react";
import { ClassRecord, AcademicYear, SessionSelect } from "./ExamSelectors";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExamType { id: string; name: string; }
interface Subject  { id: string; code: string; name: string; maxMarks?: number; passMarks?: number; }

interface SubjectCard {
  subjectCode: string;
  subjectName: string;
  totalMarks:  number;
  passMarks:   number;
  venue:       string | null;
}

interface DateColumn { _key: string; date: string; }

/** classCode -> one cell per column (card or empty) */
type GridState = Record<string, (SubjectCard | null)[]>;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

function newCol(date = ""): DateColumn {
  return { _key: crypto.randomUUID(), date };
}

function parseDay(date: string) {
  if (!date) return undefined;
  const d = parseISO(date);
  return isValid(d) ? d : undefined;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Column date header ────────────────────────────────────────────────────────

function ColumnHeader({
  col, onDateChange, onRemove, removable,
}: {
  col: DateColumn;
  onDateChange: (v: string) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const day = parseDay(col.date);
  return (
    <div className="flex flex-col items-stretch gap-0.5 min-w-32">
      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-7 flex-1 justify-start text-xs font-semibold gap-1.5 px-2",
                !day && "text-muted-foreground font-normal",
              )}
            >
              <CalendarIcon className="h-3 w-3 shrink-0 opacity-60" />
              {day ? format(day, "MMM-dd") : "Pick date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-auto" align="start">
            <Calendar
              mode="single"
              selected={day}
              onSelect={(d) => { if (d) { onDateChange(format(d, "yyyy-MM-dd")); setOpen(false); } }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={onRemove}
          disabled={!removable}
          title={removable ? "Remove this day" : "Move the subjects out of this column first"}
          className={cn(
            "rounded p-0.5 text-muted-foreground hover:text-red-500 hover:bg-red-50",
            !removable && "opacity-30 cursor-not-allowed hover:text-muted-foreground hover:bg-transparent",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <span className={cn("text-[11px] font-medium text-center", day ? "text-violet-600" : "text-muted-foreground/60")}>
        {day ? format(day, "EEEE") : "no date"}
      </span>
    </div>
  );
}

// ── Draggable subject card ────────────────────────────────────────────────────

function DraggableCard({
  id, card, classCode, col, dateless,
}: {
  id: string;
  card: SubjectCard;
  classCode: string;
  col: number;
  dateless: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { classCode, col },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "flex items-center gap-1 rounded-md border bg-card px-1.5 py-1 text-xs shadow-sm cursor-grab active:cursor-grabbing select-none touch-none",
        isDragging && "opacity-70 z-50 relative shadow-md ring-2 ring-violet-300",
        dateless ? "border-amber-400 bg-amber-50" : "border-border",
      )}
      title={dateless ? `${card.subjectName} — place in a column with a date before saving` : card.subjectName}
    >
      <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/50" />
      <span className="truncate font-medium">{card.subjectName || card.subjectCode}</span>
    </div>
  );
}

// ── Droppable grid cell ───────────────────────────────────────────────────────

function GridCell({
  classCode, col, card, dateless,
}: {
  classCode: string;
  col: number;
  card: SubjectCard | null;
  dateless: boolean;
}) {
  const id = `cell:${classCode}:${col}`;
  const { setNodeRef, isOver, active } = useDroppable({ id, data: { classCode, col } });
  const sameRow = (active?.data.current as any)?.classCode === classCode;
  return (
    <td className="px-1 py-1 align-middle border-l border-border/50">
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-8 min-w-32 rounded-md flex items-stretch justify-stretch transition-colors",
          !card && "border border-dashed border-border/60",
          isOver && sameRow && "bg-violet-50 border-violet-400",
          isOver && !sameRow && "bg-red-50/60",
        )}
      >
        {card
          ? <DraggableCard id={id} card={card} classCode={classCode} col={col} dateless={dateless} />
          : <span className="flex-1" />}
      </div>
    </td>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ExamsMasterDateSheetTab() {
  const qc = useQueryClient();

  // ── Selector state
  const [examTypeId, setExamTypeId] = useState<string>("__none__");
  const [session, setSession]       = useState<string>("");
  const [academicYearId, setAcademicYearId] = useState<string | null>(null);

  // ── Grid state
  const [columns, setColumns] = useState<DateColumn[]>([]);
  const [grid, setGrid]       = useState<GridState>({});

  // ── UI state
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // ── Data fetching
  const { data: typesRaw = [] } = useQuery<ExamType[]>({
    queryKey: ["exam-types"],
    queryFn: () => apiFetch("/api/admin/exams/types"),
    staleTime: 60_000,
  });
  const types: ExamType[] = typesRaw;

  const { data: classesRaw = [], isLoading: classesLoading } = useQuery<ClassRecord[]>({
    queryKey: ["classes-list"],
    queryFn: () => apiFetch("/api/admin/classes"),
    staleTime: 60_000,
  });
  const classes: ClassRecord[] = classesRaw;

  const { data: yearsRaw } = useListAdminAcademicYears();
  const academicYears: AcademicYear[] = Array.isArray(yearsRaw) ? (yearsRaw as AcademicYear[]) : [];

  // Pre-fill active session on mount
  const preFilled = useRef(false);
  useEffect(() => {
    if (preFilled.current || academicYears.length === 0) return;
    const active = academicYears.find(y => y.active);
    if (active) { setSession(active.name); setAcademicYearId(active.id); }
    preFilled.current = true;
  }, [academicYears]);

  // ── Build the grid: all classes × their subjects, dates from saved datesheets
  const buildVersion = useRef(0);
  const buildGrid = useCallback(async () => {
    if (classes.length === 0 || !session) return;
    const version = ++buildVersion.current;
    setLoading(true);
    try {
      const perClass = await Promise.all(classes.map(async c => {
        const subjParams = new URLSearchParams({ classCode: c.code });
        const schedParams = new URLSearchParams({ classCode: c.code, sessionLabel: session });
        if (examTypeId !== "__none__") schedParams.set("examTypeId", examTypeId);
        const [subjects, schedulesRaw] = await Promise.all([
          apiFetch<Subject[]>(`/api/admin/subjects?${subjParams}`).catch(() => [] as Subject[]),
          apiFetch<any[]>(`/api/admin/exams/schedules?${schedParams}`).catch(() => [] as any[]),
        ]);
        // "None" exam type saves to the null-type scope, so only load
        // null-type schedules (the API returns all types when the filter is omitted).
        const schedules = examTypeId === "__none__"
          ? schedulesRaw.filter(s => s.examTypeId == null)
          : schedulesRaw;
        return { classCode: c.code, subjects, schedules };
      }));

      // A newer load started while this one was in flight — discard this result.
      if (version !== buildVersion.current) return;

      // Distinct saved dates (sorted) become the initial columns
      const dateSet = new Set<string>();
      for (const pc of perClass) {
        for (const s of pc.schedules) {
          const d = (s.examDate ?? "").slice(0, 10);
          if (d) dateSet.add(d);
        }
      }
      const dates = [...dateSet].sort();
      const maxSubjects = Math.max(0, ...perClass.map(pc => pc.subjects.length));
      const colCount = Math.max(dates.length, maxSubjects);
      const cols: DateColumn[] = [];
      for (let i = 0; i < colCount; i++) cols.push(newCol(dates[i] ?? ""));
      cols.push(newCol("")); // spare column for rearranging
      const dateToCol = new Map(cols.map((c, i) => [c.date, i] as const).filter(([d]) => d));

      const nextGrid: GridState = {};
      for (const pc of perClass) {
        const row: (SubjectCard | null)[] = Array(cols.length).fill(null);
        const placed = new Set<string>();

        // 1. Place saved schedule entries at their date column
        for (const s of pc.schedules) {
          if (!s.subjectCode || placed.has(s.subjectCode)) continue;
          const card: SubjectCard = {
            subjectCode: s.subjectCode,
            subjectName: s.subjectName ?? s.subjectCode,
            totalMarks:  s.totalMarks ?? 100,
            passMarks:   s.passMarks ?? 33,
            venue:       s.venue ?? null,
          };
          const d = (s.examDate ?? "").slice(0, 10);
          let idx = d ? dateToCol.get(d) : undefined;
          if (idx === undefined || row[idx]) idx = row.findIndex(c => c === null);
          if (idx !== undefined && idx >= 0) { row[idx] = card; placed.add(s.subjectCode); }
        }

        // 2. Fill in the class's remaining subjects
        const rest = [...pc.subjects].sort((a, b) => a.name.localeCompare(b.name));
        for (const sub of rest) {
          if (placed.has(sub.code)) continue;
          const idx = row.findIndex(c => c === null);
          if (idx < 0) break;
          row[idx] = {
            subjectCode: sub.code,
            subjectName: sub.name,
            totalMarks:  sub.maxMarks ?? 100,
            passMarks:   sub.passMarks ?? 33,
            venue:       null,
          };
          placed.add(sub.code);
        }
        nextGrid[pc.classCode] = row;
      }

      setColumns(cols);
      setGrid(nextGrid);
    } catch (e: any) {
      if (version === buildVersion.current) {
        toast({ variant: "destructive", title: "Failed to load grid", description: e.message });
      }
    } finally {
      if (version === buildVersion.current) setLoading(false);
    }
  }, [classes, session, examTypeId]);

  // Rebuild only when the actual selection changes (not on background refetches
  // that produce a new array identity for the same classes).
  const classesKey = classes.map(c => c.code).join(",");
  const buildGridRef = useRef(buildGrid);
  buildGridRef.current = buildGrid;
  useEffect(() => {
    void buildGridRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classesKey, session, examTypeId]);

  // Always keep one fully-empty spare column at the end
  useEffect(() => {
    if (columns.length === 0) return;
    const lastIdx = columns.length - 1;
    const lastUsed = Object.values(grid).some(row => row[lastIdx]);
    if (lastUsed || columns[lastIdx].date) {
      setColumns(cs => [...cs, newCol("")]);
      setGrid(g => Object.fromEntries(Object.entries(g).map(([k, row]) => [k, [...row, null]])));
    }
  }, [grid, columns]);

  // ── Column ops
  function setColumnDate(idx: number, date: string) {
    setColumns(cs => cs.map((c, i) => i === idx ? { ...c, date } : c));
  }
  function addColumn() {
    setColumns(cs => [...cs, newCol("")]);
    setGrid(g => Object.fromEntries(Object.entries(g).map(([k, row]) => [k, [...row, null]])));
  }
  function removeColumn(idx: number) {
    setColumns(cs => cs.filter((_, i) => i !== idx));
    setGrid(g => Object.fromEntries(Object.entries(g).map(([k, row]) => [k, row.filter((_, i) => i !== idx)])));
  }
  const columnEmpty = (idx: number) => !Object.values(grid).some(row => row[idx]);

  // ── Drag & drop: swap cells within the same class row
  function handleDragEnd(e: DragEndEvent) {
    const from = e.active.data.current as { classCode: string; col: number } | undefined;
    const to   = e.over?.data.current as { classCode: string; col: number } | undefined;
    if (!from || !to) return;
    if (from.classCode !== to.classCode) {
      toast({ variant: "destructive", title: "Subjects can only move within their own class row." });
      return;
    }
    if (from.col === to.col) return;
    setGrid(g => {
      const row = [...(g[from.classCode] ?? [])];
      [row[from.col], row[to.col]] = [row[to.col], row[from.col]];
      return { ...g, [from.classCode]: row };
    });
  }

  // ── Shuffle: random permutation of each class's subjects across its occupied cells
  function handleShuffle() {
    setGrid(g => {
      const next: GridState = {};
      for (const [cc, row] of Object.entries(g)) {
        const idxs = row.map((c, i) => (c ? i : -1)).filter(i => i >= 0);
        const cards = shuffleInPlace(idxs.map(i => row[i]!));
        const newRow = [...row];
        idxs.forEach((colIdx, k) => { newRow[colIdx] = cards[k]; });
        next[cc] = newRow;
      }
      return next;
    });
  }

  // ── Validation
  const placedCount   = Object.values(grid).reduce((n, row) => n + row.filter(Boolean).length, 0);
  const datelessCount = Object.values(grid).reduce(
    (n, row) => n + row.filter((c, i) => c && !columns[i]?.date).length, 0,
  );

  // ── Save the whole grid (one request per class — rows differ per class)
  async function handleSave() {
    if (!session)         { toast({ variant: "destructive", title: "Select a session." }); return; }
    if (placedCount === 0){ toast({ variant: "destructive", title: "Nothing to save." });  return; }
    if (datelessCount > 0){
      toast({
        variant: "destructive",
        title: "Every subject needs a date",
        description: `${datelessCount} subject${datelessCount !== 1 ? "s are" : " is"} in a column without a date (highlighted in amber). Pick a date or move them.`,
      });
      return;
    }

    setSaving(true);
    try {
      const payloads = classes
        .map(c => {
          const row = grid[c.code] ?? [];
          const rows = row
            .map((card, i) => card && columns[i]?.date
              ? {
                  subjectCode: card.subjectCode,
                  subjectName: card.subjectName || null,
                  examDate:    columns[i].date,
                  totalMarks:  card.totalMarks,
                  passMarks:   card.passMarks,
                  venue:       card.venue,
                }
              : null)
            .filter((r): r is NonNullable<typeof r> => r !== null);
          return { classCode: c.code, rows };
        })
        .filter(p => p.rows.length > 0);

      const results = await Promise.all(payloads.map(p =>
        apiFetch<{ created: number; updated: number; skipped: number }>(
          "/api/admin/exams/schedules/bulk-master",
          {
            method: "POST",
            body: JSON.stringify({
              examTypeId:   examTypeId === "__none__" ? null : examTypeId,
              sessionLabel: session,
              academicYearId,
              classCodes:   [p.classCode],
              rows:         p.rows,
            }),
          },
        ),
      ));

      const created = results.reduce((n, r) => n + r.created, 0);
      const updated = results.reduce((n, r) => n + r.updated, 0);
      const skipped = results.reduce((n, r) => n + r.skipped, 0);
      toast({
        title: "Datesheet saved",
        description: `${created + updated} entries across ${payloads.length} class${payloads.length !== 1 ? "es" : ""} (${created} new, ${updated} updated${skipped ? `, ${skipped} skipped` : ""}).`,
      });
      qc.invalidateQueries({ queryKey: ["exam-schedules"] });
      qc.invalidateQueries({ queryKey: ["exam-schedules-datesheet"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    } finally {
      setSaving(false);
    }
  }

  // ── Print: classes × dates grid, matching the on-screen layout
  async function handlePrint() {
    const usedCols = columns
      .map((c, i) => ({ ...c, i }))
      .filter(c => c.date && Object.values(grid).some(row => row[c.i]));
    if (usedCols.length === 0) { toast({ variant: "destructive", title: "Nothing to print — assign dates first." }); return; }

    const typeLabel = types.find(t => t.id === examTypeId)?.name ?? "";
    const subtitle = [typeLabel, session].filter(Boolean).join("  ·  ");

    const th = (txt: string) =>
      `<th style="background:#f1f5f9;font-weight:700;text-align:left;padding:6px 8px;border:1px solid #cbd5e1;font-size:10px">${txt}</th>`;

    const tableHtml = `
<p style="font-size:12px;color:#555;margin-bottom:8px">${escapeHtml(subtitle)}</p>
<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px">
  <thead>
    <tr>${th("")}${usedCols.map(c => th(escapeHtml(format(parseDay(c.date)!, "MMM-dd")))).join("")}</tr>
    <tr>${th("Class")}${usedCols.map(c => th(escapeHtml(format(parseDay(c.date)!, "EEEE")))).join("")}</tr>
  </thead>
  <tbody>
    ${classes.map((cls, ri) => {
      const row = grid[cls.code] ?? [];
      if (!row.some(Boolean)) return "";
      return `<tr style="${ri % 2 === 1 ? "background:#f8fafc" : ""}">
        <td style="padding:5px 8px;border:1px solid #e2e8f0;font-weight:700;white-space:nowrap">${escapeHtml(cls.name)}</td>
        ${usedCols.map(c => {
          const card = row[c.i];
          return `<td style="padding:5px 8px;border:1px solid #e2e8f0">${card ? escapeHtml(card.subjectName || card.subjectCode) : "—"}</td>`;
        }).join("")}
      </tr>`;
    }).join("")}
  </tbody>
</table>`;

    const settings = await fetchPrintSettings();
    const html = buildPrintHtml(tableHtml, { ...settings, orientation: "landscape" }, "Master Datesheet");
    printHtmlDocument(html);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header controls ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-semibold text-foreground">Datesheet Parameters</span>
          <span className="ml-auto text-xs text-muted-foreground">
            All classes on one grid — drag subjects to rearrange
          </span>
        </div>

        <div className="px-5 py-4 flex flex-wrap items-end gap-x-6 gap-y-4">
          {/* Exam Type */}
          <div className="flex-1 min-w-44 max-w-56">
            <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Exam Type</Label>
            <Select value={examTypeId} onValueChange={setExamTypeId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Any type…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Session */}
          <div className="flex-1 min-w-44 max-w-56">
            <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Session *</Label>
            <SessionSelect
              value={session}
              onChange={v => {
                setSession(v);
                const yr = academicYears.find(y => y.name === v);
                setAcademicYearId(yr?.id ?? null);
              }}
              academicYears={academicYears}
              className="h-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void buildGrid()} disabled={loading || !session}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Reload
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleShuffle} disabled={loading || placedCount === 0}>
              <Shuffle className="h-3.5 w-3.5" /> Shuffle
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={addColumn} disabled={loading || columns.length === 0}>
              <Plus className="h-3.5 w-3.5" /> Add Day
            </Button>
          </div>
        </div>
      </div>

      {/* ── Grid ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Exam Schedule Grid</span>
            {loading && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" /> Loading…
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {classes.length} class{classes.length !== 1 ? "es" : ""} · {placedCount} subject{placedCount !== 1 ? "s" : ""}
          </span>
        </div>

        {classes.length > 0 && columns.length > 0 ? (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground sticky left-0 bg-muted/20 backdrop-blur z-10 min-w-28">
                      Class
                    </th>
                    {columns.map((col, i) => (
                      <th key={col._key} className="px-1.5 py-2 border-l border-border/50 align-top">
                        <ColumnHeader
                          col={col}
                          onDateChange={v => setColumnDate(i, v)}
                          onRemove={() => removeColumn(i)}
                          removable={columnEmpty(i)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {classes.map((cls, idx) => {
                    const row = grid[cls.code] ?? [];
                    return (
                      <tr key={cls.code} className={cn(idx % 2 === 1 ? "bg-muted/10" : "")}>
                        <td className="px-3 py-1.5 sticky left-0 bg-card z-10 whitespace-nowrap">
                          <span className="text-xs font-bold text-foreground">{cls.name}</span>
                          <span className="ml-1.5 text-[10px] text-muted-foreground">{cls.code}</span>
                        </td>
                        {columns.map((col, i) => (
                          <GridCell
                            key={col._key}
                            classCode={cls.code}
                            col={i}
                            card={row[i] ?? null}
                            dateless={!!row[i] && !col.date}
                          />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DndContext>
        ) : (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {classesLoading || loading
              ? "Loading…"
              : !session
                ? "Select a session to build the grid."
                : "No classes configured yet."}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border bg-muted/10 flex items-center gap-3 text-xs text-muted-foreground">
          <span>Drag a subject onto another cell in the same row to swap. The last empty column is spare space.</span>
          <span className="flex-1" />
          {datelessCount > 0 && (
            <span className="text-amber-600 font-medium">
              {datelessCount} subject{datelessCount !== 1 ? "s" : ""} in a column without a date
            </span>
          )}
        </div>
      </div>

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint} disabled={placedCount === 0}>
          <Printer className="h-3.5 w-3.5" /> Print
        </Button>
        <Button
          size="sm"
          className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          onClick={handleSave}
          disabled={saving || loading || !session || placedCount === 0 || datelessCount > 0}
        >
          {saving
            ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving…</>
            : <><Save className="h-3.5 w-3.5" /> Save Datesheet</>}
        </Button>
      </div>
    </div>
  );
}
