import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useListAdminTimetablePeriods, getListAdminTimetablePeriodsQueryKey,
  useDeleteAdminTimetablePeriod,
} from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Clock, Wand2, Plus, Trash2, Pencil, Loader2,
  ChevronDown, ChevronUp, CheckCircle2, Coffee, Layers,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Types ──────────────────────────────────────────────────────────────────────
type PeriodType = "lecture" | "break" | "assembly" | "other";
interface Period {
  id?: string; name: string; startTime: string; endTime: string;
  periodType: PeriodType; sortOrder: number; description?: string; active?: boolean;
}

// ── API helper ────────────────────────────────────────────────────────────────
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

// ── Time helpers ────────────────────────────────────────────────────────────
function addMin(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function fmtTime(t: string) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}
function durationMin(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

// ── Generate periods from config ───────────────────────────────────────────
interface GenConfig {
  schoolStart: string;
  assemblyDuration: number;
  periodDuration: number;
  numPeriods: number;
  breaks: { afterPeriod: number; duration: number; name: string }[];
}
function generatePeriods(cfg: GenConfig): Omit<Period, "id">[] {
  const periods: Omit<Period, "id">[] = [];
  let current = cfg.schoolStart;
  let sortOrder = 0;

  if (cfg.assemblyDuration > 0) {
    const end = addMin(current, cfg.assemblyDuration);
    periods.push({ name: "Assembly", startTime: current, endTime: end, periodType: "assembly", sortOrder: sortOrder++ });
    current = end;
  }

  for (let i = 1; i <= cfg.numPeriods; i++) {
    const end = addMin(current, cfg.periodDuration);
    periods.push({ name: `Period ${i}`, startTime: current, endTime: end, periodType: "lecture", sortOrder: sortOrder++ });
    current = end;
    const brk = cfg.breaks.find(b => b.afterPeriod === i);
    if (brk && brk.duration > 0) {
      const bEnd = addMin(current, brk.duration);
      periods.push({ name: brk.name || "Break", startTime: current, endTime: bEnd, periodType: "break", sortOrder: sortOrder++ });
      current = bEnd;
    }
  }
  return periods;
}

// ── Type badge ────────────────────────────────────────────────────────────────
const TYPE_STYLE: Record<PeriodType, string> = {
  lecture:  "bg-blue-100 text-blue-700 border-blue-200",
  break:    "bg-orange-100 text-orange-700 border-orange-200",
  assembly: "bg-violet-100 text-violet-700 border-violet-200",
  other:    "bg-slate-100 text-slate-600 border-slate-200",
};
const TYPE_ICON: Record<PeriodType, React.ElementType> = {
  lecture: Layers, break: Coffee, assembly: CheckCircle2, other: Clock,
};

// ── Inline edit row ───────────────────────────────────────────────────────────
function PeriodRow({ period, onSave, onDelete }: {
  period: Period;
  onSave: (p: Period) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Period>(period);
  const TypeIcon = TYPE_ICON[period.periodType as PeriodType] ?? Clock;

  if (editing) {
    return (
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Start</Label>
            <Input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End</Label>
            <Input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <select value={form.periodType} onChange={e => setForm(f => ({ ...f, periodType: e.target.value as PeriodType }))}
              className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
              <option value="lecture">Lecture</option>
              <option value="break">Break</option>
              <option value="assembly">Assembly</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => { onSave(form); setEditing(false); }}>Save</Button>
          <Button size="sm" variant="outline" onClick={() => { setForm(period); setEditing(false); }}>Cancel</Button>
        </div>
      </div>
    );
  }

  const dur = period.startTime && period.endTime ? durationMin(period.startTime, period.endTime) : null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 hover:bg-slate-50/60 group">
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${TYPE_STYLE[period.periodType as PeriodType] ?? TYPE_STYLE.other}`}>
        <TypeIcon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-slate-800">{period.name}</span>
          <Badge variant="outline" className={`text-xs ${TYPE_STYLE[period.periodType as PeriodType] ?? ""}`}>{period.periodType}</Badge>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          {fmtTime(period.startTime)} – {fmtTime(period.endTime)}
          {dur !== null && ` · ${dur} min`}
        </p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {period.id && (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(period.id!)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function TimetableSetupTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminTimetablePeriodsQueryKey() });

  const { data, isLoading } = useListAdminTimetablePeriods();
  const periodList: Period[] = Array.isArray(data) ? (data as any[]) : [];

  const deleteMut = useDeleteAdminTimetablePeriod({ mutation: { onSuccess: inv } });

  // ── Generator state ───────────────────────────────────────────────────────
  const [showGen, setShowGen] = useState(true);
  const [genCfg, setGenCfg] = useState<GenConfig>({
    schoolStart: "08:00",
    assemblyDuration: 15,
    periodDuration: 45,
    numPeriods: 7,
    breaks: [
      { afterPeriod: 3, duration: 20, name: "Lunch Break" },
      { afterPeriod: 5, duration: 10, name: "Break" },
    ],
  });
  const [preview, setPreview] = useState<Omit<Period, "id">[] | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<Omit<Period, "id">>({ name: "", startTime: "", endTime: "", periodType: "lecture", sortOrder: 0 });

  const previewPeriods = useMemo(() => preview ?? [], [preview]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const bulkMut = useMutation({
    mutationFn: (periods: Omit<Period, "id">[]) =>
      apiFetch<Period[]>("/api/admin/timetable/periods/bulk", {
        method: "POST",
        body: JSON.stringify({ periods, replaceAll: true }),
      }),
    onSuccess: (rows) => {
      toast({ title: `${rows.length} periods saved` });
      inv();
      setPreview(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const saveSingleMut = useMutation({
    mutationFn: (p: Period) => p.id
      ? apiFetch<Period>(`/api/admin/timetable/periods/${p.id}`, { method: "PUT", body: JSON.stringify(p) })
      : apiFetch<Period>("/api/admin/timetable/periods", { method: "POST", body: JSON.stringify(p) }),
    onSuccess: () => { toast({ title: "Period saved" }); inv(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function handleGenPreview() {
    const periods = generatePeriods(genCfg);
    if (!periods.length) { toast({ title: "No periods generated — check your settings", variant: "destructive" }); return; }
    setPreview(periods);
  }

  function handleGenSave() {
    if (!previewPeriods.length) return;
    if (!confirm(`This will replace all ${periodList.length} existing periods with ${previewPeriods.length} new periods. Continue?`)) return;
    bulkMut.mutate(previewPeriods);
  }

  function updateBreak(idx: number, field: keyof typeof genCfg.breaks[0], value: string | number) {
    setGenCfg(c => {
      const breaks = [...c.breaks];
      breaks[idx] = { ...breaks[idx], [field]: value };
      return { ...c, breaks };
    });
  }

  const schoolEnd = useMemo(() => {
    if (!previewPeriods.length) return null;
    return previewPeriods[previewPeriods.length - 1].endTime;
  }, [previewPeriods]);

  return (
    <div className="space-y-6">

      {/* ── Quick Generator ── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
          onClick={() => setShowGen(v => !v)}
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wand2 className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm text-slate-800">Quick Generate</p>
              <p className="text-xs text-slate-400">Auto-create all period slots from school time settings</p>
            </div>
          </div>
          {showGen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {showGen && (
          <div className="border-t border-slate-100 px-5 py-4 space-y-5">
            {/* Settings grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">School Starts At</Label>
                <Input type="time" value={genCfg.schoolStart}
                  onChange={e => setGenCfg(c => ({ ...c, schoolStart: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Assembly (min)</Label>
                <Input type="number" min={0} max={60} value={genCfg.assemblyDuration}
                  onChange={e => setGenCfg(c => ({ ...c, assemblyDuration: Number(e.target.value) }))}
                  className="h-9 text-sm" placeholder="0 = no assembly" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Period Duration (min)</Label>
                <Input type="number" min={10} max={120} value={genCfg.periodDuration}
                  onChange={e => setGenCfg(c => ({ ...c, periodDuration: Number(e.target.value) }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">No. of Periods</Label>
                <Input type="number" min={1} max={15} value={genCfg.numPeriods}
                  onChange={e => setGenCfg(c => ({ ...c, numPeriods: Number(e.target.value) }))} className="h-9 text-sm" />
              </div>
            </div>

            {/* Breaks */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-slate-600">Breaks</Label>
                <Button size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => setGenCfg(c => ({ ...c, breaks: [...c.breaks, { afterPeriod: c.numPeriods, duration: 10, name: "Break" }] }))}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Add Break
                </Button>
              </div>
              {genCfg.breaks.map((brk, i) => (
                <div key={i} className="flex gap-2 items-center flex-wrap">
                  <span className="text-xs text-slate-500 w-20">After period</span>
                  <Input type="number" min={1} max={genCfg.numPeriods} value={brk.afterPeriod}
                    onChange={e => updateBreak(i, "afterPeriod", Number(e.target.value))} className="h-8 w-20 text-sm" />
                  <span className="text-xs text-slate-500">for</span>
                  <Input type="number" min={5} max={120} value={brk.duration}
                    onChange={e => updateBreak(i, "duration", Number(e.target.value))} className="h-8 w-20 text-sm" />
                  <span className="text-xs text-slate-500">min —</span>
                  <Input value={brk.name} onChange={e => updateBreak(i, "name", e.target.value)}
                    className="h-8 w-36 text-sm" placeholder="Break name" />
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-destructive"
                    onClick={() => setGenCfg(c => ({ ...c, breaks: c.breaks.filter((_, j) => j !== i) }))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Preview + actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleGenPreview}>
                <Wand2 className="h-4 w-4 mr-1.5" />Preview Schedule
              </Button>
              {preview && (
                <Button size="sm" onClick={handleGenSave} disabled={bulkMut.isPending}>
                  {bulkMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                  Generate & Replace All
                </Button>
              )}
              {preview && (
                <Button size="sm" variant="ghost" className="text-slate-400" onClick={() => setPreview(null)}>Clear preview</Button>
              )}
            </div>

            {/* Preview table */}
            {preview && (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-700">Preview — {previewPeriods.length} periods</span>
                  {schoolEnd && <span className="text-xs text-amber-600">School ends at {fmtTime(schoolEnd)}</span>}
                </div>
                <div className="divide-y divide-slate-100">
                  {previewPeriods.map((p, i) => {
                    const TypeIcon = TYPE_ICON[p.periodType as PeriodType] ?? Clock;
                    const dur = durationMin(p.startTime, p.endTime);
                    return (
                      <div key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <div className={`h-6 w-6 rounded flex items-center justify-center flex-shrink-0 ${TYPE_STYLE[p.periodType as PeriodType]}`}>
                          <TypeIcon className="h-3.5 w-3.5" />
                        </div>
                        <span className="font-medium text-slate-700 w-28">{p.name}</span>
                        <span className="text-slate-500">{fmtTime(p.startTime)} – {fmtTime(p.endTime)}</span>
                        <span className="text-xs text-slate-400 ml-auto">{dur} min</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Period list ── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-sm text-slate-800">Current Periods</h3>
            <p className="text-xs text-slate-400 mt-0.5">{periodList.length} period{periodList.length !== 1 ? "s" : ""} defined</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setAdding(true); setAddForm({ name: "", startTime: "", endTime: "", periodType: "lecture", sortOrder: periodList.length }); }}>
            <Plus className="h-4 w-4 mr-1.5" />Add Period
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading…</span>
          </div>
        ) : periodList.length === 0 && !adding ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-slate-400">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Clock className="h-7 w-7 text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">No periods defined yet</p>
              <p className="text-xs text-slate-400 mt-1">Use Quick Generate above or add periods manually</p>
            </div>
          </div>
        ) : (
          <>
            {/* Add inline form */}
            {adding && (
              <div className="px-4 py-3 bg-green-50 border-b border-green-100 space-y-3">
                <p className="text-xs font-semibold text-green-700">New Period</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm" placeholder="e.g. Period 1" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Start</Label>
                    <Input type="time" value={addForm.startTime} onChange={e => setAddForm(f => ({ ...f, startTime: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End</Label>
                    <Input type="time" value={addForm.endTime} onChange={e => setAddForm(f => ({ ...f, endTime: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <select value={addForm.periodType} onChange={e => setAddForm(f => ({ ...f, periodType: e.target.value as PeriodType }))}
                      className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
                      <option value="lecture">Lecture</option>
                      <option value="break">Break</option>
                      <option value="assembly">Assembly</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { saveSingleMut.mutate(addForm as Period); setAdding(false); }} disabled={!addForm.name || saveSingleMut.isPending}>
                    {saveSingleMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
                </div>
              </div>
            )}
            <div className="divide-y divide-slate-100">
              {periodList.map(p => (
                <PeriodRow
                  key={p.id}
                  period={p}
                  onSave={updated => saveSingleMut.mutate(updated)}
                  onDelete={id => setDeleteId(id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this period?</AlertDialogTitle>
            <AlertDialogDescription>
              Any timetable slots using this period will be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMut.mutate({ id: deleteId! }, { onSuccess: () => { setDeleteId(null); toast({ title: "Period deleted" }); }, onError: (err: unknown) => { toast({ title: "Failed to delete period", description: err instanceof Error ? err.message : "An error occurred", variant: "destructive" }); } })}
              disabled={deleteMut.isPending}>
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
