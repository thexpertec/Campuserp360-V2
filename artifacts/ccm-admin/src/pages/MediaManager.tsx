import { useState, useEffect, useRef, useCallback } from "react";
import { formatDate as localeFormatDate } from "@/lib/locale";
import {
  Images, Upload, Search, Grid3x3, List, X, Copy, Trash2,
  Tag, Check, Loader2, ChevronDown, RefreshCw, ImageOff,
  SortAsc, SortDesc, FileImage, Link as LinkIcon, FileArchive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Types & helpers ──────────────────────────────────────────────────────────

type MediaItem = {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  altText: string | null;
  tags: string | null;
  url: string;
  uploadedAt: string;
};

type ListResponse = {
  items: MediaItem[];
  total: number;
  page: number;
  limit: number;
};

type SortKey = "newest" | "oldest" | "name" | "size";

const API = (import.meta.env.VITE_API_BASE as string) || "";
const TK   = "ccm_admin_token";
const LIMIT = 24;

function hdrs(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem(TK) ?? ""}` };
}

function imgUrl(url: string) { return url; }

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const fmtDate = (iso: string): string => localeFormatDate(iso);

function parseTags(raw: string | null): string[] {
  return raw ? raw.split(",").map(t => t.trim()).filter(Boolean) : [];
}

const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  name:   "Name A–Z",
  size:   "Largest first",
};

// ─── Upload progress card ─────────────────────────────────────────────────────

function UploadCard({ name, done }: { name: string; done: boolean }) {
  return (
    <div className="relative aspect-square rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 flex flex-col items-center justify-center gap-2 overflow-hidden">
      {done
        ? <Check className="h-6 w-6 text-green-500" />
        : <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
      }
      <span className="text-[10px] text-muted-foreground px-2 text-center truncate w-full text-center">
        {name}
      </span>
    </div>
  );
}

// ─── Media card (grid) ────────────────────────────────────────────────────────

function MediaCard({
  item,
  isSelected,
  onSelect,
  onClick,
  onCopyUrl,
}: {
  item: MediaItem;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onClick: () => void;
  onCopyUrl: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const tags = parseTags(item.tags);

  return (
    <div
      className={cn(
        "group relative aspect-square rounded-lg border-2 overflow-hidden cursor-pointer transition-all",
        isSelected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-primary/40 hover:shadow-md",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <img
        src={imgUrl(item.url)}
        alt={item.altText ?? item.originalName}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='%23ccc' stroke-width='1.5'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpath d='m21 15-5-5L5 21'/%3E%3C/svg%3E"; }}
      />

      {/* Hover overlay */}
      <div className={cn(
        "absolute inset-0 bg-black/50 flex flex-col justify-between p-2 transition-opacity",
        hovered || isSelected ? "opacity-100" : "opacity-0",
      )}>
        {/* Top: checkbox + copy */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onSelect}
            className={cn(
              "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
              isSelected ? "bg-primary border-primary" : "bg-white/20 border-white/60 hover:bg-white/40",
            )}
          >
            {isSelected && <Check className="h-3 w-3 text-white" />}
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onCopyUrl(); }}
            className="h-6 w-6 rounded bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
            title="Copy URL"
          >
            <Copy className="h-3 w-3 text-white" />
          </button>
        </div>

        {/* Bottom: name + tags */}
        <div>
          <p className="text-[10px] text-white font-medium truncate leading-tight">
            {item.originalName}
          </p>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-0.5 mt-0.5">
              {tags.slice(0, 3).map(t => (
                <span key={t} className="text-[9px] bg-white/20 text-white px-1 py-0.5 rounded">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  item,
  onClose,
  onUpdated,
  onDeleted,
}: {
  item: MediaItem;
  onClose: () => void;
  onUpdated: (updated: MediaItem) => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useToast();
  const [altText, setAltText]     = useState(item.altText ?? "");
  const [tags,    setTags]        = useState(item.tags ?? "");
  const [saving,  setSaving]      = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [copied,  setCopied]      = useState(false);

  useEffect(() => {
    setAltText(item.altText ?? "");
    setTags(item.tags ?? "");
  }, [item.id]);

  function copyUrl() {
    navigator.clipboard.writeText(imgUrl(item.url));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/media/${item.id}`, {
        method: "PATCH",
        headers: hdrs(),
        body: JSON.stringify({ altText: altText.trim() || null, tags: tags.trim() || null }),
      });
      const updated = await res.json() as MediaItem;
      onUpdated(updated);
      toast({ title: "Saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${item.originalName}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`${API}/api/admin/media/${item.id}`, { method: "DELETE", headers: hdrs() });
      onDeleted(item.id);
      toast({ title: "Deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-sm font-semibold truncate">{item.originalName}</span>
        <button type="button" onClick={onClose} className="h-7 w-7 rounded hover:bg-muted flex items-center justify-center">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Image preview */}
        <div className="bg-checkerboard border-b border-border">
          <img
            src={imgUrl(item.url)}
            alt={item.altText ?? item.originalName}
            className="w-full max-h-60 object-contain"
          />
        </div>

        <div className="p-4 space-y-5">
          {/* Metadata */}
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Type</span>
              <span className="font-medium text-foreground">{item.mimeType}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Size</span>
              <span className="font-medium text-foreground">{fmtSize(item.sizeBytes)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Uploaded</span>
              <span className="font-medium text-foreground">{fmtDate(item.uploadedAt)}</span>
            </div>
          </div>

          <Separator />

          {/* URL copy */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">File URL</Label>
            <div className="flex gap-1.5">
              <input
                readOnly
                value={imgUrl(item.url)}
                className="flex-1 h-8 px-2 text-xs rounded border border-input bg-muted/40 focus:outline-none font-mono truncate"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 shrink-0"
                onClick={copyUrl}
              >
                {copied
                  ? <Check className="h-3.5 w-3.5 text-green-500" />
                  : <Copy className="h-3.5 w-3.5" />
                }
              </Button>
            </div>
          </div>

          <Separator />

          {/* Editable metadata */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Alt Text</Label>
              <Input
                value={altText}
                onChange={e => setAltText(e.target.value)}
                placeholder="Describe the image…"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Tag className="h-3 w-3" /> Tags
              </Label>
              <Input
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="logo, banner, certificate"
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Comma-separated. Used for search & filtering.</p>
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full h-8 text-xs"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Save Changes
            </Button>
          </div>

          <Separator />

          {/* Delete */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            }
            Delete Permanently
          </Button>
        </div>
      </div>
    </aside>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MediaManager() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data state
  const [items,       setItems]     = useState<MediaItem[]>([]);
  const [total,       setTotal]     = useState(0);
  const [page,        setPage]      = useState(1);
  const [loading,     setLoading]   = useState(false);
  const [loadingMore, setLMore]     = useState(false);
  const [allTags,     setAllTags]   = useState<string[]>([]);

  // UI state
  const [search,       setSearch]   = useState("");
  const [debSearch,    setDebSearch]= useState("");
  const [activeTag,    setActiveTag]= useState<string | null>(null);
  const [sort,         setSort]     = useState<SortKey>("newest");
  const [viewMode,     setView]     = useState<"grid" | "list">("grid");
  const [selected,     setSelected] = useState<MediaItem | null>(null);
  const [multiSel,     setMultiSel] = useState<Set<string>>(new Set());
  const [dragOver,     setDragOver] = useState(false);

  // Upload state
  const [uploading,    setUploading]= useState(false);
  const [uploadJobs,   setUploadJobs] = useState<{ name: string; done: boolean }[]>([]);
  const [bulkDeleting, setBDel]     = useState(false);
  const [converting,   setConverting] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reload when filters change
  useEffect(() => {
    setPage(1);
    setItems([]);
    loadItems(1, true);
    loadTags();
  }, [debSearch, activeTag, sort]);

  async function loadItems(pg: number, replace = false) {
    pg === 1 ? setLoading(true) : setLMore(true);
    try {
      const params = new URLSearchParams({
        page:  String(pg),
        limit: String(LIMIT),
        sort,
        ...(debSearch  ? { q:   debSearch  } : {}),
        ...(activeTag  ? { tag: activeTag  } : {}),
      });
      const res  = await fetch(`${API}/api/admin/media?${params}`, { headers: hdrs() });
      const data = await res.json() as ListResponse;
      setItems(prev => replace ? data.items : [...prev, ...data.items]);
      setTotal(data.total);
      setPage(pg);
    } finally {
      setLoading(false);
      setLMore(false);
    }
  }

  async function loadTags() {
    try {
      const res  = await fetch(`${API}/api/admin/media/tags`, { headers: hdrs() });
      const tags = await res.json() as string[];
      setAllTags(tags);
    } catch { /* ignore */ }
  }

  // ── File upload ──────────────────────────────────────────────────────────────

  async function processFiles(files: File[]) {
    const imgFiles = files.filter(f => f.type.startsWith("image/"));
    if (!imgFiles.length) return;
    setUploading(true);
    const jobs = imgFiles.map(f => ({ name: f.name, done: false }));
    setUploadJobs(jobs);

    const newItems: MediaItem[] = [];
    for (let i = 0; i < imgFiles.length; i++) {
      const file = imgFiles[i];
      const dataUrl = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      try {
        const res  = await fetch(`${API}/api/admin/media`, {
          method: "POST",
          headers: hdrs(),
          body: JSON.stringify({ dataUrl, filename: file.name }),
        });
        const item = await res.json() as MediaItem;
        newItems.push(item);
      } catch {
        toast({ title: `Failed to upload ${file.name}`, variant: "destructive" });
      }
      setUploadJobs(prev => prev.map((j, idx) => idx === i ? { ...j, done: true } : j));
    }

    // Prepend to items list and refresh tags
    setItems(prev => [...newItems, ...prev]);
    setTotal(t => t + newItems.length);
    setUploadJobs([]);
    setUploading(false);
    loadTags();
    if (newItems.length > 0) {
      toast({ title: `${newItems.length} image${newItems.length > 1 ? "s" : ""} uploaded` });
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) { processFiles(Array.from(e.target.files)); e.target.value = ""; }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) processFiles(Array.from(e.dataTransfer.files));
  }

  // ── Multi-select ─────────────────────────────────────────────────────────────

  function toggleMultiSelect(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setMultiSel(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${multiSel.size} selected images? This cannot be undone.`)) return;
    setBDel(true);
    try {
      await fetch(`${API}/api/admin/media/bulk-delete`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ ids: Array.from(multiSel) }),
      });
      setItems(prev => prev.filter(i => !multiSel.has(i.id)));
      setTotal(t => t - multiSel.size);
      if (selected && multiSel.has(selected.id)) setSelected(null);
      setMultiSel(new Set());
      toast({ title: `${multiSel.size} images deleted` });
    } catch {
      toast({ title: "Bulk delete failed", variant: "destructive" });
    } finally {
      setBDel(false);
    }
  }

  async function bulkConvertWebp() {
    if (converting) return;
    setConverting(true);
    try {
      const res = await fetch(`${API}/api/admin/media/bulk-convert-webp`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ ids: Array.from(multiSel) }),
      });
      if (!res.ok) throw new Error(`convert failed: ${res.status}`);
      const data = await res.json() as {
        converted: number; skipped: number; failed: number;
        referencesRewritten?: number;
        referenceLocations?: { table: string; column: string; count: number }[];
      };
      setMultiSel(new Set());
      setSelected(null);
      // Reload so the grid picks up the new .webp URLs and sizes.
      setPage(1);
      setItems([]);
      await loadItems(1, true);
      const parts = [`${data.converted} converted`];
      if (data.skipped) parts.push(`${data.skipped} skipped`);
      if (data.failed)  parts.push(`${data.failed} failed`);
      if (data.referencesRewritten) {
        parts.push(`${data.referencesRewritten} website reference${data.referencesRewritten === 1 ? "" : "s"} updated`);
      }
      toast({
        title: "Convert to WebP",
        description: parts.join(", "),
        variant: data.failed ? "destructive" : undefined,
      });
    } catch {
      toast({ title: "Convert to WebP failed", variant: "destructive" });
    } finally {
      setConverting(false);
    }
  }

  function copyUrl(item: MediaItem) {
    navigator.clipboard.writeText(imgUrl(item.url));
    toast({ title: "URL copied", description: item.originalName });
  }

  const hasMore = items.length < total;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full min-h-0 relative"
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={onDrop}
    >
      {/* Drag-over overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-4 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Upload className="h-12 w-12 text-primary mx-auto mb-3" />
            <p className="text-lg font-semibold text-primary">Drop images here</p>
            <p className="text-sm text-primary/70">PNG, JPG, WebP, GIF supported</p>
          </div>
        </div>
      )}

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 bg-card">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center">
            <Images className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="font-semibold text-base text-foreground">Media Library</h1>
            <p className="text-xs text-muted-foreground">
              {total > 0 ? `${total} image${total !== 1 ? "s" : ""} stored` : "Upload and manage your images"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setPage(1); setItems([]); loadItems(1, true); }}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <Upload className="h-4 w-4 mr-1.5" />
            }
            Upload Images
          </Button>
          <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={onFileInput} />
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-border bg-muted/20 shrink-0">
        {/* Search */}
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, alt text, or tag…"
            className="h-8 pl-8 text-sm"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1.5 h-8 px-3 rounded border border-input bg-background text-sm hover:bg-muted transition-colors">
              <SortAsc className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">{SORT_LABELS[sort]}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, label]) => (
              <DropdownMenuItem key={k} onClick={() => setSort(k)} className={cn(sort === k && "text-primary font-medium")}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* View toggle */}
        <div className="flex rounded border border-input overflow-hidden">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={cn("h-8 w-8 flex items-center justify-center transition-colors", viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn("h-8 w-8 flex items-center justify-center transition-colors border-l border-input", viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Tag filter chips ─────────────────────────────────────────────────── */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-2 border-b border-border/60 bg-background overflow-x-auto shrink-0 scrollbar-none">
          <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={cn(
              "h-6 px-2.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
              !activeTag ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted",
            )}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={cn(
                "h-6 px-2.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
                activeTag === tag ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted",
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* ── Bulk-select bar ──────────────────────────────────────────────────── */}
      {multiSel.size > 0 && (
        <div className="flex items-center gap-3 px-6 py-2 bg-primary/5 border-b border-primary/20 shrink-0">
          <span className="text-sm font-medium text-primary">{multiSel.size} selected</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={bulkConvertWebp}
            disabled={converting || bulkDeleting}
          >
            {converting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileArchive className="h-3.5 w-3.5 mr-1" />}
            Convert to WebP
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={bulkDelete}
            disabled={bulkDeleting || converting}
          >
            {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
            Delete selected
          </Button>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground ml-auto" onClick={() => setMultiSel(new Set())}>
            Deselect all
          </button>
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Grid / List area */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Empty state */}
          {!loading && items.length === 0 && uploadJobs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="h-16 w-16 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-4">
                <ImageOff className="h-8 w-8 text-violet-300" />
              </div>
              <p className="text-base font-semibold text-foreground mb-1">
                {debSearch || activeTag ? "No images found" : "No images yet"}
              </p>
              <p className="text-sm text-muted-foreground mb-5">
                {debSearch || activeTag
                  ? "Try a different search or tag filter."
                  : "Drag and drop images here, or click Upload Images to get started."}
              </p>
              {!debSearch && !activeTag && (
                <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1.5" /> Upload Images
                </Button>
              )}
            </div>
          )}

          {/* Grid view */}
          {!loading && viewMode === "grid" && (items.length > 0 || uploadJobs.length > 0) && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
              {/* Upload progress cards */}
              {uploadJobs.map((job, i) => (
                <UploadCard key={`upload-${i}`} name={job.name} done={job.done} />
              ))}
              {/* Items */}
              {items.map(item => (
                <MediaCard
                  key={item.id}
                  item={item}
                  isSelected={multiSel.has(item.id)}
                  onSelect={e => toggleMultiSelect(e, item.id)}
                  onClick={() => { setSelected(item); }}
                  onCopyUrl={() => copyUrl(item)}
                />
              ))}
            </div>
          )}

          {/* List view */}
          {!loading && viewMode === "list" && items.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground">
                    <th className="w-8 px-3 py-2.5"><span className="sr-only">Select</span></th>
                    <th className="w-10 px-2 py-2.5 text-left">Preview</th>
                    <th className="px-3 py-2.5 text-left">Filename</th>
                    <th className="px-3 py-2.5 text-left hidden md:table-cell">Tags</th>
                    <th className="px-3 py-2.5 text-left hidden lg:table-cell">Size</th>
                    <th className="px-3 py-2.5 text-left hidden lg:table-cell">Uploaded</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const tags = parseTags(item.tags);
                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          "border-t border-border cursor-pointer hover:bg-muted/30 transition-colors",
                          selected?.id === item.id && "bg-primary/5",
                          idx % 2 === 0 ? "bg-background" : "bg-muted/10",
                        )}
                        onClick={() => setSelected(item)}
                      >
                        <td className="px-3 py-2" onClick={e => toggleMultiSelect(e, item.id)}>
                          <div className={cn(
                            "h-4 w-4 rounded border-2 flex items-center justify-center",
                            multiSel.has(item.id) ? "bg-primary border-primary" : "border-border",
                          )}>
                            {multiSel.has(item.id) && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <img src={imgUrl(item.url)} alt="" className="h-8 w-8 rounded object-cover border border-border" />
                        </td>
                        <td className="px-3 py-2 max-w-[200px]">
                          <p className="font-medium truncate text-xs">{item.originalName}</p>
                          <p className="text-muted-foreground text-[10px] truncate">{item.mimeType}</p>
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {tags.slice(0, 3).map(t => (
                              <span key={t} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{t}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                          {fmtSize(item.sizeBytes)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                          {fmtDate(item.uploadedAt)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); copyUrl(item); }}
                            className="h-7 w-7 rounded inline-flex items-center justify-center hover:bg-muted transition-colors"
                            title="Copy URL"
                          >
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Load more */}
          {hasMore && !loading && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadItems(page + 1)}
                disabled={loadingMore}
              >
                {loadingMore ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Load more ({total - items.length} remaining)
              </Button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <DetailPanel
            item={selected}
            onClose={() => setSelected(null)}
            onUpdated={updated => {
              setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
              setSelected(updated);
            }}
            onDeleted={id => {
              setItems(prev => prev.filter(i => i.id !== id));
              setTotal(t => t - 1);
              setSelected(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
