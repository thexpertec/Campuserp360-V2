import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Save, Upload, X, ImageIcon, ChevronDown, ChevronRight,
  RotateCcw, Eye, Settings2, SlidersHorizontal, Tag, PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/rich-text-editor";
import {
  DOC_TYPES, buildSampleValues, isCustomDocType, TEMPLATE_PURPOSES,
  type CustomDocTypeDef, type AnyDocTypeDef,
} from "./doc-types";
import { loadTemplates, getTemplatesCached, patchTemplateCache, type CachedTemplate } from "./templateCache";

const auth = () => ({
  Authorization: `Bearer ${localStorage.getItem("ccm_admin_token") ?? ""}`,
  "X-Tenant-Id": localStorage.getItem("ccm_admin_website_tenant") || "ccm",
});

// ── Page dimensions ────────────────────────────────────────────────────────────

const PAGE_SIZES = ["A4", "A5", "Letter", "Legal", "A3"];

const PAGE_PX: Record<string, { width: number; height: number }> = {
  A4:     { width: 794,  height: 1123 },
  A5:     { width: 559,  height: 794  },
  Letter: { width: 816,  height: 1056 },
  Legal:  { width: 816,  height: 1344 },
  A3:     { width: 1123, height: 1587 },
};

// ── Types ──────────────────────────────────────────────────────────────────────

type TemplateState = {
  content:      string;
  pageSize:     string;
  orientation:  string;
  marginTop:    number;
  marginRight:  number;
  marginBottom: number;
  marginLeft:   number;
  bgImageUrl:   string | null;
  purpose:      string | null;
};

function defaultState(): TemplateState {
  return {
    content: "", pageSize: "A4", orientation: "portrait",
    marginTop: 20, marginRight: 15, marginBottom: 20, marginLeft: 15,
    bgImageUrl: null, purpose: null,
  };
}

// ── Sig/stamp placeholder helper ──────────────────────────────────────────────

const SIG_PLACEHOLDER   = `<span style="display:inline-block;width:110px;height:44px;background:#f1f5f9;border:1px dashed #94a3b8;border-radius:4px;vertical-align:middle;opacity:.7"></span>`;
const STAMP_PLACEHOLDER = `<span style="display:inline-block;width:60px;height:60px;background:#f1f5f9;border:1px dashed #94a3b8;border-radius:50%;vertical-align:middle;opacity:.7"></span>`;

function replaceSigStampPlaceholders(html: string): string {
  return html
    .replace(/\{\{sig_[^}]+\}\}/g, SIG_PLACEHOLDER)
    .replace(/\{\{stamp_[^}]+\}\}/g, STAMP_PLACEHOLDER);
}

// ── Sample preview HTML builder ────────────────────────────────────────────────

function buildSampleHtml(tpl: TemplateState, activeType: AnyDocTypeDef): string {
  const dims = PAGE_PX[tpl.pageSize] ?? PAGE_PX.A4;
  const isL  = tpl.orientation === "landscape";
  const w    = isL ? dims.height : dims.width;
  const h    = isL ? dims.width  : dims.height;
  const bgAbsUrl = tpl.bgImageUrl
    ? (tpl.bgImageUrl.startsWith("/") ? window.location.origin + tpl.bgImageUrl : tpl.bgImageUrl)
    : null;

  const sampleVals = buildSampleValues(activeType);
  let body = tpl.content;
  for (const [key, val] of Object.entries(sampleVals)) {
    body = body.split(`{{${key}}}`).join(val);
  }
  body = replaceSigStampPlaceholders(body);
  body = body.replace(/\{\{[^}]+\}\}/g, "");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      @media print { @page { margin:0; size:${tpl.pageSize} ${tpl.orientation}; } body { margin:0; } }
      body { font-family: Arial, sans-serif; margin: 0; }
      .page { width:${w}px; min-height:${h}px; position:relative; }
      .page-body { position:relative; z-index:1; padding:${Math.round(tpl.marginTop*3.78)}px ${Math.round(tpl.marginRight*3.78)}px ${Math.round(tpl.marginBottom*3.78)}px ${Math.round(tpl.marginLeft*3.78)}px; box-sizing:border-box; }
      table { border-collapse: collapse; }
    </style>
  </head><body>
    ${bgAbsUrl ? `<img style="position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:-1;pointer-events:none;" src="${bgAbsUrl}" />` : ""}
    <div class="page"><div class="page-body">${body}</div></div>
  </body></html>`;
}

// ── Page settings panel ────────────────────────────────────────────────────────

function PageSettings({
  state, onChange,
}: { state: TemplateState; onChange: (s: Partial<TemplateState>) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-border">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted/40 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <span>PAGE SETTINGS</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Page Size</Label>
            <select
              className="mt-1 w-full h-8 text-xs border border-border rounded-md bg-background px-2"
              value={state.pageSize}
              onChange={e => onChange({ pageSize: e.target.value })}
            >
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Orientation</Label>
            <div className="flex gap-2 mt-1">
              {(["portrait", "landscape"] as const).map(o => (
                <button
                  key={o}
                  onClick={() => onChange({ orientation: o })}
                  className={cn(
                    "flex-1 h-7 text-xs rounded border capitalize transition-colors",
                    state.orientation === o
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted/60",
                  )}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Margins (mm)</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["marginTop", "marginRight", "marginBottom", "marginLeft"] as const).map(m => (
                <div key={m}>
                  <Label className="text-[10px] text-muted-foreground capitalize">{m.replace("margin", "")}</Label>
                  <Input
                    type="number" min={0} max={80} className="h-7 text-xs mt-0.5"
                    value={state[m]}
                    onChange={e => onChange({ [m]: Number(e.target.value) })}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Purpose panel (custom templates only) ─────────────────────────────────────

function PurposePanel({
  purpose, onChange, allCache,
}: {
  purpose: string | null;
  onChange: (p: string | null) => void;
  allCache: Record<string, CachedTemplate>;
}) {
  const [open, setOpen] = useState(true);

  function handleSelect(newPurpose: string | null) {
    if (!newPurpose) { onChange(null); return; }
    if (newPurpose === purpose) return;
    // Check if another template already holds this purpose
    const holder = Object.entries(allCache).find(([, t]) => t.purpose === newPurpose);
    if (holder) {
      const holderName = holder[1].name;
      const purposeLabel = TEMPLATE_PURPOSES.find(p => p.slug === newPurpose)?.label ?? newPurpose;
      const ok = window.confirm(
        `"${purposeLabel}" is currently assigned to "${holderName}".\n\nMove it to this template?`,
      );
      if (!ok) return;
    }
    onChange(newPurpose);
  }

  return (
    <div className="border-b border-border">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted/40 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <span className="flex items-center gap-1.5"><Tag className="h-3 w-3" /> USED FOR</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          <select
            className="w-full h-8 text-xs border border-border rounded-md bg-background px-2"
            value={purpose ?? ""}
            onChange={e => handleSelect(e.target.value || null)}
          >
            <option value="">General (not tied to a situation)</option>
            {TEMPLATE_PURPOSES.map(p => (
              <option key={p.slug} value={p.slug}>{p.label}</option>
            ))}
          </select>
          <p className="text-[10px] text-muted-foreground leading-tight">
            When set, this template overrides the built-in design for that situation everywhere it is printed.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Background image panel ────────────────────────────────────────────────────

function BgPanel({
  type, bgImageUrl, onUploaded, onRemoved,
}: { type: string; bgImageUrl: string | null; onUploaded: (url: string) => void; onRemoved: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      const dataUrl = ev.target?.result as string;
      const ext = file.name.split(".").pop() ?? "png";
      try {
        const res = await fetch(`/api/admin/print-templates/${type}/bg`, {
          method: "POST", headers: { ...auth(), "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, ext }),
        });
        const data = await res.json() as { url: string };
        if (data.url) onUploaded(data.url);
      } finally { setUploading(false); }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemove = async () => {
    try {
      await fetch(`/api/admin/print-templates/${type}/bg`, { method: "DELETE", headers: auth() });
      onRemoved();
    } catch { /* ignore */ }
  };

  return (
    <div className="border-b border-border">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted/40 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <span>BACKGROUND IMAGE</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {bgImageUrl ? (
            <div className="relative rounded-md overflow-hidden border border-border">
              <img src={bgImageUrl} alt="bg" className="w-full h-24 object-cover" />
              <button
                onClick={handleRemove}
                className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div
              className="h-20 rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Click to upload</span>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {uploading ? "Uploading…" : bgImageUrl ? "Replace" : "Upload Background"}
          </Button>
          <p className="text-[10px] text-muted-foreground leading-tight">Image shown as a faint watermark behind the template content.</p>
        </div>
      )}
    </div>
  );
}

// ── Tag palette panel ──────────────────────────────────────────────────────────

function TagPalette({
  activeType, extraGroups, openGroup, onToggleGroup, onInsert,
}: {
  activeType: AnyDocTypeDef;
  extraGroups: import("./doc-types").TagGroup[];
  openGroup: string | null;
  onToggleGroup: (g: string) => void;
  onInsert: (tag: string) => void;
}) {
  const allGroups = [...activeType.tagGroups, ...extraGroups];
  return (
    <div className="border-b border-border">
      <div className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/30">
        Placeholder Tags
      </div>
      <div className="pb-2">
        {allGroups.map(grp => (
          <div key={grp.group}>
            <button
              className="w-full flex items-center justify-between px-4 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
              onClick={() => onToggleGroup(grp.group)}
            >
              <span>{grp.group}</span>
              {openGroup === grp.group ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {openGroup === grp.group && (
              <div className="px-3 pb-2 flex flex-wrap gap-1">
                {grp.tags.map(t => (
                  <button
                    key={t.tag}
                    title={t.tag}
                    onClick={() => onInsert(t.tag)}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Preview modal ──────────────────────────────────────────────────────────────

function PreviewModal({
  open, onClose, tpl, activeType,
}: {
  open: boolean;
  onClose: () => void;
  tpl: TemplateState;
  activeType: AnyDocTypeDef;
}) {
  const dims = PAGE_PX[tpl.pageSize] ?? PAGE_PX.A4;
  const isL  = tpl.orientation === "landscape";
  const w    = isL ? dims.height : dims.width;
  const h    = isL ? dims.width  : dims.height;

  const sampleVals = buildSampleValues(activeType);
  let body = tpl.content;
  for (const [key, val] of Object.entries(sampleVals)) {
    body = body.split(`{{${key}}}`).join(val);
  }
  body = replaceSigStampPlaceholders(body);
  body = body.replace(/\{\{[^}]+\}\}/g, "");

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[min(900px,95vw)] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <activeType.icon className="h-4 w-4" style={{ color: activeType.color }} />
            <span>{activeType.label}</span>
            <span className="text-muted-foreground font-normal text-xs ml-1">
              — {tpl.pageSize} {tpl.orientation} · sample data preview
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="overflow-x-auto">
            <div
              className="bg-white shadow-2xl mx-auto"
              style={{ width: `${w}px`, minHeight: `${h}px`, position: "relative" }}
            >
              {tpl.bgImageUrl && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: `url(${tpl.bgImageUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    zIndex: 0,
                  }}
                />
              )}
              <div
                className="tiptap-content prose prose-sm max-w-none relative"
                style={{
                  paddingTop:    Math.round(tpl.marginTop    * 3.78),
                  paddingRight:  Math.round(tpl.marginRight  * 3.78),
                  paddingBottom: Math.round(tpl.marginBottom * 3.78),
                  paddingLeft:   Math.round(tpl.marginLeft   * 3.78),
                  zIndex: 1,
                }}
                dangerouslySetInnerHTML={{ __html: body }}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TemplateBuilder({
  activeType, customTypes,
}: { activeType: AnyDocTypeDef; customTypes: CustomDocTypeDef[] }) {
  const { toast } = useToast();
  const [cache, setCache]         = useState<Record<string, TemplateState>>({});
  const [allCache, setAllCache]   = useState<Record<string, CachedTemplate>>({});
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen]   = useState(false);
  const [openGroup, setOpenGroup]       = useState<string | null>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);

  const activeId = activeType.id;
  const current: TemplateState = cache[activeId] ?? defaultState();
  const isCustom = isCustomDocType(activeType);

  const setCurrentState = useCallback((patch: Partial<TemplateState>) => {
    setCache(c => ({ ...c, [activeId]: { ...(c[activeId] ?? defaultState()), ...patch } }));
  }, [activeId]);

  const allTypes: AnyDocTypeDef[] = [...DOC_TYPES, ...customTypes];

  const buildCache = useCallback((data: Record<string, CachedTemplate>) => {
    setAllCache(data);
    const nc: Record<string, TemplateState> = {};
    for (const dt of allTypes) {
      const t = data[dt.id];
      nc[dt.id] = t
        ? {
            content: t.content || dt.defaultContent,
            pageSize: t.pageSize, orientation: t.orientation,
            marginTop: t.marginTop, marginRight: t.marginRight,
            marginBottom: t.marginBottom, marginLeft: t.marginLeft,
            bgImageUrl: t.bgImageUrl,
            purpose: t.purpose ?? null,
          }
        : { ...defaultState(), content: dt.defaultContent };
    }
    return nc;
  }, [allTypes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const synced = getTemplatesCached();
    if (synced) {
      setCache(buildCache(synced));
      setLoading(false);
      return;
    }

    setLoading(true);
    loadTemplates()
      .then(data => setCache(buildCache(data)))
      .catch(() => {
        const fallback: Record<string, TemplateState> = {};
        for (const dt of allTypes) fallback[dt.id] = { ...defaultState(), content: dt.defaultContent };
        setCache(fallback);
      })
      .finally(() => setLoading(false));
  }, [customTypes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading && cache[activeId] !== undefined) {
      editorRef.current?.setContent(cache[activeId]!.content);
    }
    setPreviewOpen(false);
    setOpenGroup(null);
  }, [activeId, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = () => {
    const def = activeType.defaultContent;
    setCurrentState({ content: def });
    editorRef.current?.setContent(def);
  };

  const handlePreview = () => {
    const liveContent = editorRef.current?.getHtml() ?? current.content;
    setCurrentState({ content: liveContent });
    setPreviewOpen(true);
  };

  const handleSave = async () => {
    const content = editorRef.current?.getHtml() ?? current.content;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: activeType.label, content,
        pageSize: current.pageSize, orientation: current.orientation,
        marginTop: current.marginTop, marginRight: current.marginRight,
        marginBottom: current.marginBottom, marginLeft: current.marginLeft,
        purpose: current.purpose ?? null,
      };
      const res = await fetch(`/api/admin/print-templates/${activeId}`, {
        method: "PUT", headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: "Save failed", description: err.error ?? `Server returned ${res.status}`, variant: "destructive" });
        return;
      }
      const saved = await res.json() as { purpose?: string | null };
      const savedPurpose = saved.purpose ?? null;
      patchTemplateCache(activeId, { ...body, purpose: savedPurpose } as Partial<CachedTemplate>);
      // Reassigning a purpose auto-clears it from whichever other type held it
      // server-side; rebuild the full local cache (not just the active entry)
      // so every doc type's "Settings & Tags" panel reflects that immediately.
      const updatedRaw = getTemplatesCached();
      if (updatedRaw) setCache(buildCache(updatedRaw));
      else setCurrentState({ content, purpose: savedPurpose });
      toast({ title: "Template saved", description: `${activeType.label} template updated successfully.` });
    } catch {
      toast({ title: "Save failed", description: "Network error — please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Fetch signatures for tag palette ─────────────────────────────────────
  const [sigItems, setSigItems] = useState<{ id: string; name: string; label: string; type: string; url: string }[]>([]);
  useEffect(() => {
    fetch("/api/admin/print-signatures", { headers: auth() })
      .then(r => r.ok ? r.json() : [])
      .then((data) => setSigItems(Array.isArray(data) ? data as typeof sigItems : []))
      .catch(() => {});
  }, []);

  const sigTagGroup = useMemo(() => {
    if (sigItems.length === 0) return null;
    return {
      group: "Signatures & Stamps",
      tags: sigItems.map(s => ({
        tag: `{{${s.type === "stamp" ? "stamp" : "sig"}_${s.name}}}`,
        label: s.label,
        sampleValue: `<img src="${s.url}" style="max-height:${s.type === "stamp" ? "60px" : "40px"};vertical-align:middle;display:inline-block;" />`,
      })),
    };
  }, [sigItems]);

  const liveContent = current.content;

  return (
    <div className="flex flex-col">

      {/* ── Toolbar strip (pinned so Save/Preview stay reachable) ── */}
      <div className="sticky top-0 z-20 border-b border-border bg-background px-4 py-2 flex items-center gap-2 flex-wrap">
        {/* Doc type badge */}
        <div className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border mr-2", activeType.lightBg)}>
          <activeType.icon className="h-3.5 w-3.5" />
          {activeType.label}
        </div>
        <span className="text-xs text-muted-foreground mr-auto hidden sm:inline">
          {current.pageSize} · {current.orientation}
        </span>

        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={handleReset} title="Reset to default template">
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>

        <Button
          variant="outline" size="sm" className="h-8 text-xs gap-1.5"
          onClick={handlePreview}
          title="Preview with sample data"
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </Button>

        <Button
          variant="outline" size="sm" className="h-8 text-xs gap-1.5"
          onClick={() => setSettingsOpen(true)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Settings &amp; Tags
        </Button>

        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={saving}>
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save Template"}
        </Button>
      </div>

      {/* ── Editor canvas ── */}
      <div className="p-6 bg-muted/20">
        {loading ? (
          <div className="flex items-center justify-center min-h-[calc(100vh-280px)] text-sm text-muted-foreground">
            Loading template…
          </div>
        ) : (
          <div className="w-full">
            <div className="text-xs text-muted-foreground text-center mb-4">
              Open <b>Settings &amp; Tags</b> to insert placeholders. Click <b>Save Template</b> to persist changes.
            </div>
            <div
              className={cn("relative shadow-xl rounded-sm overflow-hidden bg-white", current.bgImageUrl && "ring-2 ring-amber-200/60")}
              style={{ minHeight: "calc(100vh - 280px)" }}
            >
              {current.bgImageUrl && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ backgroundImage: `url(${current.bgImageUrl})`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.1 }}
                />
              )}
              <div className="relative">
                <RichTextEditor
                  ref={editorRef}
                  value={current.content}
                  onChange={c => setCurrentState({ content: c })}
                  placeholder="Design your template here — open Settings & Tags to insert placeholders…"
                  minHeight="calc(100vh - 300px)"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Settings & Tags slide-in panel ── */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-72 p-0 flex flex-col overflow-hidden">
          <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
            <SheetTitle className="text-sm flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Settings &amp; Tags
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <PurposePanel
              purpose={current.purpose}
              onChange={p => setCurrentState({ purpose: p })}
              allCache={allCache}
            />
            <TagPalette
              activeType={activeType}
              extraGroups={sigTagGroup ? [sigTagGroup] : []}
              openGroup={openGroup}
              onToggleGroup={g => setOpenGroup(og => og === g ? null : g)}
              onInsert={tag => {
                editorRef.current?.insertText(tag);
                editorRef.current?.focus();
              }}
            />
            {/* Signatures & Stamps shortcut */}
            {sigItems.length === 0 && (
              <div className="px-4 py-3 border-b border-border">
                <p className="text-[10px] text-muted-foreground leading-snug">
                  <PenLine className="h-3 w-3 inline mr-1 opacity-60" />
                  No signatures or stamps yet. Go to the{" "}
                  <a
                    href="?signaturesTab=1"
                    onClick={e => {
                      e.preventDefault();
                      setSettingsOpen(false);
                      window.dispatchEvent(new CustomEvent("ccm:openSignaturesTab"));
                    }}
                    className="underline text-primary/80 hover:text-primary"
                  >
                    Signatures &amp; Stamps
                  </a>
                  {" "}tab to upload images.
                </p>
              </div>
            )}
            <PageSettings state={current} onChange={setCurrentState} />
            <BgPanel
              type={activeId}
              bgImageUrl={current.bgImageUrl ?? null}
              onUploaded={url => { setCurrentState({ bgImageUrl: url }); patchTemplateCache(activeId, { bgImageUrl: url }); }}
              onRemoved={() => { setCurrentState({ bgImageUrl: null }); patchTemplateCache(activeId, { bgImageUrl: null }); }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Preview modal ── */}
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        tpl={{ ...current, content: liveContent }}
        activeType={activeType}
      />
    </div>
  );
}
