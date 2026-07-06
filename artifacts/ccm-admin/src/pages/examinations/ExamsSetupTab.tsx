import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  useListAdminExamTypes, getListAdminExamTypesQueryKey,
  useCreateAdminExamType, useUpdateAdminExamType, useDeleteAdminExamType,
  useListAdminExamGradingScales, getListAdminExamGradingScalesQueryKey,
  useCreateAdminExamGradingScale, useUpdateAdminExamGradingScale, useDeleteAdminExamGradingScale,
} from "@workspace/api-client-react";
import { ClipboardList, Star, BarChart2, Plus, Pencil, Trash2, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { CatalogTab, type CatalogItem, type FieldDef } from "@/pages/academic/CatalogTab";
import { useState } from "react";
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
  { key: "grade-bands",    label: "Grade Bands" },
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

// ── Grading Scales ────────────────────────────────────────────────────────────
function GradingScalesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminExamGradingScales();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminExamGradingScalesQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Scale Name", type: "text", required: true, placeholder: "e.g. Standard BISE, College Scale", maxLength: 120 },
    { key: "description", label: "Description", type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Grading Scale"
      description="Define named grading systems (e.g. BISE Punjab Scale). Then add grade bands to each scale in the Grade Bands tab."
      icon={Star}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminExamGradingScale({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminExamGradingScale({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminExamGradingScale({ mutation: { onSuccess: inv } })}
    />
  );
}

// ── Grade Bands ────────────────────────────────────────────────────────────────
interface GradingScale { id: string; name: string; description?: string | null; }
interface GradeBand {
  id: string; gradeScaleId: string; grade: string;
  minPercent: number; maxPercent: number; remarks?: string | null;
}
interface BandForm { grade: string; minPercent: string; maxPercent: string; remarks: string; }
const BAND_BLANK: BandForm = { grade: "", minPercent: "0", maxPercent: "100", remarks: "" };

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

function GradeBandsTab() {
  const qc = useQueryClient();
  const [selectedScaleId, setSelectedScaleId] = useState<string | null>(null);
  const [editBand, setEditBand]   = useState<GradeBand | null>(null);
  const [addOpen, setAddOpen]     = useState(false);
  const [form, setForm]           = useState<BandForm>(BAND_BLANK);
  const [delId, setDelId]         = useState<string | null>(null);

  const { data: scales = [], isLoading: scalesLoading } = useQuery<GradingScale[]>({
    queryKey: ["exam-grading-scales"],
    queryFn: () => apiFetch("/api/admin/exams/grading-scales"),
    staleTime: 60_000,
  });

  const { data: bands = [], isLoading: bandsLoading } = useQuery<GradeBand[]>({
    queryKey: ["exam-grade-bands"],
    queryFn: () => apiFetch("/api/admin/exams/grade-bands"),
    staleTime: 10_000,
  });

  const inv = () => qc.invalidateQueries({ queryKey: ["exam-grade-bands"] });

  const createMut = useMutation({
    mutationFn: (body: object) => apiFetch("/api/admin/exams/grade-bands", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { inv(); setAddOpen(false); setForm(BAND_BLANK); toast({ title: "Band added" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => apiFetch(`/api/admin/exams/grade-bands/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { inv(); setEditBand(null); setAddOpen(false); toast({ title: "Band updated" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/exams/grade-bands/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDelId(null); toast({ title: "Deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function openAdd() {
    setEditBand(null);
    setForm(BAND_BLANK);
    setAddOpen(true);
  }
  function openEdit(b: GradeBand) {
    setEditBand(b);
    setForm({ grade: b.grade, minPercent: String(b.minPercent), maxPercent: String(b.maxPercent), remarks: b.remarks ?? "" });
    setAddOpen(true);
  }

  function handleSave() {
    if (!selectedScaleId || !form.grade) return;
    const minPercent = parseFloat(form.minPercent);
    const maxPercent = parseFloat(form.maxPercent);
    if (!Number.isFinite(minPercent) || !Number.isFinite(maxPercent)) return;
    const body = { gradeScaleId: selectedScaleId, grade: form.grade, minPercent, maxPercent, remarks: form.remarks };
    if (editBand) {
      updateMut.mutate({ id: editBand.id, body });
    } else {
      createMut.mutate(body);
    }
  }

  const selectedScale = scales.find(s => s.id === selectedScaleId);
  const visibleBands  = bands.filter(b => b.gradeScaleId === selectedScaleId).sort((a, b) => b.minPercent - a.minPercent);
  const isPending     = createMut.isPending || updateMut.isPending;

  if (scalesLoading) {
    return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Grade Bands</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define percentage ranges and grade letters for each grading scale.
            {scales.length === 0 && " Create a Grading Scale first."}
          </p>
        </div>
        {selectedScaleId && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Band
          </Button>
        )}
      </div>

      {/* Scale selector */}
      {scales.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Star className="h-8 w-8 mx-auto mb-2 text-slate-200" />
          <p className="text-sm text-slate-500">No grading scales yet.</p>
          <p className="text-xs text-slate-400 mt-1">Add a scale in the <strong>Grading Scales</strong> tab first, then come back here to add grade bands.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[200px_1fr] gap-4">
          {/* Scale list */}
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <div className="bg-muted/40 px-3 py-2 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Grading Scales</p>
            </div>
            <div className="divide-y divide-border">
              {scales.map(scale => {
                const count = bands.filter(b => b.gradeScaleId === scale.id).length;
                return (
                  <button
                    key={scale.id}
                    onClick={() => setSelectedScaleId(scale.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors text-sm",
                      selectedScaleId === scale.id
                        ? "bg-indigo-50 text-indigo-700 font-medium"
                        : "hover:bg-muted/40 text-slate-700"
                    )}
                  >
                    <span className="truncate">{scale.name}</span>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                      <span className="text-xs text-slate-400 tabular-nums">{count}</span>
                      <ChevronRight className="h-3 w-3 text-slate-400" />
                    </div>
                  </button>
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
            <div className="rounded-xl border border-border overflow-hidden shadow-sm">
              <div className="bg-muted/40 px-3 py-2 border-b border-border flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {selectedScale?.name} — Bands
                </p>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openAdd}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {bandsLoading ? (
                <div className="space-y-2 p-3">{[1,2,3].map(i => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
              ) : visibleBands.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-slate-400">No bands yet.</p>
                  <Button size="sm" className="mt-3" onClick={openAdd}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add First Band</Button>
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
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDelId(b.id)}>
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

      {/* Add / Edit band dialog */}
      <Dialog open={addOpen} onOpenChange={v => { if (!v) { setAddOpen(false); setEditBand(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editBand ? "Edit Grade Band" : "Add Grade Band"}</DialogTitle>
            {selectedScale && <p className="text-sm text-slate-500 mt-0.5">Scale: <strong>{selectedScale.name}</strong></p>}
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label>Grade *</Label>
              <Input className="mt-1" placeholder="e.g. A+, A, B, C, D, F" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Min %</Label>
                <Input type="number" step="any" className="mt-1" value={form.minPercent} onChange={e => setForm(f => ({ ...f, minPercent: e.target.value }))} />
              </div>
              <div>
                <Label>Max %</Label>
                <Input type="number" step="any" className="mt-1" value={form.maxPercent} onChange={e => setForm(f => ({ ...f, maxPercent: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Remarks</Label>
              <Input className="mt-1" placeholder="e.g. Excellent, Pass, Fail" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setEditBand(null); }}>Cancel</Button>
            <Button disabled={!form.grade || isPending} onClick={handleSave}>
              {isPending ? "Saving…" : editBand ? "Save Changes" : "Add Band"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!delId} onOpenChange={() => setDelId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Grade Band?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">This will remove the grade band permanently.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMut.isPending} onClick={() => delId && deleteMut.mutate(delId)}>
              {deleteMut.isPending ? "Deleting…" : "Delete"}
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
      qc.invalidateQueries({ queryKey: ["exam-grading-scales"] });
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
      {sub === "grading-scales" && <GradingScalesTab />}
      {sub === "grade-bands"    && <GradeBandsTab />}
    </div>
  );
}
