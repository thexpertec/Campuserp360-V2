import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { HeartPulse, UserRound, Phone, Activity, Pill } from "lucide-react";
import { MedicalVisitsTab } from "./MedicalVisitsTab";
import { MedicalSetupTab } from "./MedicalSetupTab";
import { MedicalMedicationsTab } from "./MedicalMedicationsTab";

function ComingSoonPanel({ title, sub, icon: Icon }: { title: string; sub: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
      <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center">
        <Icon className="h-8 w-8 text-slate-400" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-700">{title}</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-xs">{sub}</p>
      </div>
      <span className="text-xs font-medium px-3 py-1 rounded-full bg-slate-100 text-slate-500">Coming Soon</span>
    </div>
  );
}

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

interface Stats {
  todayVisits: number;
  admitted: number;
  referredThisWeek: number;
  weeklyVisits: number;
  topConditions: { name: string; count: number }[];
}

interface Visit {
  id: string; studentName: string; applicantId: string | null; classCode: string | null;
  complaint: string; conditionName: string | null; status: string; visitDate: string;
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

export function MedicalDashboard({ tab = "dashboard" }: { tab?: string }) {
  if (tab === "sick-bay" || tab === "patients") return <MedicalVisitsTab />;
  if (tab === "setup") return <MedicalSetupTab />;
  if (tab === "medications") return <MedicalMedicationsTab />;

  const { data: stats, isLoading: sLoading } = useQuery<Stats>({
    queryKey: ["medical-stats"],
    queryFn: () => apiFetch("/api/admin/medical/stats"),
    staleTime: 30_000,
  });

  const { data: admitted = [], isLoading: aLoading } = useQuery<Visit[]>({
    queryKey: ["medical-visits", "inpatient", "dash"],
    queryFn: () => apiFetch("/api/admin/medical/visits?status=inpatient"),
    staleTime: 20_000,
  });

  const { data: todayVisits = [], isLoading: tLoading } = useQuery<Visit[]>({
    queryKey: ["medical-visits", "today-dash"],
    queryFn: () => apiFetch(`/api/admin/medical/visits?date=${new Date().toISOString().slice(0, 10)}`),
    staleTime: 20_000,
  });

  const isLoading = sLoading || aLoading || tLoading;
  const topConditions = stats?.topConditions ?? [];
  const condMax = Math.max(1, ...topConditions.map(c => c.count));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Sick Bay & Medical</h2>
        <p className="text-sm text-slate-500 mt-0.5">Patient visits, admissions and health tracking.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Today's Visits"    value={sLoading ? "…" : (stats?.todayVisits ?? 0)}      icon={HeartPulse}  color="text-red-600"    bg="bg-red-50" />
        <StatCard label="Admitted"          value={sLoading ? "…" : (stats?.admitted ?? 0)}         icon={UserRound}   color="text-orange-600" bg="bg-orange-50" sub="currently in sick bay" />
        <StatCard label="Referred (7 days)" value={sLoading ? "…" : (stats?.referredThisWeek ?? 0)} icon={Phone}       color="text-purple-600" bg="bg-purple-50" />
        <StatCard label="Weekly Visits"     value={sLoading ? "…" : (stats?.weeklyVisits ?? 0)}     icon={Activity}    color="text-blue-600"   bg="bg-blue-50" sub="last 7 days" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top conditions this week */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Common Conditions (7 days)</h3>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-4 bg-slate-100 rounded-full animate-pulse" />)}</div>
          ) : topConditions.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No visit data yet</p>
          ) : (
            <div className="space-y-3">
              {topConditions.map(({ name, count }) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 font-medium w-28 flex-shrink-0 truncate">{name}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-red-400" style={{ width: `${(count / condMax) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-5 text-right tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Currently admitted */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <UserRound className="h-4 w-4 text-orange-400" /> Currently Admitted
          </h3>
          {aLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-8 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : admitted.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No patients currently admitted</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {admitted.map(v => (
                <div key={v.id} className="flex items-center gap-3 py-2">
                  <div className="h-7 w-7 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0 text-orange-600 font-bold text-xs">
                    {(v.studentName ?? "?")[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{v.studentName}</p>
                    <p className="text-xs text-slate-400 truncate">{v.complaint}</p>
                  </div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 flex-shrink-0">
                    Since {v.visitDate}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Today's visits summary */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Today's Visits</h3>
        {tLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : todayVisits.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No visits recorded today</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {todayVisits.map(v => {
              const statusColor = {
                outpatient: "border-blue-100 bg-blue-50/50",
                inpatient:  "border-orange-200 bg-orange-50",
                referred:   "border-purple-100 bg-purple-50/50",
                discharged: "border-green-100 bg-green-50/50",
              }[v.status] ?? "border-slate-100";
              return (
                <div key={v.id} className={`rounded-lg border px-3 py-2 ${statusColor}`}>
                  <p className="text-sm font-medium text-slate-800 truncate">{v.studentName}</p>
                  <p className="text-xs text-slate-500 truncate">{v.conditionName ?? v.complaint}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
