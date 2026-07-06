import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import {
  useListAdminTimetableSlots, getListAdminTimetableSlotsQueryKey,
  useCreateAdminTimetableSlot, useUpdateAdminTimetableSlot, useDeleteAdminTimetableSlot,
  useListAdminTimetablePeriods, useListAdminClasses, useListAdminClassSections,
  useListAdminEmployees,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DataTable, type ColDef } from "@/components/DataTable";
import { Plus, Pencil, Trash2, Loader2, CalendarDays, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

type ClassSubjectOption = { subjectId: string; subjectName: string; subjectCode: string; periodsPerWeek: number };

type F = { classCode: string; sectionName: string; dayOfWeek: string; periodId: string; subjectCode: string; subjectName: string; teacherName: string };
const empty = (): F => ({ classCode: "", sectionName: "", dayOfWeek: "1", periodId: "", subjectCode: "", subjectName: "", teacherName: "" });
const toForm = (r: any): F => ({ classCode: r.classCode ?? "", sectionName: r.sectionName ?? "", dayOfWeek: String(r.dayOfWeek ?? 1), periodId: r.periodId ?? "", subjectCode: r.subjectCode ?? "", subjectName: r.subjectName ?? "", teacherName: r.teacherName ?? "" });
const toBody = (f: F) => ({ classCode: f.classCode.trim(), sectionName: f.sectionName.trim() || undefined, dayOfWeek: Number(f.dayOfWeek), periodId: f.periodId, subjectCode: f.subjectCode.trim() || undefined, subjectName: f.subjectName.trim() || undefined, teacherName: f.teacherName.trim() || undefined });

export function TimetableSlotsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminTimetableSlots();
  const { data: periods } = useListAdminTimetablePeriods();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminTimetableSlotsQueryKey() });
  const createMut = useCreateAdminTimetableSlot({ mutation: { onSuccess: inv } });
  const updateMut = useUpdateAdminTimetableSlot({ mutation: { onSuccess: inv } });
  const deleteMut = useDeleteAdminTimetableSlot({ mutation: { onSuccess: inv } });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<F>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const { toast } = useToast();

  // ── Dropdown data ───────────────────────────────────────────────────────────

  // Classes
  const { data: classesRaw } = useListAdminClasses();
  const classes = useMemo(
    () => (Array.isArray(classesRaw) ? classesRaw : []).filter(c => c.active),
    [classesRaw]
  );

  // Derive classId from selected classCode (needed for sections + subjects queries)
  const selectedClassId = useMemo(
    () => classes.find(c => c.code === form.classCode)?.id ?? "",
    [classes, form.classCode]
  );

  // Sections — filtered to selected class via dedicated endpoint (hook disables automatically when classId is empty)
  const { data: sectionsRaw } = useListAdminClassSections(selectedClassId);
  const sections = useMemo(
    () => (Array.isArray(sectionsRaw) ? sectionsRaw : []).filter(s => s.active !== false),
    [sectionsRaw]
  );

  // Class subjects — fetched when a class is selected
  const { data: classSubjectsRaw } = useQuery({
    queryKey: ["timetable-slots-class-subjects", selectedClassId],
    queryFn: () => apiFetch<ClassSubjectOption[]>(`/api/admin/timetable/class-subjects?classId=${selectedClassId}`),
    enabled: !!selectedClassId,
  });
  const classSubjects: ClassSubjectOption[] = Array.isArray(classSubjectsRaw) ? classSubjectsRaw : [];

  // Teachers — active teaching staff only (server-side role + status filter)
  const { data: employeesRaw } = useListAdminEmployees({ role: "teacher", status: "active", pageSize: 200 });
  const teachers = useMemo(() => {
    const d = employeesRaw as any;
    const all: any[] = Array.isArray(d?.employees) ? d.employees : Array.isArray(d) ? d : [];
    // Secondary client-side guard in case server returns extras
    return all.filter(e => e.status === "active");
  }, [employeesRaw]);

  // ── Form helpers ─────────────────────────────────────────────────────────────

  // When class changes, cascade-clear dependent fields
  function setClass(code: string) {
    setForm(f => ({ ...f, classCode: code, sectionName: "", subjectCode: "", subjectName: "" }));
  }

  // When subject selected by id, auto-fill name + code into form
  function setSubjectById(subjectId: string) {
    if (!subjectId) {
      setForm(f => ({ ...f, subjectName: "", subjectCode: "" }));
      return;
    }
    const s = classSubjects.find(cs => cs.subjectId === subjectId);
    setForm(f => ({ ...f, subjectName: s?.subjectName ?? "", subjectCode: s?.subjectCode ?? "" }));
  }

  // Resolve subjectId from current form.subjectName for the controlled Select value
  const selectedSubjectId = useMemo(
    () => classSubjects.find(s => s.subjectName === form.subjectName)?.subjectId ?? "",
    [classSubjects, form.subjectName]
  );

  function openAdd() { setEditing(null); setForm(empty()); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toForm(r)); setOpen(true); }
  function onClose() { setOpen(false); setEditing(null); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.classCode) { toast({ title: "Please select a class", variant: "destructive" }); return; }
    if (!form.periodId) { toast({ title: "Please select a period", variant: "destructive" }); return; }
    const body = toBody(form);
    if (editing) {
      updateMut.mutate(
        { id: editing.id, data: body },
        { onSuccess: () => { toast({ title: "Slot updated" }); onClose(); }, onError: (err) => toast({ title: "Failed to save slot", description: (err as any)?.data?.error ?? (err as Error)?.message, variant: "destructive" }) }
      );
    } else {
      createMut.mutate(
        { data: body },
        { onSuccess: () => { toast({ title: "Slot added" }); onClose(); }, onError: (err) => toast({ title: "Failed to add slot", description: (err as any)?.data?.error ?? (err as Error)?.message, variant: "destructive" }) }
      );
    }
  }

  const periodList = Array.isArray(periods) ? periods : [];
  const rows = (Array.isArray(data) ? data : []).filter(r => !searchQ || JSON.stringify(r).toLowerCase().includes(searchQ.toLowerCase()));

  const cols: ColDef<any>[] = [
    { key: "classCode", label: "Class/Program", sortable: true, defaultVisible: true, defaultWidth: 100, render: r => <span className="text-sm font-medium">{r.classCode}</span>, getText: r => r.classCode ?? "" },
    { key: "sectionName", label: "Section", sortable: true, defaultVisible: true, defaultWidth: 90, render: r => <span className="text-sm">{r.sectionName || "—"}</span>, getText: r => r.sectionName ?? "" },
    { key: "dayOfWeek", label: "Day", sortable: true, defaultVisible: true, defaultWidth: 110, render: r => <span className="text-sm">{DAYS[(r.dayOfWeek ?? 1) - 1] ?? "—"}</span>, getText: r => DAYS[(r.dayOfWeek ?? 1) - 1] ?? "" },
    { key: "periodId", label: "Period", defaultVisible: true, defaultWidth: 130, render: r => { const p = periodList.find((x: any) => x.id === r.periodId); return <span className="text-sm">{(p as any)?.name ?? "—"}</span>; }, getText: r => r.periodId ?? "" },
    { key: "subjectName", label: "Subject", sortable: true, defaultVisible: true, defaultWidth: 180, render: r => <span className="text-sm">{r.subjectName || r.subjectCode || "—"}</span>, getText: r => r.subjectName ?? "" },
    { key: "teacherName", label: "Teacher", sortable: true, defaultVisible: true, defaultWidth: 160, render: r => <span className="text-sm text-slate-600">{r.teacherName || "—"}</span>, getText: r => r.teacherName ?? "" },
    { key: "_actions", label: "", defaultVisible: true, defaultWidth: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ), getText: () => "" },
  ];

  return (
    <>
      <DataTable
        tableId="ccm_timetable_slots_v2"
        title="Timetable Slots"
        subtitle="Class/Program-wise timetable entries for each period"
        action={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" />Add Slot</Button>}
        filters={
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search by class, subject…" className="pl-8 h-9 text-sm" />
          </div>
        }
        columns={cols} data={rows} total={rows.length} isLoading={isLoading} pageSize={50} clientPaginate
        emptyIcon={<div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center"><CalendarDays className="h-7 w-7 text-slate-300" /></div>}
        emptyTitle="No timetable slots" emptyDescription="Click Add Slot to build out the timetable."
      />

      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Slot" : "Add Timetable Slot"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">

            {/* Row 1: Class / Section / Day */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Class/Program *</Label>
                <Select value={form.classCode} onValueChange={setClass}>
                  <SelectTrigger><SelectValue placeholder="Select class…" /></SelectTrigger>
                  <SelectContent>
                    {classes.map(c => <SelectItem key={c.id} value={c.code}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Section</Label>
                <Select
                  value={form.sectionName || "__none__"}
                  onValueChange={v => setForm(f => ({ ...f, sectionName: v === "__none__" ? "" : v }))}
                  disabled={!form.classCode}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={form.classCode ? "Any section" : "Select class first"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Any —</SelectItem>
                    {sections.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Day *</Label>
                <Select value={form.dayOfWeek} onValueChange={v => setForm(f => ({ ...f, dayOfWeek: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => <SelectItem key={i + 1} value={String(i + 1)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Period */}
            <div className="space-y-1.5">
              <Label>Period *</Label>
              <Select value={form.periodId} onValueChange={v => setForm(f => ({ ...f, periodId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select period…" /></SelectTrigger>
                <SelectContent>
                  {periodList.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Select
                value={selectedSubjectId || "__none__"}
                onValueChange={v => setSubjectById(v === "__none__" ? "" : v)}
                disabled={!form.classCode}
              >
                <SelectTrigger>
                  <SelectValue placeholder={
                    !form.classCode ? "Select class first" :
                    classSubjects.length === 0 ? "No subjects assigned to this class" :
                    "Select subject…"
                  } />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {classSubjects.map(s => (
                    <SelectItem key={s.subjectId} value={s.subjectId}>
                      {s.subjectName}{s.subjectCode ? ` (${s.subjectCode})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Teacher */}
            <div className="space-y-1.5">
              <Label>Teacher</Label>
              <Select
                value={form.teacherName || "__none__"}
                onValueChange={v => setForm(f => ({ ...f, teacherName: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select teacher…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {teachers.map(e => {
                    const name = e.fullName;
                    return <SelectItem key={e.id} value={name}>{name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Save Changes" : "Add Slot"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete slot?</AlertDialogTitle><AlertDialogDescription>This will remove the timetable entry.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { deleteMut.mutate({ id: deleteId! }, { onSuccess: () => { setDeleteId(null); toast({ title: "Slot deleted" }); }, onError: (err: unknown) => { toast({ title: "Failed to delete slot", description: err instanceof Error ? err.message : "An error occurred", variant: "destructive" }); } }); }} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
