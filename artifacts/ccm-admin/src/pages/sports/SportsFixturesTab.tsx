import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Trophy, Search, CheckCircle2, X, Clock, MapPin } from "lucide-react";
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

interface Team    { id: string; name: string; sportCategoryId: string | null; sportCategoryName: string | null; }
interface Category{ id: string; name: string; }
interface Venue   { id: string; name: string; venueType: string; }
interface Fixture {
  id: string; homeTeam: string; awayTeam: string; sport: string | null;
  venueId: string | null; venueName: string | null;
  scheduledDate: string; scheduledTime: string | null;
  status: string;
  homeScore: number | null; awayScore: number | null;
  result: string | null; notes: string | null;
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  scheduled:  { label: "Scheduled",  color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200" },
  completed:  { label: "Completed",  color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  cancelled:  { label: "Cancelled",  color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200" },
  postponed:  { label: "Postponed",  color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
};

const todayStr = () => new Date().toISOString().slice(0, 10);

type F = {
  homeTeam: string; awayTeam: string; sport: string; venueId: string;
  scheduledDate: string; scheduledTime: string; status: string;
  homeScore: string; awayScore: string; result: string; notes: string;
};
const empty = (): F => ({ homeTeam: "", awayTeam: "", sport: "", venueId: "", scheduledDate: todayStr(), scheduledTime: "", status: "scheduled", homeScore: "", awayScore: "", result: "", notes: "" });
const toForm = (f: Fixture): F => ({ homeTeam: f.homeTeam, awayTeam: f.awayTeam, sport: f.sport ?? "", venueId: f.venueId ?? "", scheduledDate: f.scheduledDate, scheduledTime: f.scheduledTime ?? "", status: f.status, homeScore: f.homeScore != null ? String(f.homeScore) : "", awayScore: f.awayScore != null ? String(f.awayScore) : "", result: f.result ?? "", notes: f.notes ?? "" });

// ── Result entry dialog ─────────────────────────────────────────────────────────
function ResultDialog({ fixture, open, onClose, onConfirm, isPending }: {
  fixture: Fixture | null; open: boolean; onClose: () => void;
  onConfirm: (homeScore: number, awayScore: number, result: string) => void; isPending: boolean;
}) {
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [resultNote, setResultNote] = useState("");

  if (!fixture) return null;

  function handleConfirm() {
    const hs = parseInt(homeScore) || 0;
    const as_ = parseInt(awayScore) || 0;
    onConfirm(hs, as_, resultNote.trim());
  }

  const winner = homeScore !== "" && awayScore !== ""
    ? parseInt(homeScore) > parseInt(awayScore) ? fixture.homeTeam
      : parseInt(homeScore) < parseInt(awayScore) ? fixture.awayTeam
      : "Draw"
    : null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />Record Result</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="rounded-lg bg-slate-50 border border-border p-3 text-sm text-center">
            <p className="font-semibold text-slate-800">{fixture.homeTeam} <span className="text-slate-400 font-normal">vs</span> {fixture.awayTeam}</p>
            {fixture.sport && <p className="text-xs text-slate-400 mt-0.5">{fixture.sport} · {fixture.scheduledDate}</p>}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 text-center">
              <Label className="text-xs text-slate-500">{fixture.homeTeam}</Label>
              <Input
                type="number" min="0"
                className="mt-1 text-center text-2xl font-bold h-14 text-slate-800"
                placeholder="0"
                value={homeScore}
                onChange={e => setHomeScore(e.target.value)}
                autoFocus
              />
            </div>
            <span className="text-2xl font-bold text-slate-300 flex-shrink-0 mt-5">–</span>
            <div className="flex-1 text-center">
              <Label className="text-xs text-slate-500">{fixture.awayTeam}</Label>
              <Input
                type="number" min="0"
                className="mt-1 text-center text-2xl font-bold h-14 text-slate-800"
                placeholder="0"
                value={awayScore}
                onChange={e => setAwayScore(e.target.value)}
              />
            </div>
          </div>
          {winner && (
            <p className="text-center text-sm font-semibold text-green-700">
              {winner === "Draw" ? "🤝 Draw" : `🏆 ${winner} wins`}
            </p>
          )}
          <div>
            <Label>Result / Summary (optional)</Label>
            <Input className="mt-1" placeholder="e.g. Won by 3 wickets" value={resultNote} onChange={e => setResultNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-green-600 hover:bg-green-700" disabled={isPending} onClick={handleConfirm}>
            {isPending ? "Saving…" : "Save Result"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main tab ────────────────────────────────────────────────────────────────────
const STATUS_TABS = ["upcoming", "today", "completed", "all"] as const;
const STATUS_TAB_LABELS: Record<string, string> = { upcoming: "Upcoming", today: "Today", completed: "Completed", all: "All" };

export function SportsFixturesTab() {
  const qc = useQueryClient();
  const [statusTab, setStatusTab] = useState<string>("upcoming");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Fixture | null>(null);
  const [form, setForm] = useState<F>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [resultFixture, setResultFixture] = useState<Fixture | null>(null);
  const { toast } = useToast();

  const today = todayStr();

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["sports-fixtures"] });
    qc.invalidateQueries({ queryKey: ["sports-fixtures-dash"] });
  };

  // Build query params based on active tab
  const fixturesQuery = useQuery<Fixture[]>({
    queryKey: ["sports-fixtures", statusTab],
    queryFn: () => {
      const p = new URLSearchParams();
      if (statusTab === "upcoming") p.set("upcoming", "true");
      else if (statusTab === "today") p.set("date", today);
      else if (statusTab === "completed") p.set("status", "completed");
      return apiFetch(`/api/admin/sports/fixtures?${p}`);
    },
    staleTime: 10_000,
  });
  const fixtures = fixturesQuery.data ?? [];

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["sports-teams"],
    queryFn: () => apiFetch("/api/admin/sports/teams"),
    staleTime: 60_000,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["sports-categories"],
    queryFn: () => apiFetch("/api/admin/sports/categories"),
    staleTime: 60_000,
  });

  const { data: venues = [] } = useQuery<Venue[]>({
    queryKey: ["sports-venues"],
    queryFn: () => apiFetch("/api/admin/sports/venues"),
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: (f: F) => {
      const body = { homeTeam: f.homeTeam.trim(), awayTeam: f.awayTeam.trim(), sport: f.sport.trim() || null, venueId: f.venueId || null, scheduledDate: f.scheduledDate, scheduledTime: f.scheduledTime || null, status: f.status, homeScore: f.homeScore !== "" ? Number(f.homeScore) : null, awayScore: f.awayScore !== "" ? Number(f.awayScore) : null, result: f.result.trim() || null, notes: f.notes.trim() || null };
      return editing
        ? apiFetch(`/api/admin/sports/fixtures/${editing.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiFetch("/api/admin/sports/fixtures", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { inv(); setOpen(false); toast({ title: editing ? "Fixture updated" : "Fixture added" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const resultMut = useMutation({
    mutationFn: ({ id, homeScore, awayScore, result }: { id: string; homeScore: number; awayScore: number; result: string }) =>
      apiFetch(`/api/admin/sports/fixtures/${id}/result`, { method: "PATCH", body: JSON.stringify({ homeScore, awayScore, result }) }),
    onSuccess: () => { inv(); setResultFixture(null); toast({ title: "Result recorded" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/admin/sports/fixtures/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => { inv(); toast({ title: "Status updated" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/sports/fixtures/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDeleteId(null); toast({ title: "Fixture deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function setF(k: keyof F, v: string) { setForm(f => ({ ...f, [k]: v })); }

  // When a team is picked, auto-fill sport from that team's category
  function pickHomeTeam(teamName: string) {
    setF("homeTeam", teamName);
    if (!form.sport) {
      const t = teams.find(t => t.name === teamName);
      if (t?.sportCategoryName) setF("sport", t.sportCategoryName);
    }
  }

  const filtered = fixtures.filter(f => {
    if (!search) return true;
    const q = search.toLowerCase();
    return f.homeTeam.toLowerCase().includes(q) || f.awayTeam.toLowerCase().includes(q) || (f.sport ?? "").toLowerCase().includes(q) || (f.venueName ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">Schedule and track match fixtures.</p>
        <Button size="sm" onClick={() => { setEditing(null); setForm(empty()); setOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Fixture
        </Button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-0 border-b border-border">
        {STATUS_TABS.map(s => (
          <button key={s} onClick={() => setStatusTab(s)}
            className={cn("px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize",
              statusTab === s ? "border-amber-500 text-amber-600" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {STATUS_TAB_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teams, sport…" className="pl-8 h-9 text-sm" />
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Match","Sport","Date / Time","Venue","Score","Status",""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fixturesQuery.isLoading ? (
                [...Array(4)].map((_, i) => <tr key={i}><td colSpan={7} className="px-3 py-3"><div className="h-4 bg-slate-100 rounded-full animate-pulse w-2/3" /></td></tr>)
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-14 text-center">
                  <Trophy className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                  <p className="text-sm text-slate-400">{fixtures.length === 0 ? "No fixtures — click Add Fixture to schedule the first match." : "No fixtures match your search."}</p>
                </td></tr>
              ) : filtered.map(f => {
                const s = STATUS_CFG[f.status] ?? STATUS_CFG.scheduled;
                const isActive = f.status === "scheduled" || f.status === "postponed";
                const hasScore = f.homeScore != null && f.awayScore != null;
                return (
                  <tr key={f.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 min-w-[200px]">
                      <p className="font-medium text-slate-800">{f.homeTeam}</p>
                      <p className="text-xs text-slate-400">vs {f.awayTeam}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      {f.sport
                        ? <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">{f.sport}</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <p className="text-sm text-slate-700">{f.scheduledDate}</p>
                      {f.scheduledTime && <p className="text-xs text-slate-400 flex items-center gap-0.5"><Clock className="h-3 w-3" />{f.scheduledTime}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      {f.venueName
                        ? <span className="text-xs text-slate-600 flex items-center gap-1"><MapPin className="h-3 w-3 text-slate-400" />{f.venueName}</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-sm">
                      {hasScore
                        ? <span className="font-bold text-slate-800">{f.homeScore} – {f.awayScore}</span>
                        : <span className="text-slate-300">—</span>}
                      {f.result && <p className="text-xs text-slate-400 truncate max-w-[120px]">{f.result}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", s.color, s.bg, s.border)}>{s.label}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {isActive && (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-green-600 border-green-200 hover:bg-green-50"
                            onClick={() => setResultFixture(f)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />Result
                          </Button>
                        )}
                        {(f.status === "scheduled") && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-orange-600 border-orange-200 hover:bg-orange-50"
                              onClick={() => statusMut.mutate({ id: f.id, status: "postponed" })}>
                              <Clock className="h-3 w-3 mr-1" />Postpone
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-500 border-red-200 hover:bg-red-50"
                              onClick={() => statusMut.mutate({ id: f.id, status: "cancelled" })}>
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(f); setForm(toForm(f)); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:bg-red-50" onClick={() => setDeleteId(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
            {filtered.length} fixture{filtered.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Fixture" : "Schedule Fixture"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Home Team *</Label>
                {teams.length > 0 ? (
                  <Select value={form.homeTeam || "__none__"} onValueChange={v => pickHomeTeam(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select team…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Select —</SelectItem>
                      {teams.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input required className="mt-1" value={form.homeTeam} onChange={e => setF("homeTeam", e.target.value)} placeholder="Home team" />
                )}
              </div>
              <div>
                <Label>Away Team *</Label>
                {teams.length > 0 ? (
                  <Select value={form.awayTeam || "__none__"} onValueChange={v => setF("awayTeam", v === "__none__" ? "" : v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select team…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Select —</SelectItem>
                      {teams.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input required className="mt-1" value={form.awayTeam} onChange={e => setF("awayTeam", e.target.value)} placeholder="Away team" />
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sport</Label>
                {categories.length > 0 ? (
                  <Select value={form.sport || "__none__"} onValueChange={v => setF("sport", v === "__none__" ? "" : v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select sport…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input className="mt-1" value={form.sport} onChange={e => setF("sport", e.target.value)} placeholder="e.g. Cricket" />
                )}
              </div>
              <div>
                <Label>Venue</Label>
                <Select value={form.venueId || "__none__"} onValueChange={v => setF("venueId", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select venue…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {venues.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input required type="date" className="mt-1" value={form.scheduledDate} onChange={e => setF("scheduledDate", e.target.value)} />
              </div>
              <div>
                <Label>Time</Label>
                <Input type="time" className="mt-1" value={form.scheduledTime} onChange={e => setF("scheduledTime", e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setF("status", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="postponed">Postponed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(form.status === "completed") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Home Score</Label>
                  <Input type="number" min="0" className="mt-1" value={form.homeScore} onChange={e => setF("homeScore", e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label>Away Score</Label>
                  <Input type="number" min="0" className="mt-1" value={form.awayScore} onChange={e => setF("awayScore", e.target.value)} placeholder="0" />
                </div>
                <div className="col-span-2">
                  <Label>Result Summary</Label>
                  <Input className="mt-1" placeholder="e.g. Won by 3 wickets" value={form.result} onChange={e => setF("result", e.target.value)} />
                </div>
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Input className="mt-1" placeholder="Optional" value={form.notes} onChange={e => setF("notes", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.homeTeam || !form.awayTeam || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Schedule Fixture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result dialog */}
      <ResultDialog
        fixture={resultFixture}
        open={!!resultFixture}
        onClose={() => setResultFixture(null)}
        onConfirm={(hs, as_, res) => resultFixture && resultMut.mutate({ id: resultFixture.id, homeScore: hs, awayScore: as_, result: res })}
        isPending={resultMut.isPending}
      />

      {/* Delete */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete fixture?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && delMut.mutate(deleteId)} disabled={delMut.isPending}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
