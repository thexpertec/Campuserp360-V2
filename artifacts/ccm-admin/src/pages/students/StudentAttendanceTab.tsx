import { useState, useEffect, useMemo } from "react";
import { formatDate } from "@/lib/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Save, Search, ChevronLeft, ChevronRight,
  GraduationCap, Users, CheckCircle2, CheckCheck,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type AttendanceStatus = "present" | "absent" | "leave" | "off" | "late";
interface SheetRow { studentId: string; status: AttendanceStatus; notes: string }
interface AttendanceRecord {
  id: string; studentId: string; attendanceDate: string; status: string;
  classCode: string; sectionId?: string; notes?: string;
}
interface Student {
  id: string; applicantId: string; fullName: string;
  classCode: string; sectionId?: string; status?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUSES: { value: AttendanceStatus; label: string; short: string; color: string; row: string }[] = [
  { value: "present", label: "Present", short: "P",  color: "bg-green-100 text-green-700 border-green-200",  row: "" },
  { value: "absent",  label: "Absent",  short: "A",  color: "bg-red-100 text-red-700 border-red-200",        row: "bg-red-50/60" },
  { value: "leave",   label: "Leave",   short: "L",  color: "bg-blue-100 text-blue-700 border-blue-200",     row: "bg-blue-50/40" },
  { value: "off",     label: "Off",     short: "O",  color: "bg-slate-100 text-slate-600 border-slate-200",  row: "bg-slate-50" },
  { value: "late",    label: "Late",    short: "Lt", color: "bg-orange-100 text-orange-700 border-orange-200", row: "bg-orange-50/40" },
];
const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s]));
const today = () => new Date().toISOString().slice(0, 10);
const prevDay = (d: string) => { const dt = new Date(d); dt.setDate(dt.getDate() - 1); return dt.toISOString().slice(0, 10); };
const nextDay = (d: string) => { const dt = new Date(d); dt.setDate(dt.getDate() + 1); return dt.toISOString().slice(0, 10); };
const fmtDate = (d: string) => formatDate(d + "T00:00:00");

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

// ── Inline status toggle ───────────────────────────────────────────────────────
function StatusToggle({ value, onChange }: { value: AttendanceStatus; onChange: (s: AttendanceStatus) => void }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {STATUSES.map(s => (
        <button key={s.value} type="button" onClick={() => onChange(s.value)}
          title={s.label}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all select-none whitespace-nowrap ${
            value === s.value ? s.color + " shadow-sm" : "bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600"
          }`}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function StudentAttendanceTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [date, setDate] = useState(today());
  const [classCode, setClassCode] = useState("");
  const [sectionId, setSectionId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [sheet, setSheet] = useState<Record<string, SheetRow>>({});
  const [unsaved, setUnsaved] = useState(false);

  // ── Data fetches ──────────────────────────────────────────────────────────
  const { data: classes } = useQuery({
    queryKey: ["admin-classes-active"],
    queryFn: () => apiFetch<any[]>("/api/admin/classes"),
  });
  const classList = Array.isArray(classes) ? classes : [];
  const sectionList = useMemo(() => {
    if (!classCode) return [];
    const cls = classList.find((c: any) => c.code === classCode);
    return (cls?.sections ?? []) as { id: string; name: string }[];
  }, [classList, classCode]);

  const { data: studentsData, isLoading: studLoading } = useQuery({
    queryKey: ["students-attendance-list", classCode, sectionId],
    queryFn: () => {
      const p = new URLSearchParams({ status: "active", pageSize: "500" });
      if (classCode) p.set("classCode", classCode);
      if (sectionId !== "all") p.set("sectionId", sectionId);
      return apiFetch<{ data: Student[]; total: number } | Student[]>(`/api/admin/students?${p}`);
    },
    enabled: !!classCode,
  });

  const studentList: Student[] = useMemo(() => {
    if (!studentsData) return [];
    const d = studentsData as any;
    return Array.isArray(d?.items) ? d.items : Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
  }, [studentsData]);

  const { data: existingAtt, isLoading: attLoading } = useQuery({
    queryKey: ["student-attendance-day", date, classCode, sectionId],
    queryFn: () => {
      const p = new URLSearchParams({ date, classCode });
      if (sectionId !== "all") p.set("sectionId", sectionId);
      return apiFetch<AttendanceRecord[]>(`/api/admin/students/attendance?${p}`);
    },
    enabled: !!classCode,
  });

  // ── Off-day lookup (calendar integration) ────────────────────────────────
  const { data: offDay } = useQuery<{ isOff: boolean; type: string | null; reason: string | null }>({
    queryKey: ["cal-off-day-students", date],
    queryFn: () => apiFetch(`/api/admin/calendar/off-days?date=${date}&audience=students`),
    staleTime: 1000 * 60 * 5,
  });

  // ── Build sheet ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!studentList.length) return;
    const saved: Record<string, SheetRow> = {};
    (existingAtt ?? []).forEach(r => {
      saved[r.studentId] = { studentId: r.studentId, status: r.status as AttendanceStatus, notes: r.notes ?? "" };
    });
    const defaultStatus: AttendanceStatus = offDay?.isOff ? "off" : "present";
    const next: Record<string, SheetRow> = {};
    studentList.forEach(s => {
      next[s.id] = saved[s.id] ?? { studentId: s.id, status: defaultStatus, notes: "" };
    });
    setSheet(next);
    setUnsaved(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingAtt, studentsData, offDay]);

  // ── Save ─────────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (records: SheetRow[]) =>
      apiFetch<{ saved: number }>("/api/admin/students/attendance/bulk-save", {
        method: "POST",
        body: JSON.stringify({ date, classCode, sectionId: sectionId !== "all" ? sectionId : undefined, records }),
      }),
    onSuccess: (res) => {
      toast({ title: `Attendance saved — ${res.saved} records` });
      qc.invalidateQueries({ queryKey: ["student-attendance-day", date, classCode, sectionId] });
      setUnsaved(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  function handleSave() {
    if (!classCode) { toast({ title: "Please select a class", variant: "destructive" }); return; }
    const records = studentList.map(s => sheet[s.id] ?? { studentId: s.id, status: "present" as AttendanceStatus, notes: "" });
    if (!records.length) { toast({ title: "No students found", variant: "destructive" }); return; }
    saveMut.mutate(records);
  }

  function setStatus(studentId: string, status: AttendanceStatus) {
    setSheet(s => ({ ...s, [studentId]: { ...s[studentId], status } }));
    setUnsaved(true);
  }

  function setNotes(studentId: string, notes: string) {
    setSheet(s => ({ ...s, [studentId]: { ...s[studentId], notes } }));
    setUnsaved(true);
  }

  function markAllPresent() {
    setSheet(s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { ...v, status: "present" as AttendanceStatus }])));
    setUnsaved(true);
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => studentList.filter(s => {
    if (statusFilter !== "all" && (sheet[s.id]?.status ?? "present") !== statusFilter) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      if (![s.applicantId, s.fullName].join(" ").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [studentList, statusFilter, searchQ, sheet]);

  // ── Summary counts ────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, leave: 0, off: 0, late: 0 };
    studentList.forEach(s => { const st = sheet[s.id]?.status ?? "present"; c[st] = (c[st] ?? 0) + 1; });
    return c;
  }, [studentList, sheet]);

  const isLoading = studLoading || attLoading;
  const isToday = date === today();

  return (
    <div className="space-y-4">

      {/* ── Off-day banner ── */}
      {offDay?.isOff && (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm font-medium ${offDay.type === "holiday" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-slate-100 border-slate-300 text-slate-700"}`}>
          <span className="text-base">{offDay.type === "holiday" ? "🎌" : "📅"}</span>
          <span>
            {offDay.type === "holiday" ? <>Public Holiday: <b>{offDay.reason}</b> — attendance pre-filled as <b>Off</b> for unsaved records</> : <>Weekend — attendance pre-filled as <b>Off</b> for unsaved records</>}
          </span>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Student Attendance Register</h2>
          <p className="text-sm text-slate-500 mt-0.5">Select a class and mark daily attendance for all cadets</p>
        </div>
        <div className="flex items-center gap-2">
          {unsaved && <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-1 rounded-md">Unsaved changes</span>}
          {!!studentList.length && (
            <Button variant="outline" size="sm" onClick={markAllPresent} disabled={isLoading}>
              <CheckCheck className="h-4 w-4 mr-1.5" />Mark All Present
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saveMut.isPending || !classCode || isLoading}>
            {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Attendance
          </Button>
        </div>
      </div>

      {/* ── Filters row ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Date nav */}
        <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
          <button onClick={() => setDate(prevDay(date))} className="px-2.5 py-2 hover:bg-slate-50 text-slate-500 border-r border-slate-200 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center px-3">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="text-sm font-medium text-slate-700 bg-transparent border-0 outline-none cursor-pointer" />
          </div>
          <button onClick={() => setDate(nextDay(date))} disabled={date >= today()}
            className="px-2.5 py-2 hover:bg-slate-50 text-slate-500 border-l border-slate-200 transition-colors disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {!isToday && <button onClick={() => setDate(today())} className="text-xs text-primary underline font-medium">Today</button>}

        {/* Class */}
        <Select value={classCode} onValueChange={v => { setClassCode(v); setSectionId("all"); setSheet({}); setUnsaved(false); }}>
          <SelectTrigger className="h-9 w-40 text-sm">
            <SelectValue placeholder="Select class…" />
          </SelectTrigger>
          <SelectContent>
            {classList.map((c: any) => <SelectItem key={c.code} value={c.code}>{c.name ?? c.code}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Section */}
        <Select value={sectionId} onValueChange={setSectionId} disabled={!classCode}>
          <SelectTrigger className="h-9 w-36 text-sm">
            <SelectValue placeholder="All sections" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {sectionList.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter} disabled={!classCode}>
          <SelectTrigger className="h-9 w-40 text-sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search by name or GR…" className="pl-8 h-9 text-sm" />
        </div>

        {classCode && <span className="text-xs text-slate-400 ml-auto">{filtered.length} of {studentList.length} cadets</span>}
      </div>

      {/* ── Summary chips (only when class selected) ── */}
      {classCode && !!studentList.length && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setStatusFilter("all")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${statusFilter === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400"}`}>
            <Users className="h-3.5 w-3.5" /><span className="font-bold text-sm">{studentList.length}</span> Total
          </button>
          {STATUSES.map(s => (
            <button key={s.value} onClick={() => setStatusFilter(statusFilter === s.value ? "all" : s.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                statusFilter === s.value ? s.color + " ring-1 ring-current" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}>
              <span className="font-bold text-sm">{counts[s.value]}</span> {s.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Attendance register table ── */}
      {!classCode ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
          <div className="h-16 w-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
            <GraduationCap className="h-8 w-8 text-slate-300" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500">Select a class to start</p>
            <p className="text-xs text-slate-400 mt-1">All cadets in the class will appear here for marking</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {/* Table header */}
          <div className="grid gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide"
            style={{ gridTemplateColumns: "32px 80px 1fr 90px auto minmax(160px,1fr)" }}>
            <span>#</span>
            <span>Register ID</span>
            <span>Cadet Name</span>
            <span>Section</span>
            <span>Attendance Status</span>
            <span>Narration / Comment</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading cadets…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Users className="h-7 w-7 text-slate-300" />
              </div>
              <p className="text-sm font-medium">No cadets match your filters</p>
              <button onClick={() => { setStatusFilter("all"); setSearchQ(""); }} className="text-xs text-primary underline">Clear filters</button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((student, idx) => {
                const row = sheet[student.id] ?? { studentId: student.id, status: "present" as AttendanceStatus, notes: "" };
                const statusInfo = STATUS_MAP[row.status];
                const sec = sectionList.find((s) => s.id === student.sectionId);
                return (
                  <div key={student.id}
                    className={`grid gap-3 px-4 py-2 items-center text-sm transition-colors hover:brightness-95 ${statusInfo?.row || (idx % 2 === 0 ? "bg-white" : "bg-slate-50/30")}`}
                    style={{ gridTemplateColumns: "32px 80px 1fr 90px auto minmax(160px,1fr)" }}>
                    <span className="text-xs text-slate-400 font-mono">{idx + 1}</span>
                    <span className="text-xs font-mono text-slate-500">{student.applicantId}</span>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${row.status === "present" ? "bg-green-400" : row.status === "absent" ? "bg-red-400" : row.status === "late" ? "bg-orange-400" : row.status === "leave" ? "bg-blue-400" : "bg-slate-300"}`} />
                      <span className="font-medium text-slate-800 truncate">{student.fullName}</span>
                    </div>
                    <span className="text-xs text-slate-500">{sec?.name ?? "—"}</span>
                    <StatusToggle value={row.status} onChange={s => setStatus(student.id, s)} />
                    <input
                      type="text"
                      value={row.notes ?? ""}
                      onChange={e => setNotes(student.id, e.target.value)}
                      placeholder="Add comment…"
                      className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50 transition-colors"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          {!isLoading && filtered.length > 0 && (
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-slate-400">{fmtDate(date)} · {studentList.length} cadets total</span>
              <Button size="sm" onClick={handleSave} disabled={saveMut.isPending}>
                {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                Save Attendance
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
