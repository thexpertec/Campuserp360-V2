import { useQuery } from "@tanstack/react-query";
import { useListAdminHouses } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import { formatDate } from "@/lib/locale";
import {
  Users, GraduationCap, UserCheck, UserX, Clock, TrendingUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface StudentStats {
  total: number;
  byStatus: { status: string; count: number }[];
  byClass:  { classCode: string; count: number }[];
  byHouse:  { houseId: string; count: number }[];
  recent:   { id: string; applicantId: string; fullName: string; classCode: string; status: string; createdAt: string }[];
}

const STATUS_META: Record<string, { label: string; color: string; bar: string; icon: React.ComponentType<{ className?: string }> }> = {
  active:      { label: "Active",      color: "text-green-700 bg-green-50 border-green-200",   bar: "bg-green-500",  icon: UserCheck },
  alumni:      { label: "Alumni",      color: "text-blue-700 bg-blue-50 border-blue-200",      bar: "bg-blue-500",   icon: GraduationCap },
  expelled:    { label: "Expelled",    color: "text-red-700 bg-red-50 border-red-200",          bar: "bg-red-500",    icon: UserX },
  transferred: { label: "Transferred", color: "text-orange-700 bg-orange-50 border-orange-200", bar: "bg-orange-400", icon: TrendingUp },
  deceased:    { label: "Deceased",    color: "text-slate-600 bg-slate-100 border-slate-200",   bar: "bg-slate-400",  icon: Users },
};

async function fetchStats(): Promise<StudentStats> {
  const token = getToken();
  const res = await fetch("/api/admin/students/stats", {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error("Failed to load stats");
  return res.json();
}

const fmtDate = (iso: string) => formatDate(iso);

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, bg }: {
  label: string; value: string | number;
  icon: React.ComponentType<{ className?: string }>; color: string; bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-5 py-4 flex items-center gap-4 shadow-sm">
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider truncate">{label}</p>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
      </div>
    </div>
  );
}

// ── Bar row ───────────────────────────────────────────────────────────────────
function BarRow({ label, count, max, barColor }: { label: string; count: number; max: number; barColor: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-600 font-medium w-24 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700 w-8 text-right tabular-nums">{count}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function StudentsDashboard() {
  const { data: stats, isLoading, error } = useQuery<StudentStats>({
    queryKey: ["student-stats"],
    queryFn: fetchStats,
    staleTime: 30_000,
  });
  const { data: housesRaw } = useListAdminHouses();
  const houseMap = Object.fromEntries(
    (Array.isArray(housesRaw) ? (housesRaw as any[]) : []).map((h: any) => [h.id, h.name])
  );

  const active      = stats?.byStatus.find(s => s.status === "active")?.count      ?? 0;
  const alumni      = stats?.byStatus.find(s => s.status === "alumni")?.count      ?? 0;
  const transferred = stats?.byStatus.find(s => s.status === "transferred")?.count ?? 0;
  const classMax    = Math.max(1, ...(stats?.byClass.map(c => c.count) ?? [1]));
  const houseMax    = Math.max(1, ...(stats?.byHouse.map(h => h.count) ?? [1]));

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center text-sm text-red-600">
        Could not load student statistics. Please refresh.
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Students</h2>
        <p className="text-sm text-slate-500 mt-0.5">Dashboard — Enrolment overview, class and house distribution.</p>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Enrolled" value={isLoading ? "…" : stats?.total ?? 0} icon={Users}         color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard label="Active Cadets"  value={isLoading ? "…" : active}             icon={UserCheck}     color="text-green-600"  bg="bg-green-50" />
        <StatCard label="Alumni"         value={isLoading ? "…" : alumni}             icon={GraduationCap} color="text-blue-600"   bg="bg-blue-50" />
        <StatCard label="Transferred"    value={isLoading ? "…" : transferred}        icon={TrendingUp}    color="text-orange-500" bg="bg-orange-50" />
      </div>

      {/* ── Middle row: by-class + by-status ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Class breakdown */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Active Cadets by Class</h3>
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-4 bg-slate-100 rounded-full animate-pulse" />)}
            </div>
          ) : stats?.byClass.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No active students yet</p>
          ) : (
            <div className="space-y-3">
              {stats?.byClass.map(c => (
                <BarRow key={c.classCode} label={c.classCode} count={c.count} max={classMax} barColor="bg-indigo-500" />
              ))}
            </div>
          )}
        </div>

        {/* Status distribution */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Enrolment by Status</h3>
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-4 bg-slate-100 rounded-full animate-pulse" />)}
            </div>
          ) : stats?.byStatus.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No students yet</p>
          ) : (
            <div className="space-y-3">
              {stats?.byStatus.sort((a, b) => b.count - a.count).map(s => {
                const meta = STATUS_META[s.status] ?? { label: s.status, bar: "bg-slate-400", color: "", icon: Users };
                return (
                  <div key={s.status} className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 w-24 text-center ${meta.color}`}>{meta.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${Math.round((s.count / (stats?.total || 1)) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 w-8 text-right tabular-nums">{s.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom row: by-house + recent enrollments ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* House distribution */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Active Cadets by House</h3>
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-4 bg-slate-100 rounded-full animate-pulse" />)}
            </div>
          ) : stats?.byHouse.filter(h => h.houseId !== "__none__").length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No house assignments yet</p>
          ) : (
            <div className="space-y-3">
              {stats?.byHouse.filter(h => h.houseId !== "__none__").sort((a, b) => b.count - a.count).map(h => (
                <BarRow key={h.houseId} label={houseMap[h.houseId] ?? h.houseId} count={h.count} max={houseMax} barColor="bg-emerald-500" />
              ))}
            </div>
          )}
        </div>

        {/* Recent enrollments */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" /> Recent Enrollments
          </h3>
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-8 bg-slate-100 rounded-lg animate-pulse" />)}
            </div>
          ) : !stats?.recent.length ? (
            <p className="text-xs text-slate-400 text-center py-6">No students yet</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {stats.recent.map(s => {
                const meta = STATUS_META[s.status];
                return (
                  <div key={s.id} className="flex items-center gap-3 py-2">
                    <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {s.fullName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{s.fullName}</p>
                      <p className="text-xs text-slate-400 font-mono">{s.applicantId} · {s.classCode}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${meta?.color ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {meta?.label ?? s.status}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(s.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
