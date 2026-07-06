import { useState, useEffect, useRef, useCallback } from "react";
import { formatDate } from "@/lib/locale";
import { AuditStamp } from "@/components/AuditStamp";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListAdminAcademicYears } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import { ClassFilterSelect, SessionFilterSelect, ClassRecord, AcademicYear } from "./ExamSelectors";
import { Save, CheckCircle2, XCircle, Minus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

interface Schedule {
  id: string; examTypeName: string | null; classCode: string;
  subjectCode: string; subjectName: string | null;
  sessionLabel: string; examDate: string | null; totalMarks: number; passMarks: number;
  resultsStatus?: string | null;
  marksEnteredBy?: string | null;
  publishedBy?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
}
interface GradeBand { id: string; grade: string; minPercent: number; maxPercent: number; }
interface ResultRow {
  studentId: string; applicantId: string; studentName: string;
  obtainedMarks: number | null; isAbsent: boolean; remarks: string; resultId: string | null;
}

function fmtDate(s?: string | null) {
  if (!s) return "";
  return formatDate(s);
}

function resolveGrade(obtained: number | null, total: number, bands: GradeBand[]): GradeBand | null {
  if (obtained === null || !bands.length) return null;
  const pct = Math.round((obtained / total) * 100);
  return bands.find(b => pct >= b.minPercent && pct <= b.maxPercent) ?? null;
}

export function ExamsResultsTab() {
  const qc = useQueryClient();
  const [filterClass, setFilterClass] = useState<string>("");
  const [filterSession, setFilterSession] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string>("__none__");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const marksRefs = useRef<(HTMLInputElement | null)[]>([]);

  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: ["exam-schedules"],
    queryFn: () => apiFetch("/api/admin/exams/schedules"),
    staleTime: 10_000,
  });

  const { data: bands = [] } = useQuery<GradeBand[]>({
    queryKey: ["grade-bands-all"],
    queryFn: () => apiFetch("/api/admin/exams/grade-bands"),
    staleTime: 60_000,
  });

  const { data: scheduleData, isLoading: loadingResults } = useQuery<{ schedule: Schedule; rows: ResultRow[] }>({
    queryKey: ["exam-schedule-results", selectedId],
    queryFn: () => apiFetch(`/api/admin/exams/schedules/${selectedId}/results`),
    enabled: selectedId !== "__none__",
    staleTime: 5_000,
  });

  useEffect(() => {
    if (scheduleData) { setRows(scheduleData.rows.map(r => ({ ...r }))); setDirty(false); }
  }, [scheduleData]);

  const saveMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/exams/schedules/${selectedId}/results/bulk`, {
        method: "POST",
        body: JSON.stringify({
          rows: rows.map(r => ({
            studentId: r.studentId,
            obtainedMarks: r.isAbsent ? null : r.obtainedMarks,
            isAbsent: r.isAbsent,
            remarks: r.remarks,
          })),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam-schedule-results", selectedId] });
      setDirty(false);
      toast({ title: "Saved", description: `${rows.length} results updated.` });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Save failed", description: e.message }),
  });

  // Auto-save on blur after a brief debounce
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveMut.mutate(), 1500);
  }

  function updateRow(idx: number, key: keyof ResultRow, val: any) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r));
    setDirty(true);
  }

  // Keyboard: Enter or ArrowDown moves focus to next marks cell
  function handleMarksKey(e: React.KeyboardEvent, idx: number) {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      // Find next non-absent row
      for (let next = idx + 1; next < marksRefs.current.length; next++) {
        const row = filtered[next];
        if (row && !row.isAbsent) { marksRefs.current[next]?.focus(); break; }
      }
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      for (let prev = idx - 1; prev >= 0; prev--) {
        const row = filtered[prev];
        if (row && !row.isAbsent) { marksRefs.current[prev]?.focus(); break; }
      }
    }
  }

  function markAllAbsent() { setRows(prev => prev.map(r => ({ ...r, isAbsent: true, obtainedMarks: null }))); setDirty(true); }
  function markAllPresent() { setRows(prev => prev.map(r => ({ ...r, isAbsent: false }))); setDirty(true); }

  // DB-backed filter options — independent of whether exams are scheduled
  const { data: classesRaw = [] } = useQuery<ClassRecord[]>({
    queryKey: ["classes-list"],
    queryFn: () => apiFetch("/api/admin/classes"),
    staleTime: 60_000,
  });
  const { data: yearsRaw } = useListAdminAcademicYears();
  const academicYears = (Array.isArray(yearsRaw) ? yearsRaw : []) as AcademicYear[];

  const visibleSchedules = schedules.filter(s =>
    (!filterClass   || s.classCode    === filterClass) &&
    (!filterSession || s.sessionLabel === filterSession)
  );

  const schedule = selectedId !== "__none__" ? schedules.find(s => s.id === selectedId) : null;
  const filtered = rows.filter(r => !search || r.studentName.toLowerCase().includes(search.toLowerCase()) || r.applicantId.includes(search));

  const entered = rows.filter(r => !r.isAbsent && r.obtainedMarks !== null).length;
  const absent  = rows.filter(r => r.isAbsent).length;
  const pending = rows.length - entered - absent;
  const passing = schedule ? rows.filter(r => !r.isAbsent && (r.obtainedMarks ?? 0) >= schedule.passMarks).length : 0;
  const progress = rows.length > 0 ? Math.round(((entered + absent) / rows.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Exam selector with pre-filters */}
      <div className="rounded-xl border border-border bg-white p-4 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select Exam</p>
        <div className="flex flex-wrap gap-2">
          {/* Filter by class */}
          <ClassFilterSelect
            value={filterClass}
            onChange={v => { setFilterClass(v); setSelectedId("__none__"); setRows([]); }}
            classes={classesRaw}
            allLabel="All Classes"
            className="w-36"
          />
          {/* Filter by session */}
          <SessionFilterSelect
            value={filterSession}
            onChange={v => { setFilterSession(v); setSelectedId("__none__"); setRows([]); }}
            academicYears={academicYears}
            allLabel="All Sessions"
            className="w-36"
          />
          {/* Exam picker — filtered */}
          <Select value={selectedId} onValueChange={v => { setSelectedId(v); setRows([]); setDirty(false); }}>
            <SelectTrigger className="h-9 flex-1 min-w-48 text-sm">
              <SelectValue placeholder="Choose exam…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Select exam —</SelectItem>
              {visibleSchedules.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.classCode} · {s.subjectName ?? s.subjectCode}
                  {s.examDate ? ` · ${fmtDate(s.examDate)}` : ""} · {s.sessionLabel}
                  {s.examTypeName ? ` (${s.examTypeName})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {schedule && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium">Total: {schedule.totalMarks}</span>
            <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">Pass: {schedule.passMarks}</span>
            {schedule.examDate && <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600">{fmtDate(schedule.examDate)}</span>}
            <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600">{schedule.examTypeName ?? "Exam"}</span>
            {schedule.resultsStatus === "published" && (
              <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">✓ Published</span>
            )}
            {schedule.resultsStatus === "submitted" && (
              <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">⏳ Awaiting Approval</span>
            )}
            {(schedule.resultsStatus === "draft" || !schedule.resultsStatus) && (
              <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200">Draft</span>
            )}
          </div>
        )}
      </div>

      {selectedId === "__none__" ? (
        <div className="text-center py-20 text-sm text-slate-400">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-slate-200" />
          Select an exam above to begin entering results.
          {schedules.length === 0 && <p className="mt-2 text-xs">No exams scheduled yet — create them in the <strong>Schedule Exams</strong> tab first.</p>}
        </div>
      ) : loadingResults ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}</div>
      ) : (
        <>
          {/* Audit trail — who entered marks / who published */}
          {(scheduleData?.schedule?.marksEnteredBy || scheduleData?.schedule?.publishedBy) && (
            <AuditStamp
              preparedLabel="Marks entered by"
              preparedById={scheduleData.schedule.marksEnteredBy}
              approvedLabel="Published by"
              approvedById={scheduleData.schedule.publishedBy}
              approvedAt={scheduleData.schedule.publishedAt}
            />
          )}

          {/* Progress + stats bar */}
          {rows.length > 0 && (
            <div className="rounded-xl border border-border bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="text-slate-500"><strong className="text-slate-800">{rows.length}</strong> students</span>
                  <span className="text-blue-600"><strong>{entered}</strong> entered</span>
                  <span className="text-red-500"><strong>{absent}</strong> absent</span>
                  {pending > 0 && <span className="text-amber-600"><strong>{pending}</strong> pending</span>}
                  {schedule && <span className="text-green-600"><strong>{passing}</strong> passing</span>}
                </div>
                <span className="text-xs font-semibold text-slate-600 tabular-nums">{progress}%</span>
              </div>
              {/* Progress bar */}
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${(entered / rows.length) * 100}%` }} />
                <div className="h-full bg-red-400 transition-all" style={{ width: `${(absent / rows.length) * 100}%` }} />
              </div>
              <div className="flex gap-3 text-[11px] text-slate-400">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />Entered</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400 inline-block" />Absent</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-200 inline-block" />Pending</span>
              </div>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-48 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search student…" className="pl-8 h-8 text-sm" />
            </div>
            <Button variant="outline" size="sm" onClick={markAllPresent} className="h-8">Mark All Present</Button>
            <Button variant="outline" size="sm" onClick={markAllAbsent} className="h-8 text-red-600 border-red-200 hover:bg-red-50">Mark All Absent</Button>
            <Button
              size="sm" className="h-8 ml-auto"
              disabled={!dirty || saveMut.isPending || schedule?.resultsStatus === "published"}
              title={schedule?.resultsStatus === "published" ? "Published results cannot be modified" : undefined}
              onClick={() => saveMut.mutate()}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saveMut.isPending ? "Saving…" : schedule?.resultsStatus === "published" ? "Published ✓" : dirty ? "Save & Submit" : "Saved ✓"}
            </Button>
          </div>

          {/* Tip */}
          <p className="text-xs text-slate-400">
            Tip: <kbd className="px-1 py-0.5 rounded bg-slate-100 font-mono text-[11px]">Enter</kbd> or <kbd className="px-1 py-0.5 rounded bg-slate-100 font-mono text-[11px]">↓</kbd> moves to the next student · <kbd className="px-1 py-0.5 rounded bg-slate-100 font-mono text-[11px]">↑</kbd> goes back · Results auto-save 1.5 s after you stop typing.
          </p>

          {/* Results grid */}
          <div className="border border-border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground w-10">#</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground w-24">Register ID</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Name</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground w-16">Absent</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground w-28">
                    Marks{schedule ? ` / ${schedule.totalMarks}` : ""}
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground w-16">Grade</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground w-20">Status</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-400">No students found</td></tr>
                ) : filtered.map((row, visIdx) => {
                  const realIdx = rows.indexOf(row);
                  const grade = schedule ? resolveGrade(row.obtainedMarks, schedule.totalMarks, bands) : null;
                  const isPassing = schedule && !row.isAbsent && row.obtainedMarks !== null && row.obtainedMarks >= schedule.passMarks;
                  return (
                    <tr key={row.studentId} className={cn("transition-colors", row.isAbsent ? "bg-red-50/40" : "hover:bg-muted/20")}>
                      <td className="px-3 py-2 text-xs text-slate-400 tabular-nums">{visIdx + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.applicantId}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{row.studentName}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={row.isAbsent}
                          onChange={e => {
                            updateRow(realIdx, "isAbsent", e.target.checked);
                            if (e.target.checked) updateRow(realIdx, "obtainedMarks", null);
                            scheduleSave();
                          }}
                          className="h-4 w-4 accent-red-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          ref={el => { marksRefs.current[visIdx] = el; }}
                          type="number"
                          min={0}
                          max={schedule?.totalMarks ?? 100}
                          disabled={row.isAbsent}
                          value={row.obtainedMarks ?? ""}
                          onChange={e => {
                            updateRow(realIdx, "obtainedMarks", e.target.value === "" ? null : Number(e.target.value));
                          }}
                          onBlur={() => dirty && scheduleSave()}
                          onKeyDown={e => handleMarksKey(e, visIdx)}
                          className={cn(
                            "w-20 h-8 text-center rounded border text-sm font-semibold tabular-nums transition-colors",
                            "border-border bg-background focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400",
                            row.isAbsent && "opacity-25 bg-slate-100 cursor-not-allowed",
                            !row.isAbsent && row.obtainedMarks !== null && isPassing  && "border-green-300 bg-green-50 text-green-800",
                            !row.isAbsent && row.obtainedMarks !== null && !isPassing && "border-red-300 bg-red-50 text-red-700",
                          )}
                          placeholder="—"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.isAbsent ? (
                          <span className="text-xs font-bold text-red-500">AB</span>
                        ) : grade ? (
                          <span className="text-xs font-bold text-indigo-700 px-1.5 py-0.5 rounded bg-indigo-50">{grade.grade}</span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.isAbsent ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">
                            <XCircle className="h-3 w-3" />Absent
                          </span>
                        ) : row.obtainedMarks === null ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-full border border-slate-200">
                            <Minus className="h-3 w-3" />Pending
                          </span>
                        ) : isPassing ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-200">
                            <CheckCircle2 className="h-3 w-3" />Pass
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">
                            <XCircle className="h-3 w-3" />Fail
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={row.remarks}
                          onChange={e => { updateRow(realIdx, "remarks", e.target.value); }}
                          onBlur={() => dirty && scheduleSave()}
                          placeholder="Optional…"
                          className="w-full h-8 px-2 text-xs rounded border border-transparent bg-transparent hover:border-border focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 focus:outline-none transition-colors placeholder:text-slate-300"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {dirty && (
            <div className="flex justify-end">
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} size="sm">
                <Save className="mr-1.5 h-4 w-4" />
                {saveMut.isPending ? "Saving…" : "Save All Results"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
