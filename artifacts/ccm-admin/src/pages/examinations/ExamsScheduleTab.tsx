import { useState, useEffect } from "react";
import { formatDate } from "@/lib/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListAdminAcademicYears, useListAdminSubjectsByClass, getListAdminSubjectsByClassQueryKey } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import { Plus, Pencil, Trash2, CalendarDays, Search, X, Layers } from "lucide-react";
import { ClassRecord, AcademicYear, ClassSelect, SessionSelect } from "./ExamSelectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

interface ExamType { id: string; name: string; }
interface Subject { id: string; code: string; name: string; maxMarks?: number; passMarks?: number; }
interface Schedule {
  id: string; examTypeId: string | null; examTypeName: string | null;
  academicYearId: string | null;
  classCode: string; subjectCode: string; subjectName: string | null;
  sessionLabel: string; examDate: string | null;
  totalMarks: number; passMarks: number; venue: string | null; notes: string | null; active: boolean;
}

const BLANK: Partial<Schedule> = {
  examTypeId: "", academicYearId: null, classCode: "", subjectCode: "", subjectName: "",
  sessionLabel: "",   // pre-filled with active year at open time
  examDate: "", totalMarks: 100, passMarks: 33, venue: "", notes: "",
};

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return formatDate(s);
}


// ── Bulk create dialog ─────────────────────────────────────────────────────────
function BulkScheduleDialog({
  open, onClose, types, classes, classesLoading, academicYears, activeYearName, onSaved,
}: {
  open: boolean; onClose: () => void;
  types: ExamType[]; classes: ClassRecord[]; classesLoading: boolean;
  academicYears: AcademicYear[]; activeYearName: string;
  onSaved: () => void;
}) {
  const [examTypeId, setExamTypeId]   = useState<string>("__none__");
  const [classCode, setClassCode]     = useState<string>("");
  const [session, setSession]         = useState<string>(activeYearName);
  const [examDate, setExamDate]       = useState("");
  const [totalMarks, setTotalMarks]   = useState(100);
  const [passMarks, setPassMarks]     = useState(33);
  const [venue, setVenue]             = useState("");
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [saving, setSaving]           = useState(false);

  const { data: subjectsData = [], isLoading: subjectsLoading } = useListAdminSubjectsByClass(
    classCode,
    { query: { queryKey: getListAdminSubjectsByClassQueryKey(classCode), enabled: !!classCode, staleTime: 30_000 } },
  );
  const subjects: Subject[] = subjectsData as Subject[];

  // Pre-select active year whenever dialog opens
  useEffect(() => {
    if (open && activeYearName) setSession(activeYearName);
  }, [open, activeYearName]);

  // Clear subject selection when class changes
  useEffect(() => {
    setSelected(new Set());
  }, [classCode]);

  function reset() {
    setExamTypeId("__none__"); setClassCode(""); setSession(activeYearName);
    setExamDate(""); setTotalMarks(100); setPassMarks(33); setVenue(""); setSelected(new Set());
  }
  function toggle(code: string) {
    setSelected(s => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }
  function toggleAll() {
    setSelected(s => s.size === subjects.length ? new Set() : new Set(subjects.map(s => s.code)));
  }

  async function handleSave() {
    if (!classCode || !session || selected.size === 0) return;
    setSaving(true);
    try {
      const resolvedYearId = academicYears.find(y => y.name === session)?.id ?? null;
      const items = [...selected].map(subCode => {
        const sub = subjects.find(s => s.code === subCode);
        return {
          examTypeId: examTypeId === "__none__" ? null : examTypeId,
          academicYearId: resolvedYearId,
          classCode, subjectCode: subCode, subjectName: sub?.name ?? subCode,
          sessionLabel: session, examDate: examDate || null,
          totalMarks: sub?.maxMarks ?? totalMarks,
          passMarks: sub?.passMarks ?? passMarks,
          venue: venue || null,
        };
      });
      await apiFetch("/api/admin/exams/schedules/bulk", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      toast({ title: "Schedules created", description: `${selected.size} exam${selected.size !== 1 ? "s" : ""} scheduled successfully.` });
      onSaved();
      onClose();
      reset();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Schedule Exams</DialogTitle>
          <p className="text-sm text-slate-500 mt-0.5">Set the exam details once, then tick which subjects to schedule.</p>
        </DialogHeader>

        {/* Common fields */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="col-span-2">
            <Label>Exam Type</Label>
            <Select value={examTypeId} onValueChange={setExamTypeId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select type…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Class/Program *</Label>
            <ClassSelect value={classCode} onChange={setClassCode} classes={classes} classesLoading={classesLoading} />
          </div>

          <div>
            <Label>Session *</Label>
            <SessionSelect value={session} onChange={setSession} academicYears={academicYears} />
          </div>

          <div>
            <Label>Exam Date</Label>
            <Input type="date" className="mt-1" value={examDate} onChange={e => setExamDate(e.target.value)} />
          </div>

          <div>
            <Label>Venue</Label>
            <Input className="mt-1" placeholder="e.g. Main Hall" value={venue} onChange={e => setVenue(e.target.value)} />
          </div>

          <div>
            <Label>Default Total Marks</Label>
            <Input type="number" className="mt-1" value={totalMarks} onChange={e => setTotalMarks(Number(e.target.value))} />
            <p className="text-[11px] text-slate-400 mt-0.5">Overridden per-subject if subject has its own max marks</p>
          </div>

          <div>
            <Label>Default Pass Marks</Label>
            <Input type="number" className="mt-1" value={passMarks} onChange={e => setPassMarks(Number(e.target.value))} />
          </div>
        </div>

        {/* Subject picker */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <Label>Subjects to schedule ({selected.size} selected)</Label>
            <button onClick={toggleAll} className="text-xs text-indigo-600 hover:underline">
              {selected.size === subjects.length ? "Deselect all" : "Select all"}
            </button>
          </div>
          {!classCode ? (
            <p className="text-sm text-slate-400 py-4 text-center">Select a class above to see its subjects.</p>
          ) : subjectsLoading ? (
            <p className="text-sm text-slate-400 py-4 text-center">Loading subjects…</p>
          ) : subjects.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No active subjects assigned to this class.</p>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden divide-y divide-border max-h-56 overflow-y-auto">
              {subjects.map(sub => (
                <label key={sub.code} className={cn("flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors", selected.has(sub.code) ? "bg-indigo-50" : "hover:bg-slate-50")}>
                  <input
                    type="checkbox"
                    checked={selected.has(sub.code)}
                    onChange={() => toggle(sub.code)}
                    className="h-4 w-4 accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-slate-700 flex-1">{sub.name}</span>
                  <span className="text-xs text-slate-400 font-mono">{sub.code}</span>
                  {sub.maxMarks && <span className="text-xs text-slate-400">/{sub.maxMarks}</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Cancel</Button>
          <Button
            disabled={!classCode || !session || selected.size === 0 || saving || classesLoading || subjectsLoading}
            onClick={handleSave}
          >
            {saving ? `Creating ${selected.size} schedules…` : `Create ${selected.size || ""} Schedule${selected.size !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ExamsScheduleTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("__all__");
  const [filterType, setFilterType] = useState("__all__");
  const [filterSession, setFilterSession] = useState("__all__");
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [form, setForm] = useState<Partial<Schedule>>(BLANK);
  const [delId, setDelId] = useState<string | null>(null);

  // Academic years — loaded first so we can use academicYearId for server-side filtering
  const { data: academicYearsRaw } = useListAdminAcademicYears();
  const academicYears: AcademicYear[] = Array.isArray(academicYearsRaw) ? academicYearsRaw : [];
  const activeYear = academicYears.find(y => y.active);
  const activeYearName = activeYear?.name ?? "";

  const filterSessionYearId = filterSession === "__all__" ? undefined : academicYears.find(y => y.name === filterSession)?.id;

  const { data: schedules = [], isLoading } = useQuery<Schedule[]>({
    queryKey: ["exam-schedules", filterSessionYearId ?? "__all__"],
    queryFn: () => {
      const p = new URLSearchParams();
      if (filterSessionYearId) p.set("academicYearId", filterSessionYearId);
      return apiFetch(`/api/admin/exams/schedules${p.size ? "?" + p.toString() : ""}`);
    },
    staleTime: 10_000,
  });
  const { data: types = [] } = useQuery<ExamType[]>({
    queryKey: ["exam-types"],
    queryFn: () => apiFetch("/api/admin/exams/types"),
    staleTime: 60_000,
  });
  const { data: classes = [], isLoading: classesLoading } = useQuery<ClassRecord[]>({
    queryKey: ["classes-list"],
    queryFn: () => apiFetch<ClassRecord[]>("/api/admin/classes"),
    staleTime: 60_000,
  });
  const { data: subjectsData = [], isLoading: subjectsLoading } = useListAdminSubjectsByClass(
    form.classCode ?? "",
    { query: { queryKey: getListAdminSubjectsByClassQueryKey(form.classCode ?? ""), enabled: !!form.classCode, staleTime: 30_000 } },
  );
  const subjects: Subject[] = subjectsData as Subject[];

  const inv = () => qc.invalidateQueries({ queryKey: ["exam-schedules"] });

  const saveMut = useMutation({
    mutationFn: (data: Partial<Schedule>) =>
      editing
        ? apiFetch(`/api/admin/exams/schedules/${editing.id}`, { method: "PUT", body: JSON.stringify(data) })
        : apiFetch("/api/admin/exams/schedules", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { inv(); setOpen(false); toast({ title: editing ? "Updated" : "Created" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/exams/schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDelId(null); toast({ title: "Deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  // Reset subject when class changes in the single exam dialog
  useEffect(() => {
    if (open) {
      setForm(f => ({ ...f, subjectCode: "", subjectName: "" }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.classCode]);

  function openCreate() {
    setEditing(null);
    setForm({ ...BLANK, sessionLabel: activeYearName, academicYearId: activeYear?.id ?? null });
    setOpen(true);
  }
  function openEdit(s: Schedule) { setEditing(s); setForm({ ...s }); setOpen(true); }
  function setF(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }
  function setSession(v: string) {
    const yId = academicYears.find(y => y.name === v)?.id ?? null;
    setForm(f => ({ ...f, sessionLabel: v, academicYearId: yId }));
  }

  const filtered = schedules.filter(s => {
    if (filterClass !== "__all__" && s.classCode !== filterClass) return false;
    if (filterType  !== "__all__" && s.examTypeId !== filterType)  return false;
    if (search) {
      const q = search.toLowerCase();
      return s.classCode.toLowerCase().includes(q)
        || (s.subjectName ?? s.subjectCode).toLowerCase().includes(q)
        || s.sessionLabel.toLowerCase().includes(q);
    }
    return true;
  });

  const classCodes = [...new Set(schedules.map(s => s.classCode))].sort();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">Each row is one exam sitting — one class × one subject × one exam type.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
            <Layers className="mr-1.5 h-4 w-4" /> Bulk Schedule
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Single Exam
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search class, subject, session…" className="pl-8 h-9 text-sm" />
        </div>
        <Select value={filterClass} onValueChange={setFilterClass}>
          <SelectTrigger className="h-9 text-sm w-36"><SelectValue placeholder="All Classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Classes</SelectItem>
            {classCodes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-9 text-sm w-40"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Exam Types</SelectItem>
            {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSession} onValueChange={setFilterSession}>
          <SelectTrigger className="h-9 text-sm w-36"><SelectValue placeholder="All Years" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Years</SelectItem>
            {academicYears.map(y => <SelectItem key={y.id} value={y.name}>{y.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterClass !== "__all__" || filterType !== "__all__" || filterSession !== "__all__" || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterClass("__all__"); setFilterType("__all__"); setFilterSession("__all__"); }}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Exam Type","Class","Subject","Session","Date","Total","Pass","Venue",""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}><td colSpan={9} className="px-3 py-3"><div className="h-4 bg-slate-100 rounded-full animate-pulse w-3/4" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-14 text-center">
                  <CalendarDays className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                  <p className="text-sm text-slate-400">
                    {schedules.length === 0
                      ? <>No exams scheduled yet — use <strong>Bulk Schedule</strong> to create all at once.</>
                      : "No results match your filters."}
                  </p>
                </td></tr>
              ) : filtered.map(s => (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 text-slate-600">{s.examTypeName ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{s.classCode}</td>
                  <td className="px-3 py-2.5 text-slate-700">{s.subjectName ?? s.subjectCode}</td>
                  <td className="px-3 py-2.5 text-slate-500">{s.sessionLabel}</td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(s.examDate)}</td>
                  <td className="px-3 py-2.5 text-slate-700 text-center font-mono">{s.totalMarks}</td>
                  <td className="px-3 py-2.5 text-slate-500 text-center font-mono">{s.passMarks}</td>
                  <td className="px-3 py-2.5 text-slate-400">{s.venue ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDelId(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            {filtered.length} of {schedules.length} schedule{schedules.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Bulk dialog */}
      <BulkScheduleDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        types={types}
        classes={classes}
        classesLoading={classesLoading}
        academicYears={academicYears}
        activeYearName={activeYearName}
        onSaved={inv}
      />

      {/* Single add/edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Exam Schedule" : "Schedule Single Exam"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label>Exam Type</Label>
              <Select value={form.examTypeId ?? "__none__"} onValueChange={v => setF("examTypeId", v === "__none__" ? null : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select type…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Class/Program *</Label>
              <ClassSelect
                value={form.classCode ?? ""}
                onChange={v => setF("classCode", v)}
                classes={classes}
                classesLoading={classesLoading}
              />
            </div>
            <div>
              <Label>Session *</Label>
              <SessionSelect
                value={form.sessionLabel ?? ""}
                onChange={setSession}
                academicYears={academicYears}
              />
            </div>
            <div>
              <Label>Subject *</Label>
              {!form.classCode ? (
                <Select disabled>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select a class first…" /></SelectTrigger>
                </Select>
              ) : subjectsLoading ? (
                <Select disabled>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Loading subjects…" /></SelectTrigger>
                </Select>
              ) : subjects.length === 0 ? (
                <Select disabled>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="No active subjects assigned to this class." /></SelectTrigger>
                </Select>
              ) : (
                <Select value={form.subjectCode ?? "__none__"} onValueChange={v => {
                  const sub = subjects.find(s => s.code === v);
                  setF("subjectCode", v === "__none__" ? "" : v);
                  if (sub) { setF("subjectName", sub.name); if (sub.maxMarks) setF("totalMarks", sub.maxMarks); if (sub.passMarks) setF("passMarks", sub.passMarks); }
                }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select subject…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Select —</SelectItem>
                    {subjects.map(s => <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>Exam Date</Label>
              <Input type="date" className="mt-1" value={form.examDate ?? ""} onChange={e => setF("examDate", e.target.value)} />
            </div>
            <div>
              <Label>Venue</Label>
              <Input className="mt-1" placeholder="e.g. Main Hall" value={form.venue ?? ""} onChange={e => setF("venue", e.target.value)} />
            </div>
            <div>
              <Label>Total Marks</Label>
              <Input type="number" className="mt-1" value={form.totalMarks ?? 100} onChange={e => setF("totalMarks", Number(e.target.value))} />
            </div>
            <div>
              <Label>Pass Marks</Label>
              <Input type="number" className="mt-1" value={form.passMarks ?? 33} onChange={e => setF("passMarks", Number(e.target.value))} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Input className="mt-1" placeholder="Optional notes" value={form.notes ?? ""} onChange={e => setF("notes", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.classCode || !form.subjectCode || !form.sessionLabel || saveMut.isPending}
              onClick={() => saveMut.mutate(form)}
            >
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Create Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!delId} onOpenChange={() => setDelId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Exam Schedule?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">All results entered for this exam will also be deleted. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={delMut.isPending} onClick={() => delId && delMut.mutate(delId)}>
              {delMut.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
