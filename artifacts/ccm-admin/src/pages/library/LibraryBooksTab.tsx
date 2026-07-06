import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, BookOpen, Search, BookMarked } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/DataTable";
import type { ColDef } from "@/components/DataTable/types";

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

interface Category  { id: string; name: string; }
interface Publisher { id: string; name: string; city: string | null; }
interface Book {
  id: string; title: string; author: string; isbn: string | null;
  categoryId: string | null; categoryName: string | null;
  publisherId: string | null; publisherName: string | null;
  edition: string | null; yearPublished: string | null;
  totalCopies: number; availableCopies: number;
  shelfLocation: string | null; description: string | null; active: boolean;
}
interface Student { id: string; applicantId: string; fullName: string; classCode: string | null; }

type F = {
  title: string; author: string; isbn: string; categoryId: string; publisherId: string;
  edition: string; yearPublished: string; totalCopies: string; shelfLocation: string; description: string;
};
const empty = (): F => ({ title: "", author: "", isbn: "", categoryId: "", publisherId: "", edition: "", yearPublished: "", totalCopies: "1", shelfLocation: "", description: "" });
const toForm = (b: Book): F => ({ title: b.title, author: b.author ?? "", isbn: b.isbn ?? "", categoryId: b.categoryId ?? "", publisherId: b.publisherId ?? "", edition: b.edition ?? "", yearPublished: b.yearPublished ?? "", totalCopies: String(b.totalCopies ?? 1), shelfLocation: b.shelfLocation ?? "", description: b.description ?? "" });

const todayStr = () => new Date().toISOString().slice(0, 10);
const dueDateDefault = () => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); };

function availColor(avail: number, total: number) {
  if (avail === 0) return "text-red-600 font-semibold";
  const pct = avail / total;
  if (pct <= 0.25) return "text-amber-600 font-semibold";
  return "text-green-600 font-semibold";
}

// ─── Inline student picker for quick-issue dialog ────────────────────────────

function StudentPicker({ value, grValue, onChange }: {
  value: string; grValue: string; onChange: (name: string, gr: string) => void;
}) {
  const [q, setQ] = useState(value);
  const [showDrop, setShowDrop] = useState(false);
  const [selected, setSelected] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery<{ items: Student[] }>({
    queryKey: ["student-search-lib", q],
    queryFn: () => apiFetch(`/api/admin/students?q=${encodeURIComponent(q)}&pageSize=10`),
    enabled: q.length >= 2 && !selected,
    staleTime: 10_000,
  });

  const results = data?.items ?? [];

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
        <Input value={q} onChange={e => handleChange(e.target.value)}
          onFocus={() => { if (q.length >= 2 && !selected) setShowDrop(true); }}
          placeholder="Type name or Applicant ID…" className="pl-8" />
      </div>
      {showDrop && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-white shadow-lg overflow-hidden">
          {results.map(s => (
            <button key={s.id} type="button" onMouseDown={() => pick(s)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left border-b border-border last:border-0">
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

// ─── Columns ─────────────────────────────────────────────────────────────────

const COLUMNS: ColDef<Book>[] = [
  {
    key: "title",
    label: "Title",
    sortable: true,
    defaultWidth: 220,
    render: (b) => (
      <p className="font-medium text-slate-800 truncate max-w-xs">{b.title}</p>
    ),
    getText: (b) => b.title,
  },
  {
    key: "author",
    label: "Author",
    sortable: true,
    defaultWidth: 160,
    render: (b) => (
      <span className="text-xs text-slate-500 truncate block max-w-[150px]">
        {b.author
          ? <>{b.author}{b.edition ? ` · ${b.edition} ed.` : ""}</>
          : <span className="text-slate-300">—</span>}
      </span>
    ),
    getText: (b) => b.author ?? "",
  },
  {
    key: "categoryName",
    label: "Category",
    sortable: true,
    defaultWidth: 130,
    render: (b) =>
      b.categoryName ? (
        <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
          {b.categoryName}
        </span>
      ) : <span className="text-slate-300 text-xs">—</span>,
    getText: (b) => b.categoryName ?? "",
  },
  {
    key: "isbn",
    label: "ISBN",
    sortable: true,
    defaultWidth: 140,
    render: (b) => <span className="font-mono text-xs text-slate-500">{b.isbn ?? "—"}</span>,
    getText: (b) => b.isbn ?? "",
  },
  {
    key: "totalCopies",
    label: "Copies",
    sortable: true,
    defaultWidth: 80,
    render: (b) => <span className="text-xs tabular-nums text-slate-600">{b.totalCopies ?? 0}</span>,
    getText: (b) => String(b.totalCopies ?? 0).padStart(6, "0"),
  },
  {
    key: "availableCopies",
    label: "Available",
    sortable: true,
    defaultWidth: 100,
    render: (b) => {
      const avail = b.availableCopies ?? 0;
      const total = b.totalCopies ?? 1;
      return (
        <span className={cn("text-xs tabular-nums font-semibold", availColor(avail, total))}>
          {avail}
        </span>
      );
    },
    getText: (b) => String(b.availableCopies ?? 0).padStart(6, "0"),
  },
  {
    key: "shelfLocation",
    label: "Shelf",
    sortable: true,
    defaultWidth: 100,
    defaultVisible: false,
    render: (b) => <span className="text-xs text-slate-500 font-mono">{b.shelfLocation ?? "—"}</span>,
    getText: (b) => b.shelfLocation ?? "",
  },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function LibraryBooksTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("__all__");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const [form, setForm] = useState<F>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [quickIssueBook, setQuickIssueBook] = useState<Book | null>(null);
  const [issueForm, setIssueForm] = useState({ studentName: "", applicantId: "", issuedDate: todayStr(), dueDate: dueDateDefault() });
  const { toast } = useToast();

  const { data: books = [], isLoading } = useQuery<Book[]>({
    queryKey: ["library-books"],
    queryFn: () => apiFetch("/api/admin/library/books"),
    staleTime: 15_000,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["library-categories"],
    queryFn: () => apiFetch("/api/admin/library/categories"),
    staleTime: 60_000,
  });

  const { data: publishers = [] } = useQuery<Publisher[]>({
    queryKey: ["library-publishers"],
    queryFn: () => apiFetch("/api/admin/library/publishers"),
    staleTime: 60_000,
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["library-books"] });
    qc.invalidateQueries({ queryKey: ["library-books-dash"] });
  };

  const saveMut = useMutation({
    mutationFn: (f: F) => {
      const body = {
        title: f.title.trim(),
        author: f.author.trim() || "",
        isbn: f.isbn.trim() || null,
        categoryId: f.categoryId || null,
        publisherId: f.publisherId || null,
        edition: f.edition.trim() || null,
        yearPublished: f.yearPublished.trim() || null,
        totalCopies: Math.max(1, Number(f.totalCopies) || 1),
        shelfLocation: f.shelfLocation.trim() || null,
        description: f.description.trim() || null,
      };
      return editing
        ? apiFetch(`/api/admin/library/books/${editing.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiFetch("/api/admin/library/books", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { inv(); setOpen(false); toast({ title: editing ? "Book updated" : "Book added to catalog" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/library/books/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDeleteId(null); toast({ title: "Book removed" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const issueMut = useMutation({
    mutationFn: (body: object) => apiFetch("/api/admin/library/issues", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["library-books"] });
      qc.invalidateQueries({ queryKey: ["library-issues"] });
      setQuickIssueBook(null);
      setIssueForm({ studentName: "", applicantId: "", issuedDate: todayStr(), dueDate: dueDateDefault() });
      toast({ title: "Book issued successfully" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Issue failed", description: e.message }),
  });

  function setF(k: keyof F, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const filtered = books.filter(b => {
    if (filterCat !== "__all__" && b.categoryId !== filterCat) return false;
    if (search) {
      const q = search.toLowerCase();
      return b.title.toLowerCase().includes(q)
        || (b.author ?? "").toLowerCase().includes(q)
        || (b.isbn ?? "").toLowerCase().includes(q)
        || (b.shelfLocation ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <DataTable
        tableId="library-books"
        title="Library Books"
        subtitle="All books in the library catalog."
        columns={COLUMNS}
        data={filtered}
        isLoading={isLoading}
        pageSize={50}
        clientPaginate
        exportFilename="library-books"
        emptyIcon={<BookOpen className="h-10 w-10 text-slate-200" />}
        emptyTitle="No books found"
        emptyDescription={books.length === 0 ? "No books yet — click Add Book to catalog your first title." : "No books match your search."}
        action={
          <Button size="sm" onClick={() => { setEditing(null); setForm(empty()); setOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Book
          </Button>
        }
        filters={
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, author, ISBN…" className="pl-8 h-9 text-sm" />
            </div>
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="h-9 text-sm w-44"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Categories</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
        rowActions={(b) => (
          <div className="flex items-center gap-1 justify-end">
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:bg-amber-50"
              title="Issue book"
              disabled={(b.availableCopies ?? 0) === 0}
              onClick={() => {
                setQuickIssueBook(b);
                setIssueForm({ studentName: "", applicantId: "", issuedDate: todayStr(), dueDate: dueDateDefault() });
              }}
            >
              <BookMarked className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => { setEditing(b); setForm(toForm(b)); setOpen(true); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50"
              onClick={() => setDeleteId(b.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      />

      {/* Quick Issue dialog */}
      <Dialog open={!!quickIssueBook} onOpenChange={v => !v && setQuickIssueBook(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookMarked className="h-4 w-4 text-amber-600" /> Issue Book
            </DialogTitle>
          </DialogHeader>
          {quickIssueBook && (
            <div className="space-y-4 pt-1">
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm">
                <p className="font-semibold text-amber-900">{quickIssueBook.title}</p>
                {quickIssueBook.author && <p className="text-amber-700 text-xs mt-0.5">{quickIssueBook.author}</p>}
                <p className="text-amber-600 text-xs mt-1">{quickIssueBook.availableCopies} of {quickIssueBook.totalCopies} copies available</p>
              </div>
              <div>
                <Label>Student <span className="text-red-500">*</span></Label>
                <div className="mt-1">
                  <StudentPicker
                    value={issueForm.studentName}
                    grValue={issueForm.applicantId}
                    onChange={(name, gr) => setIssueForm(f => ({ ...f, studentName: name, applicantId: gr }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Issue Date</Label>
                  <Input type="date" className="mt-1" value={issueForm.issuedDate} onChange={e => setIssueForm(f => ({ ...f, issuedDate: e.target.value }))} />
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input type="date" className="mt-1" value={issueForm.dueDate} onChange={e => setIssueForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickIssueBook(null)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              disabled={!issueForm.studentName.trim() || issueMut.isPending}
              onClick={() => quickIssueBook && issueMut.mutate({
                bookId: quickIssueBook.id,
                studentName: issueForm.studentName.trim() || null,
                applicantId: issueForm.applicantId.trim() || null,
                issuedDate: issueForm.issuedDate,
                dueDate: issueForm.dueDate,
                status: "issued",
                fineAmount: 0,
              })}
            >
              {issueMut.isPending ? "Issuing…" : "Issue Book"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Book" : "Add Book"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label>Title *</Label>
              <Input required className="mt-1" value={form.title} onChange={e => setF("title", e.target.value)} placeholder="e.g. Principles of Physics" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Author</Label>
                <Input className="mt-1" value={form.author} onChange={e => setF("author", e.target.value)} placeholder="Author name(s)" />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.categoryId || "__none__"} onValueChange={v => setF("categoryId", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Publisher</Label>
                <Select value={form.publisherId || "__none__"} onValueChange={v => setF("publisherId", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {publishers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ISBN</Label>
                <Input className="mt-1" value={form.isbn} onChange={e => setF("isbn", e.target.value)} placeholder="ISBN-13" />
              </div>
              <div>
                <Label>Total Copies</Label>
                <Input type="number" min="1" className="mt-1" value={form.totalCopies} onChange={e => setF("totalCopies", e.target.value)} />
              </div>
              <div>
                <Label>Edition</Label>
                <Input className="mt-1" value={form.edition} onChange={e => setF("edition", e.target.value)} placeholder="e.g. 3rd" />
              </div>
              <div>
                <Label>Year Published</Label>
                <Input className="mt-1" value={form.yearPublished} onChange={e => setF("yearPublished", e.target.value)} placeholder="e.g. 2022" maxLength={4} />
              </div>
              <div className="col-span-2">
                <Label>Shelf Location</Label>
                <Input className="mt-1" value={form.shelfLocation} onChange={e => setF("shelfLocation", e.target.value)} placeholder="e.g. A3-S2" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.title || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Add Book"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete book?</AlertDialogTitle><AlertDialogDescription>The book record will be permanently removed.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && delMut.mutate(deleteId)} disabled={delMut.isPending}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
