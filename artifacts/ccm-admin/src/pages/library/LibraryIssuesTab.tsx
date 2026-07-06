import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, BookOpen, Search, RotateCcw, AlertTriangle } from "lucide-react";
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
interface Book { id: string; title: string; author: string; availableCopies: number; totalCopies: number; shelfLocation: string | null; categoryName: string | null; }
interface Issue {
  id: string; bookId: string; bookTitle: string | null; bookAuthor: string | null; shelfLocation: string | null;
  studentId: string | null; studentName: string | null; applicantId: string | null;
  issuedDate: string; dueDate: string; returnedDate: string | null;
  fineAmount: number; status: string; notes: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  issued:   { label: "Issued",   color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200" },
  overdue:  { label: "Overdue",  color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200" },
  returned: { label: "Returned", color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  lost:     { label: "Lost",     color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
};

const STATUS_TABS = ["all", "issued", "overdue", "returned", "lost"] as const;

const todayStr = () => new Date().toISOString().slice(0, 10);
const dueDateDefault = () => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); };

type F = {
  bookId: string; studentName: string; applicantId: string;
  issuedDate: string; dueDate: string; returnedDate: string;
  fineAmount: string; status: string; notes: string;
};
const empty = (): F => ({ bookId: "", studentName: "", applicantId: "", issuedDate: todayStr(), dueDate: dueDateDefault(), returnedDate: "", fineAmount: "0", status: "issued", notes: "" });
const toForm = (i: Issue): F => ({ bookId: i.bookId, studentName: i.studentName ?? "", applicantId: i.applicantId ?? "", issuedDate: i.issuedDate, dueDate: i.dueDate, returnedDate: i.returnedDate ?? "", fineAmount: String(i.fineAmount ?? 0), status: i.status, notes: i.notes ?? "" });

// ── Student autocomplete ────────────────────────────────────────────────────────
function StudentPicker({ value, grValue, onChange }: {
  value: string; grValue: string; onChange: (name: string, gr: string) => void;
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

  const results = data?.students ?? [];

  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setShowDrop(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(s: Student) {
    const name = s.fullName;
    setQ(name); setSelected(true); setShowDrop(false);
    onChange(name, s.applicantId);
  }

  function handleChange(val: string) {
    setQ(val); setSelected(false);
    onChange(val, grValue);
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
              <div className="h-7 w-7 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0 text-amber-600 font-semibold text-xs">{s.fullName[0]}</div>
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
          No match — you can still type manually.
        </div>
      )}
    </div>
  );
}

// ── Book search picker ─────────────────────────────────────────────────────────
function BookPicker({ value, books, onChange }: { value: string; books: Book[]; onChange: (id: string) => void; }) {
  const [search, setSearch] = useState("");
  const selected = books.find(b => b.id === value);

  const filtered = books.filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return b.title.toLowerCase().includes(q) || (b.author ?? "").toLowerCase().includes(q) || (b.shelfLocation ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search books…" className="pl-8" />
      </div>
      <div className="max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border">
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-sm text-slate-400">No books found</p>
        ) : filtered.map(b => {
          const isSelected = b.id === value;
          const avail = b.availableCopies ?? 0;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onChange(b.id)}
              disabled={avail === 0 && !isSelected}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                isSelected ? "bg-amber-50 border-l-2 border-amber-400" : "hover:bg-slate-50",
                avail === 0 && !isSelected ? "opacity-40" : "",
              )}
            >
              <BookOpen className={cn("h-4 w-4 flex-shrink-0", isSelected ? "text-amber-500" : "text-slate-300")} />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium truncate", isSelected ? "text-amber-800" : "text-slate-800")}>{b.title}</p>
                {b.author && <p className="text-xs text-slate-400 truncate">{b.author}{b.shelfLocation ? ` · ${b.shelfLocation}` : ""}</p>}
              </div>
              <span className={cn("text-xs flex-shrink-0 font-semibold px-1.5 py-0.5 rounded-full", avail === 0 ? "bg-red-100 text-red-600" : avail <= 1 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700")}>
                {avail}/{b.totalCopies}
              </span>
            </button>
          );
        })}
      </div>
      {selected && (
        <p className="text-xs text-amber-700 font-medium">Selected: {selected.title}</p>
      )}
    </div>
  );
}

// ── Return confirmation dialog ─────────────────────────────────────────────────
function ReturnDialog({ issue, open, onClose, onConfirm, isPending }: {
  issue: Issue | null; open: boolean; onClose: () => void;
  onConfirm: (fine: number) => void; isPending: boolean;
}) {
  const [fine, setFine] = useState("0");
  if (!issue) return null;

  const dueDate = new Date(issue.dueDate + "T00:00:00");
  const today = new Date();
  const daysLate = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000));
  const suggestedFine = daysLate * 5; // PKR 5/day

  useEffect(() => {
    if (open) setFine(String(suggestedFine));
  }, [open, suggestedFine]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-green-600" />Return Book</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="rounded-lg bg-slate-50 border border-border p-3 text-sm">
            <p className="font-medium text-slate-800">{issue.bookTitle}</p>
            <p className="text-slate-500 text-xs mt-0.5">{issue.studentName} · Due {issue.dueDate}</p>
            {daysLate > 0 && (
              <p className="text-red-600 text-xs mt-1 font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {daysLate} day{daysLate !== 1 ? "s" : ""} overdue
              </p>
            )}
          </div>
          <div>
            <Label>Fine Amount (PKR)</Label>
            <Input type="number" min="0" className="mt-1" value={fine} onChange={e => setFine(e.target.value)} />
            {daysLate > 0 && <p className="text-xs text-slate-400 mt-1">Suggested: PKR {suggestedFine} (PKR 5/day × {daysLate} days)</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={() => onConfirm(Number(fine) || 0)} disabled={isPending}>
            {isPending ? "Processing…" : "Confirm Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function LibraryIssuesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<string>("issued");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Issue | null>(null);
  const [form, setForm] = useState<F>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [returnIssue, setReturnIssue] = useState<Issue | null>(null);
  const { toast } = useToast();

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["library-issues"] });
    qc.invalidateQueries({ queryKey: ["library-issues-dash"] });
    qc.invalidateQueries({ queryKey: ["library-books"] });
    qc.invalidateQueries({ queryKey: ["library-books-dash"] });
  };

  const { data: issues = [], isLoading } = useQuery<Issue[]>({
    queryKey: ["library-issues"],
    queryFn: () => apiFetch("/api/admin/library/issues"),
    staleTime: 10_000,
  });

  const { data: books = [] } = useQuery<Book[]>({
    queryKey: ["library-books"],
    queryFn: () => apiFetch("/api/admin/library/books"),
    staleTime: 15_000,
  });

  const saveMut = useMutation({
    mutationFn: (f: F) => {
      const body = { bookId: f.bookId, studentName: f.studentName.trim() || null, applicantId: f.applicantId.trim() || null, issuedDate: f.issuedDate, dueDate: f.dueDate, returnedDate: f.returnedDate || null, fineAmount: Number(f.fineAmount) || 0, status: f.status, notes: f.notes.trim() || null };
      return editing
        ? apiFetch(`/api/admin/library/issues/${editing.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiFetch("/api/admin/library/issues", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { inv(); setOpen(false); toast({ title: editing ? "Record updated" : "Book issued successfully" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const returnMut = useMutation({
    mutationFn: ({ id, fine }: { id: string; fine: number }) =>
      apiFetch(`/api/admin/library/issues/${id}/return`, { method: "PATCH", body: JSON.stringify({ fineAmount: fine }) }),
    onSuccess: () => { inv(); setReturnIssue(null); toast({ title: "Book returned successfully" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/library/issues/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDeleteId(null); toast({ title: "Record deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function setF(k: keyof F, v: string) { setForm(f => ({ ...f, [k]: v })); }

  // Tab counts
  const counts: Record<string, number> = { all: issues.length };
  STATUS_TABS.slice(1).forEach(s => { counts[s] = issues.filter(i => i.status === s).length; });

  const filtered = issues.filter(i => {
    if (statusTab !== "all" && i.status !== statusTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (i.studentName ?? "").toLowerCase().includes(q)
        || (i.applicantId ?? "").toLowerCase().includes(q)
        || (i.bookTitle ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  const overdueCount = counts.overdue ?? 0;

  return (
    <div className="space-y-4">
      {/* Overdue banner */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">
            <strong>{overdueCount} book{overdueCount !== 1 ? "s" : ""}</strong> overdue and not yet returned.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">Track book issues and returns.</p>
        <Button size="sm" onClick={() => { setEditing(null); setForm(empty()); setOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Issue Book
        </Button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-0 border-b border-border">
        {STATUS_TABS.map(s => (
          <button
            key={s}
            onClick={() => setStatusTab(s)}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize flex items-center gap-1.5",
              statusTab === s ? "border-amber-500 text-amber-600" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s}
            {counts[s] > 0 && (
              <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                s === "overdue" ? "bg-red-100 text-red-700" :
                statusTab === s ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
              )}>{counts[s]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search student, book…" className="pl-8 h-9 text-sm" />
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Student","Book","Issued","Due","Status","Fine",""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                [...Array(4)].map((_, i) => <tr key={i}><td colSpan={7} className="px-3 py-3"><div className="h-4 bg-slate-100 rounded-full animate-pulse w-2/3" /></td></tr>)
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-14 text-center">
                  <BookOpen className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                  <p className="text-sm text-slate-400">{issues.length === 0 ? "No issues yet — click Issue Book to get started." : "No records match your filters."}</p>
                </td></tr>
              ) : filtered.map(i => {
                const s = STATUS_CONFIG[i.status] ?? STATUS_CONFIG.issued;
                return (
                  <tr key={i.id} className={cn("hover:bg-muted/30 transition-colors", i.status === "overdue" ? "bg-red-50/30" : "")}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-800">{i.studentName || "—"}</p>
                      {i.applicantId && <p className="text-xs text-slate-400 font-mono">{i.applicantId}</p>}
                    </td>
                    <td className="px-3 py-2.5 max-w-[200px]">
                      <p className="text-slate-800 font-medium truncate">{i.bookTitle ?? "—"}</p>
                      {i.bookAuthor && <p className="text-xs text-slate-400 truncate">{i.bookAuthor}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{i.issuedDate}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={cn("text-xs", i.status === "overdue" ? "text-red-600 font-semibold" : "text-slate-500")}>{i.dueDate}</span>
                      {i.returnedDate && <p className="text-xs text-green-600 font-medium">Returned {i.returnedDate}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", s.color, s.bg, s.border)}>{s.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-slate-600">
                      {i.fineAmount > 0 ? <span className="text-red-600 font-medium">PKR {i.fineAmount}</span> : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {(i.status === "issued" || i.status === "overdue") && (
                          <Button
                            size="sm" variant="outline"
                            className="h-7 px-2 text-xs text-green-600 border-green-200 hover:bg-green-50"
                            onClick={() => setReturnIssue(i)}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />Return
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(i); setForm(toForm(i)); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(i.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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

      {/* Issue / Edit dialog */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Issue Record" : "Issue Book"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">

            {/* Book picker */}
            <div>
              <Label className="mb-2 block">Book *</Label>
              <BookPicker value={form.bookId} books={books} onChange={id => setF("bookId", id)} />
            </div>

            {/* Student */}
            <div>
              <Label>Student *</Label>
              <div className="mt-1">
                <StudentPicker
                  value={form.studentName}
                  grValue={form.applicantId}
                  onChange={(name, gr) => setForm(f => ({ ...f, studentName: name, applicantId: gr }))}
                />
              </div>
            </div>
            <div>
              <Label>Register ID</Label>
              <Input className="mt-1" placeholder="Auto-filled or enter manually" value={form.applicantId} onChange={e => setF("applicantId", e.target.value)} />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Issued Date *</Label>
                <Input required type="date" className="mt-1" value={form.issuedDate} onChange={e => setF("issuedDate", e.target.value)} />
              </div>
              <div>
                <Label>Due Date *</Label>
                <Input required type="date" className="mt-1" value={form.dueDate} onChange={e => setF("dueDate", e.target.value)} />
              </div>
              <div>
                <Label>Returned Date</Label>
                <Input type="date" className="mt-1" value={form.returnedDate} onChange={e => { setF("returnedDate", e.target.value); if (e.target.value) setF("status", "returned"); }} />
              </div>
              <div>
                <Label>Fine (PKR)</Label>
                <Input type="number" min="0" className="mt-1" value={form.fineAmount} onChange={e => setF("fineAmount", e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setF("status", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="issued">Issued</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
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
            <Button disabled={!form.bookId || !form.studentName || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Issue Book"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick return dialog */}
      <ReturnDialog
        issue={returnIssue}
        open={!!returnIssue}
        onClose={() => setReturnIssue(null)}
        onConfirm={(fine) => returnIssue && returnMut.mutate({ id: returnIssue.id, fine })}
        isPending={returnMut.isPending}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete record?</AlertDialogTitle><AlertDialogDescription>This cannot be undone. If the book is still out, the copy count will be adjusted.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && delMut.mutate(deleteId)} disabled={delMut.isPending}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
