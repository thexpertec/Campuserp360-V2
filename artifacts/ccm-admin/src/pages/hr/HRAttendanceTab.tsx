import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { formatDate } from "@/lib/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListAdminHrDepartments, useGetAdminHrAttendanceMonthlyReport } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Save, Search, ChevronLeft, ChevronRight,
  CheckCircle2, Users, CheckCheck, GraduationCap, Clock, CalendarRange, ClipboardList,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type AttendanceStatus = "present" | "absent" | "leave" | "off" | "late";
interface SheetRow { employeeId: string; status: AttendanceStatus; inTime: string; outTime: string; notes: string }
interface AttendanceRecord {
  id: string; employeeId: string; attendanceDate: string; status: string;
  inTime?: string; outTime?: string; notes?: string;
  earlyDeparture?: boolean; lecturesAttended?: number | null; lecturesTotal?: number | null;
}
interface Employee {
  id: string; staffId: string; fullName: string; name?: string;
  role: string; departmentId?: string; departmentName?: string; designationName?: string; status?: string;
  attendanceMode?: string; scheduledStartTime?: string | null; scheduledEndTime?: string | null; graceMinutes?: number | null;
}
interface Lecture {
  slotId: string; periodId: string | null; classCode: string; sectionName: string | null;
  subjectName: string | null; subjectCode: string | null; periodName: string | null;
  startTime: string | null; endTime: string | null; present: boolean; saved: boolean;
}
interface LecturesResponse {
  employeeId: string; date: string; dayOfWeek: number;
  total: number; attended: number; saved: boolean; lectures: Lecture[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
export const STATUSES: { value: AttendanceStatus; label: string; color: string; row: string }[] = [
  { value: "present", label: "Present", color: "bg-green-100 text-green-700 border-green-200",    row: "" },
  { value: "absent",  label: "Absent",  color: "bg-red-100 text-red-700 border-red-200",          row: "bg-red-50/60" },
  { value: "leave",   label: "Leave",   color: "bg-blue-100 text-blue-700 border-blue-200",       row: "bg-blue-50/40" },
  { value: "off",     label: "Off",     color: "bg-slate-100 text-slate-600 border-slate-200",    row: "bg-slate-50" },
  { value: "late",    label: "Late",    color: "bg-orange-100 text-orange-700 border-orange-200", row: "bg-orange-50/40" },
];
const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s]));
const today     = () => new Date().toISOString().slice(0, 10);
const prevDay   = (d: string) => { const dt = new Date(d); dt.setDate(dt.getDate() - 1); return dt.toISOString().slice(0, 10); };
const nextDay   = (d: string) => { const dt = new Date(d); dt.setDate(dt.getDate() + 1); return dt.toISOString().slice(0, 10); };
const fmtDate   = (d: string) => formatDate(d + "T00:00:00");
// Builds "YYYY-MM" from local year/month, not toISOString() (which converts
// to UTC first and rolls day-1 midnight back a month for positive UTC offsets).
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const fmtMonth  = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers ?? {}) } });
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
          className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all select-none ${
            value === s.value ? s.color + " shadow-sm" : "bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-500"
          }`}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ── Lecture-based attendance row (capsule marking) ────────────────────────────
// Baseline marks from the server: unmarked (unsaved) lectures start grey — the
// user clicks capsules to mark them present, so blue = marked present, grey = not.
function baselineMarks(lectures: Lecture[]): Record<string, boolean> {
  return Object.fromEntries(lectures.map(l => [l.slotId, l.saved ? l.present : false]));
}

function LectureAttendanceRow({ emp, idx, date, rollup, draft, onDraftChange, saving }: {
  emp: Employee; idx: number; date: string; rollup?: AttendanceRecord;
  // Draft marks live in the parent (keyed by employee) so unsaved edits survive
  // tab/view/filter switches that unmount this row.
  draft?: Record<string, boolean>;
  onDraftChange: (empId: string, marks: Record<string, boolean>) => void;
  saving: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["hr-lectures", emp.id, date],
    queryFn: () => apiFetch<LecturesResponse>(`/api/admin/hr/attendance/lectures?employeeId=${emp.id}&date=${date}`),
  });

  const lectures = data?.lectures ?? [];
  const dirty    = draft !== undefined;
  const marks    = draft ?? baselineMarks(lectures);
  const attended = lectures.filter(l => marks[l.slotId]).length;
  const total    = lectures.length;
  const anySaved = lectures.some(l => l.saved);

  // Auto-derived daily status from the current capsule marks:
  // all present → Present, none → Absent, partial → Late.
  const derived: AttendanceStatus | null =
    total === 0 ? null : attended === total ? "present" : attended === 0 ? "absent" : "late";
  // Before any local edits, prefer the saved rollup status.
  const shownStatus = !dirty && rollup?.status ? (rollup.status as AttendanceStatus) : derived;
  const shownAttended = !dirty && anySaved && rollup?.lecturesAttended != null ? rollup.lecturesAttended : attended;

  function toggle(slotId: string) {
    onDraftChange(emp.id, { ...marks, [slotId]: !marks[slotId] });
  }

  return (
    <div className="grid gap-2 px-4 py-2.5 items-start text-sm"
      style={{ gridTemplateColumns: "32px 1fr 100px 130px 2fr 170px" }}>
      <span className="text-xs text-slate-400 font-mono pt-1">{idx + 1}</span>
      <div>
        <p className="font-medium text-slate-800 leading-tight text-sm">{emp.name ?? emp.fullName}</p>
        <p className="text-xs text-indigo-500 mt-0.5">{emp.designationName ?? emp.role?.replace(/_/g, " ")}</p>
      </div>
      <span className="text-xs font-mono text-slate-500 pt-1">{emp.staffId}</span>
      <span className="text-xs text-slate-500 truncate pt-1">{emp.departmentName ?? "—"}</span>

      {/* Lecture capsules */}
      <div className="flex flex-wrap gap-1.5">
        {isLoading ? (
          <span className="flex items-center gap-1.5 text-xs text-slate-400 py-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading lectures…</span>
        ) : lectures.length === 0 ? (
          <span className="text-xs text-slate-400 py-1">No lectures scheduled for {fmtDate(date)}</span>
        ) : (
          lectures.map(l => {
            const present = !!marks[l.slotId];
            const label = [l.periodName ?? "Lecture", l.classCode, l.subjectCode ?? l.subjectName].filter(Boolean).join(" · ");
            const tip = [l.periodName, l.startTime ? `${l.startTime}${l.endTime ? `–${l.endTime}` : ""}` : null, l.classCode, l.sectionName, l.subjectName].filter(Boolean).join(" · ");
            return (
              <button key={l.slotId} type="button" onClick={() => toggle(l.slotId)} title={tip}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all select-none ${
                  present
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm hover:bg-blue-700"
                    : "bg-slate-100 text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-200"
                }`}>
                {label}
              </button>
            );
          })
        )}
      </div>

      {/* Summary + derived status */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {total > 0 && (
          <span className="text-xs text-slate-600 font-medium whitespace-nowrap">{shownAttended}/{total} lectures attended</span>
        )}
        {shownStatus && (
          <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${STATUS_MAP[shownStatus]?.color ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
            {STATUS_MAP[shownStatus]?.label ?? shownStatus}
          </span>
        )}
        {dirty && <span className="text-[10px] text-amber-600 font-semibold">unsaved</span>}
        {saving && dirty && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
      </div>
    </div>
  );
}

// ── Monthly report view ────────────────────────────────────────────────────────
function MonthlyReport({ tab, deptFilter, searchQ }: { tab: "lecture" | "time"; deptFilter: string; searchQ: string }) {
  const [month, setMonth] = useState(thisMonth());
  const { data, isLoading, error } = useGetAdminHrAttendanceMonthlyReport({ month });

  const rows = useMemo(() => {
    const all = data?.employees ?? [];
    return all.filter(r => {
      const mode = r.attendanceMode === "lecture_based" ? "lecture" : "time";
      if (mode !== tab) return false;
      if (deptFilter !== "all" && r.departmentId !== deptFilter) return false;
      if (searchQ) {
        const q = searchQ.toLowerCase();
        if (![r.name, r.staffId, r.departmentName ?? ""].join(" ").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [data, tab, deptFilter, searchQ]);

  const isLecture = tab === "lecture";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-slate-400" />
          <input type="month" value={month} max={thisMonth()} onChange={e => e.target.value && setMonth(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <span className="text-sm text-slate-500">{fmtMonth(month)} — {isLecture ? "lecture attendance" : "day-wise attendance"} · {rows.length} staff</span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        {isLecture ? (
          <div className="grid gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide"
            style={{ gridTemplateColumns: "32px 1fr 100px 130px 110px 110px 1fr" }}>
            <span>#</span><span>Employee</span><span>Staff ID</span><span>Department</span>
            <span className="text-center">Attended</span><span className="text-center">Scheduled</span><span>Attendance %</span>
          </div>
        ) : (
          <div className="grid gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide"
            style={{ gridTemplateColumns: "32px 1fr 100px 130px 70px 70px 70px 70px 70px" }}>
            <span>#</span><span>Employee</span><span>Staff ID</span><span>Department</span>
            <span className="text-center">Present</span><span className="text-center">Absent</span>
            <span className="text-center">Leave</span><span className="text-center">Late</span><span className="text-center">Off</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Building monthly report…</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-red-500 text-sm">Failed to load monthly report</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
            <ClipboardList className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium">No {isLecture ? "lecture-based" : "time-based"} staff match your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((r, idx) => isLecture ? (
              <div key={r.employeeId} className={`grid gap-2 px-4 py-2.5 items-center text-sm ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}
                style={{ gridTemplateColumns: "32px 1fr 100px 130px 110px 110px 1fr" }}>
                <span className="text-xs text-slate-400 font-mono">{idx + 1}</span>
                <div>
                  <p className="font-medium text-slate-800 leading-tight text-sm">{r.name}</p>
                  {r.designationName && <p className="text-xs text-slate-400 mt-0.5">{r.designationName}</p>}
                </div>
                <span className="text-xs font-mono text-slate-500">{r.staffId}</span>
                <span className="text-xs text-slate-500 truncate">{r.departmentName ?? "—"}</span>
                <span className="text-sm font-semibold text-slate-700 text-center">{r.lecturesAttended}</span>
                <span className="text-sm text-slate-500 text-center">{r.lecturesTotal}</span>
                <div className="flex items-center gap-2">
                  {r.lecturePercentage == null ? (
                    <span className="text-xs text-slate-400">No lectures marked</span>
                  ) : (
                    <>
                      <div className="h-2 flex-1 max-w-[140px] rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full ${r.lecturePercentage >= 90 ? "bg-green-500" : r.lecturePercentage >= 70 ? "bg-blue-500" : "bg-orange-500"}`}
                          style={{ width: `${Math.min(100, r.lecturePercentage)}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-700 w-12">{r.lecturePercentage}%</span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div key={r.employeeId} className={`grid gap-2 px-4 py-2.5 items-center text-sm ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}
                style={{ gridTemplateColumns: "32px 1fr 100px 130px 70px 70px 70px 70px 70px" }}>
                <span className="text-xs text-slate-400 font-mono">{idx + 1}</span>
                <div>
                  <p className="font-medium text-slate-800 leading-tight text-sm">{r.name}</p>
                  {r.designationName && <p className="text-xs text-slate-400 mt-0.5">{r.designationName}</p>}
                </div>
                <span className="text-xs font-mono text-slate-500">{r.staffId}</span>
                <span className="text-xs text-slate-500 truncate">{r.departmentName ?? "—"}</span>
                <span className="text-center"><span className="inline-block min-w-[28px] px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">{r.daysPresent}</span></span>
                <span className="text-center"><span className="inline-block min-w-[28px] px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">{r.daysAbsent}</span></span>
                <span className="text-center"><span className="inline-block min-w-[28px] px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">{r.daysLeave}</span></span>
                <span className="text-center"><span className="inline-block min-w-[28px] px-1.5 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700">{r.daysLate}</span></span>
                <span className="text-center"><span className="inline-block min-w-[28px] px-1.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600">{r.daysOff}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function HRAttendanceTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [view, setView]           = useState<"daily" | "monthly">("daily");
  const [tab, setTab]             = useState<"lecture" | "time">("time");
  const [date, setDate]           = useState(today());
  const [deptFilter, setDeptFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQ, setSearchQ]     = useState("");
  const [sheet, setSheet]         = useState<Record<string, SheetRow>>({});
  const [unsaved, setUnsaved]     = useState(false);
  // Draft lecture marks per employee for the currently selected date. Kept at
  // the page level (not inside rows) so unsaved capsule edits survive
  // tab/view/filter switches; cleared only on date change or successful save.
  const [lectureDrafts, setLectureDrafts] = useState<Record<string, Record<string, boolean>>>({});
  const [savingLectures, setSavingLectures] = useState(false);

  const onLectureDraftChange = useCallback((empId: string, marks: Record<string, boolean>) => {
    setLectureDrafts(d => ({ ...d, [empId]: marks }));
  }, []);

  // Lecture drafts are per-date — changing the date discards them.
  useEffect(() => { setLectureDrafts({}); }, [date]);

  // ── Data fetches ──────────────────────────────────────────────────────────
  const { data: depts } = useListAdminHrDepartments();
  const deptList = Array.isArray(depts) ? (depts as any[]) : [];

  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ["all-employees-attendance"],
    queryFn: () => apiFetch<{ employees: Employee[]; total: number }>("/api/admin/employees?pageSize=500&page=1&status=all"),
  });
  const empList = useMemo(() => (empData?.employees ?? []).filter(e => e.status !== "inactive" && e.status !== "terminated"), [empData]);

  const { data: existingAtt, isLoading: attLoading } = useQuery({
    queryKey: ["hr-attendance-day", date],
    queryFn: () => apiFetch<AttendanceRecord[]>(`/api/admin/hr/attendance?date=${date}`),
  });
  // Saved records keyed by employee — used for early-departure badges and the
  // lecture-based day rollup summary.
  const attByEmp = useMemo(
    () => Object.fromEntries((existingAtt ?? []).map(r => [r.employeeId, r])) as Record<string, AttendanceRecord>,
    [existingAtt],
  );

  // ── Off-day lookup (calendar integration) ────────────────────────────────
  const { data: offDay } = useQuery<{ isOff: boolean; type: string | null; reason: string | null }>({
    queryKey: ["cal-off-day-staff", date],
    queryFn: () => apiFetch(`/api/admin/calendar/off-days?date=${date}&audience=staff`),
    staleTime: 1000 * 60 * 5,
  });

  // ── Rebuild sheet whenever date or employees change ───────────────────────
  useEffect(() => {
    if (!empList.length) return;
    const saved: Record<string, SheetRow> = {};
    (existingAtt ?? []).forEach(r => {
      saved[r.employeeId] = { employeeId: r.employeeId, status: r.status as AttendanceStatus, inTime: r.inTime ?? "", outTime: r.outTime ?? "", notes: r.notes ?? "" };
    });
    const defaultStatus: AttendanceStatus = offDay?.isOff ? "off" : "present";
    const next: Record<string, SheetRow> = {};
    empList.forEach(e => {
      next[e.id] = saved[e.id] ?? { employeeId: e.id, status: defaultStatus, inTime: "", outTime: "", notes: "" };
    });
    setSheet(next);
    setUnsaved(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingAtt, empData, offDay]);

  // ── Save (time-based sheet) ───────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (records: SheetRow[]) =>
      apiFetch<{ saved: number }>("/api/admin/hr/attendance/bulk-save", { method: "POST", body: JSON.stringify({ date, records }) }),
    onSuccess: (res) => {
      toast({ title: `Attendance saved — ${res.saved} records` });
      qc.invalidateQueries({ queryKey: ["hr-attendance-day", date] });
      setUnsaved(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  function handleSaveTimeBased() {
    // Lecture-based teachers are saved per-lecture on their own tab — the day
    // sheet only covers time-based staff.
    const records = empList
      .filter(e => e.attendanceMode !== "lecture_based")
      .map(e => sheet[e.id] ?? { employeeId: e.id, status: "present" as AttendanceStatus, inTime: "", outTime: "", notes: "" });
    if (!records.length) { toast({ title: "No time-based staff to save on this sheet", variant: "destructive" }); return; }
    saveMut.mutate(records);
  }

  // ── Save (lecture tab — saves every drafted employee) ────────────────────
  // Builds each payload from the page-level draft plus the lectures list (from
  // the query cache, refetched if evicted), so saving works even for rows that
  // are currently unmounted (filtered out, other tab, monthly view).
  async function saveLecturesFor(empId: string, draft: Record<string, boolean>) {
    let lectures = qc.getQueryData<LecturesResponse>(["hr-lectures", empId, date])?.lectures;
    if (!lectures) {
      lectures = (await apiFetch<LecturesResponse>(`/api/admin/hr/attendance/lectures?employeeId=${empId}&date=${date}`)).lectures;
    }
    if (!lectures.length) return;
    await apiFetch<{ saved: number }>("/api/admin/hr/attendance/lectures/save", {
      method: "POST",
      body: JSON.stringify({
        employeeId: empId,
        date,
        lectures: lectures.map(l => ({ slotId: l.slotId, periodId: l.periodId, present: !!draft[l.slotId] })),
      }),
    });
  }

  async function handleSaveLectures() {
    const entries = Object.entries(lectureDrafts);
    if (!entries.length) { toast({ title: "No unsaved lecture changes" }); return; }
    setSavingLectures(true);
    try {
      const results = await Promise.allSettled(entries.map(([id, draft]) => saveLecturesFor(id, draft)));
      const savedIds = entries.filter((_, i) => results[i]?.status === "fulfilled").map(([id]) => id);
      const failed = results.filter(r => r.status === "rejected").length;
      // Clear drafts only for the employees that saved successfully.
      setLectureDrafts(d => {
        const next = { ...d };
        savedIds.forEach(id => { delete next[id]; });
        return next;
      });
      qc.invalidateQueries({ queryKey: ["hr-attendance-day", date] });
      savedIds.forEach(id => qc.invalidateQueries({ queryKey: ["hr-lectures", id, date] }));
      if (failed) toast({ title: `Saved ${savedIds.length} of ${entries.length} teachers — ${failed} failed`, variant: "destructive" });
      else toast({ title: `Lecture attendance saved — ${entries.length} teacher${entries.length === 1 ? "" : "s"}` });
    } finally {
      setSavingLectures(false);
    }
  }

  function setStatus(empId: string, status: AttendanceStatus) {
    setSheet(s => ({ ...s, [empId]: { ...s[empId], status } }));
    setUnsaved(true);
  }

  function setTime(empId: string, field: "inTime" | "outTime", val: string) {
    setSheet(s => ({ ...s, [empId]: { ...s[empId], [field]: val } }));
    setUnsaved(true);
  }

  function markAllPresent() {
    setSheet(s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { ...v, status: "present" as AttendanceStatus }])));
    setUnsaved(true);
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  // Department + search only — used for tab badge counts (the status filter
  // must not change the badge totals).
  const baseFiltered = useMemo(() => empList.filter(e => {
    if (deptFilter !== "all" && e.departmentId !== deptFilter) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      const name = e.name ?? e.fullName;
      if (![name, e.staffId, e.role, e.departmentName ?? ""].join(" ").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [empList, deptFilter, searchQ]);

  // Status filter applies on top for the visible table rows.
  const filtered = useMemo(() => baseFiltered.filter(e => {
    if (statusFilter !== "all") {
      const st = e.attendanceMode === "lecture_based"
        ? attByEmp[e.id]?.status
        : (sheet[e.id]?.status ?? "present");
      if (st !== statusFilter) return false;
    }
    return true;
  }), [baseFiltered, statusFilter, sheet, attByEmp]);

  const lectureCount = useMemo(() => baseFiltered.filter(e => e.attendanceMode === "lecture_based").length, [baseFiltered]);
  const timeCount    = useMemo(() => baseFiltered.filter(e => e.attendanceMode !== "lecture_based").length, [baseFiltered]);
  const lectureStaff = useMemo(() => filtered.filter(e => e.attendanceMode === "lecture_based"), [filtered]);
  const timeStaff    = useMemo(() => filtered.filter(e => e.attendanceMode !== "lecture_based"), [filtered]);
  const tabStaff     = tab === "lecture" ? lectureStaff : timeStaff;

  // ── Summary counts (time-based sheet only) ────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, leave: 0, off: 0, late: 0 };
    empList.filter(e => e.attendanceMode !== "lecture_based").forEach(e => {
      const s = sheet[e.id]?.status ?? "present"; c[s] = (c[s] ?? 0) + 1;
    });
    return c;
  }, [empList, sheet]);

  const anyLectureDirty = Object.keys(lectureDrafts).length > 0;
  const isLoading = empLoading || attLoading;
  const isToday   = date === today();

  return (
    <div className="space-y-4">

      {/* ── Off-day banner ── */}
      {view === "daily" && offDay?.isOff && (
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
          <h2 className="text-xl font-semibold text-slate-800">Staff Attendance Register</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {view === "monthly" ? "Monthly attendance summary per employee" : "Mark daily attendance — time-based and lecture-based staff on separate tabs"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Daily / Monthly view toggle */}
          <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
            <button onClick={() => setView("daily")}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === "daily" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
              Daily Register
            </button>
            <button onClick={() => setView("monthly")}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors border-l border-slate-200 ${view === "monthly" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
              Monthly Report
            </button>
          </div>

          {view === "daily" && tab === "time" && (
            <>
              {unsaved && (
                <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-1 rounded-md">
                  Unsaved changes
                </span>
              )}
              <Button variant="outline" size="sm" onClick={markAllPresent} disabled={isLoading}>
                <CheckCheck className="h-4 w-4 mr-1.5" />Mark All Present
              </Button>
              <Button size="sm" onClick={handleSaveTimeBased} disabled={saveMut.isPending || isLoading}>
                {saveMut.isPending
                  ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  : <Save className="h-4 w-4 mr-1.5" />}
                Save Time Based
              </Button>
            </>
          )}
          {view === "daily" && tab === "lecture" && (
            <>
              {anyLectureDirty && (
                <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-1 rounded-md">
                  Unsaved changes
                </span>
              )}
              <Button size="sm" onClick={handleSaveLectures} disabled={savingLectures || isLoading || !anyLectureDirty}>
                {savingLectures
                  ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  : <Save className="h-4 w-4 mr-1.5" />}
                Save Lecture Attendance
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Date navigator + Filters ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {view === "daily" && (
          <>
            {/* Date nav */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
              <button onClick={() => setDate(prevDay(date))}
                className="px-2.5 py-2 hover:bg-slate-50 text-slate-500 border-r border-slate-200 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 px-3">
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="text-sm font-medium text-slate-700 bg-transparent border-0 outline-none cursor-pointer" />
              </div>
              <button onClick={() => setDate(nextDay(date))} disabled={date >= today()}
                className="px-2.5 py-2 hover:bg-slate-50 text-slate-500 border-l border-slate-200 transition-colors disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {!isToday && (
              <button onClick={() => setDate(today())} className="text-xs text-primary underline font-medium">Today</button>
            )}
          </>
        )}

        {/* Department filter */}
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="All departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {deptList.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Status filter (daily only) */}
        {view === "daily" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Search by name, ID, role…" className="pl-8 h-9 text-sm" />
        </div>

        {view === "daily" && (
          <span className="text-xs text-slate-400 ml-auto">{filtered.length} of {empList.length} staff</span>
        )}
      </div>

      {/* ── Mode tabs ── */}
      <div className="flex gap-1 border-b border-slate-200">
        <button onClick={() => setTab("lecture")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === "lecture" ? "border-indigo-500 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}>
          <GraduationCap className="h-4 w-4" />
          Lecture Based Attendance
          <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${tab === "lecture" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
            {lectureCount}
          </span>
        </button>
        <button onClick={() => setTab("time")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === "time" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}>
          <Clock className="h-4 w-4" />
          Time Based Attendance
          <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${tab === "time" ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
            {timeCount}
          </span>
        </button>
      </div>

      {view === "monthly" ? (
        <MonthlyReport tab={tab} deptFilter={deptFilter} searchQ={searchQ} />
      ) : (
        <>
          {/* ── Summary chips (time-based tab only) ── */}
          {tab === "time" && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setStatusFilter("all")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${statusFilter === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400"}`}>
                <Users className="h-3.5 w-3.5" /><span className="font-bold text-sm">{empList.filter(e => e.attendanceMode !== "lecture_based").length}</span> Total
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
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            {/* Table header */}
            {tab === "lecture" ? (
              <div className="grid gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide"
                style={{ gridTemplateColumns: "32px 1fr 100px 130px 2fr 170px" }}>
                <span>#</span>
                <span>Teacher</span>
                <span>Staff ID</span>
                <span>Department</span>
                <span>Lectures — click to toggle</span>
                <span className="text-right">Summary</span>
              </div>
            ) : (
              <div className="grid gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide"
                style={{ gridTemplateColumns: "32px 1fr 100px 130px 1fr 90px 90px" }}>
                <span>#</span>
                <span>Employee</span>
                <span>Staff ID</span>
                <span>Department</span>
                <span>Status</span>
                <span>In Time</span>
                <span>Out Time</span>
              </div>
            )}

            {/* Rows */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading employees…</span>
              </div>
            ) : tabStaff.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <Users className="h-7 w-7 text-slate-300" />
                </div>
                <p className="text-sm font-medium">No {tab === "lecture" ? "lecture-based" : "time-based"} staff match your filters</p>
                <button onClick={() => { setDeptFilter("all"); setStatusFilter("all"); setSearchQ(""); }}
                  className="text-xs text-primary underline">Clear filters</button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {tab === "lecture"
                  ? tabStaff.map((emp, idx) => (
                      <LectureAttendanceRow key={`${emp.id}-${date}`} emp={emp} idx={idx} date={date}
                        rollup={attByEmp[emp.id]}
                        draft={lectureDrafts[emp.id]}
                        onDraftChange={onLectureDraftChange}
                        saving={savingLectures} />
                    ))
                  : tabStaff.map((emp, idx) => {
                      const row = sheet[emp.id] ?? { employeeId: emp.id, status: "present" as AttendanceStatus, inTime: "", outTime: "", notes: "" };
                      const statusInfo = STATUS_MAP[row.status];
                      const leftEarly = attByEmp[emp.id]?.earlyDeparture;
                      return (
                        <div key={emp.id}
                          className={`grid gap-2 px-4 py-2 items-center text-sm transition-colors hover:brightness-95 ${statusInfo?.row || (idx % 2 === 0 ? "bg-white" : "bg-slate-50/30")}`}
                          style={{ gridTemplateColumns: "32px 1fr 100px 130px 1fr 90px 90px" }}>
                          <span className="text-xs text-slate-400 font-mono">{idx + 1}</span>
                          <div>
                            <p className="font-medium text-slate-800 leading-tight text-sm">{emp.name ?? emp.fullName}</p>
                            <p className="text-xs text-slate-400 capitalize mt-0.5">{emp.role?.replace(/_/g, " ")}{emp.designationName ? ` · ${emp.designationName}` : ""}</p>
                          </div>
                          <span className="text-xs font-mono text-slate-500">{emp.staffId}</span>
                          <span className="text-xs text-slate-500 truncate">{emp.departmentName ?? "—"}</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusToggle value={row.status} onChange={s => setStatus(emp.id, s)} />
                            {leftEarly && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">Left early</span>
                            )}
                          </div>
                          <input
                            type="time" value={row.inTime}
                            onChange={e => setTime(emp.id, "inTime", e.target.value)}
                            className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <input
                            type="time" value={row.outTime}
                            onChange={e => setTime(emp.id, "outTime", e.target.value)}
                            className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      );
                    })}
              </div>
            )}

            {/* Footer */}
            {!isLoading && tabStaff.length > 0 && (
              <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {fmtDate(date)} · {tabStaff.length} {tab === "lecture" ? "lecture-based" : "time-based"} staff
                </span>
                {tab === "time" ? (
                  <Button size="sm" onClick={handleSaveTimeBased} disabled={saveMut.isPending}>
                    {saveMut.isPending
                      ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                    Save Time Based
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleSaveLectures} disabled={savingLectures || !anyLectureDirty}>
                    {savingLectures
                      ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                    Save Lecture Attendance
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
