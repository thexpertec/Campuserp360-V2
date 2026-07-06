import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { ShieldCheck, Users, FileText, AlertTriangle, UserCheck, UserRound, IdCard } from "lucide-react";
import { GateLogTab } from "./GateLogTab";
import { GateOutpassTab } from "./GateOutpassTab";

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
  todayEntries: number;
  onCampus: number;
  activeOutpasses: number;
  expiringToday: number;
  byType: Record<string, number>;
}

interface GateLog {
  id: string; personName: string; personType: string; purpose: string | null;
  inTime: string; outTime: string | null; phone: string | null;
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

const TYPE_COLORS: Record<string, string> = {
  visitor:  "bg-blue-100 text-blue-700",
  student:  "bg-green-100 text-green-700",
  staff:    "bg-purple-100 text-purple-700",
  delivery: "bg-orange-100 text-orange-700",
  vendor:   "bg-amber-100 text-amber-700",
};
const TYPE_LABELS: Record<string, string> = { visitor: "Visitor", student: "Student", staff: "Staff", delivery: "Delivery", vendor: "Vendor" };

export function GateDashboard({ tab = "dashboard" }: { tab?: string }) {
  if (tab === "log")        return <GateLogTab />;
  if (tab === "outpass")    return <GateOutpassTab />;
  if (tab === "visitors")   return <ComingSoonPanel title="Visitor Management" sub="Register and track all campus visitors with pass issuance and identity verification." icon={UserRound} />;
  if (tab === "staff-pass") return <ComingSoonPanel title="Staff Gate Pass" sub="Manage staff entry/exit authorizations and temporary access passes." icon={IdCard} />;

  const today = new Date().toISOString().slice(0, 10);

  const { data: stats, isLoading: sLoading } = useQuery<Stats>({
    queryKey: ["gate-stats"],
    queryFn: () => apiFetch("/api/admin/gate/stats"),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const { data: recentLogs = [], isLoading: lLoading } = useQuery<GateLog[]>({
    queryKey: ["gate-log", today, "all"],
    queryFn: () => apiFetch(`/api/admin/gate/log?date=${today}`),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const byType = stats?.byType ?? {};
  const onSite = recentLogs.filter(l => !l.outTime);
  const isLoading = sLoading || lLoading;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Gate Security</h2>
        <p className="text-sm text-slate-500 mt-0.5">Campus entry/exit log and cadet out-passes.</p>
      </div>

      {/* Expiring alert */}
      {!sLoading && (stats?.expiringToday ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            {stats!.expiringToday} cadet out-pass{stats!.expiringToday !== 1 ? "es" : ""} expiring today
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Today's Entries"    value={sLoading ? "…" : (stats?.todayEntries ?? 0)}   icon={ShieldCheck}   color="text-blue-600"   bg="bg-blue-50" />
        <StatCard label="On Campus Now"      value={sLoading ? "…" : (stats?.onCampus ?? 0)}       icon={UserCheck}     color="text-green-600"  bg="bg-green-50" sub="checked in, not out" />
        <StatCard label="Active Out-Passes"  value={sLoading ? "…" : (stats?.activeOutpasses ?? 0)} icon={FileText}     color="text-purple-600" bg="bg-purple-50" />
        <StatCard label="Expiring Today"     value={sLoading ? "…" : (stats?.expiringToday ?? 0)}  icon={AlertTriangle} color="text-amber-600"  bg="bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Visitor type breakdown */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Today's Entries by Type</h3>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-4 bg-slate-100 rounded-full animate-pulse" />)}</div>
          ) : Object.keys(byType).length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No entries today yet</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {Object.entries(byType).map(([type, count]) => (
                <div key={type} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${TYPE_COLORS[type] ?? "bg-slate-100 text-slate-700"}`}>
                  <span className="text-sm font-semibold tabular-nums">{count}</span>
                  <span className="text-sm">{TYPE_LABELS[type] ?? type}{count !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Currently on campus */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
            Currently On Campus
          </h3>
          {lLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-8 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : onSite.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No one checked in without checkout today</p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
              {onSite.map(l => {
                const tc = TYPE_COLORS[l.personType] ?? "bg-slate-100 text-slate-600";
                return (
                  <div key={l.id} className="flex items-center gap-3 py-2">
                    <div className="h-7 w-7 rounded-full bg-slate-50 border border-border flex items-center justify-center flex-shrink-0 text-slate-500 font-bold text-xs">
                      {l.personName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{l.personName}</p>
                      <p className="text-xs text-slate-400">{l.purpose || "—"}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tc}`}>{TYPE_LABELS[l.personType] ?? l.personType}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{l.inTime.slice(11, 16) || l.inTime}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Today's full log summary */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Today's Activity</h3>
        {lLoading ? (
          <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-8 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : recentLogs.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No activity yet today</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {recentLogs.slice(0, 12).map(l => {
              const tc = TYPE_COLORS[l.personType] ?? "bg-slate-100 text-slate-600";
              const out = !!l.outTime;
              return (
                <div key={l.id} className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${out ? "border-green-100 bg-green-50/50" : "border-blue-100 bg-blue-50/50"}`}>
                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${out ? "bg-green-400" : "bg-blue-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{l.personName}</p>
                    <p className="text-[10px] text-slate-400">
                      In: {l.inTime.slice(11, 16) || l.inTime}{l.outTime ? ` · Out: ${l.outTime.slice(11, 16) || l.outTime}` : " · On campus"}
                    </p>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${tc}`}>{TYPE_LABELS[l.personType]?.[0] ?? "?"}</span>
                </div>
              );
            })}
          </div>
        )}
        {recentLogs.length > 12 && (
          <p className="text-xs text-slate-400 mt-3 text-center">Showing first 12 of {recentLogs.length} entries · Go to Log tab to see all</p>
        )}
      </div>
    </div>
  );
}
