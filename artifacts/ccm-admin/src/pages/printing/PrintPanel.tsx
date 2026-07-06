import { useState, useEffect, useMemo, useRef } from "react";
import { Printer, RotateCcw, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DOC_TYPES, type DocTypeId } from "./doc-types";
import { loadTemplates, getTemplatesCached, type CachedTemplate } from "./templateCache";
import { printHtmlDocument } from "@/lib/print-utils";

const auth = () => ({
  Authorization: `Bearer ${localStorage.getItem("ccm_admin_token") ?? ""}`,
  "X-Tenant-Id": localStorage.getItem("ccm_admin_website_tenant") || "ccm",
});

type SigEntry = { id: string; name: string; label: string; type: string; url: string };

const PAGE_PX: Record<string, { width: number; height: number }> = {
  A4:     { width: 794,  height: 1123 },
  A5:     { width: 559,  height: 794  },
  Letter: { width: 816,  height: 1056 },
  Legal:  { width: 816,  height: 1344 },
  A3:     { width: 1123, height: 1587 },
};

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

function buildPrintHtml(tpl: TemplateData, values: Record<string, string>): string {
  const dims = PAGE_PX[tpl.pageSize] ?? PAGE_PX.A4;
  const isL  = tpl.orientation === "landscape";
  const w    = isL ? dims.height : dims.width;
  const h    = isL ? dims.width  : dims.height;
  let body   = tpl.content;
  for (const [key, val] of Object.entries(values)) {
    body = body.split(`{{${key}}}`).join(val);
  }
  body = body.replace(/\{\{[^}]+\}\}/g, "");
  const bgAbsUrl = tpl.bgImageUrl
    ? (tpl.bgImageUrl.startsWith("/") ? window.location.origin + tpl.bgImageUrl : tpl.bgImageUrl)
    : null;
  // Rendered as its own low-opacity layer behind the content — matching the
  // editor preview — rather than as the page's own `background-image` at
  // `100% 100%` (which force-stretches the image to the page's exact width
  // and height, distorting its aspect ratio and reading as a full-strength
  // photo colliding with the text on top).
  const bgStyle = bgAbsUrl
    ? `background-image:url('${bgAbsUrl}');background-size:cover;background-position:center;opacity:0.1;pointer-events:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      @media print { @page { margin:0; size:${tpl.pageSize} ${tpl.orientation}; } body { margin:0; } }
      body { font-family: Arial, sans-serif; margin: 0; }
      .page { width:${w}px; min-height:${h}px; position:relative; }
      .page-bg { position:absolute; inset:0; z-index:0; ${bgStyle} }
      .page-body { position:relative; z-index:1; padding:${Math.round(tpl.marginTop*3.78)}px ${Math.round(tpl.marginRight*3.78)}px ${Math.round(tpl.marginBottom*3.78)}px ${Math.round(tpl.marginLeft*3.78)}px; box-sizing:border-box; }
      table { border-collapse: collapse; }
    </style>
  </head><body>
    <div class="page">${bgAbsUrl ? `<div class="page-bg"></div>` : ""}<div class="page-body">${body}</div></div>
  </body></html>`;
}

function isSigStampTag(key: string): boolean {
  return key.startsWith("sig_") || key.startsWith("stamp_");
}

export default function PrintPanel({ docTypeId }: { docTypeId: DocTypeId }) {
  const [template, setTemplate]       = useState<TemplateData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(true);
  const [sigEntries, setSigEntries]   = useState<SigEntry[]>([]);
  const sigEntriesRef                 = useRef<SigEntry[]>([]);

  const activeType = DOC_TYPES.find(d => d.id === docTypeId) ?? DOC_TYPES[0];

  useEffect(() => {
    fetch("/api/admin/print-signatures", { headers: auth() })
      .then(r => r.ok ? r.json() : [])
      .then((data) => { const arr = Array.isArray(data) ? data as SigEntry[] : []; setSigEntries(arr); sigEntriesRef.current = arr; })
      .catch(() => {});
  }, []);

  const sigAutoValues = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const s of sigEntries) {
      const tagKey = `${s.type === "stamp" ? "stamp" : "sig"}_${s.name}`;
      const absUrl = s.url.startsWith("/") ? window.location.origin + s.url : s.url;
      map[tagKey] = `<img src="${absUrl}" style="max-height:${s.type === "stamp" ? "70px" : "50px"};vertical-align:middle;display:inline-block;" alt="${s.label}" />`;
    }
    return map;
  }, [sigEntries]);

  useEffect(() => {
    setFieldValues({});
    const docType = DOC_TYPES.find(d => d.id === docTypeId) ?? DOC_TYPES[0];
    const defaultT: TemplateData = {
      content: docType.defaultContent, pageSize: "A4", orientation: "portrait",
      marginTop: 20, marginRight: 15, marginBottom: 20, marginLeft: 15, bgImageUrl: null,
    };
    const applyRaw = (raw: CachedTemplate | undefined) =>
      setTemplate(raw ? { ...raw, content: raw.content || docType.defaultContent } : defaultT);

    // Sync path: cache warm → instant switch, no loading flash
    const synced = getTemplatesCached();
    if (synced) { applyRaw(synced[docTypeId]); return; }

    // Async path: first ever load
    setLoading(true);
    loadTemplates()
      .then(data => applyRaw(data[docTypeId]))
      .catch(() => setTemplate(defaultT))
      .finally(() => setLoading(false));
  }, [docTypeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const usedTags = useMemo<string[]>(() => {
    if (!template?.content) return [];
    const m = template.content.match(/\{\{([^}]+)\}\}/g) ?? [];
    return [...new Set(m.map(t => t.slice(2, -2)))];
  }, [template?.content]);

  const previewHtml = useMemo(() => {
    if (!template?.content) return "";
    let html = template.content;
    for (const tag of usedTags) {
      if (isSigStampTag(tag)) {
        const autoVal = sigAutoValues[tag];
        html = html.split(`{{${tag}}}`).join(
          autoVal
            ? autoVal
            : `<span style="display:inline-block;width:100px;height:40px;background:#f1f5f9;border:1px dashed #94a3b8;border-radius:4px;vertical-align:middle;opacity:.7"></span>`,
        );
      } else {
        const val = fieldValues[tag];
        html = html.split(`{{${tag}}}`).join(
          val
            ? `<span style="background:#fef9c3;border-radius:2px;padding:0 2px">${val}</span>`
            : `<span style="color:#d1d5db;font-size:0.85em">{{${tag}}}</span>`,
        );
      }
    }
    return html;
  }, [template, usedTags, fieldValues, sigAutoValues]);

  const dims  = PAGE_PX[template?.pageSize ?? "A4"] ?? PAGE_PX.A4;
  const isL   = template?.orientation === "landscape";
  const pageW = isL ? dims.height : dims.width;
  const pageH = isL ? dims.width  : dims.height;

  const handlePrint = () => {
    if (!template) return;
    const allValues = { ...sigAutoValues, ...fieldValues };
    const html = buildPrintHtml(template, allValues);
    printHtmlDocument(html);
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden">

      {/* ── Form sidebar ── */}
      <aside className="w-64 shrink-0 border-r border-border bg-muted/5 flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Fill in Values</span>
          <button
            onClick={() => setFieldValues({})}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="h-3 w-3" /> Clear
          </button>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading template…</div>
        ) : !template?.content ? (
          <div className="p-4 text-sm text-muted-foreground">
            No template found. Go to the <b>Template</b> tab to design one first.
          </div>
        ) : usedTags.filter(t => !isSigStampTag(t)).length === 0 && usedTags.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No <code className="text-xs bg-muted px-1 rounded">{"{{tags}}"}</code> found in this template.
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {activeType.tagGroups.map(grp => {
              const groupTags = grp.tags.map(t => t.tag.slice(2, -2)).filter(t => usedTags.includes(t) && !isSigStampTag(t));
              if (groupTags.length === 0) return null;
              return (
                <div key={grp.group}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{grp.group}</p>
                  <div className="space-y-2">
                    {grp.tags.filter(t => usedTags.includes(t.tag.slice(2, -2)) && !isSigStampTag(t.tag.slice(2, -2))).map(t => {
                      const key = t.tag.slice(2, -2);
                      return (
                        <div key={key}>
                          <Label className="text-xs text-muted-foreground">{t.label}</Label>
                          <Input
                            className="mt-0.5 h-7 text-xs"
                            placeholder={t.tag}
                            value={fieldValues[key] ?? ""}
                            onChange={e => setFieldValues(p => ({ ...p, [key]: e.target.value }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {/* Any tags not in a group (excluding sig/stamp auto-filled tags) */}
            {usedTags
              .filter(t => !isSigStampTag(t) && !activeType.tagGroups.flatMap(g => g.tags).some(e => e.tag.slice(2,-2) === t))
              .map(key => (
                <div key={key}>
                  <Label className="text-xs text-muted-foreground">{key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</Label>
                  <Input
                    className="mt-0.5 h-7 text-xs"
                    placeholder={`{{${key}}}`}
                    value={fieldValues[key] ?? ""}
                    onChange={e => setFieldValues(p => ({ ...p, [key]: e.target.value }))}
                  />
                </div>
              ))
            }
            {/* Auto-filled sig/stamp tags notice */}
            {usedTags.some(isSigStampTag) && (
              <div className="pt-1 border-t border-border">
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Signatures &amp; stamps ({usedTags.filter(isSigStampTag).length}) are inserted automatically from uploaded images.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action bar */}
        <div className="mt-auto border-t border-border p-3 flex flex-col gap-2">
          <Button
            variant="outline" size="sm" className="w-full h-8 text-xs"
            onClick={() => setShowPreview(v => !v)}
          >
            {showPreview ? <EyeOff className="h-3.5 w-3.5 mr-1.5" /> : <Eye className="h-3.5 w-3.5 mr-1.5" />}
            {showPreview ? "Hide Preview" : "Show Preview"}
          </Button>
          <Button
            size="sm" className="w-full h-8 text-xs"
            onClick={handlePrint} disabled={!template || loading}
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Print Document
          </Button>
        </div>
      </aside>

      {/* ── Preview area ── */}
      <div className="flex-1 overflow-auto p-6 bg-muted/20">
        {!showPreview ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
            Preview hidden.
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Loading…</div>
        ) : !template?.content ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <activeType.icon className="h-12 w-12 opacity-20" />
            <p className="text-sm">No template for <b>{activeType.label}</b>.</p>
            <p className="text-xs">Design one in the <b>Template</b> tab first.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <div className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border", activeType.lightBg)}>
                <activeType.icon className="h-3.5 w-3.5" />
                {activeType.label}
              </div>
              <span className="text-xs text-muted-foreground">
                {template.pageSize} · {template.orientation}
                {usedTags.filter(t => !isSigStampTag(t)).length > 0 && ` · ${Object.keys(fieldValues).filter(k => fieldValues[k] && !isSigStampTag(k)).length}/${usedTags.filter(t => !isSigStampTag(t)).length} filled`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <div
                className="bg-white shadow-2xl mx-auto relative"
                style={{
                  width: `${pageW}px`, minHeight: `${pageH}px`,
                  paddingTop:    Math.round(template.marginTop    * 3.78),
                  paddingRight:  Math.round(template.marginRight  * 3.78),
                  paddingBottom: Math.round(template.marginBottom * 3.78),
                  paddingLeft:   Math.round(template.marginLeft   * 3.78),
                }}
              >
                {template.bgImageUrl && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ backgroundImage: `url(${template.bgImageUrl})`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.1 }}
                  />
                )}
                <div className="tiptap-content prose prose-sm max-w-none relative" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
