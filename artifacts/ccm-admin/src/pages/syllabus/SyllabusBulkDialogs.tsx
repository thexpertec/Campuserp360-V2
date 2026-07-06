import { useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Plus, Minus, Loader2 } from "lucide-react";

// ── Shared helpers ─────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, body: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

const CELL = "w-full h-9 px-2.5 text-sm bg-transparent border-0 outline-none focus:bg-violet-50 focus:ring-1 focus:ring-inset focus:ring-violet-300 transition-colors placeholder:text-slate-300";

function NavHint() {
  return (
    <div className="flex gap-3 text-[11px] text-slate-400">
      <span><kbd className="font-mono bg-slate-100 px-1 rounded">↕</kbd> rows</span>
      <span><kbd className="font-mono bg-slate-100 px-1 rounded">Tab</kbd> columns</span>
      <span><kbd className="font-mono bg-slate-100 px-1 rounded">Enter</kbd> next row</span>
    </div>
  );
}

// ── BulkAddUnitsDialog ─────────────────────────────────────────────────────────

type UnitRow = {
  _id: string;
  classCode: string;
  subjectCode: string;
  title: string;
  description: string;
  sortOrder: string;
  active: boolean;
};

function mkUnitRow(prev?: UnitRow): UnitRow {
  return {
    _id: crypto.randomUUID(),
    classCode:   prev?.classCode   ?? "",
    subjectCode: prev?.subjectCode ?? "",
    title: "",
    description: "",
    sortOrder: String(prev ? (Number(prev.sortOrder) + 1) : 0),
    active: true,
  };
}

interface BulkAddUnitsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classes: { value: string; label: string }[];
  subjects: { value: string; label: string }[];
  onSaved: () => void;
}

export function BulkAddUnitsDialog({ open, onOpenChange, classes, subjects, onSaved }: BulkAddUnitsDialogProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<UnitRow[]>([mkUnitRow()]);
  const [busy, setBusy] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const NUM_COLS = 6;

  function focusCell(ri: number, ci: number) {
    gridRef.current?.querySelector<HTMLElement>(`[data-r="${ri}"][data-c="${ci}"]`)?.focus();
  }
  function nav(e: React.KeyboardEvent, ri: number, ci: number) {
    if (e.key === "ArrowDown")  { e.preventDefault(); if (ri === rows.length - 1) { addRow(); setTimeout(() => focusCell(ri + 1, ci), 20); } else focusCell(ri + 1, ci); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); if (ri > 0) focusCell(ri - 1, ci); }
    else if (e.key === "Enter")  { e.preventDefault(); if (ri === rows.length - 1) { addRow(); setTimeout(() => focusCell(ri + 1, 0), 20); } else focusCell(ri + 1, 0); }
  }
  function upd(id: string, k: keyof UnitRow, v: string | boolean) {
    setRows(p => p.map(r => r._id === id ? { ...r, [k]: v } : r));
  }
  function addRow() {
    setRows(p => { const last = p[p.length - 1]; return [...p, mkUnitRow(last)]; });
  }
  function removeRow(id: string) {
    setRows(p => p.length > 1 ? p.filter(r => r._id !== id) : p);
  }

  const ready = useMemo(() => rows.filter(r => r.classCode.trim() && r.subjectCode.trim() && r.title.trim()), [rows]);

  async function handleSave() {
    if (!ready.length) { toast({ title: "Fill Class, Subject and Title for at least one row", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const payload = ready.map(r => ({
        classCode:   r.classCode.trim(),
        subjectCode: r.subjectCode.trim(),
        title:       r.title.trim(),
        description: r.description.trim() || undefined,
        sortOrder:   Number(r.sortOrder) || 0,
        active:      r.active,
      }));
      const res = await apiFetch<{ saved: number }>("/api/admin/syllabus/units/bulk", payload);
      toast({ title: `${res.saved} unit${res.saved !== 1 ? "s" : ""} added` });
      onSaved();
      onOpenChange(false);
      setRows([mkUnitRow()]);
    } catch (err: any) {
      toast({ title: err.message ?? "Failed to save units", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) setRows([mkUnitRow()]);
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-base font-semibold">Add Syllabus Units</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">Add multiple syllabus units at once — each row becomes one entry.</DialogDescription>
            </div>
            <NavHint />
          </div>
        </DialogHeader>

        {/* Header row */}
        <div className="grid border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500 select-none"
          style={{ gridTemplateColumns: "32px 1fr 1fr 1fr 1fr 64px 44px 32px" }}>
          <div className="px-2 py-2 border-r border-slate-200 text-center">#</div>
          <div className="px-2.5 py-2 border-r border-slate-200">Class <span className="text-red-400">*</span></div>
          <div className="px-2.5 py-2 border-r border-slate-200">Subject <span className="text-red-400">*</span></div>
          <div className="px-2.5 py-2 border-r border-slate-200">Unit Title <span className="text-red-400">*</span></div>
          <div className="px-2.5 py-2 border-r border-slate-200">Description</div>
          <div className="px-2.5 py-2 border-r border-slate-200 text-center">Sort</div>
          <div className="px-2.5 py-2 border-r border-slate-200 text-center">Active</div>
          <div />
        </div>

        {/* Rows */}
        <div ref={gridRef} className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {rows.map((row, ri) => {
            const isReady = row.classCode.trim() && row.subjectCode.trim() && row.title.trim();
            return (
              <div key={row._id}
                className={cn("grid items-center", ri % 2 === 0 ? "bg-white" : "bg-slate-50/40")}
                style={{ gridTemplateColumns: "32px 1fr 1fr 1fr 1fr 64px 44px 32px" }}>
                <div className="px-2 py-0 text-center text-[11px] text-slate-400 font-mono border-r border-slate-100 self-stretch flex items-center justify-center">{ri + 1}</div>
                {/* Class */}
                <div className="border-r border-slate-100 p-0">
                  <select data-r={ri} data-c={0} value={row.classCode}
                    onChange={e => upd(row._id, "classCode", e.target.value)} onKeyDown={e => nav(e, ri, 0)}
                    className={cn(CELL, "cursor-pointer", !row.classCode && "text-slate-300")}>
                    <option value="">Select class…</option>
                    {classes.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                {/* Subject */}
                <div className="border-r border-slate-100 p-0">
                  <select data-r={ri} data-c={1} value={row.subjectCode}
                    onChange={e => upd(row._id, "subjectCode", e.target.value)} onKeyDown={e => nav(e, ri, 1)}
                    className={cn(CELL, "cursor-pointer", !row.subjectCode && "text-slate-300")}>
                    <option value="">Select subject…</option>
                    {subjects.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {/* Title */}
                <div className="border-r border-slate-100 p-0">
                  <input data-r={ri} data-c={2} value={row.title} placeholder="Unit title…"
                    onChange={e => upd(row._id, "title", e.target.value)} onKeyDown={e => nav(e, ri, 2)}
                    className={CELL} />
                </div>
                {/* Description */}
                <div className="border-r border-slate-100 p-0">
                  <input data-r={ri} data-c={3} value={row.description} placeholder="Optional…"
                    onChange={e => upd(row._id, "description", e.target.value)} onKeyDown={e => nav(e, ri, 3)}
                    className={CELL} />
                </div>
                {/* Sort */}
                <div className="border-r border-slate-100 p-0">
                  <input data-r={ri} data-c={4} type="number" value={row.sortOrder}
                    onChange={e => upd(row._id, "sortOrder", e.target.value)} onKeyDown={e => nav(e, ri, 4)}
                    className={cn(CELL, "text-right")} />
                </div>
                {/* Active */}
                <div className="border-r border-slate-100 flex items-center justify-center">
                  <input type="checkbox" checked={row.active} onChange={e => upd(row._id, "active", e.target.checked)}
                    className="h-4 w-4 rounded accent-violet-600" />
                </div>
                {/* Remove */}
                <div className="flex items-center justify-center">
                  <button onClick={() => removeRow(row._id)} disabled={rows.length === 1}
                    className="h-7 w-7 flex items-center justify-center text-slate-300 hover:text-red-500 disabled:opacity-0 transition-colors rounded">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/60">
          <div className="px-4 py-2 border-b border-slate-100">
            <button onClick={addRow}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors font-medium">
              <Plus className="h-3.5 w-3.5" /> Add Row
            </button>
          </div>
          <div className="flex items-center justify-between px-6 py-3">
            <p className="text-xs text-slate-400">
              {ready.length === 0
                ? <span className="text-amber-500">Fill Class, Subject and Unit Title to enable save</span>
                : <><span className="font-semibold text-slate-700">{ready.length}</span> of {rows.length} rows ready</>}
            </p>
            <div className="flex gap-2.5">
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handleSave} disabled={busy || ready.length === 0}
                className="bg-violet-600 hover:bg-violet-700">
                {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Save {ready.length} Syllabus Unit{ready.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── BulkAddTopicsDialog ────────────────────────────────────────────────────────

type TopicRow = {
  _id: string;
  unitId: string;
  title: string;
  description: string;
  sortOrder: string;
  active: boolean;
};

function mkTopicRow(prev?: TopicRow): TopicRow {
  return {
    _id: crypto.randomUUID(),
    unitId: prev?.unitId ?? "",
    title: "",
    description: "",
    sortOrder: String(prev ? (Number(prev.sortOrder) + 1) : 0),
    active: true,
  };
}

interface UnitOption { id: string; classCode: string; subjectCode: string; title: string; subjectLabel?: string; classLabel?: string }

interface BulkAddTopicsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  units: UnitOption[];
  classes: { value: string; label: string }[];
  subjects: { value: string; label: string }[];
  onSaved: () => void;
}

export function BulkAddTopicsDialog({ open, onOpenChange, units, classes, subjects, onSaved }: BulkAddTopicsDialogProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<TopicRow[]>([mkTopicRow()]);
  const [filterClass, setFilterClass] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const classMap  = useMemo(() => Object.fromEntries(classes.map(c => [c.value, c.label])), [classes]);
  const subjectMap = useMemo(() => Object.fromEntries(subjects.map(s => [s.value, s.label])), [subjects]);

  const filteredUnits = useMemo(() => units.filter(u => {
    if (filterClass   && u.classCode   !== filterClass)   return false;
    if (filterSubject && u.subjectCode !== filterSubject) return false;
    return true;
  }), [units, filterClass, filterSubject]);

  function focusCell(ri: number, ci: number) {
    gridRef.current?.querySelector<HTMLElement>(`[data-r="${ri}"][data-c="${ci}"]`)?.focus();
  }
  function nav(e: React.KeyboardEvent, ri: number, ci: number) {
    if (e.key === "ArrowDown")  { e.preventDefault(); if (ri === rows.length - 1) { addRow(); setTimeout(() => focusCell(ri + 1, ci), 20); } else focusCell(ri + 1, ci); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); if (ri > 0) focusCell(ri - 1, ci); }
    else if (e.key === "Enter")  { e.preventDefault(); if (ri === rows.length - 1) { addRow(); setTimeout(() => focusCell(ri + 1, 0), 20); } else focusCell(ri + 1, 0); }
  }
  function upd(id: string, k: keyof TopicRow, v: string | boolean) {
    setRows(p => p.map(r => r._id === id ? { ...r, [k]: v } : r));
  }
  function addRow() {
    setRows(p => { const last = p[p.length - 1]; return [...p, mkTopicRow(last)]; });
  }
  function removeRow(id: string) {
    setRows(p => p.length > 1 ? p.filter(r => r._id !== id) : p);
  }

  const ready = useMemo(() => rows.filter(r => r.unitId && r.title.trim()), [rows]);

  async function handleSave() {
    if (!ready.length) { toast({ title: "Select a unit and fill Topic Title for at least one row", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const payload = ready.map(r => ({
        unitId:      r.unitId,
        title:       r.title.trim(),
        description: r.description.trim() || undefined,
        sortOrder:   Number(r.sortOrder) || 0,
        active:      r.active,
      }));
      const res = await apiFetch<{ saved: number }>("/api/admin/syllabus/topics/bulk", payload);
      toast({ title: `${res.saved} topic${res.saved !== 1 ? "s" : ""} added` });
      onSaved();
      onOpenChange(false);
      setRows([mkTopicRow()]);
    } catch (err: any) {
      toast({ title: err.message ?? "Failed to save topics", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) { setRows([mkTopicRow()]); setFilterClass(""); setFilterSubject(""); }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-base font-semibold">Add Topics / Lessons</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">Add multiple topics at once — each row becomes one lesson entry inside the selected unit.</DialogDescription>
            </div>
            <NavHint />
          </div>
          {/* Unit filter helpers */}
          <div className="flex gap-2 mt-3">
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
              className="h-8 rounded-md border border-slate-200 text-xs px-2 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300">
              <option value="">All classes</option>
              {classes.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}
              className="h-8 rounded-md border border-slate-200 text-xs px-2 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300">
              <option value="">All subjects</option>
              {subjects.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <span className="text-[11px] text-slate-400 self-center">Filter units in the dropdown below</span>
          </div>
        </DialogHeader>

        {/* Header row */}
        <div className="grid border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500 select-none"
          style={{ gridTemplateColumns: "32px 2fr 2fr 1fr 64px 44px 32px" }}>
          <div className="px-2 py-2 border-r border-slate-200 text-center">#</div>
          <div className="px-2.5 py-2 border-r border-slate-200">Unit <span className="text-red-400">*</span></div>
          <div className="px-2.5 py-2 border-r border-slate-200">Topic / Lesson Title <span className="text-red-400">*</span></div>
          <div className="px-2.5 py-2 border-r border-slate-200">Description</div>
          <div className="px-2.5 py-2 border-r border-slate-200 text-center">Sort</div>
          <div className="px-2.5 py-2 border-r border-slate-200 text-center">Active</div>
          <div />
        </div>

        {/* Rows */}
        <div ref={gridRef} className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {rows.map((row, ri) => {
            const selUnit = filteredUnits.find(u => u.id === row.unitId);
            return (
              <div key={row._id}
                className={cn("grid items-center", ri % 2 === 0 ? "bg-white" : "bg-slate-50/40")}
                style={{ gridTemplateColumns: "32px 2fr 2fr 1fr 64px 44px 32px" }}>
                <div className="px-2 py-0 text-center text-[11px] text-slate-400 font-mono border-r border-slate-100 self-stretch flex items-center justify-center">{ri + 1}</div>
                {/* Unit select */}
                <div className="border-r border-slate-100 p-0">
                  <select data-r={ri} data-c={0} value={row.unitId}
                    onChange={e => upd(row._id, "unitId", e.target.value)} onKeyDown={e => nav(e, ri, 0)}
                    className={cn(CELL, "cursor-pointer", !row.unitId && "text-slate-300")}>
                    <option value="">Select unit…</option>
                    {filteredUnits.map(u => (
                      <option key={u.id} value={u.id}>
                        {classMap[u.classCode] ?? u.classCode} · {subjectMap[u.subjectCode] ?? u.subjectCode} · {u.title}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Topic title */}
                <div className="border-r border-slate-100 p-0">
                  <input data-r={ri} data-c={1} value={row.title} placeholder="Topic or lesson title…"
                    onChange={e => upd(row._id, "title", e.target.value)} onKeyDown={e => nav(e, ri, 1)}
                    className={CELL} />
                </div>
                {/* Description */}
                <div className="border-r border-slate-100 p-0">
                  <input data-r={ri} data-c={2} value={row.description} placeholder="Optional…"
                    onChange={e => upd(row._id, "description", e.target.value)} onKeyDown={e => nav(e, ri, 2)}
                    className={CELL} />
                </div>
                {/* Sort */}
                <div className="border-r border-slate-100 p-0">
                  <input data-r={ri} data-c={3} type="number" value={row.sortOrder}
                    onChange={e => upd(row._id, "sortOrder", e.target.value)} onKeyDown={e => nav(e, ri, 3)}
                    className={cn(CELL, "text-right")} />
                </div>
                {/* Active */}
                <div className="border-r border-slate-100 flex items-center justify-center">
                  <input type="checkbox" checked={row.active} onChange={e => upd(row._id, "active", e.target.checked)}
                    className="h-4 w-4 rounded accent-violet-600" />
                </div>
                {/* Remove */}
                <div className="flex items-center justify-center">
                  <button onClick={() => removeRow(row._id)} disabled={rows.length === 1}
                    className="h-7 w-7 flex items-center justify-center text-slate-300 hover:text-red-500 disabled:opacity-0 transition-colors rounded">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/60">
          <div className="px-4 py-2 border-b border-slate-100">
            <button onClick={addRow}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors font-medium">
              <Plus className="h-3.5 w-3.5" /> Add Row
            </button>
          </div>
          <div className="flex items-center justify-between px-6 py-3">
            <p className="text-xs text-slate-400">
              {ready.length === 0
                ? <span className="text-amber-500">Select a unit and fill Topic Title to enable save</span>
                : <><span className="font-semibold text-slate-700">{ready.length}</span> of {rows.length} rows ready</>}
            </p>
            <div className="flex gap-2.5">
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handleSave} disabled={busy || ready.length === 0}
                className="bg-violet-600 hover:bg-violet-700">
                {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Save {ready.length} Topic{ready.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
