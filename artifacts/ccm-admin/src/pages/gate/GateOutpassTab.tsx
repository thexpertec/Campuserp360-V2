import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, CheckCircle2, X, AlertTriangle, ShieldCheck } from "lucide-react";
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
interface Outpass {
  id: string; studentName: string; applicantId: string | null; classCode: string | null;
  purpose: string; destination: string | null; validFrom: string; validUntil: string;
  approvedBy: string | null; passNumber: string | null; status: string; notes: string | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active:    { label: "Active",     color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  used:      { label: "Used",       color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200" },
  expired:   { label: "Expired",    color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200" },
  cancelled: { label: "Cancelled",  color: "text-slate-600",  bg: "bg-slate-50",  border: "border-slate-200" },
};

const STATUS_TABS = ["active", "expiring", "used", "all"] as const;
const STATUS_TAB_LABELS: Record<string, string> = { active: "Active", expiring: "Expiring Today", used: "Used / Expired", all: "All" };

type F = { studentName: string; applicantId: string; classCode: string; purpose: string; destination: string; validFrom: string; validUntil: string; approvedBy: string; passNumber: string; status: string; notes: string; };
const empty = (): F => ({ studentName: "", applicantId: "", classCode: "", purpose: "", destination: "", validFrom: todayStr(), validUntil: todayStr(), approvedBy: "", passNumber: "", status: "active", notes: "" });
const toForm = (o: Outpass): F => ({ studentName: o.studentName, applicantId: o.applicantId ?? "", classCode: o.classCode ?? "", purpose: o.purpose, destination: o.destination ?? "", validFrom: o.validFrom, validUntil: o.validUntil, approvedBy: o.approvedBy ?? "", passNumber: o.passNumber ?? "", status: o.status, notes: o.notes ?? "" });

// ── Student autocomplete ───────────────────────────────────────────────────────
function StudentPicker({ value, grValue, classValue, onChange }: {
  value: string; grValue: string; classValue: string;
  onChange: (name: string, gr: string, cls: string) => void;
}) {
  const [q, setQ] = useState(value);
  const [show, setShow] = useState(false);
  const [chosen, setChosen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery<{ students: Student[] }>({
    queryKey: ["student-search-op", q],
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
    const name = s.fullName;
    setQ(name); setChosen(true); setShow(false);
    onChange(name, s.applicantId, s.classCode ?? "");
  }
  function handleChange(val: string) {
    setQ(val); setChosen(false); onChange(val, grValue, classValue);
    if (val.length >= 2) setShow(true);
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input value={q} onChange={e => handleChange(e.target.value)} onFocus={() => { if (q.length >= 2 && !chosen) setShow(true); }} placeholder="Type cadet name or Applicant ID…" className="pl-8" />
      </div>
      {show && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-white shadow-lg overflow-hidden">
          {results.map(s => (
            <button key={s.id} type="button" onMouseDown={() => pick(s)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left border-b border-border last:border-0">
              <div className="h-7 w-7 rounded-full bg-red-50 flex items-center justify-center text-red-500 font-bold text-xs flex-shrink-0">{s.fullName[0]}</div>
              <div>
                <p className="text-sm font-medium">{s.fullName}</p>
                <p className="text-xs text-slate-400">{s.applicantId}{s.classCode ? ` · Class ${s.classCode}` : ""}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function isExpiredPass(o: Outpass) { return o.status === "active" && o.validUntil < todayStr(); }
function isExpiringToday(o: Outpass) { return o.status === "active" && o.validUntil === todayStr(); }

export function GateOutpassTab() {
  const qc = useQueryClient();
  const [statusTab, setStatusTab] = useState<string>("active");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Outpass | null>(null);
  const [form, setForm] = useState<F>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["gate-outpass"] });
    qc.invalidateQueries({ queryKey: ["gate-stats"] });
  };

  const query = useQuery<Outpass[]>({
    queryKey: ["gate-outpass", statusTab],
    queryFn: () => {
      const p = new URLSearchParams();
      if (statusTab === "active")   p.set("status", "active");
      if (statusTab === "expiring") p.set("status", "expiring");
      if (statusTab === "used")     p.set("status", "used");
      return apiFetch(`/api/admin/gate/outpass?${p}`);
    },
    staleTime: 10_000,
  });
  const passes = query.data ?? [];

  const saveMut = useMutation({
    mutationFn: (f: F) => {
      const body = { studentName: f.studentName.trim(), applicantId: f.applicantId.trim() || null, classCode: f.classCode.trim() || null, purpose: f.purpose.trim(), destination: f.destination.trim() || null, validFrom: f.validFrom, validUntil: f.validUntil, approvedBy: f.approvedBy.trim() || null, passNumber: f.passNumber.trim() || null, status: f.status, notes: f.notes.trim() || null };
      return editing
        ? apiFetch(`/api/admin/gate/outpass/${editing.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiFetch("/api/admin/gate/outpass", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { inv(); setOpen(false); toast({ title: editing ? "Out-pass updated" : "Out-pass issued" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/admin/gate/outpass/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => { inv(); toast({ title: "Pass updated" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/gate/outpass/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDeleteId(null); toast({ title: "Out-pass deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function setF(k: keyof F, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const filtered = passes.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return o.studentName.toLowerCase().includes(q) || (o.applicantId ?? "").toLowerCase().includes(q) || (o.purpose ?? "").toLowerCase().includes(q) || (o.destination ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Expiring alert */}
      {statusTab === "active" && passes.some(isExpiringToday) && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            {passes.filter(isExpiringToday).length} out-pass{passes.filter(isExpiringToday).length !== 1 ? "es" : ""} expiring today.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">Cadet leave passes for going off campus.</p>
        <Button size="sm" onClick={() => { setEditing(null); setForm(empty()); setOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Issue Out-Pass
        </Button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-0 border-b border-border">
        {STATUS_TABS.map(s => (
          <button key={s} onClick={() => setStatusTab(s)}
            className={cn("px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
              statusTab === s ? "border-blue-500 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {STATUS_TAB_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cadet, purpose…" className="pl-8 h-9 text-sm" />
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Cadet","Register ID","Purpose","Destination","Valid From","Valid Until","Status",""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {query.isLoading ? (
                [...Array(4)].map((_, i) => <tr key={i}><td colSpan={8} className="px-3 py-3"><div className="h-4 bg-slate-100 rounded-full animate-pulse w-2/3" /></td></tr>)
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-14 text-center">
                  <ShieldCheck className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                  <p className="text-sm text-slate-400">{passes.length === 0 ? "No out-passes yet — click Issue Out-Pass to create one." : "No passes match your search."}</p>
                </td></tr>
              ) : filtered.map(o => {
                const expired = isExpiredPass(o);
                const expiringToday = isExpiringToday(o);
                const statusKey = expired ? "expired" : o.status;
                const sc = STATUS_CFG[statusKey] ?? STATUS_CFG.active;
                return (
                  <tr key={o.id} className={cn("hover:bg-muted/30 transition-colors", expired ? "opacity-70" : "", expiringToday ? "bg-amber-50/40" : "")}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-800">{o.studentName}</p>
                      {o.classCode && <p className="text-xs text-slate-400">Class {o.classCode}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-500">{o.applicantId || "—"}</td>
                    <td className="px-3 py-2.5 max-w-[150px]">
                      <p className="text-sm text-slate-700 truncate">{o.purpose}</p>
                    </td>
                    <td className="px-3 py-2.5 max-w-[130px]">
                      <p className="text-sm text-slate-600 truncate">{o.destination || "—"}</p>
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-600 whitespace-nowrap">{o.validFrom}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <p className={cn("text-sm", expired ? "text-red-600 font-semibold" : expiringToday ? "text-amber-700 font-semibold" : "text-slate-600")}>{o.validUntil}</p>
                      {expiringToday && <p className="text-[10px] text-amber-600">Expires today</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", sc.color, sc.bg, sc.border)}>
                        {expired ? "Expired" : sc.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {o.status === "active" && !expired && (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                            onClick={() => statusMut.mutate({ id: o.id, status: "used" })}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />Used
                          </Button>
                        )}
                        {(o.status === "active") && (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-500 border-red-200 hover:bg-red-50"
                            onClick={() => statusMut.mutate({ id: o.id, status: "cancelled" })}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(o); setForm(toForm(o)); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:bg-red-50" onClick={() => setDeleteId(o.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
            {filtered.length} pass{filtered.length !== 1 ? "es" : ""}
          </div>
        )}
      </div>

      {/* Issue / Edit dialog */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Out-Pass" : "Issue Out-Pass"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label className="mb-1 block">Cadet Name *</Label>
              <StudentPicker
                value={form.studentName} grValue={form.applicantId} classValue={form.classCode}
                onChange={(name, gr, cls) => setForm(f => ({ ...f, studentName: name, applicantId: gr, classCode: cls }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Register ID</Label>
                <Input className="mt-1" value={form.applicantId} onChange={e => setF("applicantId", e.target.value)} placeholder="Auto-filled" />
              </div>
              <div>
                <Label>Class</Label>
                <Input className="mt-1" value={form.classCode} onChange={e => setF("classCode", e.target.value)} placeholder="e.g. 10A" />
              </div>
              <div>
                <Label>Pass No.</Label>
                <Input className="mt-1" value={form.passNumber} onChange={e => setF("passNumber", e.target.value)} placeholder="OP-001" />
              </div>
            </div>
            <div>
              <Label>Purpose *</Label>
              <Input required className="mt-1" value={form.purpose} onChange={e => setF("purpose", e.target.value)} placeholder="Reason for leave" />
            </div>
            <div>
              <Label>Destination</Label>
              <Input className="mt-1" value={form.destination} onChange={e => setF("destination", e.target.value)} placeholder="Where the cadet is going" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valid From *</Label>
                <Input required type="date" className="mt-1" value={form.validFrom} onChange={e => setF("validFrom", e.target.value)} />
              </div>
              <div>
                <Label>Valid Until *</Label>
                <Input required type="date" className="mt-1" value={form.validUntil} onChange={e => setF("validUntil", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Approved By</Label>
                <Input className="mt-1" value={form.approvedBy} onChange={e => setF("approvedBy", e.target.value)} placeholder="Officer / Commandant" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setF("status", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="used">Used</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.studentName || !form.purpose || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Issue Out-Pass"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete out-pass?</AlertDialogTitle><AlertDialogDescription>This will remove the out-pass record permanently.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && delMut.mutate(deleteId)} disabled={delMut.isPending}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
