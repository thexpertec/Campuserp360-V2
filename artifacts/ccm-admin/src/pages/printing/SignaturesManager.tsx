import { useState, useRef, useEffect } from "react";
import { Upload, Trash2, ImageIcon, X, PenLine, Stamp, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const auth = () => ({
  Authorization: `Bearer ${localStorage.getItem("ccm_admin_token") ?? ""}`,
  "X-Tenant-Id": localStorage.getItem("ccm_admin_website_tenant") || "ccm",
});

type SigEntry = {
  id: string;
  name: string;
  label: string;
  type: "signature" | "stamp";
  url: string;
};

type UploadForm = {
  label: string;
  type: "signature" | "stamp";
  dataUrl: string | null;
  fileName: string;
};

function emptyForm(): UploadForm {
  return { label: "", type: "signature", dataUrl: null, fileName: "" };
}

export default function SignaturesManager() {
  const { toast } = useToast();
  const [items, setItems]       = useState<SigEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm]         = useState<UploadForm>(emptyForm());
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/print-signatures", { headers: auth() });
      if (!res.ok) {
        setItems([]);
        toast({ title: "Failed to load signatures", variant: "destructive" });
        return;
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data as SigEntry[] : []);
    } catch {
      toast({ title: "Failed to load signatures", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setForm(f => ({ ...f, dataUrl: ev.target?.result as string, fileName: file.name }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleUpload = async () => {
    if (!form.label.trim()) { toast({ title: "Label is required", variant: "destructive" }); return; }
    if (!form.dataUrl) { toast({ title: "Please select an image", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const res = await fetch("/api/admin/print-signatures", {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({ label: form.label.trim(), type: form.type, dataUrl: form.dataUrl }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: "Upload failed", description: e.error, variant: "destructive" });
        return;
      }
      const row = await res.json() as SigEntry;
      setItems(prev => [...prev, row]);
      setForm(emptyForm());
      toast({ title: `${form.type === "stamp" ? "Stamp" : "Signature"} uploaded`, description: `"${form.label}" is ready to use in templates.` });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/print-signatures/${id}`, { method: "DELETE", headers: auth() });
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: "Delete failed", description: e.error ?? `Server returned ${res.status}`, variant: "destructive" });
        return;
      }
      setItems(prev => prev.filter(i => i.id !== id));
      toast({ title: "Deleted", description: `"${label}" removed.` });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const signatures = items.filter(i => i.type === "signature");
  const stamps     = items.filter(i => i.type === "stamp");

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">

      {/* ── Upload panel ── */}
      <div className="border border-border rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Upload className="h-4 w-4 text-muted-foreground" />
          Upload New Signature or Stamp
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Label</Label>
            <Input
              className="mt-1 h-8 text-xs"
              placeholder="e.g. Principal Signature"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            <div className="flex gap-2 mt-1">
              {(["signature", "stamp"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={cn(
                    "flex-1 h-8 text-xs rounded border capitalize transition-colors flex items-center justify-center gap-1",
                    form.type === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted/60",
                  )}
                >
                  {t === "signature" ? <PenLine className="h-3 w-3" /> : <Stamp className="h-3 w-3" />}
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Image (PNG/WEBP recommended, transparent background)</Label>
          <div
            className={cn(
              "mt-1 h-24 rounded-md border-2 border-dashed flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-muted/40 transition-colors",
              form.dataUrl ? "border-primary/40 bg-primary/5" : "border-border",
            )}
            onClick={() => fileRef.current?.click()}
          >
            {form.dataUrl ? (
              <div className="flex items-center gap-3">
                <img src={form.dataUrl} alt="preview" className="max-h-16 max-w-[200px] object-contain" />
                <button
                  onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, dataUrl: null, fileName: "" })); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Click to choose image</span>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>

        <Button
          size="sm" className="h-8 text-xs"
          onClick={handleUpload}
          disabled={uploading || !form.label.trim() || !form.dataUrl}
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </div>

      {/* ── Usage hint ── */}
      <div className="rounded-md bg-muted/40 border border-border p-4 text-xs text-muted-foreground space-y-1.5">
        <p className="font-medium text-foreground text-[11px] uppercase tracking-wider">How to use in templates</p>
        <p>Insert a signature tag like <code className="bg-background border border-border rounded px-1 py-0.5 text-[11px]">{"{{sig_name}}"}</code> or stamp tag like <code className="bg-background border border-border rounded px-1 py-0.5 text-[11px]">{"{{stamp_name}}"}</code> into any template.</p>
        <p>The image is rendered automatically when printing — no manual input needed.</p>
        <p>Use the <b>Settings &amp; Tags</b> panel in the Template Editor to insert these tags with one click.</p>
      </div>

      {/* ── Signatures list ── */}
      <Section
        title="Signatures"
        icon={<PenLine className="h-4 w-4" />}
        items={signatures}
        loading={loading}
        deletingId={deletingId}
        onDelete={handleDelete}
        emptyText="No signatures uploaded yet."
      />

      {/* ── Stamps list ── */}
      <Section
        title="Stamps"
        icon={<Stamp className="h-4 w-4" />}
        items={stamps}
        loading={loading}
        deletingId={deletingId}
        onDelete={handleDelete}
        emptyText="No stamps uploaded yet."
      />
    </div>
  );
}

function CopyTagButton({ tag }: { tag: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(tag);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy tag"
      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function Section({
  title, icon, items, loading, deletingId, onDelete, emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  items: SigEntry[];
  loading: boolean;
  deletingId: string | null;
  onDelete: (id: string, label: string) => void;
  emptyText: string;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
        {icon}
        {title}
      </h3>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map(item => {
            const tagText = `{{${item.type === "stamp" ? "stamp" : "sig"}_${item.name}}}`;
            return (
              <div key={item.id} className="border border-border rounded-lg p-3 flex items-center gap-3">
                <div className="w-20 h-12 bg-muted/30 rounded flex items-center justify-center shrink-0 overflow-hidden">
                  <img src={item.url} alt={item.label} className="max-w-full max-h-full object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.label}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <code className="text-[10px] text-muted-foreground truncate">{tagText}</code>
                    <CopyTagButton tag={tagText} />
                  </div>
                </div>
                <button
                  onClick={() => onDelete(item.id, item.label)}
                  disabled={deletingId === item.id}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
