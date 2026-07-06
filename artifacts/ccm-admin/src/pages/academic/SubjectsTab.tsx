import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminSubjects,
  getListAdminSubjectsQueryKey,
  getListActiveSubjectsQueryKey,
  useCreateAdminSubject,
  useUpdateAdminSubject,
  useDeleteAdminSubject,
  type Subject,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { BookOpen, Plus, Minus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SUBJECT_TYPES = [
  { value: "theory",    label: "Theory"    },
  { value: "practical", label: "Practical" },
  { value: "combined",  label: "Combined"  },
];

const TYPE_COLORS: Record<string, string> = {
  theory:    "bg-blue-100 text-blue-800",
  practical: "bg-amber-100 text-amber-800",
  combined:  "bg-purple-100 text-purple-800",
};

type SubjectRow = {
  _rowId: string;
  name: string;
  code: string;
  type: string;
  maxMarks: string;
  passMarks: string;
  sortOrder: string;
  isElective: boolean;
  active: boolean;
};

function mkSubjectRow(): SubjectRow {
  return { _rowId: crypto.randomUUID(), name: "", code: "", type: "theory", maxMarks: "100", passMarks: "33", sortOrder: "0", isElective: false, active: true };
}

function subjectPayload(row: SubjectRow) {
  return {
    name: row.name.trim(),
    code: row.code.trim(),
    type: row.type as "theory" | "practical" | "combined",
    maxMarks: Number(row.maxMarks) || 100,
    passMarks: Number(row.passMarks) || 33,
    sortOrder: Number(row.sortOrder) || 0,
    isElective: row.isElective,
    active: row.active,
  };
}

export function SubjectsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: subjects, isLoading } = useListAdminSubjects();

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListAdminSubjectsQueryKey() });
    qc.invalidateQueries({ queryKey: getListActiveSubjectsQueryKey() });
  }

  const createMutation = useCreateAdminSubject();
  const updateMutation = useUpdateAdminSubject();
  const deleteMutation = useDeleteAdminSubject({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Subject removed" }); },
      onError: () => toast({ title: "Could not delete", variant: "destructive" }),
    },
  });

  const [open, setOpen]         = useState(false);
  const [editSubj, setEditSubj] = useState<Subject | null>(null);
  const [rows, setRows]         = useState<SubjectRow[]>([mkSubjectRow()]);
  const [busy, setBusy]         = useState(false);
  const gridRef                 = useRef<HTMLDivElement>(null);

  function openCreate() { setEditSubj(null); setRows([mkSubjectRow()]); setOpen(true); }
  function openEdit(s: Subject) {
    setEditSubj(s);
    setRows([{ _rowId: crypto.randomUUID(), name: s.name, code: s.code, type: s.type, maxMarks: String(s.maxMarks), passMarks: String(s.passMarks), sortOrder: String(s.sortOrder), isElective: s.isElective, active: s.active }]);
    setOpen(true);
  }
  function upd(rowId: string, k: keyof SubjectRow, v: string | boolean) {
    setRows(p => p.map(r => r._rowId === rowId ? { ...r, [k]: v } : r));
  }
  function addRow() { setRows(p => [...p, mkSubjectRow()]); }
  function removeRow(rowId: string) { setRows(p => p.length > 1 ? p.filter(r => r._rowId !== rowId) : p); }
  function focusCell(ri: number, ci: number) {
    gridRef.current?.querySelector<HTMLElement>(`[data-r="${ri}"][data-c="${ci}"]`)?.focus();
  }
  function nav(e: React.KeyboardEvent, ri: number, ci: number) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (ri === rows.length - 1) { addRow(); setTimeout(() => focusCell(ri + 1, ci), 20); } else focusCell(ri + 1, ci); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (ri > 0) focusCell(ri - 1, ci); }
    else if (e.key === "Enter") { e.preventDefault(); if (ri === rows.length - 1) { addRow(); setTimeout(() => focusCell(ri + 1, 0), 20); } else focusCell(ri + 1, 0); }
  }

  async function handleSave() {
    const valid = rows.filter(r => r.name.trim() && r.code.trim());
    if (!valid.length) { toast({ title: "Fill Name and Code for at least one row", variant: "destructive" }); return; }
    setBusy(true);
    try {
      if (editSubj) {
        await updateMutation.mutateAsync({ id: editSubj.id, data: subjectPayload(valid[0]) });
        toast({ title: "Subject updated" });
      } else {
        for (const row of valid) await createMutation.mutateAsync({ data: subjectPayload(row) });
        toast({ title: `${valid.length} subject${valid.length > 1 ? "s" : ""} added` });
      }
      invalidate(); setOpen(false);
    } catch {
      toast({ title: "Could not save", description: "Check the code is unique.", variant: "destructive" });
    } finally { setBusy(false); }
  }

  const cell = "w-full h-9 px-2.5 text-sm bg-transparent border-0 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 transition-colors placeholder:text-slate-300";
  const ready = rows.filter(r => r.name.trim() && r.code.trim()).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Define subjects offered at the college. Each subject has a stable{" "}
          <span className="font-mono">code</span> used for timetabling and results. Assign subjects to classes in the <strong>Class/Program Subjects</strong> tab.
        </p>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-2 h-4 w-4" /> Add Subject
        </Button>
      </div>

      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[60px]">Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Elective</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}
                  </TableRow>
                ))
              ) : (subjects ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <BookOpen className="h-10 w-10 mb-3 opacity-50" />
                      <p className="font-medium text-foreground">No subjects yet</p>
                      <p className="text-sm mt-1">Add the first subject to get started.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                (subjects ?? []).map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="text-muted-foreground">{s.sortOrder}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="font-mono text-xs">{s.code}</TableCell>
                    <TableCell>
                      <Badge className={TYPE_COLORS[s.type] ?? "bg-gray-100 text-gray-800"} variant="secondary">
                        {SUBJECT_TYPES.find((t) => t.value === s.type)?.label ?? s.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {s.isElective
                        ? <Badge variant="outline" className="text-indigo-600 border-indigo-300">Elective</Badge>
                        : <span className="text-muted-foreground text-sm">Core</span>}
                    </TableCell>
                    <TableCell>
                      {s.active
                        ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
                        : <Badge variant="secondary">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete "{s.name}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the subject from the system. Any class-subject assignments will be removed automatically. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deleteMutation.mutate({ id: s.id })}
                              >Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Spreadsheet Dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[1100px] w-[96vw] p-0 gap-0 overflow-hidden">

          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">{editSubj ? "Edit Subject" : "Add Subjects"}</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {editSubj ? "Update subject details. Code is locked once created." : "Add multiple subjects at once — each row becomes one subject."}
              </p>
            </div>
            {!editSubj && (
              <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-1.5 font-mono shrink-0 ml-4">
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">↑↓</span> rows &nbsp;
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">Tab</span> columns &nbsp;
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">Enter</span> next row
              </div>
            )}
          </div>

          <div className="overflow-x-auto max-h-[44vh] overflow-y-auto" ref={gridRef}>
            <table className="w-full text-sm border-collapse" style={{ minWidth: 704 }}>
              <colgroup>
                <col style={{ width: 36 }} />
                <col style={{ minWidth: 190 }} /><col style={{ minWidth: 130 }} /><col style={{ minWidth: 130 }} />
                <col style={{ width: 62 }} />
                <col style={{ width: 70 }} /><col style={{ width: 62 }} /><col style={{ width: 38 }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 border-b-2 border-slate-200 select-none">
                  <th className="py-2.5 text-center text-[10px] text-slate-400 border-r border-slate-200">#</th>
                  {[
                    { l: "Name", req: true }, { l: "Code", req: true }, { l: "Type" },
                    { l: "Sort" }, { l: "Elective" }, { l: "Active" },
                  ].map(({ l, req }) => (
                    <th key={l} className="px-2.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-r border-slate-200 last:border-r-0 whitespace-nowrap">
                      {l}{req && <span className="text-red-400 ml-0.5">*</span>}
                    </th>
                  ))}
                  <th className="border-l border-slate-200" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={row._rowId} className={cn("border-b border-slate-100", ri % 2 === 0 ? "bg-white" : "bg-slate-50/30")}>
                    <td className="text-center text-[11px] text-slate-400 border-r border-slate-100 select-none font-mono">{ri + 1}</td>
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={0} value={row.name} placeholder="e.g. Mathematics"
                        onChange={e => upd(row._rowId, "name", e.target.value)} onKeyDown={e => nav(e, ri, 0)}
                        className={cell} />
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={1} value={row.code} placeholder="e.g. maths"
                        onChange={e => upd(row._rowId, "code", e.target.value)} onKeyDown={e => nav(e, ri, 1)}
                        disabled={!!editSubj} className={cn(cell, "font-mono", editSubj && "opacity-40 cursor-not-allowed")} />
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <select data-r={ri} data-c={2} value={row.type}
                        onChange={e => upd(row._rowId, "type", e.target.value)}
                        className={cn(cell, "cursor-pointer pr-1")}>
                        {SUBJECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={3} type="number" min={0} value={row.sortOrder}
                        onChange={e => upd(row._rowId, "sortOrder", e.target.value)} onKeyDown={e => nav(e, ri, 3)}
                        className={cn(cell, "text-right")} />
                    </td>
                    <td className="border-r border-slate-100 text-center align-middle">
                      <input data-r={ri} data-c={4} type="checkbox" checked={row.isElective}
                        onChange={e => upd(row._rowId, "isElective", e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 accent-indigo-600 cursor-pointer" />
                    </td>
                    <td className="border-r border-slate-100 text-center align-middle">
                      <input data-r={ri} data-c={5} type="checkbox" checked={row.active}
                        onChange={e => upd(row._rowId, "active", e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 accent-emerald-600 cursor-pointer" />
                    </td>
                    <td className="text-center align-middle">
                      <button onClick={() => removeRow(row._rowId)} disabled={rows.length === 1}
                        className="h-9 w-9 flex items-center justify-center mx-auto text-slate-300 hover:text-red-500 disabled:opacity-0 disabled:cursor-not-allowed transition-colors">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!editSubj && (
            <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60">
              <button onClick={addRow} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors font-medium">
                <Plus className="h-3.5 w-3.5" /> Add Row
              </button>
            </div>
          )}

          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white">
            <p className="text-xs text-slate-400">
              {ready > 0 ? <><span className="font-semibold text-slate-700">{ready}</span> of {rows.length} rows ready</> : <span className="text-amber-500">Fill Name + Code to enable save</span>}
            </p>
            <div className="flex gap-2.5">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handleSave} disabled={busy || ready === 0}>
                {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                {editSubj ? "Save Changes" : `Save ${ready} Subject${ready !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
