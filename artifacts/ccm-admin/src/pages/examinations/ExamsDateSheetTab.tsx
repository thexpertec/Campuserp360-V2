import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListAdminAcademicYears } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import { formatDate } from "@/lib/locale";
import { CalendarDays, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClassFilterSelect, SessionFilterSelect, ClassRecord, AcademicYear } from "./ExamSelectors";
import { fetchPrintSettings, buildPrintHtml, escapeHtml, printHtmlDocument } from "@/lib/print-utils";

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

interface Schedule {
  id: string; classCode: string; subjectCode: string; subjectName: string | null;
  sessionLabel: string; examDate: string | null; totalMarks: number; passMarks: number;
  venue: string | null; examTypeName: string | null;
}

function fmtDate(s?: string | null) {
  if (!s) return "TBD";
  return formatDate(s);
}

export function ExamsDateSheetTab() {
  const [classFilter, setClassFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");

  const { data: all = [], isLoading } = useQuery<Schedule[]>({
    queryKey: ["exam-schedules-datesheet"],
    queryFn: () => apiFetch("/api/admin/exams/schedules"),
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

  const filtered = useMemo(() => {
    return all.filter(s =>
      (!classFilter   || s.classCode    === classFilter) &&
      (!sessionFilter || s.sessionLabel === sessionFilter),
    );
  }, [all, classFilter, sessionFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    for (const s of filtered) {
      const key = s.examDate ?? "__tbd__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === "__tbd__") return 1;
        if (b === "__tbd__") return -1;
        return a.localeCompare(b);
      })
      .map(([date, rows]) => ({ date, rows: rows.sort((a, b) => a.classCode.localeCompare(b.classCode) || a.subjectCode.localeCompare(b.subjectCode)) }));
  }, [filtered]);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <ClassFilterSelect
          value={classFilter}
          onChange={setClassFilter}
          classes={classesRaw}
          allLabel="All Classes"
          className="w-36"
        />
        <SessionFilterSelect
          value={sessionFilter}
          onChange={setSessionFilter}
          academicYears={academicYears}
          allLabel="All Sessions"
          className="w-40"
        />
        {(classFilter || sessionFilter) && (
          <button type="button" onClick={() => { setClassFilter(""); setSessionFilter(""); }}
            className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
        )}
        <div className="ml-auto">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={async () => {
            const settings = await fetchPrintSettings();
            const tableHtml = `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px">
  <thead>
    <tr>${["Date","Class","Subject","Exam Type","Total Marks","Pass Marks","Venue"].map(h => `<th style="background:#f1f5f9;font-weight:700;text-align:left;padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:.05em">${h}</th>`).join("")}</tr>
  </thead>
  <tbody>
    ${grouped.flatMap(({ date, rows }) => rows.map((r, i) => `<tr style="${i % 2 === 1 ? "background:#f8fafc" : ""}"><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap">${date === "__tbd__" ? "TBD" : fmtDate(date)}</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-weight:600">${escapeHtml(r.classCode)}</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0">${escapeHtml(r.subjectName ?? r.subjectCode)} <span style="font-size:9px;color:#888">${escapeHtml(r.subjectCode)}</span></td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0">${r.examTypeName ? escapeHtml(r.examTypeName) : "—"}</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${r.totalMarks}</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${r.passMarks}</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0">${r.venue ? escapeHtml(r.venue) : "—"}</td></tr>`)).join("")}
  </tbody>
</table>`;
            const html = buildPrintHtml(tableHtml, settings, "Date Sheet");
            printHtmlDocument(html);
          }}>
            <Printer className="h-3.5 w-3.5" /> Print Date Sheet
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-500">
            {all.length === 0 ? "No exams scheduled yet — add them in the Schedule tab." : "No exams match your filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ date, rows }) => (
            <div key={date} className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-border">
                <CalendarDays className="h-4 w-4 text-violet-500" />
                <span className="text-sm font-semibold text-slate-800">
                  {date === "__tbd__" ? "Date TBD" : fmtDate(date)}
                </span>
                <span className="ml-auto text-xs text-slate-400">{rows.length} exam{rows.length !== 1 ? "s" : ""}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {["Class","Subject","Exam Type","Total Marks","Pass Marks","Venue"].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{r.classCode}</td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {r.subjectName ?? r.subjectCode}
                        <span className="text-xs text-slate-400 ml-1.5 font-mono">{r.subjectCode}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{r.examTypeName ?? "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-700">{r.totalMarks}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-500">{r.passMarks}</td>
                      <td className="px-4 py-2.5 text-slate-400">{r.venue ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
