import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { formatDate } from "@/lib/locale";
import {
  Printer, Search, Users, AlertTriangle,
  CheckCircle2, Wand2, RefreshCw, X, Pencil,
  SlidersHorizontal, CalendarSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DOC_TYPES, STUDENT_DOC_IDS, PURPOSE_BY_DOC_TYPE, type DocTypeId, type GenerateTimeField } from "./doc-types";
import GeneratePanel from "./GeneratePanel";
import { loadTemplates, getTemplatesCached, type CachedTemplate } from "./templateCache";
import { printHtmlDocument, fetchPrintSettings, type PrintSettings } from "@/lib/print-utils";
import {
  useListAdminAcademicYears,
  useListAdminClasses,
  useListAdminStudents,
  getListAdminStudentsQueryKey,
  useListAdminApplications,
  getListAdminApplicationsQueryKey,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { getToken } from "@/lib/auth";
import { Link } from "wouter";

// HR-only doc types stay in their own HR flows
const UNIFIED_DOC_TYPES = DOC_TYPES.filter(d => !d.hrOnly);

// ── Auth helper ───────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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

function buildPrintHtml(tpl: TemplateData, records: Record<string, string>[], extraCss = ""): string {
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
      ${extraCss}
    </style>
  </head><body>
    ${pages}
  </body></html>`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PrintStatus = { printed: boolean; generated: boolean; printedAt: string | null; batchJobId: string | null };
type DupStudent  = { studentId: string; studentName: string; printedAt: string | null };
type DupWarning  = { pendingIds: string[]; duplicates: DupStudent[] };

type GeneratedBatch = {
  jobId:      string;
  studentIds: string[];
  docTypeId:  DocTypeId;
  template:   TemplateData;
  records:    Array<{ studentId: string; studentName: string; values: Record<string, string> }>;
  printed:    boolean;
};

// ── Thumbnail ─────────────────────────────────────────────────────────────────

const THUMB_W = 90;

function DocThumbnail({ html, label }: { html: string; label: string }) {
  const dims  = PAGE_PX.A4;
  const scale = THUMB_W / dims.width;
  const thumbH = Math.round(dims.height * scale);
  return (
    <div
      className="shrink-0 rounded border border-border bg-white shadow-sm overflow-hidden relative"
      style={{ width: THUMB_W, height: thumbH }}
    >
      <iframe
        srcDoc={html}
        title={label}
        scrolling="no"
        sandbox="allow-same-origin"
        style={{
          width: dims.width, height: dims.height,
          transform: `scale(${scale})`, transformOrigin: "0 0",
          pointerEvents: "none", border: "none", display: "block",
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[7px] px-1 py-0.5 truncate text-center leading-tight">
        {label}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function GeneratePrintPage() {
  const [docTypeId, setDocTypeId] = useState<DocTypeId>("salary-slip");

  const activeType     = DOC_TYPES.find(d => d.id === docTypeId) ?? DOC_TYPES[0]!;
  const isStudentDoc   = STUDENT_DOC_IDS.has(docTypeId);
  const isApplicantDoc = activeType.dataSource === "applicants";

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [yearId,           setYearId]           = useState("");
  const [statusFilter,     setStatusFilter]      = useState("active");
  const [selectedClasses,  setSelectedClasses]   = useState<string[]>([]);
  const [selectedSections, setSelectedSections]  = useState<string[]>([]);
  const [searchQ,          setSearchQ]           = useState("");
  const [applicantStatusFilter, setApplicantStatusFilter] = useState("");
  const [filterOpen,       setFilterOpen]        = useState(false);

  // ── Selection ─────────────────────────────────────────────────────────────────
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // ── Generate error ────────────────────────────────────────────────────────────
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ── Template ──────────────────────────────────────────────────────────────────
  const [template,   setTemplate]   = useState<TemplateData | null>(null);
  const [tplLoading, setTplLoading] = useState(false);

  // ── Print-status map ──────────────────────────────────────────────────────────
  const [printStatuses, setPrintStatuses] = useState<Record<string, PrintStatus>>({});
  const [statusLoading, setStatusLoading] = useState(false);

  // ── Dialogs ───────────────────────────────────────────────────────────────────
  const [dupWarning,    setDupWarning]    = useState<DupWarning | null>(null);
  const [generating,    setGenerating]    = useState(false);
  const [currentBatch,  setCurrentBatch]  = useState<GeneratedBatch | null>(null);
  const [printConfirm,  setPrintConfirm]  = useState<GeneratedBatch | null>(null);
  const [markingPrinted,setMarkingPrinted]= useState(false);

  // ── Generate-time field values (driven by generateTimeFields config) ────────
  const [generateValues, setGenerateValues] = useState<Record<string, string>>({});

  function todayStr(): string {
    return formatDate(new Date());
  }

  function initGenerateValues(fields: GenerateTimeField[] | undefined): Record<string, string> {
    if (!fields) return {};
    const out: Record<string, string> = {};
    for (const f of fields) {
      if (f.defaultToday && f.type === "date") out[f.key] = todayStr();
    }
    return out;
  }

  // ── Test schedules (for admit-card and report-card pickers) ───────────────
  type TestSchedule = {
    id: string; title: string; testDate: string; testTime?: string | null;
    centreName?: string | null; session?: string | null; status: string;
  };
  const [testSchedules, setTestSchedules] = useState<TestSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);

  // ── Signatures & stamps (auto-injected into print HTML) ────────────────────
  const [sigEntries, setSigEntries] = useState<{ name: string; type: string; url: string }[]>([]);
  useEffect(() => {
    fetch("/api/admin/print-signatures", { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: { name: string; type: string; url: string }[]) => setSigEntries(data))
      .catch(() => {});
  }, []);

  const sigAutoValues = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const s of sigEntries) {
      const tagKey = `${s.type === "stamp" ? "stamp" : "sig"}_${s.name}`;
      const absUrl = s.url.startsWith("/") ? window.location.origin + s.url : s.url;
      map[tagKey] = `<img src="${absUrl}" style="max-height:${s.type === "stamp" ? "70px" : "50px"};vertical-align:middle;display:inline-block;" />`;
    }
    return map;
  }, [sigEntries]);

  const needsSchedules = useMemo(
    () => (activeType.generateTimeFields ?? []).some(
      f => f.type === "test-schedule-picker" || f.type === "exam-picker",
    ),
    [activeType],
  );

  useEffect(() => {
    if (!needsSchedules) { setTestSchedules([]); return; }
    setSchedulesLoading(true);
    fetch("/api/admin/test-schedules", { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { items: [] })
      .then((data: { items?: TestSchedule[] }) =>
        setTestSchedules(Array.isArray(data?.items) ? data.items : [])
      )
      .catch(() => setTestSchedules([]))
      .finally(() => setSchedulesLoading(false));
  }, [needsSchedules]);

  // ── Load template ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isStudentDoc) return;
    setCheckedIds(new Set());
    setGenerateError(null);
    setCurrentBatch(null);
    setDupWarning(null);
    setGenerateValues(initGenerateValues(activeType.generateTimeFields));
    const docType = DOC_TYPES.find(d => d.id === docTypeId) ?? DOC_TYPES[0]!;
    const defaultT: TemplateData = {
      content: docType.defaultContent, pageSize: "A4", orientation: "portrait",
      marginTop: 20, marginRight: 15, marginBottom: 20, marginLeft: 15, bgImageUrl: null,
    };
    // Prefer a custom template assigned to the purpose that covers this doc type.
    const docPurpose = PURPOSE_BY_DOC_TYPE[docTypeId];
    const findBest = (data: Record<string, CachedTemplate>): CachedTemplate | undefined => {
      // Any template — built-in or custom — currently holding this purpose wins,
      // since purpose assignment is now editable for every template type.
      if (docPurpose) {
        const purposeTpl = Object.values(data).find(t => t.purpose === docPurpose);
        if (purposeTpl) return purposeTpl;
      }
      return data[docTypeId];
    };
    const applyRaw = (raw: CachedTemplate | undefined) =>
      setTemplate(raw ? { ...raw, content: raw.content || docType.defaultContent } : defaultT);
    const synced = getTemplatesCached();
    if (synced) { applyRaw(findBest(synced)); return; }
    setTplLoading(true);
    loadTemplates()
      .then(data => applyRaw(findBest(data)))
      .catch(() => setTemplate(defaultT))
      .finally(() => setTplLoading(false));
  }, [docTypeId, isStudentDoc]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── API data ──────────────────────────────────────────────────────────────────
  const { data: yearsRaw = [] } = useListAdminAcademicYears();
  const years = yearsRaw as any[];

  const { data: classesRaw = [] } = useListAdminClasses();
  const classes = classesRaw as any[];

  useEffect(() => {
    if (!yearId && years.length > 0) {
      const def = years.find((y: any) => y.isDefault) ?? years[0];
      if (def?.id) setYearId(def.id);
    }
  }, [years, yearId]);

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

  // ── Student list (enrolled-student doc types) ──────────────────────────────────
  const studentParams = {
    classCodes:     selectedClasses.length  > 0 ? selectedClasses.join(",")  : undefined,
    sectionIds:     selectedSections.length > 0 ? selectedSections.join(",") : undefined,
    status:         statusFilter === "all" ? undefined : statusFilter || undefined,
    q:              searchQ || undefined,
    pageSize:       2000,
  };
  const sqKey = getListAdminStudentsQueryKey(studentParams);
  const { data: studentsPage, isFetching: studentsLoading } = useListAdminStudents(studentParams, {
    query: { queryKey: sqKey, enabled: isStudentDoc && !isApplicantDoc },
  });
  const students: any[] = (studentsPage as any)?.items ?? [];

  // ── Applicant list (admit-card and other applicant doc types) ──────────────────
  const applicantParams = {
    status:   applicantStatusFilter || undefined,
    q:        searchQ || undefined,
    pageSize: 2000,
  };
  const aqKey = getListAdminApplicationsQueryKey(applicantParams);
  const { data: applicantsPage, isFetching: applicantsLoading } = useListAdminApplications(applicantParams, {
    query: { queryKey: aqKey, enabled: isApplicantDoc },
  });
  const applicants: any[] = (applicantsPage as any)?.items ?? [];

  // ── Unified rows (students or applicants) ─────────────────────────────────────
  const rows: any[] = isApplicantDoc ? applicants : students;
  const rowsLoading = isApplicantDoc ? applicantsLoading : studentsLoading;

  const visibleStudentIdsKey = useMemo(
    () => rows.map((s: any) => s.id as string).join(","),
    [rows],
  );

  const filterKey = `${yearId}|${selectedClasses.join(",")}|${selectedSections.join(",")}|${statusFilter}|${applicantStatusFilter}`;
  useEffect(() => { setCheckedIds(new Set()); }, [filterKey, searchQ]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Print status fetch ────────────────────────────────────────────────────────
  const fetchStatuses = useCallback(async (ids: string[]) => {
    if (!isStudentDoc || ids.length === 0 || !docTypeId) return;
    setStatusLoading(true);
    try {
      const params = new URLSearchParams({
        documentType: docTypeId,
        studentIds:   ids.join(","),
        ...(yearId ? { academicYearId: yearId } : {}),
      });
      const res = await fetch(`/api/admin/batch-print-jobs/student-status?${params}`, {
        headers: authHeaders() as HeadersInit,
      });
      if (res.ok) {
        const data = await res.json() as { results: Record<string, PrintStatus> };
        setPrintStatuses(data.results);
      }
    } finally {
      setStatusLoading(false);
    }
  }, [docTypeId, isStudentDoc, yearId]);

  useEffect(() => {
    const ids = visibleStudentIdsKey ? visibleStudentIdsKey.split(",").filter(Boolean) : [];
    if (ids.length > 0) fetchStatuses(ids);
    else setPrintStatuses({});
  }, [visibleStudentIdsKey, docTypeId, fetchStatuses]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selection helpers ─────────────────────────────────────────────────────────
  const allChecked  = rows.length > 0 && rows.every(s => checkedIds.has(s.id));
  const someChecked = checkedIds.size > 0;
  const headerCbRef      = useRef<HTMLInputElement>(null);
  const printSettingsRef = useRef<PrintSettings | null>(null);
  useEffect(() => {
    fetchPrintSettings().then(ps => { printSettingsRef.current = ps; }).catch(() => {});
  }, []);
  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someChecked && !allChecked;
  }, [someChecked, allChecked]);

  function toggleStudent(id: string) {
    setCheckedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    allChecked ? setCheckedIds(new Set()) : setCheckedIds(new Set(rows.map((s: any) => s.id)));
  }
  function toggleClass(code: string) {
    setSelectedClasses(p => p.includes(code) ? p.filter(x => x !== code) : [...p, code]);
    setSelectedSections(p => p.filter(id => allSections.some(s => s.id === id && s.classCode !== code)));
  }
  function toggleSection(id: string) {
    setSelectedSections(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }
  function clearFilters() {
    setSelectedClasses([]);
    setSelectedSections([]);
    setStatusFilter("active");
  }

  function rowDisplayName(id: string): string {
    const s = rows.find((st: any) => st.id === id);
    if (!s) return id;
    return s.fullName || (isApplicantDoc ? "Applicant" : "Student");
  }

  // Active filter count badge
  const activeFilterCount = selectedClasses.length + selectedSections.length + (statusFilter !== "active" ? 1 : 0);

  // ── Generate ──────────────────────────────────────────────────────────────────
  async function doGenerate(studentIds: string[], force: boolean) {
    if (!template) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/batch-print-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          documentType:   docTypeId,
          academicYearId: yearId || undefined,
          studentIds,
          force,
          mergeValues:    generateValues,
          dataSource:     activeType.dataSource ?? "students",
        }),
      });

      if (res.status === 409) {
        const data = await res.json() as { error: string; duplicates: Array<{ studentId: string; printedAt: string | null }> };
        setDupWarning({
          pendingIds: studentIds,
          duplicates: data.duplicates.map(d => ({
            studentId:   d.studentId,
            studentName: rowDisplayName(d.studentId),
            printedAt:   d.printedAt,
          })),
        });
        return;
      }

      if (!res.ok) {
        let msg = `Generation failed (${res.status})`;
        try {
          const errData = await res.json() as { error?: string };
          if (errData.error) msg += `: ${errData.error}`;
        } catch { /* ignore */ }
        setGenerateError(msg);
        return;
      }

      const job = await res.json() as { id: string };
      setDupWarning(null);
      setGenerateError(null);

      const selected = rows.filter(s => studentIds.includes(s.id));
      const records  = selected.map(s => {
        const autoVals = activeType.studentFieldMap ? activeType.studentFieldMap(s, sectionMap, classMap) : {};
        return {
          studentId:   s.id as string,
          studentName: s.fullName || (isApplicantDoc ? "Applicant" : "Student"),
          values:      { ...generateValues, ...autoVals },
        };
      });

      setCurrentBatch({ jobId: job.id, studentIds, docTypeId, template, records, printed: false });
      setCheckedIds(new Set());

      const newStatuses = { ...printStatuses };
      for (const id of studentIds) {
        newStatuses[id] = { printed: false, generated: true, printedAt: null, batchJobId: job.id };
      }
      setPrintStatuses(newStatuses);
    } finally {
      setGenerating(false);
    }
  }

  function handleGenerate() {
    const ids = [...checkedIds];
    if (ids.length === 0 || !template) return;
    setDupWarning(null);
    doGenerate(ids, false);
  }

  function handleForceGenerate() {
    if (!dupWarning) return;
    const ids = dupWarning.pendingIds;
    setDupWarning(null);
    doGenerate(ids, true);
  }

  function openPrintWindow(batch: GeneratedBatch) {
    const ps = printSettingsRef.current;
    const instituteName = ps?.instituteName ?? "";
    const extraCss = ps && !ps.showInstituteName ? ".ccm-institute-name { display: none !important; }" : "";
    const html = buildPrintHtml(
      batch.template,
      batch.records.map(r => ({ school_name: instituteName, ...sigAutoValues, ...r.values })),
      extraCss,
    );
    printHtmlDocument(html);
  }

  function handlePrintClick(batch: GeneratedBatch) {
    openPrintWindow(batch);
    setPrintConfirm(batch);
  }

  async function handleConfirmPrinted() {
    if (!printConfirm) return;
    const batch = printConfirm;
    setPrintConfirm(null);
    setMarkingPrinted(true);
    try {
      const res = await fetch(`/api/admin/batch-print-jobs/${batch.jobId}/print`, {
        method: "PATCH",
        headers: authHeaders() as HeadersInit,
      });
      if (res.ok) {
        setCurrentBatch(prev => prev ? { ...prev, printed: true } : null);
        const newStatuses = { ...printStatuses };
        for (const id of batch.studentIds) {
          newStatuses[id] = { printed: true, generated: true, printedAt: new Date().toISOString(), batchJobId: batch.jobId };
        }
        setPrintStatuses(newStatuses);
      }
    } finally {
      setMarkingPrinted(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Duplicate confirmation dialog ── */}
      <Dialog open={!!dupWarning} onOpenChange={open => { if (!open) setDupWarning(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Already-printed records found
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            The following {dupWarning?.duplicates.length === 1 ? "student has" : `${dupWarning?.duplicates.length} students have`} already had this document printed.
            Proceeding will <span className="font-semibold text-foreground">replace their existing records</span>.
          </div>
          <div className="max-h-52 overflow-y-auto rounded border border-border divide-y divide-border text-sm">
            {dupWarning?.duplicates.map(d => (
              <div key={d.studentId} className="flex items-center justify-between px-3 py-2">
                <span className="font-medium">{d.studentName || d.studentId}</span>
                {d.printedAt && (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(d.printedAt)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDupWarning(null)}>Cancel</Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={handleForceGenerate} disabled={generating}>
              {generating ? "Generating…" : "Proceed anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Print confirmation dialog ── */}
      <Dialog open={!!printConfirm} onOpenChange={open => { if (!open) setPrintConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4 text-primary" />
              Confirm print
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            The print window has been opened. Did the {printConfirm?.records.length === 1 ? "document" : `${printConfirm?.records.length} documents`} print successfully?
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setPrintConfirm(null)}>No, cancel</Button>
            <Button size="sm" onClick={handleConfirmPrinted} disabled={markingPrinted}>
              {markingPrinted ? "Saving…" : "Yes, mark as printed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Class / section filter dialog ── */}
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filter Students
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Status</p>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <span>{statusFilter === "active" ? "Active" : statusFilter === "inactive" ? "Inactive" : "All"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {classes.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Classes <span className="font-normal normal-case text-muted-foreground/60">(leave blank for all)</span>
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

            {visibleSections.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Sections <span className="font-normal normal-case text-muted-foreground/60">(leave blank for all)</span>
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
          </div>

          <DialogFooter className="gap-2">
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
            )}
            <Button size="sm" onClick={() => setFilterOpen(false)}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Top bar: doc type + year + search + actions ── */}
      <div className="shrink-0 border-b border-border bg-background px-4 py-2.5 flex items-center gap-2 flex-wrap">

        {/* Document type */}
        <Select value={docTypeId} onValueChange={v => { setDocTypeId(v as DocTypeId); setCurrentBatch(null); setDupWarning(null); }}>
          <SelectTrigger className="h-9 text-sm min-w-[190px] max-w-[230px]">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <activeType.icon className="h-4 w-4 shrink-0" style={{ color: activeType.color }} />
              <span className="font-medium truncate">{activeType.label}</span>
            </div>
          </SelectTrigger>
          <SelectContent>
            {UNIFIED_DOC_TYPES.map(dt => {
              const Icon = dt.icon;
              return (
                <SelectItem key={dt.id} value={dt.id}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: dt.color }} />
                    <span>{dt.label}</span>
                    {!STUDENT_DOC_IDS.has(dt.id) && (
                      <span className="text-[10px] text-muted-foreground ml-0.5">(manual)</span>
                    )}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {/* Academic year (only for student docs) */}
        {isStudentDoc && (
          <Select value={yearId} onValueChange={setYearId}>
            <SelectTrigger className="h-9 text-sm min-w-[140px] max-w-[180px]">
              <span className="truncate text-left">
                {years.find((y: any) => y.id === yearId)?.name ?? "Select year…"}
              </span>
            </SelectTrigger>
            <SelectContent>
              {years.map((y: any) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}{y.isDefault ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Search */}
        {isStudentDoc && (
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 h-9 text-sm"
              placeholder={isApplicantDoc ? "Search name…" : "Search name or GR…"}
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
            />
          </div>
        )}

        {/* Applicant status filter (admit-card) */}
        {isApplicantDoc && (
          <Select value={applicantStatusFilter} onValueChange={setApplicantStatusFilter}>
            <SelectTrigger className="h-9 text-sm min-w-[140px] max-w-[180px]">
              <span className="truncate text-left">
                {applicantStatusFilter || "All statuses"}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All statuses</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="selected">Selected</SelectItem>
              <SelectItem value="received">Received</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Filter button (student docs only, not applicant) */}
        {isStudentDoc && !isApplicantDoc && (
          <Button
            variant="outline"
            size="sm"
            className={cn("h-9 gap-1.5 text-sm relative", activeFilterCount > 0 && "border-primary text-primary")}
            onClick={() => setFilterOpen(true)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 bg-primary text-primary-foreground rounded-full text-[9px] font-bold px-1.5 py-0 leading-4">
                {activeFilterCount}
              </span>
            )}
          </Button>
        )}

        {statusLoading && <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin" />}

        <div className="ml-auto flex items-center gap-2">
          <Link href={`/printing/templates?type=${docTypeId}`}>
            <Button variant="outline" size="sm" className="h-9 text-sm gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              Edit Templates
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Non-student doc type: delegate to manual panel ── */}
      {!isStudentDoc && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <GeneratePanel docTypeId={docTypeId} />
        </div>
      )}

      {/* ── Student doc type: student list ── */}
      {isStudentDoc && (
        <>
          {/* ── Active filter chips (when filters are applied) ── */}
          {(selectedClasses.length > 0 || selectedSections.length > 0 || statusFilter !== "active") && (
            <div className="shrink-0 border-b border-border bg-muted/5 px-4 py-2 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-muted-foreground font-medium">Filters:</span>
              {statusFilter !== "active" && (
                <span className="inline-flex items-center gap-1 text-xs bg-background border border-border rounded-full px-2 py-0.5">
                  Status: {statusFilter === "all" ? "All" : "Inactive"}
                  <button onClick={() => setStatusFilter("active")} className="ml-0.5 text-muted-foreground hover:text-foreground"><X className="h-2.5 w-2.5" /></button>
                </span>
              )}
              {selectedClasses.map(code => (
                <span key={code} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                  {classMap[code] ?? code}
                  <button onClick={() => toggleClass(code)} className="ml-0.5 hover:text-primary/70"><X className="h-2.5 w-2.5" /></button>
                </span>
              ))}
              {selectedSections.map(id => (
                <span key={id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                  {sectionMap[id] ?? id}
                  <button onClick={() => toggleSection(id)} className="ml-0.5 hover:text-primary/70"><X className="h-2.5 w-2.5" /></button>
                </span>
              ))}
              <button onClick={clearFilters} className="text-[11px] text-muted-foreground underline hover:text-foreground">Clear all</button>
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
                <p className="text-sm text-center">No template for <b>{activeType.label}</b>.</p>
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
                    {isApplicantDoc ? (
                      <>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Applicant</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Roll No.</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Class</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Print Status</th>
                      </>
                    ) : (
                      <>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Student</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Applicant ID</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Class</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Section</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Print Status</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rowsLoading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-sm text-muted-foreground">
                        {isApplicantDoc ? "Loading applicants…" : "Loading students…"}
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Users className="h-8 w-8 opacity-30" />
                          <p className="text-sm">{isApplicantDoc ? "No applicants match the current filter." : "No students match the current filter."}</p>
                        </div>
                      </td>
                    </tr>
                  ) : rows.map((s: any) => {
                    const checked     = checkedIds.has(s.id);
                    const pStatus     = printStatuses[s.id];
                    const isPrinted   = pStatus?.printed;
                    const isGenerated = !isPrinted && pStatus?.generated;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => toggleStudent(s.id)}
                        className={cn(
                          "border-b border-border cursor-pointer transition-colors select-none",
                          checked     ? "bg-primary/5 hover:bg-primary/8"
                          : isPrinted   ? "bg-emerald-50/40 hover:bg-emerald-50/60"
                          : isGenerated ? "bg-sky-50/40 hover:bg-sky-50/60"
                          : "hover:bg-muted/30",
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
                        {isApplicantDoc ? (
                          <>
                            <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{s.rollNumber ?? "—"}</td>
                            <td className="px-3 py-2.5">{s.classApplying ?? "—"}</td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground capitalize">{s.status ?? "—"}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{s.applicantId ?? "—"}</td>
                            <td className="px-3 py-2.5">{classMap[s.classCode] ?? s.classCode ?? "—"}</td>
                            <td className="px-3 py-2.5">{sectionMap[s.sectionId] ?? "—"}</td>
                          </>
                        )}
                        <td className="px-3 py-2.5">
                          {isPrinted ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Printed
                            </span>
                          ) : isGenerated ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded-full border border-sky-200">
                              <Wand2 className="h-2.5 w-2.5" /> Generated
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Generated batch panel ── */}
          {currentBatch && (
            <div className={cn(
              "shrink-0 border-t bg-background",
              currentBatch.printed ? "border-emerald-200 bg-emerald-50/30" : "border-sky-200 bg-sky-50/20",
            )}>
              <div className="px-4 pt-3 pb-2 flex items-center gap-3 overflow-x-auto">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap shrink-0">
                  Preview
                </p>
                {currentBatch.records.slice(0, 8).map((rec, i) => {
                  const ps = printSettingsRef.current;
                  const instituteName = ps?.instituteName ?? "";
                  const extraCss = ps && !ps.showInstituteName ? ".ccm-institute-name { display: none !important; }" : "";
                  const html = buildPrintHtml(currentBatch.template, [{ school_name: instituteName, ...sigAutoValues, ...rec.values }], extraCss);
                  return <DocThumbnail key={i} html={html} label={rec.studentName} />;
                })}
                {currentBatch.records.length > 8 && (
                  <div
                    className="shrink-0 rounded border border-dashed border-border bg-muted/30 flex items-center justify-center text-xs text-muted-foreground"
                    style={{ width: THUMB_W, height: Math.round(PAGE_PX.A4.height * (THUMB_W / PAGE_PX.A4.width)) }}
                  >
                    +{currentBatch.records.length - 8} more
                  </div>
                )}
              </div>
              <div className="px-5 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {currentBatch.printed
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : <Wand2 className="h-4 w-4 text-sky-600" />
                  }
                  <span className="text-sm font-semibold">
                    {currentBatch.printed ? "Printed" : "Ready to print"} — {currentBatch.records.length} {currentBatch.records.length === 1 ? "document" : "documents"}
                  </span>
                  <span className="text-xs text-muted-foreground">({activeType.label})</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setCurrentBatch(null); setDupWarning(null); }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  {!currentBatch.printed && (
                    <Button size="sm" className="h-8 text-xs" onClick={() => handlePrintClick(currentBatch)} disabled={markingPrinted}>
                      <Printer className="h-3.5 w-3.5 mr-1.5" />
                      {markingPrinted ? "Saving…" : `Print (${currentBatch.records.length})`}
                    </Button>
                  )}
                  {currentBatch.printed && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openPrintWindow(currentBatch)}>
                      <Printer className="h-3.5 w-3.5 mr-1.5" /> Reprint
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Generate error ── */}
          {generateError && (
            <div className="shrink-0 border-t border-destructive/30 bg-destructive/5 px-4 py-2 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
              <span className="text-xs text-destructive flex-1">{generateError}</span>
              <button onClick={() => setGenerateError(null)} className="text-destructive/60 hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* ── Generate settings panel ── */}
          {(activeType.generateTimeFields ?? []).length > 0 && (
            <div className="shrink-0 border-t border-border bg-muted/30 px-5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                Generate Settings
                <span className="normal-case font-normal text-muted-foreground/70"> — applies to all selected students</span>
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {(activeType.generateTimeFields ?? []).map(field => {

                  /* ── Test schedule picker (admit-card) ── */
                  if (field.type === "test-schedule-picker") return (
                    <div key={field.key} className="flex items-center gap-2">
                      <CalendarSearch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <label className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{field.label}:</label>
                      <Select
                        onValueChange={scheduleId => {
                          const s = testSchedules.find(x => x.id === scheduleId);
                          if (!s) return;
                          setGenerateValues(prev => ({
                            ...prev,
                            ...(s.session    ? { session:   s.session }    : {}),
                            ...(s.testDate   ? { exam_date: s.testDate }   : {}),
                            ...(s.testTime   ? { exam_time: s.testTime }   : {}),
                            ...(s.centreName ? { venue:     s.centreName } : {}),
                          }));
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs w-64">
                          <span className="truncate text-muted-foreground">
                            {schedulesLoading ? "Loading schedules…" : "Select to auto-fill…"}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {testSchedules.map(s => (
                            <SelectItem key={s.id} value={s.id}>
                              <span className="text-xs">{s.title}</span>
                              <span className="ml-2 text-[10px] text-muted-foreground">{s.testDate}{s.testTime ? ` · ${s.testTime}` : ""}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-[10px] text-muted-foreground/60 italic">fields editable below</span>
                    </div>
                  );

                  /* ── Exam picker (report-card) ── */
                  if (field.type === "exam-picker") return (
                    <div key={field.key} className="flex items-center gap-2">
                      <CalendarSearch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <label className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{field.label}:</label>
                      <Select
                        onValueChange={scheduleId => {
                          const s = testSchedules.find(x => x.id === scheduleId);
                          if (!s) return;
                          setGenerateValues(prev => ({
                            ...prev,
                            ...(s.session  ? { rc_session: s.session }  : {}),
                            ...(s.testDate ? { exam_date:  s.testDate } : {}),
                          }));
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs w-64">
                          <span className="truncate text-muted-foreground">
                            {schedulesLoading ? "Loading exams…" : "Select exam to auto-fill session…"}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {testSchedules.map(s => (
                            <SelectItem key={s.id} value={s.id}>
                              <span className="text-xs">{s.title}</span>
                              {s.session && <span className="ml-2 text-[10px] text-muted-foreground">{s.session}</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-[10px] text-muted-foreground/60 italic">fields editable below</span>
                    </div>
                  );

                  /* ── Date / text fields ── */
                  const val = generateValues[field.key] ?? "";
                  return (
                    <div key={field.key} className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {field.label}:
                        {!val && <span className="ml-1 text-[10px] text-amber-500">optional</span>}
                      </label>
                      <Input
                        className="h-7 text-xs w-36"
                        placeholder={field.placeholder ?? (field.defaultToday ? todayStr() : "DD MMM YYYY")}
                        value={val}
                        onChange={e => setGenerateValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Bottom action bar ── */}
          <div className="shrink-0 border-t border-border bg-background px-5 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {rows.length} {isApplicantDoc ? "applicant" : "student"}{rows.length !== 1 ? "s" : ""}
              {someChecked && ` · `}
              {someChecked && <span className="font-semibold text-foreground">{checkedIds.size} selected</span>}
              {Object.values(printStatuses).filter(s => s.printed).length > 0 &&
                ` · ${Object.values(printStatuses).filter(s => s.printed).length} already printed`
              }
            </span>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={!someChecked || !template || generating}
              className="h-9 text-sm px-5"
            >
              <Wand2 className="h-3.5 w-3.5 mr-1.5" />
              {generating ? "Generating…" : `Generate (${checkedIds.size})`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
