import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { formatDate } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, CalendarRange, MapPin, Users, Clock } from "lucide-react";
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

interface EventRow {
  id: string; title: string; description: string | null;
  eventType: string; startDate: string; startTime: string | null;
  endDate: string | null; endTime: string | null;
  venue: string | null; organizer: string | null;
  targetAudience: string; status: string; isPublic: boolean; notes: string | null;
}

const TYPE_OPTS = [
  { value: "academic",  label: "Academic"  },
  { value: "cultural",  label: "Cultural"  },
  { value: "sports",    label: "Sports"    },
  { value: "ceremony",  label: "Ceremony"  },
  { value: "meeting",   label: "Meeting"   },
  { value: "holiday",   label: "Holiday"   },
  { value: "other",     label: "Other"     },
];
const STATUS_OPTS = [
  { value: "draft",      label: "Draft"     },
  { value: "published",  label: "Published" },
  { value: "cancelled",  label: "Cancelled" },
  { value: "completed",  label: "Completed" },
];
const AUDIENCE_OPTS = [
  { value: "all",     label: "Everyone" },
  { value: "cadets",  label: "Cadets"   },
  { value: "staff",   label: "Staff"    },
  { value: "parents", label: "Parents"  },
];

const STATUS_CFG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft:     { label: "Draft",     variant: "secondary"   },
  published: { label: "Published", variant: "default"     },
  cancelled: { label: "Cancelled", variant: "destructive" },
  completed: { label: "Completed", variant: "outline"     },
};
const TYPE_COLOR: Record<string, string> = {
  academic: "text-indigo-700 bg-indigo-50",
  cultural: "text-pink-700 bg-pink-50",
  sports:   "text-amber-700 bg-amber-50",
  ceremony: "text-violet-700 bg-violet-50",
  meeting:  "text-slate-700 bg-slate-100",
  holiday:  "text-green-700 bg-green-50",
  other:    "text-gray-700 bg-gray-100",
};

const fmtDate = (d: string) => formatDate(d + "T00:00:00");

type Form = {
  title: string; description: string; eventType: string;
  startDate: string; startTime: string; endDate: string; endTime: string;
  venue: string; organizer: string; targetAudience: string;
  status: string; isPublic: boolean; notes: string;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): Form => ({
  title: "", description: "", eventType: "other",
  startDate: todayStr(), startTime: "", endDate: "", endTime: "",
  venue: "", organizer: "", targetAudience: "all",
  status: "draft", isPublic: false, notes: "",
});

const toForm = (ev: EventRow): Form => ({
  title: ev.title, description: ev.description ?? "", eventType: ev.eventType,
  startDate: ev.startDate, startTime: ev.startTime ?? "", endDate: ev.endDate ?? "", endTime: ev.endTime ?? "",
  venue: ev.venue ?? "", organizer: ev.organizer ?? "", targetAudience: ev.targetAudience,
  status: ev.status, isPublic: ev.isPublic, notes: ev.notes ?? "",
});

const QUERY_KEY = ["events-list"];
const CONFIG_QK = ["events-config"];

interface EventConfig { venues: string[]; organizers: string[]; }

export function EventsListTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<EventRow | null>(null);

  const { data: events = [], isLoading } = useQuery<EventRow[]>({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch("/api/admin/events"),
  });

  const { data: cfg } = useQuery<EventConfig>({
    queryKey: CONFIG_QK,
    queryFn: () => apiFetch("/api/admin/events/config"),
  });
  const venueOpts = cfg?.venues ?? [];
  const orgOpts   = cfg?.organizers ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QUERY_KEY });
    qc.invalidateQueries({ queryKey: ["events-stats"] });
  };

  const saveMutation = useMutation({
    mutationFn: async (f: Form) => {
      const body = {
        ...f,
        description: f.description || undefined,
        startTime: f.startTime || undefined,
        endDate: f.endDate || undefined,
        endTime: f.endTime || undefined,
        venue: f.venue || undefined,
        organizer: f.organizer || undefined,
        notes: f.notes || undefined,
      };
      if (editing) {
        return apiFetch(`/api/admin/events/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      return apiFetch("/api/admin/events", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast({ title: editing ? "Event updated" : "Event created" });
      invalidate();
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/events/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Event deleted" }); invalidate(); setDeleteTarget(null); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() { setEditing(null); setForm(emptyForm()); setDialogOpen(true); }
  function openEdit(ev: EventRow) { setEditing(ev); setForm(toForm(ev)); setDialogOpen(true); }
  function set(k: keyof Form, v: string | boolean) { setForm(f => ({ ...f, [k]: v })); }

  const filtered = events.filter(ev => {
    const q = search.toLowerCase();
    const matchSearch = !q || ev.title.toLowerCase().includes(q) || (ev.venue ?? "").toLowerCase().includes(q) || (ev.organizer ?? "").toLowerCase().includes(q);
    const matchType = filterType === "__all__" || ev.eventType === filterType;
    const matchStatus = filterStatus === "__all__" || ev.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search events…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Types</SelectItem>
            {TYPE_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Statuses</SelectItem>
            {STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" /> Add Event
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>
      ) : !filtered.length ? (
        <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
          <CalendarRange className="h-8 w-8 opacity-30" />
          <p className="text-sm">{events.length ? "No events match your filters" : "No events yet — create one to get started"}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">Event</th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground hidden md:table-cell">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Venue / Organiser</th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(ev => {
                const sCfg = STATUS_CFG[ev.status] ?? STATUS_CFG.draft;
                const typeClass = TYPE_COLOR[ev.eventType] ?? TYPE_COLOR.other;
                const typeLabel = TYPE_OPTS.find(o => o.value === ev.eventType)?.label ?? ev.eventType;
                return (
                  <tr key={ev.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <span className={cn("mt-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold shrink-0", typeClass)}>{typeLabel}</span>
                        <div>
                          <p className="font-semibold text-foreground">{ev.title}</p>
                          <span className="text-xs text-muted-foreground">
                            <Users className="inline h-3 w-3 mr-0.5" />
                            {AUDIENCE_OPTS.find(a => a.value === ev.targetAudience)?.label ?? ev.targetAudience}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span>{fmtDate(ev.startDate)}{ev.startTime ? ` · ${ev.startTime}` : ""}</span>
                      </div>
                      {ev.endDate && ev.endDate !== ev.startDate && (
                        <div className="text-xs text-muted-foreground mt-0.5 pl-4">→ {fmtDate(ev.endDate)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {ev.venue && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />{ev.venue}
                        </div>
                      )}
                      {ev.organizer && (
                        <div className="text-xs text-muted-foreground mt-0.5">{ev.organizer}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={sCfg.variant}>{sCfg.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(ev)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(ev)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Event" : "Add Event"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Title *</Label>
              <Input placeholder="Event title" value={form.title} onChange={e => set("title", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={form.eventType} onValueChange={v => set("eventType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Audience</Label>
                <Select value={form.targetAudience} onValueChange={v => set("targetAudience", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AUDIENCE_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Start Date *</Label>
                <Input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Start Time</Label>
                <Input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>End Date</Label>
                <Input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>End Time</Label>
                <Input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Venue</Label>
                <Input placeholder="e.g. Assembly Hall" list="venue-list-dlg" value={form.venue} onChange={e => set("venue", e.target.value)} />
                <datalist id="venue-list-dlg">{venueOpts.map(v => <option key={v} value={v} />)}</datalist>
              </div>
              <div className="grid gap-2">
                <Label>Organiser</Label>
                <Input placeholder="e.g. Academic Dept" list="org-list-dlg" value={form.organizer} onChange={e => set("organizer", e.target.value)} />
                <datalist id="org-list-dlg">{orgOpts.map(o => <option key={o} value={o} />)}</datalist>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Visibility</Label>
                <Select value={form.isPublic ? "public" : "internal"} onValueChange={v => set("isPublic", v === "public")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal only</SelectItem>
                    <SelectItem value="public">Public (website)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea rows={2} placeholder="Brief description…" value={form.description} onChange={e => set("description", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Internal notes…" value={form.notes} onChange={e => set("notes", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button disabled={!form.title || !form.startDate || saveMutation.isPending} onClick={() => saveMutation.mutate(form)}>
              {saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event?</AlertDialogTitle>
            <AlertDialogDescription>
              "<strong>{deleteTarget?.title}</strong>" will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
