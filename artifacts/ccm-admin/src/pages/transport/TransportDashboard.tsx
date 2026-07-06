import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { formatDate } from "@/lib/locale";
import { Bus, Users, Route, CalendarCheck, ArrowRight } from "lucide-react";
import { TransportDriversTab } from "./TransportDriversTab";
import { TransportTripsTab } from "./TransportTripsTab";
import { TransportFleetTab } from "./TransportFleetTab";

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

interface Driver { id: string; name?: string; licenseExpiry?: string; status?: string; }
interface Trip {
  id: string; tripDate?: string; status?: string;
  routeName?: string; routeOrigin?: string; routeDestination?: string;
  vehicleRegNo?: string; driverName?: string; departureTime?: string;
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

const STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
  scheduled:    { color: "text-blue-700",   bg: "bg-blue-50" },
  "in-progress":{ color: "text-amber-700",  bg: "bg-amber-50" },
  completed:    { color: "text-green-700",  bg: "bg-green-50" },
  cancelled:    { color: "text-red-600",    bg: "bg-red-50" },
};

export function TransportDashboard({ tab = "dashboard" }: { tab?: string }) {
  if (tab === "drivers") return <TransportDriversTab />;
  if (tab === "trips")   return <TransportTripsTab />;
  if (tab === "fleet")   return <TransportFleetTab />;

  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: drivers = [], isLoading: dLoading } = useQuery<Driver[]>({
    queryKey: ["transport-drivers-dash"],
    queryFn: () => apiFetch("/api/admin/transport/drivers"),
    staleTime: 30_000,
  });
  const { data: trips = [], isLoading: tLoading } = useQuery<Trip[]>({
    queryKey: ["transport-trips-dash"],
    queryFn: () => apiFetch("/api/admin/transport/trips"),
    staleTime: 30_000,
  });

  const isLoading    = dLoading || tLoading;
  const totalDrivers = drivers.length;
  const todayTrips   = trips.filter(t => (t.tripDate ?? "").slice(0, 10) === todayIso);
  const inProgress   = todayTrips.filter(t => t.status === "in-progress").length;

  // Unique routes used
  const routeSet = new Set(trips.map(t => t.routeName).filter(Boolean));

  // Today's trips for live view
  const liveTodayTrips = [...todayTrips].sort((a, b) => (a.departureTime ?? "").localeCompare(b.departureTime ?? ""));

  // Recent trips (non-today)
  const recentTrips = [...trips]
    .filter(t => (t.tripDate ?? "").slice(0, 10) !== todayIso)
    .sort((a, b) => (b.tripDate ?? "").localeCompare(a.tripDate ?? ""))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Transport</h2>
        <p className="text-sm text-slate-500 mt-0.5">Fleet management, daily trips and route tracking.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Drivers"       value={isLoading ? "…" : totalDrivers}        icon={Users}        color="text-blue-600"   bg="bg-blue-50" />
        <StatCard label="Routes"        value={isLoading ? "…" : routeSet.size}       icon={Route}        color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard label="Today's Trips" value={isLoading ? "…" : todayTrips.length}   icon={Bus}          color="text-green-600"  bg="bg-green-50"
          sub={inProgress > 0 ? `${inProgress} in progress` : undefined} />
        <StatCard label="All-Time Trips" value={isLoading ? "…" : trips.length}       icon={CalendarCheck} color="text-amber-600" bg="bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Today's live schedule */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Today's Schedule</h3>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : liveTodayTrips.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No trips logged for today — go to the Trips tab to add some.</p>
          ) : (
            <div className="space-y-2">
              {liveTodayTrips.map(t => {
                const s = STATUS_CONFIG[t.status ?? "scheduled"];
                return (
                  <div key={t.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${s.bg}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${s.color}`}>{t.routeName ?? "Route TBD"}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {[t.vehicleRegNo, t.driverName].filter(Boolean).join(" · ")}
                        {t.departureTime ? ` · ${t.departureTime}` : ""}
                      </p>
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${s.color} bg-white/70`}>
                      {t.status?.replace("-", " ") ?? "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent trips (past days) */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Recent Trips</h3>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-8 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : recentTrips.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No past trips yet</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentTrips.map(t => (
                <div key={t.id} className="flex items-center gap-3 py-2">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Bus className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {t.routeName ?? "—"}
                      {t.routeOrigin && t.routeDestination && (
                        <span className="text-xs text-slate-400 ml-1 inline-flex items-center gap-0.5">
                          ({t.routeOrigin} <ArrowRight className="h-3 w-3" /> {t.routeDestination})
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">{[t.vehicleRegNo, t.driverName].filter(Boolean).join(" · ") || "No assignment"}</p>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0">
                    {t.tripDate ? formatDate(t.tripDate + "T00:00:00") : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
