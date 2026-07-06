import { useState, useRef, useCallback } from "react";
import { formatCurrency } from "@/lib/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, Package, Image as ImageIcon, Upload, ListPlus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type Cat, CAT_QUERY_KEY } from "./catUtils";

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

interface Unit { id: string; name: string; symbol: string; }
interface Item {
  id: string; name: string; sku: string | null; imageUrl: string | null;
  categoryId: string | null; unitId: string | null;
  department: string | null; storeName: string | null;
  currentStock: number; reorderLevel: number; unitPrice: string;
  description: string | null; active: boolean;
  unitName: string | null; unitSymbol: string | null;
}

type F = {
  name: string; sku: string; imageUrl: string;
  categoryId: string; unitId: string;
  department: string; storeName: string;
  currentStock: string; reorderLevel: string; unitPrice: string;
  description: string;
};

const empty = (): F => ({ name: "", sku: "", imageUrl: "", categoryId: "__none__", unitId: "__none__", department: "", storeName: "", currentStock: "0", reorderLevel: "5", unitPrice: "0", description: "" });
const toForm = (r: Item): F => ({
  name: r.name, sku: r.sku ?? "", imageUrl: r.imageUrl ?? "",
  categoryId: r.categoryId ?? "__none__", unitId: r.unitId ?? "__none__",
  department: r.department ?? "", storeName: r.storeName ?? "",
  currentStock: String(r.currentStock), reorderLevel: String(r.reorderLevel),
  unitPrice: r.unitPrice ?? "0", description: r.description ?? "",
});
const toBody = (f: F) => ({
  name: f.name.trim(),
  sku: f.sku.trim() || null,
  imageUrl: f.imageUrl.trim() || null,
  categoryId: f.categoryId === "__none__" ? null : f.categoryId,
  unitId: f.unitId === "__none__" ? null : f.unitId,
  department: f.department.trim() || null,
  storeName: f.storeName.trim() || null,
  currentStock: Number(f.currentStock) || 0,
  reorderLevel: Number(f.reorderLevel) || 5,
  unitPrice: f.unitPrice || "0",
  description: f.description.trim() || null,
});

const fmtMoney = (v: string | number | null) => {
  const n = Number(v ?? 0);
  return isNaN(n) ? "—" : formatCurrency(n);
};

// ── Mode toggle pill ──────────────────────────────────────────────────────────
function ModePill({ mode, onChange }: { mode: "single" | "bulk"; onChange: (m: "single" | "bulk") => void }) {
  return (
    <div className="flex items-center gap-0 rounded-lg border border-border bg-muted/40 p-0.5 w-fit">
      <button type="button" onClick={() => onChange("single")}
        className={cn("flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
          mode === "single" ? "bg-white text-slate-800 shadow-sm" : "text-muted-foreground hover:text-foreground")}>
        <Pencil className="h-3 w-3" /> Single
      </button>
      <button type="button" onClick={() => onChange("bulk")}
        className={cn("flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
          mode === "bulk" ? "bg-white text-slate-800 shadow-sm" : "text-muted-foreground hover:text-foreground")}>
        <ListPlus className="h-3 w-3" /> Bulk
      </button>
    </div>
  );
}

// ── Cascading category picker ─────────────────────────────────────────────────
function CategoryPicker({ cats, value, onChange }: { cats: Cat[]; value: string; onChange: (id: string) => void }) {
  const catMap = new Map(cats.map(c => [c.id, c]));
  const mains = cats.filter(c => !c.parentId);
  const subs  = (parentId: string) => cats.filter(c => c.parentId === parentId);

  const resolve = (id: string | null): { main: string; sub: string; leaf: string } => {
    if (!id || id === "__none__") return { main: "__none__", sub: "__none__", leaf: "__none__" };
    const cat = catMap.get(id);
    if (!cat) return { main: "__none__", sub: "__none__", leaf: "__none__" };
    if (!cat.parentId) return { main: cat.id, sub: "__none__", leaf: "__none__" };
    const parent = catMap.get(cat.parentId);
    if (!parent) return { main: "__none__", sub: cat.id, leaf: "__none__" };
    if (!parent.parentId) return { main: parent.id, sub: cat.id, leaf: "__none__" };
    const grandparent = catMap.get(parent.parentId);
    if (!grandparent) return { main: "__none__", sub: "__none__", leaf: cat.id };
    return { main: grandparent.id, sub: parent.id, leaf: cat.id };
  };

  const sel = resolve(value === "__none__" ? null : value);
  const [mainId, setMainId] = useState<string>(sel.main);
  const [subId,  setSubId]  = useState<string>(sel.sub);
  const [leafId, setLeafId] = useState<string>(sel.leaf);

  const subList  = mainId !== "__none__" ? subs(mainId) : [];
  const leafList = subId  !== "__none__" ? subs(subId)  : [];

  function pickMain(id: string) { setMainId(id); setSubId("__none__"); setLeafId("__none__"); onChange(id === "__none__" ? "__none__" : id); }
  function pickSub(id: string)  { setSubId(id); setLeafId("__none__"); onChange(id === "__none__" ? mainId : id); }
  function pickLeaf(id: string) { setLeafId(id); onChange(id === "__none__" ? subId : id); }

  return (
    <div className="grid grid-cols-3 gap-2">
      <div>
        <Label className="mb-1 block text-xs">Main Category</Label>
        <Select value={mainId} onValueChange={pickMain}>
          <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {mains.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1 block text-xs">Sub-category</Label>
        <Select value={subId} onValueChange={pickSub} disabled={subList.length === 0}>
          <SelectTrigger className="text-xs h-9"><SelectValue placeholder={subList.length === 0 ? "No subs" : "Select…"} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {subList.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1 block text-xs">3rd Level</Label>
        <Select value={leafId} onValueChange={pickLeaf} disabled={leafList.length === 0}>
          <SelectTrigger className="text-xs h-9"><SelectValue placeholder={leafList.length === 0 ? "No 3rd level" : "Select…"} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {leafList.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ── Category breadcrumb helper ────────────────────────────────────────────────
function useCatBreadcrumb(cats: Cat[]) {
  const catMap = new Map(cats.map(c => [c.id, c]));
  return (categoryId: string | null): { main: string; sub: string; leaf: string } => {
    if (!categoryId) return { main: "", sub: "", leaf: "" };
    const cat = catMap.get(categoryId);
    if (!cat) return { main: "", sub: "", leaf: "" };
    if (!cat.parentId) return { main: cat.name, sub: "", leaf: "" };
    const parent = catMap.get(cat.parentId);
    if (!parent) return { main: "", sub: cat.name, leaf: "" };
    if (!parent.parentId) return { main: parent.name, sub: cat.name, leaf: "" };
    const grandparent = catMap.get(parent.parentId);
    return { main: grandparent?.name ?? "", sub: parent.name, leaf: cat.name };
  };
}

// ── Image upload ──────────────────────────────────────────────────────────────
function ImageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target?.result as string ?? "");
    reader.readAsDataURL(file);
  }
  return (
    <div className="space-y-2">
      <Label>Item Image</Label>
      {value ? (
        <div className="relative w-20 h-20 rounded-lg border border-border overflow-hidden group">
          <img src={value} alt="preview" className="w-full h-full object-cover" />
          <button type="button" onClick={() => onChange("")}
            className="absolute inset-0 bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">Remove</button>
        </div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-xs text-slate-500 hover:bg-slate-50 transition-colors">
          <Upload className="h-3.5 w-3.5" /> Upload image
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <Input value={value.startsWith("data:") ? "" : value} onChange={e => onChange(e.target.value)} placeholder="or paste image URL…" className="text-xs" />
    </div>
  );
}

// ── Bulk row type ─────────────────────────────────────────────────────────────
let _rowId = 0;
type BulkRow = { _id: number; name: string; sku: string; currentStock: string; unitPrice: string; reorderLevel: string; };
const emptyBulkRow = (): BulkRow => ({ _id: ++_rowId, name: "", sku: "", currentStock: "0", unitPrice: "0", reorderLevel: "5" });

// ── Shared settings for bulk mode ─────────────────────────────────────────────
type BulkShared = { categoryId: string; unitId: string; department: string; storeName: string; };
const emptyShared = (): BulkShared => ({ categoryId: "__none__", unitId: "__none__", department: "", storeName: "" });

// ── Main component ────────────────────────────────────────────────────────────
const ITEMS_KEY = ["store-items-list"];
const UNITS_KEY = ["store-units-list"];

export function StoreItemsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch]     = useState("");
  const [open, setOpen]         = useState(false);
  const [editing, setEditing]   = useState<Item | null>(null);
  const [form, setForm]         = useState<F>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState("__none__");

  // Bulk mode state
  const [mode, setMode]           = useState<"single" | "bulk">("single");
  const [bulkRows, setBulkRows]   = useState<BulkRow[]>(() => [emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
  const [bulkShared, setBulkShared] = useState<BulkShared>(emptyShared());
  const [bulkPending, setBulkPending] = useState(false);

  const inv = () => qc.invalidateQueries({ queryKey: ITEMS_KEY });

  const { data: cats = [] } = useQuery<Cat[]>({
    queryKey: CAT_QUERY_KEY,
    queryFn:  () => apiFetch("/api/admin/store/item-categories"),
    staleTime: 30_000,
  });
  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: UNITS_KEY,
    queryFn:  () => apiFetch("/api/admin/store/units"),
    staleTime: 30_000,
  });
  const { data: items = [], isLoading } = useQuery<Item[]>({
    queryKey: ITEMS_KEY,
    queryFn:  () => apiFetch("/api/admin/store/items"),
    staleTime: 10_000,
  });

  const getBreadcrumb = useCatBreadcrumb(cats);

  const saveMut = useMutation({
    mutationFn: (f: F) => editing
      ? apiFetch(`/api/admin/store/items/${editing.id}`, { method: "PUT", body: JSON.stringify(toBody(f)) })
      : apiFetch("/api/admin/store/items", { method: "POST", body: JSON.stringify(toBody(f)) }),
    onSuccess: () => { inv(); setOpen(false); toast({ title: editing ? "Item updated" : "Item added" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/store/items/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDeleteId(null); toast({ title: "Item deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function setF(k: keyof F, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function openAdd() {
    setEditing(null); setForm(empty());
    setMode("single");
    setBulkRows([emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
    setBulkShared(emptyShared());
    setOpen(true);
  }

  // ── Bulk handlers ────────────────────────────────────────────────────────────
  function updateRow(id: number, key: keyof Omit<BulkRow, "_id">, value: string) {
    setBulkRows(rows => rows.map(r => r._id === id ? { ...r, [key]: value } : r));
  }
  function removeRow(id: number) {
    setBulkRows(rows => rows.filter(r => r._id !== id));
  }
  function addRow() {
    setBulkRows(rows => [...rows, emptyBulkRow()]);
  }

  // Paste handler — supports pasting a tab/newline grid (Name [Tab SKU [Tab Stock [Tab Price]]])
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>, rowId: number, field: keyof Omit<BulkRow, "_id">) => {
    const text = e.clipboardData.getData("text");
    const lines = text.split(/\r?\n/).map(l => l.split("\t"));
    if (lines.length <= 1 && lines[0].length <= 1) return; // plain single value, let default paste handle
    e.preventDefault();
    const fields: (keyof Omit<BulkRow, "_id">)[] = ["name", "sku", "currentStock", "unitPrice"];
    const startCol = fields.indexOf(field);
    setBulkRows(rows => {
      const out = [...rows];
      const startIdx = out.findIndex(r => r._id === rowId);
      lines.forEach((cols, li) => {
        const rowIdx = startIdx + li;
        if (rowIdx >= out.length) out.push(emptyBulkRow());
        const updated = { ...out[rowIdx] };
        cols.forEach((val, ci) => {
          const f = fields[startCol + ci];
          if (f) (updated as any)[f] = val.trim();
        });
        out[rowIdx] = updated;
      });
      return out;
    });
  }, []);

  async function submitBulk() {
    const valid = bulkRows.filter(r => r.name.trim());
    if (!valid.length) return;
    setBulkPending(true);
    const results = await Promise.allSettled(
      valid.map(r => apiFetch("/api/admin/store/items", {
        method: "POST",
        body: JSON.stringify({
          name: r.name.trim(),
          sku: r.sku.trim() || null,
          categoryId: bulkShared.categoryId === "__none__" ? null : bulkShared.categoryId,
          unitId: bulkShared.unitId === "__none__" ? null : bulkShared.unitId,
          department: bulkShared.department.trim() || null,
          storeName: bulkShared.storeName.trim() || null,
          currentStock: Number(r.currentStock) || 0,
          reorderLevel: Number(r.reorderLevel) || 5,
          unitPrice: r.unitPrice || "0",
        }),
      }))
    );
    setBulkPending(false);
    const ok   = results.filter(r => r.status === "fulfilled").length;
    const fail = results.filter(r => r.status === "rejected").length;
    inv();
    setOpen(false);
    if (fail === 0) toast({ title: `${ok} item${ok !== 1 ? "s" : ""} added` });
    else toast({ variant: "destructive", title: `${ok} added, ${fail} failed`, description: "Check for duplicate names or invalid values." });
  }

  // Filter & summary
  const mainCats = cats.filter(c => !c.parentId);
  const filtered = items.filter(item => {
    const q = search.toLowerCase();
    const matchSearch = !search || item.name.toLowerCase().includes(q) || (item.sku ?? "").toLowerCase().includes(q) || (item.department ?? "").toLowerCase().includes(q) || (item.storeName ?? "").toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (catFilter === "__none__") return true;
    if (!item.categoryId) return false;
    const bc = getBreadcrumb(item.categoryId);
    const mainCat = cats.find(c => c.id === catFilter);
    return bc.main === mainCat?.name;
  });

  const totalStock = filtered.reduce((s, i) => s + (i.currentStock ?? 0), 0);
  const totalValue = filtered.reduce((s, i) => s + (i.currentStock ?? 0) * Number(i.unitPrice ?? 0), 0);

  // Bulk summary
  const validBulkRows = bulkRows.filter(r => r.name.trim());
  const bulkTotal = bulkRows.reduce((s, r) => s + (Number(r.currentStock) || 0) * (Number(r.unitPrice) || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <p className="text-sm text-muted-foreground">All inventory items with stock levels and values.</p>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" /> Add Item</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, SKU, department…" className="pl-8 h-9 text-sm" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="h-9 text-sm w-52"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">All Categories</SelectItem>
            {mainCats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-6 px-4 py-2.5 rounded-xl border border-border bg-slate-50 text-sm">
          <span className="text-slate-500">{filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">Total stock: <strong className="text-slate-800">{totalStock.toLocaleString()}</strong></span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">Total value: <strong className="text-slate-800">{fmtMoney(totalValue)}</strong></span>
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground w-10">#</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground w-14">Image</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Item Name</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">SKU</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Main Category</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Sub Category</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">3rd Level</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Unit</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Department</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Store</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Stock</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Total Value</th>
                <th className="px-3 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={13} className="px-3 py-3"><div className="h-5 bg-slate-100 rounded-full animate-pulse w-3/4" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={13} className="px-3 py-16 text-center">
                  <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <Package className="h-7 w-7 text-slate-300" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">{items.length === 0 ? "No items yet" : "No items match your filters"}</p>
                  {items.length === 0 && <p className="text-xs text-slate-400 mt-1">Click <strong>Add Item</strong> to get started.</p>}
                </td></tr>
              ) : filtered.map((item, idx) => {
                const bc  = getBreadcrumb(item.categoryId);
                const val = (item.currentStock ?? 0) * Number(item.unitPrice ?? 0);
                const low = item.currentStock <= item.reorderLevel;
                return (
                  <tr key={item.id} className="hover:bg-muted/25 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="h-9 w-9 rounded-lg object-cover border border-border" />
                      ) : (
                        <div className="h-9 w-9 rounded-lg border border-border bg-slate-50 flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-slate-300" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-800">{item.name}</p>
                      {item.description && <p className="text-xs text-slate-400 truncate max-w-[160px]">{item.description}</p>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{item.sku || "—"}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-600">{bc.main || "—"}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-600">{bc.sub || "—"}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-600">{bc.leaf || "—"}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-600">{item.unitName || "—"}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-600">{item.department || "—"}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-600">{item.storeName || "—"}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={cn("text-sm font-semibold tabular-nums", low ? "text-red-600" : "text-slate-800")}>
                        {item.currentStock.toLocaleString()}
                      </span>
                      {low && <div className="text-[10px] text-red-500 text-right">Low</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-slate-700 tabular-nums whitespace-nowrap">{fmtMoney(val)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(item); setForm(toForm(item)); setMode("single"); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:bg-red-50" onClick={() => setDeleteId(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30">
                  <td colSpan={10} className="px-3 py-2 text-xs font-semibold text-slate-500">TOTALS</td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-slate-800 tabular-nums">{totalStock.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-slate-800 tabular-nums whitespace-nowrap">{fmtMoney(totalValue)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Add / Edit dialog ── */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className={cn("transition-all duration-200 max-h-[92vh] overflow-y-auto", mode === "bulk" ? "max-w-4xl" : "max-w-2xl")}>
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <DialogTitle>{editing ? "Edit Item" : "Add Item"}</DialogTitle>
              {!editing && <ModePill mode={mode} onChange={m => setMode(m)} />}
            </div>
          </DialogHeader>

          {/* ══ SINGLE mode ══════════════════════════════════════════════════════ */}
          {(mode === "single" || editing) && (
            <div className="space-y-5 pt-1">
              <ImageField value={form.imageUrl} onChange={v => setF("imageUrl", v)} />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1 block">Item Name *</Label>
                  <Input required value={form.name} onChange={e => setF("name", e.target.value)} placeholder="e.g. A4 Paper Ream" />
                </div>
                <div>
                  <Label className="mb-1 block">Item SKU</Label>
                  <Input value={form.sku} onChange={e => setF("sku", e.target.value)} placeholder="e.g. STN-001" />
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Category</Label>
                <CategoryPicker cats={cats} value={form.categoryId} onChange={v => setF("categoryId", v)} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="mb-1 block">Unit</Label>
                  <Select value={form.unitId} onValueChange={v => setF("unitId", v)}>
                    <SelectTrigger><SelectValue placeholder="Select unit…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}{u.symbol ? ` (${u.symbol})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block">Department</Label>
                  <Input value={form.department} onChange={e => setF("department", e.target.value)} placeholder="e.g. Admin, Science" />
                </div>
                <div>
                  <Label className="mb-1 block">Store / Location</Label>
                  <Input value={form.storeName} onChange={e => setF("storeName", e.target.value)} placeholder="e.g. Main Store, Block-C" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="mb-1 block">Current Stock</Label>
                  <Input type="number" min="0" value={form.currentStock} onChange={e => setF("currentStock", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">Reorder Level</Label>
                  <Input type="number" min="0" value={form.reorderLevel} onChange={e => setF("reorderLevel", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">Unit Price (PKR)</Label>
                  <Input type="number" min="0" step="0.01" value={form.unitPrice} onChange={e => setF("unitPrice", e.target.value)} />
                </div>
              </div>
              {(Number(form.currentStock) > 0 && Number(form.unitPrice) > 0) && (
                <div className="rounded-lg border border-border bg-slate-50 px-4 py-2.5 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Total Value Preview</span>
                  <span className="font-bold text-slate-800">{fmtMoney(Number(form.currentStock) * Number(form.unitPrice))}</span>
                </div>
              )}
              <div>
                <Label className="mb-1 block">Description</Label>
                <Textarea value={form.description} onChange={e => setF("description", e.target.value)} placeholder="Optional notes…" className="min-h-[60px]" />
              </div>
            </div>
          )}

          {/* ══ BULK mode ════════════════════════════════════════════════════════ */}
          {mode === "bulk" && !editing && (
            <div className="space-y-5 pt-1">

              {/* Shared settings — apply to all rows */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 space-y-3">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Shared Settings — applied to all items below</p>
                <div>
                  <Label className="mb-2 block text-xs">Category</Label>
                  <CategoryPicker
                    cats={cats}
                    value={bulkShared.categoryId}
                    onChange={v => setBulkShared(s => ({ ...s, categoryId: v }))}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="mb-1 block text-xs">Unit</Label>
                    <Select value={bulkShared.unitId} onValueChange={v => setBulkShared(s => ({ ...s, unitId: v }))}>
                      <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Select unit…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— None —</SelectItem>
                        {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}{u.symbol ? ` (${u.symbol})` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Department</Label>
                    <Input value={bulkShared.department} onChange={e => setBulkShared(s => ({ ...s, department: e.target.value }))} placeholder="e.g. Admin" className="h-9 text-xs" />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Store / Location</Label>
                    <Input value={bulkShared.storeName} onChange={e => setBulkShared(s => ({ ...s, storeName: e.target.value }))} placeholder="e.g. Main Store" className="h-9 text-xs" />
                  </div>
                </div>
              </div>

              {/* Spreadsheet rows */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-semibold">Items — one per row</Label>
                  {validBulkRows.length > 0 && (
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      {validBulkRows.length} item{validBulkRows.length !== 1 ? "s" : ""} · {fmtMoney(bulkTotal)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mb-3">Tip: You can paste a table from Excel/Sheets — columns should be <strong>Name · SKU · Stock · Price</strong>.</p>

                {/* Header row */}
                <div className="grid gap-1.5 mb-1" style={{ gridTemplateColumns: "1fr 120px 90px 110px 32px" }}>
                  {["Item Name *", "SKU", "Stock", "Price (PKR)", ""].map(h => (
                    <span key={h} className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">{h}</span>
                  ))}
                </div>

                {/* Data rows */}
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {bulkRows.map((row, idx) => (
                    <div key={row._id} className="grid gap-1.5 items-center group" style={{ gridTemplateColumns: "1fr 120px 90px 110px 32px" }}>
                      <Input
                        value={row.name}
                        onChange={e => updateRow(row._id, "name", e.target.value)}
                        onPaste={e => handlePaste(e, row._id, "name")}
                        placeholder={`Item ${idx + 1} name…`}
                        className="h-8 text-xs"
                        autoFocus={idx === 0}
                      />
                      <Input
                        value={row.sku}
                        onChange={e => updateRow(row._id, "sku", e.target.value)}
                        onPaste={e => handlePaste(e, row._id, "sku")}
                        placeholder="SKU"
                        className="h-8 text-xs font-mono"
                      />
                      <Input
                        type="number" min="0"
                        value={row.currentStock}
                        onChange={e => updateRow(row._id, "currentStock", e.target.value)}
                        onPaste={e => handlePaste(e, row._id, "currentStock")}
                        className="h-8 text-xs text-right"
                      />
                      <Input
                        type="number" min="0" step="0.01"
                        value={row.unitPrice}
                        onChange={e => updateRow(row._id, "unitPrice", e.target.value)}
                        onPaste={e => handlePaste(e, row._id, "unitPrice")}
                        className="h-8 text-xs text-right"
                      />
                      <button type="button" onClick={() => removeRow(row._id)}
                        className="h-8 w-8 flex items-center justify-center rounded-md text-slate-300 hover:text-red-400 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <Button type="button" variant="outline" size="sm" className="mt-3 text-xs h-8" onClick={addRow}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            {(mode === "single" || editing) ? (
              <Button disabled={!form.name.trim() || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
                {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Add Item"}
              </Button>
            ) : (
              <Button
                disabled={validBulkRows.length === 0 || bulkPending}
                onClick={submitBulk}
                className="min-w-[150px]"
              >
                {bulkPending
                  ? `Adding… (${validBulkRows.length})`
                  : validBulkRows.length === 0
                    ? "Add Items"
                    : `Add ${validBulkRows.length} Item${validBulkRows.length !== 1 ? "s" : ""}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete item?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the inventory item.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && delMut.mutate(deleteId)} disabled={delMut.isPending} className="bg-destructive text-white hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
