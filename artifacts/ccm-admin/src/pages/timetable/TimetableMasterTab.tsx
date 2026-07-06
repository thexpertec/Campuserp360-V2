import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getToken } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Period {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  periodType: string;
  sortOrder: number;
}
interface Slot {
  id: string;
  classCode: string;
  dayOfWeek: number;
  periodId: string;
  subjectName?: string | null;
  subjectCode?: string | null;
  teacherName?: string | null;
}
interface ClassRecord {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const OFF_SENTINEL = "OFF";

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

// ── Roman numeral helper ──────────────────────────────────────────────────────
const ROMAN: Record<number, string> = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI" };

/**
 * Convert an array of dayOfWeek integers (1=Mon … 6=Sat) to a compact
 * Roman-numeral string.
 *
 * Examples:
 *   [1,2,3,4,5,6] → "I–VI"
 *   [1,2,3,4,5]   → "I–V"
 *   [1,3,5]       → "I, III, V"
 *   [2]           → "II"
 */
function daysToRoman(days: number[]): string {
  if (!days.length) return "";
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 1) return ROMAN[sorted[0]] ?? String(sorted[0]);

  // Check if days form a consecutive range
  let consecutive = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) { consecutive = false; break; }
  }

  if (consecutive) {
    const first = ROMAN[sorted[0]] ?? String(sorted[0]);
    const last = ROMAN[sorted[sorted.length - 1]] ?? String(sorted[sorted.length - 1]);
    return first === last ? first : `${first}–${last}`;
  }

  return sorted.map(d => ROMAN[d] ?? String(d)).join(", ");
}

// ── Time formatter ─────────────────────────────────────────────────────────────
function fmtTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Failed");
  return json as T;
}

// ── SlotCard — one mini-card inside a cell ────────────────────────────────────
function SlotCard({
  subjectName, teacherName, days, colorClass,
}: {
  subjectName: string;
  teacherName?: string | null;
  days: number[];
  colorClass: string;
}) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-left ${colorClass}`}>
      <p className="text-[11px] font-semibold leading-tight truncate">{subjectName}</p>
      {teacherName && (
        <p className="text-[10px] leading-tight truncate opacity-75 mt-0.5">{teacherName}</p>
      )}
      <p className="text-[10px] font-bold mt-1 leading-none tracking-wide">
        {daysToRoman(days)}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function TimetableMasterTab() {
  const [, setLocation] = useLocation();

  const { data: classesData, isLoading: classesLoading } = useQuery({
    queryKey: ["master-classes"],
    queryFn: () => apiFetch<any>("/api/admin/classes?pageSize=200"),
  });

  const { data: periodsData, isLoading: periodsLoading } = useQuery({
    queryKey: ["timetable-periods"],
    queryFn: () => apiFetch<Period[]>("/api/admin/timetable/periods"),
  });

  const { data: allSlotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ["timetable-all-slots"],
    queryFn: () => apiFetch<Slot[]>("/api/admin/timetable/all-slots"),
  });

  const isLoading = classesLoading || periodsLoading || slotsLoading;

  const classes: ClassRecord[] = useMemo(() => {
    const d = classesData as any;
    const arr = Array.isArray(d?.classes) ? d.classes : Array.isArray(d) ? d : [];
    return [...arr].sort((a: ClassRecord, b: ClassRecord) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [classesData]);

  const lecturePeriods: Period[] = useMemo(() => {
    const arr = Array.isArray(periodsData) ? periodsData : [];
    return arr.filter(p => p.periodType === "lecture").sort((a, b) => a.sortOrder - b.sortOrder);
  }, [periodsData]);

  // Build a stable color map: subject name → COLORS index (across all subjects seen)
  const subjectColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    (allSlotsData ?? []).forEach(slot => {
      if (slot.subjectName && slot.subjectName !== OFF_SENTINEL && !map.has(slot.subjectName)) {
        map.set(slot.subjectName, COLORS[idx % COLORS.length]);
        idx++;
      }
    });
    return map;
  }, [allSlotsData]);

  // Build lookup: classCode → periodId → Slot[]
  const lookup = useMemo(() => {
    const map = new Map<string, Map<string, Slot[]>>();
    (allSlotsData ?? []).forEach(slot => {
      if (!slot.subjectName || slot.subjectName === OFF_SENTINEL) return;
      if (!map.has(slot.classCode)) map.set(slot.classCode, new Map());
      const periodMap = map.get(slot.classCode)!;
      if (!periodMap.has(slot.periodId)) periodMap.set(slot.periodId, []);
      periodMap.get(slot.periodId)!.push(slot);
    });
    return map;
  }, [allSlotsData]);

  // For each cell: group slots by subjectName+teacherName key
  function getCellGroups(classCode: string, periodId: string): { subjectName: string; teacherName?: string | null; days: number[] }[] {
    const slots = lookup.get(classCode)?.get(periodId) ?? [];
    const groups = new Map<string, { subjectName: string; teacherName?: string | null; days: number[] }>();
    for (const slot of slots) {
      const key = `${slot.subjectName}|${slot.teacherName ?? ""}`;
      if (!groups.has(key)) {
        groups.set(key, { subjectName: slot.subjectName!, teacherName: slot.teacherName, days: [] });
      }
      groups.get(key)!.days.push(slot.dayOfWeek);
    }
    return [...groups.values()];
  }

  function navigateToClass(classCode: string) {
    const cls = classes.find(c => c.code === classCode);
    if (cls) setLocation(`/timetable?tab=schedule`);
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!lecturePeriods.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <CalendarDays className="h-12 w-12 text-slate-200 mb-3" />
        <p className="text-slate-500 font-medium">No lecture periods defined yet.</p>
        <a href="/timetable?tab=periods" className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
          Set up periods first →
        </a>
      </div>
    );
  }

  if (!classes.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <CalendarDays className="h-12 w-12 text-slate-200 mb-3" />
        <p className="text-slate-500 font-medium">No classes found.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth: `${200 + lecturePeriods.length * 160}px` }}>
        <thead>
          <tr>
            {/* Row header — Class column */}
            <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide w-40 min-w-[10rem]">
              Class / Program
            </th>
            {lecturePeriods.map(period => (
              <th
                key={period.id}
                className="border-b border-r border-slate-200 last:border-r-0 bg-slate-50 px-3 py-3 text-center min-w-[150px]"
              >
                <p className="text-xs font-bold text-slate-700">{period.name}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                  {fmtTime(period.startTime)} – {fmtTime(period.endTime)}
                </p>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {classes.map((cls, rowIdx) => {
            const hasAnySlot = lecturePeriods.some(p => (lookup.get(cls.code)?.get(p.id)?.length ?? 0) > 0);
            return (
              <tr
                key={cls.id}
                className={rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}
              >
                {/* Row header — sticky class name */}
                <td
                  className="sticky left-0 z-10 border-b border-r border-slate-200 px-4 py-3 font-semibold text-slate-700 text-xs whitespace-nowrap cursor-pointer hover:text-indigo-700 transition-colors"
                  style={{ background: rowIdx % 2 === 0 ? "white" : "rgb(248 250 252 / 0.5)" }}
                  onClick={() => navigateToClass(cls.code)}
                  title="Open class timetable"
                >
                  {cls.name}
                  {!hasAnySlot && (
                    <span className="ml-1.5 text-[10px] text-slate-300 font-normal">—</span>
                  )}
                </td>

                {/* Period cells */}
                {lecturePeriods.map(period => {
                  const groups = getCellGroups(cls.code, period.id);
                  return (
                    <td
                      key={period.id}
                      className="border-b border-r border-slate-200 last:border-r-0 px-2 py-2 align-top"
                    >
                      {groups.length === 0 ? (
                        <span className="text-slate-200 text-xs select-none">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {groups.map((g, gi) => (
                            <SlotCard
                              key={gi}
                              subjectName={g.subjectName}
                              teacherName={g.teacherName}
                              days={g.days}
                              colorClass={subjectColorMap.get(g.subjectName) ?? COLORS[0]}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
