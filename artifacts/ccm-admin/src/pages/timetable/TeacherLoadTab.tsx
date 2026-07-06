import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Save, Search, Users, BookOpen,
  CheckCircle2, LayoutGrid, User,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Employee { id: string; staffId: string; fullName: string; role: string; departmentName?: string; status?: string }
interface ClassRecord { id: string; code: string; name: string; active: boolean }
interface ClassSubject { subjectId: string; subjectName: string; subjectCode: string; periodsPerWeek: number }
interface TeacherAssignment { id: string; classId: string; classCode: string; className: string; subjectId: string; subjectName: string; periodsPerWeek: number; employeeId: string; teacherName?: string }
interface MatrixRow { subjectId: string; subjectName: string; subjectCode: string; periodsPerWeek: number; employeeId: string }

// ── API helper ─────────────────────────────────────────────────────────────────
// Raw fetch() calls must carry an explicit tenant header — host-based tenant
// resolution alone fails on non-canonical domains (Replit preview/e2e), see
// the same pattern already used in WebsitePage.tsx / challan-utils.ts.
const TENANT_KEY = "ccm_admin_website_tenant";
async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const tenant = localStorage.getItem(TENANT_KEY) || "ccm";
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-Tenant-Id": tenant,
      ...(opts.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

// ── BY CLASS matrix view ───────────────────────────────────────────────────────
function ByClassMatrix({ employees, classes, initialClassId, onClassChange }: { employees: Employee[]; classes: ClassRecord[]; initialClassId?: string; onClassChange?: (id: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [classId, setClassId] = useState(initialClassId ?? "");

  useEffect(() => {
    if (initialClassId && initialClassId !== classId) setClassId(initialClassId);
  }, [initialClassId]);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [search, setSearch] = useState("");
  const [bulkPeriods, setBulkPeriods] = useState(5);
  const [bulkTeacher, setBulkTeacher] = useState("");

  const { data: classSubjectsData, isLoading: subjLoading } = useQuery({
    queryKey: ["class-subjects-matrix", classId],
    queryFn: () => apiFetch<ClassSubject[]>(`/api/admin/timetable/class-subjects?classId=${classId}`),
    enabled: !!classId,
  });
  const { data: existingData } = useQuery({
    queryKey: ["teacher-assignments-matrix", classId],
    queryFn: () => apiFetch<TeacherAssignment[]>(`/api/admin/timetable/teacher-assignments?classId=${classId}`),
    enabled: !!classId,
  });

  // Rebuild rows whenever class subjects or existing assignments change
  useEffect(() => {
    const subjects: ClassSubject[] = Array.isArray(classSubjectsData) ? classSubjectsData : [];
    const existing: TeacherAssignment[] = Array.isArray(existingData) ? existingData : [];
    const empMap: Record<string, string> = {}; // subjectId → employeeId
    const perMap: Record<string, number> = {}; // subjectId → periodsPerWeek
    existing.forEach(a => { empMap[a.subjectId] = a.employeeId; perMap[a.subjectId] = a.periodsPerWeek; });
    setRows(subjects.map(s => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      subjectCode: s.subjectCode,
      periodsPerWeek: perMap[s.subjectId] ?? s.periodsPerWeek ?? 5,
      employeeId: empMap[s.subjectId] ?? "",
    })));
  }, [classSubjectsData, existingData]);

  const saveMut = useMutation({
    mutationFn: () => apiFetch<{ saved: number }>("/api/admin/timetable/teacher-assignments/by-class", {
      method: "POST",
      body: JSON.stringify({ classId, assignments: rows.map(r => ({ subjectId: r.subjectId, employeeId: r.employeeId || null, periodsPerWeek: r.periodsPerWeek })) }),
    }),
    onSuccess: r => {
      toast({ title: `Saved — ${r.saved} teacher assignments` });
      qc.invalidateQueries({ queryKey: ["teacher-assignments-matrix", classId] });
      qc.invalidateQueries({ queryKey: ["teacher-assignments"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function setRow(subjectId: string, patch: Partial<MatrixRow>) {
    setRows(prev => prev.map(r => r.subjectId === subjectId ? { ...r, ...patch } : r));
  }
  function applyBulkPeriods() {
    setRows(prev => prev.map(r => ({ ...r, periodsPerWeek: bulkPeriods })));
  }
  function applyBulkTeacher() {
    if (!bulkTeacher) return;
    setRows(prev => prev.map(r => ({ ...r, employeeId: bulkTeacher })));
  }

  const filteredRows = useMemo(() =>
    rows.filter(r => !search || r.subjectName.toLowerCase().includes(search.toLowerCase()) || r.subjectCode.toLowerCase().includes(search.toLowerCase())),
    [rows, search]
  );
  const assignedCount = rows.filter(r => r.employeeId).length;
  const totalPeriods = rows.reduce((s, r) => s + (r.employeeId ? r.periodsPerWeek : 0), 0);

  // Teacher load summary: count assigned periods per employee
  const teacherLoadMap = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach(r => { if (r.employeeId) map[r.employeeId] = (map[r.employeeId] ?? 0) + r.periodsPerWeek; });
    return map;
  }, [rows]);

  const selectedClass = classes.find(c => c.id === classId);

  function handleClassChange(id: string) {
    setClassId(id);
    setRows([]);
    setSearch("");
    onClassChange?.(id);
  }

  return (
    <div className="space-y-4">
      {/* ── Class selector + stats ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={classId} onValueChange={v => handleClassChange(v)}>
          <SelectTrigger className="h-9 w-52 text-sm">
            <SelectValue placeholder="Select class…" />
          </SelectTrigger>
          <SelectContent>
            {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {classId && rows.length > 0 && (
          <>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              {assignedCount}/{rows.length} subjects assigned
            </Badge>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              {totalPeriods} periods/week
            </Badge>
            <div className="ml-auto">
              <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save All for {selectedClass?.name}
              </Button>
            </div>
          </>
        )}
      </div>

      {!classId ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
          <div className="h-16 w-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
            <LayoutGrid className="h-8 w-8 text-slate-300" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500">Select a class to assign all teachers at once</p>
            <p className="text-xs text-slate-400 mt-1">All subjects for the class appear as rows — pick a teacher and periods for each, then Save All</p>
          </div>
        </div>
      ) : subjLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /><span>Loading subjects…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 flex flex-col items-center justify-center py-12 gap-2 text-amber-700">
          <p className="text-sm font-medium">No subjects set up for this class yet</p>
          <p className="text-xs text-amber-600">Go to Class/Program Subjects to add subjects to this class first</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* ── Bulk action toolbar ── */}
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-40 max-w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subjects…"
                className="pl-8 h-8 text-xs" />
            </div>

            <div className="flex items-center gap-1 text-xs text-slate-400 px-1">|</div>

            {/* Set all periods */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 whitespace-nowrap">All periods:</span>
              <Input type="number" min={1} max={30} value={bulkPeriods}
                onChange={e => setBulkPeriods(Math.max(1, Number(e.target.value)))}
                className="h-7 w-12 text-xs text-center" />
              <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={applyBulkPeriods}>Apply</Button>
            </div>

            <div className="flex items-center gap-1 text-xs text-slate-400 px-1">|</div>

            {/* Set all teachers */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 whitespace-nowrap">All teacher:</span>
              <Select value={bulkTeacher} onValueChange={setBulkTeacher}>
                <SelectTrigger className="h-7 text-xs w-40">
                  <SelectValue placeholder="Pick teacher…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={applyBulkTeacher} disabled={!bulkTeacher}>
                Apply
              </Button>
            </div>
          </div>

          {/* ── Column headers ── */}
          <div className="grid grid-cols-[2fr_1fr_3fr_80px] gap-0 px-4 py-2 border-b border-slate-100 bg-slate-50/60 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <span>Subject</span>
            <span className="text-center">Periods/wk</span>
            <span>Teacher</span>
            <span className="text-center">Load</span>
          </div>

          {/* ── Rows ── */}
          <div className="divide-y divide-slate-100">
            {filteredRows.map((row, idx) => {
              const emp = employees.find(e => e.id === row.employeeId);
              const load = row.employeeId ? (teacherLoadMap[row.employeeId] ?? 0) : 0;
              return (
                <div key={row.subjectId}
                  className={`grid grid-cols-[2fr_1fr_3fr_80px] gap-0 px-4 py-2.5 items-center transition-colors ${
                    row.employeeId ? "bg-white hover:bg-slate-50/40" : "bg-slate-50/30 hover:bg-slate-50"
                  }`}>
                  {/* Subject */}
                  <div className="flex items-center gap-2 pr-4">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${row.employeeId ? "bg-emerald-400" : "bg-slate-200"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{row.subjectName}</p>
                      <p className="text-xs text-slate-400">{row.subjectCode}</p>
                    </div>
                  </div>

                  {/* Periods */}
                  <div className="flex justify-center">
                    <Input
                      type="number" min={0} max={30} value={row.periodsPerWeek}
                      onChange={e => setRow(row.subjectId, { periodsPerWeek: Math.max(0, Number(e.target.value)) })}
                      className="h-7 w-14 text-xs text-center" />
                  </div>

                  {/* Teacher dropdown */}
                  <div className="px-2">
                    <Select value={row.employeeId || "__none__"} onValueChange={v => setRow(row.subjectId, { employeeId: v === "__none__" ? "" : v })}>
                      <SelectTrigger className={`h-8 text-xs ${row.employeeId ? "" : "border-dashed text-slate-400"}`}>
                        <SelectValue placeholder="— Unassigned —">
                          {emp ? emp.fullName : undefined}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Unassigned —</SelectItem>
                        {employees.map(e => (
                          <SelectItem key={e.id} value={e.id}>
                            <div className="flex items-center justify-between gap-3 w-full">
                              <span>{e.fullName}</span>
                              {teacherLoadMap[e.id] ? (
                                <span className="text-xs text-slate-400 ml-2">{teacherLoadMap[e.id]} p/w</span>
                              ) : null}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Teacher load badge */}
                  <div className="flex justify-center">
                    {row.employeeId ? (
                      <Badge variant="outline" className={`text-xs ${load > 30 ? "bg-red-50 text-red-600 border-red-200" : load > 20 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                        {load}p/w
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Footer ── */}
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {assignedCount} of {rows.length} subjects have a teacher · {totalPeriods} total periods/week
            </p>
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save All
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function TeacherLoadTab({ classId: externalClassId, onClassChange }: { classId?: string; onClassChange?: (id: string) => void } = {}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [mode, setMode] = useState<"by-class" | "by-teacher">("by-class");

  // BY TEACHER state
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [empSearch, setEmpSearch] = useState("");
  // Pending grid toggles, keyed by `${classId}:${subjectId}`
  const [pendingCells, setPendingCells] = useState<Record<string, { classId: string; subjectId: string; periodsPerWeek: number; assigned: boolean }>>({});

  // ── Shared data ──────────────────────────────────────────────────────────
  const { data: empData } = useQuery({
    queryKey: ["all-employees-teacher"],
    queryFn: () => apiFetch<{ employees: Employee[] }>("/api/admin/employees?pageSize=500&role=teacher&status=all"),
  });
  const employees: Employee[] = useMemo(() =>
    (empData?.employees ?? []).filter(e => e.status !== "inactive"),
    [empData]
  );

  const { data: classesData } = useQuery({
    queryKey: ["all-classes-teacher"],
    queryFn: () => apiFetch<any>("/api/admin/classes?pageSize=200"),
  });
  const classes: ClassRecord[] = useMemo(() => {
    const d = classesData as any;
    return Array.isArray(d?.classes) ? d.classes : Array.isArray(d) ? d : [];
  }, [classesData]);

  // ── BY TEACHER data ──────────────────────────────────────────────────────
  const { data: currentAssignments, isLoading: assignLoading } = useQuery({
    queryKey: ["teacher-assignments", selectedEmpId],
    queryFn: () => apiFetch<TeacherAssignment[]>(`/api/admin/timetable/teacher-assignments?employeeId=${selectedEmpId}`),
    enabled: !!selectedEmpId,
  });

  // All classes' configured subjects in one call (no classId filter) so the
  // grid can render each class row with only that class's own subject columns.
  interface ClassSubjectFull extends ClassSubject { classId: string }
  const { data: allClassSubjects, isLoading: classSubjLoading } = useQuery({
    queryKey: ["class-subjects-all-teacher"],
    queryFn: () => apiFetch<ClassSubjectFull[]>("/api/admin/timetable/class-subjects"),
  });

  const classSubjectsByClass = useMemo(() => {
    const map: Record<string, ClassSubjectFull[]> = {};
    (allClassSubjects ?? []).forEach(s => { (map[s.classId] = map[s.classId] ?? []).push(s); });
    return map;
  }, [allClassSubjects]);

  // Existing assignment lookup: `${classId}:${subjectId}` → periodsPerWeek
  const existingCellMap = useMemo(() => {
    const map: Record<string, number> = {};
    (currentAssignments ?? []).forEach(a => { map[`${a.classId}:${a.subjectId}`] = a.periodsPerWeek; });
    return map;
  }, [currentAssignments]);

  // Reset pending toggles whenever the selected teacher changes
  useEffect(() => { setPendingCells({}); }, [selectedEmpId]);

  function cellIsAssigned(classId: string, subjectId: string): boolean {
    const key = `${classId}:${subjectId}`;
    if (pendingCells[key]) return pendingCells[key].assigned;
    return (existingCellMap[key] ?? 0) > 0;
  }

  function toggleCell(classId: string, subjectId: string, defaultPeriods: number) {
    const key = `${classId}:${subjectId}`;
    const originallyAssigned = (existingCellMap[key] ?? 0) > 0;
    const currentlyAssigned = cellIsAssigned(classId, subjectId);
    const nextAssigned = !currentlyAssigned;
    setPendingCells(prev => {
      const next = { ...prev };
      if (nextAssigned === originallyAssigned) {
        // Toggled back to its original state — nothing pending for this cell.
        delete next[key];
      } else {
        next[key] = { classId, subjectId, periodsPerWeek: defaultPeriods > 0 ? defaultPeriods : 5, assigned: nextAssigned };
      }
      return next;
    });
  }

  // ── BY TEACHER mutations ─────────────────────────────────────────────────
  const saveGridMut = useMutation({
    mutationFn: (changes: { classId: string; subjectId: string; periodsPerWeek: number; assigned: boolean }[]) =>
      apiFetch<{ saved: number; removed: number }>("/api/admin/timetable/teacher-assignments/by-teacher", {
        method: "POST",
        body: JSON.stringify({ employeeId: selectedEmpId, changes }),
      }),
    onSuccess: (res) => {
      toast({ title: `Saved — ${res.saved} added, ${res.removed} removed` });
      qc.invalidateQueries({ queryKey: ["teacher-assignments", selectedEmpId] });
      qc.invalidateQueries({ queryKey: ["teacher-assignments"] });
      setPendingCells({});
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function handleSaveGrid() {
    const changes = Object.values(pendingCells);
    if (!selectedEmpId || changes.length === 0) return;
    saveGridMut.mutate(changes);
  }

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch<{ success: boolean }>(`/api/admin/timetable/teacher-assignments/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Assignment removed" }); qc.invalidateQueries({ queryKey: ["teacher-assignments", selectedEmpId] }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  // ── Derived ──────────────────────────────────────────────────────────────
  const filteredEmp = useMemo(() =>
    employees.filter(e => !empSearch || `${e.fullName} ${e.staffId}`.toLowerCase().includes(empSearch.toLowerCase())),
    [employees, empSearch]
  );
  const selectedEmp = employees.find(e => e.id === selectedEmpId);
  const totalPeriodsAssigned = (currentAssignments ?? []).reduce((s, a) => s + a.periodsPerWeek, 0);
  const pendingCount = Object.keys(pendingCells).length;

  return (
    <div className="space-y-4">
      {/* ── Header + mode toggle ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Teacher Load</h2>
          <p className="text-sm text-slate-500 mt-0.5">Assign which subjects each teacher delivers per class and how many periods per week.</p>
        </div>
        {/* Mode toggle */}
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 flex-shrink-0">
          <button onClick={() => setMode("by-class")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === "by-class" ? "bg-primary text-primary-foreground" : "text-slate-500 hover:text-slate-700"}`}>
            <LayoutGrid className="h-3.5 w-3.5" />By Class
          </button>
          <button onClick={() => setMode("by-teacher")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === "by-teacher" ? "bg-primary text-primary-foreground" : "text-slate-500 hover:text-slate-700"}`}>
            <User className="h-3.5 w-3.5" />By Teacher
          </button>
        </div>
      </div>

      {/* ── BY CLASS view ── */}
      {mode === "by-class" && (
        <ByClassMatrix employees={employees} classes={classes} initialClassId={externalClassId} onClassChange={onClassChange} />
      )}

      {/* ── BY TEACHER view ── */}
      {mode === "by-teacher" && (
        <div className="flex gap-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" style={{ minHeight: 580 }}>
          {/* Teacher list (left) */}
          <div className="w-56 flex-shrink-0 border-r border-slate-200 flex flex-col">
            <div className="px-3 py-3 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Teachers</p>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input value={empSearch} onChange={e => setEmpSearch(e.target.value)}
                  placeholder="Search…" className="pl-7 h-8 text-xs" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredEmp.map(emp => (
                <button key={emp.id}
                  onClick={() => setSelectedEmpId(emp.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-slate-100 flex items-center gap-2 transition-colors ${
                    selectedEmpId === emp.id ? "bg-primary text-primary-foreground" : "hover:bg-slate-50 text-slate-700"
                  }`}>
                  <Users className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{emp.fullName}</p>
                    <p className={`text-xs truncate ${selectedEmpId === emp.id ? "text-primary-foreground/70" : "text-slate-400"}`}>{emp.staffId}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Assignment panel (right) */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {!selectedEmpId ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 p-8">
                <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <Users className="h-8 w-8 text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-500">Select a teacher to assign subjects</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold text-slate-800">{selectedEmp?.fullName}</p>
                    <p className="text-xs text-slate-400 mt-0.5 capitalize">{selectedEmp?.role?.replace(/_/g, " ")} {selectedEmp?.departmentName ? `· ${selectedEmp.departmentName}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!assignLoading && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        {(currentAssignments ?? []).length} subjects · {totalPeriodsAssigned} periods/week
                      </Badge>
                    )}
                    {pendingCount > 0 && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                        {pendingCount} pending change{pendingCount === 1 ? "" : "s"}
                      </Badge>
                    )}
                    <Button size="sm" onClick={handleSaveGrid} disabled={saveGridMut.isPending || pendingCount === 0}>
                      {saveGridMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                      Save{pendingCount > 0 ? ` (${pendingCount})` : ""}
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <p className="text-xs text-slate-400 mb-3">
                    Tap a subject cell to toggle it on/off for {selectedEmp?.fullName} in that class. Periods/week come from each class's configured subjects.
                  </p>
                  {(assignLoading || classSubjLoading) ? (
                    <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" /><span>Loading grid…</span>
                    </div>
                  ) : classes.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-10">No classes set up yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {classes.map(cls => {
                        const subjects = classSubjectsByClass[cls.id] ?? [];
                        if (subjects.length === 0) return null;
                        const rowAssignedCount = subjects.filter(s => cellIsAssigned(cls.id, s.subjectId)).length;
                        return (
                          <div key={cls.id} className="rounded-lg border border-slate-200 overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                              <div className="flex items-center gap-2">
                                <BookOpen className="h-3.5 w-3.5 text-slate-500" />
                                <span className="text-sm font-semibold text-slate-700">{cls.name}</span>
                              </div>
                              <Badge variant="outline" className={`text-xs ${rowAssignedCount > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "text-slate-400"}`}>
                                {rowAssignedCount}/{subjects.length} assigned
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-2 p-3">
                              {subjects.map(s => {
                                const key = `${cls.id}:${s.subjectId}`;
                                const assigned = cellIsAssigned(cls.id, s.subjectId);
                                const isPending = !!pendingCells[key];
                                // Display the actual assigned periods/week (pending change, then
                                // existing assignment) when assigned, falling back to the class's
                                // configured periods/week when not assigned yet.
                                const displayPeriods = pendingCells[key]?.periodsPerWeek
                                  ?? (existingCellMap[key] || undefined)
                                  ?? s.periodsPerWeek;
                                return (
                                  <button
                                    key={s.subjectId}
                                    onClick={() => toggleCell(cls.id, s.subjectId, s.periodsPerWeek)}
                                    title={`${s.subjectName} · ${displayPeriods} periods/week`}
                                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all flex flex-col items-start gap-0.5 min-w-24 ${
                                      assigned
                                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                        : "bg-white text-slate-500 border-slate-200 hover:border-primary hover:text-primary"
                                    } ${isPending ? "ring-2 ring-offset-1 ring-amber-400" : ""}`}
                                  >
                                    <span className="flex items-center gap-1">
                                      {assigned && <CheckCircle2 className="h-3 w-3" />}
                                      {s.subjectName}
                                    </span>
                                    <span className={`text-[10px] ${assigned ? "text-primary-foreground/70" : "text-slate-400"}`}>
                                      {displayPeriods} p/w
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {classes.every(cls => (classSubjectsByClass[cls.id] ?? []).length === 0) && (
                        <p className="text-sm text-amber-600 text-center py-10">
                          No classes have subjects configured yet. Set up Class/Program Subjects first.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
