import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminMeritConfig,
  getListAdminMeritConfigQueryKey,
  useCreateAdminMeritConfig,
  useUpdateAdminMeritConfig,
  useDeleteAdminMeritConfig,
  useListAdminAcademicYears,
  getListAdminAcademicYearsQueryKey,
  useListAdminClasses,
  getListAdminClassesQueryKey,
} from "@workspace/api-client-react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, Loader2, FlaskConical, Info, ShieldCheck } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfigRow = {
  id: string;
  academicYearId?: string | null;
  academicYearName?: string | null;
  classCode?: string | null;
  academicWeight: number;
  testWeight: number;
  interviewWeight: number;
  minMeritScore: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  academicYearId: string;
  classCode: string;
  academicWeight: string;
  testWeight: string;
  interviewWeight: string;
  minMeritScore: string;
  notes: string;
};

const BLANK: FormState = {
  academicYearId: "",
  classCode: "",
  academicWeight: "20",
  testWeight: "50",
  interviewWeight: "30",
  minMeritScore: "50",
  notes: "",
};

function toForm(row: ConfigRow): FormState {
  return {
    academicYearId: row.academicYearId ?? "",
    classCode: row.classCode ?? "",
    academicWeight: String(row.academicWeight),
    testWeight: String(row.testWeight),
    interviewWeight: String(row.interviewWeight),
    minMeritScore: String(row.minMeritScore),
    notes: row.notes ?? "",
  };
}

// ─── Weight bar visual ────────────────────────────────────────────────────────

function WeightBar({ acad, test, interview }: { acad: number; test: number; interview: number }) {
  const total = acad + test + interview;
  const ok = total === 100;
  const aW = total > 0 ? (acad / total) * 100 : 0;
  const tW = total > 0 ? (test / total) * 100 : 0;
  const iW = total > 0 ? (interview / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex h-5 w-full rounded-full overflow-hidden bg-slate-100">
        <div className="transition-all" style={{ width: `${aW}%`, background: "#6366f1" }} title={`Academic ${acad}`} />
        <div className="transition-all" style={{ width: `${tW}%`, background: "#0ea5e9" }} title={`Test ${test}`} />
        <div className="transition-all" style={{ width: `${iW}%`, background: "#10b981" }} title={`Interview ${interview}`} />
      </div>
      <div className="flex items-center gap-3 text-[11px]">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-indigo-500" />Academic {acad}%</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-sky-500" />Entry Test {test}%</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />Interview {interview}%</span>
        {!ok && <span className="ml-auto font-semibold text-red-500">Sum = {total} (must be 100)</span>}
        {ok  && <span className="ml-auto font-semibold text-emerald-600">✓ Sum = 100</span>}
      </div>
    </div>
  );
}

// ─── Form Dialog ──────────────────────────────────────────────────────────────

function ConfigFormDialog({
  open,
  onClose,
  initial,
  academicYears,
  classes,
  onSave,
  isPending,
  title,
}: {
  open: boolean;
  onClose: () => void;
  initial: FormState;
  academicYears: { id: string; name: string }[];
  classes: { code: string; name: string }[];
  onSave: (f: FormState) => void;
  isPending: boolean;
  title: string;
}) {
  const [f, setF] = useState<FormState>(initial);
  const set = (k: keyof FormState) => (v: string) => setF(prev => ({ ...prev, [k]: v }));

  const acad = parseInt(f.academicWeight) || 0;
  const test = parseInt(f.testWeight) || 0;
  const intr = parseInt(f.interviewWeight) || 0;
  const weightsOk = acad + test + intr === 100;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Configure the merit formula for a specific academic year and class combination. Leave a field blank to make it a broader default.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Scope */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Scope</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Academic Year</Label>
                <Select value={f.academicYearId || "__all__"} onValueChange={(v) => set("academicYearId")(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All years (global)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All years (global)</SelectItem>
                    {academicYears.map(y => (
                      <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Class/Program</Label>
                <Select value={f.classCode || "__all__"} onValueChange={(v) => set("classCode")(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All classes (global)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All classes (global)</SelectItem>
                    {classes.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              <strong>Lookup precedence:</strong> Year + Class/Program → Year only → Class/Program only → Global → System default (20/50/30).
            </p>
          </div>

          {/* Weights */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Score Weights (must sum to 100)</p>
            <WeightBar acad={acad} test={test} interview={intr} />
            <div className="grid grid-cols-3 gap-3 mt-2">
              {([
                { key: "academicWeight", label: "Academic",   color: "border-indigo-300 bg-indigo-50" },
                { key: "testWeight",     label: "Entry Test", color: "border-sky-300 bg-sky-50" },
                { key: "interviewWeight",label: "Interview",  color: "border-emerald-300 bg-emerald-50" },
              ] as const).map(({ key, label, color }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{label} %</Label>
                  <Input
                    type="number" min={0} max={100}
                    className={cn("h-9 text-center font-bold", color)}
                    value={f[key]}
                    onChange={e => set(key)(e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Gate — single cumulative minimum */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Eligibility Gate (minimum cumulative score)</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              A candidate passes if their weighted total score meets or exceeds this threshold. No per-section minimums.
            </p>
            <div className="flex justify-center">
              <div className="w-48 space-y-1">
                <Label className="text-xs text-center block">Min Merit Score</Label>
                <Input
                  type="number" min={0} max={100}
                  className="h-12 text-center text-lg font-bold border-indigo-300 bg-indigo-50"
                  value={f.minMeritScore}
                  onChange={e => set("minMeritScore")(e.target.value)}
                />
                <p className="text-[10px] text-slate-400 text-center">out of 100</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs">Notes <span className="text-slate-400">(optional)</span></Label>
            <Textarea
              className="resize-none h-16 text-sm"
              placeholder="e.g. Adjusted for 2026-27 intake — interview weight increased per committee decision."
              value={f.notes}
              onChange={e => setF(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSave(f)}
            disabled={isPending || !weightsOk}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Config
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete dialog ────────────────────────────────────────────────────────────

function DeleteDialog({
  row,
  onConfirm,
  isPending,
  onClose,
}: {
  row: ConfigRow;
  onConfirm: () => void;
  isPending: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Merit Config</DialogTitle>
          <DialogDescription>
            Remove the formula config for{" "}
            <strong>{row.academicYearName ?? "all years"}</strong> /{" "}
            <strong>{row.classCode ?? "all classes"}</strong>?
            The system will fall back to the next applicable config (or hardcoded defaults).
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MeritConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: configs, isLoading } = useListAdminMeritConfig({
    query: { queryKey: getListAdminMeritConfigQueryKey(), placeholderData: keepPreviousData },
  });
  const { data: years  = [] } = useListAdminAcademicYears({
    query: { queryKey: getListAdminAcademicYearsQueryKey() },
  });
  const { data: classesData = [] } = useListAdminClasses({
    query: { queryKey: getListAdminClassesQueryKey() },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListAdminMeritConfigQueryKey() });
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow]       = useState<ConfigRow | null>(null);
  const [deleteRow, setDeleteRow]   = useState<ConfigRow | null>(null);

  const createMut = useCreateAdminMeritConfig({
    mutation: {
      onSuccess: () => { toast({ title: "Config created" }); invalidate(); setCreateOpen(false); },
      onError: (e: any) => toast({ title: e?.message ?? "Failed to create", variant: "destructive" }),
    },
  });
  const updateMut = useUpdateAdminMeritConfig({
    mutation: {
      onSuccess: () => { toast({ title: "Config updated" }); invalidate(); setEditRow(null); },
      onError: (e: any) => toast({ title: e?.message ?? "Failed to update", variant: "destructive" }),
    },
  });
  const deleteMut = useDeleteAdminMeritConfig({
    mutation: {
      onSuccess: () => { toast({ title: "Config deleted" }); invalidate(); setDeleteRow(null); },
      onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
    },
  });

  function buildBody(f: FormState) {
    return {
      academicYearId: f.academicYearId || null,
      classCode:      f.classCode || null,
      academicWeight:    parseInt(f.academicWeight),
      testWeight:        parseInt(f.testWeight),
      interviewWeight:   parseInt(f.interviewWeight),
      minMeritScore:     parseInt(f.minMeritScore),
      notes: f.notes || undefined,
    };
  }

  const rows = (configs ?? []) as ConfigRow[];

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center">
              <FlaskConical className="h-5 w-5 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">Merit Formula Config</h1>
          </div>
          <p className="text-sm text-slate-500 ml-11">
            Customise score weights and the minimum cumulative score per academic year and class. Most-specific config wins.
          </p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700 shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Config
        </Button>
      </div>

      {/* Default banner */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 flex items-start gap-3">
        <Info className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
        <div className="text-xs text-indigo-700 leading-relaxed">
          <strong>System default (no config):</strong> Academic 20% + Entry Test 50% + Interview 30% = 100. Eligibility gate: cumulative Merit ≥ 50. These apply when no matching config is found.
        </div>
      </div>

      {/* Configs table */}
      <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b bg-slate-50 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-400" />
          <span className="font-semibold text-sm text-slate-700">Saved Configurations</span>
          <span className="ml-auto text-xs text-slate-400">{rows.length} config{rows.length !== 1 ? "s" : ""}</span>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
            <FlaskConical className="h-10 w-10 text-slate-200" />
            <p className="font-semibold text-slate-500">No custom configs yet</p>
            <p className="text-sm text-center max-w-xs">
              The system default formula applies to everyone. Create a config to override it for a specific year or class.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs font-semibold text-slate-500 bg-slate-50/50">
                <th className="px-4 py-2.5 text-left">Scope</th>
                <th className="px-4 py-2.5 text-center">Weights</th>
                <th className="px-4 py-2.5 text-center">Min Merit</th>
                <th className="px-4 py-2.5 text-left">Notes</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <p className="font-semibold text-slate-800">
                        {row.academicYearName ?? <span className="text-slate-400 italic">All years</span>}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {row.classCode ? <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{row.classCode}</span> : <span className="text-slate-400 italic">All classes</span>}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex gap-2 text-xs font-semibold">
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">A {row.academicWeight}</span>
                      <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">T {row.testWeight}</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">I {row.interviewWeight}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                      ≥ {row.minMeritScore}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-[12px] max-w-[200px] truncate">
                    {row.notes ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        onClick={() => setEditRow(row)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        onClick={() => setDeleteRow(row)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Dialogs */}
      {createOpen && (
        <ConfigFormDialog
          open
          onClose={() => setCreateOpen(false)}
          initial={BLANK}
          academicYears={years}
          classes={classesData.map(c => ({ code: c.code, name: c.name }))}
          onSave={f => createMut.mutate({ data: buildBody(f) as any })}
          isPending={createMut.isPending}
          title="New Merit Formula Config"
        />
      )}
      {editRow && (
        <ConfigFormDialog
          open
          onClose={() => setEditRow(null)}
          initial={toForm(editRow)}
          academicYears={years}
          classes={classesData.map(c => ({ code: c.code, name: c.name }))}
          onSave={f => updateMut.mutate({ id: editRow.id, data: buildBody(f) as any })}
          isPending={updateMut.isPending}
          title="Edit Merit Formula Config"
        />
      )}
      {deleteRow && (
        <DeleteDialog
          row={deleteRow}
          onConfirm={() => deleteMut.mutate({ id: deleteRow.id })}
          isPending={deleteMut.isPending}
          onClose={() => setDeleteRow(null)}
        />
      )}
    </div>
  );
}
