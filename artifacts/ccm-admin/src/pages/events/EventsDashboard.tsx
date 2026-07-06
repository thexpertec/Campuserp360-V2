import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { formatDate } from "@/lib/locale";
import { CalendarRange, CalendarCheck2, CalendarClock, Star, Clock, MapPin, Users } from "lucide-react";
import { cn } from "@/lib/utils";

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

interface EventRow {
  id: string; title: string; eventType: string;
  startDate: string; startTime: string | null;
  endDate: string | null; venue: string | null;
  organizer: string | null; targetAudience: string; status: string;
}

interface Stats {
  total: number; upcoming: number; today: number; thisMonth: number;
  byType: { eventType: string; count: number }[];
  nextEvents: EventRow[];
}

const TYPE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  academic:  { label: "Academic",  color: "text-indigo-700",  bg: "bg-indigo-50"  },
  cultural:  { label: "Cultural",  color: "text-pink-700",    bg: "bg-pink-50"    },
  sports:    { label: "Sports",    color: "text-amber-700",   bg: "bg-amber-50"   },
  ceremony:  { label: "Ceremony",  color: "text-violet-700",  bg: "bg-violet-50"  },
  meeting:   { label: "Meeting",   color: "text-slate-700",   bg: "bg-slate-50"   },
  holiday:   { label: "Holiday",   color: "text-green-700",   bg: "bg-green-50"   },
  other:     { label: "Other",     color: "text-gray-700",    bg: "bg-gray-50"    },
};

const AUDIENCE_LABEL: Record<string, string> = {
  all: "All", cadets: "Cadets", staff: "Staff", parents: "Parents",
};

const fmtDate = (d: string) => formatDate(d + "T00:00:00");

export function EventsDashboard() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["events-stats"],
    queryFn: () => apiFetch("/api/admin/events/stats"),
  });

  const statCards = [
    { label: "Published Events",   value: stats?.total     ?? 0, icon: CalendarRange,  color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Upcoming",           value: stats?.upcoming  ?? 0, icon: CalendarClock,  color: "text-blue-600",   bg: "bg-blue-50"   },
    { label: "Today",              value: stats?.today     ?? 0, icon: Star,           color: "text-amber-600",  bg: "bg-amber-50"  },
    { label: "This Month",         value: stats?.thisMonth ?? 0, icon: CalendarCheck2, color: "text-green-600",  bg: "bg-green-50"  },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl border border-border bg-white px-5 py-4 flex items-center gap-4">
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", bg)}>
              <Icon className={cn("h-5 w-5", color)} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
              <p className="text-2xl font-bold text-foreground">
                {isLoading ? "—" : value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Next upcoming events */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Upcoming Events</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Next scheduled published events</p>
          </div>
          {isLoading ? (
            <div className="py-12 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : !stats?.nextEvents.length ? (
            <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
              <CalendarRange className="h-8 w-8 opacity-30" />
              <p className="text-sm">No upcoming events</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {stats.nextEvents.map(ev => {
                const cfg = TYPE_CFG[ev.eventType] ?? TYPE_CFG.other;
                return (
                  <li key={ev.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                    <div className={cn("mt-0.5 rounded-lg px-2 py-0.5 text-[11px] font-semibold shrink-0", cfg.bg, cfg.color)}>
                      {cfg.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{ev.title}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {fmtDate(ev.startDate)}{ev.startTime ? ` · ${ev.startTime}` : ""}
                        </span>
                        {ev.venue && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />{ev.venue}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />{AUDIENCE_LABEL[ev.targetAudience] ?? ev.targetAudience}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Events by type */}
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground">By Category</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Published events breakdown</p>
          </div>
          {isLoading ? (
            <div className="py-12 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : !stats?.byType.length ? (
            <div className="py-12 flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
          ) : (
            <ul className="divide-y divide-border">
              {stats.byType.map(({ eventType, count }) => {
                const cfg = TYPE_CFG[eventType] ?? TYPE_CFG.other;
                const max = Math.max(...stats.byType.map(b => b.count), 1);
                const pct = Math.round((count / max) * 100);
                return (
                  <li key={eventType} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn("text-xs font-semibold", cfg.color)}>{cfg.label}</span>
                      <span className="text-xs font-bold text-foreground">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full", cfg.bg, "border", cfg.color.replace("text-", "border-"))}
                        style={{ width: `${pct}%`, opacity: 0.8 }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
