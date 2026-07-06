import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, X, Loader2, Save, FileImage, RotateCcw, Info, Layout, Eye, EyeOff,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  fetchPrintSettings,
  savePrintLayout,
  uploadPrintBg,
  deletePrintBg,
  type PrintSettings,
  DEFAULT_PRINT_SETTINGS,
} from "@/lib/print-utils";
import { DOC_TYPES, type DocTypeId } from "@/pages/printing/doc-types";
import { loadTemplates, getTemplatesCached, patchTemplateCache } from "@/pages/printing/templateCache";

// ─── A4 Diagram ───────────────────────────────────────────────────────────────

function A4Diagram({
  marginTop,
  marginRight,
  marginBottom,
  marginLeft,
  pageSize,
  orientation,
  bgPreview,
}: {
  marginTop: number; marginRight: number;
  marginBottom: number; marginLeft: number;
  pageSize: string; orientation: string;
  bgPreview?: string | null;
}) {
  // Diagram dimensions (fixed visual canvas)
  const W = 160;
  const H = 226;
  // Actual page dimensions in mm
  const pageMm = pageSize === "A5" ? { w: 148, h: 210 }
    : pageSize === "Letter" ? { w: 216, h: 279 }
    : { w: 210, h: 297 };

  const pw = orientation === "landscape" ? pageMm.h : pageMm.w;
  const ph = orientation === "landscape" ? pageMm.w : pageMm.h;

  // Scale to fit W×H
  const scale = Math.min(W / pw, H / ph);
  const dw = pw * scale;
  const dh = ph * scale;
  const ox = (W - dw) / 2;
  const oy = (H - dh) / 2;

  // Margin in diagram-pixels
  const mt = Math.min(marginTop * scale, dh * 0.45);
  const mr = Math.min(marginRight * scale, dw * 0.45);
  const mb = Math.min(marginBottom * scale, dh * 0.45);
  const ml = Math.min(marginLeft * scale, dw * 0.45);

  // Content rect
  const cx = ox + ml;
  const cy = oy + mt;
  const cw = Math.max(dw - ml - mr, 2);
  const ch = Math.max(dh - mt - mb, 2);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={W + 24}
        height={H + 24}
        viewBox={`-12 -12 ${W + 24} ${H + 24}`}
        className="drop-shadow-md"
      >
        {/* Page background */}
        <rect x={ox} y={oy} width={dw} height={dh} fill={bgPreview ? "url(#bgImg)" : "#fff"} stroke="#d1d5db" strokeWidth="0.75" />
        {bgPreview && (
          <defs>
            <pattern id="bgImg" patternUnits="userSpaceOnUse" x={ox} y={oy} width={dw} height={dh}>
              <image href={bgPreview} x="0" y="0" width={dw} height={dh} preserveAspectRatio="xMidYMid slice" opacity="1" />
            </pattern>
          </defs>
        )}

        {/* Margin shading — top */}
        <rect x={ox} y={oy} width={dw} height={mt} fill="rgba(99,102,241,0.10)" />
        {/* bottom */}
        <rect x={ox} y={oy + dh - mb} width={dw} height={mb} fill="rgba(99,102,241,0.10)" />
        {/* left */}
        <rect x={ox} y={oy + mt} width={ml} height={dh - mt - mb} fill="rgba(99,102,241,0.10)" />
        {/* right */}
        <rect x={ox + dw - mr} y={oy + mt} width={mr} height={dh - mt - mb} fill="rgba(99,102,241,0.10)" />

        {/* Content area */}
        <rect x={cx} y={cy} width={cw} height={ch} fill="rgba(255,255,255,0.70)" stroke="#6366f1" strokeWidth="0.5" strokeDasharray="2 1.5" />

        {/* Content area text lines (visual) */}
        {Array.from({ length: Math.floor(ch / 5.5) }).slice(0, 8).map((_, i) => (
          <rect key={i} x={cx + 3} y={cy + 6 + i * 5.5} width={cw * (i % 3 === 2 ? 0.55 : 0.9)} height={1.8} fill="#d1d5db" rx="0.5" />
        ))}

        {/* Margin dimension labels */}
        {/* Top label */}
        <text x={ox + dw / 2} y={oy + mt / 2 + 1.5} textAnchor="middle" fontSize="5" fill="#6366f1" fontWeight="600">{marginTop}</text>
        {/* Bottom label */}
        <text x={ox + dw / 2} y={oy + dh - mb / 2 + 1.5} textAnchor="middle" fontSize="5" fill="#6366f1" fontWeight="600">{marginBottom}</text>
        {/* Left label */}
        <text x={ox + ml / 2} y={oy + dh / 2 + 1.5} textAnchor="middle" fontSize="5" fill="#6366f1" fontWeight="600" transform={`rotate(-90,${ox + ml / 2},${oy + dh / 2})`}>{marginLeft}</text>
        {/* Right label */}
        <text x={ox + dw - mr / 2} y={oy + dh / 2 + 1.5} textAnchor="middle" fontSize="5" fill="#6366f1" fontWeight="600" transform={`rotate(90,${ox + dw - mr / 2},${oy + dh / 2})`}>{marginRight}</text>

        {/* Page border */}
        <rect x={ox} y={oy} width={dw} height={dh} fill="none" stroke="#9ca3af" strokeWidth="0.75" />
      </svg>
      <p className="text-[10px] text-muted-foreground text-center">
        {pageSize} · {orientation === "portrait" ? "Portrait" : "Landscape"}<br />
        <span className="text-primary/70">Shaded = margins · Dashed = content area</span>
      </p>
    </div>
  );
}

// ─── Margin Input ─────────────────────────────────────────────────────────────

function MarginInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-0">
        <input
          type="number"
          min={0}
          max={80}
          value={value}
          onChange={e => onChange(Math.max(0, Math.min(80, Number(e.target.value))))}
          className="w-14 h-8 rounded-l border border-input bg-background px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="h-8 px-2 flex items-center rounded-r border border-l-0 border-input bg-muted/60 text-xs text-muted-foreground">
          mm
        </span>
      </div>
    </div>
  );
}

// ─── Document Layout Section ──────────────────────────────────────────────────

const _dtAuth = () => ({ Authorization: `Bearer ${localStorage.getItem("ccm_admin_token") ?? ""}` });

type DocLayout = { pageSize: string; orientation: string; marginTop: number; marginRight: number; marginBottom: number; marginLeft: number };

function DocumentLayoutSection({ globalSettings }: { globalSettings: PrintSettings }) {
  const { toast } = useToast();

  const [docType, setDocType] = useState<DocTypeId>((DOC_TYPES.find(d => d.id !== "salary-slip") ?? DOC_TYPES[0]).id);
  const [layout, setLayout] = useState<DocLayout>({
    pageSize: "A4", orientation: "portrait",
    marginTop: 20, marginRight: 15, marginBottom: 20, marginLeft: 15,
  });
  const [saving, setSaving] = useState(false);
  const [loadingType, setLoadingType] = useState(false);

  // Load layout for the selected doc type from cache or API
  const loadForType = useCallback(async (type: DocTypeId) => {
    // Try in-memory cache first
    const cached = getTemplatesCached();
    if (cached?.[type]) {
      const t = cached[type];
      setLayout({ pageSize: t.pageSize, orientation: t.orientation, marginTop: t.marginTop, marginRight: t.marginRight, marginBottom: t.marginBottom, marginLeft: t.marginLeft });
      return;
    }
    // Fetch all templates
    setLoadingType(true);
    try {
      const data = await loadTemplates();
      const t = data[type];
      if (t) setLayout({ pageSize: t.pageSize, orientation: t.orientation, marginTop: t.marginTop, marginRight: t.marginRight, marginBottom: t.marginBottom, marginLeft: t.marginLeft });
    } finally {
      setLoadingType(false);
    }
  }, []);

  // Load on mount and when docType changes
  useEffect(() => { void loadForType(docType); }, [docType, loadForType]);

  function patch(p: Partial<DocLayout>) { setLayout(prev => ({ ...prev, ...p })); }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/print-templates/${docType}/layout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ..._dtAuth() },
        body: JSON.stringify(layout),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: "Save failed", description: body.error ?? `Server returned ${res.status}`, variant: "destructive" });
        return;
      }
      patchTemplateCache(docType, layout);
      toast({ title: "Layout saved", description: `Page layout for ${DOC_TYPES.find(d => d.id === docType)?.label} updated.` });
    } catch {
      toast({ title: "Save failed", description: "Network error — please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function handleResetToGlobal() {
    setLayout({
      pageSize: globalSettings.pageSize,
      orientation: globalSettings.orientation,
      marginTop: globalSettings.marginTop,
      marginRight: globalSettings.marginRight,
      marginBottom: globalSettings.marginBottom,
      marginLeft: globalSettings.marginLeft,
    });
  }

  const activeDef = DOC_TYPES.find(d => d.id === docType)!;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Layout className="h-4 w-4 text-muted-foreground" />
            Document Layout
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Override page size, orientation and margins per document type. Used in the Template Builder and when printing.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={handleResetToGlobal} title="Copy global defaults into these fields">
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to global defaults
        </Button>
      </div>

      {/* Doc type selector */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Document Type</Label>
        <Select value={docType} onValueChange={v => setDocType(v as DocTypeId)}>
          <SelectTrigger className="h-9 text-sm max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOC_TYPES.filter(dt => dt.id !== "salary-slip").map(dt => (
              <SelectItem key={dt.id} value={dt.id}>
                <div className="flex items-center gap-2">
                  <dt.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {dt.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loadingType ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Live diagram */}
          <div className="shrink-0 flex flex-col items-center gap-2 bg-muted/30 rounded-xl border border-border p-5">
            <p className="text-xs font-medium text-muted-foreground mb-1">Live preview</p>
            <A4Diagram
              marginTop={layout.marginTop}
              marginRight={layout.marginRight}
              marginBottom={layout.marginBottom}
              marginLeft={layout.marginLeft}
              pageSize={layout.pageSize}
              orientation={layout.orientation}
            />
          </div>

          {/* Controls */}
          <div className="flex-1 space-y-6 min-w-0">
            {/* Active type badge */}
            <div className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border", activeDef.lightBg)}>
              <activeDef.icon className="h-3.5 w-3.5" />
              {activeDef.label}
            </div>

            {/* Page size + orientation */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Page Size</Label>
                <Select value={layout.pageSize} onValueChange={v => patch({ pageSize: v })}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4 (210 × 297 mm)</SelectItem>
                    <SelectItem value="A5">A5 (148 × 210 mm)</SelectItem>
                    <SelectItem value="Letter">Letter (216 × 279 mm)</SelectItem>
                    <SelectItem value="Legal">Legal (216 × 356 mm)</SelectItem>
                    <SelectItem value="A3">A3 (297 × 420 mm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Orientation</Label>
                <Select value={layout.orientation} onValueChange={v => patch({ orientation: v })}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Margins */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Margins</Label>
              <div className="flex flex-col items-center gap-3">
                <MarginInput label="Top"    value={layout.marginTop}    onChange={v => patch({ marginTop: v })} />
                <div className="flex items-center gap-6">
                  <MarginInput label="Left"  value={layout.marginLeft}   onChange={v => patch({ marginLeft: v })} />
                  <div className="w-24 h-16 rounded border border-dashed border-border/60 bg-muted/30 flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">Content<br />Area</span>
                  </div>
                  <MarginInput label="Right" value={layout.marginRight}  onChange={v => patch({ marginRight: v })} />
                </div>
                <MarginInput label="Bottom" value={layout.marginBottom} onChange={v => patch({ marginBottom: v })} />
              </div>
            </div>

            {/* Quick presets */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Quick presets</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Normal (25/20)",  t: 25, r: 20, b: 25, l: 20 },
                  { label: "Narrow (12/12)",  t: 12, r: 12, b: 12, l: 12 },
                  { label: "Wide (30/25)",    t: 30, r: 25, b: 30, l: 25 },
                  { label: "Certificate",     t: 40, r: 35, b: 40, l: 35 },
                ].map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => patch({ marginTop: p.t, marginRight: p.r, marginBottom: p.b, marginLeft: p.l })}
                    className="h-7 px-3 text-xs rounded-full border border-border bg-background hover:bg-muted hover:border-primary/40 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Save */}
            <Button onClick={handleSave} disabled={saving} size="sm" className="min-w-[160px]">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Layout
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PrintTab() {
  const { toast } = useToast();
  const bgInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [bgPreview, setBgPreview] = useState<string | null>(null); // local preview (data URL)
  const [bgUrl, setBgUrl] = useState<string | null>(null);         // server URL

  // Live margin state (bound to diagram)
  const [marginTop,           setMarginTop]          = useState(DEFAULT_PRINT_SETTINGS.marginTop);
  const [marginRight,         setMarginRight]        = useState(DEFAULT_PRINT_SETTINGS.marginRight);
  const [marginBottom,        setMarginBottom]       = useState(DEFAULT_PRINT_SETTINGS.marginBottom);
  const [marginLeft,          setMarginLeft]         = useState(DEFAULT_PRINT_SETTINGS.marginLeft);
  const [pageSize,            setPageSize]           = useState<"A4" | "A5" | "Letter">(DEFAULT_PRINT_SETTINGS.pageSize);
  const [orientation,         setOrientation]        = useState<"portrait" | "landscape">(DEFAULT_PRINT_SETTINGS.orientation);
  const [showInstituteName,   setShowInstituteName]  = useState(DEFAULT_PRINT_SETTINGS.showInstituteName);
  const [instituteName,       setInstituteName]      = useState(DEFAULT_PRINT_SETTINGS.instituteName);

  // Load settings on mount
  useEffect(() => {
    fetchPrintSettings().then(s => {
      setSettings(s);
      setMarginTop(s.marginTop);
      setMarginRight(s.marginRight);
      setMarginBottom(s.marginBottom);
      setMarginLeft(s.marginLeft);
      setPageSize(s.pageSize as "A4" | "A5" | "Letter");
      setOrientation(s.orientation as "portrait" | "landscape");
      setBgUrl(s.bgImageUrl);
      setShowInstituteName(s.showInstituteName);
      setInstituteName(s.instituteName);
    }).finally(() => setLoading(false));
  }, []);

  // ── Bg image upload ────────────────────────────────────────────────────────

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setBgPreview(dataUrl);
      setUploading(true);
      try {
        const url = await uploadPrintBg(dataUrl, ext);
        setBgUrl(url);
        toast({ title: "Background uploaded", description: "Applied to report and data-table prints." });
      } catch {
        toast({ title: "Upload failed", description: "Could not save background image.", variant: "destructive" });
        setBgPreview(null);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleRemoveBg() {
    setUploading(true);
    try {
      await deletePrintBg();
      setBgUrl(null);
      setBgPreview(null);
      toast({ title: "Background removed" });
    } catch {
      toast({ title: "Remove failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  // ── Save layout ────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      await savePrintLayout({ marginTop, marginRight, marginBottom, marginLeft, pageSize, orientation, showInstituteName });
      toast({ title: "Print settings saved", description: "Margins and page layout updated." });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setMarginTop(DEFAULT_PRINT_SETTINGS.marginTop);
    setMarginRight(DEFAULT_PRINT_SETTINGS.marginRight);
    setMarginBottom(DEFAULT_PRINT_SETTINGS.marginBottom);
    setMarginLeft(DEFAULT_PRINT_SETTINGS.marginLeft);
    setPageSize(DEFAULT_PRINT_SETTINGS.pageSize);
    setOrientation(DEFAULT_PRINT_SETTINGS.orientation);
  }

  const diagramBg = bgPreview ?? bgUrl ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Info banner ── */}
      <div className="flex gap-2.5 rounded-lg border border-blue-200 bg-blue-50 p-3.5 text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
        <p>
          These settings apply to <strong>report and data-table prints</strong> — student
          lists, teacher directories, fee registers, and similar tabular exports.
          For fee vouchers, ID cards, admit cards, DMC, and certificates the background
          and layout are configured per-document in the <strong>Template Builder</strong>.
        </p>
      </div>

      {/* ── Background image ── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Background Image</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            PNG, JPG or WebP — placed behind all printed content. Max ~3 MB recommended.
          </p>
        </div>

        <div className="flex items-start gap-5">
          {/* Preview box */}
          <div
            className={cn(
              "h-28 w-44 rounded-lg border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0 relative",
              (bgPreview || bgUrl) && "border-solid border-border",
            )}
          >
            {bgPreview || bgUrl ? (
              <img
                src={bgPreview ?? bgUrl ?? ""}
                alt="Background"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground/50">
                <FileImage className="h-7 w-7" />
                <span className="text-[10px]">No image</span>
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2.5 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => bgInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              {bgPreview || bgUrl ? "Replace Background" : "Upload Background"}
            </Button>
            {(bgPreview || bgUrl) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleRemoveBg}
                disabled={uploading}
              >
                <X className="h-4 w-4 mr-2" />
                Remove Background
              </Button>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {bgUrl
                ? <span className="text-green-600 font-medium">✓ Saved to server</span>
                : "File will be stored on the server"}
            </p>
          </div>
        </div>

        <input
          ref={bgInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onFileSelected}
        />
      </section>

      <Separator />

      {/* ── Institute name ── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Institute Name</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            The institute name shown on printed documents comes from the tenant profile.
            {instituteName ? (
              <> Current value: <span className="font-medium text-foreground">{instituteName}</span>.</>
            ) : (
              <> No name is set for this tenant yet.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="show-institute-name"
            checked={showInstituteName}
            onCheckedChange={setShowInstituteName}
          />
          <Label htmlFor="show-institute-name" className="text-sm cursor-pointer flex items-center gap-1.5">
            {showInstituteName
              ? <><Eye className="h-3.5 w-3.5 text-muted-foreground" /> Show institute name on all printed certificates and documents</>
              : <><EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> Institute name is hidden from printed documents</>
            }
          </Label>
        </div>
      </section>

      <Separator />

      {/* ── Page layout: diagram + controls side-by-side ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Page Layout</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Margins are applied via CSS <code className="text-[10px] bg-muted px-1 py-0.5 rounded">@page</code> rules — accurate across all browsers.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset defaults
          </Button>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start">

          {/* Live A4 diagram */}
          <div className="shrink-0 flex flex-col items-center gap-2 bg-muted/30 rounded-xl border border-border p-5">
            <p className="text-xs font-medium text-muted-foreground mb-1">Live preview</p>
            <A4Diagram
              marginTop={marginTop}
              marginRight={marginRight}
              marginBottom={marginBottom}
              marginLeft={marginLeft}
              pageSize={pageSize}
              orientation={orientation}
              bgPreview={diagramBg}
            />
          </div>

          {/* Controls */}
          <div className="flex-1 space-y-6 min-w-0">

            {/* Page size + orientation */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Page Size</Label>
                <Select value={pageSize} onValueChange={v => setPageSize(v as "A4" | "A5" | "Letter")}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4 (210 × 297 mm)</SelectItem>
                    <SelectItem value="A5">A5 (148 × 210 mm)</SelectItem>
                    <SelectItem value="Letter">Letter (216 × 279 mm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Orientation</Label>
                <Select value={orientation} onValueChange={v => setOrientation(v as "portrait" | "landscape")}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Margins — cross layout */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Margins</Label>
              <div className="flex flex-col items-center gap-3">
                {/* Top */}
                <MarginInput label="Top" value={marginTop} onChange={setMarginTop} />

                {/* Left · Right row */}
                <div className="flex items-center gap-6">
                  <MarginInput label="Left" value={marginLeft} onChange={setMarginLeft} />

                  {/* Center placeholder */}
                  <div className="w-24 h-16 rounded border border-dashed border-border/60 bg-muted/30 flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">Content<br />Area</span>
                  </div>

                  <MarginInput label="Right" value={marginRight} onChange={setMarginRight} />
                </div>

                {/* Bottom */}
                <MarginInput label="Bottom" value={marginBottom} onChange={setMarginBottom} />
              </div>
            </div>

            {/* Presets */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Quick presets</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Normal (25/20)", t: 25, r: 20, b: 25, l: 20 },
                  { label: "Narrow (12/12)", t: 12, r: 12, b: 12, l: 12 },
                  { label: "Wide (30/25)",   t: 30, r: 25, b: 30, l: 25 },
                  { label: "Certificate",    t: 40, r: 35, b: 40, l: 35 },
                ].map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { setMarginTop(p.t); setMarginRight(p.r); setMarginBottom(p.b); setMarginLeft(p.l); }}
                    className="h-7 px-3 text-xs rounded-full border border-border bg-background hover:bg-muted hover:border-primary/40 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Save global ── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Changes take effect on the next print or PDF export from any module.
        </p>
        <Button onClick={handleSave} disabled={saving} className="min-w-[160px]">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Print Settings
        </Button>
      </div>

      <Separator />

      {/* ── Per-document layout ── */}
      <DocumentLayoutSection
        globalSettings={{ marginTop, marginRight, marginBottom, marginLeft, pageSize, orientation, bgImageUrl: bgUrl, instituteName, showInstituteName }}
      />
    </div>
  );
}
