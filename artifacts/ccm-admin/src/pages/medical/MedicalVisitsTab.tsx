import { useState, useEffect, useRef } from "react";
import { formatDate } from "@/lib/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, HeartPulse, Search, ChevronLeft, ChevronRight, CalendarDays, LogOut, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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

interface Student  { id: string; applicantId: string; fullName: string; classCode: string | null; }
interface Condition { id: string; name: string; }
interface Medicine  { id: string; name: string; unit: string; }
interface Visit {
  id: string;
  studentId: string | null; studentName: string; applicantId: string | null; classCode: string | null;
  visitDate: string; complaint: string;
  conditionId: string | null; conditionName: string | null;
  diagnosis: string | null; treatmentGiven: string | null; medicinesGiven: string | null;
  status: string; referredTo: string | null; notes: string | null;
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  outpatient: { label: "Outpatient",  color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200" },
  inpatient:  { label: "Admitted",    color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
  referred:   { label: "Referred",    color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
  discharged: { label: "Discharged",  color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate  = (iso: string) => formatDate(iso + "T00:00:00");
const addDays  = (iso: string, n: number) => new Date(new Date(iso + "T00:00:00").getTime() + n * 86_400_000).toISOString().slice(0, 10);

type F = {
  studentName: string; applicantId: string; classCode: string;
  visitDate: string; complaint: string;
  conditionId: string; diagnosis: string; treatmentGiven: string;
  medicinesGiven: string; status: string; referredTo: string; notes: string;
};
const empty = (): F => ({ studentName: "", applicantId: "", classCode: "", visitDate: todayStr(), complaint: "", conditionId: "", diagnosis: "", treatmentGiven: "", medicinesGiven: "", status: "outpatient", referredTo: "", notes: "" });
const toForm = (v: Visit): F => ({ studentName: v.studentName ?? "", applicantId: v.applicantId ?? "", classCode: v.classCode ?? "", visitDate: v.visitDate, complaint: v.complaint ?? "", conditionId: v.conditionId ?? "", diagnosis: v.diagnosis ?? "", treatmentGiven: v.treatmentGiven ?? "", medicinesGiven: v.medicinesGiven ?? "", status: v.status ?? "outpatient", referredTo: v.referredTo ?? "", notes: v.notes ?? "" });

// ── Student autocomplete ───────────────────────────────────────────────────────
function StudentPicker({ value, grValue, classValue, onChange }: {
  value: string; grValue: string; classValue: string;
  onChange: (name: string, gr: string, cls: string) => void;
}) {
  const [q, setQ] = useState(value);
  const [showDrop, setShowDrop] = useState(false);
  const [selected, setSelected] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery<{ students: Student[] }>({
    queryKey: ["student-search-med", q],
    queryFn: () => apiFetch(`/api/admin/students?q=${encodeURIComponent(q)}&pageSize=10`),
    enabled: q.length >= 2 && !selected,
    staleTime: 10_000,
  });
  const results = data?.students ?? [];

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShowDrop(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(s: Student) {
    const name = s.fullName;
    setQ(name); setSelected(true); setShowDrop(false);
    onChange(name, s.applicantId, s.classCode ?? "");
  }
  function handleChange(val: string) {
    setQ(val); setSelected(false); onChange(val, grValue, classValue);
    if (val.length >= 2) setShowDrop(true);
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input value={q} onChange={e => handleChange(e.target.value)} onFocus={() => { if (q.length >= 2 && !selected) setShowDrop(true); }} placeholder="Type name or Applicant ID…" className="pl-8" />
      </div>
      {showDrop && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-white shadow-lg overflow-hidden">
          {results.map(s => (
            <button key={s.id} type="button" onMouseDown={() => pick(s)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left border-b border-border last:border-0">
              <div className="h-7 w-7 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 text-red-500 font-semibold text-xs">{s.fullName[0]}</div>
              <div>
                <p className="text-sm font-medium text-slate-800">{s.fullName}</p>
                <p className="text-xs text-slate-400">{s.applicantId}{s.classCode ? ` · Class ${s.classCode}` : ""}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {showDrop && q.length >= 2 && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-white shadow-lg px-3 py-3 text-sm text-slate-400">
          No match — type to use the name directly.
        </div>
      )}
    </div>
  );
}

// ── Medicine multi-picker ──────────────────────────────────────────────────────
function MedicinePicker({ value, medicines, onChange }: { value: string; medicines: Medicine[]; onChange: (v: string) => void; }) {
  const [search, setSearch] = useState("");
  const selected = new Set(value.split(",").map(s => s.trim()).filter(Boolean));

  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    onChange(Array.from(next).join(", "));
  }

  const filtered = medicines.filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter medicines…" className="pl-8 h-8 text-sm" />
      </div>
      <div className="max-h-32 overflow-y-auto rounded-lg border border-border divide-y divide-border/50">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-400">No medicines in catalog — add them in Setup.</p>
        ) : filtered.map(m => {
          const on = selected.has(m.name);
          return (
            <button key={m.id} type="button" onClick={() => toggle(m.name)}
              className={cn("w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors text-sm", on ? "bg-red-50" : "hover:bg-slate-50")}>
              <div className={cn("h-3.5 w-3.5 rounded border flex-shrink-0 flex items-center justify-center", on ? "bg-red-500 border-red-500" : "border-slate-300")}>
                {on && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </div>
              <span className={cn("font-medium", on ? "text-red-800" : "text-slate-700")}>{m.name}</span>
              <span className="text-xs text-slate-400 ml-auto">{m.unit}</span>
            </button>
          );
        })}
      </div>
      {selected.size > 0 && (
        <p className="text-xs text-red-700 font-medium truncate">Selected: {Array.from(selected).join(", ")}</p>
      )}
    </div>
  );
}

// ── Refer dialog ───────────────────────────────────────────────────────────────
function ReferDialog({ visit, open, onClose, onConfirm, isPending }: {
  visit: Visit | null; open: boolean; onClose: () => void;
  onConfirm: (referredTo: string) => void; isPending: boolean;
}) {
  const [where, setWhere] = useState("");
  useEffect(() => { if (open) setWhere(""); }, [open]);
  if (!visit) return null;
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Phone className="h-4 w-4 text-purple-600" />Refer Patient</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="rounded-lg bg-slate-50 border border-border p-3 text-sm">
            <p className="font-medium text-slate-800">{visit.studentName}</p>
            <p className="text-xs text-slate-400">{visit.complaint}</p>
          </div>
          <div>
            <Label>Referred To</Label>
            <Input autoFocus className="mt-1" placeholder="Hospital / specialist name" value={where} onChange={e => setWhere(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-purple-600 hover:bg-purple-700" disabled={!where.trim() || isPending} onClick={() => onConfirm(where.trim())}>
            {isPending ? "Saving…" : "Confirm Referral"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main tab ───────────────────────────────────────────────────────────────────
const STATUS_TABS = ["today", "inpatient", "all"] as const;
const STATUS_TAB_LABELS: Record<string, string> = { today: "Today", inpatient: "Admitted", all: "All Visits" };

export function MedicalVisitsTab() {
  const qc = useQueryClient();
  const [viewDate, setViewDate] = useState(todayStr());
  const [statusTab, setStatusTab] = useState<string>("today");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Visit | null>(null);
  const [form, setForm] = useState<F>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [referVisit, setReferVisit] = useState<Visit | null>(null);
  const { toast } = useToast();

  const isToday = viewDate === todayStr();

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["medical-visits"] });
    qc.invalidateQueries({ queryKey: ["medical-stats"] });
  };

  // Fetch by date for "today" tab, all for "all" / "inpatient"
  const visitsQuery = useQuery<Visit[]>({
    queryKey: ["medical-visits", statusTab, viewDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusTab === "today") params.set("date", viewDate);
      if (statusTab === "inpatient") params.set("status", "inpatient");
      return apiFetch(`/api/admin/medical/visits?${params}`);
    },
    staleTime: 10_000,
  });
  const visits = visitsQuery.data ?? [];

  const { data: conditions = [] } = useQuery<Condition[]>({
    queryKey: ["medical-conditions"],
    queryFn: () => apiFetch("/api/admin/medical/conditions"),
    staleTime: 60_000,
  });

  const { data: medicines = [] } = useQuery<Medicine[]>({
    queryKey: ["medical-medicines"],
    queryFn: () => apiFetch("/api/admin/medical/medicines"),
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: (f: F) => {
      const body = {
        studentName: f.studentName.trim() || "",
        applicantId: f.applicantId.trim() || null,
        classCode: f.classCode.trim() || null,
        visitDate: f.visitDate,
        complaint: f.complaint.trim() || "",
        conditionId: f.conditionId || null,
        diagnosis: f.diagnosis.trim() || null,
        treatmentGiven: f.treatmentGiven.trim() || null,
        medicinesGiven: f.medicinesGiven.trim() || null,
        status: f.status,
        referredTo: f.referredTo.trim() || null,
        notes: f.notes.trim() || null,
      };
      return editing
        ? apiFetch(`/api/admin/medical/visits/${editing.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiFetch("/api/admin/medical/visits", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { inv(); setOpen(false); toast({ title: editing ? "Visit updated" : "Visit recorded" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status, referredTo }: { id: string; status: string; referredTo?: string }) =>
      apiFetch(`/api/admin/medical/visits/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, referredTo }) }),
    onSuccess: () => { inv(); setReferVisit(null); toast({ title: "Status updated" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/medical/visits/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDeleteId(null); toast({ title: "Record deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function setF(k: keyof F, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const filtered = visits.filter(v => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (v.studentName ?? "").toLowerCase().includes(q)
      || (v.applicantId ?? "").toLowerCase().includes(q)
      || (v.complaint ?? "").toLowerCase().includes(q)
      || (v.conditionName ?? "").toLowerCase().includes(q);
  });

  const admittedCount = visits.filter(v => v.status === "inpatient").length;

  return (
    <div className="space-y-4">
      {/* Admitted banner */}
      {statusTab === "today" && admittedCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <HeartPulse className="h-5 w-5 text-orange-500 flex-shrink-0 animate-pulse" />
          <p className="text-sm text-orange-700">
            <strong>{admittedCount} patient{admittedCount !== 1 ? "s" : ""}</strong> currently admitted in sick bay.
          </p>
          <button className="ml-auto text-xs text-orange-600 underline underline-offset-2" onClick={() => setStatusTab("inpatient")}>View</button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">Record patient visits, treatments, and admissions.</p>
        <Button size="sm" onClick={() => { setEditing(null); setForm({ ...empty(), visitDate: viewDate }); setOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Record Visit
        </Button>
      </div>

      {/* Status tabs */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex">
          {STATUS_TABS.map(s => (
            <button key={s} onClick={() => setStatusTab(s)}
              className={cn("px-3 py-2 text-xs font-medium border-b-2 transition-colors",
                statusTab === s ? "border-red-500 text-red-600" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {STATUS_TAB_LABELS[s]}
            </button>
          ))}
        </div>
        {/* Date nav — only shown on Today tab */}
        {statusTab === "today" && (
          <div className="flex items-center gap-1 pb-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewDate(d => addDays(d, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 min-w-0">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <span className="hidden sm:inline">{fmtDate(viewDate)}</span>
              <span className="sm:hidden">{viewDate}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewDate(d => addDays(d, 1))} disabled={viewDate >= todayStr()}><ChevronRight className="h-4 w-4" /></Button>
            {!isToday && <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setViewDate(todayStr())}>Today</Button>}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient, complaint…" className="pl-8 h-9 text-sm" />
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Patient","Complaint / Condition","Treatment","Medicines","Status",""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visitsQuery.isLoading ? (
                [...Array(4)].map((_, i) => <tr key={i}><td colSpan={6} className="px-3 py-3"><div className="h-4 bg-slate-100 rounded-full animate-pulse w-2/3" /></td></tr>)
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-14 text-center">
                  <HeartPulse className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                  <p className="text-sm text-slate-400">
                    {visits.length === 0
                      ? statusTab === "today" ? `No visits on ${fmtDate(viewDate)}.` : "No records."
                      : "No records match your search."}
                  </p>
                </td></tr>
              ) : filtered.map(v => {
                const s = STATUS_CFG[v.status] ?? STATUS_CFG.outpatient;
                const isActive = v.status === "outpatient" || v.status === "inpatient";
                return (
                  <tr key={v.id} className={cn("hover:bg-muted/30 transition-colors", v.status === "inpatient" ? "bg-orange-50/40" : "")}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-800">{v.studentName || "—"}</p>
                      <p className="text-xs text-slate-400">{[v.applicantId, v.classCode ? `Class ${v.classCode}` : null].filter(Boolean).join(" · ") || v.visitDate}</p>
                    </td>
                    <td className="px-3 py-2.5 max-w-[200px]">
                      <p className="text-slate-700 truncate">{v.complaint || "—"}</p>
                      {v.conditionName && <p className="text-xs text-slate-400 truncate">{v.conditionName}</p>}
                      {v.diagnosis && !v.conditionName && <p className="text-xs text-slate-400 truncate">{v.diagnosis}</p>}
                    </td>
                    <td className="px-3 py-2.5 max-w-[160px]">
                      <p className="text-xs text-slate-600 truncate">{v.treatmentGiven || "—"}</p>
                    </td>
                    <td className="px-3 py-2.5 max-w-[160px]">
                      <p className="text-xs text-slate-600 truncate">{v.medicinesGiven || "—"}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", s.color, s.bg, s.border)}>{s.label}</span>
                      {v.referredTo && <p className="text-[10px] text-purple-500 mt-0.5 truncate max-w-[100px]">→ {v.referredTo}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {v.status === "inpatient" && (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-green-600 border-green-200 hover:bg-green-50"
                            onClick={() => statusMut.mutate({ id: v.id, status: "discharged" })}>
                            <LogOut className="h-3 w-3 mr-1" />Discharge
                          </Button>
                        )}
                        {isActive && (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-purple-600 border-purple-200 hover:bg-purple-50"
                            onClick={() => setReferVisit(v)}>
                            <Phone className="h-3 w-3 mr-1" />Refer
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(v); setForm(toForm(v)); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(v.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            {filtered.length} record{filtered.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Record / edit dialog */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Visit" : "Record Visit"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">

            {/* Student autocomplete */}
            <div>
              <Label className="mb-1 block">Patient *</Label>
              <StudentPicker
                value={form.studentName}
                grValue={form.applicantId}
                classValue={form.classCode}
                onChange={(name, gr, cls) => setForm(f => ({ ...f, studentName: name, applicantId: gr, classCode: cls }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Register ID</Label>
                <Input className="mt-1" placeholder="Auto-filled or manual" value={form.applicantId} onChange={e => setF("applicantId", e.target.value)} />
              </div>
              <div>
                <Label>Class</Label>
                <Input className="mt-1" placeholder="e.g. 8A" value={form.classCode} onChange={e => setF("classCode", e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Visit Date *</Label>
              <Input required type="date" className="mt-1" value={form.visitDate} onChange={e => setF("visitDate", e.target.value)} />
            </div>

            <div>
              <Label>Complaint *</Label>
              <Textarea required className="mt-1 min-h-[70px]" placeholder="Describe symptoms / complaint" value={form.complaint} onChange={e => setF("complaint", e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Condition</Label>
                <Select value={form.conditionId || "__none__"} onValueChange={v => setF("conditionId", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {conditions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setF("status", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outpatient">Outpatient</SelectItem>
                    <SelectItem value="inpatient">Admit to Sick Bay</SelectItem>
                    <SelectItem value="referred">Referred</SelectItem>
                    <SelectItem value="discharged">Discharged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.status === "referred" && (
              <div>
                <Label>Referred To</Label>
                <Input className="mt-1" placeholder="Hospital or specialist name" value={form.referredTo} onChange={e => setF("referredTo", e.target.value)} />
              </div>
            )}

            <div>
              <Label>Diagnosis / Notes</Label>
              <Input className="mt-1" placeholder="Clinical diagnosis or notes" value={form.diagnosis} onChange={e => setF("diagnosis", e.target.value)} />
            </div>

            <div>
              <Label>Treatment Given</Label>
              <Input className="mt-1" placeholder="Procedure or treatment" value={form.treatmentGiven} onChange={e => setF("treatmentGiven", e.target.value)} />
            </div>

            {medicines.length > 0 && (
              <div>
                <Label className="mb-2 block">Medicines Dispensed</Label>
                <MedicinePicker value={form.medicinesGiven} medicines={medicines} onChange={v => setF("medicinesGiven", v)} />
              </div>
            )}
            {medicines.length === 0 && (
              <div>
                <Label>Medicines Given</Label>
                <Input className="mt-1" placeholder="Medicine names (add to catalog in Setup for picker)" value={form.medicinesGiven} onChange={e => setF("medicinesGiven", e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.studentName || !form.complaint || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Record Visit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refer dialog */}
      <ReferDialog
        visit={referVisit}
        open={!!referVisit}
        onClose={() => setReferVisit(null)}
        onConfirm={where => referVisit && statusMut.mutate({ id: referVisit.id, status: "referred", referredTo: where })}
        isPending={statusMut.isPending}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete visit record?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && delMut.mutate(deleteId)} disabled={delMut.isPending}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
