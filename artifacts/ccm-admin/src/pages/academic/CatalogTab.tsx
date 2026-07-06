import { useState, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Minus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type SelectOption = string | { value: string; label: string };

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "color" | "select";
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  inTable?: boolean;
  defaultValue?: string;
  options?: SelectOption[];
  emptyAsNull?: boolean;
  renderCell?: (item: CatalogItem) => React.ReactNode;
};

export type CatalogItem = {
  id: string;
  active: boolean;
  sortOrder: number;
  [key: string]: unknown;
};

type MutationLike<V> = {
  mutate: (vars: V, opts?: { onSuccess?: () => void; onError?: (err: unknown) => void }) => void;
  isPending: boolean;
};

interface CatalogTabProps {
  entityLabel: string;
  description: string;
  icon: LucideIcon;
  fields: FieldDef[];
  items: CatalogItem[] | undefined;
  isLoading: boolean;
  getName: (item: CatalogItem) => string;
  createMutation: MutationLike<{ data: any }>;
  updateMutation: MutationLike<{ id: string; data: any }>;
  deleteMutation: MutationLike<{ id: string }>;
  extraActions?: React.ReactNode;
}

type CatalogRow = {
  _rowId: string;
  values: Record<string, string>;
  active: boolean;
  sortOrder: string;
};

function mkCatalogRow(fields: FieldDef[]): CatalogRow {
  const values: Record<string, string> = {};
  for (const f of fields) values[f.key] = f.defaultValue ?? "";
  return { _rowId: crypto.randomUUID(), values, active: true, sortOrder: "0" };
}

function rowToInput(row: CatalogRow, fields: FieldDef[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = row.values[f.key] ?? "";
    if (f.type === "number") {
      const n = Number(raw);
      data[f.key] = Number.isFinite(n) ? Math.trunc(n) : 0;
    } else {
      const trimmed = raw.trim();
      data[f.key] = trimmed || (f.emptyAsNull ? null : undefined);
    }
  }
  data.active = row.active;
  const order = Number(row.sortOrder);
  data.sortOrder = Number.isFinite(order) ? Math.trunc(order) : 0;
  return data;
}

function cellValue(item: CatalogItem, f: FieldDef) {
  if (f.renderCell) return f.renderCell(item);
  const raw = item[f.key];
  if (raw === null || raw === undefined || raw === "") return <span className="text-muted-foreground">—</span>;
  if (f.type === "color") {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: String(raw) }} />
        <span className="font-mono text-xs">{String(raw)}</span>
      </span>
    );
  }
  if (f.type === "textarea") {
    return <span className="text-muted-foreground text-sm max-w-[320px] truncate inline-block align-bottom">{String(raw)}</span>;
  }
  return <span className={f.key === "" ? "font-medium" : ""}>{String(raw)}</span>;
}

export function CatalogTab({
  entityLabel, description, icon: Icon, fields, items, isLoading, getName,
  createMutation, updateMutation, deleteMutation, extraActions,
}: CatalogTabProps) {
  const { toast } = useToast();
  const tableFields = fields.filter((f) => f.inTable !== false);
  const colSpan = tableFields.length + 3;

  const [open, setOpen]         = useState(false);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [rows, setRows]         = useState<CatalogRow[]>([]);
  const [busy, setBusy]         = useState(false);
  const gridRef                 = useRef<HTMLDivElement>(null);

  function openCreate() {
    setEditItem(null);
    setRows([mkCatalogRow(fields)]);
    setOpen(true);
  }
  function openEdit(item: CatalogItem) {
    setEditItem(item);
    const values: Record<string, string> = {};
    for (const f of fields) {
      const raw = item[f.key];
      values[f.key] = raw === null || raw === undefined ? "" : String(raw);
    }
    setRows([{ _rowId: crypto.randomUUID(), values, active: item.active, sortOrder: String(item.sortOrder ?? 0) }]);
    setOpen(true);
  }
  function updVal(rowId: string, key: string, value: string) {
    setRows(p => p.map(r => r._rowId === rowId ? { ...r, values: { ...r.values, [key]: value } } : r));
  }
  function updRow(rowId: string, key: "active" | "sortOrder", value: string | boolean) {
    setRows(p => p.map(r => r._rowId === rowId ? { ...r, [key]: value } : r));
  }
  function addRow() { setRows(p => [...p, mkCatalogRow(fields)]); }
  function removeRow(rowId: string) { setRows(p => p.length > 1 ? p.filter(r => r._rowId !== rowId) : p); }
  function focusCell(ri: number, ci: number) {
    gridRef.current?.querySelector<HTMLElement>(`[data-r="${ri}"][data-c="${ci}"]`)?.focus();
  }
  function nav(e: React.KeyboardEvent, ri: number, ci: number) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (ri === rows.length - 1) { addRow(); setTimeout(() => focusCell(ri + 1, ci), 20); } else focusCell(ri + 1, ci); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (ri > 0) focusCell(ri - 1, ci); }
    else if (e.key === "Enter") { e.preventDefault(); if (ri === rows.length - 1) { addRow(); setTimeout(() => focusCell(ri + 1, 0), 20); } else focusCell(ri + 1, 0); }
  }

  function isRowReady(row: CatalogRow) {
    return fields.filter(f => f.required).every(f => row.values[f.key]?.trim());
  }
  const ready = rows.filter(isRowReady).length;

  async function handleSave() {
    const valid = rows.filter(isRowReady);
    if (!valid.length) {
      const req = fields.filter(f => f.required).map(f => f.label).join(", ");
      toast({ title: `Fill required fields: ${req}`, variant: "destructive" }); return;
    }
    setBusy(true);
    try {
      if (editItem) {
        await new Promise<void>((res, rej) =>
          updateMutation.mutate({ id: editItem.id, data: rowToInput(valid[0], fields) }, { onSuccess: res, onError: rej })
        );
        toast({ title: `${entityLabel} updated` });
      } else {
        for (const row of valid) {
          await new Promise<void>((res, rej) =>
            createMutation.mutate({ data: rowToInput(row, fields) }, { onSuccess: res, onError: rej })
          );
        }
        toast({ title: `${valid.length} ${entityLabel.toLowerCase()}${valid.length > 1 ? "s" : ""} added` });
      }
      setOpen(false);
    } catch (err: unknown) {
      const e = err as any;
      toast({ title: "Could not save", description: e?.data?.error ?? e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  const cell = "w-full h-9 px-2.5 text-sm bg-transparent border-0 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 transition-colors placeholder:text-slate-300";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {extraActions}
          <Button onClick={openCreate} size="sm" data-testid={`button-add-${entityLabel.toLowerCase().replace(/\s+/g, "-")}`}>
            <Plus className="mr-2 h-4 w-4" /> Add {entityLabel}
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[60px]">Order</TableHead>
                {tableFields.map((f) => <TableHead key={f.key}>{f.label}</TableHead>)}
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                    {tableFields.map((f) => <TableCell key={f.key}><Skeleton className="h-4 w-24" /></TableCell>)}
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-16 rounded-md ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : (items ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Icon className="h-10 w-10 mb-3 opacity-50" />
                      <p className="font-medium text-foreground">No {entityLabel.toLowerCase()} entries yet</p>
                      <p className="text-sm mt-1">Add one to get started.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                (items ?? []).map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="text-muted-foreground">{item.sortOrder}</TableCell>
                    {tableFields.map((f) => <TableCell key={f.key}>{cellValue(item, f)}</TableCell>)}
                    <TableCell>
                      {item.active
                        ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
                        : <Badge variant="secondary">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)} data-testid={`button-edit-${item.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid={`button-delete-${item.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete "{getName(item)}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the entry from the selectable list. Existing applications keep their stored values. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deleteMutation.mutate({ id: item.id }, { onSuccess: () => toast({ title: `${entityLabel} removed` }), onError: (err) => { const e = err as any; toast({ title: `Could not delete ${entityLabel.toLowerCase()}`, description: e?.data?.error ?? e?.message, variant: "destructive" }); } })}
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
              <h2 className="text-base font-bold text-slate-900">{editItem ? `Edit ${entityLabel}` : `Add ${entityLabel}s`}</h2>
              <p className="text-sm text-slate-500 mt-0.5">{editItem ? `Update this ${entityLabel.toLowerCase()}.` : `Add multiple ${entityLabel.toLowerCase()}s at once — each row becomes one entry.`}</p>
            </div>
            {!editItem && (
              <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-1.5 font-mono shrink-0 ml-4">
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">↑↓</span> rows &nbsp;
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">Tab</span> columns &nbsp;
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">Enter</span> next row
              </div>
            )}
          </div>

          <div className="overflow-x-auto max-h-[44vh] overflow-y-auto" ref={gridRef}>
            <table className="w-full text-sm border-collapse" style={{ minWidth: Math.max(700, fields.length * 130 + 200) }}>
              <colgroup>
                <col style={{ width: 36 }} />
                {fields.map(f => <col key={f.key} style={{ minWidth: f.type === "textarea" ? 200 : f.type === "color" ? 140 : f.type === "number" ? 90 : f.type === "select" ? 140 : 150 }} />)}
                <col style={{ width: 62 }} /><col style={{ width: 62 }} /><col style={{ width: 38 }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 border-b-2 border-slate-200 select-none">
                  <th className="py-2.5 text-center text-[10px] text-slate-400 border-r border-slate-200">#</th>
                  {fields.map(f => (
                    <th key={f.key} className="px-2.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-r border-slate-200 whitespace-nowrap">
                      {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                    </th>
                  ))}
                  <th className="px-2.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-r border-slate-200 whitespace-nowrap">Sort</th>
                  <th className="px-2.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-r border-slate-200 whitespace-nowrap">Active</th>
                  <th className="border-l border-slate-200" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={row._rowId} className={cn("border-b border-slate-100", ri % 2 === 0 ? "bg-white" : "bg-slate-50/30")}>
                    <td className="text-center text-[11px] text-slate-400 border-r border-slate-100 select-none font-mono">{ri + 1}</td>
                    {fields.map((f, ci) => (
                      <td key={f.key} className="p-0 border-r border-slate-100">
                        {f.type === "color" ? (
                          <div className="flex items-center gap-1 px-1 h-9">
                            <input type="color" value={row.values[f.key] || "#000000"}
                              onChange={e => updVal(row._rowId, f.key, e.target.value)}
                              className="h-7 w-8 rounded border border-slate-200 cursor-pointer p-0.5 bg-white" />
                            <input data-r={ri} data-c={ci} type="text" value={row.values[f.key]} placeholder={f.placeholder ?? "#000000"}
                              onChange={e => updVal(row._rowId, f.key, e.target.value)} onKeyDown={e => nav(e, ri, ci)}
                              className={cn(cell, "font-mono text-xs")} />
                          </div>
                        ) : f.type === "select" ? (
                          <select
                            data-r={ri} data-c={ci}
                            value={row.values[f.key] ?? f.defaultValue ?? ""}
                            onChange={e => updVal(row._rowId, f.key, e.target.value)}
                            className="w-full h-9 px-2.5 text-sm bg-transparent border-0 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 transition-colors cursor-pointer capitalize"
                          >
                            {(f.options ?? []).map(opt => {
                              const v = typeof opt === "string" ? opt : opt.value;
                              const l = typeof opt === "string" ? opt : opt.label;
                              return <option key={v} value={v} className="capitalize">{l}</option>;
                            })}
                          </select>
                        ) : (
                          <input
                            data-r={ri} data-c={ci}
                            type={f.type === "number" ? "number" : "text"}
                            min={f.type === "number" ? 0 : undefined}
                            value={row.values[f.key] ?? ""}
                            placeholder={f.placeholder}
                            onChange={e => updVal(row._rowId, f.key, e.target.value)}
                            onKeyDown={e => nav(e, ri, ci)}
                            className={cell}
                          />
                        )}
                      </td>
                    ))}
                    <td className="p-0 border-r border-slate-100">
                      <input type="number" min={0} value={row.sortOrder}
                        onChange={e => updRow(row._rowId, "sortOrder", e.target.value)}
                        className={cn(cell, "text-right")} />
                    </td>
                    <td className="border-r border-slate-100 text-center align-middle">
                      <input type="checkbox" checked={row.active}
                        onChange={e => updRow(row._rowId, "active", e.target.checked)}
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

          {!editItem && (
            <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60">
              <button onClick={addRow} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors font-medium">
                <Plus className="h-3.5 w-3.5" /> Add Row
              </button>
            </div>
          )}

          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white">
            <p className="text-xs text-slate-400">
              {ready > 0 ? <><span className="font-semibold text-slate-700">{ready}</span> of {rows.length} rows ready</> : <span className="text-amber-500">Fill required fields to enable save</span>}
            </p>
            <div className="flex gap-2.5">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handleSave} disabled={busy || ready === 0} data-testid="button-save-catalog">
                {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                {editItem ? "Save Changes" : `Save ${ready} ${entityLabel}${ready !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
