import { useState, useEffect, useRef, createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListAdminAcademicYears, useListAdminClasses } from "@workspace/api-client-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { useDefaultYear } from "@/hooks/use-default-year";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Save, RotateCcw, Lock, AlertCircle,
  ChevronLeft, ChevronRight, Info, Users, Maximize2, Minimize2,
} from "lucide-react";

// ─── Cross-tab dirty-state context ────────────────────────────────────────────
// FeeMaster wraps the tab content with FeeGridDirtyProvider so that
// TabGenerateChallan can warn about unsaved student fee overrides.

export const FeeGridDirtyCtx = createContext<{
  dirtyCount: number;
  setDirtyCount: (n: number) => void;
}>({ dirtyCount: 0, setDirtyCount: () => {} });

export function FeeGridDirtyProvider({ children }: { children: React.ReactNode }) {
  const [dirtyCount, setDirtyCount] = useState(0);
  return (
    <FeeGridDirtyCtx.Provider value={{ dirtyCount, setDirtyCount }}>
      {children}
    </FeeGridDirtyCtx.Provider>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeeType {
  id: string; name: string; feeCode: string; sortOrder: number;
}
interface StudentRow {
  id: string;
  fullName: string;
  applicantId: string;
  classCode: string;
  className: string | null;
  fatherName: string | null;
  guardianName: string | null;
  classAmounts: Record<string, number>;
  overrides: Record<string, number>;
  lockedFeeTypeIds: string[];
}
interface GridData {
  feeTypes: FeeType[];
  students: StudentRow[];
  total: number; page: number; pageSize: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const r = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error ?? `HTTP ${r.status}`); }
  return r.json();
}

function fmt(n: number | undefined) {
  return n !== undefined ? n.toLocaleString() : "";
}

const PAGE_SIZE = 40;

// ─── Main component ───────────────────────────────────────────────────────────

export function TabStudentWise() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Filters
  const [yearId,         setYearId]         = useState("");
  const [q,              setQ]              = useState("");
  const [guardianSearch, setGuardianSearch] = useState("");
  const [classFilter,    setClassFilter]    = useState("__all__");
  const [page,           setPage]           = useState(1);

  const debouncedQ        = useDebounce(q,              300);
  const debouncedGuardian = useDebounce(guardianSearch, 300);

  // ── Local edits: { studentId: { feeTypeId: string } }
  const [local,      setLocal]      = useState<Record<string, Record<string, string>>>({});
  const [saving,     setSaving]     = useState(false);
  const [activeCell, setActiveCell] = useState<[number, number] | null>(null);
  const cellRefs    = useRef<(HTMLInputElement | null)[][]>([]);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // ── Reference data
  const { data: yearsRaw  = [] } = useListAdminAcademicYears();
  const { data: classesRaw = [] } = useListAdminClasses();
  const years   = yearsRaw   as any[];
  const classes = (classesRaw as any[]).filter(c => c.active);

  const defaultYearId = useDefaultYear();
  useEffect(() => { if (defaultYearId && !yearId) setYearId(defaultYearId); }, [defaultYearId, yearId]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [debouncedQ, debouncedGuardian, classFilter, yearId]);

  // ── Grid query
  const qParams = new URLSearchParams({
    academicYearId: yearId,
    page:     String(page),
    pageSize: String(PAGE_SIZE),
  });
  if (debouncedQ)                                     qParams.set("q",        debouncedQ);
  if (classFilter && classFilter !== "__all__")        qParams.set("classCode", classFilter);
  if (debouncedGuardian)                              qParams.set("guardian",  debouncedGuardian);

  const { data: grid, isFetching, isLoading } = useQuery<GridData>({
    queryKey: ["student-fee-grid", yearId, debouncedQ, debouncedGuardian, classFilter, page],
    queryFn:  () => apiFetch<GridData>(`/api/admin/student-fee-grid?${qParams}`),
    enabled:  !!yearId,
    staleTime: 30_000,
  });

  const feeTypes   = grid?.feeTypes  ?? [];
  const students   = grid?.students  ?? [];
  const total      = grid?.total     ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Clear local edits when grid reloads (page/filter change)
  const prevKey    = useRef("");
  const currentKey = `${yearId}-${debouncedQ}-${debouncedGuardian}-${classFilter}-${page}`;
  useEffect(() => {
    if (prevKey.current && prevKey.current !== currentKey) setLocal({});
    prevKey.current = currentKey;
  }, [currentKey]);

  // ── Dirty count
  const dirtyCount    = Object.values(local).reduce((s, m) => s + Object.keys(m).length, 0);
  const overrideCount = students.reduce((s, st) => s + Object.keys(st.overrides).length, 0);

  // Publish dirty count to the cross-tab context so TabGenerateChallan can warn.
  // Intentionally NOT cleared on unmount: if the user switches to Generate Challan
  // while overrides are still unsaved, the banner must remain visible. The count
  // naturally reaches 0 when the user saves or discards (setLocal({}) → dirtyCount → 0).
  const { setDirtyCount: setCtxDirtyCount } = useContext(FeeGridDirtyCtx);
  useEffect(() => { setCtxDirtyCount(dirtyCount); }, [dirtyCount, setCtxDirtyCount]);

  // ── Active filter count (for "Clear filters" badge)
  const activeFilters = [
    debouncedQ        ? 1 : 0,
    debouncedGuardian ? 1 : 0,
    classFilter !== "__all__" ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // ── Cell helpers
  function getCellValue(st: StudentRow, ftId: string): string {
    if (local[st.id]?.[ftId] !== undefined)    return local[st.id][ftId];
    if (st.overrides[ftId] !== undefined)       return String(st.overrides[ftId]);
    if (st.classAmounts[ftId] !== undefined)    return String(st.classAmounts[ftId]);
    return "";
  }
  function getCellPlaceholder(st: StudentRow, ftId: string): string {
    return st.classAmounts[ftId] !== undefined ? String(st.classAmounts[ftId]) : "—";
  }
  function isLocked(st: StudentRow, ftId: string): boolean {
    return st.lockedFeeTypeIds.includes(ftId);
  }
  function isLocalDirty(st: StudentRow, ftId: string): boolean {
    return local[st.id]?.[ftId] !== undefined;
  }
  function hasSavedOverride(st: StudentRow, ftId: string): boolean {
    return st.overrides[ftId] !== undefined;
  }
  function setCell(studentId: string, ftId: string, value: string) {
    setLocal(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], [ftId]: value },
    }));
  }
  function resetStudentRow(st: StudentRow) {
    setLocal(prev => {
      const next = { ...prev };
      next[st.id] = {};
      feeTypes.forEach(ft => {
        if (!isLocked(st, ft.id) && hasSavedOverride(st, ft.id)) {
          next[st.id][ft.id] = "";
        }
      });
      if (!Object.keys(next[st.id]).length) delete next[st.id];
      return next;
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, ri: number, ci: number) {
    const rows = students.length;
    const cols = feeTypes.length;
    const moveTo = (r: number, c: number) => {
      const nr = Math.max(0, Math.min(rows - 1, r));
      const nc = Math.max(0, Math.min(cols - 1, c));
      cellRefs.current[nr]?.[nc]?.focus();
      setActiveCell([nr, nc]);
    };
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

  // ── Save
  async function handleSave() {
    if (!yearId || !dirtyCount) return;
    const entries: { studentId: string; feeTypeId: string; amount: number | null }[] = [];
    for (const [studentId, ftMap] of Object.entries(local)) {
      for (const [feeTypeId, amtStr] of Object.entries(ftMap)) {
        entries.push({
          studentId, feeTypeId,
          amount: amtStr === "" ? null : (Number(amtStr) || null),
        });
      }
    }
    setSaving(true);
    try {
      const result = await apiFetch<{ ok: boolean; saved: number; deleted: number }>(
        "/api/admin/student-fee-grid/save",
        { method: "POST", body: JSON.stringify({ academicYearId: yearId, entries }) },
      );
      setLocal({});
      qc.invalidateQueries({ queryKey: ["student-fee-grid"] });
      toast({
        title: `Saved — ${result.saved} override${result.saved !== 1 ? "s" : ""} set, ${result.deleted} reset to class default`,
      });
    } catch (e: any) {
      toast({ title: e.message ?? "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={cn(
      fullscreen
        ? "fixed inset-0 z-50 bg-white flex flex-col overflow-hidden"
        : "flex flex-col gap-4",
    )}>

      {/* ── Controls row ─────────────────────────────────────────────────── */}
      <div className={cn(
        "border border-border bg-slate-50/60 space-y-3",
        fullscreen
          ? "shrink-0 rounded-none border-x-0 border-t-0 px-4 py-2.5"
          : "rounded-xl px-4 py-3.5",
      )}>

        {/* Row 1: year + save */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Academic Year</Label>
            <Select value={yearId} onValueChange={v => { setYearId(v); setLocal({}); }}>
              <SelectTrigger className="w-36 h-8 text-xs bg-white"><SelectValue placeholder="Year…" /></SelectTrigger>
              <SelectContent>{years.map((y: any) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="flex-1" />

          {dirtyCount > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setLocal({})}
              className="h-8 text-xs text-slate-500 gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Discard
            </Button>
          )}
          <Button size="sm" onClick={handleSave}
            disabled={dirtyCount === 0 || saving || !yearId}
            className={cn(
              "h-8 text-xs gap-1.5 font-semibold",
              dirtyCount > 0
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-slate-200 text-slate-400 cursor-not-allowed",
            )}>
            {saving
              ? <><RotateCcw className="h-3.5 w-3.5 animate-spin" /> Saving…</>
              : <><Save className="h-3.5 w-3.5" />{dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount !== 1 ? "s" : ""}` : "No changes"}</>
            }
          </Button>

          {/* Full-screen toggle */}
          <button
            onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? "Exit full screen (Esc)" : "Full screen for data entry"}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors shrink-0">
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

        {/* Row 2: filters */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Class filter */}
          <div className="space-y-1">
            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Class</Label>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-36 h-8 text-xs bg-white"><SelectValue placeholder="All classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Classes</SelectItem>
                {classes.map((c: any) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Student search */}
          <div className="space-y-1 flex-1 min-w-[180px] max-w-xs">
            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Student Search</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Name or Applicant ID…"
                className="pl-8 h-8 text-xs bg-white" />
            </div>
          </div>

          {/* Guardian search */}
          <div className="space-y-1 flex-1 min-w-[180px] max-w-xs">
            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Guardian / Father</Label>
            <div className="relative">
              <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input value={guardianSearch} onChange={e => setGuardianSearch(e.target.value)}
                placeholder="Father or guardian name…"
                className="pl-8 h-8 text-xs bg-white" />
            </div>
          </div>

          {/* Clear filters */}
          {activeFilters > 0 && (
            <button
              onClick={() => { setQ(""); setGuardianSearch(""); setClassFilter("__all__"); }}
              className="h-8 px-3 text-xs text-slate-400 hover:text-slate-700 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors self-end">
              Clear filters
              <span className="ml-1.5 inline-flex items-center justify-center h-4 w-4 rounded-full bg-slate-200 text-[9px] font-bold">
                {activeFilters}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      {!isLoading && grid && (
        <div className={cn("flex items-center gap-3 text-xs text-slate-500 flex-wrap shrink-0", fullscreen && "px-4 py-1")}>
          <span>{total} student{total !== 1 ? "s" : ""}</span>
          {overrideCount > 0 && (
            <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 font-bold">
              {overrideCount} saved override{overrideCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {dirtyCount > 0 && (
            <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 font-bold">
              {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {isFetching && <span className="text-slate-400 animate-pulse">Refreshing…</span>}
        </div>
      )}

      {/* ── No year selected ─────────────────────────────────────────────── */}
      {!yearId && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 py-16 text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-400">Select an academic year to load the fee grid.</p>
        </div>
      )}

      {/* ── Loading skeleton ──────────────────────────────────────────────── */}
      {yearId && isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      )}

      {/* ── No fee types ─────────────────────────────────────────────────── */}
      {yearId && !isLoading && feeTypes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 py-16 text-center">
          <p className="text-sm text-slate-400">No active fee types found. Add fee types in the Fee Types tab first.</p>
        </div>
      )}

      {/* ── Spreadsheet table ────────────────────────────────────────────── */}
      <div className={cn(fullscreen ? "flex-1 flex flex-col overflow-hidden px-4 pb-2" : "contents")}>
      {yearId && !isLoading && feeTypes.length > 0 && (() => {
        const SR_W  = 40;
        const STU_W = 240;
        const ACT_W = 40;
        const COL_W = 140;
        return (
          <div className={cn(
            "border border-border overflow-hidden bg-white shadow-sm select-none",
            fullscreen ? "flex-1 flex flex-col rounded-xl overflow-hidden" : "rounded-xl",
          )}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setActiveCell(null); }}>
            <div className={cn("overflow-auto", fullscreen ? "flex-1" : "max-h-[calc(100vh-260px)]")}>
              <table className="border-collapse text-sm"
                style={{ tableLayout: "fixed", width: SR_W + STU_W + ACT_W + COL_W * feeTypes.length }}>

                {/* ── Header ── */}
                <thead>
                  <tr>
                    <th style={{ position: "sticky", top: 0, left: 0, zIndex: 40, width: SR_W, minWidth: SR_W }}
                      className="bg-[#f0f2f5] border-b-2 border-r border-slate-300 px-2 py-3 text-center text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
                      #
                    </th>
                    <th style={{ position: "sticky", top: 0, left: SR_W, zIndex: 40, width: STU_W, minWidth: STU_W }}
                      className="bg-[#f0f2f5] border-b-2 border-r-2 border-slate-300 px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
                      Student
                    </th>
                    {feeTypes.map(ft => (
                      <th key={ft.id}
                        style={{ position: "sticky", top: 0, zIndex: 30, width: COL_W, minWidth: COL_W }}
                        className="bg-[#f0f2f5] border-b-2 border-r border-slate-300 last:border-r-0 px-3 py-2 text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                        <p className="leading-tight truncate" title={ft.name}>{ft.name}</p>
                        <p className="font-mono font-normal normal-case text-[10px] text-slate-400 mt-0.5 truncate">{ft.feeCode}</p>
                      </th>
                    ))}
                    <th style={{ position: "sticky", top: 0, zIndex: 30, width: ACT_W }}
                      className="bg-[#f0f2f5] border-b-2 border-slate-300" />
                  </tr>
                </thead>

                {/* ── Body ── */}
                <tbody>
                  {students.length === 0 && (
                    <tr>
                      <td colSpan={feeTypes.length + 3}
                        className="text-center py-16 text-sm text-slate-400 bg-white">
                        {activeFilters > 0 ? "No students match your filters." : "No students found."}
                      </td>
                    </tr>
                  )}
                  {students.map((st, ri) => {
                    const rowDirty       = !!local[st.id] && Object.keys(local[st.id]).length > 0;
                    const hasAnyOverride = Object.keys(st.overrides).length > 0;
                    const guardian       = st.fatherName ?? st.guardianName ?? null;
                    return (
                      <tr key={st.id} className="group">
                        {/* # */}
                        <td style={{ position: "sticky", left: 0, zIndex: 20, width: SR_W }}
                          className={cn(
                            "border-b border-r border-slate-200 px-2 py-0 text-center text-xs text-slate-400 font-mono cursor-default",
                            ri % 2 === 0 ? "bg-[#f7f8fa]" : "bg-[#f0f2f5]",
                          )}>
                          {(page - 1) * PAGE_SIZE + ri + 1}
                        </td>

                        {/* Student info */}
                        <td style={{ position: "sticky", left: SR_W, zIndex: 20, width: STU_W }}
                          className={cn(
                            "border-b border-r-2 border-slate-300 px-4 py-2 cursor-default",
                            ri % 2 === 0 ? "bg-[#f7f8fa]" : "bg-[#f0f2f5]",
                          )}>
                          <p className="font-semibold text-slate-800 text-xs whitespace-nowrap leading-tight">
                            {st.fullName}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[10px] font-mono text-slate-400">{st.applicantId}</span>
                            <span className="text-[9px] font-bold bg-slate-200 text-slate-600 rounded px-1">
                              {st.className ?? st.classCode}
                            </span>
                          </div>
                          {guardian && (
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[210px]" title={guardian}>
                              <span className="text-slate-300">F: </span>{guardian}
                            </p>
                          )}
                        </td>

                        {/* Fee cells */}
                        {feeTypes.map((ft, ci) => {
                          const locked        = isLocked(st, ft.id);
                          const dirty         = isLocalDirty(st, ft.id);
                          const override      = hasSavedOverride(st, ft.id);
                          const value         = getCellValue(st, ft.id);
                          const ph            = getCellPlaceholder(st, ft.id);
                          const isActive      = activeCell?.[0] === ri && activeCell?.[1] === ci;
                          const isClassDefault = !override && !dirty && st.classAmounts[ft.id] !== undefined;
                          const isSurcharge   = override && !dirty && st.overrides[ft.id] !== undefined && st.classAmounts[ft.id] !== undefined && st.overrides[ft.id] > st.classAmounts[ft.id];
                          return (
                            <td key={ft.id}
                              style={{ width: COL_W, padding: 0, position: "relative", height: "1px" }}
                              className={cn(
                                "border-b border-r border-slate-200 last:border-r-0",
                                ri % 2 === 0 ? "bg-white" : "bg-[#fafafa]",
                                !locked && isActive  && "!bg-[#e8f0fe] z-10",
                                !locked && !isActive && dirty       && "!bg-amber-50",
                                !locked && !isActive && !dirty && isSurcharge && "!bg-orange-50",
                                !locked && !isActive && !dirty && override && !isSurcharge && "!bg-sky-50",
                                locked && "!bg-slate-100",
                              )}>

                              {/* Active-cell border ring */}
                              {isActive && !locked && (
                                <div className="absolute inset-0 pointer-events-none"
                                  style={{ boxShadow: "inset 0 0 0 2px #1a73e8", zIndex: 2 }} />
                              )}

                              {/* Full-height container — uses height:1px trick so h-full fills the row */}
                              <div className="relative" style={{ height: "100%", minHeight: 40 }}>

                                {/* Rs / lock prefix — always visible, sits above input */}
                                <span
                                  className="absolute left-0 top-0 bottom-0 z-10 flex items-center pl-2 text-xs text-slate-400 pointer-events-none select-none"
                                  style={{ width: 26 }}>
                                  {locked ? <Lock className="h-3 w-3 text-slate-400" /> : "Rs"}
                                </span>

                                {/* Read-only display layer — visible when cell is NOT being edited */}
                                {!isActive && (
                                  <span
                                    className="absolute inset-0 flex items-center justify-end pr-2 pointer-events-none select-none"
                                    style={{ paddingLeft: 28 }}>
                                    <span className={cn(
                                      "font-mono text-sm truncate",
                                      value !== ""
                                        ? dirty          ? "text-amber-700"
                                          : isSurcharge  ? "text-orange-600"
                                          : override     ? "text-sky-700"
                                          : isClassDefault ? "text-slate-500"
                                          : "text-slate-800"
                                        : "text-slate-300",
                                    )}>
                                      {value !== "" ? value : ph}
                                    </span>
                                  </span>
                                )}

                                {/* Edit input — covers full cell so any click activates it.
                                    Invisible (opacity-0) when not active to avoid overlapping display layer.
                                    Becomes visible when this cell is active/focused. */}
                                <input
                                  ref={el => {
                                    if (!cellRefs.current[ri]) cellRefs.current[ri] = [];
                                    if (!locked) cellRefs.current[ri][ci] = el;
                                  }}
                                  type="number"
                                  min={0}
                                  step={50}
                                  disabled={locked}
                                  value={value}
                                  placeholder={ph}
                                  onChange={e => setCell(st.id, ft.id, e.target.value)}
                                  onFocus={e => { setActiveCell([ri, ci]); e.target.select(); }}
                                  onKeyDown={e => handleKeyDown(e, ri, ci)}
                                  title={
                                    locked
                                      ? "Fee paid — cannot modify"
                                      : isSurcharge
                                      ? `Class default: Rs ${fmt(st.classAmounts[ft.id])} | Surcharge override: Rs ${fmt(st.overrides[ft.id])}`
                                      : override && !dirty
                                      ? `Class default: Rs ${fmt(st.classAmounts[ft.id])} | Concession override: Rs ${fmt(st.overrides[ft.id])}`
                                      : `Class default: Rs ${fmt(st.classAmounts[ft.id])}`
                                  }
                                  className={cn(
                                    "absolute inset-0 text-right font-mono text-sm border-0 ring-0 outline-none",
                                    "focus:outline-none focus:ring-0",
                                    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                                    isActive && !locked
                                      ? "bg-transparent text-slate-900 placeholder:text-slate-300"
                                      : "opacity-0",
                                    locked ? "cursor-not-allowed" : "cursor-pointer",
                                  )}
                                  style={{ paddingLeft: 28, paddingRight: 8 }}
                                />
                              </div>
                            </td>
                          );
                        })}

                        {/* Reset row */}
                        <td style={{ width: ACT_W }}
                          className={cn(
                            "border-b border-slate-200 px-1",
                            ri % 2 === 0 ? "bg-white" : "bg-[#fafafa]",
                          )}>
                          {(rowDirty || hasAnyOverride) && (
                            <button
                              onClick={() => resetStudentRow(st)}
                              title="Reset all overrides for this student"
                              className="h-7 w-7 flex items-center justify-center rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100">
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Keyboard hint */}
            <div className="sticky bottom-0 left-0 flex items-center gap-4 px-4 py-1.5 bg-[#f0f2f5] border-t border-slate-200 text-[10px] text-slate-400 font-mono">
              <span>↑↓←→ navigate</span>
              <span>Tab / Shift+Tab  move right / left</span>
              <span>Enter  move down</span>
              <span>Home / End  first / last column</span>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-slate-50">
                <p className="text-xs text-slate-500">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} students
                </p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                    className="h-7 w-7 p-0">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="flex items-center px-2 text-xs text-slate-600">
                    {page} / {totalPages}
                  </span>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                    className="h-7 w-7 p-0">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })()}
      </div>{/* end table flex-1 wrapper */}

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      {yearId && !isLoading && feeTypes.length > 0 && (
        <div className={cn(
          "flex items-center gap-5 text-[11px] text-slate-400 flex-wrap shrink-0",
          fullscreen && "px-4 pb-2",
        )}>
          <span className="flex items-center gap-1.5">
            <Info className="h-3 w-3" /> Legend:
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded border border-slate-200 bg-white" />
            Class default (placeholder)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded border border-blue-300 bg-blue-50" />
            Saved concession
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded border border-orange-400 bg-orange-50" />
            Saved surcharge
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded border border-amber-400 bg-amber-50" />
            Unsaved change
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded border border-transparent bg-slate-100 relative">
              <Lock className="absolute inset-0 m-auto h-2.5 w-2.5 text-slate-400" />
            </span>
            Locked (fee paid)
          </span>
          <span className="ml-auto">
            Clear a cell to reset to class default. Tab moves between cells.
          </span>
        </div>
      )}
    </div>
  );
}
