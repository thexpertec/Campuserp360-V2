import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import {
  ClipboardList, Users, Clock, TrendingUp, MapPin, Star, CheckCircle2,
} from "lucide-react";

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

interface AdminSummary {
  totalApplications: number;
  submissions24h: number;
  totalSeats: number;
  spotsRemaining: number;
  pendingVerification: number;
  underReview: number;
  testScheduled: number;
  testTaken: number;
  resultAnnounced: number;
  admitted: number;
  enrolledStudents: number;
  byStatus: { status: string; count: number }[];
}

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

function sumStatuses(byStatus: { status: string; count: number }[], keys: string[]): number {
  return byStatus
    .filter(r => keys.includes(r.status))
    .reduce((acc, r) => acc + r.count, 0);
}

export function AdmissionsDashboard({ tab = "dashboard" }: { tab?: string }) {
  const { data: summary, isLoading } = useQuery<AdminSummary>({
    queryKey: ["/api/admin/dashboard/summary"],
    queryFn: () => apiFetch("/api/admin/dashboard/summary"),
    staleTime: 30_000,
  });

  const totalApps  = summary?.totalApplications ?? 0;
  const totalSeats = summary?.totalSeats ?? 0;
  const filled     = totalSeats > 0 ? Math.round(((totalSeats - (summary?.spotsRemaining ?? totalSeats)) / totalSeats) * 100) : 0;

  const byStatus = summary?.byStatus ?? [];

  const PIPELINE_STAGES = [
    {
      label: "Submitted",
      color: "bg-blue-500",
      count: sumStatuses(byStatus, ["submitted", "pending_verification", "under_review", "fee_paid"]),
    },
    {
      label: "Entry Test",
      color: "bg-indigo-500",
      count: sumStatuses(byStatus, ["test_scheduled", "test_taken", "result_announced"]),
    },
    {
      label: "Interview",
      color: "bg-violet-500",
      count: sumStatuses(byStatus, ["interview_scheduled", "interview_taken"]),
    },
    {
      label: "Merit List",
      color: "bg-amber-500",
      count: sumStatuses(byStatus, ["merit_listed", "waitlisted", "admitted"]),
    },
    {
      label: "Enrolled",
      color: "bg-green-500",
      count: summary?.enrolledStudents ?? 0,
    },
  ];

  const maxPipelineCount = Math.max(1, ...PIPELINE_STAGES.map(s => s.count));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Admissions</h2>
        <p className="text-sm text-slate-500 mt-0.5">Application pipeline — current session</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Applications"
          value={isLoading ? "…" : totalApps}
          icon={ClipboardList} color="text-blue-600" bg="bg-blue-50"
        />
        <StatCard
          label="Seats Available"
          value={isLoading ? "…" : summary?.spotsRemaining ?? 0}
          icon={Users} color="text-green-600" bg="bg-green-50"
        />
        <StatCard
          label="Last 24 h"
          value={isLoading ? "…" : summary?.submissions24h ?? 0}
          icon={Clock} color="text-amber-600" bg="bg-amber-50"
          sub="New applications in the last 24 hours"
        />
        <StatCard
          label="Seats Filled"
          value={isLoading ? "…" : `${filled}%`}
          icon={TrendingUp} color="text-indigo-600" bg="bg-indigo-50"
        />
      </div>

      {/* Seat fill bar */}
      {!isLoading && summary && (
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700">Seat Utilisation</h3>
            <span className="text-xs text-slate-500">{totalApps} applicants / {totalSeats} total seats</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(100, filled)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1.5">
            <span>0</span><span>{totalSeats} total seats</span>
          </div>
        </div>
      )}

      {/* Pipeline overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Admission Pipeline</h3>
          <div className="space-y-3">
            {PIPELINE_STAGES.map(s => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="text-xs text-slate-600 font-medium w-24 flex-shrink-0">{s.label}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${s.color} transition-all`}
                    style={{ width: isLoading ? "0%" : `${Math.round((s.count / maxPipelineCount) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-slate-600 w-8 text-right tabular-nums">
                  {isLoading ? "…" : s.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Quick Navigation</h3>
          <div className="space-y-2">
            {[
              { icon: ClipboardList, label: "All Applications",  sub: "View & manage submissions"  },
              { icon: Star,          label: "Entry Test",         sub: "Scheduling and results"      },
              { icon: Users,         label: "Interview Panel",    sub: "Assessments and scoring"     },
              { icon: TrendingUp,    label: "Merit List",         sub: "Final ranking and offers"    },
              { icon: CheckCircle2,  label: "Enrolment",          sub: "Confirmed GR assignments"    },
              { icon: MapPin,        label: "Test Venues",        sub: "Venue management"            },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors cursor-default">
                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">{label}</p>
                  <p className="text-xs text-slate-400">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
