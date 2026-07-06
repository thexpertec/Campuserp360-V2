import { useState, useEffect, useMemo } from "react";
import { Wand2, RotateCcw, Printer, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DOC_TYPES, type DocTypeId } from "./doc-types";
import { loadTemplates, getTemplatesCached, type CachedTemplate } from "./templateCache";
import { printHtmlDocument } from "@/lib/print-utils";

const PAGE_PX: Record<string, { width: number; height: number }> = {
  A4:     { width: 794,  height: 1123 },
  A5:     { width: 559,  height: 794  },
  Letter: { width: 816,  height: 1056 },
  Legal:  { width: 816,  height: 1344 },
  A3:     { width: 1123, height: 1587 },
};

type TemplateData = {
  content: string; pageSize: string; orientation: string;
  marginTop: number; marginRight: number; marginBottom: number; marginLeft: number;
  bgImageUrl: string | null;
};

type Record_ = { id: string; values: Record<string, string> };

function mkRecord(): Record_ {
  return { id: crypto.randomUUID(), values: {} };
}

function buildPrintHtml(tpl: TemplateData, records: Record_[]): string {
  const dims = PAGE_PX[tpl.pageSize] ?? PAGE_PX.A4;
  const isL  = tpl.orientation === "landscape";
  const w    = isL ? dims.height : dims.width;
  const h    = isL ? dims.width  : dims.height;
  const bgAbsUrl = tpl.bgImageUrl
    ? (tpl.bgImageUrl.startsWith("/") ? window.location.origin + tpl.bgImageUrl : tpl.bgImageUrl)
    : null;
  const bgStyle = bgAbsUrl
    ? `background-image:url('${bgAbsUrl}');background-size:cover;background-position:center;opacity:0.12;pointer-events:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;`
    : "";
  const pages = records.map(rec => {
    let body = tpl.content;
    for (const [key, val] of Object.entries(rec.values)) {
      body = body.split(`{{${key}}}`).join(val);
    }
    body = body.replace(/\{\{[^}]+\}\}/g, "");
    return `<div class="page" style="page-break-after:always;">${bgAbsUrl ? `<div class="page-bg"></div>` : ""}<div class="page-body">${body}</div></div>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      @media print { @page { margin:0; size:${tpl.pageSize} ${tpl.orientation}; } body { margin:0; } .page { page-break-after:always; } }
      body { font-family: Arial, sans-serif; margin: 0; }
      .page { width:${w}px; min-height:${h}px; position:relative; }
      .page-bg { position:absolute; inset:0; z-index:0; ${bgStyle} }
      .page-body { position:relative; z-index:1; padding:${Math.round(tpl.marginTop*3.78)}px ${Math.round(tpl.marginRight*3.78)}px ${Math.round(tpl.marginBottom*3.78)}px ${Math.round(tpl.marginLeft*3.78)}px; box-sizing:border-box; }
      table { border-collapse: collapse; }
    </style>
  </head><body>
    ${pages}
  </body></html>`;
}

export default function GeneratePanel({ docTypeId }: { docTypeId: DocTypeId }) {
  const [template, setTemplate]   = useState<TemplateData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [records, setRecords]     = useState<Record_[]>([mkRecord()]);
  const [activeRec, setActiveRec] = useState(0);

  const activeType = DOC_TYPES.find(d => d.id === docTypeId) ?? DOC_TYPES[0];

  useEffect(() => {
    setRecords([mkRecord()]);
    setActiveRec(0);
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

  function setVal(recId: string, key: string, val: string) {
    setRecords(prev => prev.map(r => r.id === recId ? { ...r, values: { ...r.values, [key]: val } } : r));
  }

  function addRecord() {
    const r = mkRecord();
    setRecords(prev => [...prev, r]);
    setActiveRec(records.length);
  }

  function removeRecord(idx: number) {
    if (records.length === 1) return;
    setRecords(prev => prev.filter((_, i) => i !== idx));
    setActiveRec(Math.min(activeRec, records.length - 2));
  }

  function clearRecord(recId: string) {
    setRecords(prev => prev.map(r => r.id === recId ? { ...r, values: {} } : r));
  }

  const handleGenerate = () => {
    if (!template) return;
    const filled = records.filter(r => Object.values(r.values).some(v => v.trim()));
    if (filled.length === 0) { handleGenerateSingle(records[0]); return; }
    const html = buildPrintHtml(template, filled.length > 0 ? filled : records);
    printHtmlDocument(html);
  };

  const handleGenerateSingle = (rec: Record_) => {
    if (!template) return;
    const html = buildPrintHtml(template, [rec]);
    printHtmlDocument(html, { autoPrint: false });
  };

  const rec = records[activeRec] ?? records[0];
  const filledCount = records.filter(r => Object.values(r.values).some(v => v.trim())).length;

  return (
    <div className="flex h-full min-h-0 overflow-hidden">

      {/* ── Records list sidebar ── */}
      <aside className="w-52 shrink-0 border-r border-border bg-muted/5 flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Records</span>
          <button
            onClick={addRecord}
            className="h-5 w-5 rounded flex items-center justify-center bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {records.map((r, i) => {
            const label = Object.values(r.values).find(v => v.trim()) ?? `Record ${i + 1}`;
            const isFilled = Object.values(r.values).some(v => v.trim());
            return (
              <button
                key={r.id}
                onClick={() => setActiveRec(i)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors group",
                  activeRec === i ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/40",
                )}
              >
                <span className="truncate flex-1">
                  <span className={cn("w-1.5 h-1.5 rounded-full inline-block mr-2 mb-0.5", isFilled ? "bg-emerald-500" : "bg-slate-300")} />
                  {label.length > 18 ? label.slice(0, 18) + "…" : label}
                </span>
                {records.length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); removeRecord(i); }}
                    className="h-4 w-4 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </button>
            );
          })}
        </div>
        <div className="border-t border-border p-3 space-y-2">
          <button
            onClick={addRecord}
            className="w-full flex items-center justify-center gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-primary rounded-lg transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Record
          </button>
          <Button
            size="sm" className="w-full h-8 text-xs"
            onClick={handleGenerate} disabled={!template || loading}
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Print All ({filledCount > 0 ? filledCount : records.length})
          </Button>
        </div>
      </aside>

      {/* ── Form area ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Loading template…</div>
        ) : !template?.content ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <activeType.icon className="h-12 w-12 opacity-20" />
            <p className="text-sm">No template for <b>{activeType.label}</b>.</p>
            <p className="text-xs">Design one in the <b>Template</b> tab first.</p>
          </div>
        ) : (
          <div className="p-6 max-w-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border mb-1", activeType.lightBg)}>
                  <activeType.icon className="h-3.5 w-3.5" />
                  {activeType.label}
                </div>
                <h2 className="text-sm font-semibold text-foreground">Record {activeRec + 1} of {records.length}</h2>
                <p className="text-xs text-muted-foreground">{usedTags.length} fields · {template.pageSize} {template.orientation}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => clearRecord(rec.id)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="h-3 w-3" /> Clear
                </button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleGenerateSingle(rec)} disabled={!template}>
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Preview This
                </Button>
              </div>
            </div>

            {usedTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No <code className="text-xs bg-muted px-1 rounded">{"{{tags}}"}</code> in this template.</p>
            ) : (
              <div className="space-y-6">
                {activeType.tagGroups.map(grp => {
                  const groupTags = grp.tags.filter(t => usedTags.includes(t.tag.slice(2, -2)));
                  if (groupTags.length === 0) return null;
                  return (
                    <div key={grp.group}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 border-b border-border pb-1">{grp.group}</p>
                      <div className="grid grid-cols-2 gap-3">
                        {groupTags.map(t => {
                          const key = t.tag.slice(2, -2);
                          return (
                            <div key={key}>
                              <Label className="text-xs font-medium text-foreground">{t.label}</Label>
                              <Input
                                className="mt-1 h-8 text-sm"
                                placeholder={t.tag}
                                value={rec.values[key] ?? ""}
                                onChange={e => setVal(rec.id, key, e.target.value)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {/* Tags not in any group */}
                {(() => {
                  const ungrouped = usedTags.filter(t => !activeType.tagGroups.flatMap(g => g.tags).some(e => e.tag.slice(2,-2) === t));
                  if (ungrouped.length === 0) return null;
                  return (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 border-b border-border pb-1">Other</p>
                      <div className="grid grid-cols-2 gap-3">
                        {ungrouped.map(key => (
                          <div key={key}>
                            <Label className="text-xs font-medium text-foreground">{key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</Label>
                            <Input
                              className="mt-1 h-8 text-sm"
                              placeholder={`{{${key}}}`}
                              value={rec.values[key] ?? ""}
                              onChange={e => setVal(rec.id, key, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
