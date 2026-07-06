import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Trophy, Users, CalendarDays, Star, Activity, Clock, MapPin, Medal } from "lucide-react";
import { SportsTeamsTab } from "./SportsTeamsTab";
import { SportsFixturesTab } from "./SportsFixturesTab";
import { SportsSetupTab } from "./SportsSetupTab";

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

interface Team    { id: string; name: string; sportCategoryId: string | null; sportCategoryName: string | null; house: string | null; }
interface Fixture { id: string; homeTeam: string; awayTeam: string; sport: string | null; venueName: string | null; scheduledDate: string; scheduledTime: string | null; status: string; homeScore: number | null; awayScore: number | null; result: string | null; }

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

export function SportsDashboard({ tab = "dashboard" }: { tab?: string }) {
  if (tab === "teams")        return <SportsTeamsTab />;
  if (tab === "fixtures")     return <SportsFixturesTab />;
  if (tab === "setup")        return <SportsSetupTab />;
  if (tab === "cocurricular") return <ComingSoonPanel title="Co-curricular Activities" sub="Manage clubs, activity groups, participation records and achievements." icon={Medal} />;

  const today = new Date().toISOString().slice(0, 10);

  const { data: teams = [], isLoading: tLoading } = useQuery<Team[]>({
    queryKey: ["sports-teams-dash"],
    queryFn: () => apiFetch("/api/admin/sports/teams"),
    staleTime: 30_000,
  });

  const { data: upcoming = [], isLoading: uLoading } = useQuery<Fixture[]>({
    queryKey: ["sports-fixtures-dash", "upcoming"],
    queryFn: () => apiFetch(`/api/admin/sports/fixtures?upcoming=true`),
    staleTime: 30_000,
  });

  const { data: recent = [], isLoading: rLoading } = useQuery<Fixture[]>({
    queryKey: ["sports-fixtures-dash", "completed"],
    queryFn: () => apiFetch(`/api/admin/sports/fixtures?status=completed`),
    staleTime: 30_000,
  });

  const isLoading = tLoading || uLoading || rLoading;

  const totalTeams   = teams.length;
  const upcomingCount = upcoming.filter(f => f.status === "scheduled").length;
  const completedCount = recent.length;

  // Teams by sport using joined sportCategoryName
  const bySport: Record<string, number> = {};
  teams.forEach(t => {
    const s = t.sportCategoryName ?? "Other";
    bySport[s] = (bySport[s] ?? 0) + 1;
  });
  const sportEntries = Object.entries(bySport).sort(([, a], [, b]) => b - a);
  const sportMax = Math.max(1, ...sportEntries.map(([, v]) => v));

  // Next 6 upcoming fixtures (sorted by date asc)
  const nextFixtures = [...upcoming]
    .filter(f => f.status === "scheduled")
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    .slice(0, 6);

  // Recent 5 completed results
  const recentResults = [...recent].slice(0, 5);

  const todayFixtures = upcoming.filter(f => f.scheduledDate === today);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Sports</h2>
        <p className="text-sm text-slate-500 mt-0.5">Teams, fixtures and co-curricular activities.</p>
      </div>

      {/* Today alert */}
      {todayFixtures.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <Trophy className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            {todayFixtures.length} match{todayFixtures.length !== 1 ? "es" : ""} scheduled today:{" "}
            {todayFixtures.map(f => `${f.homeTeam} vs ${f.awayTeam}`).join(", ")}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Teams"   value={isLoading ? "…" : totalTeams}     icon={Trophy}      color="text-amber-600"  bg="bg-amber-50" />
        <StatCard label="Sports"        value={isLoading ? "…" : sportEntries.length} icon={Activity} color="text-blue-600"  bg="bg-blue-50" />
        <StatCard label="Upcoming"      value={isLoading ? "…" : upcomingCount}  icon={CalendarDays} color="text-indigo-600" bg="bg-indigo-50" sub="scheduled fixtures" />
        <StatCard label="Completed"     value={isLoading ? "…" : completedCount} icon={Star}        color="text-green-600"  bg="bg-green-50" sub="finished matches" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Teams by sport */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" /> Teams by Sport
          </h3>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-4 bg-slate-100 rounded-full animate-pulse" />)}</div>
          ) : sportEntries.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No teams yet — add them from the Teams tab</p>
          ) : (
            <div className="space-y-3">
              {sportEntries.map(([sport, cnt]) => (
                <div key={sport} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 font-medium w-24 flex-shrink-0 truncate">{sport}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${(cnt / sportMax) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-6 text-right tabular-nums">{cnt}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming fixtures */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-slate-400" /> Upcoming Fixtures
          </h3>
          {uLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-8 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : nextFixtures.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No upcoming fixtures scheduled</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {nextFixtures.map(f => {
                const isToday = f.scheduledDate === today;
                return (
                  <div key={f.id} className={`flex items-center gap-3 py-2 ${isToday ? "bg-amber-50/50 -mx-1 px-1 rounded-lg" : ""}`}>
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isToday ? "bg-amber-100" : "bg-slate-50"}`}>
                      <Trophy className={`h-4 w-4 ${isToday ? "text-amber-600" : "text-slate-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{f.homeTeam} vs {f.awayTeam}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        {f.sport && <span>{f.sport}</span>}
                        {f.venueName && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{f.venueName}</span>}
                        {f.scheduledTime && <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{f.scheduledTime}</span>}
                      </p>
                    </div>
                    <span className={`text-xs font-bold flex-shrink-0 ${isToday ? "text-amber-600" : "text-indigo-600"}`}>
                      {isToday ? "Today" : f.scheduledDate}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent results */}
      {recentResults.length > 0 && (
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Star className="h-4 w-4 text-green-500" /> Recent Results
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentResults.map(f => {
              const homeWon = f.homeScore != null && f.awayScore != null && f.homeScore > f.awayScore;
              const awayWon = f.homeScore != null && f.awayScore != null && f.awayScore > f.homeScore;
              return (
                <div key={f.id} className="rounded-lg border border-border p-3 bg-green-50/30">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-semibold truncate ${homeWon ? "text-green-700" : "text-slate-700"}`}>{f.homeTeam}</span>
                    <span className="text-lg font-bold text-slate-800 font-mono flex-shrink-0 tabular-nums">
                      {f.homeScore ?? "—"} – {f.awayScore ?? "—"}
                    </span>
                    <span className={`text-sm font-semibold truncate text-right ${awayWon ? "text-green-700" : "text-slate-700"}`}>{f.awayTeam}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-xs text-slate-400">{f.sport ?? ""}</p>
                    <p className="text-xs text-slate-400">{f.scheduledDate}</p>
                  </div>
                  {f.result && <p className="text-xs text-green-700 font-medium mt-1">{f.result}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
