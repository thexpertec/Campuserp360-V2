import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { formatDate } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Wand2, Shuffle, Trash2, CalendarDays, X,
  LayoutGrid, Calendar, BanIcon, Layers, CheckCircle2, AlertTriangle,
  ChevronLeft, ChevronRight, Palmtree, Moon,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Period { id: string; name: string; startTime: string; endTime: string; periodType: string; sortOrder: number }
interface Slot { id: string; classCode: string; dayOfWeek: number; periodId: string; subjectName?: string; subjectCode?: string; teacherName?: string }
interface ClassRecord { id: string; code: string; name: string }
interface ClassSubject { subjectId: string; subjectName: string; subjectCode: string; periodsPerWeek: number }
interface TeacherAssignment { id: string; employeeId: string; classId: string; subjectId: string; subjectName: string; teacherName?: string }
interface DayOffInfo { date: string; dayOfWeek: number; isOff: boolean; type: "weekend" | "holiday" | null; reason: string | null }

// ── Constants ─────────────────────────────────────────────────────────────────
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const OFF_SENTINEL = "OFF";
const PX_PER_MIN = 2; // calendar view: pixels per minute

const COLORS = [
  "bg-blue-100 text-blue-800 border-blue-200",
  "bg-emerald-100 text-emerald-800 border-emerald-200",
  "bg-violet-100 text-violet-800 border-violet-200",
  "bg-orange-100 text-orange-800 border-orange-200",
  "bg-teal-100 text-teal-800 border-teal-200",
  "bg-pink-100 text-pink-800 border-pink-200",
  "bg-indigo-100 text-indigo-800 border-indigo-200",
  "bg-amber-100 text-amber-800 border-amber-200",
  "bg-cyan-100 text-cyan-800 border-cyan-200",
  "bg-red-100 text-red-800 border-red-200",
  "bg-lime-100 text-lime-800 border-lime-200",
  "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
];
// Raw bg-only colors for the calendar view (without border/text classes)
const CAL_COLORS = [
  "bg-blue-200", "bg-emerald-200", "bg-violet-200", "bg-orange-200",
  "bg-teal-200", "bg-pink-200", "bg-indigo-200", "bg-amber-200",
  "bg-cyan-200", "bg-red-200", "bg-lime-200", "bg-fuchsia-200",
];

// ── Date helpers ───────────────────────────────────────────────────────────────
// Format a Date using its LOCAL year/month/day (avoids UTC-offset slippage from toISOString)
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMondayOfWeek(d: Date): string {
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return localDateStr(monday);
}

function addDays(dateStr: string, n: number): string {
  const [y, m, day] = dateStr.split("-").map(Number);
  const d = new Date(y, m - 1, day + n);
  return localDateStr(d);
}

function fmtShortDate(dateStr: string): string {
  return formatDate(dateStr + "T00:00:00");
}

function fmtWeekLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  return `${formatDate(monday + "T00:00:00")} – ${formatDate(sunday + "T00:00:00")}`;
}

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

function fmtTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function durationMin(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

// ── Holiday/weekend column header badge ───────────────────────────────────────
function DayOffBadge({ info }: { info: DayOffInfo }) {
  if (!info.isOff) return null;
  if (info.type === "weekend") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500 font-medium leading-none">
        <Moon className="h-2.5 w-2.5" />Weekend
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium leading-none max-w-[80px] truncate" title={info.reason ?? ""}>
      <Palmtree className="h-2.5 w-2.5 flex-shrink-0" />
      <span className="truncate">{info.reason}</span>
    </span>
  );
}

// ── Holiday full-column overlay ────────────────────────────────────────────────
function HolidayOverlay({ info, height }: { info: DayOffInfo; height: number }) {
  const isWeekend = info.type === "weekend";
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none ${
        isWeekend ? "bg-slate-100/80" : "bg-amber-50/80"
      }`}
      style={{ height }}>
      {isWeekend
        ? <Moon className="h-5 w-5 text-slate-300" />
        : <Palmtree className="h-5 w-5 text-amber-300" />}
      <span className={`text-[10px] font-medium text-center px-1 leading-tight ${isWeekend ? "text-slate-400" : "text-amber-500"}`}>
        {info.reason}
      </span>
    </div>
  );
}

// ── Cell editor popover ───────────────────────────────────────────────────────
function CellEditor({
  classCode, dayOfWeek, period, slot, classSubjects, teacherAssignments,
  onSave, onOff, onClear, onClose,
}: {
  classCode: string; dayOfWeek: number; period: Period;
  slot?: Slot; classSubjects: ClassSubject[]; teacherAssignments: TeacherAssignment[];
  onSave: (data: { subjectName: string; subjectCode: string; teacherName: string }) => void;
  onOff: () => void; onClear: () => void; onClose: () => void;
}) {
  const isOff = slot?.subjectName === OFF_SENTINEL;
  const [subjectId, setSubjectId] = useState(
    isOff ? "" : (classSubjects.find(s => s.subjectName === slot?.subjectName)?.subjectId ?? "")
  );
  const [teacherName, setTeacherName] = useState(isOff ? "" : (slot?.teacherName ?? ""));

  const selectedSubject = classSubjects.find(s => s.subjectId === subjectId);
  const filteredTeachers = useMemo(() => {
    const seen = new Set<string>();
    return teacherAssignments.filter(t => {
      if (subjectId && t.subjectId !== subjectId) return false;
      if (!t.teacherName) return false;
      if (seen.has(t.employeeId)) return false;
      seen.add(t.employeeId);
      return true;
    });
  }, [teacherAssignments, subjectId]);

  return (
    <div className="absolute z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-72"
      style={{ top: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)" }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold text-slate-700">{DAYS[dayOfWeek - 1]} · {period.name}</p>
          <p className="text-xs text-slate-400">{fmtTime(period.startTime)} – {fmtTime(period.endTime)}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
      </div>

      <div className="space-y-2.5">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Subject</label>
          <Select value={subjectId} onValueChange={v => { setSubjectId(v); setTeacherName(""); }}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select subject…" />
            </SelectTrigger>
            <SelectContent>
              {classSubjects.filter(s => !!s.subjectId).map(s => (
                <SelectItem key={s.subjectId} value={s.subjectId}>{s.subjectName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Teacher</label>
          <Select value={teacherName || "__none__"} onValueChange={v => setTeacherName(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={filteredTeachers.length ? "Select teacher…" : "No teacher assigned"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— None —</SelectItem>
              {filteredTeachers.filter(t => !!t.teacherName).map(t => (
                <SelectItem key={t.employeeId} value={t.teacherName!}>{t.teacherName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={() => selectedSubject && onSave({ subjectName: selectedSubject.subjectName, subjectCode: selectedSubject.subjectCode, teacherName })}
          disabled={!subjectId} className="flex-1">Save</Button>
        <Button size="sm" variant="outline" onClick={onOff}
          className="text-slate-500 border-slate-200" title="Mark as OFF">
          <BanIcon className="h-3.5 w-3.5" />
        </Button>
        {slot && (
          <Button size="sm" variant="outline" onClick={onClear}
            className="text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Calendar view ──────────────────────────────────────────────────────────────
function CalendarView({
  periods, slotMap, classSubjects, subjectColorMap, activeDayNums, dayOffMap, calOffDayMap,
  onCellClick, onToggleDayOff,
}: {
  periods: Period[];
  slotMap: Record<string, Slot>;
  classSubjects: ClassSubject[];
  subjectColorMap: Record<string, string>;
  activeDayNums: number[];
  dayOffMap: Record<number, boolean>;
  calOffDayMap: Record<number, DayOffInfo>;
  onCellClick: (day: number, period: Period) => void;
  onToggleDayOff: (day: number) => void;
}) {
  const lecturePeriods = periods.filter(p => p.periodType === "lecture");
  const subjectList = classSubjects.map(s => s.subjectName);

  // Total pixel height for overlay
  const totalH = periods.reduce((acc, p) => acc + Math.max(durationMin(p.startTime, p.endTime) * PX_PER_MIN, 28), 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <div className="flex" style={{ minWidth: 780 }}>
        {/* Time axis */}
        <div className="flex-shrink-0 w-20 border-r border-slate-200">
          {/* Header spacer */}
          <div className="h-14 border-b border-slate-200 bg-slate-50" />
          {periods.map(p => {
            const dur = durationMin(p.startTime, p.endTime);
            const h = Math.max(dur * PX_PER_MIN, 28);
            const isBreak = p.periodType !== "lecture";
            return (
              <div key={p.id} style={{ height: h }}
                className={`border-b border-slate-100 flex flex-col justify-between px-2 py-1 ${isBreak ? "bg-slate-50/60" : ""}`}>
                <span className="text-xs text-slate-400 font-medium leading-none">{fmtTime(p.startTime)}</span>
                <span className="text-xs text-slate-300 leading-none">{isBreak ? p.name : ""}</span>
              </div>
            );
          })}
        </div>

        {/* Day columns */}
        {DAYS.map((dayName, idx) => {
          const dayNum = idx + 1;
          const isDayOff = dayOffMap[dayNum] ?? false;
          const calInfo = calOffDayMap[dayNum];
          const isCalOff = calInfo?.isOff ?? false;
          const isWeekend = calInfo?.type === "weekend";
          const isHoliday = calInfo?.type === "holiday";

          return (
            <div key={dayName} className="flex-1 border-r border-slate-200 last:border-r-0 min-w-0">
              {/* Day header */}
              <div className={`h-14 border-b border-slate-200 flex flex-col items-center justify-center gap-0.5 relative group ${
                isWeekend ? "bg-slate-100" : isHoliday ? "bg-amber-50" : isDayOff ? "bg-slate-100" : "bg-slate-50 hover:bg-slate-100/70"
              }`}>
                <span className={`text-xs font-bold uppercase tracking-wide ${isCalOff || isDayOff ? "text-slate-400" : "text-slate-600"}`}>
                  {DAY_SHORT[idx]}
                </span>
                {calInfo && <DayOffBadge info={calInfo} />}
                {!isCalOff && (
                  <button
                    onClick={() => onToggleDayOff(dayNum)}
                    className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                      isDayOff
                        ? "bg-red-100 text-red-600 hover:bg-red-200"
                        : "bg-white border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                    }`}>
                    {isDayOff ? "Day Off ✕" : "Set Off"}
                  </button>
                )}
              </div>

              {/* Period rows — with holiday/weekend overlay */}
              <div className="relative">
                {isCalOff && (
                  <HolidayOverlay info={calInfo} height={totalH} />
                )}
                {periods.map(p => {
                  const dur = durationMin(p.startTime, p.endTime);
                  const h = Math.max(dur * PX_PER_MIN, 28);
                  const isBreak = p.periodType !== "lecture";
                  const slot = slotMap[`${dayNum}:${p.id}`];
                  const isOff = isDayOff || slot?.subjectName === OFF_SENTINEL;
                  const colorIdx = slot?.subjectName ? subjectList.indexOf(slot.subjectName) : -1;
                  const calColor = colorIdx >= 0 ? CAL_COLORS[colorIdx % CAL_COLORS.length] : "";

                  return (
                    <div key={p.id} style={{ height: h }}
                      className={`border-b border-slate-100 relative transition-colors ${
                        isBreak
                          ? isCalOff ? (isWeekend ? "bg-slate-100/60" : "bg-amber-50/60") : "bg-slate-50/60"
                          : isCalOff
                          ? (isWeekend ? "bg-slate-100" : "bg-amber-50")
                          : isOff
                          ? "bg-slate-100"
                          : slot && slot.subjectName !== OFF_SENTINEL
                          ? `${calColor} cursor-pointer`
                          : "hover:bg-primary/5 cursor-pointer"
                      }`}
                      onClick={() => !isBreak && !isDayOff && !isCalOff && onCellClick(dayNum, p)}>
                      {!isBreak && isOff && !isCalOff && (
                        <div className="h-full flex items-center justify-center">
                          <BanIcon className="h-4 w-4 text-slate-300" />
                        </div>
                      )}
                      {!isBreak && !isOff && !isCalOff && slot && slot.subjectName !== OFF_SENTINEL && (
                        <div className="h-full px-1.5 py-1 overflow-hidden flex flex-col gap-0.5">
                          <p className="text-xs font-semibold leading-tight truncate text-slate-800">{slot.subjectName}</p>
                          <p className="text-xs leading-tight truncate text-slate-600 opacity-70">
                            {slot.teacherName ?? <span className="italic">No teacher</span>}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function TimetableGridTab({ classId: externalClassId, onClassChange }: { classId?: string; onClassChange?: (id: string) => void } = {}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedClassId, setSelectedClassId] = useState(externalClassId ?? "");
  const [editCell, setEditCell] = useState<{ day: number; periodId: string } | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "calendar">("grid");
  const [activeDays, setActiveDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [genAllOpen, setGenAllOpen] = useState(false);
  const [genAllResult, setGenAllResult] = useState<{ classes: { classId: string; className: string; generated: number; unplaced: number; skipped?: string }[]; totalGenerated: number; totalUnplaced: number } | null>(null);
  const [weekStart, setWeekStart] = useState<string>(() => getMondayOfWeek(new Date()));

  useEffect(() => {
    if (externalClassId && externalClassId !== selectedClassId) {
      setSelectedClassId(externalClassId);
      setEditCell(null);
    }
  }, [externalClassId]);

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data: classesData } = useQuery({
    queryKey: ["all-classes-grid"],
    queryFn: () => apiFetch<any>("/api/admin/classes?pageSize=200"),
  });
  const classes: ClassRecord[] = useMemo(() => {
    const d = classesData as any;
    return Array.isArray(d?.classes) ? d.classes : Array.isArray(d) ? d : [];
  }, [classesData]);
  const selectedClass = classes.find(c => c.id === selectedClassId);

  const { data: periods } = useQuery({
    queryKey: ["timetable-periods"],
    queryFn: () => apiFetch<Period[]>("/api/admin/timetable/periods"),
  });
  const periodList: Period[] = useMemo(() =>
    (Array.isArray(periods) ? periods : []).sort((a, b) => a.sortOrder - b.sortOrder),
    [periods]
  );

  const { data: slots, isLoading: slotsLoading } = useQuery({
    queryKey: ["timetable-slots", selectedClass?.code],
    queryFn: () => apiFetch<Slot[]>(`/api/admin/timetable/slots?classCode=${selectedClass!.code}`),
    enabled: !!selectedClass,
  });

  const { data: classSubjectsData } = useQuery({
    queryKey: ["class-subjects-grid", selectedClassId],
    queryFn: () => apiFetch<ClassSubject[]>(`/api/admin/timetable/class-subjects?classId=${selectedClassId}`),
    enabled: !!selectedClassId,
  });
  const { data: teacherAssignmentsData } = useQuery({
    queryKey: ["teacher-assignments-grid", selectedClassId],
    queryFn: () => apiFetch<TeacherAssignment[]>(`/api/admin/timetable/teacher-assignments?classId=${selectedClassId}`),
    enabled: !!selectedClassId,
  });

  // ── Calendar off-days for the selected week ───────────────────────────────
  // Issue 7 parallel requests to the existing /off-days endpoint (one per day).
  const { data: weekOffDaysData } = useQuery({
    queryKey: ["timetable-week-off-days", weekStart],
    queryFn: async (): Promise<DayOffInfo[]> => {
      const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      const results = await Promise.all(
        dates.map(date =>
          apiFetch<{ isOff: boolean; type: string | null; reason: string | null }>(
            `/api/admin/calendar/off-days?date=${date}&audience=students`,
          ),
        ),
      );
      return dates.map((date, idx) => ({
        date,
        dayOfWeek: idx + 1,
        isOff: results[idx].isOff,
        type: results[idx].type as "weekend" | "holiday" | null,
        reason: results[idx].reason,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  // Map dayOfWeek (1=Mon … 7=Sun) → DayOffInfo
  const calOffDayMap = useMemo<Record<number, DayOffInfo>>(() => {
    const map: Record<number, DayOffInfo> = {};
    (weekOffDaysData ?? []).forEach(d => { map[d.dayOfWeek] = d; });
    return map;
  }, [weekOffDaysData]);

  // Dates for each column header (Mon … Sun of selected week)
  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const classSubjects: ClassSubject[] = Array.isArray(classSubjectsData) ? classSubjectsData : [];
  const teacherAssignments: TeacherAssignment[] = Array.isArray(teacherAssignmentsData) ? teacherAssignmentsData : [];

  // ── Derived maps ──────────────────────────────────────────────────────
  const subjectColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    classSubjects.forEach((s, i) => { map[s.subjectName] = COLORS[i % COLORS.length]; });
    return map;
  }, [classSubjects]);

  const slotMap = useMemo(() => {
    const map: Record<string, Slot> = {};
    (slots ?? []).forEach(s => { map[`${s.dayOfWeek}:${s.periodId}`] = s; });
    return map;
  }, [slots]);

  // dayOffMap: day is "off" if ALL lecture periods are OFF slots
  const dayOffMap = useMemo(() => {
    const map: Record<number, boolean> = {};
    const lecturePeriods = periodList.filter(p => p.periodType === "lecture");
    for (let d = 1; d <= 7; d++) {
      if (!lecturePeriods.length) { map[d] = false; continue; }
      map[d] = lecturePeriods.length > 0 && lecturePeriods.every(p => slotMap[`${d}:${p.id}`]?.subjectName === OFF_SENTINEL);
    }
    return map;
  }, [slotMap, periodList]);

  // ── Mutations ─────────────────────────────────────────────────────────
  const generateAllMut = useMutation({
    mutationFn: () => apiFetch<{ classes: any[]; totalGenerated: number; totalUnplaced: number }>("/api/admin/timetable/auto-generate-all", {
      method: "POST",
      body: JSON.stringify({ activeDays }),
    }),
    onSuccess: r => {
      setGenAllResult(r);
      qc.invalidateQueries({ queryKey: ["timetable-slots"] });
      toast({ title: `Generated timetable for ${r.classes.filter((c: any) => !c.skipped).length} classes — ${r.totalGenerated} slots total` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const generateMut = useMutation({
    mutationFn: () => apiFetch<{ generated: number; unplaced: number }>("/api/admin/timetable/auto-generate", {
      method: "POST",
      body: JSON.stringify({ classId: selectedClassId, activeDays }),
    }),
    onSuccess: (r) => {
      toast({ title: `Generated ${r.generated} slots${r.unplaced ? ` · ${r.unplaced} periods couldn't fit` : ""}` });
      qc.invalidateQueries({ queryKey: ["timetable-slots", selectedClass?.code] });
      setEditCell(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const upsertMut = useMutation({
    mutationFn: (data: any) => apiFetch<Slot>("/api/admin/timetable/slots/upsert", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["timetable-slots", selectedClass?.code] }); setEditCell(null); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch<{ success: boolean }>(`/api/admin/timetable/slots/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["timetable-slots", selectedClass?.code] }); setEditCell(null); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const clearAllMut = useMutation({
    mutationFn: () => apiFetch<{ success: boolean }>(`/api/admin/timetable/slots?classCode=${selectedClass!.code}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Timetable cleared" }); qc.invalidateQueries({ queryKey: ["timetable-slots", selectedClass?.code] }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  // ── Toggle a full day as OFF/ON ───────────────────────────────────────
  const toggleDayOff = useCallback(async (dayNum: number) => {
    if (!selectedClass) return;
    const lecturePeriods = periodList.filter(p => p.periodType === "lecture");
    const isCurrentlyOff = dayOffMap[dayNum];
    if (isCurrentlyOff) {
      // Clear all slots for this day (remove OFF markers)
      const daySlots = (slots ?? []).filter(s => s.dayOfWeek === dayNum);
      await Promise.all(daySlots.map(s => apiFetch(`/api/admin/timetable/slots/${s.id}`, { method: "DELETE" })));
    } else {
      // Mark all lecture periods as OFF
      await Promise.all(
        lecturePeriods.map(p =>
          apiFetch("/api/admin/timetable/slots/upsert", {
            method: "PUT",
            body: JSON.stringify({ classCode: selectedClass.code, dayOfWeek: dayNum, periodId: p.id, subjectName: OFF_SENTINEL }),
          })
        )
      );
    }
    qc.invalidateQueries({ queryKey: ["timetable-slots", selectedClass.code] });
  }, [selectedClass, periodList, dayOffMap, slots, qc]);

  const toggleActiveDay = (d: number) => {
    setActiveDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  };

  const hasSlots = (slots ?? []).length > 0;
  const lecturePeriodCount = periodList.filter(p => p.periodType === "lecture").length;

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedClassId} onValueChange={v => { setSelectedClassId(v); setEditCell(null); onClassChange?.(v); }}>
          <SelectTrigger className="h-9 w-48 text-sm">
            <SelectValue placeholder="Select class…" />
          </SelectTrigger>
          <SelectContent>
            {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* View mode toggle */}
        {selectedClassId && (
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
            <button onClick={() => setViewMode("grid")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "grid" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"}`}>
              <LayoutGrid className="h-3.5 w-3.5" />Grid
            </button>
            <button onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "calendar" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"}`}>
              <Calendar className="h-3.5 w-3.5" />Calendar
            </button>
          </div>
        )}

        {selectedClassId && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => generateMut.mutate()} disabled={generateMut.isPending || !activeDays.length}>
              {generateMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1.5" />}
              Auto-Generate
            </Button>
            {hasSlots && (
              <>
                <Button size="sm" variant="outline" onClick={() => generateMut.mutate()} disabled={generateMut.isPending}>
                  <Shuffle className="h-4 w-4 mr-1.5" />Reshuffle
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                  onClick={() => { if (confirm("Clear entire timetable for this class?")) clearAllMut.mutate(); }}
                  disabled={clearAllMut.isPending}>
                  <Trash2 className="h-4 w-4 mr-1.5" />Clear All
                </Button>
              </>
            )}
          </div>
        )}

        {/* Generate All button — always visible on this tab */}
        <Button
          size="sm" variant="outline"
          className="ml-auto border-primary/30 text-primary hover:bg-primary/5"
          onClick={() => { setGenAllOpen(true); setGenAllResult(null); }}
          disabled={generateAllMut.isPending}>
          {generateAllMut.isPending
            ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            : <Layers className="h-4 w-4 mr-1.5" />}
          Generate All Classes
        </Button>

        {selectedClass && !slotsLoading && (
          <span className="text-xs text-slate-400 ml-auto">
            {(slots ?? []).filter(s => s.subjectName !== OFF_SENTINEL).length} slots · {activeDays.length * lecturePeriodCount} capacity
          </span>
        )}
      </div>

      {/* ── Week navigator ── */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 w-7 p-0"
          onClick={() => setWeekStart(prev => addDays(prev, -7))}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-medium text-slate-600 min-w-[180px] text-center">{fmtWeekLabel(weekStart)}</span>
        <Button size="sm" variant="outline" className="h-7 w-7 p-0"
          onClick={() => setWeekStart(prev => addDays(prev, 7))}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 px-2"
          onClick={() => setWeekStart(getMondayOfWeek(new Date()))}>
          Today
        </Button>
        <span className="text-xs text-slate-400 ml-1 flex items-center gap-1.5">
          <Moon className="h-3 w-3 text-slate-400" /><span>Weekend</span>
          <Palmtree className="h-3 w-3 text-amber-400 ml-1" /><span>Holiday</span>
        </span>
      </div>

      {/* ── Active days selector ── */}
      {selectedClassId && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 font-medium">Auto-generate days:</span>
          {DAYS.map((d, i) => {
            const num = i + 1;
            const on = activeDays.includes(num);
            return (
              <button key={d} onClick={() => toggleActiveDay(num)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  on
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
                }`}>
                {DAY_SHORT[i]}
              </button>
            );
          })}
          <span className="text-xs text-slate-400">· Click day headers to mark as OFF</span>
        </div>
      )}

      {/* ── Generate All panel ── */}
      {genAllOpen && !genAllResult && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-4">
          <Layers className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-slate-800 text-sm">Generate timetable for all classes</p>
            <p className="text-xs text-slate-500 mt-0.5">
              This will auto-generate slots for every class using the days selected above.
              Existing slots on those days will be replaced.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Button size="sm"
                onClick={() => generateAllMut.mutate()}
                disabled={generateAllMut.isPending || !activeDays.length}>
                {generateAllMut.isPending
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <Layers className="h-3.5 w-3.5 mr-1.5" />}
                {generateAllMut.isPending ? "Generating…" : "Yes, generate all"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setGenAllOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate All results ── */}
      {genAllResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="font-semibold text-sm text-slate-800">
                Generated {genAllResult.totalGenerated} slots across {genAllResult.classes.filter(c => !c.skipped).length} classes
              </span>
              {genAllResult.totalUnplaced > 0 && (
                <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-xs">
                  {genAllResult.totalUnplaced} unplaced
                </Badge>
              )}
            </div>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setGenAllOpen(false); setGenAllResult(null); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
            {genAllResult.classes.map(c => (
              <div key={c.classId}
                className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${
                  c.skipped
                    ? "bg-slate-50 border-slate-200 text-slate-400"
                    : "bg-white border-emerald-200 text-slate-700 cursor-pointer hover:bg-emerald-50"
                }`}
                onClick={c.skipped ? undefined : () => {
                  setSelectedClassId(c.classId);
                  onClassChange?.(c.classId);
                  setEditCell(null);
                  setGenAllResult(null);
                }}>
                {c.skipped
                  ? <AlertTriangle className="h-3 w-3 flex-shrink-0 text-slate-400" />
                  : <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-emerald-500" />}
                <span className="truncate font-medium">{c.className}</span>
                {!c.skipped && <span className="text-slate-400 flex-shrink-0">{c.generated}s</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty / loading state ── */}
      {!selectedClassId ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
          <div className="h-16 w-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
            <CalendarDays className="h-8 w-8 text-slate-300" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500">Select a class to view its timetable</p>
            <p className="text-xs text-slate-400 mt-1">Auto-Generate fills the week; click any cell to assign manually</p>
          </div>
        </div>
      ) : slotsLoading ? (
        <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
          <Loader2 className="h-6 w-6 animate-spin" /><span>Loading timetable…</span>
        </div>
      ) : periodList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 flex flex-col items-center justify-center py-12 gap-2 text-amber-700">
          <p className="text-sm font-medium">No periods defined yet</p>
          <p className="text-xs text-amber-600">Go to Period Setup to define the daily schedule structure first</p>
        </div>
      ) : viewMode === "calendar" ? (
        <CalendarView
          periods={periodList}
          slotMap={slotMap}
          classSubjects={classSubjects}
          subjectColorMap={subjectColorMap}
          activeDayNums={activeDays}
          dayOffMap={dayOffMap}
          calOffDayMap={calOffDayMap}
          onCellClick={(day, period) => setEditCell({ day, periodId: period.id })}
          onToggleDayOff={toggleDayOff}
        />
      ) : (
        /* ── Grid view ── */
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 840 }}>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28 border-r border-slate-200">Period</th>
                {DAYS.map((d, i) => {
                  const dayNum = i + 1;
                  const isOff = dayOffMap[dayNum];
                  const calInfo = calOffDayMap[dayNum];
                  const isCalOff = calInfo?.isOff ?? false;
                  const isWeekend = calInfo?.type === "weekend";
                  const isHoliday = calInfo?.type === "holiday";
                  return (
                    <th key={d} className={`px-2 py-1.5 text-center border-l border-slate-200 ${isWeekend ? "bg-slate-100" : isHoliday ? "bg-amber-50" : isOff ? "bg-slate-100" : ""}`}>
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${isCalOff || isOff ? "text-slate-400" : "text-slate-500"}`}>
                          <span className="hidden md:inline">{d}</span>
                          <span className="md:hidden">{DAY_SHORT[i]}</span>
                        </span>
                        <span className="text-[10px] text-slate-400">{fmtShortDate(weekDates[i])}</span>
                        {calInfo?.isOff
                          ? <DayOffBadge info={calInfo} />
                          : (
                            <button
                              onClick={() => toggleDayOff(dayNum)}
                              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                                isOff
                                  ? "bg-red-100 text-red-600 hover:bg-red-200 border border-red-200"
                                  : "bg-white text-slate-400 border border-slate-200 hover:border-red-300 hover:text-red-500"
                              }`}>
                              {isOff ? "Day Off ✕" : "Set Off"}
                            </button>
                          )
                        }
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {periodList.map((period, pIdx) => {
                const isBreak = period.periodType !== "lecture";
                if (isBreak) {
                  return (
                    <tr key={period.id} className="border-b border-slate-100">
                      <td colSpan={8} className="px-4 py-1 bg-slate-50/80 text-center border-r border-slate-100">
                        <span className="text-xs text-slate-400 font-medium">
                          {period.name} · {fmtTime(period.startTime)} – {fmtTime(period.endTime)}
                        </span>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={period.id} className={`border-b border-slate-100 ${pIdx % 2 === 0 ? "" : "bg-slate-50/30"}`}>
                    {/* Period label */}
                    <td className="px-3 py-2 border-r border-slate-200 align-top">
                      <p className="text-xs font-semibold text-slate-700">{period.name}</p>
                      <p className="text-xs text-slate-400">{fmtTime(period.startTime)}</p>
                    </td>
                    {/* Day cells */}
                    {[1, 2, 3, 4, 5, 6, 7].map(day => {
                      const key = `${day}:${period.id}`;
                      const slot = slotMap[key];
                      const isOff = dayOffMap[day] || slot?.subjectName === OFF_SENTINEL;
                      const isEditing = editCell?.day === day && editCell?.periodId === period.id;
                      const color = slot?.subjectName && slot.subjectName !== OFF_SENTINEL ? (subjectColorMap[slot.subjectName] ?? COLORS[0]) : "";
                      const calInfo = calOffDayMap[day];
                      const isCalOff = calInfo?.isOff ?? false;
                      const isWeekend = calInfo?.type === "weekend";
                      const isHoliday = calInfo?.type === "holiday";

                      if (isCalOff) {
                        // Show a full holiday/weekend overlay for the entire cell
                        return (
                          <td key={day} className={`px-1.5 py-1.5 border-l border-slate-100 align-top ${isWeekend ? "bg-slate-100/60" : "bg-amber-50/60"}`}>
                            <div className={`min-h-[68px] rounded-lg border flex flex-col items-center justify-center gap-1 ${
                              isWeekend ? "border-slate-200 bg-slate-100" : "border-amber-100 bg-amber-50"
                            }`}>
                              {isWeekend
                                ? <Moon className="h-4 w-4 text-slate-300" />
                                : <Palmtree className="h-4 w-4 text-amber-300" />}
                              <span className={`text-[10px] font-medium text-center px-1 leading-tight ${isWeekend ? "text-slate-400" : "text-amber-500"}`}>
                                {calInfo.reason}
                              </span>
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td key={day} className={`px-1.5 py-1.5 border-l border-slate-100 align-top relative ${dayOffMap[day] ? "bg-slate-100/60" : ""}`}>
                          <div className="relative">
                            <button
                              onClick={() => !dayOffMap[day] && setEditCell(isEditing ? null : { day, periodId: period.id })}
                              disabled={dayOffMap[day]}
                              className={`w-full min-h-[68px] rounded-lg border text-left px-2.5 py-2 transition-all text-xs ${
                                isOff && !dayOffMap[day]
                                  ? "border-slate-200 bg-slate-100 text-slate-400 cursor-pointer hover:bg-slate-200"
                                  : dayOffMap[day]
                                  ? "border-transparent bg-transparent cursor-not-allowed"
                                  : slot
                                  ? `${color} hover:brightness-95 cursor-pointer`
                                  : "border-dashed border-slate-200 bg-white hover:border-primary hover:bg-primary/5 text-slate-300 hover:text-primary cursor-pointer"
                              } ${isEditing ? "ring-2 ring-primary" : ""}`}>
                              {isOff && !dayOffMap[day] ? (
                                <div className="flex items-center gap-1.5 h-full justify-center opacity-50">
                                  <BanIcon className="h-4 w-4" />
                                  <span className="font-medium">OFF</span>
                                </div>
                              ) : dayOffMap[day] ? null : slot ? (
                                <div className="flex flex-col gap-1">
                                  <p className="font-semibold text-xs leading-tight">{slot.subjectName}</p>
                                  <p className="text-xs leading-tight opacity-65 truncate">
                                    {slot.teacherName ?? <span className="italic">No teacher</span>}
                                  </p>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center h-full opacity-40">
                                  <span className="text-lg leading-none">+</span>
                                </div>
                              )}
                            </button>

                            {/* Popover */}
                            {isEditing && (
                              <CellEditor
                                classCode={selectedClass!.code}
                                dayOfWeek={day}
                                period={period}
                                slot={slot}
                                classSubjects={classSubjects}
                                teacherAssignments={teacherAssignments}
                                onSave={data => upsertMut.mutate({ classCode: selectedClass!.code, dayOfWeek: day, periodId: period.id, ...data })}
                                onOff={() => upsertMut.mutate({ classCode: selectedClass!.code, dayOfWeek: day, periodId: period.id, subjectName: OFF_SENTINEL, teacherName: null })}
                                onClear={() => slot && deleteMut.mutate(slot.id)}
                                onClose={() => setEditCell(null)}
                              />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Subject legend ── */}
      {selectedClassId && classSubjects.length > 0 && hasSlots && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-slate-400">Subjects:</span>
          {classSubjects.map((s, i) => (
            <Badge key={s.subjectId} variant="outline" className={`text-xs ${COLORS[i % COLORS.length]}`}>
              {s.subjectName}
            </Badge>
          ))}
          <Badge variant="outline" className="text-xs bg-slate-100 text-slate-400 border-slate-200">
            <BanIcon className="h-3 w-3 mr-1" />OFF
          </Badge>
          <Badge variant="outline" className="text-xs bg-slate-100 text-slate-400 border-slate-200">
            <Moon className="h-3 w-3 mr-1" />Weekend
          </Badge>
          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-600 border-amber-200">
            <Palmtree className="h-3 w-3 mr-1" />Holiday
          </Badge>
        </div>
      )}

      {/* ── Click-outside handler ── */}
      {editCell && (
        <div className="fixed inset-0 z-40" onClick={() => setEditCell(null)} />
      )}
    </div>
  );
}
