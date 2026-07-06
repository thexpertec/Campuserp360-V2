import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Building2, Search, LogOut, CheckCircle2 } from "lucide-react";
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
interface Room { id: string; blockId: string; blockName: string | null; roomNumber: string; capacity: number; status: string; occupiedCount: number; }
interface Allocation {
  id: string; studentName: string; applicantId: string | null; classCode: string | null;
  roomId: string; fromDate: string; toDate: string | null; status: string; notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 border-green-200",
  vacated: "bg-slate-100 text-slate-600 border-slate-200",
  transferred: "bg-blue-100 text-blue-700 border-blue-200",
  suspended: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_TABS = ["all", "active", "vacated", "transferred", "suspended"] as const;

const today = () => new Date().toISOString().slice(0, 10);
type F = { studentName: string; applicantId: string; classCode: string; roomId: string; fromDate: string; toDate: string; status: string; notes: string };
const empty = (): F => ({ studentName: "", applicantId: "", classCode: "", roomId: "", fromDate: today(), toDate: "", status: "active", notes: "" });
const toForm = (r: Allocation): F => ({ studentName: r.studentName ?? "", applicantId: r.applicantId ?? "", classCode: r.classCode ?? "", roomId: r.roomId ?? "", fromDate: r.fromDate ?? today(), toDate: r.toDate ?? "", status: r.status ?? "active", notes: r.notes ?? "" });

// ── Student autocomplete ────────────────────────────────────────────────────────
function StudentPicker({ value, grValue, classValue, onChange }: {
  value: string; grValue: string; classValue: string;
  onChange: (name: string, gr: string, cls: string) => void;
}) {
  const [q, setQ] = useState(value);
  const [showDrop, setShowDrop] = useState(false);
  const [selected, setSelected] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery<{ students: Student[] }>({
    queryKey: ["student-search", q],
    queryFn: () => apiFetch(`/api/admin/students?q=${encodeURIComponent(q)}&pageSize=10`),
    enabled: q.length >= 2 && !selected,
    staleTime: 10_000,
  });

  const results: Student[] = (data as any)?.items ?? (data as any)?.students ?? [];

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setShowDrop(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(s: Student) {
    const name = s.fullName;
    setQ(name);
    setSelected(true);
    setShowDrop(false);
    onChange(name, s.applicantId, s.classCode ?? "");
  }

  function handleChange(val: string) {
    setQ(val);
    setSelected(false);
    onChange(val, grValue, classValue);
    if (val.length >= 2) setShowDrop(true);
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input
          value={q}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => { if (q.length >= 2 && !selected) setShowDrop(true); }}
          placeholder="Type name or Applicant ID…"
          className="pl-8"
        />
      </div>
      {showDrop && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-white shadow-lg overflow-hidden">
          {results.map(s => (
            <button
              key={s.id}
              type="button"
              onMouseDown={() => pick(s)}
              className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 text-left border-b border-border last:border-0 transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0 text-indigo-600 font-semibold text-sm">
                {s.fullName[0]}
              </div>
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
          No students found — you can still enter manually below.
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function HostelAllocationsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<string>("active");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Allocation | null>(null);
  const [form, setForm] = useState<F>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [vacateId, setVacateId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: allAllocations = [], isLoading } = useQuery<Allocation[]>({
    queryKey: ["hostel-allocations"],
    queryFn: () => apiFetch("/api/admin/hostel/allocations"),
    staleTime: 15_000,
  });

  const { data: rooms = [], isLoading: rLoading } = useQuery<Room[]>({
    queryKey: ["hostel-rooms"],
    queryFn: () => apiFetch("/api/admin/hostel/rooms"),
    staleTime: 15_000,
  });

  const inv = () => qc.invalidateQueries({ queryKey: ["hostel-allocations"] });

  const saveMut = useMutation({
    mutationFn: (data: F) => editing
      ? apiFetch(`/api/admin/hostel/allocations/${editing.id}`, { method: "PUT", body: JSON.stringify({ ...data, toDate: data.toDate || null, notes: data.notes || null }) })
      : apiFetch("/api/admin/hostel/allocations", { method: "POST", body: JSON.stringify({ ...data, toDate: data.toDate || null, notes: data.notes || null }) }),
    onSuccess: () => {
      inv();
      qc.invalidateQueries({ queryKey: ["hostel-rooms"] }); // refresh occupancy
      setOpen(false);
      toast({ title: editing ? "Allocation updated" : "Room allocated" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/hostel/allocations/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); qc.invalidateQueries({ queryKey: ["hostel-rooms"] }); setDeleteId(null); toast({ title: "Removed" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const vacateMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/hostel/allocations/${id}`, { method: "PUT", body: JSON.stringify({ status: "vacated", toDate: today() }) }),
    onSuccess: () => { inv(); qc.invalidateQueries({ queryKey: ["hostel-rooms"] }); setVacateId(null); toast({ title: "Cadet vacated" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function openAdd() { setEditing(null); setForm(empty()); setOpen(true); }
  function openEdit(r: Allocation) { setEditing(r); setForm(toForm(r)); setOpen(true); }
  function setF(k: keyof F, v: string) { setForm(f => ({ ...f, [k]: v })); }

  // Counts per tab
  const counts: Record<string, number> = { all: allAllocations.length };
  STATUS_TABS.slice(1).forEach(s => { counts[s] = allAllocations.filter(a => a.status === s).length; });

  const filtered = allAllocations.filter(a => {
    if (statusTab !== "all" && a.status !== statusTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (a.studentName ?? "").toLowerCase().includes(q)
        || (a.applicantId ?? "").toLowerCase().includes(q)
        || (a.classCode ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  // Room display helper: "Block A · Room 101 · 2/4 beds"
  function roomLabel(roomId: string) {
    const r = rooms.find(x => x.id === roomId);
    if (!r) return roomId;
    const avail = Math.max(0, r.capacity - (r.occupiedCount ?? 0));
    return `${r.blockName ? r.blockName + " · " : ""}Room ${r.roomNumber} · ${r.occupiedCount}/${r.capacity} beds${avail === 0 ? " (FULL)" : ""}`;
  }

  // Sorted rooms: available first, then by number
  const sortedRooms = [...rooms].sort((a, b) => {
    const aAvail = a.capacity - (a.occupiedCount ?? 0);
    const bAvail = b.capacity - (b.occupiedCount ?? 0);
    if (aAvail > 0 && bAvail <= 0) return -1;
    if (aAvail <= 0 && bAvail > 0) return 1;
    return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">Current room assignments for all cadets.</p>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" /> Allocate Room
        </Button>
      </div>

      {/* Empty rooms warning */}
      {!rLoading && rooms.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/></svg>
          No dormitory rooms found. Go to the <strong className="mx-1">Dormitories</strong> tab first to add rooms before allocating beds.
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-0 border-b border-border">
        {STATUS_TABS.map(s => (
          <button
            key={s}
            onClick={() => setStatusTab(s)}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize flex items-center gap-1.5",
              statusTab === s
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s}
            {counts[s] > 0 && (
              <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-bold", statusTab === s ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500")}>
                {counts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, GR, class…" className="pl-8 h-9 text-sm" />
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Student","Register ID","Class","Room","From","To","Status",""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-3 py-3"><div className="h-4 bg-slate-100 rounded-full animate-pulse w-2/3" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-14 text-center">
                  <Building2 className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                  <p className="text-sm text-slate-400">
                    {allAllocations.length === 0 ? "No allocations yet — click Allocate Room to get started." : "No records match your filters."}
                  </p>
                </td></tr>
              ) : filtered.map(a => {
                const room = rooms.find(r => r.id === a.roomId);
                return (
                  <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-slate-800">{a.studentName || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{a.applicantId || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500">{a.classCode || "—"}</td>
                    <td className="px-3 py-2.5">
                      {room ? (
                        <div>
                          <span className="text-slate-800 font-medium">Room {room.roomNumber}</span>
                          {room.blockName && <span className="text-xs text-slate-400 ml-1.5">{room.blockName}</span>}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{a.fromDate ?? "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{a.toDate ?? <span className="text-slate-300">Present</span>}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", STATUS_COLORS[a.status] ?? "bg-slate-100 text-slate-600")}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {a.status === "active" && (
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            onClick={() => setVacateId(a.id)}
                            title="Vacate cadet"
                          >
                            <LogOut className="h-3.5 w-3.5 mr-1" />Vacate
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteId(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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

      {/* Allocate / Edit dialog */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Allocation" : "Allocate Room"}</DialogTitle>
            {!editing && <p className="text-sm text-slate-500 mt-0.5">Search for a cadet or fill in manually.</p>}
          </DialogHeader>
          <div className="space-y-4 pt-1">

            {/* Student search */}
            <div>
              <Label>Student *</Label>
              <div className="mt-1">
                <StudentPicker
                  value={form.studentName}
                  grValue={form.applicantId}
                  classValue={form.classCode}
                  onChange={(name, gr, cls) => setForm(f => ({ ...f, studentName: name, applicantId: gr, classCode: cls }))}
                />
              </div>
            </div>

            {/* GR + Class (auto-filled or manual) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Register ID</Label>
<Input className="mt-1" placeholder="2024-001" value={form.applicantId} onChange={e => setF("applicantId", e.target.value)} />
              </div>
              <div>
                <Label>Class</Label>
                <Input className="mt-1" placeholder="e.g. VIII-A" value={form.classCode} onChange={e => setF("classCode", e.target.value)} />
              </div>
            </div>

            {/* Smart room picker */}
            <div>
              <Label>Room *</Label>
              <Select value={form.roomId || "__none__"} onValueChange={v => setF("roomId", v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select room…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Select room —</SelectItem>
                  {sortedRooms.map(r => {
                    const avail = Math.max(0, r.capacity - (r.occupiedCount ?? 0));
                    const label = `${r.blockName ? r.blockName + " · " : ""}Room ${r.roomNumber} · ${r.occupiedCount}/${r.capacity} beds`;
                    return (
                      <SelectItem
                        key={r.id}
                        value={r.id}
                        disabled={avail === 0 && form.roomId !== r.id}
                      >
                        <span className={avail === 0 ? "text-slate-400" : ""}>
                          {label}{avail === 0 ? " — FULL" : avail === 1 ? " · 1 bed left" : ` · ${avail} beds`}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {form.roomId && form.roomId !== "__none__" && (() => {
                const r = rooms.find(x => x.id === form.roomId);
                if (!r) return null;
                const avail = r.capacity - (r.occupiedCount ?? 0);
                return (
                  <p className={cn("text-xs mt-1", avail <= 0 ? "text-red-500" : avail <= 1 ? "text-amber-600" : "text-green-600")}>
                    {avail <= 0 ? "This room is full" : `${avail} bed${avail !== 1 ? "s" : ""} available`}
                  </p>
                );
              })()}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>From Date *</Label>
                <Input required type="date" className="mt-1" value={form.fromDate} onChange={e => setF("fromDate", e.target.value)} />
              </div>
              <div>
                <Label>To Date</Label>
                <Input type="date" className="mt-1" value={form.toDate} onChange={e => setF("toDate", e.target.value)} />
              </div>
            </div>

            {/* Status */}
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setF("status", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="vacated">Vacated</SelectItem>
                  <SelectItem value="transferred">Transferred</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Notes</Label>
              <Input className="mt-1" placeholder="Optional" value={form.notes} onChange={e => setF("notes", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.studentName || !form.roomId || !form.fromDate || saveMut.isPending}
              onClick={() => saveMut.mutate(form)}
            >
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Allocate Room"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick vacate confirm */}
      <AlertDialog open={!!vacateId} onOpenChange={v => !v && setVacateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-amber-500" /> Vacate this cadet?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The allocation will be marked as vacated with today's date. The room will be freed up immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 hover:bg-amber-600"
              onClick={() => vacateId && vacateMut.mutate(vacateId)}
              disabled={vacateMut.isPending}
            >
              {vacateMut.isPending ? "Saving…" : "Vacate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete allocation?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the room assignment record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && delMut.mutate(deleteId)} disabled={delMut.isPending}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
