import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useListAdminStoreUnits, getListAdminStoreUnitsQueryKey, useCreateAdminStoreUnit, useUpdateAdminStoreUnit, useDeleteAdminStoreUnit } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CatalogTab, type CatalogItem, type FieldDef } from "@/pages/academic/CatalogTab";
import { Ruler, Plus, Pencil, Trash2, ChevronRight, ChevronDown, Tag, FolderOpen, Folder } from "lucide-react";
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

interface Cat { id: string; name: string; parentId: string | null; description: string | null; active: boolean; sortOrder: number; coaId?: string | null; }

type NodeLevel = 1 | 2 | 3;

interface TreeNode extends Cat {
  level: NodeLevel;
  children: TreeNode[];
}

function buildTree(flat: Cat[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const c of flat) byId.set(c.id, { ...c, level: 1, children: [] });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (!node.parentId) {
      node.level = 1;
      roots.push(node);
    } else {
      const parent = byId.get(node.parentId);
      if (parent) {
        node.level = (parent.level < 3 ? parent.level + 1 : 3) as NodeLevel;
        parent.children.push(node);
      } else {
        node.level = 1;
        roots.push(node);
      }
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);
  return roots;
}

const LEVEL_CFG: Record<NodeLevel, { indent: number; dot: string; label: string; addChildLabel: string | null; icon: React.ComponentType<{ className?: string }> }> = {
  1: { indent: 0,  dot: "bg-slate-700", label: "Main Category",  addChildLabel: "Add Sub-category", icon: Folder },
  2: { indent: 28, dot: "bg-blue-500",  label: "Sub-category",   addChildLabel: "Add 3rd Level",    icon: FolderOpen },
  3: { indent: 52, dot: "bg-slate-400", label: "3rd Level",      addChildLabel: null,               icon: Tag },
};

type F = { name: string; description: string; active: boolean; sortOrder: string; coaId: string };
const emptyF = (): F => ({ name: "", description: "", active: true, sortOrder: "0", coaId: "" });
const toF = (c: Cat): F => ({ name: c.name, description: c.description ?? "", active: c.active, sortOrder: String(c.sortOrder), coaId: (c as any).coaId ?? "" });

const QUERY_KEY = ["store-item-categories-tree"];

// ── 3-level Tree ───────────────────────────────────────────────────────────────
function ItemCategoriesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [addParentId, setAddParentId] = useState<string | null | undefined>(undefined);
  const [addLevel, setAddLevel] = useState<NodeLevel>(1);
  const [form, setForm] = useState<F>(emptyF());
  const [deleteTarget, setDeleteTarget] = useState<Cat | null>(null);

  const inv = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const { data: coaAccounts = [] } = useQuery<{ id: string; code: string; name: string; type: string }[]>({
    queryKey: ["coa-flat"],
    queryFn: () => apiFetch("/api/admin/coa"),
    staleTime: 60_000,
  });

  const coaMap = useMemo(() => new Map(coaAccounts.map(a => [a.id, a])), [coaAccounts]);

  const { data: flat = [], isLoading } = useQuery<Cat[]>({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch("/api/admin/store/item-categories"),
    staleTime: 10_000,
  });

  const tree = buildTree(flat);

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      return editing
        ? apiFetch(`/api/admin/store/item-categories/${editing.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiFetch("/api/admin/store/item-categories", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { inv(); setOpen(false); toast({ title: editing ? "Category updated" : "Category added" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/store/item-categories/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDeleteTarget(null); toast({ title: "Category deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function openAdd(parentId: string | null, level: NodeLevel) {
    setEditing(null);
    setAddParentId(parentId);
    setAddLevel(level);
    setForm(emptyF());
    setOpen(true);
  }

  function openEdit(c: Cat, level: NodeLevel) {
    setEditing(c);
    setAddLevel(level);
    setForm(toF(c));
    setOpen(true);
  }

  function submit() {
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      active: form.active,
      sortOrder: Number(form.sortOrder) || 0,
      coaId: form.coaId || null,
    };
    if (!editing) body.parentId = addParentId ?? null;
    saveMut.mutate(body);
  }

  function toggle(id: string) {
    setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // Render tree rows recursively
  function renderNode(node: TreeNode): React.ReactNode {
    const cfg = LEVEL_CFG[node.level];
    const isOpen = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    const canExpand = node.level < 3 && hasChildren;

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 group hover:bg-muted/40 transition-colors border-b border-border last:border-0",
            node.level === 1 && "bg-slate-50/80",
            node.level === 2 && "bg-white",
            node.level === 3 && "bg-white",
          )}
          style={{ paddingLeft: `${16 + cfg.indent}px` }}
        >
          {/* Expand toggle or indent spacer */}
          <button
            className={cn("h-5 w-5 flex-shrink-0 flex items-center justify-center rounded text-slate-400", canExpand && "hover:bg-slate-200 cursor-pointer")}
            onClick={() => canExpand && toggle(node.id)}
            disabled={!canExpand}
          >
            {canExpand
              ? (isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
              : node.level < 3 ? <cfg.icon className="h-3 w-3 text-slate-300" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-300 block" />}
          </button>

          {/* Dot indicator */}
          <span className={cn("h-2 w-2 rounded-full flex-shrink-0", cfg.dot)} />

          {/* Name + description */}
          <div className="flex-1 min-w-0">
            <span className={cn("text-sm", node.level === 1 ? "font-semibold text-slate-800" : node.level === 2 ? "font-medium text-slate-700" : "text-slate-600")}>
              {node.name}
            </span>
            {node.description && (
              <span className="ml-2 text-xs text-slate-400 truncate">{node.description}</span>
            )}
            {node.coaId && coaMap.has(node.coaId) && (
              <span className="ml-2 text-[10px] text-emerald-600 font-mono">{coaMap.get(node.coaId)!.code}</span>
            )}
            {node.children.length > 0 && !isOpen && (
              <span className="ml-2 text-[10px] text-slate-400">({node.children.length})</span>
            )}
          </div>

          {/* Level badge */}
          <span className="text-[10px] font-medium text-slate-400 hidden sm:block flex-shrink-0">{cfg.label}</span>

          {/* Status */}
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0",
            node.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>
            {node.active ? "Active" : "Inactive"}
          </span>

          {/* Actions (visible on hover or always on mobile) */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {cfg.addChildLabel && (
              <Button size="sm" variant="ghost"
                className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                onClick={() => openAdd(node.id, (node.level + 1) as NodeLevel)}>
                <Plus className="h-3 w-3 mr-0.5" />{cfg.addChildLabel}
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(node, node.level)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:bg-red-50" onClick={() => setDeleteTarget(node)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        {/* Children */}
        {isOpen && node.children.map(child => renderNode(child))}
      </div>
    );
  }

  const levelLabel = LEVEL_CFG[addLevel].label;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Three-level hierarchy: Main Category → Sub-category → 3rd Level. Items are linked to any level.</p>
        </div>
        <Button size="sm" onClick={() => openAdd(null, 1)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Main Category
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-2">
        {([1,2,3] as NodeLevel[]).map(lvl => (
          <div key={lvl} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={cn("h-2 w-2 rounded-full", LEVEL_CFG[lvl].dot)} />
            {LEVEL_CFG[lvl].label}
          </div>
        ))}
        <span className="text-xs text-slate-300 ml-1">· Hover a row to see Add / Edit / Delete</span>
      </div>

      {/* Tree */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-9 bg-slate-100 rounded-lg animate-pulse" />)}
          </div>
        ) : tree.length === 0 ? (
          <div className="py-16 text-center">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Tag className="h-6 w-6 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-600">No categories yet</p>
            <p className="text-xs text-slate-400 mt-1">Click <strong>Add Main Category</strong> to get started.</p>
          </div>
        ) : (
          <div className="divide-y-0">
            {tree.map(node => renderNode(node))}
          </div>
        )}
        {flat.length > 0 && (
          <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            {flat.length} categor{flat.length !== 1 ? "ies" : "y"} total · {tree.length} main · {flat.filter(c => c.parentId && flat.some(p => p.id === c.parentId && !p.parentId)).length} sub-categories · {flat.filter(c => {
              const parent = flat.find(p => p.id === c.parentId);
              return parent?.parentId != null;
            }).length} third-level
          </div>
        )}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", LEVEL_CFG[addLevel].dot)} />
              {editing ? `Edit ${levelLabel}` : `Add ${levelLabel}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label className="mb-1 block">Name *</Label>
              <Input
                autoFocus
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={addLevel === 1 ? "e.g. Uniform, Furniture, IT Equipment" : addLevel === 2 ? "e.g. Officers Uniform, Cadets Uniform" : "e.g. Summer Uniform, Winter Uniform"}
              />
            </div>
            <div>
              <Label className="mb-1 block">COA Account</Label>
              <Select value={form.coaId || "__none__"} onValueChange={v => setForm(f => ({ ...f, coaId: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Link to COA account…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {coaAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block">Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description…"
                className="min-h-[60px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">Sort Order</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.sortOrder}
                  onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  id="cat-active"
                  checked={form.active}
                  onCheckedChange={v => setForm(f => ({ ...f, active: v }))}
                />
                <Label htmlFor="cat-active">Active</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.name.trim() || saveMut.isPending} onClick={submit}>
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : `Add ${levelLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will also delete all sub-categories and 3rd level categories nested under it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && delMut.mutate(deleteTarget.id)}
              disabled={delMut.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Units of Measure ───────────────────────────────────────────────────────────
function UnitsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminStoreUnits();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminStoreUnitsQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Unit Name", type: "text", required: true, placeholder: "e.g. Pieces, Metres, Kilograms", maxLength: 120 },
    { key: "symbol", label: "Symbol", type: "text", placeholder: "e.g. pcs, m, kg", maxLength: 20 },
    { key: "description", label: "Notes", type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Unit of Measure"
      description="Define units of measure used for stock items (Pieces, Metres, Litres, Kilograms, etc.)."
      icon={Ruler}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminStoreUnit({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminStoreUnit({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminStoreUnit({ mutation: { onSuccess: inv } })}
    />
  );
}

// ── Main Setup Tab ──────────────────────────────────────────────────────────────
const SUBTABS = [
  { key: "categories", label: "Item Categories" },
  { key: "units",      label: "Units of Measure" },
] as const;
type Subtab = (typeof SUBTABS)[number]["key"];

export function StoreSetupTab() {
  const [sub, setSub] = useState<Subtab>("categories");
  return (
    <div className="space-y-0">
      <div className="flex gap-0 border-b border-border mb-6">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              sub === t.key
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "categories" && <ItemCategoriesTab />}
      {sub === "units"      && <UnitsTab />}
    </div>
  );
}
