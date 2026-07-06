import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { getToken } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  CalendarDays, Clock, GraduationCap, Users, ArrowUpRight,
  BookOpen, Settings2, LayoutGrid, UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimetableSummary {
  totalPeriods:   number;
  lecturePeriods: number;
  totalSlots:     number;
  classesCovered: number;
  teacherCount:   number;
  slotsByDay:     { day: number; label: string; count: number }[];
  topTeachers:    { teacherName: string | null; count: number }[];
  classCoverage:  { classCode: string; count: number }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

function fade(delay = 0) {
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay, ease: [0.4, 0, 0.2, 1] as any },
  };
}

const DAY_COLORS: Record<string, string> = {
  Mon: "#6366f1", Tue: "#8b5cf6", Wed: "#06b6d4",
  Thu: "#10b981", Fri: "#f59e0b", Sat: "#f97316",
};

const QUICK_LINKS = [
  { label: "Campus Master Timetable", sub: "All classes at a glance",   href: "/timetable?tab=master",         grad: "from-violet-500 to-purple-600", icon: LayoutGrid  },
  { label: "Class/Program Timetable", sub: "View & edit slots",         href: "/timetable?tab=schedule",       grad: "from-indigo-500 to-violet-600", icon: CalendarDays},
  { label: "Class/Program Subjects",  sub: "Assign subjects to classes", href: "/timetable?tab=class-subjects", grad: "from-sky-500 to-blue-600",      icon: BookOpen    },
  { label: "Teacher Load",    sub: "Teacher–subject mapping",   href: "/timetable?tab=teachers",       grad: "from-teal-500 to-emerald-600",  icon: UserCog     },
  { label: "Period Setup",    sub: "Configure time slots",      href: "/timetable?tab=periods",        grad: "from-amber-500 to-orange-600",  icon: Clock       },
  { label: "Settings",        sub: "Academic year & more",      href: "/academic",                     grad: "from-slate-500 to-slate-700",   icon: Settings2   },
];

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiProps {
  title: string; value: string | number; sub: string;
  icon: React.ElementType; grad: string; href: string; delay?: number; loading?: boolean;
}
function KpiCard({ title, value, sub, icon: Icon, grad, href, delay = 0, loading }: KpiProps) {
  if (loading) return <Skeleton className="h-36 rounded-2xl" />;
  return (
    <motion.div {...fade(delay)}>
      <Link href={href}>
        <div className={cn(
          "relative rounded-2xl p-5 cursor-pointer overflow-hidden bg-gradient-to-br text-white shadow-lg",
          "hover:shadow-xl hover:scale-[1.02] transition-all duration-200",
          grad,
        )}>
          <div className="absolute inset-0 bg-white/10 rounded-2xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">{title}</p>
              <p className="text-3xl font-extrabold text-white mt-1 leading-none" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                {value}
              </p>
              <p className="text-[11px] text-white/60 mt-1.5 font-medium">{sub}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="relative mt-3 flex items-center gap-1 text-[10.5px] font-semibold text-white/70">
            View <ArrowUpRight className="h-3 w-3" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function TimetableDashboard() {
  const { data, isLoading } = useQuery<TimetableSummary>({
    queryKey: ["timetable-summary"],
    queryFn:  () => apiFetch("/api/admin/timetable/summary"),
    staleTime: 30_000,
  });

  const maxDay     = Math.max(1, ...(data?.slotsByDay ?? []).map(d => d.count));
  const maxTeacher = Math.max(1, ...(data?.topTeachers ?? []).map(t => t.count));
  const maxClass   = Math.max(1, ...(data?.classCoverage ?? []).map(c => c.count));

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Defined Periods" value={isLoading ? "—" : (data?.totalPeriods ?? 0)}
          sub={`${data?.lecturePeriods ?? 0} lecture periods`}
          icon={Clock} grad="from-indigo-500 to-violet-600"
          href="/timetable?tab=periods" delay={0} loading={isLoading} />
        <KpiCard title="Filled Slots" value={isLoading ? "—" : (data?.totalSlots ?? 0)}
          sub="Timetable entries configured"
          icon={LayoutGrid} grad="from-sky-500 to-blue-600"
          href="/timetable?tab=schedule" delay={0.07} loading={isLoading} />
        <KpiCard title="Classes/Programs Covered" value={isLoading ? "—" : (data?.classesCovered ?? 0)}
          sub="Classes/Programs with timetable slots"
          icon={GraduationCap} grad="from-emerald-500 to-teal-600"
          href="/timetable?tab=class-subjects" delay={0.14} loading={isLoading} />
        <KpiCard title="Teachers Assigned" value={isLoading ? "—" : (data?.teacherCount ?? 0)}
          sub="Unique teachers in timetable"
          icon={Users} grad="from-amber-500 to-orange-600"
          href="/timetable?tab=teachers" delay={0.21} loading={isLoading} />
      </div>

      {/* Day coverage + Quick Links */}
      <motion.div {...fade(0.1)} className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Slots by day */}
        <Card className="lg:col-span-3 border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Slots by Day of Week
                </CardTitle>
                <CardDescription className="text-xs font-medium">Number of timetable entries per day</CardDescription>
              </div>
              <Link href="/timetable?tab=schedule">
                <button className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  View Timetable <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-3">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-7 rounded-xl" />)}</div>
            ) : (data?.slotsByDay ?? []).length === 0 ? (
              <div className="py-10 text-center">
                <CalendarDays className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">No timetable slots configured yet.</p>
                <Link href="/timetable?tab=periods">
                  <button className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800">Set up periods first →</button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {(data?.slotsByDay ?? []).map((d, i) => {
                  const pct = Math.round((d.count / maxDay) * 100);
                  const color = DAY_COLORS[d.label] ?? "#6366f1";
                  return (
                    <div key={d.day} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-600 w-8 shrink-0">{d.label}</span>
                      <div className="flex-1 h-6 bg-slate-100 rounded-xl overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.7, delay: i * 0.07, ease: [0.4, 0, 0.2, 1] }}
                          className="h-full rounded-xl flex items-center px-2.5"
                          style={{ background: `linear-gradient(90deg, ${color}dd, ${color}88)` }}
                        >
                          {pct > 10 && <span className="text-[10px] font-bold text-white">{d.count}</span>}
                        </motion.div>
                      </div>
                      <span className="text-xs font-bold text-slate-700 tabular-nums w-7 text-right">{d.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick links */}
        <Card className="lg:col-span-2 border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              Quick Access
            </CardTitle>
            <CardDescription className="text-xs font-medium">Navigate to timetable modules</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2.5">
              {QUICK_LINKS.map(l => (
                <Link key={l.label} href={l.href}>
                  <div className={cn(
                    "flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3 cursor-pointer text-center shadow-md bg-gradient-to-br text-white",
                    "hover:scale-[1.04] transition-all",
                    l.grad,
                  )}>
                    <l.icon className="h-4 w-4" />
                    <span className="text-[10.5px] font-bold leading-tight">{l.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Class coverage + Top teachers */}
      <motion.div {...fade(0.15)} className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Class coverage */}
        <Card className="lg:col-span-3 border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Coverage by Class
                </CardTitle>
                <CardDescription className="text-xs font-medium">Timetable slots configured per class</CardDescription>
              </div>
              <Link href="/timetable?tab=class-subjects">
                <button className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  Class/Program Subjects <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-7 rounded-xl" />)}</div>
            ) : (data?.classCoverage ?? []).length === 0 ? (
              <div className="py-10 text-center">
                <GraduationCap className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">No class coverage data yet.</p>
              </div>
            ) : (
              <div className="space-y-2.5 pt-1">
                {(data?.classCoverage ?? []).map((cls, i) => {
                  const pct = Math.round((cls.count / maxClass) * 100);
                  return (
                    <div key={cls.classCode} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-600 w-16 shrink-0 truncate">{cls.classCode}</span>
                      <div className="flex-1 h-5 bg-slate-100 rounded-xl overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, delay: i * 0.04 }}
                          className="h-full rounded-xl"
                          style={{ background: "linear-gradient(90deg, #6366f1dd, #8b5cf688)" }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-700 tabular-nums w-8 text-right">{cls.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top teachers */}
        <Card className="lg:col-span-2 border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                Top Teachers
              </CardTitle>
              <Link href="/timetable?tab=teachers">
                <button className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  All <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </Link>
            </div>
            <CardDescription className="text-xs font-medium">By timetable slot count</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-9 rounded-xl" />)}</div>
            ) : (data?.topTeachers ?? []).length === 0 ? (
              <div className="py-6 text-center">
                <Users className="h-8 w-8 mx-auto mb-1.5 text-slate-200" />
                <p className="text-xs text-slate-400">No teachers assigned yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(data?.topTeachers ?? []).map((t, i) => {
                  const pct = Math.round((t.count / maxTeacher) * 100);
                  return (
                    <div key={i} className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0 text-[11px] font-bold text-violet-700">
                        {t.teacherName?.[0] ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-semibold text-slate-700 truncate">{t.teacherName ?? "—"}</p>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full mt-0.5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5, delay: i * 0.05 }}
                            className="h-full rounded-full bg-violet-400"
                          />
                        </div>
                      </div>
                      <span className="text-xs font-bold text-slate-600 tabular-nums">{t.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
