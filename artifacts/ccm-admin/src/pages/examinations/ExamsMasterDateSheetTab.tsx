import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListAdminAcademicYears } from "@workspace/api-client-react";
import { format, parseISO, isValid } from "date-fns";
import { getToken } from "@/lib/auth";
import { formatDate } from "@/lib/locale";
import { fetchPrintSettings, buildPrintHtml, escapeHtml, printHtmlDocument } from "@/lib/print-utils";
import {
  Plus, Trash2, Download, Printer, RefreshCw, Save, LayoutGrid, Calendar as CalendarIcon,
} from "lucide-react";
import { ClassRecord, AcademicYear, SessionSelect } from "./ExamSelectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExamType  { id: string; name: string; }
interface Subject   { id: string; code: string; name: string; maxMarks?: number; passMarks?: number; }

interface GridRow {
  _key:        string;
  subjectCode: string;
  subjectName: string;
  examDate:    string;
  totalMarks:  number;
  passMarks:   number;
  venue:       string;
}

function makeRow(): GridRow {
  return { _key: crypto.randomUUID(), subjectCode: "", subjectName: "", examDate: "", totalMarks: 100, passMarks: 33, venue: "" };
}

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

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return formatDate(s);
}

// ── Date picker cell ───────────────────────────────────────────────────────────

function DateCell({
  value, onChange, invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const parsed = value ? parseISO(value) : undefined;
  const valid = parsed && isValid(parsed);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 w-36 justify-start text-xs font-normal gap-1.5",
            !valid && "text-muted-foreground",
            invalid && "border-red-400 ring-1 ring-red-200",
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
          {valid ? format(parsed!, "dd MMM yyyy") : "Pick date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-auto" align="start">
        <Calendar
          mode="single"
          selected={valid ? parsed : undefined}
          onSelect={(d) => { if (d) { onChange(format(d, "yyyy-MM-dd")); setOpen(false); } }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// ── Subject row cell ──────────────────────────────────────────────────────────

function SubjectSelect({
  value, onChange, subjects, disabled, invalid,
}: {
  value: string;
  onChange: (code: string, name: string) => void;
  subjects: Subject[];
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <Select
      value={value || "__none__"}
      onValueChange={v => {
        if (v === "__none__") { onChange("", ""); return; }
        const sub = subjects.find(s => s.code === v);
        onChange(v, sub?.name ?? v);
      }}
      disabled={disabled || subjects.length === 0}
    >
      <SelectTrigger className={cn(
        "h-8 text-xs border bg-transparent focus:ring-1 rounded-sm min-w-36",
        invalid ? "border-red-400 ring-1 ring-red-200" : "border-transparent",
      )}>
        <SelectValue placeholder={subjects.length === 0 ? "Select class first…" : "Subject…"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— Select —</SelectItem>
        {subjects.map(s => (
          <SelectItem key={s.code} value={s.code}>
            {s.name} <span className="text-muted-foreground text-xs ml-1">{s.code}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ExamsMasterDateSheetTab() {
  const qc = useQueryClient();

  // ── Selector state
  const [examTypeId, setExamTypeId] = useState<string>("__none__");
  const [classCode, setClassCode]   = useState<string>("");
  const [session, setSession]       = useState<string>("");
  const [academicYearId, setAcademicYearId] = useState<string | null>(null);

  // ── Grid state
  const [rows, setRows] = useState<GridRow[]>([makeRow()]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  // ── UI state
  const [saving, setSaving]  = useState(false);
  const [loading, setLoading] = useState(false);

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

  // Fetch subjects for the selected class
  const fetchSubjects = useCallback(async (code: string) => {
    if (!code) { setSubjects([]); return; }
    setSubjectsLoading(true);
    try {
      const list = await apiFetch<Subject[]>(`/api/admin/subjects?classCode=${encodeURIComponent(code)}`).catch(() => [] as Subject[]);
      list.sort((a, b) => a.name.localeCompare(b.name));
      setSubjects(list);
    } finally {
      setSubjectsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSubjects(classCode); }, [classCode, fetchSubjects]);

  // ── Row helpers
  function addRow() { setRows(r => [...r, makeRow()]); }
  function removeRow(key: string) { setRows(r => r.filter(x => x._key !== key)); }
  function setField<K extends keyof GridRow>(key: string, field: K, value: GridRow[K]) {
    setRows(r => r.map(x => x._key === key ? { ...x, [field]: value } : x));
  }

  // ── Row validation
  const rowStarted  = (r: GridRow) => !!(r.examDate || r.subjectCode || r.venue.trim());
  const rowComplete = (r: GridRow) => !!r.examDate && !!r.subjectCode && r.totalMarks > 0 && r.passMarks > 0;
  const completeRows = rows.filter(rowComplete);
  const hasIncompleteStarted = rows.some(r => rowStarted(r) && !rowComplete(r));

  // ── Load existing schedules for selected combination
  async function handleLoad() {
    if (!classCode || !session) {
      toast({ variant: "destructive", title: "Select a class and a session to load." });
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ classCode, sessionLabel: session });
      if (examTypeId && examTypeId !== "__none__") params.set("examTypeId", examTypeId);
      const data = await apiFetch<any[]>(`/api/admin/exams/schedules?${params}`);
      if (data.length === 0) {
        toast({ title: "No existing datesheet found", description: "Grid is ready for new entries." });
        return;
      }
      setRows(data.map(s => ({
        _key:        crypto.randomUUID(),
        subjectCode: s.subjectCode,
        subjectName: s.subjectName ?? s.subjectCode,
        examDate:    s.examDate ?? "",
        totalMarks:  s.totalMarks,
        passMarks:   s.passMarks,
        venue:       s.venue ?? "",
      })));
      toast({ title: `Loaded ${data.length} row${data.length !== 1 ? "s" : ""}`, description: `From class ${classCode} — ${session}` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Load failed", description: e.message });
    } finally {
      setLoading(false);
    }
  }

  // ── Save master datesheet
  async function handleSave() {
    if (!classCode) { toast({ variant: "destructive", title: "Select a class." });   return; }
    if (!session)   { toast({ variant: "destructive", title: "Select a session." }); return; }
    if (hasIncompleteStarted) {
      toast({ variant: "destructive", title: "Complete every row", description: "Each row needs a Date, Subject, Total Marks and Pass Marks." });
      return;
    }
    if (completeRows.length === 0) {
      toast({ variant: "destructive", title: "Add at least one row", description: "Fill Date, Subject, Total Marks and Pass Marks." });
      return;
    }

    setSaving(true);
    try {
      const result = await apiFetch<{ created: number; updated: number; skipped: number; message: string }>(
        "/api/admin/exams/schedules/bulk-master",
        {
          method: "POST",
          body: JSON.stringify({
            examTypeId:    examTypeId === "__none__" ? null : examTypeId,
            sessionLabel:  session,
            academicYearId,
            classCodes:    [classCode],
            rows:          completeRows.map(r => ({
              subjectCode: r.subjectCode,
              subjectName: r.subjectName || null,
              examDate:    r.examDate || null,
              totalMarks:  r.totalMarks,
              passMarks:   r.passMarks,
              venue:       r.venue || null,
            })),
          }),
        },
      );
      toast({ title: "Datesheet saved", description: result.message });
      qc.invalidateQueries({ queryKey: ["exam-schedules"] });
      qc.invalidateQueries({ queryKey: ["exam-schedules-datesheet"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    } finally {
      setSaving(false);
    }
  }

  // ── Print
  async function handlePrint() {
    if (completeRows.length === 0) { toast({ variant: "destructive", title: "Nothing to print." }); return; }

    const typeLabel = types.find(t => t.id === examTypeId)?.name ?? "";
    const classLabel = classCode || "—";
    const subtitle = [typeLabel, classLabel && `Class: ${classLabel}`, session].filter(Boolean).join("  ·  ");

    const tableHtml = `
<p style="font-size:12px;color:#555;margin-bottom:8px">${escapeHtml(subtitle)}</p>
<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px">
  <thead>
    <tr>${["Date","Subject","Total Marks","Pass Marks","Venue"].map(h =>
      `<th style="background:#f1f5f9;font-weight:700;text-align:left;padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:.05em">${h}</th>`
    ).join("")}</tr>
  </thead>
  <tbody>
    ${completeRows.map((r, i) =>
      `<tr style="${i % 2 === 1 ? "background:#f8fafc" : ""}">
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap">${r.examDate ? escapeHtml(fmtDate(r.examDate)) : "TBD"}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0">${escapeHtml(r.subjectName || r.subjectCode)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${r.totalMarks}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${r.passMarks}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0">${r.venue ? escapeHtml(r.venue) : "—"}</td>
      </tr>`
    ).join("")}
  </tbody>
</table>`;

    const settings = await fetchPrintSettings();
    const html = buildPrintHtml(tableHtml, settings, "Master Datesheet");
    printHtmlDocument(html);
  }

  const hasSelection = !!classCode && !!session;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header controls (single row) ──────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-semibold text-foreground">Datesheet Parameters</span>
          <span className="ml-auto text-xs text-muted-foreground">
            One class, one datesheet
          </span>
        </div>

        <div className="px-5 py-4 flex flex-wrap items-start gap-x-6 gap-y-4">
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

          {/* Class (single) */}
          <div className="flex-1 min-w-52 max-w-64">
            <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Class *</Label>
            <Select
              value={classCode || "__none__"}
              onValueChange={v => setClassCode(v === "__none__" ? "" : v)}
              disabled={classesLoading}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={classesLoading ? "Loading…" : "Select class…"} />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="__none__">— Select class —</SelectItem>
                {classes.map(c => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="font-medium">{c.code}</span>
                    <span className="ml-2 text-muted-foreground text-xs">{c.name}</span>
                  </SelectItem>
                ))}
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

          {/* Load button */}
          <div className="flex items-end pb-0.5">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={handleLoad}
              disabled={!hasSelection || loading}
            >
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Load Existing
            </Button>
          </div>
        </div>
      </div>

      {/* ── Grid ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Exam Schedule Grid</span>
            {subjectsLoading && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" /> Loading subjects…
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{rows.length} row{rows.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap w-40">Date <span className="text-red-400">*</span></th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Subject <span className="text-red-400">*</span></th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-24">Total Marks <span className="text-red-400">*</span></th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-24">Pass Marks <span className="text-red-400">*</span></th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-44">Venue</th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, idx) => {
                const started = rowStarted(row);
                return (
                <tr key={row._key} className={cn("group", idx % 2 === 1 ? "bg-muted/10" : "")}>
                  {/* Date */}
                  <td className="px-2 py-1.5">
                    <DateCell
                      value={row.examDate}
                      onChange={v => setField(row._key, "examDate", v)}
                      invalid={started && !row.examDate}
                    />
                  </td>
                  {/* Subject */}
                  <td className="px-2 py-1.5">
                    <SubjectSelect
                      value={row.subjectCode}
                      subjects={subjects}
                      disabled={subjectsLoading}
                      invalid={started && !row.subjectCode}
                      onChange={(code, name) => {
                        const sub = subjects.find(s => s.code === code);
                        setRows(rs => rs.map(r => r._key === row._key
                          ? {
                              ...r,
                              subjectCode: code,
                              subjectName: name,
                              totalMarks: sub?.maxMarks ?? r.totalMarks,
                              passMarks:  sub?.passMarks ?? r.passMarks,
                            }
                          : r,
                        ));
                      }}
                    />
                  </td>
                  {/* Total Marks */}
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      min={1}
                      value={row.totalMarks}
                      onChange={e => setField(row._key, "totalMarks", Number(e.target.value))}
                      className={cn("h-8 text-xs w-20 text-center font-mono", started && !(row.totalMarks > 0) && "border-red-400 ring-1 ring-red-200")}
                    />
                  </td>
                  {/* Pass Marks */}
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      min={1}
                      value={row.passMarks}
                      onChange={e => setField(row._key, "passMarks", Number(e.target.value))}
                      className={cn("h-8 text-xs w-20 text-center font-mono", started && !(row.passMarks > 0) && "border-red-400 ring-1 ring-red-200")}
                    />
                  </td>
                  {/* Venue */}
                  <td className="px-2 py-1.5">
                    <Input
                      placeholder="e.g. Main Hall"
                      value={row.venue}
                      onChange={e => setField(row._key, "venue", e.target.value)}
                      className="h-8 text-xs w-40"
                    />
                  </td>
                  {/* Delete */}
                  <td className="px-2 py-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 hover:bg-red-50 transition-opacity"
                      onClick={() => removeRow(row._key)}
                      disabled={rows.length === 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add row + footer */}
        <div className="px-4 py-2.5 border-t border-border bg-muted/10 flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> Add Row
          </Button>
          <span className="flex-1" />
          {completeRows.length > 0 && classCode && (
            <span className="text-xs text-muted-foreground">
              Will save <strong>{completeRows.length}</strong> subject{completeRows.length !== 1 ? "s" : ""} for class <strong>{classCode}</strong>
            </span>
          )}
        </div>
      </div>

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint} disabled={completeRows.length === 0}>
          <Printer className="h-3.5 w-3.5" /> Print
        </Button>
        <Button
          size="sm"
          className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          onClick={handleSave}
          disabled={saving || !classCode || !session || completeRows.length === 0 || hasIncompleteStarted}
        >
          {saving
            ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving…</>
            : <><Save className="h-3.5 w-3.5" /> Save Datesheet</>}
        </Button>
      </div>

      {/* ── Empty state hint ──────────────────────────────────────────────── */}
      {!hasSelection && (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 py-10 text-center">
          <LayoutGrid className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Start by selecting an exam type, a class, and a session above.</p>
          <p className="text-xs text-slate-400 mt-1">Then fill in the grid — dates, subjects, marks and venues — and click <strong>Save Datesheet</strong>.</p>
        </div>
      )}
    </div>
  );
}
