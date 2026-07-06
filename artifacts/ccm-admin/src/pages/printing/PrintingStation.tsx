import { useState, useEffect, useMemo, useRef } from "react";
import { Printer, ChevronDown, ChevronRight, Eye, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DOC_TYPES, type DocTypeId, type DocTypeDef } from "./doc-types";
import { printHtmlDocument } from "@/lib/print-utils";

const auth = () => ({
  Authorization: `Bearer ${localStorage.getItem("ccm_admin_token") ?? ""}`,
  "X-Tenant-Id": localStorage.getItem("ccm_admin_website_tenant") || "ccm",
});

type TemplateData = {
  content:      string;
  pageSize:     string;
  orientation:  string;
  marginTop:    number;
  marginRight:  number;
  marginBottom: number;
  marginLeft:   number;
  bgImageUrl:   string | null;
};

const PAGE_PX: Record<string, { width: number; height: number }> = {
  A4:     { width: 794,  height: 1123 },
  A5:     { width: 559,  height: 794  },
  Letter: { width: 816,  height: 1056 },
  Legal:  { width: 816,  height: 1344 },
  A3:     { width: 1123, height: 1587 },
};

function buildPrintHtml(template: TemplateData, values: Record<string, string>, bgUrl: string | null): string {
  const dims  = PAGE_PX[template.pageSize] ?? PAGE_PX.A4;
  const isL   = template.orientation === "landscape";
  const w     = isL ? dims.height : dims.width;
  const h     = isL ? dims.width  : dims.height;

  let body = template.content;
  for (const [key, val] of Object.entries(values)) {
    body = body.split(`{{${key}}}`).join(val);
  }
  body = body.replace(/\{\{[^}]+\}\}/g, "");

  const bgAbsUrl = bgUrl
    ? (bgUrl.startsWith("/") ? window.location.origin + bgUrl : bgUrl)
    : null;
  const bgStyle = bgAbsUrl
    ? `background-image:url('${bgAbsUrl}');background-size:cover;background-position:center;opacity:0.12;pointer-events:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      @media print { @page { margin:0; size:${template.pageSize} ${template.orientation}; } body { margin:0; } }
      body { font-family: Arial, sans-serif; margin: 0; }
      .page { width:${w}px; min-height:${h}px; position: relative; }
      .page-bg { position:absolute; inset:0; z-index:0; ${bgStyle} }
      .page-body {
        position: relative; z-index: 1;
        padding: ${Math.round(template.marginTop * 3.78)}px ${Math.round(template.marginRight * 3.78)}px ${Math.round(template.marginBottom * 3.78)}px ${Math.round(template.marginLeft * 3.78)}px;
        box-sizing: border-box;
      }
      table { border-collapse: collapse; }
    </style>
  </head><body>
    <div class="page">${bgAbsUrl ? `<div class="page-bg"></div>` : ""}<div class="page-body">${body}</div></div>
  </body></html>`;
}

// ── Tag input form ─────────────────────────────────────────────────────────────
function TagForm({
  tags, values, onChange, onReset,
}: { tags: string[]; values: Record<string, string>; onChange: (key: string, val: string) => void; onReset: () => void }) {
  if (!tags.length) return (
    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
      No placeholders found in this template. Save the template with <code className="text-xs bg-muted px-1 py-0.5 rounded">{`{{tags}}`}</code> to see data fields here.
    </div>
  );
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">FILL IN VALUES</span>
        <button onClick={onReset} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          <RotateCcw className="h-3 w-3" /> Clear all
        </button>
      </div>
      {tags.map(tag => (
        <div key={tag}>
          <Label className="text-xs text-muted-foreground">{tag.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</Label>
          <Input
            className="mt-1 h-8 text-sm"
            placeholder={`{{${tag}}}`}
            value={values[tag] ?? ""}
            onChange={e => onChange(tag, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PrintingStation() {
  const [activeId, setActiveId]     = useState<DocTypeId>("salary-slip");
  const [template, setTemplate]     = useState<TemplateData | null>(null);
  const [loading, setLoading]       = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(true);
  const [openType, setOpenType]     = useState(true);
  const printRef = useRef<HTMLIFrameElement>(null);

  const activeType: DocTypeDef = DOC_TYPES.find(d => d.id === activeId) ?? DOC_TYPES[0];

  // Load template from API
  useEffect(() => {
    setLoading(true);
    setTemplate(null);
    fetch(`/api/admin/print-templates/${activeId}`, { headers: auth() })
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        setTemplate({
          content:      String(data.content ?? ""),
          pageSize:     String(data.pageSize ?? "A4"),
          orientation:  String(data.orientation ?? "portrait"),
          marginTop:    Number(data.marginTop  ?? 20),
          marginRight:  Number(data.marginRight ?? 15),
          marginBottom: Number(data.marginBottom ?? 20),
          marginLeft:   Number(data.marginLeft ?? 15),
          bgImageUrl:   (data.bgImageUrl as string | null) ?? null,
        });
        setFieldValues({});
        setLoading(false);
      })
      .catch(() => { setTemplate(null); setLoading(false); });
  }, [activeId]);

  // Extract unique placeholder tags from template content
  const usedTags = useMemo<string[]>(() => {
    if (!template?.content) return [];
    const m = template.content.match(/\{\{([^}]+)\}\}/g) ?? [];
    return [...new Set(m.map(t => t.slice(2, -2)))];
  }, [template?.content]);

  // Live preview HTML (tags shown dimly if not filled)
  const previewHtml = useMemo<string>(() => {
    if (!template?.content) return "";
    let html = template.content;
    for (const tag of usedTags) {
      const val = fieldValues[tag];
      html = html.split(`{{${tag}}}`).join(
        val
          ? `<span style="background:#fef9c3;border-radius:2px;padding:0 2px">${val}</span>`
          : `<span style="color:#d1d5db;font-size:0.85em">{{${tag}}}</span>`,
      );
    }
    return html;
  }, [template, usedTags, fieldValues]);

  const dims   = PAGE_PX[template?.pageSize ?? "A4"] ?? PAGE_PX.A4;
  const isL    = template?.orientation === "landscape";
  const pageW  = isL ? dims.height : dims.width;
  const pageH  = isL ? dims.width  : dims.height;

  const handlePrint = () => {
    if (!template) return;
    const html = buildPrintHtml(template, fieldValues, template.bgImageUrl);
    printHtmlDocument(html);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-border bg-background">
        <div>
          <h1 className="text-base font-semibold">Printing Station</h1>
          <p className="text-xs text-muted-foreground">Fill in data, preview, and print any document</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(v => !v)}>
            {showPreview ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
            {showPreview ? "Hide Preview" : "Show Preview"}
          </Button>
          <Button size="sm" onClick={handlePrint} disabled={!template || loading}>
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Left sidebar ── */}
        <aside className="w-72 shrink-0 border-r border-border bg-muted/10 flex flex-col overflow-y-auto">

          {/* Type selector */}
          <div className="border-b border-border">
            <button
              className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-semibold text-muted-foreground hover:bg-muted/40 transition-colors"
              onClick={() => setOpenType(v => !v)}
            >
              <span>DOCUMENT TYPE</span>
              {openType ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            {openType && (
              <div className="p-2 space-y-0.5">
                {DOC_TYPES.map(dt => (
                  <button
                    key={dt.id}
                    onClick={() => setActiveId(dt.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
                      activeId === dt.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted/60 text-foreground",
                    )}
                  >
                    <dt.icon className="h-4 w-4 shrink-0" />
                    <span className="font-medium">{dt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tag value form */}
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading template…</div>
          ) : !template?.content ? (
            <div className="p-4 text-sm text-muted-foreground">
              No template saved yet for <b>{activeType.label}</b>. Go to <b>Templates</b> to design one first.
            </div>
          ) : (
            <TagForm
              tags={usedTags}
              values={fieldValues}
              onChange={(k, v) => setFieldValues(prev => ({ ...prev, [k]: v }))}
              onReset={() => setFieldValues({})}
            />
          )}
        </aside>

        {/* ── Preview area ── */}
        <div className="flex-1 min-w-0 overflow-auto p-6 bg-muted/20">
          {/* Type badge */}
          <div className="flex items-center gap-2 mb-4">
            <div className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border", activeType.lightBg)}>
              <activeType.icon className="h-3.5 w-3.5" />
              {activeType.label}
            </div>
            {template && (
              <span className="text-xs text-muted-foreground">
                {template.pageSize} · {template.orientation}
                {usedTags.length > 0 && ` · ${Object.values(fieldValues).filter(Boolean).length}/${usedTags.length} fields filled`}
              </span>
            )}
          </div>

          {!showPreview ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
              Preview hidden — click Show Preview to display the document.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Loading…</div>
          ) : !template?.content ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <activeType.icon className="h-12 w-12 opacity-20" />
              <p className="text-sm">No template found for <b>{activeType.label}</b>.</p>
              <p className="text-xs">Design one in the <b>Templates</b> tab first.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div
                className="bg-white shadow-2xl mx-auto relative"
                style={{
                  width: `${pageW}px`, minHeight: `${pageH}px`,
                  paddingTop:    Math.round((template.marginTop    ?? 20) * 3.78),
                  paddingRight:  Math.round((template.marginRight  ?? 15) * 3.78),
                  paddingBottom: Math.round((template.marginBottom ?? 20) * 3.78),
                  paddingLeft:   Math.round((template.marginLeft   ?? 15) * 3.78),
                }}
              >
                {template.bgImageUrl && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundImage: `url(${template.bgImageUrl})`,
                      backgroundSize: "cover", backgroundPosition: "center", opacity: 0.1,
                    }}
                  />
                )}
                <div
                  className="tiptap-content prose prose-sm max-w-none relative"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <iframe ref={printRef} className="hidden" title="print-frame" />
    </div>
  );
}
