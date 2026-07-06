import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Tag, FolderOpen, Folder, ListPlus, Pencil as PencilLine } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type Cat, type NodeLevel, type TreeNode, CAT_QUERY_KEY, buildCatTree } from "./catUtils";

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

const LEVEL_CFG: Record<NodeLevel, { indent: number; dot: string; label: string; childLabel: string | null; icon: React.ComponentType<{ className?: string }> }> = {
  1: { indent: 0,  dot: "bg-slate-700", label: "Main Category", childLabel: "Add Sub-category", icon: Folder },
  2: { indent: 28, dot: "bg-blue-500",  label: "Sub-category",  childLabel: "Add 3rd Level",    icon: FolderOpen },
  3: { indent: 52, dot: "bg-slate-400", label: "3rd Level",     childLabel: null,               icon: Tag },
};

type F = { name: string; description: string; active: boolean; sortOrder: string };
const emptyF = (): F => ({ name: "", description: "", active: true, sortOrder: "0" });
const toF    = (c: Cat): F => ({ name: c.name, description: c.description ?? "", active: c.active, sortOrder: String(c.sortOrder) });

// ── Mode toggle pill ─────────────────────────────────────────────────────────
function ModePill({ mode, onChange }: { mode: "single" | "bulk"; onChange: (m: "single" | "bulk") => void }) {
  return (
    <div className="flex items-center gap-0 rounded-lg border border-border bg-muted/40 p-0.5 w-fit">
      <button
        type="button"
        onClick={() => onChange("single")}
        className={cn("flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
          mode === "single" ? "bg-white text-slate-800 shadow-sm" : "text-muted-foreground hover:text-foreground")}
      >
        <PencilLine className="h-3 w-3" /> Single
      </button>
      <button
        type="button"
        onClick={() => onChange("bulk")}
        className={cn("flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
          mode === "bulk" ? "bg-white text-slate-800 shadow-sm" : "text-muted-foreground hover:text-foreground")}
      >
        <ListPlus className="h-3 w-3" /> Bulk
      </button>
    </div>
  );
}

export function StoreCategoryTab() {
  const qc  = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [open, setOpen]             = useState(false);
  const [editing, setEditing]       = useState<Cat | null>(null);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [addLevel, setAddLevel]     = useState<NodeLevel>(1);
  const [form, setForm]             = useState<F>(emptyF());
  const [mode, setMode]             = useState<"single" | "bulk">("single");
  const [bulkText, setBulkText]     = useState("");
  const [bulkPending, setBulkPending] = useState(false);
  const [delTarget, setDelTarget]   = useState<Cat | null>(null);

  const inv = () => qc.invalidateQueries({ queryKey: CAT_QUERY_KEY });

  const { data: flat = [], isLoading } = useQuery<Cat[]>({
    queryKey: CAT_QUERY_KEY,
    queryFn:  () => apiFetch("/api/admin/store/item-categories"),
    staleTime: 10_000,
  });

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing
        ? apiFetch(`/api/admin/store/item-categories/${editing.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiFetch("/api/admin/store/item-categories", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { inv(); setOpen(false); toast({ title: editing ? "Category updated" : "Category added" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/store/item-categories/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDelTarget(null); toast({ title: "Category deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function openAdd(parentId: string | null, level: NodeLevel) {
    setEditing(null); setAddParentId(parentId); setAddLevel(level);
    setForm(emptyF()); setMode("single"); setBulkText(""); setOpen(true);
  }
  function openEdit(c: Cat, level: NodeLevel) {
    setEditing(c); setAddLevel(level); setForm(toF(c));
    setMode("single"); setOpen(true);
  }

  function submitSingle() {
    const body: Record<string, unknown> = { name: form.name.trim(), description: form.description.trim() || null, active: form.active, sortOrder: Number(form.sortOrder) || 0 };
    if (!editing) body.parentId = addParentId;
    saveMut.mutate(body);
  }

  async function submitBulk() {
    const names = bulkText.split("\n").map(s => s.trim()).filter(Boolean);
    if (!names.length) return;
    setBulkPending(true);
    let ok = 0; let fail = 0;
    // send all in parallel, collect results
    const results = await Promise.allSettled(
      names.map((name, i) =>
        apiFetch("/api/admin/store/item-categories", {
          method: "POST",
          body: JSON.stringify({ name, parentId: addParentId, active: form.active, sortOrder: i }),
        })
      )
    );
    results.forEach(r => r.status === "fulfilled" ? ok++ : fail++);
    setBulkPending(false);
    inv();
    setOpen(false);
    setBulkText("");
    if (fail === 0) toast({ title: `${ok} ${LEVEL_CFG[addLevel].label}${ok !== 1 ? "s" : ""} added` });
    else toast({ variant: "destructive", title: `${ok} added, ${fail} failed`, description: "Duplicates or empty names are skipped." });
  }

  function toggle(id: string) { setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  const tree = buildCatTree(flat);

  // Parsed bulk names preview
  const bulkNames = bulkText.split("\n").map(s => s.trim()).filter(Boolean);

  const PLACEHOLDERS: Record<NodeLevel, string> = {
    1: "Uniform\nFurniture\nIT Equipment\nStationery\nSports Equipment",
    2: "Officers Uniform\nCadets Uniform\nJCO Uniform",
    3: "Summer Uniform\nWinter Uniform\nSports Wear",
  };

  function renderNode(node: TreeNode): React.ReactNode {
    const cfg = LEVEL_CFG[node.level];
    const isOpen = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    const canExpand = node.level < 3 && hasChildren;
    return (
      <div key={node.id}>
        <div className={cn("flex items-center gap-2 px-4 py-2.5 group hover:bg-muted/40 border-b border-border last:border-0 transition-colors", node.level === 1 && "bg-slate-50/80")}
          style={{ paddingLeft: `${16 + cfg.indent}px` }}>
          <button className={cn("h-5 w-5 flex-shrink-0 flex items-center justify-center rounded text-slate-400", canExpand && "hover:bg-slate-200 cursor-pointer")}
            onClick={() => canExpand && toggle(node.id)} disabled={!canExpand}>
            {canExpand ? (isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
              : node.level < 3 ? <cfg.icon className="h-3 w-3 text-slate-300" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-300 block" />}
          </button>
          <span className={cn("h-2 w-2 rounded-full flex-shrink-0", cfg.dot)} />
          <div className="flex-1 min-w-0">
            <span className={cn("text-sm", node.level === 1 ? "font-semibold text-slate-800" : node.level === 2 ? "font-medium text-slate-700" : "text-slate-600")}>{node.name}</span>
            {node.description && <span className="ml-2 text-xs text-slate-400 truncate">{node.description}</span>}
            {hasChildren && !isOpen && <span className="ml-2 text-[10px] text-slate-400">({node.children.length})</span>}
          </div>
          <span className="text-[10px] font-medium text-slate-400 hidden sm:block flex-shrink-0">{cfg.label}</span>
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0", node.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>
            {node.active ? "Active" : "Inactive"}
          </span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {cfg.childLabel && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-blue-600 hover:bg-blue-50"
                onClick={() => openAdd(node.id, (node.level + 1) as NodeLevel)}>
                <Plus className="h-3 w-3 mr-0.5" />{cfg.childLabel}
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(node, node.level)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:bg-red-50" onClick={() => setDelTarget(node)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
        {isOpen && node.children.map(child => renderNode(child))}
      </div>
    );
  }

  const levelLabel = LEVEL_CFG[addLevel].label;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Three-level hierarchy: Main Category → Sub-category → 3rd Level. Hover a row to add children or edit.</p>
        <Button size="sm" onClick={() => openAdd(null, 1)}><Plus className="h-4 w-4 mr-1.5" /> Add Main Category</Button>
      </div>

      <div className="flex items-center gap-4 px-1">
        {([1,2,3] as NodeLevel[]).map(lvl => (
          <div key={lvl} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={cn("h-2 w-2 rounded-full", LEVEL_CFG[lvl].dot)} />
            {LEVEL_CFG[lvl].label}
          </div>
        ))}
      </div>

      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="h-9 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : tree.length === 0 ? (
          <div className="py-16 text-center">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3"><Tag className="h-6 w-6 text-slate-300" /></div>
            <p className="text-sm font-medium text-slate-600">No categories yet</p>
            <p className="text-xs text-slate-400 mt-1">Click <strong>Add Main Category</strong> to get started.</p>
          </div>
        ) : tree.map(node => renderNode(node))}
        {flat.length > 0 && (
          <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            {flat.length} total · {tree.length} main · {flat.filter(c => c.parentId && flat.find(p => p.id === c.parentId && !p.parentId)).length} sub-categories · {flat.filter(c => { const p = flat.find(x => x.id === c.parentId); return p?.parentId != null; }).length} third-level
          </div>
        )}
      </div>

      {/* ── Add / Edit dialog ── */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className={cn("transition-all duration-200", mode === "bulk" ? "max-w-md" : "max-w-sm")}>
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", LEVEL_CFG[addLevel].dot)} />
                {editing ? `Edit ${levelLabel}` : `Add ${levelLabel}`}
              </DialogTitle>
              {/* Mode toggle — only shown when adding, not editing */}
              {!editing && <ModePill mode={mode} onChange={m => { setMode(m); setBulkText(""); }} />}
            </div>
          </DialogHeader>

          {/* ── Single mode ── */}
          {(mode === "single" || editing) && (
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
                <Label className="mb-1 block">Description</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional…" className="min-h-[60px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block">Sort Order</Label>
                  <Input type="number" min="0" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch id="cat-active" checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
                  <Label htmlFor="cat-active">Active</Label>
                </div>
              </div>
            </div>
          )}

          {/* ── Bulk mode ── */}
          {mode === "bulk" && !editing && (
            <div className="space-y-4 pt-1">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>Names — one per line</Label>
                  {bulkNames.length > 0 && (
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      {bulkNames.length} {levelLabel}{bulkNames.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <Textarea
                  autoFocus
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  placeholder={PLACEHOLDERS[addLevel]}
                  className="min-h-[180px] font-mono text-sm leading-relaxed resize-none"
                />
                <p className="text-xs text-slate-400 mt-1.5">Type or paste one name per line. Empty lines are ignored. Duplicates will be skipped.</p>
              </div>

              {/* Live preview of parsed names */}
              {bulkNames.length > 0 && (
                <div className="rounded-lg border border-border bg-slate-50 p-3 max-h-40 overflow-y-auto">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Preview</p>
                  <div className="flex flex-wrap gap-1.5">
                    {bulkNames.map((name, i) => (
                      <span key={i} className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium",
                        LEVEL_CFG[addLevel].dot === "bg-slate-700" ? "bg-slate-100 text-slate-700 border-slate-200" :
                        LEVEL_CFG[addLevel].dot === "bg-blue-500"  ? "bg-blue-50 text-blue-700 border-blue-200" :
                        "bg-slate-50 text-slate-600 border-slate-200")}>
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Switch id="bulk-active" checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
                <Label htmlFor="bulk-active">Set all as Active</Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            {(mode === "single" || editing) ? (
              <Button disabled={!form.name.trim() || saveMut.isPending} onClick={submitSingle}>
                {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : `Add ${levelLabel}`}
              </Button>
            ) : (
              <Button
                disabled={bulkNames.length === 0 || bulkPending}
                onClick={submitBulk}
                className="min-w-[140px]"
              >
                {bulkPending
                  ? `Adding… (${bulkNames.length})`
                  : bulkNames.length === 0
                    ? "Add Categories"
                    : `Add ${bulkNames.length} ${levelLabel}${bulkNames.length !== 1 ? "s" : ""}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!delTarget} onOpenChange={v => !v && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{delTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>All nested sub-categories and 3rd level categories will also be removed. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => delTarget && delMut.mutate(delTarget.id)} disabled={delMut.isPending} className="bg-destructive text-white hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
