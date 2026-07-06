import { useState, useEffect } from "react";
import {
  useGetAdminFeeConcessionsReport,
  getGetAdminFeeConcessionsReportQueryKey,
  useListAdminAcademicYears,
  useListAdminClasses,
  type FeeConcessionRow,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, Download, Tag } from "lucide-react";

function fmt(n: number) { return formatCurrency(n); }

export function FeeConcessionContent() {
  return <FeeConcessionPage />;
}

function FeeConcessionPage() {
  const { data: yearsRaw = [] } = useListAdminAcademicYears();
  const years = yearsRaw as any[];
  const { data: classesRaw = [] } = useListAdminClasses();
  const classes = classesRaw as any[];

  const [yearId, setYearId]       = useState("");
  const [classCode, setClassCode] = useState("all");
  const [applied, setApplied]     = useState<{ yearId: string; classCode?: string } | null>(null);

  useEffect(() => {
    if (years.length && !yearId) {
      const def = years.find((y: any) => y.isDefault) ?? years[0];
      setYearId(def.id);
    }
  }, [years, yearId]);

  useEffect(() => {
    if (yearId) applyFilter();
  }, [yearId]);

  function applyFilter() {
    if (!yearId) return;
    setApplied({ yearId, classCode: classCode === "all" ? undefined : classCode });
  }

  const qParams = { academicYearId: applied?.yearId ?? "", classCode: applied?.classCode };
  const { data, isLoading } = useGetAdminFeeConcessionsReport(
    qParams,
    { query: { enabled: !!applied, queryKey: getGetAdminFeeConcessionsReportQueryKey(qParams) } },
  );
  const rows = (data as FeeConcessionRow[] | undefined) ?? [];

  const concessionRows  = rows.filter(r => r.adjustmentType === "concession");
  const surchargeRows   = rows.filter(r => r.adjustmentType === "surcharge");
  const totalConcession = concessionRows.reduce((s, r) => s + (r.concessionAmount ?? 0), 0);
  const totalSurcharge  = surchargeRows.reduce((s, r) => s + (r.concessionAmount ?? 0), 0);

  function exportCsv() {
    const header = ["#", "Student Name", "Register ID", "Class", "Fee Type", "Class Rate (Rs)", "Override (Rs)", "Adjustment (Rs)", "Type"];
    const csvRows = rows.map((r, i) => [
      i + 1,
      `"${r.studentName}"`,
      r.applicantId,
      r.classCode,
      `"${r.feeTypeName}"`,
      r.scheduleAmount,
      r.overrideAmount,
      r.concessionAmount,
      r.adjustmentType ?? "concession",
    ].join(","));
    const csv = [header.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `fee-adjustments-${applied?.yearId ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Fee Adjustments Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Students with a fee override — concessions (below class rate) or surcharges (above class rate)
          </p>
        </div>
        {rows.length > 0 && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-white shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 min-w-[160px]">
            <Label>Academic Year <span className="text-red-500">*</span></Label>
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select year…" /></SelectTrigger>
              <SelectContent>
                {years.map((y: any) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-[140px]">
            <Label>Class <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
            <Select value={classCode} onValueChange={setClassCode}>
              <SelectTrigger className="h-9"><SelectValue placeholder="All classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((c: any) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="self-end">
            <Button size="sm" className="h-9 gap-1.5" onClick={applyFilter} disabled={!yearId}>
              <Filter className="h-3.5 w-3.5" /> Apply
            </Button>
          </div>
        </div>
      </div>

      {/* Summary banner */}
      {!isLoading && applied && rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-border bg-white shadow-sm px-5 py-4 flex flex-col gap-1">
            <span className="text-xl font-extrabold text-slate-800">{new Set(rows.map(r => r.studentId)).size}</span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Students with Adjustments</span>
          </div>
          <div className="rounded-2xl border border-border bg-white shadow-sm px-5 py-4 flex flex-col gap-1">
            <span className="text-xl font-extrabold text-emerald-700">{concessionRows.length}</span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Concession Lines</span>
          </div>
          <div className="rounded-2xl border border-border bg-white shadow-sm px-5 py-4 flex flex-col gap-1">
            <span className="text-xl font-extrabold text-emerald-700">{fmt(totalConcession)}</span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Total Concession</span>
          </div>
          <div className="rounded-2xl border border-border bg-white shadow-sm px-5 py-4 flex flex-col gap-1">
            <span className="text-xl font-extrabold text-orange-600">{fmt(totalSurcharge)}</span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Total Surcharge ({surchargeRows.length} lines)</span>
          </div>
        </div>
      )}

      {/* Table */}
      {!applied ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
          <Tag className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">Select an academic year and click Apply</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
          <Tag className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">No fee adjustments found for this selection</p>
          <p className="text-xs text-slate-400">Adjustments appear when a student's override differs from the class schedule rate</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white shadow-sm overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                {["#", "Student", "Register ID", "Class", "Fee Type", "Class Rate", "Override (Net)", "Adjustment", "Type"].map((h, i) => (
                  <th
                    key={i}
                    className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, i) => {
                const isSurcharge = row.adjustmentType === "surcharge";
                return (
                  <tr key={`${row.studentId}-${row.feeTypeId}`} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{row.studentName}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.applicantId}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700 text-xs">{row.classCode.toUpperCase()}</td>
                    <td className="px-4 py-3 text-slate-700">{row.feeTypeName}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{fmt(row.scheduleAmount)}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{fmt(row.overrideAmount)}</td>
                    <td className="px-4 py-3">
                      {isSurcharge ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 px-2.5 py-0.5 text-xs font-bold">
                          + {fmt(row.concessionAmount)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-xs font-bold">
                          − {fmt(row.concessionAmount)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${isSurcharge ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {isSurcharge ? "Surcharge" : "Concession"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-border">
                <td colSpan={7} className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide text-right">
                  Net Concessions / Surcharges
                </td>
                <td className="px-4 py-3" colSpan={2}>
                  <div className="flex flex-wrap gap-2">
                    {totalConcession > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-200 text-emerald-800 px-2.5 py-0.5 text-xs font-extrabold">
                        − {fmt(totalConcession)}
                      </span>
                    )}
                    {totalSurcharge > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-200 text-orange-800 px-2.5 py-0.5 text-xs font-extrabold">
                        + {fmt(totalSurcharge)}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default FeeConcessionContent;
