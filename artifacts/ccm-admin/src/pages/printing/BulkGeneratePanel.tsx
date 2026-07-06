import { useState, useEffect, useMemo, useRef } from "react";
import { Printer, Search, ChevronDown, ChevronUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DOC_TYPES, type DocTypeId } from "./doc-types";
import { loadTemplates, getTemplatesCached, type CachedTemplate } from "./templateCache";
import { printHtmlDocument } from "@/lib/print-utils";
import {
  useListAdminAcademicYears,
  useListAdminClasses,
  useListAdminStudents,
  getListAdminStudentsQueryKey,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Print helpers ─────────────────────────────────────────────────────────────

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

function buildPrintHtml(tpl: TemplateData, records: Record<string, string>[]): string {
  const dims   = PAGE_PX[tpl.pageSize] ?? PAGE_PX.A4;
  const isL    = tpl.orientation === "landscape";
  const w      = isL ? dims.height : dims.width;
  const h      = isL ? dims.width  : dims.height;
  const bgAbsUrl = tpl.bgImageUrl
    ? (tpl.bgImageUrl.startsWith("/") ? window.location.origin + tpl.bgImageUrl : tpl.bgImageUrl)
    : null;
  const bgStyle = bgAbsUrl
    ? `background-image:url('${bgAbsUrl}');background-size:cover;background-position:center;opacity:0.12;pointer-events:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;`
    : "";
  const pages = records.map(values => {
    let body = tpl.content;
    for (const [key, val] of Object.entries(values)) {
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function BulkGeneratePanel({ docTypeId }: { docTypeId: DocTypeId }) {
  const activeType = DOC_TYPES.find(d => d.id === docTypeId) ?? DOC_TYPES[0];

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [yearId,           setYearId]           = useState("");
  const [statusFilter,     setStatusFilter]      = useState("active");
  const [selectedClasses,  setSelectedClasses]   = useState<string[]>([]);
  const [selectedSections, setSelectedSections]  = useState<string[]>([]);
  const [searchQ,          setSearchQ]           = useState("");

  // ── Selection & shared fields ────────────────────────────────────────────────
  const [checkedIds,    setCheckedIds]    = useState<Set<string>>(new Set());
  const [sharedValues,  setSharedValues]  = useState<Record<string, string>>({});
  const [sharedOpen,    setSharedOpen]    = useState(true);

  // ── Template ─────────────────────────────────────────────────────────────────
  const [template,    setTemplate]    = useState<TemplateData | null>(null);
  const [tplLoading,  setTplLoading]  = useState(false);

  // Load template when doc type changes; reset selection & shared fields
  useEffect(() => {
    setCheckedIds(new Set());
    setSharedValues({});
    const docType = DOC_TYPES.find(d => d.id === docTypeId) ?? DOC_TYPES[0];
    const defaultT: TemplateData = {
      content: docType.defaultContent, pageSize: "A4", orientation: "portrait",
      marginTop: 20, marginRight: 15, marginBottom: 20, marginLeft: 15, bgImageUrl: null,
    };
    const applyRaw = (raw: CachedTemplate | undefined) =>
      setTemplate(raw ? { ...raw, content: raw.content || docType.defaultContent } : defaultT);
    const synced = getTemplatesCached();
    if (synced) { applyRaw(synced[docTypeId]); return; }
    setTplLoading(true);
    loadTemplates()
      .then(data => applyRaw(data[docTypeId]))
      .catch(() => setTemplate(defaultT))
      .finally(() => setTplLoading(false));
  }, [docTypeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── API data ─────────────────────────────────────────────────────────────────
  const { data: yearsRaw = [] } = useListAdminAcademicYears();
  const years = yearsRaw as any[];

  const { data: classesRaw = [] } = useListAdminClasses();
  const classes = classesRaw as any[];

  // Auto-default year once loaded
  useEffect(() => {
    if (!yearId && years.length > 0) {
      const def = years.find((y: any) => y.isDefault) ?? years[0];
      if (def?.id) setYearId(def.id);
    }
  }, [years, yearId]);

  // Sections derived from class records (embedded sections array)
  const allSections = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; name: string; classCode: string }> = [];
    for (const c of classes) {
      for (const s of (c.sections ?? [])) {
        if (!seen.has(s.id)) { seen.add(s.id); out.push({ id: s.id, name: s.name, classCode: c.code }); }
      }
    }
    return out;
  }, [classes]);

  const visibleSections = useMemo(
    () => selectedClasses.length > 0 ? allSections.filter(s => selectedClasses.includes(s.classCode)) : allSections,
    [allSections, selectedClasses],
  );

  const sectionMap = useMemo(
    () => Object.fromEntries(allSections.map(s => [s.id, s.name])) as Record<string, string>,
    [allSections],
  );
  const classMap = useMemo(
    () => Object.fromEntries(classes.map((c: any) => [c.code, c.name])) as Record<string, string>,
    [classes],
  );

  // Student list
  const studentParams = {
    classCodes:     selectedClasses.length  > 0 ? selectedClasses.join(",")  : undefined,
    sectionIds:     selectedSections.length > 0 ? selectedSections.join(",") : undefined,
    status:         statusFilter === "all" ? undefined : statusFilter || undefined,
    q:              searchQ || undefined,
    pageSize:       2000,
  };
  const sqKey = getListAdminStudentsQueryKey(studentParams);
  const { data: studentsPage, isFetching: studentsLoading } = useListAdminStudents(studentParams, {
    query: { queryKey: sqKey },
  });
  const students: any[] = (studentsPage as any)?.items ?? [];

  // Reset selection when filter changes (not on students array — that causes re-render loops)
  const filterKey = `${yearId}|${selectedClasses.join(",")}|${selectedSections.join(",")}|${statusFilter}`;
  useEffect(() => { setCheckedIds(new Set()); }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Template tags ─────────────────────────────────────────────────────────────
  const usedTags = useMemo<string[]>(() => {
    if (!template?.content) return [];
    const m = template.content.match(/\{\{([^}]+)\}\}/g) ?? [];
    return [...new Set(m.map(t => t.slice(2, -2)))];
  }, [template?.content]);

  // Tags that are auto-filled from student DB vs tags that need manual "shared" input
  const autoTagKeys = useMemo(() => {
    if (!activeType.studentFieldMap) return new Set<string>();
    const dummy = activeType.studentFieldMap({}, {}, {});
    return new Set(Object.keys(dummy));
  }, [activeType]);

  const sharedTags = useMemo(
    () => usedTags.filter(t => !autoTagKeys.has(t)),
    [usedTags, autoTagKeys],
  );

  // ── Selection helpers ─────────────────────────────────────────────────────────
  const allChecked  = students.length > 0 && students.every(s => checkedIds.has(s.id));
  const someChecked = checkedIds.size > 0;
  const headerCbRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someChecked && !allChecked;
  }, [someChecked, allChecked]);

  function toggleStudent(id: string) {
    setCheckedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    allChecked ? setCheckedIds(new Set()) : setCheckedIds(new Set(students.map((s: any) => s.id)));
  }

  // ── Print ─────────────────────────────────────────────────────────────────────
  function handlePrint() {
    if (!template || checkedIds.size === 0) return;
    const selected = students.filter(s => checkedIds.has(s.id));
    const records  = selected.map(s => {
      const autoVals = activeType.studentFieldMap ? activeType.studentFieldMap(s, sectionMap, classMap) : {};
      return { ...sharedValues, ...autoVals };
    });
    const html = buildPrintHtml(template, records);
    printHtmlDocument(html);
  }

  // ── Pill toggle helpers ───────────────────────────────────────────────────────
  function toggleClass(code: string) {
    setSelectedClasses(p => p.includes(code) ? p.filter(x => x !== code) : [...p, code]);
    setSelectedSections(p => p.filter(id => allSections.some(s => s.id === id && !s.classCode.includes(code))));
  }
  function toggleSection(id: string) {
    setSelectedSections(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Filter bar ── */}
      <div className="shrink-0 border-b border-border bg-muted/5 px-5 py-4 space-y-3">

        {/* Row 1: Year + Status */}
        <div className="flex gap-3 flex-wrap">
          <div className="min-w-[180px] flex-1 max-w-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Academic Year <span className="text-destructive">*</span>
            </p>
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select year…" />
              </SelectTrigger>
              <SelectContent>
                {years.map((y: any) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}{y.isDefault ? " (current)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[140px] max-w-[180px]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Status</p>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: Class pills */}
        {classes.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Classes <span className="text-muted-foreground/50 normal-case font-normal">(leave blank for all)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {classes.map((c: any) => {
                const active = selectedClasses.includes(c.code);
                return (
                  <button
                    key={c.code}
                    onClick={() => toggleClass(c.code)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs border transition-all font-medium",
                      active
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background border-border hover:border-primary/50 text-foreground",
                    )}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Row 3: Section pills (only when relevant sections exist) */}
        {visibleSections.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Sections <span className="text-muted-foreground/50 normal-case font-normal">(leave blank for all)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {visibleSections.map(s => {
                const active = selectedSections.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSection(s.id)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs border transition-all font-medium",
                      active
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background border-border hover:border-primary/50 text-foreground",
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Row 4: Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search by name, Applicant ID or phone…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>
      </div>

      {/* ── Shared fields (collapsible) ── */}
      {sharedTags.length > 0 && (
        <div className="shrink-0 border-b border-border">
          <button
            onClick={() => setSharedOpen(p => !p)}
            className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-muted/30 transition-colors"
          >
            <span className="text-xs font-semibold text-foreground">
              Shared Fields
              <span className="ml-1.5 text-muted-foreground font-normal">
                — same for every student ({sharedTags.length} field{sharedTags.length !== 1 ? "s" : ""} to fill)
              </span>
            </span>
            {sharedOpen
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            }
          </button>
          {sharedOpen && (
            <div className="px-5 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 bg-muted/5">
              {sharedTags.map(key => {
                const entry = activeType.tagGroups.flatMap(g => g.tags).find(t => t.tag.slice(2, -2) === key);
                const label = entry?.label ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                return (
                  <div key={key}>
                    <Label className="text-xs font-medium text-foreground">{label}</Label>
                    <Input
                      className="mt-1 h-8 text-sm"
                      placeholder={`{{${key}}}`}
                      value={sharedValues[key] ?? ""}
                      onChange={e => setSharedValues(p => ({ ...p, [key]: e.target.value }))}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Student table ── */}
      <div className="flex-1 min-h-0 overflow-auto">
        {tplLoading ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            Loading template…
          </div>
        ) : !template?.content ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
            <activeType.icon className="h-10 w-10 opacity-20" />
            <p className="text-sm text-center">
              No template for <b>{activeType.label}</b>.{" "}
              <span className="text-muted-foreground">Design one in the <b>Template</b> tab first.</span>
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm border-b border-border">
              <tr>
                <th className="w-10 px-4 py-2.5 text-left">
                  <input
                    type="checkbox"
                    ref={headerCbRef}
                    checked={allChecked}
                    onChange={toggleAll}
                    className="rounded cursor-pointer"
                  />
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Student</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Applicant ID</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Class</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Section</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Father's Name</th>
              </tr>
            </thead>
            <tbody>
              {studentsLoading && students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-sm text-muted-foreground">
                    Loading students…
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Users className="h-8 w-8 opacity-30" />
                      <p className="text-sm">No students match the current filter.</p>
                    </div>
                  </td>
                </tr>
              ) : students.map((s: any) => {
                const checked = checkedIds.has(s.id);
                return (
                  <tr
                    key={s.id}
                    onClick={() => toggleStudent(s.id)}
                    className={cn(
                      "border-b border-border cursor-pointer transition-colors select-none",
                      checked ? "bg-primary/5 hover:bg-primary/8" : "hover:bg-muted/30",
                    )}
                  >
                    <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStudent(s.id)}
                        className="rounded cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {s.fullName || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">
                      {s.applicantId ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {classMap[s.classCode] ?? s.classCode ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {sectionMap[s.sectionId] ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {s.fatherName ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 border-t border-border px-5 py-3 flex items-center justify-between bg-background">
        <span className="text-sm text-muted-foreground">
          {studentsLoading
            ? "Loading…"
            : `${students.length} student${students.length !== 1 ? "s" : ""} found`
          }
          {someChecked && (
            <span className="ml-1.5 font-medium text-foreground">
              · {checkedIds.size} selected
            </span>
          )}
        </span>
        <div className="flex items-center gap-3">
          {someChecked && (
            <button
              onClick={() => setCheckedIds(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear selection
            </button>
          )}
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={handlePrint}
            disabled={!someChecked || !template || tplLoading}
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Generate &amp; Print{someChecked ? ` (${checkedIds.size})` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
