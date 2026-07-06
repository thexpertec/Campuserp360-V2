import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminClasses,
  getListAdminClassesQueryKey,
  getListActiveClassesQueryKey,
  useCreateAdminClass,
  useUpdateAdminClass,
  useDeleteAdminClass,
  useListAdminClassCategories,
  useListAdminAcademicYears,
  useListAdminFeeTypes,
  type ClassRecord,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { GraduationCap, Plus, Minus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const NO_CATEGORY = "__none__";

type ClassRow = {
  _rowId: string;
  name: string;
  code: string;
  categoryId: string;
  feeType: string;
  eligibility: string;
  seats: string;
  sortOrder: string;
  active: boolean;
};

function mkClassRow(): ClassRow {
  return { _rowId: crypto.randomUUID(), name: "", code: "", categoryId: NO_CATEGORY, feeType: "", eligibility: "", seats: "0", sortOrder: "0", active: true };
}

function classPayload(row: ClassRow, academicYearIds: string[]) {
  const seats = Number(row.seats);
  const sortOrder = Number(row.sortOrder);
  return {
    code: row.code.trim(),
    name: row.name.trim(),
    categoryId: row.categoryId === NO_CATEGORY ? null : row.categoryId,
    feeType: row.feeType.trim() || undefined,
    eligibility: row.eligibility.trim() || undefined,
    seats: Number.isFinite(seats) ? Math.trunc(seats) : 0,
    active: row.active,
    sortOrder: Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0,
    academicYearIds,
  };
}

export function ClassesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: classes, isLoading } = useListAdminClasses();
  const { data: categories = [] } = useListAdminClassCategories();
  const { data: years = [] } = useListAdminAcademicYears();
  const { data: feeTypes = [] } = useListAdminFeeTypes();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListAdminClassesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListActiveClassesQueryKey() });
  }

  const createMutation = useCreateAdminClass();
  const updateMutation = useUpdateAdminClass();
  const deleteMutation = useDeleteAdminClass({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Class/Program removed" }); },
      onError: () => toast({ title: "Could not delete", variant: "destructive" }),
    },
  });

  const [open, setOpen]       = useState(false);
  const [editCls, setEditCls] = useState<ClassRecord | null>(null);
  const [rows, setRows]       = useState<ClassRow[]>([mkClassRow()]);
  const [yearIds, setYearIds] = useState<string[]>([]);
  const [busy, setBusy]       = useState(false);
  const gridRef               = useRef<HTMLDivElement>(null);

  function openCreate() { setEditCls(null); setRows([mkClassRow()]); setYearIds([]); setOpen(true); }
  function openEdit(c: ClassRecord) {
    setEditCls(c);
    setRows([{ _rowId: crypto.randomUUID(), name: c.name, code: c.code, categoryId: c.categoryId ?? NO_CATEGORY, feeType: c.feeType ?? "", eligibility: c.eligibility ?? "", seats: String(c.seats ?? 0), sortOrder: String(c.sortOrder ?? 0), active: c.active }]);
    setYearIds(c.academicYears.map((y) => y.id));
    setOpen(true);
  }
  function upd(rowId: string, k: keyof ClassRow, v: string | boolean) {
    setRows(p => p.map(r => r._rowId === rowId ? { ...r, [k]: v } : r));
  }
  function toggleYear(id: string) { setYearIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); }
  function addRow() { setRows(p => [...p, mkClassRow()]); }
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
      if (editCls) {
        await updateMutation.mutateAsync({ id: editCls.id, data: classPayload(valid[0], yearIds) });
        toast({ title: "Class/Program updated" });
      } else {
        for (const row of valid) await createMutation.mutateAsync({ data: classPayload(row, yearIds) });
        toast({ title: `${valid.length} class${valid.length > 1 ? "es" : ""} added` });
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
          Classes use a stable code (e.g. <span className="font-mono">class-9</span>) that links to applications. Configure category, fee, eligibility, seats and the academic years each class is offered in.
        </p>
        <Button onClick={openCreate} size="sm" data-testid="button-add-class">
          <Plus className="mr-2 h-4 w-4" /> Add Class
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
                <TableHead>Category</TableHead>
                <TableHead>Fee Type</TableHead>
                <TableHead>Eligibility</TableHead>
                <TableHead className="text-right">Seats</TableHead>
                <TableHead>Years</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 10 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}
                  </TableRow>
                ))
              ) : (classes ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <GraduationCap className="h-10 w-10 mb-3 opacity-50" />
                      <p className="font-medium text-foreground">No classes yet</p>
                      <p className="text-sm mt-1">Add a class to get started.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                (classes ?? []).map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="text-muted-foreground">{c.sortOrder}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell>{c.categoryName || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{c.feeType || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[220px] truncate">{c.eligibility || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{c.seats}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {c.academicYears.length === 0 ? <span className="text-muted-foreground text-sm">—</span>
                          : c.academicYears.map((y) => <Badge key={y.id} variant="outline" className="text-xs">{y.name}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.active
                        ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
                        : <Badge variant="secondary">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)} data-testid={`button-edit-${c.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid={`button-delete-${c.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete "{c.name}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Existing applications keep their stored class code ({c.code}); this only removes it from the managed class list. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deleteMutation.mutate({ id: c.id })}
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
        <DialogContent className="max-w-[1120px] w-[96vw] p-0 gap-0 overflow-hidden">

          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">{editCls ? "Edit Class" : "Add Classes"}</h2>
              <p className="text-sm text-slate-500 mt-0.5">{editCls ? "Update the class configuration." : "Add multiple classes at once — each row becomes one class."}</p>
            </div>
            {!editCls && (
              <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-1.5 font-mono shrink-0 ml-4">
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">↑↓</span> rows &nbsp;
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">Tab</span> columns &nbsp;
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">Enter</span> next row
              </div>
            )}
          </div>

          {/* Academic Years — global header for batch */}
          {(years as any[]).length > 0 && (
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/60">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Academic Years Offered</p>
              <div className="flex flex-wrap gap-3">
                {(years as any[]).map((y: any) => (
                  <label key={y.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={yearIds.includes(y.id)} onCheckedChange={() => toggleYear(y.id)} />{y.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Grid */}
          <div className="overflow-x-auto max-h-[44vh] overflow-y-auto" ref={gridRef}>
            <table className="w-full text-sm border-collapse" style={{ minWidth: 860 }}>
              <colgroup>
                <col style={{ width: 36 }} />
                <col style={{ minWidth: 180 }} /><col style={{ minWidth: 120 }} /><col style={{ minWidth: 140 }} />
                <col style={{ minWidth: 110 }} /><col style={{ minWidth: 170 }} /><col style={{ width: 72 }} />
                <col style={{ width: 62 }} /><col style={{ width: 62 }} /><col style={{ width: 38 }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 border-b-2 border-slate-200 select-none">
                  <th className="py-2.5 text-center text-[10px] text-slate-400 border-r border-slate-200">#</th>
                  {[{ l: "Name", req: true }, { l: "Code", req: true }, { l: "Category" }, { l: "Fee Type" }, { l: "Eligibility" }, { l: "Seats" }, { l: "Sort" }, { l: "Active" }].map(({ l, req }) => (
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
                      <input data-r={ri} data-c={0} value={row.name} placeholder="e.g. Class IX"
                        onChange={e => upd(row._rowId, "name", e.target.value)} onKeyDown={e => nav(e, ri, 0)}
                        className={cell} />
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={1} value={row.code} placeholder="class-9"
                        onChange={e => upd(row._rowId, "code", e.target.value)} onKeyDown={e => nav(e, ri, 1)}
                        disabled={!!editCls} className={cn(cell, "font-mono", editCls && "opacity-40 cursor-not-allowed")} />
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <select data-r={ri} data-c={2} value={row.categoryId}
                        onChange={e => upd(row._rowId, "categoryId", e.target.value)}
                        className={cn(cell, "cursor-pointer pr-1")}>
                        <option value={NO_CATEGORY}>No category</option>
                        {(categories as any[]).map((cat: any) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </select>
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <select data-r={ri} data-c={3} value={row.feeType}
                        onChange={e => upd(row._rowId, "feeType", e.target.value)}
                        className={cn(cell, "cursor-pointer pr-1")}>
                        <option value="">— None —</option>
                        {(feeTypes as any[]).map((ft: any) => <option key={ft.id} value={ft.name}>{ft.name}</option>)}
                      </select>
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={4} value={row.eligibility} placeholder="Passed Class VIII"
                        onChange={e => upd(row._rowId, "eligibility", e.target.value)} onKeyDown={e => nav(e, ri, 4)}
                        className={cell} />
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={5} type="number" min={0} value={row.seats}
                        onChange={e => upd(row._rowId, "seats", e.target.value)} onKeyDown={e => nav(e, ri, 5)}
                        className={cn(cell, "text-right")} />
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={6} type="number" min={0} value={row.sortOrder}
                        onChange={e => upd(row._rowId, "sortOrder", e.target.value)} onKeyDown={e => nav(e, ri, 6)}
                        className={cn(cell, "text-right")} />
                    </td>
                    <td className="border-r border-slate-100 text-center align-middle">
                      <input data-r={ri} data-c={7} type="checkbox" checked={row.active}
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

          {!editCls && (
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
              <Button onClick={handleSave} disabled={busy || ready === 0} data-testid="button-save-class">
                {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                {editCls ? "Save Changes" : `Save ${ready} Class${ready !== 1 ? "es" : ""}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
