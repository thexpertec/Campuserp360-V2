import { useState, useEffect, useRef, useCallback } from "react";
import { Search, UploadCloud, Loader2, ImageOff, Check, X } from "lucide-react";
import { getToken } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const API = (import.meta.env.VITE_API_BASE as string) || "";
const LIMIT = 24;

type MediaItem = {
  id: string;
  originalName: string;
  altText: string | null;
  tags: string | null;
  url: string;
};

type ListResponse = { items: MediaItem[]; total: number };

function hdrs(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` };
}

const FALLBACK_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='%23ccc' stroke-width='1.5'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpath d='m21 15-5-5L5 21'/%3E%3C/svg%3E";

export function MediaPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [debSearch, setDebSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadItems = useCallback(async (pg: number, replace: boolean) => {
    pg === 1 ? setLoading(true) : setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        page: String(pg),
        limit: String(LIMIT),
        sort: "newest",
        ...(debSearch ? { q: debSearch } : {}),
        ...(activeTag ? { tag: activeTag } : {}),
      });
      const res = await fetch(`${API}/api/admin/media?${params}`, { headers: hdrs() });
      if (!res.ok) throw new Error(`media list failed: ${res.status}`);
      const data = (await res.json()) as ListResponse;
      setItems(prev => (replace ? data.items : [...prev, ...data.items]));
      setTotal(data.total);
      setPage(pg);
    } catch {
      toast({ title: "Failed to load media library", variant: "destructive" });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debSearch, activeTag, toast]);

  const loadTags = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/media/tags`, { headers: hdrs() });
      if (!res.ok) throw new Error(`media tags failed: ${res.status}`);
      setAllTags((await res.json()) as string[]);
    } catch { /* ignore */ }
  }, []);

  // Reload whenever opened or filters change.
  useEffect(() => {
    if (!open) return;
    loadItems(1, true);
    loadTags();
  }, [open, debSearch, activeTag, loadItems, loadTags]);

  // Reset transient state on close.
  useEffect(() => {
    if (!open) { setSearch(""); setActiveTag(null); }
  }, [open]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`${API}/api/admin/media`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      if (!res.ok) throw new Error("upload failed");
      const item = (await res.json()) as MediaItem;
      onSelect(item.url);
      onClose();
      toast({ title: "Uploaded & selected" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const canLoadMore = items.length < total;

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose from Media Library</DialogTitle>
          <DialogDescription>Pick an existing image or upload a new one.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search images…"
              className="pl-8 h-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-1.5" />}
            Upload new
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleUpload}
          />
        </div>

        {allTags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={cn(
                "text-xs px-2 py-1 rounded-full border transition-colors",
                activeTag === null ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent border-input",
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
                  "text-xs px-2 py-1 rounded-full border transition-colors",
                  activeTag === tag ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent border-input",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-[18rem] max-h-[55vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-72 text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-72 text-muted-foreground text-sm gap-2">
              <ImageOff className="h-8 w-8" />
              No images found. Upload one to get started.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {items.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onSelect(item.url); onClose(); }}
                    className="group relative aspect-square rounded-lg border-2 border-border overflow-hidden hover:border-primary/60 hover:shadow-md transition-all"
                    title={item.originalName}
                  >
                    <img
                      src={item.url}
                      alt={item.altText ?? item.originalName}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).src = FALLBACK_IMG; }}
                    />
                    <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/20 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 bg-primary text-primary-foreground rounded-full h-7 w-7 flex items-center justify-center shadow transition-opacity">
                        <Check className="h-4 w-4" />
                      </span>
                    </div>
                    <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] px-1 py-0.5 truncate text-left">
                      {item.originalName}
                    </span>
                  </button>
                ))}
              </div>
              {canLoadMore && (
                <div className="flex justify-center pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={loadingMore}
                    onClick={() => loadItems(page + 1, false)}
                  >
                    {loadingMore && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
