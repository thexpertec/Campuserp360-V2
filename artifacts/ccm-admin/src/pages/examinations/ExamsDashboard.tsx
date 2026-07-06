import { useQuery } from "@tanstack/react-query";
import { formatDate } from "@/lib/locale";
import { useLocation } from "wouter";
import { getToken } from "@/lib/auth";
import { CalendarDays, Users, CheckCircle2, Award, BarChart3, FileText, CalendarRange, LayoutGrid } from "lucide-react";

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

interface GradeBand { id: string; grade: string; minPercent: number; maxPercent: number; remarks?: string | null; }
interface Schedule { id: string; classCode: string; subjectCode: string; sessionLabel: string; examDate: string | null; totalMarks: number; }

function StatCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>; color: string; bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-5 py-4 flex items-center gap-4 shadow-sm">
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const GRADE_COLORS = ["bg-green-500","bg-lime-500","bg-yellow-400","bg-orange-400","bg-red-400","bg-slate-400"];

function fmtDate(s?: string | null) {
  if (!s) return "TBD";
  return formatDate(s);
}

export function ExamsDashboard() {
  const [, nav] = useLocation();

  const { data: bands = [], isLoading: bLoading } = useQuery<GradeBand[]>({
    queryKey: ["grade-bands-dash"],
    queryFn: () => apiFetch("/api/admin/exams/grade-bands"),
    staleTime: 60_000,
  });

  const { data: schedules = [], isLoading: sLoading } = useQuery<Schedule[]>({
    queryKey: ["exam-schedules"],
    queryFn: () => apiFetch("/api/admin/exams/schedules"),
    staleTime: 10_000,
  });

  const isLoading = bLoading || sLoading;

  const sorted   = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  const sessions = [...new Set(schedules.map(s => s.sessionLabel))];
  const classes  = [...new Set(schedules.map(s => s.classCode))];
  const today    = new Date().toISOString().slice(0, 10);
  const upcoming = schedules.filter(s => (s.examDate ?? "") >= today);

  const byClass: Record<string, number> = {};
  schedules.forEach(s => { byClass[s.classCode] = (byClass[s.classCode] ?? 0) + 1; });
  const classEntries = Object.entries(byClass).sort(([a],[b]) => a.localeCompare(b));
  const classMax = Math.max(1, ...classEntries.map(([,v]) => v));

  const quickLinks = [
    { icon: BarChart3,     label: "Results Entry",   sub: "Enter marks for a scheduled exam",         tab: "results"      },
    { icon: FileText,      label: "Report Cards",    sub: "View & print class report cards",          tab: "report-cards" },
    { icon: LayoutGrid,    label: "Master Datesheet",sub: "Classwise datesheet across multiple classes", tab: "master-datesheet" },
    { icon: CalendarRange, label: "Date Sheet",      sub: "Printable date-wise exam timetable",       tab: "date-sheet"   },
    { icon: Award,         label: "Setup",           sub: "Exam types, grading scales & bands",       tab: "setup"        },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Exams Scheduled" value={isLoading ? "…" : schedules.length} icon={CalendarDays}  color="text-violet-600" bg="bg-violet-50"
          sub={`${sessions.length} session${sessions.length !== 1 ? "s" : ""}`} />
        <StatCard label="Classes/Programs Covered"  value={isLoading ? "…" : classes.length}  icon={Users}         color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard label="Upcoming"         value={isLoading ? "…" : upcoming.length} icon={CheckCircle2}  color="text-blue-600"   bg="bg-blue-50"   sub="From today" />
        <StatCard label="Grade Bands"      value={isLoading ? "…" : bands.length}    icon={Award}         color="text-amber-600"  bg="bg-amber-50"  sub="Grading scale entries" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Exams by class */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Exams Scheduled by Class</h3>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-4 bg-slate-100 rounded-full animate-pulse" />)}</div>
          ) : classEntries.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No exams scheduled yet.</p>
          ) : (
            <div className="space-y-3">
              {classEntries.map(([cls, cnt]) => (
                <div key={cls} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 font-medium w-20 flex-shrink-0">{cls}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${(cnt / classMax) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 tabular-nums">{cnt}</span>
                </div>
              ))}
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Upcoming</p>
              <div className="space-y-1.5">
                {upcoming.slice(0, 5).map(s => (
                  <div key={s.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700">{s.classCode} · {s.subjectCode}</span>
                    <span className="text-indigo-600 font-medium">{fmtDate(s.examDate)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Grade scale */}
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Grade Scale</h3>
            {sorted.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No grade bands configured — add them in Setup.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sorted.map((b, i) => (
                  <div key={b.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-white text-xs font-semibold ${GRADE_COLORS[i % GRADE_COLORS.length]}`}>
                    {b.grade}
                    <span className="font-normal opacity-80">{b.minPercent}–{b.maxPercent}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick access — now actual nav links */}
          <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Quick Access</h3>
            <div className="space-y-1.5">
              {quickLinks.map(({ icon: Icon, label, sub, tab }) => (
                <button
                  key={label}
                  onClick={() => nav(`/examinations?tab=${tab}`)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors text-left"
                >
                  <div className="h-7 w-7 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-3.5 w-3.5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{label}</p>
                    <p className="text-[11px] text-slate-400">{sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
