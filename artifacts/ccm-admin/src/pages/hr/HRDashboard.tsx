import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDate, formatCurrencyCompact } from "@/lib/locale";
import { motion } from "framer-motion";
import { getToken } from "@/lib/auth";
import { HRAttendanceTab } from "./HRAttendanceTab";
import { HRLeaveTab } from "./HRLeaveTab";
import { HRPayrollTab } from "./HRPayrollTab";
import { HRSetupTab } from "./HRSetupTab";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Users, Briefcase, CalendarOff, UserCheck, Banknote,
  Settings2, CheckCircle2, Clock, ArrowUpRight, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface HrSummary {
  totalStaff:   number;
  onLeaveToday: number;
  attendanceToday: Record<string, number>;
  byDepartment: { name: string; count: number }[];
  byRole:       { role: string; count: number }[];
  upcomingLeaves: {
    id: string; fullName: string | null;
    leaveType: string; fromDate: string | null; toDate: string | null; status: string;
  }[];
  payroll: {
    month: string; totalNet: number; paidNet: number; pendingNet: number;
    paidCount: number; totalCount: number; generated: boolean;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEPT_COLORS = [
  "#6366f1","#8b5cf6","#06b6d4","#10b981",
  "#f59e0b","#f97316","#ec4899","#64748b",
];

const ROLE_LABELS: Record<string, string> = {
  director:          "Director",
  admin:             "Admin",
  teacher:           "Teacher",
  accountant:        "Accountant",
  admission_officer: "Admission Officer",
  librarian:         "Librarian",
  medical_officer:   "Medical Officer",
  support:           "Support Staff",
};

const ROLE_COLORS: Record<string, string> = {
  director:          "bg-violet-100 text-violet-700",
  admin:             "bg-indigo-100 text-indigo-700",
  teacher:           "bg-sky-100 text-sky-700",
  accountant:        "bg-emerald-100 text-emerald-700",
  admission_officer: "bg-amber-100 text-amber-700",
  librarian:         "bg-teal-100 text-teal-700",
  medical_officer:   "bg-rose-100 text-rose-700",
  support:           "bg-slate-100 text-slate-600",
};

const LEAVE_STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-100 text-green-700 border-green-200",
  pending:  "bg-yellow-100 text-yellow-700 border-yellow-200",
};

const QUICK_LINKS = [
  { label: "Staff Directory", sub: "Browse all employees",      href: "/employees",           grad: "from-indigo-500 to-violet-600", icon: Users        },
  { label: "Attendance",      sub: "Mark daily register",       href: "/hr?tab=attendance",   grad: "from-blue-500 to-cyan-600",     icon: UserCheck    },
  { label: "Leave",           sub: "Manage leave requests",     href: "/hr?tab=leave",        grad: "from-amber-500 to-orange-600",  icon: CalendarOff  },
  { label: "Payroll",         sub: "Generate salary slips",     href: "/hr?tab=payroll",      grad: "from-rose-500 to-pink-600",     icon: Banknote     },
  { label: "Salary Templates",sub: "Configure staff salaries",  href: "/hr?tab=setup",        grad: "from-teal-500 to-emerald-600",  icon: Briefcase    },
  { label: "Careers",         sub: "Review job applications",   href: "/hr?tab=careers",      grad: "from-fuchsia-500 to-pink-600",  icon: FileText     },
  { label: "HR Setup",        sub: "Departments & grades",      href: "/hr?tab=setup",        grad: "from-slate-500 to-slate-700",   icon: Settings2    },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

function fade(delay = 0) {
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay, ease: [0.4, 0, 0.2, 1] as any },
  };
}

function fmt(n: number) {
  return formatCurrencyCompact(n);
}

function daysCount(from: string | null, to: string | null) {
  if (!from || !to) return 0;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return formatDate(d);
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: string | number;
  sub: string;
  icon: React.ElementType;
  grad: string;
  href: string;
  delay?: number;
  isLoading?: boolean;
}

function KpiCard({ title, value, sub, icon: Icon, grad, href, delay = 0, isLoading }: KpiCardProps) {
  if (isLoading) return <Skeleton className="h-36 rounded-2xl" />;
  return (
    <motion.div {...fade(delay)}>
      <Link href={href}>
        <div className={cn(
          "relative rounded-2xl p-5 cursor-pointer overflow-hidden bg-gradient-to-br text-white shadow-lg",
          "hover:shadow-xl hover:scale-[1.02] transition-all duration-200",
          grad,
        )}>
          <div className="absolute inset-0 bg-white/10 rounded-2xl" style={{ backdropFilter: "blur(0px)" }} />
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

// ── Dashboard view ────────────────────────────────────────────────────────────

function HRDashboardView() {
  const { data, isLoading } = useQuery<HrSummary>({
    queryKey: ["dashboard-hr-summary"],
    queryFn:  () => apiFetch("/api/admin/dashboard/hr-summary"),
    staleTime: 30_000,
  });

  const att      = data?.attendanceToday ?? {};
  const attTotal = Object.values(att).reduce((s, n) => s + n, 0);
  const presentToday  = att["present"] ?? 0;
  const lateToday     = att["late"] ?? 0;
  const absentToday   = att["absent"] ?? 0;

  const payroll  = data?.payroll;
  const payValue = payroll?.generated ? fmt(payroll.totalNet) : "—";
  const paySub   = payroll?.generated
    ? `${payroll.paidCount}/${payroll.totalCount} paid · ${monthLabel(payroll.month)}`
    : `Not generated · ${payroll ? monthLabel(payroll.month) : ""}`;

  const byDept   = data?.byDepartment ?? [];
  const maxDept  = Math.max(1, ...byDept.map(d => d.count));

  const byRole   = data?.byRole ?? [];
  const upcoming = data?.upcomingLeaves ?? [];

  const attRecorded = attTotal > 0;

  const kpis = useMemo(() => [
    {
      title: "Active Staff",
      value: isLoading ? "—" : (data?.totalStaff ?? 0),
      sub:   "Employed employees",
      icon:  Users,
      grad:  "from-indigo-500 to-violet-600",
      href:  "/employees",
    },
    {
      title: "Present Today",
      value: isLoading ? "—" : (attRecorded ? (presentToday + lateToday) : "—"),
      sub:   attRecorded ? `${absentToday} absent · ${att["leave"] ?? 0} on leave` : "Attendance not yet marked",
      icon:  UserCheck,
      grad:  "from-emerald-500 to-teal-600",
      href:  "/hr?tab=attendance",
    },
    {
      title: "On Leave Today",
      value: isLoading ? "—" : (data?.onLeaveToday ?? 0),
      sub:   "Active leave requests",
      icon:  CalendarOff,
      grad:  "from-amber-500 to-orange-600",
      href:  "/hr?tab=leave",
    },
    {
      title: "Monthly Payroll",
      value: isLoading ? "—" : payValue,
      sub:   paySub,
      icon:  Banknote,
      grad:  "from-rose-500 to-pink-600",
      href:  "/hr?tab=payroll",
    },
  ], [data, isLoading, attRecorded, presentToday, lateToday, absentToday, att, payValue, paySub]);

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.title} {...k} delay={i * 0.07} isLoading={isLoading} />
        ))}
      </div>

      {/* Department breakdown + Quick Links */}
      <motion.div {...fade(0.1)} className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Department bars */}
        <Card className="lg:col-span-3 border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Staff by Department
                </CardTitle>
                <CardDescription className="text-xs font-medium">Active employees per department</CardDescription>
              </div>
              <Link href="/employees">
                <button className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  Directory <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-3">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-7 w-full rounded-xl" />)}
              </div>
            ) : byDept.length === 0 ? (
              <div className="py-10 text-center">
                <Briefcase className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">No department data yet.</p>
                <Link href="/hr?tab=setup">
                  <button className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800">Set up departments →</button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {byDept.map((d, i) => {
                  const pct = Math.round((d.count / maxDept) * 100);
                  return (
                    <div key={d.name} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-600 w-28 shrink-0 truncate">{d.name}</span>
                      <div className="flex-1 h-6 bg-slate-100 rounded-xl overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.7, delay: i * 0.06, ease: [0.4, 0, 0.2, 1] }}
                          className="h-full rounded-xl flex items-center px-2.5"
                          style={{
                            background: `linear-gradient(90deg, ${DEPT_COLORS[i % DEPT_COLORS.length]}dd, ${DEPT_COLORS[i % DEPT_COLORS.length]}88)`,
                          }}
                        >
                          {pct > 12 && <span className="text-[10px] font-bold text-white">{d.count}</span>}
                        </motion.div>
                      </div>
                      <span className="text-xs font-bold text-slate-700 tabular-nums w-6 text-right">{d.count}</span>
                    </div>
                  );
                })}
                {byDept.length > 0 && (
                  <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[11px] font-medium text-slate-400">
                    <span>Total active staff</span>
                    <span className="font-bold text-slate-700">{byDept.reduce((s, d) => s + d.count, 0).toLocaleString()}</span>
                  </div>
                )}
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
            <CardDescription className="text-xs font-medium">Navigate to HR modules</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2.5">
              {QUICK_LINKS.map(l => (
                <Link key={l.label} href={l.href}>
                  <div className={cn(
                    "flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3 cursor-pointer",
                    "hover:scale-[1.04] transition-all text-center shadow-md bg-gradient-to-br text-white",
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

      {/* Upcoming leaves + Attendance summary + Role breakdown */}
      <motion.div {...fade(0.15)} className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Upcoming leaves */}
        <Card className="lg:col-span-3 border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Upcoming Leaves
                </CardTitle>
                <CardDescription className="text-xs font-medium">Approved & pending leave in the next 7 days</CardDescription>
              </div>
              <Link href="/hr?tab=leave">
                <button className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  All Leaves <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
              </div>
            ) : upcoming.length === 0 ? (
              <div className="py-10 text-center">
                <CalendarOff className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">No upcoming leave requests in the next 7 days.</p>
                <Link href="/hr?tab=leave">
                  <button className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800">Manage leaves →</button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming.map(lv => {
                  const days = daysCount(lv.fromDate, lv.toDate);
                  return (
                    <Link key={lv.id} href="/hr?tab=leave">
                      <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors cursor-pointer">
                        {/* Avatar */}
                        <div className="h-9 w-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0 text-sm font-bold text-indigo-700">
                          {(lv.fullName?.[0] ?? "?")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-semibold text-slate-800 truncate">
                            {lv.fullName}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate capitalize">
                            {lv.leaveType} · {fmtDate(lv.fromDate)} – {fmtDate(lv.toDate)}
                            {days > 0 ? ` (${days}d)` : ""}
                          </p>
                        </div>
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize shrink-0",
                          LEAVE_STATUS_COLORS[lv.status] ?? "bg-slate-100 text-slate-600 border-slate-200",
                        )}>
                          {lv.status}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column: Attendance Today + Role Breakdown */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Attendance today */}
          <Card className="border-0 shadow-md flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                Today's Attendance
              </CardTitle>
              <CardDescription className="text-xs font-medium">
                {attRecorded ? `${attTotal} staff marked` : "No register saved yet"}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading ? (
                <Skeleton className="h-28 w-full rounded-xl" />
              ) : !attRecorded ? (
                <div className="py-6 text-center">
                  <UserCheck className="h-8 w-8 mx-auto mb-1.5 text-slate-200" />
                  <p className="text-xs text-slate-400">Mark attendance to see today's summary.</p>
                  <Link href="/hr?tab=attendance">
                    <button className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800">Mark now →</button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {[
                    { label: "Present",  value: presentToday, color: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
                    { label: "Late",     value: lateToday,    color: "bg-orange-400",  text: "text-orange-700",  bg: "bg-orange-50"  },
                    { label: "Absent",   value: absentToday,  color: "bg-red-400",     text: "text-red-700",    bg: "bg-red-50"    },
                    { label: "On Leave", value: att["leave"] ?? 0, color: "bg-blue-400", text: "text-blue-700", bg: "bg-blue-50" },
                    { label: "Off",      value: att["off"] ?? 0,   color: "bg-slate-300", text: "text-slate-600", bg: "bg-slate-50" },
                  ].filter(r => r.value > 0).map(r => (
                    <div key={r.label} className={cn("flex items-center justify-between rounded-lg px-3 py-2", r.bg)}>
                      <div className="flex items-center gap-2">
                        <div className={cn("h-2 w-2 rounded-full", r.color)} />
                        <span className="text-xs font-semibold text-slate-700">{r.label}</span>
                      </div>
                      <span className={cn("text-sm font-bold", r.text)}>{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payroll status */}
          {payroll?.generated && (
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Payroll — {monthLabel(payroll.month)}
                </CardTitle>
                <CardDescription className="text-xs font-medium">
                  {payroll.paidCount}/{payroll.totalCount} salary slips paid
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="flex items-center justify-between rounded-lg px-3 py-2 bg-emerald-50">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-xs font-semibold text-slate-700">Paid</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">{fmt(payroll.paidNet)}</span>
                </div>
                {payroll.pendingNet > 0 && (
                  <div className="flex items-center justify-between rounded-lg px-3 py-2 bg-amber-50">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-xs font-semibold text-slate-700">Pending</span>
                    </div>
                    <span className="text-sm font-bold text-amber-700">{fmt(payroll.pendingNet)}</span>
                  </div>
                )}
                <Link href="/hr?tab=payroll">
                  <button className="w-full mt-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center justify-center gap-1 py-1">
                    Open Payroll <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Role breakdown */}
          {byRole.length > 0 && (
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Staff by Role
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {isLoading ? (
                  <Skeleton className="h-20 w-full rounded-xl" />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {byRole.map(r => (
                      <div key={r.role} className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold",
                        ROLE_COLORS[r.role] ?? "bg-slate-100 text-slate-600",
                      )}>
                        <span>{ROLE_LABELS[r.role] ?? r.role}</span>
                        <span className="opacity-70">· {r.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Exported component ────────────────────────────────────────────────────────

export function HRDashboard({ tab = "dashboard" }: { tab?: string }) {
  if (tab === "attendance") return <HRAttendanceTab />;
  if (tab === "leave")      return <HRLeaveTab />;
  if (tab === "payroll")    return <HRPayrollTab />;
  if (tab === "setup")      return <HRSetupTab />;
  return <HRDashboardView />;
}
