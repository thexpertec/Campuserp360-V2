import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { getToken } from "@/lib/auth";
import { formatDate, formatCurrency, formatCurrencyCompact } from "@/lib/locale";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, RadialBarChart, RadialBar,
} from "recharts";
import {
  FileText, CheckCircle, Calendar, Users, GraduationCap, Building2,
  BookOpen, HeartPulse, Bus, Plus, BarChart3, Trophy,
  AlertTriangle, Info, AlertCircle, ArrowUpRight, Sparkles, Clock,
  TrendingUp, Crown, ClipboardList, Wallet, ChevronRight, ChevronDown,
  Zap, ArrowRight, Filter, RefreshCw, Package, Briefcase,
  UserCheck, Settings2, UserMinus, Bed, ShieldAlert,
} from "lucide-react";
import {
  useGetAdminDashboardSummary,
  useGetAdminMe,
  getGetAdminMeQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type RoleId = "principal" | "admissions" | "finance" | "academics" | "hr" | "operations";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES: { id: RoleId; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "principal",  label: "Principal",        icon: Crown,         desc: "Full institution overview" },
  { id: "admissions", label: "Admissions Office", icon: ClipboardList, desc: "Pipeline & applications" },
  { id: "finance",    label: "Finance Office",    icon: Wallet,        desc: "Fee & revenue tracking" },
  { id: "academics",  label: "Academics",         icon: GraduationCap, desc: "Classes, subjects & exams" },
  { id: "hr",         label: "HR Office",         icon: UserCheck,     desc: "Staff, attendance & payroll" },
  { id: "operations", label: "Operations",        icon: Settings2,     desc: "Hostel, library, medical, transport & store" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  received:             { label: "Received",            color: "#94a3b8" },
  under_review:         { label: "Under Review",         color: "#f59e0b" },
  pending_verification: { label: "Pending Verification", color: "#f97316" },
  verified:             { label: "Verified",             color: "#3b82f6" },
  test_scheduled:       { label: "Test Scheduled",       color: "#8b5cf6" },
  test_taken:           { label: "Test Taken",            color: "#06b6d4" },
  result_announced:     { label: "Result Announced",     color: "#10b981" },
  admitted:             { label: "Qualified",             color: "#064A1A" },
  on_hold:              { label: "On Hold",               color: "#94a3b8" },
  rejected:             { label: "Rejected",              color: "#ef4444" },
};


const CHART_COLORS = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#f97316","#ec4899","#94a3b8"];
const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function buildMonthlyTrend(byMonth: { year: number; month: number; count: number }[]) {
  const curYear = new Date().getFullYear();
  const prevYear = curYear - 1;
  const lookup = new Map(byMonth.map(r => [`${r.year}-${r.month}`, r.count]));
  return MONTH_LABELS.map((month, i) => ({
    month,
    cur:  lookup.get(`${curYear}-${i + 1}`)  ?? 0,
    prev: lookup.get(`${prevYear}-${i + 1}`) ?? 0,
  }));
}

function buildCentreData(byExamCenter: { examCenter: string; count: number }[]) {
  return byExamCenter.map((d, i) => ({
    city: d.examCenter,
    count: d.count,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

const MODULE_STATS_TEMPLATE = [
  { label: "Enrolled Cadets",   key: "enrolledCadets"   as const, icon: Users,         grad: "from-blue-500 to-indigo-600"   },
  { label: "Teaching Staff",    key: "activeStaff"      as const, icon: GraduationCap, grad: "from-violet-500 to-purple-600" },
  { label: "Hostel Beds Filled",key: "hostelBedsFilled" as const, icon: Building2,     grad: "from-orange-500 to-amber-600"  },
  { label: "Library Books Out", key: "libraryBooksOut"  as const, icon: BookOpen,      grad: "from-teal-500 to-emerald-600"  },
  { label: "Sick Bay Today",    key: "sickBayToday"     as const, icon: HeartPulse,    grad: "from-red-500 to-rose-600"      },
  { label: "Active Vehicles",   key: "activeVehicles"   as const, icon: Bus,           grad: "from-sky-500 to-cyan-600"      },
  { label: "Store Items",       key: "storeItems"       as const, icon: Package,       grad: "from-amber-500 to-orange-600"  },
  { label: "Staff On Leave",    key: "staffOnLeave"     as const, icon: Briefcase,     grad: "from-pink-500 to-rose-600"     },
];

interface ModuleStats {
  enrolledCadets: number; activeStaff: number; departments: number;
  hostelBedsFilled: number; libraryBooksOut: number; sickBayToday: number;
  activeVehicles: number; storeItems: number; staffOnLeave: number;
}

interface FeeByClass { cls: string; collected: number; outstanding: number; }

interface UpcomingEvent {
  id: string; title: string; startDate: string; eventType: string; status: string;
}

const eventColors: Record<string, string> = {
  exam:      "bg-violet-100 text-violet-700",
  milestone: "bg-emerald-100 text-emerald-700",
  deadline:  "bg-red-100 text-red-700",
  event:     "bg-blue-100 text-blue-700",
  academic:  "bg-blue-100 text-blue-700",
  cultural:  "bg-pink-100 text-pink-700",
  sports:    "bg-emerald-100 text-emerald-700",
  ceremony:  "bg-amber-100 text-amber-700",
  meeting:   "bg-slate-100 text-slate-700",
  holiday:   "bg-teal-100 text-teal-700",
  other:     "bg-slate-100 text-slate-700",
};

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

function fmtEventDate(d: string) {
  const dt = new Date(d + "T00:00:00");
  return {
    date: formatDate(d),
    day:  ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getDay()],
  };
}

const QUICK_ACTIONS = [
  { label: "New Application",  icon: Plus,       href: "/applications?new=1",             grad: "from-emerald-500 to-teal-600"  },
  { label: "Schedule Test",    icon: Calendar,   href: "/applications?tab=entry-test",    grad: "from-violet-500 to-purple-600" },
  { label: "Merit Preview",    icon: Trophy,     href: "/applications?tab=merit-list",    grad: "from-amber-500 to-orange-600"  },
  { label: "Admit Cards",      icon: FileText,   href: "/applications?tab=entry-test",   grad: "from-cyan-500 to-sky-600"      },
  { label: "Reports",          icon: BarChart3,  href: "/reports",                        grad: "from-slate-600 to-slate-800"   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useCountUp(target: number, delay = 0) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      let c = 0; const step = target / (900 / 16);
      const iv = setInterval(() => {
        c += step;
        if (c >= target) { setN(target); clearInterval(iv); } else setN(Math.floor(c));
      }, 16);
      return () => clearInterval(iv);
    }, delay);
    return () => clearTimeout(t);
  }, [target, delay]);
  return n;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const fade = (d = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay: d },
});

function buildFunnel(byStatus: { status: string; count: number }[], total: number) {
  const get = (...ks: string[]) =>
    byStatus.filter(s => ks.includes(s.status)).reduce((a, s) => a + s.count, 0);

  const admitted     = get("admitted");
  const resultOut    = get("result_announced") + admitted;
  const testTaken    = get("test_taken") + resultOut;
  const testSched    = get("test_scheduled") + testTaken;
  const verified     = get("verified") + testSched;

  return [
    { label: "Received",     count: total,       color: "#6366f1" },
    { label: "Verified",     count: verified,    color: "#8b5cf6" },
    { label: "Test Sched.",  count: testSched,   color: "#06b6d4" },
    { label: "Test Taken",   count: testTaken,   color: "#10b981" },
    { label: "Qualified",    count: admitted,    color: "#064A1A" },
  ];
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ActionKPICard({
  title, value, sub, icon: Icon, grad, actionLabel, actionHref, delay = 0,
}: {
  title: string; value: number | string; sub: string; icon: React.ElementType;
  grad: string; actionLabel?: string; actionHref?: string; delay?: number;
}) {
  const numVal = typeof value === "number" ? value : 0;
  const n = useCountUp(numVal, delay * 120);
  const display = typeof value === "string" ? value : n.toLocaleString();
  const [hovered, setHovered] = useState(false);

  const inner = (
    <Card
      className="relative overflow-hidden border-0 shadow-md transition-all duration-200 cursor-pointer"
      style={{ boxShadow: hovered ? "0 12px 32px rgba(0,0,0,0.14)" : undefined, transform: hovered ? "translateY(-2px)" : undefined }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", grad)} />
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between mb-3">
          <div className={cn("h-10 w-10 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-md", grad)}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <AnimatePresence>
            {hovered && actionHref && (
              <motion.span
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg"
              >
                {actionLabel ?? "View"} <ArrowRight className="h-3 w-3" />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <p className="text-3xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
          {display}
        </p>
        <p className="text-[11px] font-bold text-slate-500 mt-0.5 uppercase tracking-wide">{title}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );

  return (
    <motion.div {...fade(delay * 0.07)}>
      {actionHref ? <Link href={actionHref}>{inner}</Link> : inner}
    </motion.div>
  );
}

function SectionHeader({ title, sub, collapsible, open, onToggle }: {
  title: string; sub?: string; collapsible?: boolean; open?: boolean; onToggle?: () => void;
}) {
  return (
    <div
      className={cn("flex items-center justify-between", collapsible && "cursor-pointer select-none")}
      onClick={collapsible ? onToggle : undefined}
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {collapsible && (
        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")} />
      )}
    </div>
  );
}

// ─── Conversion Funnel ────────────────────────────────────────────────────────

function ConversionFunnel({ byStatus, total, isLoading }: {
  byStatus: { status: string; count: number }[]; total: number; isLoading: boolean;
}) {
  const stages = buildFunnel(byStatus, total);
  const maxCount = stages[0]?.count || 1;

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;

  return (
    <div className="space-y-2.5">
      {stages.map((stage, i) => {
        const pct = Math.round((stage.count / maxCount) * 100);
        const convPct = i === 0 ? 100 : Math.round((stage.count / (stages[0]?.count || 1)) * 100);
        return (
          <div key={stage.label} className="group">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 w-4">{i + 1}</span>
                <span className="text-[12.5px] font-semibold text-slate-700">{stage.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[12px] font-bold text-slate-800">{stage.count.toLocaleString()}</span>
                {i > 0 && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `${stage.color}18`, color: stage.color }}
                  >
                    {convPct}% of total
                  </span>
                )}
                {i === 0 && (
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">100% baseline</span>
                )}
              </div>
            </div>
            <div className="relative h-7 bg-slate-100 rounded-xl overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, delay: i * 0.1, ease: [0.4, 0, 0.2, 1] }}
                className="absolute inset-y-0 left-0 rounded-xl flex items-center px-3"
                style={{ background: `linear-gradient(90deg, ${stage.color}dd, ${stage.color}88)` }}
              >
                {pct > 12 && (
                  <span className="text-[10px] font-bold text-white">{pct}%</span>
                )}
              </motion.div>
            </div>
          </div>
        );
      })}

      {/* Drop-off note */}
      {total > 0 && stages.length === 5 && (
        <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400 font-medium">
          <span>Overall conversion rate</span>
          <span className="font-bold text-emerald-600">
            {Math.round(((stages[4]?.count ?? 0) / total) * 100)}% qualified of all applicants
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Pending Actions Panel ────────────────────────────────────────────────────

function PendingActionsPanel({ summary, isLoading }: {
  summary: { pendingVerification: number; underReview?: number; testScheduled: number; testTaken?: number; admitted: number; totalSeats: number } | undefined;
  isLoading: boolean;
}) {
  const actions = [
    {
      label: "Awaiting document verification",
      count: summary?.pendingVerification ?? 0,
      color: "#f97316",
      bg: "bg-orange-50",
      border: "border-orange-100",
      href: "/applications?status=pending_verification",
      cta: "Review & Approve",
    },
    {
      label: "Applications under review",
      count: summary?.underReview ?? 0,
      color: "#f59e0b",
      bg: "bg-amber-50",
      border: "border-amber-100",
      href: "/applications?status=under_review",
      cta: "Process Now",
    },
    {
      label: "Test results not yet entered",
      count: summary?.testTaken ?? 0,
      color: "#8b5cf6",
      bg: "bg-violet-50",
      border: "border-violet-100",
      href: "/examinations?tab=results",
      cta: "Enter Results",
    },
    {
      label: "Admit cards ready to issue",
      count: summary?.testScheduled ?? 0,
      color: "#0891b2",
      bg: "bg-cyan-50",
      border: "border-cyan-100",
      href: "/applications?tab=entry-test",
      cta: "Issue Cards",
    },
  ];

  return (
    <div className="space-y-2">
      {actions.map((a) => (
        <Link key={a.label} href={a.href}>
          <div className={cn("flex items-center gap-3 rounded-xl border p-3 cursor-pointer hover:shadow-sm transition-all", a.bg, a.border)}>
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-extrabold text-[13px] shrink-0"
              style={{ background: a.color, fontFamily: "'Plus Jakarta Sans',sans-serif" }}
            >
              {isLoading ? "…" : a.count}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-slate-700 leading-snug">{a.label}</p>
            </div>
            <div
              className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg text-white shrink-0"
              style={{ background: a.color }}
            >
              {a.cta} <ChevronRight className="h-3 w-3" />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Geography Chart ──────────────────────────────────────────────────────────

function GeographyChart({ data }: { data: { city: string; count: number; color: string }[] }) {
  if (!data.length) return <p className="text-center py-10 text-sm text-slate-400">No application data yet</p>;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="city" tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 12, border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}
          formatter={(v: number) => [v, "Applications"]}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={36}>
          {data.map((e, i) => <Cell key={i} fill={e.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Trend Chart (with YoY) ───────────────────────────────────────────────────

function TrendChart({ showYoY, data }: { showYoY?: boolean; data: { month: string; cur: number; prev: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="gCur" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}   />
          </linearGradient>
          <linearGradient id="gPrev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#94a3b8" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}    />
          </linearGradient>
          <linearGradient id="gAdm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#059669" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#059669" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 600 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }} />
        {showYoY && (
          <Area type="monotone" dataKey="prev" name="Apps 2024-25" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" fill="url(#gPrev)" dot={false} />
        )}
        <Area type="monotone" dataKey="cur" name="Apps 2025-26" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#gCur)" dot={false} />
        <Area type="monotone" dataKey="admitted" name="Qualified" stroke="#059669" strokeWidth={2.5} fill="url(#gAdm)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Activity Timeline ────────────────────────────────────────────────────────

function ActivityTimeline({ events }: { events?: { id: string; title: string; applicantName: string; referenceId: string; occurredAt: string }[] }) {
  if (!events?.length) return <p className="text-center py-6 text-sm text-slate-400">No recent activity</p>;
  return (
    <div>
      {events.slice(0, 7).map((ev, i) => (
        <Link key={ev.id} href={`/applications/${ev.referenceId}`}>
          <div className={cn("flex gap-3 py-2.5 cursor-pointer hover:bg-slate-50 rounded-lg px-1 transition-colors", i < 6 && "border-b border-slate-100")}>
            <div className="mt-1.5 h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold text-slate-800 truncate">{ev.title}</p>
              <p className="text-[11px] text-slate-400 truncate">{ev.applicantName} · {ev.referenceId}</p>
              <p className="text-[10px] text-slate-300 mt-0.5">
                {formatDate(ev.occurredAt)} ·{" "}
                {new Date(ev.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0 mt-1" />
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

function AlertsPanel({ summary }: { summary?: { pendingVerification: number; testScheduled: number; testTaken?: number; underReview?: number } }) {
  const alerts: { type: "warning" | "error" | "info"; msg: string; href: string }[] = [];

  if ((summary?.pendingVerification ?? 0) > 0)
    alerts.push({ type: "warning", msg: `${summary!.pendingVerification} application${summary!.pendingVerification !== 1 ? "s" : ""} pending document verification`, href: "/applications?status=pending_verification" });
  if ((summary?.underReview ?? 0) > 0)
    alerts.push({ type: "warning", msg: `${summary!.underReview} application${summary!.underReview !== 1 ? "s" : ""} under review — action needed`, href: "/applications?status=under_review" });
  if ((summary?.testScheduled ?? 0) > 0)
    alerts.push({ type: "info", msg: `${summary!.testScheduled} admit card${summary!.testScheduled !== 1 ? "s" : ""} ready to issue`, href: "/applications?tab=entry-test" });
  if ((summary?.testTaken ?? 0) > 0)
    alerts.push({ type: "info", msg: `${summary!.testTaken} test result${summary!.testTaken !== 1 ? "s" : ""} not yet entered`, href: "/examinations?tab=results" });

  if (!alerts.length)
    return <p className="text-center py-6 text-sm text-slate-400">No alerts — all clear ✓</p>;

  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <Link key={i} href={a.href}>
          <div className={cn("flex gap-2.5 items-start rounded-xl p-3 border cursor-pointer hover:opacity-90 transition",
            a.type === "error"   ? "bg-red-50 border-red-100"    :
            a.type === "warning" ? "bg-amber-50 border-amber-100" : "bg-blue-50 border-blue-100"
          )}>
            {a.type === "error"   ? <AlertCircle   className="h-4 w-4 text-red-500 shrink-0 mt-0.5" /> :
             a.type === "warning" ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" /> :
                                    <Info          className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />}
            <p className="text-[11.5px] font-semibold text-slate-700 leading-snug">{a.msg}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── ADMISSIONS VIEW ──────────────────────────────────────────────────────────

function AdmissionsView({ summary, isLoading }: { summary: any; isLoading: boolean }) {
  const classData = (summary?.byClass ?? []).map((d: any) => ({
    name: d.classApplying ?? d.status ?? "",
    count: d.count,
  }));

  const centreData = buildCentreData(summary?.byExamCenter ?? []);
  const trendData  = buildMonthlyTrend(summary?.byMonth ?? []);

  const pipelineData = (summary?.byStatus ?? [])
    .filter((d: any) => d.status !== "on_hold")
    .map((d: any) => ({
      name: STATUS_CONFIG[d.status]?.label ?? d.status,
      count: d.count,
      fill: STATUS_CONFIG[d.status]?.color ?? "#94a3b8",
    }))
    .sort((a: any, b: any) => b.count - a.count);

  const _byStatus: { status: string; count: number }[] = summary?.byStatus ?? [];
  const _getS = (...ks: string[]) => _byStatus.filter(s => ks.includes(s.status)).reduce((a, s) => a + s.count, 0);
  const cumulativeTestSched = _getS("test_scheduled") + _getS("test_taken") + _getS("result_announced") + _getS("admitted");

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div>
        <SectionHeader title="Pipeline KPIs" sub="Click any card to view filtered applications" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)
            : <>
                <ActionKPICard title="Total Applications" value={summary?.totalApplications ?? 0}
                  sub={`${summary?.submissions24h ?? 0} submitted today`} icon={FileText}
                  grad="from-indigo-500 to-violet-600" actionLabel="Browse all"
                  actionHref="/applications" delay={0} />
                <ActionKPICard title="Pending Verification" value={summary?.pendingVerification ?? 0}
                  sub="Documents awaiting review" icon={Clock}
                  grad="from-orange-500 to-amber-600" actionLabel="Review now"
                  actionHref="/applications?status=pending_verification" delay={1} />
                <ActionKPICard title="Tests Scheduled" value={cumulativeTestSched}
                  sub="Candidates with exam date" icon={Calendar}
                  grad="from-violet-500 to-purple-600" actionLabel="View schedule"
                  actionHref="/applications?status=test_scheduled" delay={2} />
                <ActionKPICard title="Qualified" value={summary?.admitted ?? 0}
                  sub={`${summary?.spotsRemaining ?? 0} seats remaining`} icon={CheckCircle}
                  grad="from-emerald-500 to-teal-600" actionLabel="View qualified"
                  actionHref="/applications?status=admitted" delay={3} />
              </>
          }
        </div>
      </div>

      {/* Funnel + Pending Actions */}
      <motion.div {...fade(0.1)} className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3 border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Application Conversion Funnel
                </CardTitle>
                <CardDescription className="text-xs font-medium">
                  How applicants progress stage by stage — with drop-off rates
                </CardDescription>
              </div>
              <Link href="/reports">
                <button className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  Analytics <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ConversionFunnel byStatus={summary?.byStatus ?? []} total={summary?.totalApplications ?? 0} isLoading={isLoading} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                Pending Actions
              </CardTitle>
            </div>
            <CardDescription className="text-xs font-medium">Tasks requiring your attention today</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <PendingActionsPanel summary={summary} isLoading={isLoading} />
          </CardContent>
        </Card>
      </motion.div>

      {/* By Class + By City + Activity */}
      <motion.div {...fade(0.15)} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>By Class/Program Applied</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? <Skeleton className="h-44 w-full rounded-xl" /> : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={classData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }} formatter={(v: number) => [v, "Applications"]} />
                  <Bar dataKey="count" radius={[5, 5, 0, 0]} maxBarSize={28}>
                    {classData.map((_: any, i: number) => (
                      <Cell key={i} fill={["#6366f1","#8b5cf6","#a855f7","#ec4899","#f43f5e","#f97316"][i % 6]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              By Test Centre City
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? <Skeleton className="h-44 w-full rounded-xl" /> : <GeographyChart data={centreData} />}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Recent Activity</CardTitle>
              <Link href="/applications">
                <button className="text-xs font-semibold text-indigo-600 flex items-center gap-1">All <ArrowUpRight className="h-3.5 w-3.5" /></button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? <Skeleton className="h-44 w-full rounded-xl" /> : <ActivityTimeline events={summary?.recentEvents} />}
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Actions */}
      <motion.div {...fade(0.2)}>
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
              {QUICK_ACTIONS.map((a) => (
                <Link key={a.label} href={a.href}>
                  <div className={cn("flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3.5 cursor-pointer transition-all hover:scale-[1.04] active:scale-100 text-center shadow-md bg-gradient-to-br text-white", a.grad)}>
                    <a.icon className="h-5 w-5" />
                    <span className="text-[11px] font-bold leading-tight">{a.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ─── PRINCIPAL VIEW ───────────────────────────────────────────────────────────

function PrincipalView({ summary, isLoading }: { summary: any; isLoading: boolean }) {
  const [showYoY, setShowYoY] = useState(true);

  const trendData = buildMonthlyTrend(summary?.byMonth ?? []);

  const { data: modStats, isLoading: modLoading } = useQuery<ModuleStats>({
    queryKey: ["dashboard-module-stats"],
    queryFn:  () => apiFetch("/api/admin/dashboard/module-stats"),
  });

  const { data: eventsData } = useQuery<UpcomingEvent[]>({
    queryKey: ["dashboard-upcoming-events"],
    queryFn:  () => apiFetch("/api/admin/events?status=published&upcoming=true"),
  });

  const moduleStats = MODULE_STATS_TEMPLATE.map(s => ({
    ...s,
    value: modLoading ? "—" : String((modStats?.[s.key] ?? 0).toLocaleString()),
  }));

  const upcomingEvents = (eventsData ?? []).slice(0, 6);

  return (
    <div className="space-y-5">
      {/* College KPIs */}
      <div>
        <SectionHeader title="College Overview" sub="Live counts from each module" />
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3 mt-2">
          {moduleStats.map((s, i) => (
            <motion.div key={s.label} {...fade(i * 0.04)}>
              <Card className="border-0 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 overflow-hidden text-center">
                <div className={cn("h-1 bg-gradient-to-r w-full", s.grad)} />
                <CardContent className="pt-3 pb-3 px-2">
                  <div className={cn("mx-auto mb-1.5 h-8 w-8 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm", s.grad)}>
                    <s.icon className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-xl font-extrabold text-slate-900" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{s.value}</p>
                  <p className="text-[9.5px] font-bold text-slate-500 mt-0.5 leading-tight uppercase tracking-wide">{s.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Admissions KPIs (compact) */}
      {(() => {
        const _bs: { status: string; count: number }[] = summary?.byStatus ?? [];
        const _gs = (...ks: string[]) => _bs.filter(s => ks.includes(s.status)).reduce((a, s) => a + s.count, 0);
        const cumTS = _gs("test_scheduled") + _gs("test_taken") + _gs("result_announced") + _gs("admitted");
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
              : <>
                  <ActionKPICard title="Total Applications" value={summary?.totalApplications ?? 0}
                    sub={`${summary?.submissions24h ?? 0} today`} icon={FileText}
                    grad="from-indigo-500 to-violet-600" actionHref="/applications" delay={0} />
                  <ActionKPICard title="Pending Verification" value={summary?.pendingVerification ?? 0}
                    sub="Awaiting review" icon={Clock}
                    grad="from-orange-500 to-amber-600" actionHref="/applications?status=pending_verification" delay={1} />
                  <ActionKPICard title="Tests Scheduled" value={cumTS}
                    sub="Candidates" icon={Calendar}
                    grad="from-purple-500 to-fuchsia-600" actionHref="/applications?status=test_scheduled" delay={2} />
                  <ActionKPICard title="Qualified" value={summary?.admitted ?? 0}
                    sub={`${summary?.spotsRemaining ?? 0} seats left`} icon={CheckCircle}
                    grad="from-emerald-500 to-teal-600" actionHref="/applications?status=admitted" delay={3} />
                </>
            }
          </div>
        );
      })()}

      {/* Monthly Trend YoY + Upcoming */}
      <motion.div {...fade(0.1)} className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3 border-0 shadow-md">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Applications Trend
                </CardTitle>
                <CardDescription className="text-xs font-medium">Monthly — with year-on-year comparison</CardDescription>
              </div>
              <button
                onClick={() => setShowYoY(y => !y)}
                className={cn("flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors", showYoY ? "bg-slate-100 text-slate-700 border-slate-200" : "bg-white text-slate-400 border-slate-200")}
              >
                <RefreshCw className="h-3 w-3" />
                YoY {showYoY ? "On" : "Off"}
              </button>
            </div>
            <div className="flex items-center gap-4 mt-1 flex-wrap">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <span className="h-2 w-5 rounded-full bg-violet-500 inline-block" /> 2025-26
              </div>
              {showYoY && (
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                  <span className="h-2 w-5 rounded-full bg-slate-400 inline-block" style={{ borderTop: "2px dashed #94a3b8" }} /> 2024-25
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <span className="h-2 w-5 rounded-full bg-emerald-600 inline-block" /> Qualified
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <TrendChart showYoY={showYoY} data={trendData} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Upcoming Events</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-0">
            {upcomingEvents.length === 0 ? (
              <p className="text-[12px] text-slate-400 py-4 text-center">No upcoming published events</p>
            ) : upcomingEvents.map((u, i) => {
              const { date, day } = fmtEventDate(u.startDate);
              const [dayNum, mon] = date.split(" ");
              return (
                <div key={u.id} className={cn("flex items-center gap-4 py-2.5", i < upcomingEvents.length - 1 && "border-b border-slate-100")}>
                  <div className="w-12 text-center shrink-0 rounded-xl bg-slate-50 border border-slate-200 py-1.5">
                    <p className="text-[17px] font-extrabold text-slate-900 leading-none" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{dayNum}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{mon}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-semibold text-slate-800 truncate">{u.title}</p>
                    <p className="text-[10px] text-slate-400">{day}</p>
                  </div>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wide", eventColors[u.eventType] ?? eventColors["other"])}>
                    {u.eventType}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>

      {/* Module stats (collapsible) + Activity + Alerts */}
      <motion.div {...fade(0.15)} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <SectionHeader title="Recent Activity" collapsible={false} />
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? <Skeleton className="h-44 w-full rounded-xl" /> : <ActivityTimeline events={summary?.recentEvents} />}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Alerts</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AlertsPanel summary={summary} />
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2.5">
              {QUICK_ACTIONS.map((a) => (
                <Link key={a.label} href={a.href}>
                  <div className={cn("flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3 cursor-pointer hover:scale-[1.04] transition-all text-center shadow-md bg-gradient-to-br text-white", a.grad)}>
                    <a.icon className="h-4 w-4" />
                    <span className="text-[10.5px] font-bold leading-tight">{a.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ─── HR VIEW ──────────────────────────────────────────────────────────────────

interface HRSummary {
  totalStaff: number;
  onLeaveToday: number;
  attendanceToday: Record<string, number>;
  byDepartment: { name: string; count: number }[];
  byRole: { role: string; count: number }[];
  upcomingLeaves: {
    id: string; fullName: string | null;
    leaveType: string; fromDate: string; toDate: string; status: string;
  }[];
  payroll: {
    month: string; totalNet: number; paidNet: number; pendingNet: number;
    paidCount: number; totalCount: number; generated: boolean;
  };
}

const ROLE_COLORS: Record<string, string> = {
  teacher:       "bg-blue-100 text-blue-700",
  admin:         "bg-violet-100 text-violet-700",
  support:       "bg-amber-100 text-amber-700",
  security:      "bg-red-100 text-red-700",
  medical:       "bg-rose-100 text-rose-700",
  accounts:      "bg-green-100 text-green-700",
  management:    "bg-indigo-100 text-indigo-700",
};

function fmtPKRHR(n: number) {
  return formatCurrencyCompact(n);
}

function fmtLeaveDate(d: string) {
  return formatDate(d);
}

function HRView() {
  const { data, isLoading } = useQuery<HRSummary>({
    queryKey: ["dashboard-hr-summary"],
    queryFn:  () => apiFetch("/api/admin/dashboard/hr-summary"),
    staleTime: 60_000,
  });

  const present   = data?.attendanceToday["present"]  ?? 0;
  const absent    = data?.attendanceToday["absent"]    ?? 0;
  const late      = data?.attendanceToday["late"]      ?? 0;
  const totalAtt  = present + absent + late;
  const presentPct = totalAtt > 0 ? Math.round((present / totalAtt) * 100) : 0;

  const maxDept = Math.max(...(data?.byDepartment.map(d => d.count) ?? [1]), 1);

  const payroll = data?.payroll;
  const payPct  = payroll && payroll.totalCount > 0
    ? Math.round((payroll.paidCount / payroll.totalCount) * 100) : 0;

  const hrKPIs = [
    {
      title: "Total Staff",
      value: isLoading ? "—" : String(data?.totalStaff ?? 0),
      sub:   "Active employees",
      icon: Users, grad: "from-indigo-500 to-violet-600", href: "/employees",
    },
    {
      title: "Present Today",
      value: isLoading ? "—" : `${present} (${presentPct}%)`,
      sub:   `${absent} absent · ${late} late`,
      icon: UserCheck, grad: "from-emerald-500 to-teal-600", href: "/hr?tab=attendance",
    },
    {
      title: "On Leave",
      value: isLoading ? "—" : String(data?.onLeaveToday ?? 0),
      sub:   "Active/pending today",
      icon: UserMinus, grad: "from-amber-500 to-orange-600", href: "/hr?tab=leave",
    },
    {
      title: "Payroll",
      value: isLoading ? "—" : (payroll?.generated ? fmtPKRHR(payroll.totalNet) : "Not Generated"),
      sub:   isLoading ? "Loading…" : (payroll?.generated ? `${payroll.paidCount}/${payroll.totalCount} paid (${payPct}%)` : `Month: ${payroll?.month ?? "—"}`),
      icon: Wallet, grad: "from-rose-500 to-pink-600", href: "/hr?tab=payroll",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <SectionHeader title="HR Overview" sub="Live staff, attendance & payroll data" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
          {hrKPIs.map((k, i) => (
            <ActionKPICard key={k.title} title={k.title} value={k.value} sub={k.sub}
              icon={k.icon} grad={k.grad} actionLabel="View" actionHref={k.href} delay={i} />
          ))}
        </div>
      </div>

      <motion.div {...fade(0.1)} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Department breakdown */}
        <Card className="border-0 shadow-md lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              Staff by Department
            </CardTitle>
            <CardDescription className="text-xs font-medium">Active headcount per department</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-full rounded-lg" />)
              : (data?.byDepartment.length ?? 0) === 0
                ? <p className="text-sm text-slate-400 py-6 text-center">No department data yet</p>
                : data!.byDepartment.map((dept, i) => (
                  <div key={dept.name}>
                    <div className="flex justify-between text-[12px] font-semibold text-slate-700 mb-1">
                      <span className="truncate max-w-[60%]">{dept.name}</span>
                      <span className="text-slate-500">{dept.count}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round((dept.count / maxDept) * 100)}%` }}
                        transition={{ duration: 0.7, delay: i * 0.05, ease: [0.4, 0, 0.2, 1] }}
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                      />
                    </div>
                  </div>
                ))
            }
          </CardContent>
        </Card>

        {/* Role chips + upcoming leaves */}
        <div className="space-y-4">
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                By Role
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading
                ? <Skeleton className="h-16 w-full rounded-lg" />
                : <div className="flex flex-wrap gap-2">
                    {(data?.byRole ?? []).map(r => (
                      <span key={r.role}
                        className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold",
                          ROLE_COLORS[r.role] ?? "bg-slate-100 text-slate-700")}
                      >
                        {r.role} <span className="opacity-60">·</span> {r.count}
                      </span>
                    ))}
                  </div>
              }
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                Upcoming Leaves
              </CardTitle>
              <CardDescription className="text-xs">Next 7 days</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-0">
              {isLoading
                ? <Skeleton className="h-24 w-full rounded-lg" />
                : (data?.upcomingLeaves.length ?? 0) === 0
                  ? <p className="text-[12px] text-slate-400 py-3 text-center">No upcoming leaves</p>
                  : data!.upcomingLeaves.slice(0, 5).map((l, i) => (
                    <div key={l.id}
                      className={cn("flex items-center justify-between py-2 text-[12px]",
                        i < Math.min(data!.upcomingLeaves.length, 5) - 1 && "border-b border-slate-100")}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">
                          {l.fullName ?? ""}
                        </p>
                        <p className="text-slate-400 text-[11px]">{l.leaveType}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-slate-600 font-medium">{fmtLeaveDate(l.fromDate)}</p>
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                          l.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                          {l.status}
                        </span>
                      </div>
                    </div>
                  ))
              }
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Attendance breakdown bar + quick link */}
      <motion.div {...fade(0.15)} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="border-0 shadow-md lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              Today's Attendance Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? <Skeleton className="h-20 w-full rounded-lg" /> : (
              <div className="space-y-3">
                {[
                  { label: "Present", key: "present", color: "from-emerald-500 to-teal-500" },
                  { label: "Absent",  key: "absent",  color: "from-red-500 to-rose-500"     },
                  { label: "Late",    key: "late",    color: "from-amber-500 to-orange-500"  },
                ].map(({ label, key, color }) => {
                  const val = data?.attendanceToday[key] ?? 0;
                  const pct = totalAtt > 0 ? Math.round((val / totalAtt) * 100) : 0;
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-[12px] font-semibold text-slate-700 mb-1">
                        <span>{label}</span>
                        <span>{val} ({pct}%)</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
                          className={cn("h-full rounded-full bg-gradient-to-r", color)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              Quick Links
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: "Add Staff",       href: "/employees",         grad: "from-indigo-500 to-violet-600",  icon: Users      },
                { label: "Mark Attendance", href: "/hr?tab=attendance", grad: "from-emerald-500 to-teal-600",  icon: UserCheck  },
                { label: "Leave Requests",  href: "/hr?tab=leave",      grad: "from-amber-500 to-orange-600",  icon: Briefcase  },
                { label: "Run Payroll",     href: "/hr?tab=payroll",    grad: "from-rose-500 to-pink-600",     icon: Wallet     },
              ].map(a => (
                <Link key={a.label} href={a.href}>
                  <div className={cn("flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3 cursor-pointer hover:scale-[1.04] transition-all text-center shadow-md bg-gradient-to-br text-white", a.grad)}>
                    <a.icon className="h-4 w-4" />
                    <span className="text-[10.5px] font-bold leading-tight">{a.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ─── FINANCE VIEW ─────────────────────────────────────────────────────────────

function fmtPKR(n: number): string {
  return formatCurrencyCompact(n);
}

interface FinanceKPIs {
  collectedThisMonth: number;
  paidThisWeek: number;
  outstanding: number;
  outstandingStudents: number;
}

function FinanceView() {
  const { data: feeByClassData } = useQuery<FeeByClass[]>({
    queryKey: ["dashboard-fee-by-class"],
    queryFn:  () => apiFetch("/api/admin/dashboard/fee-by-class"),
  });

  const { data: kpis } = useQuery<FinanceKPIs>({
    queryKey: ["dashboard-finance-kpis"],
    queryFn:  () => apiFetch("/api/admin/dashboard/finance-kpis"),
  });

  const feeByClass = (feeByClassData && feeByClassData.length > 0)
    ? feeByClassData
    : ([] as FeeByClass[]);

  const financeKPIs = [
    {
      title: "Collected This Month",
      value: kpis ? fmtPKR(kpis.collectedThisMonth) : "—",
      sub:   kpis ? `${["January","February","March","April","May","June","July","August","September","October","November","December"][new Date().getMonth()]} collections` : "Loading…",
      icon: Wallet, grad: "from-emerald-500 to-teal-600", href: "/finance?tab=collection",
    },
    {
      title: "Outstanding Dues",
      value: kpis ? fmtPKR(kpis.outstanding) : "—",
      sub:   kpis ? `From ${kpis.outstandingStudents} cadets` : "Loading…",
      icon: AlertCircle, grad: "from-red-500 to-rose-600", href: "/fee-master?tab=student-wise",
    },
    {
      title: "Paid This Week",
      value: kpis ? fmtPKR(kpis.paidThisWeek) : "—",
      sub:   "Last 7 days",
      icon: CheckCircle, grad: "from-blue-500 to-indigo-600", href: "/finance?tab=collection",
    },
    { title: "Scholarships Issued", value: "—", sub: "Active concessions", icon: Trophy, grad: "from-amber-500 to-orange-600", href: "/fee-master" },
  ];

  return (
    <div className="space-y-5">
      {/* Finance KPIs */}
      <div>
        <SectionHeader title="Fee & Revenue Overview" sub="Live fee collection data from the database" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
          {financeKPIs.map((k, i) => (
            <ActionKPICard key={k.title} title={k.title} value={k.value} sub={k.sub}
              icon={k.icon} grad={k.grad} actionLabel="View" actionHref={k.href} delay={i} />
          ))}
        </div>
      </div>

      {/* Fee by class chart */}
      <motion.div {...fade(0.1)} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              Fee Collection by Class
            </CardTitle>
            <CardDescription className="text-xs font-medium">Collected vs outstanding (PKR thousands)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {feeByClass.length === 0 ? (
              <p className="text-[12px] text-slate-400 py-10 text-center">No fee challan data yet</p>
            ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={feeByClass} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="cls" tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }} formatter={(v: number) => [`${v}K`, ""]} />
                  <Bar dataKey="collected"   name="Collected"   fill="#10b981" radius={[5,5,0,0]} maxBarSize={28} />
                  <Bar dataKey="outstanding" name="Outstanding" fill="#f87171" radius={[5,5,0,0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 justify-center">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><span className="h-2.5 w-4 rounded-full bg-emerald-500 inline-block" />Collected</span>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><span className="h-2.5 w-4 rounded-full bg-red-400 inline-block" />Outstanding</span>
              </div>
            </>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              Outstanding Dues — Class Breakdown
            </CardTitle>
            <CardDescription className="text-xs font-medium">Classes with unpaid balances</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {feeByClass.length === 0
              ? <p className="text-[12px] text-slate-400 py-6 text-center">No fee challan data yet</p>
              : feeByClass.map((row) => {
              const total = row.collected + row.outstanding;
              const pct   = Math.round((row.outstanding / total) * 100);
              return (
                <div key={row.cls}>
                  <div className="flex justify-between text-[12px] font-semibold text-slate-700 mb-1">
                    <span>Class {row.cls}</span>
                    <span className="text-red-500">PKR {row.outstanding}K ({pct}% unpaid)</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-red-400 to-rose-500 transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>

      {/* Alerts */}
      <motion.div {...fade(0.15)}>
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Finance Alerts</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AlertsPanel summary={undefined} />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ─── ACADEMICS VIEW ───────────────────────────────────────────────────────────

interface AcademicsSummary {
  totalStudents: number; totalClasses: number; totalSubjects: number; totalSchedules: number;
  studentsPerClass: { classCode: string; count: number }[];
  upcomingExams: {
    id: string; classCode: string; subjectName: string | null; subjectCode: string;
    examDate: string | null; sessionLabel: string; totalMarks: number; examTypeName: string | null;
  }[];
}

const ACAD_COLORS = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#f97316","#ec4899","#64748b"];

function ExamDateChip({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) return <div className="w-11 text-center shrink-0 rounded-xl bg-slate-100 py-1.5"><p className="text-[10px] font-bold text-slate-400">TBD</p></div>;
  const dt = new Date(dateStr + "T00:00:00");
  const day = String(dt.getDate()).padStart(2, "0");
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dt.getMonth()];
  return (
    <div className="w-11 text-center shrink-0 rounded-xl bg-violet-50 border border-violet-100 py-1.5">
      <p className="text-[17px] font-extrabold text-violet-700 leading-none" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{day}</p>
      <p className="text-[9px] font-bold text-violet-400 uppercase">{mon}</p>
    </div>
  );
}

function AcademicsView() {
  const { data, isLoading } = useQuery<AcademicsSummary>({
    queryKey: ["dashboard-academics-summary"],
    queryFn:  () => apiFetch("/api/admin/dashboard/academics-summary"),
    staleTime: 30_000,
  });

  const kpis = [
    { title: "Enrolled Cadets", value: data?.totalStudents ?? 0,  sub: "Active cadets",   icon: Users,         grad: "from-blue-500 to-indigo-600",   href: "/students"                   },
    { title: "Active Classes/Programs",  value: data?.totalClasses ?? 0,   sub: "Class/Program streams",   icon: GraduationCap, grad: "from-violet-500 to-purple-600", href: "/academic"                   },
    { title: "Subjects",        value: data?.totalSubjects ?? 0,  sub: "In catalogue",    icon: BookOpen,      grad: "from-teal-500 to-emerald-600",  href: "/academic?tab=setup"         },
    { title: "Exam Sittings",   value: data?.totalSchedules ?? 0, sub: "All sessions",    icon: ClipboardList, grad: "from-amber-500 to-orange-600",  href: "/examinations?tab=schedule"  },
  ];

  const spClass      = data?.studentsPerClass ?? [];
  const maxCount     = Math.max(1, ...spClass.map(r => r.count));
  const upcomingExams = data?.upcomingExams ?? [];

  const quickLinks = [
    { label: "Academic Setup",  sub: "Classes/Programs & sections",          href: "/academic",                       grad: "from-violet-500 to-purple-600", icon: GraduationCap },
    { label: "Examinations",    sub: "Schedule & results",           href: "/examinations",                   grad: "from-amber-500 to-orange-600",  icon: ClipboardList },
    { label: "Report Cards",    sub: "Print class reports",          href: "/examinations?tab=report-cards",  grad: "from-blue-500 to-indigo-600",   icon: FileText      },
    { label: "Students",        sub: "Enrolled cadet profiles",      href: "/students",                       grad: "from-teal-500 to-emerald-600",  icon: Users         },
    { label: "Timetable",       sub: "Class/Program scheduling",             href: "/timetable",                      grad: "from-rose-500 to-pink-600",     icon: Calendar      },
    { label: "Results Entry",   sub: "Enter exam marks",             href: "/examinations?tab=results",       grad: "from-slate-500 to-slate-700",   icon: BarChart3     },
  ];

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div>
        <SectionHeader title="Academic Overview" sub="Live counts from academic and exam modules" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)
            : kpis.map((k, i) => (
                <ActionKPICard key={k.title}
                  title={k.title} value={k.value} sub={k.sub}
                  icon={k.icon} grad={k.grad} actionLabel="View" actionHref={k.href} delay={i} />
              ))
          }
        </div>
      </div>

      {/* Class Strength + Quick Links */}
      <motion.div {...fade(0.1)} className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Class Strength */}
        <Card className="lg:col-span-3 border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              Class Strength
            </CardTitle>
            <CardDescription className="text-xs font-medium">Active enrolled cadets per class</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : spClass.length === 0 ? (
              <div className="py-12 text-center">
                <GraduationCap className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">No cadets enrolled yet.</p>
                <Link href="/students">
                  <button className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800">Enroll cadets →</button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {spClass.map((r, i) => {
                  const pct = Math.round((r.count / maxCount) * 100);
                  return (
                    <div key={r.classCode} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-600 w-20 shrink-0 truncate">{r.classCode}</span>
                      <div className="flex-1 h-6 bg-slate-100 rounded-xl overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.7, delay: i * 0.05, ease: [0.4, 0, 0.2, 1] }}
                          className="h-full rounded-xl flex items-center px-2.5"
                          style={{ background: `linear-gradient(90deg, ${ACAD_COLORS[i % ACAD_COLORS.length]}dd, ${ACAD_COLORS[i % ACAD_COLORS.length]}88)` }}
                        >
                          {pct > 15 && <span className="text-[10px] font-bold text-white">{r.count}</span>}
                        </motion.div>
                      </div>
                      <span className="text-xs font-bold text-slate-700 tabular-nums w-8 text-right">{r.count}</span>
                    </div>
                  );
                })}
                {spClass.length > 0 && (
                  <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[11px] font-medium text-slate-400">
                    <span>Total across all classes</span>
                    <span className="font-bold text-slate-700">{spClass.reduce((s, r) => s + r.count, 0).toLocaleString()} cadets</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        <Card className="lg:col-span-2 border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              Quick Access
            </CardTitle>
            <CardDescription className="text-xs font-medium">Navigate to academic modules</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2.5">
              {quickLinks.map((l) => (
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

      {/* Upcoming Exams */}
      <motion.div {...fade(0.15)}>
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Upcoming Exams
                </CardTitle>
                <CardDescription className="text-xs font-medium">Sittings with a scheduled date, ordered by date</CardDescription>
              </div>
              <Link href="/examinations?tab=schedule">
                <button className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  All Schedules <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : upcomingExams.length === 0 ? (
              <div className="py-10 text-center">
                <Calendar className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">No upcoming exams with a set date.</p>
                <Link href="/examinations?tab=schedule">
                  <button className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800">Schedule exams →</button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {upcomingExams.map((ex) => (
                  <Link key={ex.id} href="/examinations?tab=schedule">
                    <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:border-violet-200 hover:bg-violet-50/30 transition-colors cursor-pointer">
                      <ExamDateChip dateStr={ex.examDate} />
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-slate-800 truncate">
                          {ex.subjectName ?? ex.subjectCode}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {ex.classCode}
                          {ex.examTypeName ? ` · ${ex.examTypeName}` : ` · ${ex.sessionLabel}`}
                        </p>
                        <p className="text-[10px] text-slate-300 mt-0.5">/{ex.totalMarks} marks</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ─── OPERATIONS VIEW ──────────────────────────────────────────────────────────

interface MedicalStats {
  todayVisits: number;
  admitted: number;
  referredThisWeek: number;
  weeklyVisits: number;
  topConditions: { name: string; count: number }[];
}

interface StoreSummary {
  totalItems: number;
  lowStockCount: number;
  outOfStock: number;
  totalStockValue: number;
  todayIn: number;
  todayOut: number;
  lowStockItems: { id: string; name: string; currentStock: number; reorderLevel: number }[];
}

function OperationsView() {
  const { data: modStats, isLoading: modLoading } = useQuery<ModuleStats>({
    queryKey: ["dashboard-module-stats"],
    queryFn:  () => apiFetch("/api/admin/dashboard/module-stats"),
    staleTime: 60_000,
  });

  const { data: medical, isLoading: medLoading } = useQuery<MedicalStats>({
    queryKey: ["dashboard-medical-stats"],
    queryFn:  () => apiFetch("/api/admin/medical/stats"),
    staleTime: 60_000,
  });

  const { data: store, isLoading: storeLoading } = useQuery<StoreSummary>({
    queryKey: ["dashboard-store-summary"],
    queryFn:  () => apiFetch("/api/admin/store/summary"),
    staleTime: 60_000,
  });

  const opsKPIs = [
    { label: "Hostel Beds",    key: "hostelBedsFilled", icon: Bed,        grad: "from-orange-500 to-amber-600",  href: "/hostel"    },
    { label: "Books Issued",   key: "libraryBooksOut",  icon: BookOpen,   grad: "from-teal-500 to-emerald-600",  href: "/library"   },
    { label: "Sick Bay Today", key: "sickBayToday",     icon: HeartPulse, grad: "from-rose-500 to-red-600",      href: "/medical"   },
    { label: "Vehicles",       key: "activeVehicles",   icon: Bus,        grad: "from-sky-500 to-cyan-600",      href: "/transport" },
    { label: "Store Items",    key: "storeItems",       icon: Package,    grad: "from-amber-500 to-orange-600",  href: "/store"     },
    { label: "Staff On Leave", key: "staffOnLeave",     icon: UserMinus,  grad: "from-pink-500 to-rose-600",     href: "/hr?tab=leave" },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Module KPI tiles */}
      <div>
        <SectionHeader title="Operations Overview" sub="Live counts across all operations modules" />
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mt-2">
          {opsKPIs.map((s, i) => {
            const value = modLoading ? "—" : String((modStats?.[s.key] ?? 0).toLocaleString());
            return (
              <motion.div key={s.label} {...fade(i * 0.04)}>
                <Link href={s.href}>
                  <Card className="border-0 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 overflow-hidden text-center cursor-pointer">
                    <div className={cn("h-1 bg-gradient-to-r w-full", s.grad)} />
                    <CardContent className="pt-3 pb-3 px-2">
                      <div className={cn("mx-auto mb-1.5 h-8 w-8 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm", s.grad)}>
                        <s.icon className="h-4 w-4 text-white" />
                      </div>
                      <p className="text-xl font-extrabold text-slate-900"
                        style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{value}</p>
                      <p className="text-[9.5px] font-bold text-slate-500 mt-0.5 leading-tight uppercase tracking-wide">{s.label}</p>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>

      <motion.div {...fade(0.1)} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Medical detail */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Medical / Sick Bay
                </CardTitle>
                <CardDescription className="text-xs font-medium">Today & this week</CardDescription>
              </div>
              <Link href="/medical">
                <button className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  Open <ArrowRight className="h-3 w-3" />
                </button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {medLoading
              ? <Skeleton className="h-28 w-full rounded-lg" />
              : <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Visits Today",   value: medical?.todayVisits ?? 0,      color: "text-blue-600"   },
                      { label: "Admitted",        value: medical?.admitted ?? 0,          color: "text-rose-600"   },
                      { label: "Referred (7d)",  value: medical?.referredThisWeek ?? 0,  color: "text-amber-600"  },
                      { label: "Weekly Visits",   value: medical?.weeklyVisits ?? 0,     color: "text-teal-600"   },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                        <p className={cn("text-2xl font-extrabold", s.color)}
                          style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{s.value}</p>
                        <p className="text-[10.5px] font-semibold text-slate-500 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  {(medical?.topConditions.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Top Conditions (7d)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {medical!.topConditions.map(c => (
                          <span key={c.name}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700">
                            {c.name} <span className="opacity-60">·</span> {c.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
            }
          </CardContent>
        </Card>

        {/* Store / Inventory detail */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Store & Inventory
                </CardTitle>
                <CardDescription className="text-xs font-medium">Stock status & alerts</CardDescription>
              </div>
              <Link href="/store">
                <button className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  Open <ArrowRight className="h-3 w-3" />
                </button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {storeLoading
              ? <Skeleton className="h-28 w-full rounded-lg" />
              : <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Total Items",   value: store?.totalItems ?? 0,     color: "text-indigo-600"  },
                      { label: "Stock Value",   value: store ? fmtPKRHR(store.totalStockValue) : "—", color: "text-emerald-600" },
                      { label: "Low Stock",     value: store?.lowStockCount ?? 0,  color: "text-amber-600"  },
                      { label: "Out of Stock",  value: store?.outOfStock ?? 0,     color: "text-red-600"    },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                        <p className={cn("text-2xl font-extrabold", s.color)}
                          style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{s.value}</p>
                        <p className="text-[10.5px] font-semibold text-slate-500 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  {(store?.lowStockItems.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <ShieldAlert className="h-3 w-3 text-amber-500" /> Low Stock Alerts
                      </p>
                      <div className="space-y-1.5">
                        {store!.lowStockItems.slice(0, 5).map(item => (
                          <div key={item.id} className="flex items-center justify-between text-[12px]">
                            <span className="font-medium text-slate-700 truncate max-w-[60%]">{item.name}</span>
                            <span className="font-bold text-amber-600 shrink-0">
                              {item.currentStock} / {item.reorderLevel} min
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
            }
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick links */}
      <motion.div {...fade(0.15)}>
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              Operations Quick Links
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
              {[
                { label: "Hostel",    href: "/hostel",    grad: "from-orange-500 to-amber-600",  icon: Building2  },
                { label: "Library",   href: "/library",   grad: "from-teal-500 to-emerald-600",  icon: BookOpen   },
                { label: "Medical",   href: "/medical",   grad: "from-rose-500 to-red-600",      icon: HeartPulse },
                { label: "Transport", href: "/transport", grad: "from-sky-500 to-cyan-600",      icon: Bus        },
                { label: "Store",     href: "/store",     grad: "from-amber-500 to-orange-600",  icon: Package    },
                { label: "Sports",    href: "/sports",    grad: "from-green-500 to-emerald-600", icon: Trophy     },
              ].map(a => (
                <Link key={a.label} href={a.href}>
                  <div className={cn("flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3 cursor-pointer hover:scale-[1.04] transition-all text-center shadow-md bg-gradient-to-br text-white", a.grad)}>
                    <a.icon className="h-4 w-4" />
                    <span className="text-[10.5px] font-bold leading-tight">{a.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: summary, isLoading } = useGetAdminDashboardSummary();
  const { data: me } = useGetAdminMe({ query: { queryKey: getGetAdminMeQueryKey(), retry: false } });
  const [role, setRole] = useState<RoleId>("admissions");

  const dateStr = formatDate(new Date());

  const admitPct = Math.round(((summary?.admitted ?? 0) / (summary?.totalSeats ?? 350)) * 100);

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto pb-10">

      {/* ── Hero + Role Switcher ─────────────────────────────────────── */}
      <motion.div {...fade(0)}
        className="relative overflow-hidden rounded-3xl px-7 py-6 text-white shadow-2xl"
        style={{ background: "linear-gradient(135deg,#064A1A 0%,#0f172a 50%,#1e1b4b 100%)" }}
      >
        <div className="absolute -top-12 -right-12 h-56 w-56 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute -bottom-10 left-16 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl" />

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Left: greeting */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="h-4 w-4 text-yellow-300" />
              <span className="text-sm font-semibold text-white/75">{greeting()}, {me?.name ?? "Admin"}</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight mb-0.5" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              CCM Admin Dashboard
            </h1>
            <p className="text-white/55 text-sm font-medium">{dateStr}</p>

            {/* Seat bar */}
            <div className="mt-3 flex items-center gap-3 max-w-xs">
              <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${admitPct}%` }}
                  transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300"
                />
              </div>
              <span className="text-[11px] font-bold text-white/70 whitespace-nowrap">
                {admitPct}% seats filled
              </span>
            </div>
          </div>

          {/* Right: stat chips + role switcher */}
          <div className="flex flex-col items-end gap-3">
            {/* Stat chips */}
            <div className="flex items-center gap-2">
              {[
                { l: "Session",   v: "2026-27" },
                { l: "Seats",     v: String(summary?.totalSeats ?? 350) },
                { l: "Remaining", v: String(summary?.spotsRemaining ?? "—"), accent: "text-emerald-300" },
              ].map(({ l, v, accent }) => (
                <div key={l} className="rounded-2xl border border-white/15 bg-white/8 px-4 py-2.5 text-center backdrop-blur-sm">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/50">{l}</p>
                  <p className={cn("text-lg font-extrabold mt-0.5", accent ?? "text-white")}
                    style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{v}</p>
                </div>
              ))}
            </div>

            {/* Role switcher */}
            <div className="flex items-center rounded-2xl bg-white/10 border border-white/15 p-1 gap-1 backdrop-blur-sm">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-bold transition-all duration-200",
                    role === r.id
                      ? "bg-white text-slate-900 shadow-md"
                      : "text-white/60 hover:text-white/90"
                  )}
                >
                  <r.icon className={cn("h-3.5 w-3.5", role === r.id ? "text-indigo-600" : "")} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Role View ────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={role}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
        >
          {role === "admissions" && <AdmissionsView summary={summary} isLoading={isLoading} />}
          {role === "principal"  && <PrincipalView  summary={summary} isLoading={isLoading} />}
          {role === "finance"    && <FinanceView />}
          {role === "academics"  && <AcademicsView />}
          {role === "hr"         && <HRView />}
          {role === "operations" && <OperationsView />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
