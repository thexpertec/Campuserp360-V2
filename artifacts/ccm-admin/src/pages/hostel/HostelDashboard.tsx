import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Building2, BedDouble, Users, CheckCircle2, Coffee, Eye } from "lucide-react";
import { HostelRoomsTab } from "./HostelRoomsTab";
import { HostelAllocationsTab } from "./HostelAllocationsTab";

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

interface Room { id: string; roomNumber: string; blockName?: string; capacity: number; status?: string; }
interface Allocation { id: string; studentId: string; roomId: string; status: string; }

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

function ComingSoonPanel({ title, sub, icon: Icon }: { title: string; sub: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1">{sub}</p>
      </div>
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
        <Icon className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-semibold text-muted-foreground">{title} — Coming Soon</p>
        <p className="mt-1 text-xs text-muted-foreground/70">This section is under development and will be available shortly.</p>
      </div>
    </div>
  );
}

export function HostelDashboard({ tab = "dashboard" }: { tab?: string }) {
  if (tab === "dormitories") return <HostelRoomsTab />;
  if (tab === "beds")        return <HostelAllocationsTab />;
  if (tab === "mess")        return <ComingSoonPanel title="Mess / Dining" sub="Manage meal plans, mess attendance and dietary preferences." icon={Coffee} />;
  if (tab === "visitors")    return <ComingSoonPanel title="Visitor Log" sub="Record and track visitors entering the hostel premises." icon={Eye} />;

  const { data: rooms = [], isLoading: rLoading } = useQuery<Room[]>({
    queryKey: ["hostel-rooms-dash"],
    queryFn: () => apiFetch("/api/admin/hostel/rooms"),
    staleTime: 30_000,
  });
  const { data: allocs = [], isLoading: aLoading } = useQuery<Allocation[]>({
    queryKey: ["hostel-allocs-dash"],
    queryFn: () => apiFetch("/api/admin/hostel/allocations"),
    staleTime: 30_000,
  });

  const isLoading   = rLoading || aLoading;
  const totalRooms  = rooms.length;
  const totalBeds   = rooms.reduce((s, r) => s + (Number(r.capacity) || 0), 0);
  const activeAllocs = allocs.filter(a => a.status === "active" || !a.status).length;
  const available   = Math.max(0, totalBeds - activeAllocs);
  const occupancyPct = totalBeds > 0 ? Math.round((activeAllocs / totalBeds) * 100) : 0;

  // Rooms by block
  const byBlock: Record<string, { rooms: number; beds: number; occupied: number }> = {};
  rooms.forEach(r => {
    const block = r.blockName ?? "Main Block";
    if (!byBlock[block]) byBlock[block] = { rooms: 0, beds: 0, occupied: 0 };
    byBlock[block].rooms++;
    byBlock[block].beds += Number(r.capacity) || 0;
  });
  allocs.filter(a => !a.status || a.status === "active").forEach(a => {
    const room = rooms.find(r => r.id === a.roomId);
    if (room) {
      const block = room.blockName ?? "Main Block";
      if (byBlock[block]) byBlock[block].occupied++;
    }
  });
  const blocks = Object.entries(byBlock);
  const maxBeds = Math.max(1, ...blocks.map(([, v]) => v.beds));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Hostel</h2>
        <p className="text-sm text-slate-500 mt-0.5">Bed occupancy, dormitory management and current residency status.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Rooms"    value={isLoading ? "…" : totalRooms}    icon={Building2}    color="text-violet-600" bg="bg-violet-50" />
        <StatCard label="Total Beds"     value={isLoading ? "…" : totalBeds}     icon={BedDouble}    color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard label="Occupied"       value={isLoading ? "…" : activeAllocs}  icon={Users}        color="text-blue-600"   bg="bg-blue-50"
          sub={`${occupancyPct}% occupancy`} />
        <StatCard label="Available"      value={isLoading ? "…" : available}     icon={CheckCircle2} color="text-green-600"  bg="bg-green-50" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Occupancy bar */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Overall Occupancy</h3>
            <span className="text-lg font-bold tabular-nums text-violet-600">{isLoading ? "…" : `${occupancyPct}%`}</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden mb-4">
            <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${occupancyPct}%` }} />
          </div>

          {isLoading ? (
            <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-4 bg-slate-100 rounded-full animate-pulse" />)}</div>
          ) : blocks.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No blocks configured yet</p>
          ) : (
            <div className="space-y-3 mt-2">
              {blocks.map(([block, v]) => (
                <div key={block} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 font-medium w-28 flex-shrink-0 truncate">{block}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden relative">
                    <div className="h-full rounded bg-violet-100 absolute inset-0" style={{ width: `${(v.beds / maxBeds) * 100}%` }} />
                    <div className="h-full rounded bg-violet-500 absolute inset-0" style={{ width: `${(v.occupied / maxBeds) * 100}%` }} />
                  </div>
                  <span className="text-xs text-slate-700 font-semibold w-12 text-right tabular-nums">{v.occupied}/{v.beds}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Module Sections</h3>
          <div className="space-y-2">
            {[
              { icon: Building2, label: "Dormitories / Rooms", sub: "Manage blocks, rooms and capacity" },
              { icon: BedDouble, label: "Bed Allocations",     sub: "Assign and track student beds" },
              { icon: Coffee,    label: "Mess / Dining",       sub: "Meal records and catering" },
              { icon: Eye,       label: "Visitor Log",         sub: "Sign-in / sign-out records" },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors cursor-default">
                <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-4 w-4 text-violet-600" />
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
