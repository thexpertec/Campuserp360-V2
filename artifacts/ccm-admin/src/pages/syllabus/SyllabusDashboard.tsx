import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { BookMarked, BookOpen, List, Layers, GraduationCap } from "lucide-react";

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

interface Unit { id: string; classCode: string; subjectCode: string; title: string; active: boolean; }
interface Topic { id: string; unitId: string; title: string; active: boolean; }

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

export function SyllabusDashboard({ tab = "dashboard" }: { tab?: string }) {
  const { data: units = [], isLoading: uLoading } = useQuery<Unit[]>({
    queryKey: ["syllabus-units-dash"],
    queryFn: () => apiFetch("/api/admin/syllabus/units"),
    staleTime: 30_000,
  });
  const { data: topics = [], isLoading: tLoading } = useQuery<Topic[]>({
    queryKey: ["syllabus-topics-dash"],
    queryFn: () => apiFetch("/api/admin/syllabus/topics"),
    staleTime: 30_000,
  });

  const isLoading  = uLoading || tLoading;
  const activeUnits  = units.filter(u => u.active).length;
  const activeTopics = topics.filter(t => t.active).length;

  // Units by subject
  const bySubject: Record<string, { units: number; topics: number }> = {};
  units.forEach(u => {
    if (!bySubject[u.subjectCode]) bySubject[u.subjectCode] = { units: 0, topics: 0 };
    bySubject[u.subjectCode].units++;
  });
  topics.forEach(t => {
    const unit = units.find(u => u.id === t.unitId);
    if (unit && bySubject[unit.subjectCode]) bySubject[unit.subjectCode].topics++;
  });
  const subjects = Object.entries(bySubject).sort(([,a],[,b]) => b.units - a.units).slice(0, 8);
  const maxUnits = Math.max(1, ...subjects.map(([,v]) => v.units));

  // Units by class
  const byClass: Record<string, number> = {};
  units.forEach(u => { byClass[u.classCode] = (byClass[u.classCode] ?? 0) + 1; });
  const classes = Object.entries(byClass).sort(([a],[b]) => a.localeCompare(b));
  const classMax = Math.max(1, ...classes.map(([,v]) => v));

  // Avg topics per unit
  const avgTopics = activeUnits > 0 ? (activeTopics / activeUnits).toFixed(1) : "—";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Syllabus</h2>
        <p className="text-sm text-slate-500 mt-0.5">Curriculum structure — units and topics by class and subject.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Subjects"         value={isLoading ? "…" : subjects.length}  icon={BookOpen}    color="text-violet-600" bg="bg-violet-50" />
        <StatCard label="Syllabus Units"   value={isLoading ? "…" : activeUnits}      icon={Layers}      color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard label="Topics / Lessons" value={isLoading ? "…" : activeTopics}     icon={List}        color="text-blue-600"   bg="bg-blue-50"
          sub={`Avg ${avgTopics} per unit`} />
        <StatCard label="Classes/Programs Covered"  value={isLoading ? "…" : classes.length}   icon={GraduationCap} color="text-green-600" bg="bg-green-50" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Units by subject */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Units by Subject</h3>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-4 bg-slate-100 rounded-full animate-pulse" />)}</div>
          ) : subjects.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No units yet — add them via Setup</p>
          ) : (
            <div className="space-y-3">
              {subjects.map(([subj, v]) => (
                <div key={subj} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 font-medium w-24 flex-shrink-0 truncate">{subj}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${(v.units / maxUnits) * 100}%` }} />
                  </div>
                  <span className="text-xs text-slate-700 font-semibold tabular-nums">
                    {v.units}<span className="text-slate-400 font-normal"> u · {v.topics} t</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Units by class */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Units by Class</h3>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-4 bg-slate-100 rounded-full animate-pulse" />)}</div>
          ) : classes.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No units yet</p>
          ) : (
            <div className="space-y-3">
              {classes.map(([cls, cnt]) => (
                <div key={cls} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 font-medium w-24 flex-shrink-0 truncate">{cls}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(cnt / classMax) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-6 text-right tabular-nums">{cnt}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-slate-100 flex gap-3">
            <div className="text-center flex-1">
              <p className="text-lg font-bold text-violet-600 tabular-nums">{isLoading ? "…" : units.length}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total Units</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-lg font-bold text-indigo-600 tabular-nums">{isLoading ? "…" : topics.length}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total Topics</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-lg font-bold text-blue-600 tabular-nums">{isLoading ? "…" : avgTopics}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Avg/Unit</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
