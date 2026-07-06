import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListAdminAcademicYears } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import { formatDate } from "@/lib/locale";
import { FileText, Printer, ChevronUp, ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClassFilterSelect, SessionFilterSelect, ClassRecord, AcademicYear } from "./ExamSelectors";
import { cn } from "@/lib/utils";
import { fetchPrintSettings, PrintSettings, escapeHtml, printHtmlDocument } from "@/lib/print-utils";

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed"); }
  return res.json();
}

interface SubjectResult {
  scheduleId: string; subjectCode: string; subjectName: string | null;
  totalMarks: number; passMarks: number; obtainedMarks: number | null; isAbsent: boolean;
}
interface StudentRow {
  studentId: string; applicantId: string; studentName: string;
  subjects: SubjectResult[]; totalObtained: number; totalMax: number; percentage: number | null;
  enrollmentMismatch?: boolean;
}
interface ScheduleInfo {
  id: string; subjectCode: string; subjectName: string | null;
  totalMarks: number; passMarks: number; examDate: string | null;
}
interface ReportData { schedules: ScheduleInfo[]; students: StudentRow[]; }
interface GradeBand { grade: string; minPercent: number; maxPercent: number; remarks: string | null; }

function resolveGrade(pct: number | null, bands: GradeBand[]): GradeBand | null {
  if (pct === null || !bands.length) return null;
  return bands.find(b => pct >= b.minPercent && pct <= b.maxPercent) ?? null;
}

function GradeChip({ pct, bands }: { pct: number | null; bands: GradeBand[] }) {
  const g = resolveGrade(pct, bands);
  if (!g) return <span className="text-xs text-slate-300">—</span>;
  const colors: Record<string, string> = {
    A: "bg-green-100 text-green-800", B: "bg-blue-100 text-blue-800",
    C: "bg-amber-100 text-amber-800", D: "bg-orange-100 text-orange-800",
    F: "bg-red-100 text-red-800",
  };
  const cls = colors[g.grade[0] ?? ""] ?? "bg-slate-100 text-slate-700";
  return <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{g.grade}</span>;
}

const CARD_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8f8f8; padding: 30px; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .card { background: #fff; border: 2px solid #1e3a5f; max-width: 720px; margin: auto; padding: 28px 32px; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 16px; }
  .school { font-size: 18px; font-weight: 700; color: #1e3a5f; }
  .sub { font-size: 12px; color: #666; margin-top: 2px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; font-size: 13px; }
  .meta b { color: #1e3a5f; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px; }
  th { background: #1e3a5f; color: #fff; padding: 7px 10px; text-align: left; font-size: 12px; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
  tr:last-child td { border-bottom: none; }
  .summary { display: flex; gap: 24px; background: #f1f5f9; padding: 12px 16px; border-radius: 6px; font-size: 13px; }
  .summary-item { text-align: center; }
  .summary-item .val { font-size: 22px; font-weight: 700; color: #1e3a5f; }
  .summary-item .lbl { font-size: 11px; color: #888; margin-top: 1px; }
  .footer { margin-top: 28px; display: flex; justify-content: space-between; font-size: 12px; color: #888; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  .sig { text-align: center; border-top: 1px solid #999; margin-top: 40px; padding-top: 4px; font-size: 11px; color: #666; width: 140px; }
  @media print { body { padding: 0; background: transparent; } .card { box-shadow: none; border: 1.5px solid #1e3a5f; } }
`;

function buildCardBodyHtml(student: StudentRow & { rank: number }, report: ReportData, bands: GradeBand[], classCode: string, session: string, instituteName = "", showInstituteName = true): string {
  const g = resolveGrade(student.percentage, bands);
  const rows = report.schedules.map(sch => {
    const sr = student.subjects.find(s => s.scheduleId === sch.id);
    const obtained = sr?.isAbsent ? "AB" : (sr?.obtainedMarks ?? "—");
    const status = sr?.isAbsent ? "Absent" : (sr?.obtainedMarks !== null && sr?.obtainedMarks !== undefined ? (sr.obtainedMarks >= sch.passMarks ? "Pass" : "Fail") : "—");
    return `<tr><td>${escapeHtml(sch.subjectName ?? sch.subjectCode)}</td><td>${sch.totalMarks}</td><td>${sch.passMarks}</td><td style="text-align:center;font-weight:600">${obtained}</td><td style="color:${status === "Pass" ? "#16a34a" : status === "Fail" ? "#dc2626" : "#888"}">${status}</td></tr>`;
  }).join("");
  return `<div class="card">
  <div class="header">
    <div>
      ${showInstituteName ? `<div class="school">${escapeHtml(instituteName || "")}</div>` : ""}
      <div class="sub">Academic Report Card &nbsp;·&nbsp; ${escapeHtml(session)} &nbsp;·&nbsp; Class ${escapeHtml(classCode)}</div>
    </div>
    <div style="text-align:right;font-size:12px;color:#666">
      <div><b>Rank:</b> ${student.rank} of ${report.students.length}</div>
    </div>
  </div>
  <div class="meta">
    <div><b>Register ID:</b> ${escapeHtml(student.applicantId)}</div>
    <div><b>Name:</b> ${escapeHtml(student.studentName)}</div>
  </div>
  <table>
    <thead><tr><th>Subject</th><th>Total</th><th>Pass</th><th>Obtained</th><th>Result</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="summary">
    <div class="summary-item"><div class="val">${student.totalObtained}/${student.totalMax}</div><div class="lbl">Total Marks</div></div>
    <div class="summary-item"><div class="val">${student.percentage !== null ? student.percentage + "%" : "—"}</div><div class="lbl">Percentage</div></div>
    <div class="summary-item"><div class="val">${g?.grade ? escapeHtml(g.grade) : "—"}</div><div class="lbl">Grade</div></div>
    <div class="summary-item"><div class="val">${student.rank}</div><div class="lbl">Class/Program Rank</div></div>
  </div>
  <div class="footer">
    <span>Printed: ${formatDate(new Date())}</span>
    <div style="display:flex;gap:60px">
      <div class="sig">Class Teacher</div>
      <div class="sig">Principal</div>
    </div>
  </div>
</div>`;
}

function buildCardHtml(student: StudentRow & { rank: number }, report: ReportData, bands: GradeBand[], classCode: string, session: string, printSettings?: PrintSettings) {
  const ps = printSettings;
  const bgAbsoluteUrl = ps?.bgImageUrl
    ? (ps.bgImageUrl.startsWith("/") ? `${window.location.origin}${ps.bgImageUrl}` : ps.bgImageUrl)
    : null;
  const pageRule = ps
    ? `@page { size: ${ps.pageSize} ${ps.orientation}; margin: ${ps.marginTop}mm ${ps.marginRight}mm ${ps.marginBottom}mm ${ps.marginLeft}mm; }`
    : `@page { size: A4 portrait; margin: 20mm 15mm; }`;
  const bgRule = bgAbsoluteUrl
    ? `body { background-image: url("${bgAbsoluteUrl}"); background-size: cover; background-position: center; background-repeat: no-repeat; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`
    : "";
  return `<!DOCTYPE html><html><head><title>Report Card — ${escapeHtml(student.studentName)}</title>
<style>${pageRule}${CARD_CSS}${bgRule}</style></head>
<body>${buildCardBodyHtml(student, report, bands, classCode, session, ps?.instituteName, ps?.showInstituteName)}</body></html>`;
}

export function ExamsReportCardTab() {
  const [classCode, setClassCode]     = useState("");
  const [sessionLabel, setSessionLabel] = useState("");
  const [sortKey, setSortKey]         = useState<"name" | "pct">("pct");
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("desc");
  const [search, setSearch]           = useState("");

  const { data: bands = [] } = useQuery<GradeBand[]>({
    queryKey: ["grade-bands-all"],
    queryFn: () => apiFetch("/api/admin/exams/grade-bands"),
    staleTime: 60_000,
  });

  // DB-backed filter options — independent of whether exams are scheduled
  const { data: classesRaw = [] } = useQuery<ClassRecord[]>({
    queryKey: ["classes-list"],
    queryFn: () => apiFetch("/api/admin/classes"),
    staleTime: 60_000,
  });
  const { data: yearsRaw } = useListAdminAcademicYears();
  const academicYears = (Array.isArray(yearsRaw) ? yearsRaw : []) as AcademicYear[];

  // Auto-load when both are selected — no button needed
  const canLoad = classCode !== "" && sessionLabel !== "";

  const { data: report, isLoading, error } = useQuery<ReportData>({
    queryKey: ["report-card", classCode, sessionLabel],
    queryFn: () => apiFetch(`/api/admin/exams/report-card?classCode=${encodeURIComponent(classCode)}&sessionLabel=${encodeURIComponent(sessionLabel)}`),
    enabled: canLoad,
    staleTime: 10_000,
  });

  function toggleSort(k: "name" | "pct") {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  const sorted = (() => {
    if (!report) return [];
    return [...report.students]
      .filter(s => !search || s.studentName.toLowerCase().includes(search.toLowerCase()) || s.applicantId.includes(search))
      .sort((a, b) => {
        let cmp = 0;
        if (sortKey === "name") cmp = a.studentName.localeCompare(b.studentName);
        else cmp = (a.percentage ?? -1) - (b.percentage ?? -1);
        return sortDir === "desc" ? -cmp : cmp;
      });
  })();

  const withRank = sorted.map((s, i) => ({ ...s, rank: i + 1 }));

  async function printCard(student: StudentRow & { rank: number }) {
    if (!report) return;
    const ps = await fetchPrintSettings();
    printHtmlDocument(buildCardHtml(student, report, bands, classCode, sessionLabel, ps));
  }

  async function printAll() {
    if (!report) return;
    const ps = await fetchPrintSettings();
    const bgAbsoluteUrl = ps.bgImageUrl
      ? (ps.bgImageUrl.startsWith("/") ? `${window.location.origin}${ps.bgImageUrl}` : ps.bgImageUrl)
      : null;
    const pageRule = `@page { size: ${ps.pageSize} ${ps.orientation}; margin: ${ps.marginTop}mm ${ps.marginRight}mm ${ps.marginBottom}mm ${ps.marginLeft}mm; }`;
    const bgRule = bgAbsoluteUrl
      ? `body { background-image: url("${bgAbsoluteUrl}"); background-size: cover; background-position: center; background-repeat: no-repeat; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`
      : "";
    const allCards = withRank.map(s =>
      `<div style="page-break-after:always">${buildCardBodyHtml(s, report, bands, classCode, sessionLabel, ps.instituteName, ps.showInstituteName)}</div>`
    ).join("");
    const html = `<!DOCTYPE html><html><head><title>All Report Cards — Class ${escapeHtml(classCode)}</title><style>${pageRule}${CARD_CSS}${bgRule}@media print{.card{page-break-inside:avoid}}</style></head><body>${allCards}</body></html>`;
    printHtmlDocument(html);
  }

  // Aggregate stats
  const passCount = report?.students.filter(s => s.percentage !== null && s.percentage >= 33).length ?? 0;
  const avgPct    = report && report.students.length > 0
    ? Math.round(report.students.reduce((s, st) => s + (st.percentage ?? 0), 0) / report.students.length)
    : null;

  return (
    <div className="space-y-4">
      {/* Filters — auto-load on change */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <p className="text-xs font-medium text-slate-600 mb-1.5">Class</p>
          <ClassFilterSelect value={classCode} onChange={setClassCode} classes={classesRaw} className="w-36" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-600 mb-1.5">Session</p>
          <SessionFilterSelect value={sessionLabel} onChange={setSessionLabel} academicYears={academicYears} className="w-36" />
        </div>
        {report && report.schedules.length > 0 && (
          <Button size="sm" className="h-9 ml-auto" variant="outline" onClick={printAll}>
            <Download className="mr-1.5 h-4 w-4" /> Print All ({report.students.length})
          </Button>
        )}
      </div>

      {!canLoad ? (
        <div className="text-center py-20 text-sm text-slate-400">
          <FileText className="h-12 w-12 mx-auto mb-3 text-slate-200" />
          Select a class and session to view report cards.
        </div>
      ) : isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}</div>
      ) : error ? (
        <div className="text-center py-10 text-sm text-red-500">Failed to load. Please try again.</div>
      ) : !report || report.schedules.length === 0 ? (
        <div className="text-center py-16 text-sm text-slate-400">
          <FileText className="h-10 w-10 mx-auto mb-2 text-slate-200" />
          No exams scheduled for <strong>{classCode}</strong> in session <strong>{sessionLabel}</strong>.
          <p className="mt-1 text-xs">Create exam schedules in the <strong>Schedule Exams</strong> tab first, then enter results.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Students",  value: report.students.length },
              { label: "Subjects",  value: report.schedules.length },
              { label: "Avg Score", value: avgPct !== null ? `${avgPct}%` : "—" },
              { label: "Passing",   value: `${passCount} / ${report.students.length}` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-border bg-white p-3 text-center shadow-sm">
                <p className="text-2xl font-bold text-slate-800 tabular-nums">{value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex gap-2 items-center flex-wrap">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search student…"
              className="max-w-xs h-9 text-sm"
            />
            <span className="text-xs text-slate-400 ml-auto">
              Click column headers to sort · <Printer className="inline h-3 w-3" /> prints individual card
            </span>
          </div>

          {/* Results table — sticky first 3 cols */}
          <div className="border border-border rounded-xl overflow-auto shadow-sm">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground sticky left-0 bg-muted/40 w-10 z-10">#</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground sticky left-10 bg-muted/40 w-24 z-10">Register ID</th>
                  <th
                    className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground sticky left-32 bg-muted/40 cursor-pointer select-none min-w-40 z-10"
                    onClick={() => toggleSort("name")}
                  >
                    Name {sortKey === "name" ? (sortDir === "asc" ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />) : <ChevronDown className="inline h-3 w-3 opacity-20" />}
                  </th>
                  {report.schedules.map(sch => (
                    <th key={sch.id} className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                      {sch.subjectName ?? sch.subjectCode}
                      <br /><span className="font-normal text-slate-400">/{sch.totalMarks}</span>
                    </th>
                  ))}
                  <th
                    className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground cursor-pointer select-none"
                    onClick={() => toggleSort("pct")}
                  >
                    Total {sortKey === "pct" ? (sortDir === "asc" ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />) : <ChevronDown className="inline h-3 w-3 opacity-20" />}
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">%</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Grade</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground w-12">
                    <Printer className="h-3.5 w-3.5 mx-auto text-slate-400" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {withRank.length === 0 ? (
                  <tr><td colSpan={report.schedules.length + 7} className="px-3 py-10 text-center text-sm text-slate-400">No students match</td></tr>
                ) : withRank.map(student => {
                  const failSubjects = student.subjects.filter(s => !s.isAbsent && s.obtainedMarks !== null && s.obtainedMarks < s.passMarks).length;
                  const isPassing = student.percentage !== null && failSubjects === 0 && student.percentage >= 33;
                  return (
                    <tr key={student.studentId} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 text-xs text-slate-400 sticky left-0 bg-white tabular-nums">{student.rank}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500 sticky left-10 bg-white">{student.applicantId}</td>
                      <td className="px-3 py-2 font-medium text-slate-800 sticky left-32 bg-white min-w-40">
                        {student.studentName}
                        {student.enrollmentMismatch && (
                          <span title="No enrollment record for this student in this class and academic year" className="ml-1.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 align-middle">
                            ⚠ enrollment mismatch
                          </span>
                        )}
                      </td>
                      {report.schedules.map(sch => {
                        const sr = student.subjects.find(s => s.scheduleId === sch.id);
                        const pass = sr && !sr.isAbsent && sr.obtainedMarks !== null && sr.obtainedMarks >= sch.passMarks;
                        return (
                          <td key={sch.id} className={cn(
                            "px-3 py-2 text-center tabular-nums text-sm font-semibold",
                            sr?.isAbsent ? "text-red-400" : pass ? "text-green-700" : sr?.obtainedMarks !== null ? "text-red-600" : "text-slate-300"
                          )}>
                            {sr?.isAbsent ? "AB" : (sr?.obtainedMarks ?? "—")}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center font-semibold tabular-nums text-slate-800">
                        {student.totalObtained}/{student.totalMax}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={cn("text-xs font-bold tabular-nums", isPassing ? "text-green-700" : "text-red-600")}>
                          {student.percentage !== null ? `${student.percentage}%` : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center"><GradeChip pct={student.percentage} bands={bands} /></td>
                      <td className="px-3 py-2 text-center">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Print report card" onClick={() => printCard(student)}>
                          <Printer className="h-3.5 w-3.5 text-slate-500" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
