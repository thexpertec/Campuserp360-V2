import { useState, useCallback, useMemo, useEffect, Fragment } from "react";
import { formatDate, formatDateTime, todayIso } from "@/lib/locale";
import {
  Printer, ChevronDown, ChevronUp, CheckCircle2, Wand2,
  RefreshCw, Users, Clock, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { DOC_TYPES, STUDENT_DOC_IDS, type DocTypeId } from "./doc-types";
import { loadTemplates, getTemplatesCached, type CachedTemplate } from "./templateCache";
import { printHtmlDocument } from "@/lib/print-utils";
import { useListAdminClasses, useListAdminAcademicYears } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ── Auth helper ────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Print helpers ──────────────────────────────────────────────────────────────

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
  const dims    = PAGE_PX[tpl.pageSize] ?? PAGE_PX.A4;
  const isL     = tpl.orientation === "landscape";
  const w       = isL ? dims.height : dims.width;
  const h       = isL ? dims.width  : dims.height;
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

// ── Types ──────────────────────────────────────────────────────────────────────

type BatchJobSummary = {
  id:             string;
  documentType:   string;
  academicYearId: string | null;
  studentCount:   number;
  classCodes:     string | null;
  sectionIds:     string | null;
  status:         string;
  generatedAt:    string;
  printedAt:      string | null;
  adminFullName:  string | null;
};

type BatchJobDetail = {
  id:             string;
  documentType:   string;
  academicYearId: string | null;
  status:         string;
  generatedAt:    string;
  printedAt:      string | null;
  adminFullName:  string | null;
  mergeValues:    Record<string, string>;
  students: Array<{
    studentId: string;
    fullName:  string;
    applicantId:  string;
    classCode: string;
    sectionId: string;
    status:    string;
    printedAt: string | null;
  }>;
};

// ── Label helper ──────────────────────────────────────────────────────────────

function docTypeLabel(id: string): string {
  return DOC_TYPES.find(d => d.id === id)?.label ?? id;
}

function docTypeColor(id: string): string {
  return DOC_TYPES.find(d => d.id === id)?.color ?? "#64748b";
}

function fmtDate(iso: string): string {
  return formatDate(iso);
}

function fmtDateTime(iso: string): string {
  return formatDateTime(iso);
}

// ── Expanded job row ──────────────────────────────────────────────────────────

function JobDetailPanel({
  jobId,
  documentType,
  onClose,
}: {
  jobId:        string;
  documentType: string;
  onClose:      () => void;
}) {
  const [detail,    setDetail]    = useState<BatchJobDetail | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [reprinting, setReprinting] = useState(false);
  const [reprintDone, setReprintDone] = useState(false);

  const { data: classesRaw = [] } = useListAdminClasses();
  const classes = classesRaw as any[];

  const sectionMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of classes) {
      for (const s of (c.sections ?? [])) map[s.id] = s.name;
    }
    return map;
  }, [classes]);

  const classMap = useMemo(
    () => Object.fromEntries(classes.map((c: any) => [c.code, c.name])) as Record<string, string>,
    [classes],
  );

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/batch-print-jobs/${jobId}`, { headers: authHeaders() as HeadersInit })
      .then(r => r.json())
      .then((d: BatchJobDetail) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [jobId]);

  async function handleReprint() {
    if (!detail) return;
    setReprinting(true);
    try {
      const docTypeId = detail.documentType as DocTypeId;
      const activeType = DOC_TYPES.find(d => d.id === docTypeId);

      let cached = getTemplatesCached();
      if (!cached) cached = await loadTemplates();

      const rawTpl: CachedTemplate | undefined = cached[docTypeId];
      const defaultT: TemplateData = {
        content:      activeType?.defaultContent ?? "",
        pageSize:     "A4",
        orientation:  "portrait",
        marginTop:    20, marginRight: 15, marginBottom: 20, marginLeft: 15,
        bgImageUrl:   null,
      };
      const tpl: TemplateData = rawTpl
        ? { ...rawTpl, content: rawTpl.content || (activeType?.defaultContent ?? "") }
        : defaultT;

      const storedMerge = detail.mergeValues ?? {};
      const records = detail.students.map(s => {
        const autoVals = (activeType?.studentFieldMap && STUDENT_DOC_IDS.has(docTypeId))
          ? activeType.studentFieldMap(
              { fullName: s.fullName, applicantId: s.applicantId, classCode: s.classCode, sectionId: s.sectionId },
              sectionMap,
              classMap,
            )
          : {};
        return { ...storedMerge, ...autoVals };
      });

      const html = buildPrintHtml(tpl, records);
      printHtmlDocument(html);
      setReprintDone(true);
    } finally {
      setReprinting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading students…
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Failed to load job details.
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-muted/5">
      <div className="px-5 py-3 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-foreground">
            {detail.students.length} student{detail.students.length !== 1 ? "s" : ""} in this batch
          </span>
          {detail.printedAt && (
            <span className="text-xs text-muted-foreground">
              Printed {fmtDateTime(detail.printedAt)}
              {detail.adminFullName ? ` by ${detail.adminFullName}` : ""}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5"
          onClick={handleReprint}
          disabled={reprinting}
        >
          <Printer className="h-3 w-3" />
          {reprinting ? "Opening…" : reprintDone ? "Reprint again" : "Reprint all"}
        </Button>
      </div>

      <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
        {detail.students.map(s => {
          const isPrinted = s.status === "printed";
          return (
            <div
              key={s.studentId}
              className="px-5 py-2 flex items-center gap-4 text-sm hover:bg-muted/20 transition-colors"
            >
              <span className="font-medium text-foreground min-w-[160px]">
                {s.fullName || "—"}
              </span>
              <span className="font-mono text-xs text-muted-foreground min-w-[80px]">
                {s.applicantId || "—"}
              </span>
              <span className="text-xs text-muted-foreground flex-1">
                {(classMap[s.classCode] ?? s.classCode) || "—"}
                {sectionMap[s.sectionId] ? ` · ${sectionMap[s.sectionId]}` : ""}
              </span>
              {isPrinted ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200 shrink-0">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  Printed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded-full border border-sky-200 shrink-0">
                  <Wand2 className="h-2.5 w-2.5" />
                  Generated
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PrintHistoryTab() {
  const [jobs,              setJobs]              = useState<BatchJobSummary[]>([]);
  const [total,             setTotal]             = useState(0);
  const [page,              setPage]              = useState(1);
  const [loading,           setLoading]           = useState(false);
  const [expandedId,        setExpandedId]        = useState<string | null>(null);
  const [filterDoc,         setFilterDoc]         = useState("");
  const [filterStatus,      setFilterStatus]      = useState("");
  const [filterAcademicYear,setFilterAcademicYear]= useState("");
  const [filterDateFrom,    setFilterDateFrom]    = useState("");
  const [filterDateTo,      setFilterDateTo]      = useState("");

  const { data: academicYearsRaw = [] } = useListAdminAcademicYears();
  const academicYears = academicYearsRaw as { id: string; name: string }[];

  const PAGE_SIZE = 20;

  const fetchJobs = useCallback(async (
    p: number,
    docType: string,
    status: string,
    academicYearId: string,
    dateFrom: string,
    dateTo: string,
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (docType)       params.set("documentType", docType);
      if (status)        params.set("status", status);
      if (academicYearId) params.set("academicYearId", academicYearId);
      if (dateFrom)      params.set("generatedAfter", new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        params.set("generatedBefore", end.toISOString());
      }
      const res = await fetch(`/api/admin/batch-print-jobs?${params}`, {
        headers: authHeaders() as HeadersInit,
      });
      if (res.ok) {
        const data = await res.json() as { items: BatchJobSummary[]; total: number };
        setJobs(data.items);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs(page, filterDoc, filterStatus, filterAcademicYear, filterDateFrom, filterDateTo);
  }, [page, filterDoc, filterStatus, filterAcademicYear, filterDateFrom, filterDateTo, fetchJobs]);

  function resetPage() { setPage(1); setExpandedId(null); }

  function handleFilterDoc(v: string) { setFilterDoc(v); resetPage(); }
  function handleFilterStatus(v: string) { setFilterStatus(v); resetPage(); }
  function handleFilterAcademicYear(v: string) { setFilterAcademicYear(v); resetPage(); }
  function handleFilterDateFrom(v: string) { setFilterDateFrom(v); resetPage(); }
  function handleFilterDateTo(v: string) { setFilterDateTo(v); resetPage(); }

  function handleClearFilters() {
    setFilterDoc("");
    setFilterStatus("");
    setFilterAcademicYear("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPage(1);
    setExpandedId(null);
  }

  const hasActiveFilters = !!(filterDoc || filterStatus || filterAcademicYear || filterDateFrom || filterDateTo);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const UNIFIED_DOC_TYPES = DOC_TYPES.filter(d => !d.hrOnly);

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Filter bar ── */}
      <div className="shrink-0 border-b border-border bg-muted/5 px-5 py-3 flex items-center gap-3 flex-wrap">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
          Filter
        </p>

        <select
          value={filterDoc}
          onChange={e => handleFilterDoc(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All document types</option>
          {UNIFIED_DOC_TYPES.map(dt => (
            <option key={dt.id} value={dt.id}>{dt.label}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={e => handleFilterStatus(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All statuses</option>
          <option value="generated">Generated</option>
          <option value="printed">Printed</option>
        </select>

        <select
          value={filterAcademicYear}
          onChange={e => handleFilterAcademicYear(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All academic years</option>
          {academicYears.map(y => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground whitespace-nowrap">From</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => handleFilterDateFrom(e.target.value)}
            max={todayIso()}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground whitespace-nowrap">To</label>
          <input
            type="date"
            value={filterDateTo}
            onChange={e => handleFilterDateTo(e.target.value)}
            max={todayIso()}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 whitespace-nowrap"
          >
            Clear filters
          </button>
        )}

        <button
          onClick={() => fetchJobs(page, filterDoc, filterStatus, filterAcademicYear, filterDateFrom, filterDateTo)}
          className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* ── Job list ── */}
      <div className="flex-1 min-h-0 overflow-auto">
        {loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center h-32 gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading history…
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Clock className="h-10 w-10 opacity-20" />
            <p className="text-sm">No print jobs found.</p>
            <p className="text-xs text-muted-foreground/60">
              Jobs appear here after you generate documents from the Generate tab.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm border-b border-border">
              <tr>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Document Type</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Class / Section</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Students</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Generated By</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Printed At</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const isExpanded = expandedId === job.id;
                const isPrinted  = job.status === "printed";
                const color      = docTypeColor(job.documentType);
                return (
                  <Fragment key={job.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : job.id)}
                      className={cn(
                        "border-b border-border cursor-pointer transition-colors select-none",
                        isExpanded ? "bg-primary/5" : "hover:bg-muted/30",
                      )}
                    >
                      <td className="px-5 py-3 text-foreground whitespace-nowrap">
                        {fmtDate(job.generatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 font-medium"
                          style={{ color }}
                        >
                          {docTypeLabel(job.documentType)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {job.classCodes ? (
                          <span className="text-xs text-foreground font-mono">{job.classCodes}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          {job.studentCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {job.adminFullName ? (
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3 shrink-0" />
                            {job.adminFullName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isPrinted ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Printed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                            <Wand2 className="h-2.5 w-2.5" />
                            Generated
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {job.printedAt ? fmtDateTime(job.printedAt) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isExpanded
                          ? <ChevronUp   className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-border">
                        <td colSpan={8} className="p-0">
                          <JobDetailPanel
                            jobId={job.id}
                            documentType={job.documentType}
                            onClose={() => setExpandedId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      {total > PAGE_SIZE && (
        <div className="shrink-0 border-t border-border bg-background px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {total} job{total !== 1 ? "s" : ""} total · page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
