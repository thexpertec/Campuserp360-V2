import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, BookOpen, Search, GraduationCap, CheckCircle2, Users, Copy, X, LayoutGrid, PanelLeft } from "lucide-react";
import { ClassSubjectsGridTab } from "./ClassSubjectsGridTab";

// ── Types ──────────────────────────────────────────────────────────────────────
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

// ── API helper ────────────────────────────────────────────────────────────────
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

// ── Subject type badge ────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  theory:    "bg-blue-100 text-blue-700 border-blue-200",
  practical: "bg-green-100 text-green-700 border-green-200",
  lab:       "bg-teal-100 text-teal-700 border-teal-200",
};

// ── Main component ────────────────────────────────────────────────────────────
export function ClassSubjectsTab({ classId: externalClassId, onClassChange }: { classId?: string; onClassChange?: (id: string) => void } = {}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [view, setView] = useState<"byClass" | "grid">("byClass");

  const [selectedClassId, setSelectedClassId] = useState<string>(externalClassId ?? "");
  const [classSearch, setClassSearch] = useState("");
  const [subjectSearch, setSubjectSearch] = useState("");

  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [unsaved, setUnsaved] = useState(false);

  // Copy-from-class state
  const [copyFromOpen, setCopyFromOpen] = useState(false);
  const [copyFromClassId, setCopyFromClassId] = useState("");

  // Sync from external class selector
  useEffect(() => {
    if (externalClassId && externalClassId !== selectedClassId) {
      setSelectedClassId(externalClassId);
      setUnsaved(false);
    }
  }, [externalClassId]);

  // ── Fetch data ──────────────────────────────────────────────────────────
  const { data: classesData, isLoading: classLoading } = useQuery({
    queryKey: ["all-classes-for-subjects"],
    queryFn: () => apiFetch<{ classes: ClassRecord[]; total: number } | ClassRecord[]>("/api/admin/classes?pageSize=200"),
  });
  const classes: ClassRecord[] = useMemo(() => {
    const d = classesData as any;
    return Array.isArray(d?.classes) ? d.classes : Array.isArray(d) ? d : [];
  }, [classesData]);

  const { data: subjectsData, isLoading: subjectLoading } = useQuery({
    queryKey: ["all-subjects"],
    queryFn: () => apiFetch<Subject[]>("/api/admin/subjects"),
  });
  const allSubjects: Subject[] = useMemo(() =>
    (Array.isArray(subjectsData) ? subjectsData as Subject[] : []).filter(s => s.active !== false),
    [subjectsData]
  );

  const { data: existingLinks, isLoading: linksLoading } = useQuery({
    queryKey: ["class-subjects-links", selectedClassId],
    queryFn: () => apiFetch<ClassSubjectRow[]>(`/api/admin/timetable/class-subjects?classId=${selectedClassId}`),
    enabled: !!selectedClassId,
  });

  // ── Build assignment map from existing links ────────────────────────────
  useEffect(() => {
    if (!existingLinks) return;
    const map: Record<string, number> = {};
    existingLinks.forEach(r => { map[r.subjectId] = r.periodsPerWeek; });
    setAssignments(map);
    setUnsaved(false);
  }, [existingLinks, selectedClassId]);

  // ── Copy-from handler ──────────────────────────────────────────────────
  async function executeCopyFrom() {
    if (!copyFromClassId || !selectedClassId) return;
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/timetable/class-subjects?classId=${copyFromClassId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "X-Tenant-Id": localStorage.getItem("ccm_admin_website_tenant") ?? "ccm",
        },
      });
      const copyText = await res.text();
      let data: any = undefined;
      if (copyText) {
        try { data = JSON.parse(copyText); } catch { /* non-JSON response, fall through */ }
      }
      if (!res.ok) throw new Error(data?.error ?? (copyText ? copyText.slice(0, 200) : `Request failed (${res.status})`));
      const map: Record<string, number> = {};
      if (Array.isArray(data)) {
        (data as ClassSubjectRow[]).forEach(r => { if (r.periodsPerWeek > 0) map[r.subjectId] = r.periodsPerWeek; });
      }
      setAssignments(map);
      setUnsaved(true);
      setCopyFromOpen(false);
      setCopyFromClassId("");
      const srcName = classes.find(c => c.id === copyFromClassId)?.name;
      toast({ title: `Copied ${Object.keys(map).length} subjects from ${srcName}` });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  }

  function handleSelectClass(id: string) {
    setSelectedClassId(id);
    setUnsaved(false);
    setCopyFromOpen(false);
    setCopyFromClassId("");
    onClassChange?.(id);
  }

  // ── Save mutation ──────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (subjects: { subjectId: string; periodsPerWeek: number }[]) =>
      apiFetch<{ saved: number }>("/api/admin/timetable/class-subjects/bulk", {
        method: "POST",
        body: JSON.stringify({ classId: selectedClassId, subjects }),
      }),
    onSuccess: (res) => {
      toast({ title: `Saved — ${res.saved} subjects assigned` });
      qc.invalidateQueries({ queryKey: ["class-subjects-links", selectedClassId] });
      setUnsaved(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function handleSave() {
    const subjects = Object.entries(assignments)
      .filter(([, v]) => v > 0)
      .map(([subjectId, periodsPerWeek]) => ({ subjectId, periodsPerWeek }));
    saveMut.mutate(subjects);
  }

  const [bulkPeriods, setBulkPeriods] = useState(5);

  function toggle(subjectId: string) {
    setAssignments(a => {
      const next = { ...a };
      if (next[subjectId] > 0) { next[subjectId] = 0; } else { next[subjectId] = bulkPeriods; }
      return next;
    });
    setUnsaved(true);
  }

  function setPeriods(subjectId: string, v: number) {
    setAssignments(a => ({ ...a, [subjectId]: Math.max(0, v) }));
    setUnsaved(true);
  }

  function selectAll() {
    const next: Record<string, number> = { ...assignments };
    filteredSubjects.forEach(s => { if (!(next[s.id] > 0)) next[s.id] = bulkPeriods; });
    setAssignments(next);
    setUnsaved(true);
  }

  function unselectAll() {
    const next: Record<string, number> = { ...assignments };
    filteredSubjects.forEach(s => { next[s.id] = 0; });
    setAssignments(next);
    setUnsaved(true);
  }

  function setAllPeriods() {
    const next: Record<string, number> = { ...assignments };
    filteredSubjects.forEach(s => { if (next[s.id] > 0) next[s.id] = bulkPeriods; });
    setAssignments(next);
    setUnsaved(true);
  }

  // ── Derived ────────────────────────────────────────────────────────────
  const filteredClasses = useMemo(() =>
    classes.filter(c => !classSearch || c.name.toLowerCase().includes(classSearch.toLowerCase()) || c.code.toLowerCase().includes(classSearch.toLowerCase())),
    [classes, classSearch]
  );

  const filteredSubjects = useMemo(() =>
    allSubjects.filter(s => !subjectSearch || s.name.toLowerCase().includes(subjectSearch.toLowerCase()) || s.code.toLowerCase().includes(subjectSearch.toLowerCase())),
    [allSubjects, subjectSearch]
  );

  const allVisibleSelected = filteredSubjects.length > 0 && filteredSubjects.every(s => (assignments[s.id] ?? 0) > 0);
  const someVisibleSelected = filteredSubjects.some(s => (assignments[s.id] ?? 0) > 0);
  const assignedCount = Object.values(assignments).filter(v => v > 0).length;
  const totalPeriods = Object.values(assignments).reduce((a, v) => a + (v > 0 ? v : 0), 0);
  const selectedClass = classes.find(c => c.id === selectedClassId);

  const isLoading = linksLoading || subjectLoading;

  return (
    <div className="space-y-3">
      {/* ── View toggle ── */}
      <div className="flex items-center gap-1 border border-slate-200 rounded-lg bg-white p-1 w-fit">
        <button
          onClick={() => setView("byClass")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === "byClass" ? "bg-primary text-primary-foreground" : "text-slate-500 hover:bg-slate-50"
          }`}>
          <PanelLeft className="h-3.5 w-3.5" />By Class
        </button>
        <button
          onClick={() => setView("grid")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === "grid" ? "bg-primary text-primary-foreground" : "text-slate-500 hover:bg-slate-50"
          }`}>
          <LayoutGrid className="h-3.5 w-3.5" />All Classes Grid
        </button>
      </div>

      {view === "grid" ? (
        <ClassSubjectsGridTab />
      ) : (
    <div className="flex gap-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" style={{ minHeight: 560 }}>

      {/* ── Class list (left panel) ── */}
      <div className="w-56 flex-shrink-0 border-r border-slate-200 flex flex-col">
        <div className="px-3 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Classes</p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={classSearch} onChange={e => setClassSearch(e.target.value)}
              placeholder="Search…" className="pl-7 h-8 text-xs" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {classLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : filteredClasses.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No classes found</p>
          ) : (
            filteredClasses.map(cls => (
              <button key={cls.id} onClick={() => handleSelectClass(cls.id)}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-slate-100 flex items-center gap-2 ${
                  selectedClassId === cls.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-slate-50 text-slate-700"
                }`}>
                <GraduationCap className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                <span className="truncate font-medium">{cls.name}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Subject allocation (right panel) ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedClassId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 p-8">
            <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <BookOpen className="h-8 w-8 text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-500">Select a class</p>
              <p className="text-xs text-slate-400 mt-1">Choose a class from the left to assign subjects and set periods per week</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <div>
                <p className="font-semibold text-slate-800">{selectedClass?.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {unsaved && <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">Unsaved</span>}
                  {!isLoading && (
                    <>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />{assignedCount} subjects
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Users className="h-3 w-3 text-blue-500" />{totalPeriods} periods/week
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {copyFromOpen ? (
                  <div className="flex items-center gap-2">
                    <Select value={copyFromClassId} onValueChange={setCopyFromClassId}>
                      <SelectTrigger className="h-8 w-40 text-xs">
                        <SelectValue placeholder="Copy from…" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.filter(c => c.id !== selectedClassId).map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-8 text-xs" onClick={executeCopyFrom} disabled={!copyFromClassId}>
                      Copy
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setCopyFromOpen(false); setCopyFromClassId(""); }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setCopyFromOpen(true)}>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />Copy from class
                  </Button>
                )}
                <Button size="sm" onClick={handleSave} disabled={saveMut.isPending || !selectedClassId || isLoading}>
                  {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                  Save
                </Button>
              </div>
            </div>

            {/* Subject search + bulk actions */}
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-36 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input value={subjectSearch} onChange={e => setSubjectSearch(e.target.value)}
                  placeholder="Filter subjects…" className="pl-8 h-8 text-sm" />
              </div>

              {/* Select / Unselect All */}
              {!isLoading && filteredSubjects.length > 0 && (
                <>
                  <div className="flex items-center gap-1 border border-slate-200 rounded-lg bg-white px-1 py-0.5">
                    <button
                      onClick={allVisibleSelected ? unselectAll : selectAll}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                        allVisibleSelected
                          ? "text-slate-600 hover:bg-slate-100"
                          : "text-primary hover:bg-primary/10"
                      }`}>
                      <span className={`inline-flex h-3.5 w-3.5 rounded border-2 items-center justify-center flex-shrink-0 ${
                        allVisibleSelected ? "bg-primary border-primary" : someVisibleSelected ? "bg-primary/30 border-primary" : "border-slate-300"
                      }`}>
                        {allVisibleSelected && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                        {someVisibleSelected && !allVisibleSelected && <span className="block h-1.5 w-1.5 rounded-sm bg-primary" />}
                      </span>
                      {allVisibleSelected ? "Unselect All" : "Select All"}
                    </button>
                  </div>

                  {/* Bulk periods setter */}
                  <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg bg-white px-2 py-0.5">
                    <span className="text-xs text-slate-500">Periods:</span>
                    <Input
                      type="number" min={1} max={30} value={bulkPeriods}
                      onChange={e => setBulkPeriods(Math.max(1, Number(e.target.value)))}
                      className="h-6 w-12 text-xs text-center px-1 border-0 shadow-none focus-visible:ring-0" />
                    <button
                      onClick={setAllPeriods}
                      disabled={!someVisibleSelected}
                      className="text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline">
                      Apply to selected
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Subject list */}
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading…</span>
              </div>
            ) : filteredSubjects.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 p-8">
                <p className="text-sm">No subjects match your search</p>
                <button onClick={() => setSubjectSearch("")} className="text-xs text-primary underline">Clear</button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {filteredSubjects.map(subject => {
                  const periods = assignments[subject.id] ?? 0;
                  const assigned = periods > 0;
                  return (
                    <div key={subject.id}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${assigned ? "" : "opacity-50 hover:opacity-80"}`}>
                      {/* Checkbox toggle */}
                      <button
                        onClick={() => toggle(subject.id)}
                        className={`h-5 w-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                          assigned ? "bg-primary border-primary" : "border-slate-300 bg-white hover:border-primary"
                        }`}>
                        {assigned && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                      </button>

                      {/* Subject info */}
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className={`font-medium text-sm truncate ${assigned ? "text-slate-800" : "text-slate-500"}`}>
                          {subject.name}
                        </span>
                        <Badge variant="outline" className={`text-xs flex-shrink-0 ${TYPE_COLOR[subject.type] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                          {subject.type}
                        </Badge>
                        {subject.isElective && (
                          <Badge variant="outline" className="text-xs flex-shrink-0 bg-amber-50 text-amber-700 border-amber-200">Elective</Badge>
                        )}
                      </div>

                      {/* Periods/week input */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-400">periods/week</span>
                        <Input
                          type="number" min={0} max={30}
                          value={assigned ? periods : ""}
                          placeholder="—"
                          disabled={!assigned}
                          onChange={e => setPeriods(subject.id, Number(e.target.value))}
                          className="h-8 w-16 text-sm text-center"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer save */}
            {filteredSubjects.length > 0 && !isLoading && (
              <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {assignedCount} of {allSubjects.length} subjects assigned · {totalPeriods} periods/week total
                </span>
                <Button size="sm" onClick={handleSave} disabled={saveMut.isPending}>
                  {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                  Save for {selectedClass?.name}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
      )}
    </div>
  );
}
