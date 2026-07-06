import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListAdminAcademicYears } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import { Trophy, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClassFilterSelect, SessionFilterSelect, ClassRecord, AcademicYear } from "./ExamSelectors";
import { cn } from "@/lib/utils";
import { fetchPrintSettings, buildPrintHtml, escapeHtml, printHtmlDocument } from "@/lib/print-utils";

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

interface Schedule { id: string; subjectCode: string; subjectName: string | null; totalMarks: number; passMarks: number; }
interface StudentRow {
  studentId: string; applicantId: string; studentName: string;
  subjects: { scheduleId: string; subjectCode: string; obtainedMarks: number | null; isAbsent: boolean; totalMarks: number; passMarks: number }[];
  totalObtained: number; totalMax: number; percentage: number | null;
}
interface ReportCard { schedules: Schedule[]; students: StudentRow[]; }

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return null;
}

export function ExamsMeritTab() {
  const [classCode, setClassCode] = useState("");
  const [sessionLabel, setSessionLabel] = useState("");

  // DB-backed filter options — independent of whether exams are scheduled
  const { data: classesRaw = [] } = useQuery<ClassRecord[]>({
    queryKey: ["classes-list"],
    queryFn: () => apiFetch("/api/admin/classes"),
    staleTime: 60_000,
  });
  const { data: yearsRaw } = useListAdminAcademicYears();
  const academicYears = (Array.isArray(yearsRaw) ? yearsRaw : []) as AcademicYear[];

  const enabled = !!classCode && !!sessionLabel;
  const { data, isLoading } = useQuery<ReportCard>({
    queryKey: ["exam-merit", classCode, sessionLabel],
    queryFn: () => apiFetch(`/api/admin/exams/report-card?classCode=${encodeURIComponent(classCode)}&sessionLabel=${encodeURIComponent(sessionLabel)}`),
    enabled,
    staleTime: 30_000,
  });

  const ranked = useMemo(() => {
    if (!data?.students) return [];
    return [...data.students]
      .sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1))
      .map((s, i) => ({ ...s, rank: i + 1 }));
  }, [data?.students]);

  const cols = data?.schedules ?? [];

  return (
    <div className="space-y-5">
      {/* Selectors */}
      <div className="flex flex-wrap items-center gap-3">
        <ClassFilterSelect
          value={classCode}
          onChange={v => { setClassCode(v); setSessionLabel(""); }}
          classes={classesRaw}
          className="w-36"
        />
        <SessionFilterSelect
          value={sessionLabel}
          onChange={setSessionLabel}
          academicYears={academicYears}
          disabled={!classCode}
          className="w-44"
        />
        {enabled && ranked.length > 0 && (
          <div className="ml-auto">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={async () => {
              const settings = await fetchPrintSettings();
              const subjectHeaders = cols.map(c => `<th style="background:#f1f5f9;font-weight:700;text-align:center;padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(c.subjectCode)}<br/><span style="font-weight:400;font-size:9px">/${c.totalMarks}</span></th>`).join("");
              const tableHtml = `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px">
  <thead>
    <tr><th style="background:#f1f5f9;font-weight:700;text-align:left;padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:.05em">Rank</th><th style="background:#f1f5f9;font-weight:700;text-align:left;padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:.05em">Student</th><th style="background:#f1f5f9;font-weight:700;text-align:left;padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:.05em">Register ID</th>${subjectHeaders}<th style="background:#f1f5f9;font-weight:700;text-align:center;padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:.05em">Total</th><th style="background:#f1f5f9;font-weight:700;text-align:center;padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:.05em">%</th></tr>
  </thead>
  <tbody>
    ${ranked.map((s, i) => {
      const subjectCells = cols.map(c => {
        const sub = s.subjects.find(x => x.scheduleId === c.id);
        const marks = sub?.isAbsent ? "AB" : (sub?.obtainedMarks ?? "—");
        return `<td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${marks}</td>`;
      }).join("");
      return `<tr style="${i % 2 === 1 ? "background:#f8fafc" : ""}"><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700">#${s.rank}</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-weight:600">${escapeHtml(s.studentName)}</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:10px">${escapeHtml(s.applicantId)}</td>${subjectCells}<td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:600">${s.totalMax > 0 ? `${s.totalObtained}/${s.totalMax}` : "—"}</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700">${s.percentage !== null ? `${s.percentage}%` : "—"}</td></tr>`;
    }).join("")}
  </tbody>
</table>`;
              const html = buildPrintHtml(tableHtml, settings, "Merit List");
              printHtmlDocument(html);
            }}>
              <Printer className="h-3.5 w-3.5" /> Print Merit List
            </Button>
          </div>
        )}
      </div>

      {!enabled ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center">
          <Trophy className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-500">Select a class and session to view the merit list.</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : ranked.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 py-14 text-center">
          <Trophy className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-500">No results entered yet for this class and session.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-violet-50/60 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-violet-500" />
            <span className="text-sm font-semibold text-slate-800">Merit List — {classCode} · {sessionLabel}</span>
            <span className="ml-auto text-xs text-slate-400">{ranked.length} students</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-14">Rank</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Student</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Register ID</th>
                  {cols.map(c => (
                    <th key={c.id} className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
                      {c.subjectCode}
                      <span className="block text-[10px] font-normal text-slate-400">/{c.totalMarks}</span>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Total</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ranked.map(s => {
                  const m = medal(s.rank);
                  return (
                    <tr key={s.studentId} className={cn("hover:bg-muted/20 transition-colors", s.rank <= 3 ? "bg-amber-50/40" : "")}>
                      <td className="px-4 py-2.5 text-center font-bold text-slate-500">
                        {m ? <span>{m}</span> : <span className="text-xs text-slate-400">#{s.rank}</span>}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{s.studentName}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{s.applicantId}</td>
                      {cols.map(c => {
                        const sub = s.subjects.find(x => x.scheduleId === c.id);
                        const marks = sub?.isAbsent ? null : (sub?.obtainedMarks ?? null);
                        const pass = marks !== null && sub ? marks >= sub.passMarks : true;
                        return (
                          <td key={c.id} className={cn("px-3 py-2.5 text-center tabular-nums text-sm", sub?.isAbsent ? "text-slate-300" : pass ? "text-slate-700" : "text-red-500 font-semibold")}>
                            {sub?.isAbsent ? "AB" : marks !== null ? marks : "—"}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-center tabular-nums font-semibold text-slate-800">
                        {s.totalMax > 0 ? `${s.totalObtained}/${s.totalMax}` : "—"}
                      </td>
                      <td className={cn("px-4 py-2.5 text-center tabular-nums font-bold",
                        s.percentage === null ? "text-slate-400" : s.percentage >= 80 ? "text-emerald-600" : s.percentage >= 60 ? "text-blue-600" : s.percentage >= 40 ? "text-amber-600" : "text-red-500")}>
                        {s.percentage !== null ? `${s.percentage}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
