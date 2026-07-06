import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Search, GraduationCap } from "lucide-react";

interface Subject {
  id: string; code: string; name: string; type: string; isElective: boolean; active: boolean;
}
interface ClassRecord {
  id: string; code: string; name: string; active: boolean;
}
interface ClassSubjectRow {
  id: string; classId: string; subjectId: string; periodsPerWeek: number;
  subjectName: string; subjectCode: string; subjectType: string;
}

async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-Tenant-Id": localStorage.getItem("ccm_admin_website_tenant") ?? "ccm",
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: any = undefined;
  if (text) {
    try { json = JSON.parse(text); } catch { /* non-JSON response, fall through */ }
  }
  if (!res.ok) {
    const message = json?.error ?? (text ? text.slice(0, 200) : `Request failed (${res.status})`);
    throw new Error(message);
  }
  return json as T;
}

// Matrix key helper — combines classId + subjectId into a single lookup key.
function cellKey(classId: string, subjectId: string) {
  return `${classId}::${subjectId}`;
}

export function ClassSubjectsGridTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [classSearch, setClassSearch] = useState("");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [grid, setGrid] = useState<Record<string, number>>({});
  const [baseline, setBaseline] = useState<Record<string, number>>({});

  const { data: classesData, isLoading: classesLoading } = useQuery({
    queryKey: ["all-classes-for-subjects"],
    // /admin/classes returns the full tenant class list unconditionally (no server-side
    // pagination); the query string is a no-op kept only for readability at call sites.
    queryFn: () => apiFetch<{ classes: ClassRecord[]; total: number } | ClassRecord[]>("/api/admin/classes"),
  });
  const classes: ClassRecord[] = useMemo(() => {
    const d = classesData as any;
    const list: ClassRecord[] = Array.isArray(d?.classes) ? d.classes : Array.isArray(d) ? d : [];
    return list.filter(c => c.active !== false);
  }, [classesData]);

  const { data: subjectsData, isLoading: subjectsLoading } = useQuery({
    queryKey: ["all-subjects"],
    queryFn: () => apiFetch<Subject[]>("/api/admin/subjects"),
  });
  const allSubjects: Subject[] = useMemo(() =>
    (Array.isArray(subjectsData) ? subjectsData as Subject[] : []).filter(s => s.active !== false),
    [subjectsData]
  );

  const { data: allLinks, isLoading: linksLoading, refetch: refetchLinks } = useQuery({
    queryKey: ["class-subjects-links-all"],
    queryFn: () => apiFetch<ClassSubjectRow[]>("/api/admin/timetable/class-subjects"),
  });

  // Rebuild the working grid whenever fresh data arrives (initial load or after save).
  const linksSignature = allLinks?.map(r => `${r.classId}:${r.subjectId}:${r.periodsPerWeek}`).join("|") ?? "";
  useEffect(() => {
    const map: Record<string, number> = {};
    (allLinks ?? []).forEach(r => {
      if (r.periodsPerWeek > 0) map[cellKey(r.classId, r.subjectId)] = r.periodsPerWeek;
    });
    setGrid(map);
    setBaseline(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linksSignature]);

  const isLoading = classesLoading || subjectsLoading || linksLoading;

  const filteredClasses = useMemo(() =>
    classes.filter(c => !classSearch || c.name.toLowerCase().includes(classSearch.toLowerCase()) || c.code.toLowerCase().includes(classSearch.toLowerCase())),
    [classes, classSearch]
  );
  const filteredSubjects = useMemo(() =>
    allSubjects.filter(s => !subjectSearch || s.name.toLowerCase().includes(subjectSearch.toLowerCase()) || s.code.toLowerCase().includes(subjectSearch.toLowerCase())),
    [allSubjects, subjectSearch]
  );

  function setCell(classId: string, subjectId: string, value: number) {
    const key = cellKey(classId, subjectId);
    setGrid(g => {
      const next = { ...g };
      if (value > 0) next[key] = value; else delete next[key];
      return next;
    });
  }

  const changedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const k of Object.keys(grid)) if (grid[k] !== (baseline[k] ?? 0)) keys.add(k);
    for (const k of Object.keys(baseline)) if ((grid[k] ?? 0) !== baseline[k]) keys.add(k);
    return keys;
  }, [grid, baseline]);
  const unsaved = changedKeys.size > 0;

  const saveMut = useMutation({
    mutationFn: () => {
      const changes = [...changedKeys].map(key => {
        const [classId, subjectId] = key.split("::");
        const periodsPerWeek = grid[key] ?? 0;
        return { classId, subjectId, periodsPerWeek, assigned: periodsPerWeek > 0 };
      });
      return apiFetch<{ saved: number; removed: number }>("/api/admin/timetable/class-subjects/by-grid", {
        method: "POST",
        body: JSON.stringify({ changes }),
      });
    },
    onSuccess: async (res) => {
      toast({ title: `Saved — ${res.saved} assigned, ${res.removed} removed` });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["class-subjects-links"] }),
        refetchLinks(),
      ]);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const totalAssigned = Object.values(grid).filter(v => v > 0).length;

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" style={{ minHeight: 560 }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={subjectSearch} onChange={e => setSubjectSearch(e.target.value)}
              placeholder="Filter subjects…" className="pl-8 h-8 text-sm w-44" />
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={classSearch} onChange={e => setClassSearch(e.target.value)}
              placeholder="Filter classes…" className="pl-8 h-8 text-sm w-44" />
          </div>
          {!isLoading && (
            <span className="text-xs text-slate-400">
              {totalAssigned} assignment{totalAssigned === 1 ? "" : "s"} across {classes.length} classes
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {unsaved && (
            <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              {changedKeys.size} unsaved change{changedKeys.size === 1 ? "" : "s"}
            </span>
          )}
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={!unsaved || saveMut.isPending || isLoading}>
            {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save all changes
          </Button>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 gap-2 py-16">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading…</span>
        </div>
      ) : filteredSubjects.length === 0 || filteredClasses.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 p-8">
          <p className="text-sm">No subjects or classes match your filters</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-sm w-full">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left min-w-48">
                  Subject
                </th>
                {filteredClasses.map(cls => (
                  <th key={cls.id}
                    className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-2 py-2 text-center font-medium text-slate-600 whitespace-nowrap"
                    style={{ minWidth: 84 }}>
                    <div className="flex items-center justify-center gap-1">
                      <GraduationCap className="h-3 w-3 text-slate-400" />
                      <span className="truncate max-w-20" title={cls.name}>{cls.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSubjects.map((subject, idx) => (
                <tr key={subject.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <td className="sticky left-0 z-10 bg-inherit border-r border-b border-slate-100 px-3 py-1.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-medium text-slate-700 truncate">{subject.name}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">{subject.code}</span>
                    </div>
                  </td>
                  {filteredClasses.map(cls => {
                    const key = cellKey(cls.id, subject.id);
                    const value = grid[key] ?? 0;
                    const changed = changedKeys.has(key);
                    return (
                      <td key={cls.id}
                        className={`border-b border-slate-100 px-1 py-1 text-center ${changed ? "bg-amber-50" : ""}`}>
                        <Input
                          type="number" min={0} max={30}
                          value={value > 0 ? value : ""}
                          placeholder="—"
                          onChange={e => setCell(cls.id, subject.id, Math.max(0, Number(e.target.value)))}
                          className={`h-7 w-14 mx-auto text-xs text-center px-1 ${changed ? "border-amber-300" : ""}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
