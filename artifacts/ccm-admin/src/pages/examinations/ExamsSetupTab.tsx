import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  useListAdminExamTypes, getListAdminExamTypesQueryKey,
  useCreateAdminExamType, useUpdateAdminExamType, useDeleteAdminExamType,
  useListAdminExamGradingScales, getListAdminExamGradingScalesQueryKey,
  useCreateAdminExamGradingScale, useUpdateAdminExamGradingScale, useDeleteAdminExamGradingScale,
} from "@workspace/api-client-react";
import { ClipboardList, Star, BarChart2, Plus, Pencil, Trash2, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { CatalogTab, type CatalogItem, type FieldDef } from "@/pages/academic/CatalogTab";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const SUBTABS = [
  { key: "types",          label: "Exam Types" },
  { key: "grading-scales", label: "Grading Scales" },
] as const;
type Subtab = (typeof SUBTABS)[number]["key"];

// ── Exam Types ────────────────────────────────────────────────────────────────
function ExamTypesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminExamTypes();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminExamTypesQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Exam Type", type: "text", required: true, placeholder: "e.g. Mid-Term, Final, Monthly Test", maxLength: 120 },
    { key: "description", label: "Description", type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Exam Type"
      description="Define examination series such as Mid-Term, Annual, Monthly Test, Pre-Board, etc."
      icon={ClipboardList}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminExamType({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminExamType({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminExamType({ mutation: { onSuccess: inv } })}
    />
  );
}

// ── Grading Scales & Bands (combined) ───────────────────────────────────────────
interface GradingScale {
  id: string; name: string; description?: string | null;
  active: boolean; sortOrder: number;
}
interface GradeBand {
  id: string; gradeScaleId: string; grade: string;
  minPercent: number; maxPercent: number; remarks?: string | null;
}
interface BandForm { grade: string; minPercent: string; maxPercent: string; remarks: string; }
interface ScaleForm { name: string; description: string; sortOrder: string; active: boolean; }
const BAND_BLANK: BandForm = { grade: "", minPercent: "0", maxPercent: "100", remarks: "" };
const SCALE_BLANK: ScaleForm = { name: "", description: "", sortOrder: "0", active: true };

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

function GradingScalesBandsTab() {
  const qc = useQueryClient();
  const [selectedScaleId, setSelectedScaleId] = useState<string | null>(null);

  // Band dialog / delete state
  const [editBand, setEditBand] = useState<GradeBand | null>(null);
  const [bandOpen, setBandOpen] = useState(false);
  const [bandForm, setBandForm] = useState<BandForm>(BAND_BLANK);
  const [delBandId, setDelBandId] = useState<string | null>(null);

  // Scale dialog / delete state
  const [editScale, setEditScale] = useState<GradingScale | null>(null);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [scaleForm, setScaleForm] = useState<ScaleForm>(SCALE_BLANK);
  const [delScaleId, setDelScaleId] = useState<string | null>(null);

  // ── Scales (typed API, includes active + sortOrder) ──
  const { data: scalesData, isLoading: scalesLoading } = useListAdminExamGradingScales();
  const scales = ((scalesData ?? []) as unknown as GradingScale[])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const invScales = () => qc.invalidateQueries({ queryKey: getListAdminExamGradingScalesQueryKey() });

  // If the selected scale disappears (deleted here or elsewhere), clear the stale selection.
  useEffect(() => {
    if (selectedScaleId && !scalesLoading && !scales.some(s => s.id === selectedScaleId)) {
      setSelectedScaleId(null);
    }
  }, [scalesData, scalesLoading, selectedScaleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const scaleCreate = useCreateAdminExamGradingScale({
    mutation: {
      onSuccess: () => { invScales(); setScaleOpen(false); setEditScale(null); toast({ title: "Grading scale added" }); },
      onError: (e: unknown) => toast({ variant: "destructive", title: "Error", description: (e as any)?.data?.error ?? (e as any)?.message }),
    },
  });
  const scaleUpdate = useUpdateAdminExamGradingScale({
    mutation: {
      onSuccess: () => { invScales(); setScaleOpen(false); setEditScale(null); toast({ title: "Grading scale updated" }); },
      onError: (e: unknown) => toast({ variant: "destructive", title: "Error", description: (e as any)?.data?.error ?? (e as any)?.message }),
    },
  });
  const scaleDelete = useDeleteAdminExamGradingScale({
    mutation: {
      onSuccess: () => {
        invScales();
        qc.invalidateQueries({ queryKey: ["exam-grade-bands"] });
        if (delScaleId === selectedScaleId) setSelectedScaleId(null);
        setDelScaleId(null);
        toast({ title: "Grading scale removed" });
      },
      onError: (e: unknown) => toast({ variant: "destructive", title: "Error", description: (e as any)?.data?.error ?? (e as any)?.message }),
    },
  });

  // ── Bands (raw fetch) ──
  const { data: bands = [], isLoading: bandsLoading } = useQuery<GradeBand[]>({
    queryKey: ["exam-grade-bands"],
    queryFn: () => apiFetch("/api/admin/exams/grade-bands"),
    staleTime: 10_000,
  });
  const invBands = () => qc.invalidateQueries({ queryKey: ["exam-grade-bands"] });

  const bandCreate = useMutation({
    mutationFn: (body: object) => apiFetch("/api/admin/exams/grade-bands", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { invBands(); setBandOpen(false); setBandForm(BAND_BLANK); toast({ title: "Band added" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });
  const bandUpdate = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => apiFetch(`/api/admin/exams/grade-bands/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { invBands(); setEditBand(null); setBandOpen(false); toast({ title: "Band updated" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });
  const bandDelete = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/exams/grade-bands/${id}`, { method: "DELETE" }),
    onSuccess: () => { invBands(); setDelBandId(null); toast({ title: "Deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  // ── Scale dialog handlers ──
  function openScaleAdd() {
    setEditScale(null);
    setScaleForm({ ...SCALE_BLANK, sortOrder: String(scales.length) });
    setScaleOpen(true);
  }
  function openScaleEdit(s: GradingScale) {
    setEditScale(s);
    setScaleForm({ name: s.name, description: s.description ?? "", sortOrder: String(s.sortOrder ?? 0), active: s.active });
    setScaleOpen(true);
  }
  function handleScaleSave() {
    const name = scaleForm.name.trim();
    if (!name) return;
    const order = Number(scaleForm.sortOrder);
    const data = {
      name,
      description: scaleForm.description.trim() || undefined,
      active: scaleForm.active,
      sortOrder: Number.isFinite(order) ? Math.trunc(order) : 0,
    };
    if (editScale) scaleUpdate.mutate({ id: editScale.id, data });
    else scaleCreate.mutate({ data });
  }

  // ── Band dialog handlers ──
  function openBandAdd() {
    setEditBand(null);
    setBandForm(BAND_BLANK);
    setBandOpen(true);
  }
  function openBandEdit(b: GradeBand) {
    setEditBand(b);
    setBandForm({ grade: b.grade, minPercent: String(b.minPercent), maxPercent: String(b.maxPercent), remarks: b.remarks ?? "" });
    setBandOpen(true);
  }
  function handleBandSave() {
    if (!selectedScaleId || !bandForm.grade) return;
    const minPercent = parseFloat(bandForm.minPercent);
    const maxPercent = parseFloat(bandForm.maxPercent);
    if (!Number.isFinite(minPercent) || !Number.isFinite(maxPercent)) return;
    const body = { gradeScaleId: selectedScaleId, grade: bandForm.grade, minPercent, maxPercent, remarks: bandForm.remarks };
    if (editBand) bandUpdate.mutate({ id: editBand.id, body });
    else bandCreate.mutate(body);
  }

  const selectedScale = scales.find(s => s.id === selectedScaleId);
  const visibleBands  = bands.filter(b => b.gradeScaleId === selectedScaleId).sort((a, b) => b.minPercent - a.minPercent);
  const scaleSaving   = scaleCreate.isPending || scaleUpdate.isPending;
  const bandSaving    = bandCreate.isPending || bandUpdate.isPending;

  if (scalesLoading) {
    return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Grading Scales &amp; Bands</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create grading systems on the left, then define their percentage ranges and grade letters on the right.
          </p>
        </div>
        {selectedScaleId && (
          <Button size="sm" onClick={openBandAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Band
          </Button>
        )}
      </div>

      {scales.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Star className="h-8 w-8 mx-auto mb-2 text-slate-200" />
          <p className="text-sm text-slate-500">No grading scales yet.</p>
          <p className="text-xs text-slate-400 mt-1">Add a grading scale to start defining its grade bands.</p>
          <Button size="sm" className="mt-3" onClick={openScaleAdd}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add Grading Scale</Button>
        </div>
      ) : (
        <div className="grid grid-cols-[240px_1fr] gap-4">
          {/* Scale list + management */}
          <div className="rounded-xl border border-border overflow-hidden shadow-sm self-start">
            <div className="bg-muted/40 px-3 py-2 border-b border-border flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Grading Scales</p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openScaleAdd}>
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            <div className="divide-y divide-border">
              {scales.map(scale => {
                const count = bands.filter(b => b.gradeScaleId === scale.id).length;
                const isSel = selectedScaleId === scale.id;
                return (
                  <div
                    key={scale.id}
                    className={cn(
                      "group flex items-center transition-colors",
                      isSel ? "bg-indigo-50" : "hover:bg-muted/40",
                    )}
                  >
                    <button
                      onClick={() => setSelectedScaleId(scale.id)}
                      className={cn(
                        "flex-1 min-w-0 flex items-center justify-between px-3 py-2.5 text-left text-sm",
                        isSel ? "text-indigo-700 font-medium" : "text-slate-700",
                      )}
                    >
                      <span className="min-w-0 flex items-center gap-1.5">
                        <span className="truncate">{scale.name}</span>
                        {!scale.active && <span className="text-[10px] font-normal text-slate-400 border border-slate-200 rounded px-1 py-0.5 flex-shrink-0">Inactive</span>}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                        <span className="text-xs text-slate-400 tabular-nums">{count}</span>
                        <ChevronRight className="h-3 w-3 text-slate-400" />
                      </div>
                    </button>
                    <div className="flex items-center gap-0.5 pr-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openScaleEdit(scale)} aria-label="Edit scale">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDelScaleId(scale.id)} aria-label="Delete scale">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bands table */}
          {!selectedScaleId ? (
            <div className="rounded-xl border border-dashed border-border flex items-center justify-center p-12 text-center">
              <div>
                <BarChart2 className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">Select a grading scale to view and edit its bands.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden shadow-sm self-start">
              <div className="bg-muted/40 px-3 py-2 border-b border-border flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {selectedScale?.name} — Bands
                </p>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openBandAdd}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {bandsLoading ? (
                <div className="space-y-2 p-3">{[1,2,3].map(i => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
              ) : visibleBands.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-slate-400">No bands yet.</p>
                  <Button size="sm" className="mt-3" onClick={openBandAdd}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add First Band</Button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Grade</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">Min %</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">Max %</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Remarks</th>
                      <th className="px-3 py-2 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleBands.map(b => (
                      <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2 font-bold text-slate-800">{b.grade}</td>
                        <td className="px-3 py-2 text-center tabular-nums text-slate-600">{b.minPercent}</td>
                        <td className="px-3 py-2 text-center tabular-nums text-slate-600">{b.maxPercent}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs">{b.remarks ?? "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openBandEdit(b)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDelBandId(b.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit scale dialog */}
      <Dialog open={scaleOpen} onOpenChange={v => { if (!v) { setScaleOpen(false); setEditScale(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editScale ? "Edit Grading Scale" : "Add Grading Scale"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label>Scale Name *</Label>
              <Input className="mt-1" placeholder="e.g. FBISE Standard Scale, Pass/Fail Scale" value={scaleForm.name} onChange={e => setScaleForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Input className="mt-1" placeholder="Optional note about this scale" value={scaleForm.description} onChange={e => setScaleForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label>Order</Label>
                <Input type="number" min={0} className="mt-1" value={scaleForm.sortOrder} onChange={e => setScaleForm(f => ({ ...f, sortOrder: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 h-9 cursor-pointer select-none">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-emerald-600 cursor-pointer" checked={scaleForm.active} onChange={e => setScaleForm(f => ({ ...f, active: e.target.checked }))} />
                <span className="text-sm text-slate-700">Active</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setScaleOpen(false); setEditScale(null); }}>Cancel</Button>
            <Button disabled={!scaleForm.name.trim() || scaleSaving} onClick={handleScaleSave}>
              {scaleSaving ? "Saving…" : editScale ? "Save Changes" : "Add Scale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete scale confirm */}
      <Dialog open={!!delScaleId} onOpenChange={() => setDelScaleId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Grading Scale?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">This removes the grading scale and its grade bands. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelScaleId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={scaleDelete.isPending} onClick={() => delScaleId && scaleDelete.mutate({ id: delScaleId })}>
              {scaleDelete.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit band dialog */}
      <Dialog open={bandOpen} onOpenChange={v => { if (!v) { setBandOpen(false); setEditBand(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editBand ? "Edit Grade Band" : "Add Grade Band"}</DialogTitle>
            {selectedScale && <p className="text-sm text-slate-500 mt-0.5">Scale: <strong>{selectedScale.name}</strong></p>}
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label>Grade *</Label>
              <Input className="mt-1" placeholder="e.g. A+, A, B, C, D, F" value={bandForm.grade} onChange={e => setBandForm(f => ({ ...f, grade: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Min %</Label>
                <Input type="number" step="any" className="mt-1" value={bandForm.minPercent} onChange={e => setBandForm(f => ({ ...f, minPercent: e.target.value }))} />
              </div>
              <div>
                <Label>Max %</Label>
                <Input type="number" step="any" className="mt-1" value={bandForm.maxPercent} onChange={e => setBandForm(f => ({ ...f, maxPercent: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Remarks</Label>
              <Input className="mt-1" placeholder="e.g. Excellent, Pass, Fail" value={bandForm.remarks} onChange={e => setBandForm(f => ({ ...f, remarks: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBandOpen(false); setEditBand(null); }}>Cancel</Button>
            <Button disabled={!bandForm.grade || bandSaving} onClick={handleBandSave}>
              {bandSaving ? "Saving…" : editBand ? "Save Changes" : "Add Band"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete band confirm */}
      <Dialog open={!!delBandId} onOpenChange={() => setDelBandId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Grade Band?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">This will remove the grade band permanently.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelBandId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={bandDelete.isPending} onClick={() => delBandId && bandDelete.mutate(delBandId)}>
              {bandDelete.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ExamsSetupTab() {
  const [sub, setSub] = useState<Subtab>("types");
  const qc = useQueryClient();

  const seedMut = useMutation({
    mutationFn: async () => {
      const token = getToken();
      const res = await fetch("/api/admin/exams/seed-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed"); }
      return res.json() as Promise<{ inserted: { types: number; scales: number; bands: number } }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: getListAdminExamTypesQueryKey() });
      qc.invalidateQueries({ queryKey: getListAdminExamGradingScalesQueryKey() });
      qc.invalidateQueries({ queryKey: ["exam-grade-bands"] });
      const { types, scales, bands } = data.inserted;
      const total = types + scales + bands;
      toast({ title: total > 0 ? `Loaded ${total} default records` : "Defaults already up to date" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-0 border-b border-border mb-6">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              sub === t.key
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto pb-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => seedMut.mutate()}
            disabled={seedMut.isPending}
            className="text-xs h-7 px-2.5 gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
          >
            {seedMut.isPending
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Loading…</>
              : <><Sparkles className="h-3 w-3" /> Load Defaults</>
            }
          </Button>
        </div>
      </div>
      {sub === "types"          && <ExamTypesTab />}
      {sub === "grading-scales" && <GradingScalesBandsTab />}
    </div>
  );
}
