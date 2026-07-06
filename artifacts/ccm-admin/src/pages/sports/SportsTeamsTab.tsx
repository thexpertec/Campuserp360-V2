import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Trophy, Search, Users } from "lucide-react";
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

interface Category { id: string; name: string; }
interface Team {
  id: string; name: string;
  sportCategoryId: string | null; sportCategoryName: string | null;
  house: string | null; coachName: string | null; notes: string | null; active: boolean;
}

type F = { name: string; sportCategoryId: string; house: string; coachName: string; notes: string; };
const empty = (): F => ({ name: "", sportCategoryId: "", house: "", coachName: "", notes: "" });
const toForm = (t: Team): F => ({ name: t.name, sportCategoryId: t.sportCategoryId ?? "", house: t.house ?? "", coachName: t.coachName ?? "", notes: t.notes ?? "" });

const HOUSE_COLORS: Record<string, string> = {
  "Green":  "bg-green-100 text-green-700 border-green-200",
  "Red":    "bg-red-100 text-red-700 border-red-200",
  "Blue":   "bg-blue-100 text-blue-700 border-blue-200",
  "Yellow": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "White":  "bg-slate-100 text-slate-700 border-slate-200",
};

function houseColor(house: string | null) {
  if (!house) return "bg-slate-50 text-slate-500 border-slate-200";
  for (const [k, v] of Object.entries(HOUSE_COLORS)) {
    if (house.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export function SportsTeamsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterSport, setFilterSport] = useState("__all__");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState<F>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ["sports-teams"],
    queryFn: () => apiFetch("/api/admin/sports/teams"),
    staleTime: 15_000,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["sports-categories"],
    queryFn: () => apiFetch("/api/admin/sports/categories"),
    staleTime: 60_000,
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["sports-teams"] });
    qc.invalidateQueries({ queryKey: ["sports-teams-dash"] });
  };

  const saveMut = useMutation({
    mutationFn: (f: F) => {
      const body = { name: f.name.trim(), sportCategoryId: f.sportCategoryId || null, house: f.house.trim() || null, coachName: f.coachName.trim() || null, notes: f.notes.trim() || null };
      return editing
        ? apiFetch(`/api/admin/sports/teams/${editing.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiFetch("/api/admin/sports/teams", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { inv(); setOpen(false); toast({ title: editing ? "Team updated" : "Team created" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/sports/teams/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDeleteId(null); toast({ title: "Team deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function setF(k: keyof F, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const filtered = teams.filter(t => {
    if (filterSport !== "__all__" && t.sportCategoryId !== filterSport) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.name.toLowerCase().includes(q) || (t.house ?? "").toLowerCase().includes(q) || (t.coachName ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  // Unique sports present in teams list
  const presentSports = categories.filter(c => teams.some(t => t.sportCategoryId === c.id));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">All registered sports teams and squads.</p>
        <Button size="sm" onClick={() => { setEditing(null); setForm(empty()); setOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Team
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-40 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teams…" className="pl-8 h-9 text-sm" />
        </div>
        <Select value={filterSport} onValueChange={setFilterSport}>
          <SelectTrigger className="h-9 text-sm w-44"><SelectValue placeholder="All Sports" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Sports</SelectItem>
            {presentSports.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-28 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-xl">
          <Trophy className="h-10 w-10 mb-2 text-slate-200" />
          <p className="text-sm text-slate-400">{teams.length === 0 ? "No teams yet — click Add Team to get started." : "No teams match your search."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(t => (
            <div key={t.id} className="rounded-xl border border-border bg-white p-4 shadow-sm hover:shadow-md transition-shadow group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <Trophy className="h-4.5 w-4.5 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{t.name}</p>
                    {t.sportCategoryName
                      ? <span className="text-xs text-amber-600 font-medium">{t.sportCategoryName}</span>
                      : <span className="text-xs text-slate-300">No sport assigned</span>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(t); setForm(toForm(t)); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:bg-red-50" onClick={() => setDeleteId(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                {t.house && (
                  <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", houseColor(t.house))}>
                    {t.house}
                  </span>
                )}
                {t.coachName && (
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Users className="h-3 w-3" /> {t.coachName}
                  </span>
                )}
              </div>
              {t.notes && <p className="mt-2 text-xs text-slate-400 truncate">{t.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">{filtered.length} team{filtered.length !== 1 ? "s" : ""}</p>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Team" : "Add Team"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label>Team Name *</Label>
              <Input required className="mt-1" value={form.name} onChange={e => setF("name", e.target.value)} placeholder="e.g. Green House Cricket XI" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sport</Label>
                <Select value={form.sportCategoryId || "__none__"} onValueChange={v => setF("sportCategoryId", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select sport…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>House</Label>
                <Input className="mt-1" value={form.house} onChange={e => setF("house", e.target.value)} placeholder="e.g. Green House" />
              </div>
            </div>
            <div>
              <Label>Coach Name</Label>
              <Input className="mt-1" value={form.coachName} onChange={e => setF("coachName", e.target.value)} placeholder="Coach full name" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea className="mt-1 min-h-[60px]" value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.name || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Add Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete team?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && delMut.mutate(deleteId)} disabled={delMut.isPending}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
