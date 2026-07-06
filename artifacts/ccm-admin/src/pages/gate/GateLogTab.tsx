import { useState, useRef, useEffect } from "react";
import { formatDate } from "@/lib/locale";
import { formatPhone } from "@/lib/format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, CalendarDays, LogOut, Car } from "lucide-react";
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

interface Student { id: string; applicantId: string; fullName: string; classCode: string | null; }
interface GateLog {
  id: string; personName: string; personType: string; purpose: string | null;
  vehicleNo: string | null; phone: string | null;
  inTime: string; outTime: string | null;
  gatePassNo: string | null; notes: string | null;
}

const todayStr  = () => new Date().toISOString().slice(0, 10);
const nowDT     = () => { const n = new Date(); return `${n.toISOString().slice(0, 10)} ${n.toTimeString().slice(0, 5)}`; };
const addDays   = (iso: string, n: number) => new Date(new Date(iso + "T00:00:00").getTime() + n * 86_400_000).toISOString().slice(0, 10);
const fmtDate   = (iso: string) => formatDate(iso + "T00:00:00");
const timeOnly  = (dt: string) => dt.length > 5 ? dt.slice(11, 16) || dt : dt;

const TYPE_CFG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  visitor:  { label: "Visitor",  color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",   dot: "bg-blue-400" },
  student:  { label: "Student",  color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200",  dot: "bg-green-500" },
  staff:    { label: "Staff",    color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", dot: "bg-purple-500" },
  delivery: { label: "Delivery", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-500" },
  vendor:   { label: "Vendor",   color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200",  dot: "bg-amber-500" },
};

const TYPE_TABS = ["all", "visitor", "student", "staff", "delivery", "vendor"] as const;

type F = { personName: string; personType: string; purpose: string; vehicleNo: string; phone: string; inTime: string; outTime: string; gatePassNo: string; notes: string; };
const emptyForm = (date: string): F => ({ personName: "", personType: "visitor", purpose: "", vehicleNo: "", phone: "", inTime: `${date} ${new Date().toTimeString().slice(0,5)}`, outTime: "", gatePassNo: "", notes: "" });
const toForm = (r: GateLog): F => ({ personName: r.personName, personType: r.personType, purpose: r.purpose ?? "", vehicleNo: r.vehicleNo ?? "", phone: r.phone ?? "", inTime: r.inTime, outTime: r.outTime ?? "", gatePassNo: r.gatePassNo ?? "", notes: r.notes ?? "" });

// ── Student autocomplete ───────────────────────────────────────────────────────
function StudentPicker({ value, onChange }: { value: string; onChange: (name: string, phone?: string) => void }) {
  const [q, setQ] = useState(value);
  const [show, setShow] = useState(false);
  const [chosen, setChosen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useQuery<{ students: Student[] }>({
    queryKey: ["student-search-gate", q],
    queryFn: () => apiFetch(`/api/admin/students?q=${encodeURIComponent(q)}&pageSize=8`),
    enabled: q.length >= 2 && !chosen,
    staleTime: 10_000,
  });
  const results = data?.students ?? [];
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShow(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  function pick(s: Student) {
    const name = `${s.fullName} (${s.applicantId})`;
    setQ(name); setChosen(true); setShow(false); onChange(name);
  }
  function handleChange(val: string) { setQ(val); setChosen(false); onChange(val); if (val.length >= 2) setShow(true); }
  return (
    <div className="relative" ref={ref}>
      <Input value={q} onChange={e => handleChange(e.target.value)} onFocus={() => { if (q.length >= 2 && !chosen) setShow(true); }} placeholder="Type name or Applicant ID…" />
      {show && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-white shadow-lg overflow-hidden">
          {results.map(s => (
            <button key={s.id} type="button" onMouseDown={() => pick(s)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left border-b border-border last:border-0">
              <div className="h-6 w-6 rounded-full bg-green-50 flex items-center justify-center text-green-600 font-bold text-xs flex-shrink-0">{s.fullName[0]}</div>
              <span className="text-sm font-medium">{s.fullName}</span>
              <span className="text-xs text-slate-400 ml-auto">{s.applicantId}{s.classCode ? ` · ${s.classCode}` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GateLogTab() {
  const qc = useQueryClient();
  const [viewDate, setViewDate] = useState(todayStr());
  const [typeTab, setTypeTab] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GateLog | null>(null);
  const [form, setForm] = useState<F>(emptyForm(todayStr()));
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const isToday = viewDate === todayStr();

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["gate-log"] });
    qc.invalidateQueries({ queryKey: ["gate-stats"] });
  };

  const logsQuery = useQuery<GateLog[]>({
    queryKey: ["gate-log", viewDate, typeTab],
    queryFn: () => {
      const p = new URLSearchParams({ date: viewDate });
      if (typeTab !== "all") p.set("personType", typeTab);
      return apiFetch(`/api/admin/gate/log?${p}`);
    },
    staleTime: 8_000,
    refetchInterval: isToday ? 30_000 : false,
  });
  const logs = logsQuery.data ?? [];

  const saveMut = useMutation({
    mutationFn: (f: F) => {
      const body = { personName: f.personName.trim(), personType: f.personType, purpose: f.purpose.trim() || null, vehicleNo: f.vehicleNo.trim() || null, phone: f.phone.trim() || null, inTime: f.inTime, outTime: f.outTime.trim() || null, gatePassNo: f.gatePassNo.trim() || null, notes: f.notes.trim() || null };
      return editing
        ? apiFetch(`/api/admin/gate/log/${editing.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiFetch("/api/admin/gate/log", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { inv(); setOpen(false); toast({ title: editing ? "Entry updated" : "Entry logged" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const checkoutMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/gate/log/${id}/checkout`, { method: "PATCH", body: "{}" }),
    onSuccess: () => { inv(); toast({ title: "Checked out" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/gate/log/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDeleteId(null); toast({ title: "Entry deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function setF(k: keyof F, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const onCampus = logs.filter(l => !l.outTime).length;

  const filtered = logs.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return l.personName.toLowerCase().includes(q) || (l.purpose ?? "").toLowerCase().includes(q) || (l.phone ?? "").toLowerCase().includes(q) || (l.vehicleNo ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* On-campus banner */}
      {isToday && onCampus > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
          </span>
          <p className="text-sm text-blue-800 font-medium">
            <strong>{onCampus}</strong> {onCampus === 1 ? "person" : "people"} currently on campus (not yet checked out)
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">Daily entry and exit log for all campus visitors.</p>
        <Button size="sm" onClick={() => { setEditing(null); setForm(emptyForm(viewDate)); setOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Log Entry
        </Button>
      </div>

      {/* Person-type tabs + date nav */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex overflow-x-auto">
          {TYPE_TABS.map(t => (
            <button key={t} onClick={() => setTypeTab(t)}
              className={cn("px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap capitalize",
                typeTab === t ? "border-blue-500 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t === "all" ? "All Types" : TYPE_CFG[t]?.label ?? t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 pb-1 flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewDate(d => addDays(d, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="flex items-center gap-1 text-xs font-medium text-slate-700">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            <span>{isToday ? "Today" : fmtDate(viewDate)}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewDate(d => addDays(d, 1))} disabled={viewDate >= todayStr()}><ChevronRight className="h-4 w-4" /></Button>
          {!isToday && <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setViewDate(todayStr())}>Today</Button>}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, purpose, vehicle…" className="pl-8 h-9 text-sm" />
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Person","Type","Purpose","In","Out","Vehicle",""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logsQuery.isLoading ? (
                [...Array(4)].map((_, i) => <tr key={i}><td colSpan={7} className="px-3 py-3"><div className="h-4 bg-slate-100 rounded-full animate-pulse w-2/3" /></td></tr>)
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-14 text-center">
                  <CalendarDays className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                  <p className="text-sm text-slate-400">{logs.length === 0 ? `No entries on ${isToday ? "today" : fmtDate(viewDate)}.` : "No entries match your search."}</p>
                </td></tr>
              ) : filtered.map(l => {
                const tc = TYPE_CFG[l.personType] ?? TYPE_CFG.visitor;
                const onSite = !l.outTime;
                return (
                  <tr key={l.id} className={cn("hover:bg-muted/30 transition-colors", onSite ? "bg-blue-50/30" : "")}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {onSite && <span className="h-1.5 w-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
                        <div>
                          <p className="font-medium text-slate-800">{l.personName}</p>
                          {l.phone && <p className="text-xs text-slate-400">{l.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", tc.color, tc.bg, tc.border)}>{tc.label}</span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[180px]">
                      <p className="text-sm text-slate-600 truncate">{l.purpose || "—"}</p>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs text-slate-700">{timeOnly(l.inTime)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs">
                      {l.outTime
                        ? <span className="text-green-700">{timeOnly(l.outTime)}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {l.vehicleNo
                        ? <span className="text-xs text-slate-600 flex items-center gap-1"><Car className="h-3 w-3 text-slate-400" />{l.vehicleNo}</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {onSite && isToday && (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-green-600 border-green-200 hover:bg-green-50"
                            onClick={() => checkoutMut.mutate(l.id)} disabled={checkoutMut.isPending}>
                            <LogOut className="h-3 w-3 mr-1" />Check Out
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(l); setForm(toForm(l)); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:bg-red-50" onClick={() => setDeleteId(l.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
            {filtered.length} entr{filtered.length !== 1 ? "ies" : "y"} · {logs.filter(l => !l.outTime).length} on campus
          </div>
        )}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Entry" : "Log Entry"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label className="mb-1 block">Person Name *</Label>
              {form.personType === "student" ? (
                <StudentPicker value={form.personName} onChange={name => setF("personName", name)} />
              ) : (
                <Input required value={form.personName} onChange={e => setF("personName", e.target.value)} placeholder="Full name" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.personType} onValueChange={v => setF("personType", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visitor">Visitor</SelectItem>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Phone</Label>
                <Input className="mt-1" value={form.phone} onChange={e => setF("phone", formatPhone(e.target.value))} placeholder="0300-0000000" maxLength={12} />
              </div>
            </div>
            <div>
              <Label>Purpose</Label>
              <Input className="mt-1" value={form.purpose} onChange={e => setF("purpose", e.target.value)} placeholder="Reason for visit" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>In Time *</Label>
                <Input required className="mt-1" value={form.inTime} onChange={e => setF("inTime", e.target.value)} placeholder="YYYY-MM-DD HH:MM" />
              </div>
              <div>
                <Label>Out Time</Label>
                <Input className="mt-1" value={form.outTime} onChange={e => setF("outTime", e.target.value)} placeholder="YYYY-MM-DD HH:MM or blank" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vehicle No.</Label>
                <Input className="mt-1" value={form.vehicleNo} onChange={e => setF("vehicleNo", e.target.value)} placeholder="LEA-1234" />
              </div>
              <div>
                <Label>Gate Pass No.</Label>
                <Input className="mt-1" value={form.gatePassNo} onChange={e => setF("gatePassNo", e.target.value)} placeholder="GP-001" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.personName || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Log Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete entry?</AlertDialogTitle><AlertDialogDescription>This will remove the gate log entry permanently.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && delMut.mutate(deleteId)} disabled={delMut.isPending}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
