import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate, formatCurrency, todayIso } from "@/lib/locale";
import { fetchPrintSettings, buildPrintHtml, escapeHtml } from "@/lib/print-utils";
import LedgerStatement from "@/components/LedgerStatement";
import { useSearch, useLocation } from "wouter";
import {
  useGetFeeReportCollectionSummary,
  getGetFeeReportCollectionSummaryQueryKey,
  useGetFeeReportChallanLedger,
  getGetFeeReportChallanLedgerQueryKey,
  useGetFeeReportClassWise,
  getGetFeeReportClassWiseQueryKey,
  useGetFeeReportFeeStatus,
  getGetFeeReportFeeStatusQueryKey,
  getGetFeeReportFeeStatusUrl,
  useListAdminAcademicYears,
  useListAdminClasses,
  useListAdminSections,
  useListAdminFeeChallans,
  getListAdminFeeChallansQueryKey,
  useListAdminStudents,
  getListAdminStudentsQueryKey,
  useListAdminFeeTypes,
  type FeeCollectionSummary,
  type ChallanLedgerPage,
  type ClassWiseFeeReport,
  type FeeStatusReportPage,
  type FeeChallan,
  type FeeType,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Filter, TrendingUp, FileText, LayoutGrid, User, Search,
  Hash, ChevronLeft, ChevronRight, Download, Tag, RefreshCw,
} from "lucide-react";
import { FeeConcessionContent } from "@/pages/fee/FeeConcessions";

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "summary",      label: "Collection Summary",       icon: TrendingUp  },
  { key: "ledger",       label: "Challan Ledger",           icon: FileText    },
  { key: "class-wise",   label: "Class/Program-wise Report", icon: LayoutGrid  },
  { key: "fee-status",   label: "Fee Status",               icon: Hash        },
  { key: "student",      label: "Student Ledger",           icon: User        },
  { key: "discount",     label: "Discount Report",          icon: Tag         },
] as const;

type TabKey = typeof TABS[number]["key"];

// ─── Shared helpers ───────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; classes: string }> = {
  pending:  { label: "Pending",  classes: "bg-amber-100 text-amber-700"   },
  paid:     { label: "Paid",     classes: "bg-emerald-100 text-emerald-700" },
  overdue:  { label: "Overdue",  classes: "bg-red-100 text-red-700"       },
};

const PIE_COLORS = ["#f59e0b", "#10b981", "#ef4444"];

const TOKEN_KEY = "ccm_admin_token";
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function downloadCsv(url: string, filename: string) {
  fetch(url, { headers: authHeaders() })
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    });
}

function fmt(n: number) { return formatCurrency(n); }
function pct(num: number, denom: number) {
  if (!denom) return "0%";
  return `${Math.round((num / denom) * 100)}%`;
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white shadow-sm p-4">
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </div>
  );
}

function YearSelect({ value, onChange, years }: { value: string; onChange: (v: string) => void; years: any[] }) {
  return (
    <div className="space-y-1.5 min-w-[160px]">
      <Label>Academic Year <span className="text-red-500">*</span></Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Select year…" /></SelectTrigger>
        <SelectContent>{years.map((y: any) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function ClassSelect({ value, onChange, classes, optional }: { value: string; onChange: (v: string) => void; classes: any[]; optional?: boolean }) {
  return (
    <div className="space-y-1.5 min-w-[140px]">
      <Label>Class {optional && <span className="text-slate-400 font-normal text-xs">(optional)</span>}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue placeholder="All classes" /></SelectTrigger>
        <SelectContent>
          {optional && <SelectItem value="all">All Classes</SelectItem>}
          {classes.map((c: any) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function SectionSelect({ value, onChange, sections }: { value: string; onChange: (v: string) => void; sections: any[] }) {
  return (
    <div className="space-y-1.5 min-w-[130px]">
      <Label>Section</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue placeholder="All sections" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Sections</SelectItem>
          {sections.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function MonthInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5 min-w-[150px]">
      <Label>Month <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
      <div className="flex gap-1.5 items-center">
        <Input type="month" value={value} onChange={e => onChange(e.target.value)} className="h-9 flex-1" />
        {value && <button onClick={() => onChange("")} className="text-xs text-slate-400 hover:text-slate-600 shrink-0">✕</button>}
      </div>
    </div>
  );
}

// ─── Tab 1: Collection Summary ────────────────────────────────────────────────

function TabSummary() {
  const { data: yearsRaw = [] } = useListAdminAcademicYears();
  const years = yearsRaw as any[];
  const { data: classesRaw = [] } = useListAdminClasses();
  const classes = classesRaw as any[];
  const { data: sectionsRaw = [] } = useListAdminSections();
  const sections = sectionsRaw as any[];

  const [yearId, setYearId]       = useState("");
  const [classCode, setClassCode] = useState("all");
  const [sectionId, setSectionId] = useState("all");
  const [month, setMonth]         = useState("");
  const [applied, setApplied]     = useState<{ yearId: string; classCode?: string; sectionId?: string; month?: string } | null>(null);

  useEffect(() => { if (years.length && !yearId) { const def = years.find((y: any) => y.isDefault) ?? years[0]; setYearId(def.id); } }, [years, yearId]);
  useEffect(() => { if (yearId) setApplied({ yearId, classCode: classCode === "all" ? undefined : classCode, sectionId: sectionId === "all" ? undefined : sectionId, month: month || undefined }); }, [yearId]);

  const { data, isLoading } = useGetFeeReportCollectionSummary(
    { academicYearId: applied?.yearId ?? "", classCode: applied?.classCode, sectionId: applied?.sectionId, month: applied?.month },
    { query: { enabled: !!applied, queryKey: getGetFeeReportCollectionSummaryQueryKey({ academicYearId: applied?.yearId ?? "", classCode: applied?.classCode, sectionId: applied?.sectionId, month: applied?.month }) } },
  );
  const summary = data as FeeCollectionSummary | undefined;

  function applyFilter() {
    if (!yearId) return;
    setApplied({ yearId, classCode: classCode === "all" ? undefined : classCode, sectionId: sectionId === "all" ? undefined : sectionId, month: month || undefined });
  }

  const collectionRate = summary ? pct(summary.totalPaid, summary.totalBilled) : "—";

  const pieData = summary?.byStatus.map(s => ({
    name: s.status.charAt(0).toUpperCase() + s.status.slice(1),
    value: s.amount,
  })) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <YearSelect value={yearId} onChange={setYearId} years={years} />
        <ClassSelect value={classCode} onChange={v => { setClassCode(v); setSectionId("all"); }} classes={classes} optional />
        <SectionSelect value={sectionId} onChange={setSectionId} sections={sections} />
        <MonthInput value={month} onChange={setMonth} />
        <div className="self-end">
          <Button size="sm" className="h-9 gap-1.5" onClick={applyFilter} disabled={!yearId}>
            <Filter className="h-3.5 w-3.5" />Apply
          </Button>
        </div>
      </FilterBar>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : summary ? (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Billed",      value: fmt(summary.totalBilled),   color: "bg-indigo-100 text-indigo-700"  },
              { label: "Total Collected",   value: fmt(summary.totalPaid),     color: "bg-emerald-100 text-emerald-700" },
              { label: "Outstanding",       value: fmt(summary.totalPending),  color: summary.totalPending > 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500" },
              { label: "Collection Rate",   value: collectionRate,             color: "bg-amber-100 text-amber-700"    },
            ].map(k => (
              <div key={k.label} className="rounded-2xl border border-border bg-white shadow-sm px-5 py-4 flex flex-col gap-1">
                <span className={cn("text-xl font-extrabold", k.color.split(" ")[1])}>{k.value}</span>
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{k.label}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* By Fee Type bar chart */}
            <div className="lg:col-span-3 rounded-2xl border border-border bg-white shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-4">By Fee Type</h3>
              {summary.byFeeType.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={summary.byFeeType} margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="feeTypeName" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), ""]} />
                    <Legend />
                    <Bar dataKey="billed"  name="Billed"    fill="#6366f1" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="paid"    name="Collected" fill="#10b981" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="pending" name="Pending"   fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* By Status pie */}
            <div className="lg:col-span-2 rounded-2xl border border-border bg-white shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-4">By Status (Amount)</h3>
              {pieData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), ""]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* By class table */}
          {summary.byClass.length > 0 && (
            <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-slate-50">
                <h3 className="text-sm font-bold text-slate-700">By Class/Program</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-slate-50/50">
                    {["Class/Program", "Billed", "Collected", "Outstanding", "Collection %"].map((h, i) => (
                      <th key={i} className="text-left px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {summary.byClass.map(row => (
                    <tr key={row.classCode} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 font-bold text-slate-800">{row.classCode}</td>
                      <td className="px-5 py-3 font-mono text-slate-700">{fmt(row.billed)}</td>
                      <td className="px-5 py-3 font-mono text-emerald-700 font-semibold">{fmt(row.paid)}</td>
                      <td className="px-5 py-3 font-mono text-red-600">{fmt(row.pending)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-[80px]">
                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: pct(row.paid, row.billed) }} />
                          </div>
                          <span className="text-xs font-semibold text-slate-700">{pct(row.paid, row.billed)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
          <TrendingUp className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">Select filters and click Apply to load the report</p>
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Challan Ledger ────────────────────────────────────────────────────

function TabChallanLedger() {
  const { data: yearsRaw = [] } = useListAdminAcademicYears();
  const years = yearsRaw as any[];
  const { data: classesRaw = [] } = useListAdminClasses();
  const classes = classesRaw as any[];
  const { data: sectionsRaw = [] } = useListAdminSections();
  const sections = sectionsRaw as any[];

  const [yearId, setYearId]       = useState("");
  const [classCode, setClassCode] = useState("all");
  const [sectionId, setSectionId] = useState("all");
  const [month, setMonth]         = useState("");
  const [status, setStatus]       = useState("all");
  const [page, setPage]           = useState(1);
  const PAGE_SIZE = 50;

  const [applied, setApplied] = useState<Record<string, string | undefined> | null>(null);

  useEffect(() => { if (years.length && !yearId) { const def = years.find((y: any) => y.isDefault) ?? years[0]; setYearId(def.id); } }, [years, yearId]);
  useEffect(() => { if (yearId) applyFilter(); }, [yearId]);

  function applyFilter() {
    if (!yearId) return;
    setPage(1);
    setApplied({
      academicYearId: yearId,
      classCode: classCode === "all" ? undefined : classCode,
      sectionId: sectionId === "all" ? undefined : sectionId,
      month: month || undefined,
      status: status === "all" ? undefined : status,
    });
  }

  const qParams = {
    academicYearId: applied?.academicYearId ?? "",
    classCode: applied?.classCode,
    sectionId: applied?.sectionId,
    month: applied?.month,
    status: applied?.status as any,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading } = useGetFeeReportChallanLedger(
    qParams,
    { query: { enabled: !!applied, queryKey: getGetFeeReportChallanLedgerQueryKey({ ...qParams }) } },
  );
  const ledger = data as ChallanLedgerPage | undefined;
  const totalPages = ledger ? Math.ceil(ledger.total / PAGE_SIZE) : 1;

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <YearSelect value={yearId} onChange={setYearId} years={years} />
        <ClassSelect value={classCode} onChange={v => { setClassCode(v); setSectionId("all"); }} classes={classes} optional />
        <SectionSelect value={sectionId} onChange={setSectionId} sections={sections} />
        <MonthInput value={month} onChange={setMonth} />
        <div className="space-y-1.5 min-w-[130px]">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="self-end">
          <Button size="sm" className="h-9 gap-1.5" onClick={applyFilter} disabled={!yearId}>
            <Filter className="h-3.5 w-3.5" />Apply
          </Button>
        </div>
      </FilterBar>

      {/* Record count */}
      {ledger && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {ledger.total.toLocaleString()} challan{ledger.total !== 1 ? "s" : ""}
            {applied?.status && applied.status !== "all" ? ` · ${applied.status}` : ""}
          </p>
          <div className="flex items-center gap-1.5">
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-slate-500 min-w-[90px] text-center">
              Page {page} of {totalPages}
            </span>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {!applied ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
          <FileText className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">Select filters and click Apply</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : !ledger || ledger.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">No challans found for this selection.</p>
      ) : (
        <div className="rounded-2xl border border-border bg-white shadow-sm overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                {["Challan #", "Student", "Father", "Class/Program", "Fee Head", "Period", "Amount", "Due Date", "Status", "Paid On"].map((h, i) => (
                  <th key={i} className={cn(
                    "text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap",
                    i === 0 && "hidden md:table-cell",
                    i === 2 && "hidden lg:table-cell",
                    i === 5 && "hidden sm:table-cell",
                    i === 7 && "hidden md:table-cell",
                    i === 9 && "hidden lg:table-cell",
                  )}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ledger.rows.map(row => (
                <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="font-mono text-xs text-slate-500">{row.challanNumber ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800 text-sm">{row.fullName}</p>
                    <p className="text-[10px] font-mono text-slate-400">Applicant ID {row.applicantId}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs hidden lg:table-cell">{row.fatherName ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700 text-xs font-semibold">{row.classCode}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-slate-800">{row.feeTypeName}</p>
                    <p className="text-[10px] font-mono text-slate-400">{row.feeCode}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs hidden sm:table-cell">{row.month ?? "—"}</td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-900">{fmt(row.amount)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">{row.dueDate}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      STATUS_META[row.status]?.classes ?? "bg-slate-100 text-slate-600")}>
                      {STATUS_META[row.status]?.label ?? row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell">
                    {row.paidAt ? formatDate(row.paidAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom pagination */}
      {ledger && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 gap-1">
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-8 gap-1">
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Class-wise Report ─────────────────────────────────────────────────

function TabClassWise() {
  const { data: yearsRaw = [] } = useListAdminAcademicYears();
  const years = yearsRaw as any[];

  const [yearId, setYearId] = useState("");
  const [month, setMonth]   = useState("");
  const [applied, setApplied] = useState<{ yearId: string; month?: string } | null>(null);

  useEffect(() => { if (years.length && !yearId) { const def = years.find((y: any) => y.isDefault) ?? years[0]; setYearId(def.id); } }, [years, yearId]);
  useEffect(() => { if (yearId) setApplied({ yearId, month: month || undefined }); }, [yearId]);

  const { data, isLoading } = useGetFeeReportClassWise(
    { academicYearId: applied?.yearId ?? "", month: applied?.month },
    { query: { enabled: !!applied, queryKey: getGetFeeReportClassWiseQueryKey({ academicYearId: applied?.yearId ?? "", month: applied?.month }) } },
  );
  const report = data as ClassWiseFeeReport | undefined;

  function applyFilter() {
    if (!yearId) return;
    setApplied({ yearId, month: month || undefined });
  }

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <YearSelect value={yearId} onChange={setYearId} years={years} />
        <MonthInput value={month} onChange={setMonth} />
        <div className="self-end">
          <Button size="sm" className="h-9 gap-1.5" onClick={applyFilter} disabled={!yearId}>
            <Filter className="h-3.5 w-3.5" />Apply
          </Button>
        </div>
      </FilterBar>

      {!applied ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
          <LayoutGrid className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">Select an academic year and click Apply</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : !report || report.feeTypes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">No fee data found. Generate some challans first.</p>
      ) : (
        <div className="rounded-2xl border border-border bg-white shadow-sm overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 sticky left-0 bg-slate-50 min-w-[120px]">
                  Class
                </th>
                {report.feeTypes.map(ft => (
                  <th key={ft.id} colSpan={2} className="text-center px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-l border-border min-w-[180px]">
                    {ft.name}
                  </th>
                ))}
                <th colSpan={2} className="text-center px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-indigo-600 border-l border-border min-w-[180px]">
                  TOTAL
                </th>
              </tr>
              <tr className="bg-slate-50/50 border-b border-border">
                <th className="px-4 py-1.5 sticky left-0 bg-slate-50/50" />
                {report.feeTypes.map(ft => (
                  <>
                    <th key={`${ft.id}-b`} className="px-3 py-1.5 text-[10px] font-bold text-emerald-600 border-l border-border text-center">Collected</th>
                    <th key={`${ft.id}-p`} className="px-3 py-1.5 text-[10px] font-bold text-amber-600 text-center">Pending</th>
                  </>
                ))}
                <th className="px-3 py-1.5 text-[10px] font-bold text-emerald-600 border-l border-border text-center">Collected</th>
                <th className="px-3 py-1.5 text-[10px] font-bold text-amber-600 text-center">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.classes.map(cls => {
                const row = (report.pivot as any)[cls.code] ?? {};
                const totalPaid    = report.feeTypes.reduce((s, ft) => s + (row[ft.id]?.paid ?? 0), 0);
                const totalPending = report.feeTypes.reduce((s, ft) => s + ((row[ft.id]?.billed ?? 0) - (row[ft.id]?.paid ?? 0)), 0);
                return (
                  <tr key={cls.code} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-800 sticky left-0 bg-white">{cls.name}</td>
                    {report.feeTypes.map(ft => {
                      const cell = row[ft.id];
                      const paid    = cell?.paid ?? 0;
                      const pending = (cell?.billed ?? 0) - paid;
                      return (
                        <>
                          <td key={`${ft.id}-c`} className="px-3 py-3 font-mono text-sm text-emerald-700 text-right border-l border-border">
                            {paid > 0 ? fmt(paid) : <span className="text-slate-300">—</span>}
                          </td>
                          <td key={`${ft.id}-p`} className="px-3 py-3 font-mono text-sm text-amber-700 text-right">
                            {pending > 0 ? fmt(pending) : <span className="text-slate-300">—</span>}
                          </td>
                        </>
                      );
                    })}
                    <td className="px-3 py-3 font-mono font-bold text-sm text-emerald-800 text-right border-l border-indigo-100 bg-indigo-50/30">
                      {totalPaid > 0 ? fmt(totalPaid) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3 font-mono font-bold text-sm text-amber-800 text-right bg-indigo-50/30">
                      {totalPending > 0 ? fmt(totalPending) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
              {/* Grand totals row */}
              <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                <td className="px-4 py-3 text-slate-900 sticky left-0 bg-slate-100">Grand Total</td>
                {report.feeTypes.map(ft => {
                  const totalPaid    = report.classes.reduce((s, cls) => s + ((report.pivot as any)[cls.code]?.[ft.id]?.paid ?? 0), 0);
                  const totalBilled  = report.classes.reduce((s, cls) => s + ((report.pivot as any)[cls.code]?.[ft.id]?.billed ?? 0), 0);
                  const totalPending = totalBilled - totalPaid;
                  return (
                    <>
                      <td key={`${ft.id}-c`} className="px-3 py-3 font-mono text-sm text-emerald-800 text-right border-l border-border">
                        {totalPaid > 0 ? fmt(totalPaid) : "—"}
                      </td>
                      <td key={`${ft.id}-p`} className="px-3 py-3 font-mono text-sm text-amber-800 text-right">
                        {totalPending > 0 ? fmt(totalPending) : "—"}
                      </td>
                    </>
                  );
                })}
                <td className="px-3 py-3 font-mono text-sm text-emerald-900 text-right border-l border-indigo-200 bg-indigo-100">
                  {fmt(report.classes.reduce((s1, cls) => s1 + report.feeTypes.reduce((s2, ft) => s2 + ((report.pivot as any)[cls.code]?.[ft.id]?.paid ?? 0), 0), 0))}
                </td>
                <td className="px-3 py-3 font-mono text-sm text-amber-900 text-right bg-indigo-100">
                  {fmt(report.classes.reduce((s1, cls) => s1 + report.feeTypes.reduce((s2, ft) => {
                    const b = (report.pivot as any)[cls.code]?.[ft.id]?.billed ?? 0;
                    const p = (report.pivot as any)[cls.code]?.[ft.id]?.paid ?? 0;
                    return s2 + (b - p);
                  }, 0), 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Fee Status ────────────────────────────────────────────────────────────

const FEE_STATUS_META: Record<string, { label: string; classes: string }> = {
  paid:    { label: "Paid",    classes: "bg-emerald-100 text-emerald-700" },
  unpaid:  { label: "Unpaid",  classes: "bg-red-100 text-red-700"         },
  partial: { label: "Partial", classes: "bg-amber-100 text-amber-700"    },
};

function TabFeeStatus() {
  const { data: yearsRaw = [] } = useListAdminAcademicYears();
  const years = yearsRaw as any[];
  const { data: classesRaw = [] } = useListAdminClasses();
  const classes = classesRaw as any[];
  const { data: feeTypesRaw = [] } = useListAdminFeeTypes();
  const feeTypes = feeTypesRaw as FeeType[];

  const [yearId, setYearId]       = useState("");
  const [classCode, setClassCode] = useState("all");
  const [feeTypeId, setFeeTypeId] = useState("all");
  const [status, setStatus]       = useState("all");
  const [search, setSearch]       = useState("");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [page, setPage]           = useState(1);
  const PAGE_SIZE = 25;

  const [applied, setApplied] = useState<{
    yearId: string; classCode: string; feeTypeId: string; status: string;
    search: string; dateFrom: string; dateTo: string;
  } | null>(null);

  useEffect(() => { if (years.length && !yearId) { const def = years.find((y: any) => y.isDefault) ?? years[0]; setYearId(def.id); } }, [years, yearId]);
  useEffect(() => {
    if (yearId && !applied) {
      setApplied({ yearId, classCode, feeTypeId, status, search, dateFrom, dateTo });
    }
  }, [yearId]);

  function applyFilter() {
    if (!yearId) return;
    setPage(1);
    setApplied({ yearId, classCode, feeTypeId, status, search, dateFrom, dateTo });
  }

  const qParams = {
    academicYearId: applied?.yearId ?? "",
    classCode: applied && applied.classCode !== "all" ? applied.classCode : undefined,
    feeTypeId: applied && applied.feeTypeId !== "all" ? applied.feeTypeId : undefined,
    status: applied && applied.status !== "all" ? (applied.status as any) : undefined,
    studentSearch: applied?.search || undefined,
    dateFrom: applied?.dateFrom || undefined,
    dateTo: applied?.dateTo || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading } = useGetFeeReportFeeStatus(
    qParams,
    { query: { enabled: !!applied, queryKey: getGetFeeReportFeeStatusQueryKey({ ...qParams }) } },
  );
  const report = data as FeeStatusReportPage | undefined;
  const totalPages = report ? Math.max(1, Math.ceil(report.total / PAGE_SIZE)) : 1;

  function exportCsv() {
    if (!applied) return;
    const base = (import.meta.env.VITE_API_BASE as string) || "";
    const url = getGetFeeReportFeeStatusUrl({ ...qParams, page: 1, pageSize: undefined as any, format: "csv" as any });
    downloadCsv(`${base}${url}`, `fee-status-report-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <YearSelect value={yearId} onChange={setYearId} years={years} />
        <ClassSelect value={classCode} onChange={setClassCode} classes={classes} optional />
        <div className="space-y-1.5 min-w-[160px]">
          <Label>Fee Type <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
          <Select value={feeTypeId} onValueChange={setFeeTypeId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="All fee types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Fee Types</SelectItem>
              {feeTypes.map(ft => <SelectItem key={ft.id} value={ft.id}>{ft.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 min-w-[130px]">
          <Label>Payment Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 min-w-[180px]">
          <Label>Student <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, GR#, Roll#…" className="h-9 pl-8" />
          </div>
        </div>
        <div className="space-y-1.5 min-w-[140px]">
          <Label>From <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} max={todayIso()} className="h-9" />
        </div>
        <div className="space-y-1.5 min-w-[140px]">
          <Label>To <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} max={todayIso()} className="h-9" />
        </div>
        <div className="self-end flex gap-2">
          <Button size="sm" className="h-9 gap-1.5" onClick={applyFilter} disabled={!yearId}>
            <Filter className="h-3.5 w-3.5" />Apply
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={exportCsv} disabled={!applied || !report || report.total === 0}>
            <Download className="h-3.5 w-3.5" />Export CSV
          </Button>
        </div>
      </FilterBar>

      {/* Summary strip */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Standard Fee",  v: report.summary.totalStandard,   c: "text-slate-900" },
            { label: "Decided Fee",   v: report.summary.totalDecided,    c: "text-slate-900" },
            { label: "Discount",      v: report.summary.totalDiscount,   c: "text-indigo-700" },
            { label: "Fine",          v: report.summary.totalFine,       c: "text-amber-700" },
            { label: "Paid",          v: report.summary.totalPaid,       c: "text-emerald-700" },
            { label: "Outstanding",   v: report.summary.totalOutstanding, c: "text-red-600" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-border bg-white shadow-sm p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
              <p className={cn("font-mono font-extrabold text-lg mt-0.5", s.c)}>{fmt(s.v)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Record count + pagination */}
      {report && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {report.total.toLocaleString()} challan{report.total !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-1.5">
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-slate-500 min-w-[90px] text-center">
              Page {page} of {totalPages}
            </span>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {!applied ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
          <Hash className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">Select an academic year and click Apply</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : !report || report.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">No challans found for this selection.</p>
      ) : (
        <div className="rounded-2xl border border-border bg-white shadow-sm overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                {["Student", "Class", "Fee Head", "Standard", "Decided", "Discount", "Fine", "Paid", "Balance", "Status"].map((h, i) => (
                  <th key={i} className={cn(
                    "text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap",
                    i >= 3 && i <= 8 && "text-right",
                  )}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.rows.map(row => (
                <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800 text-sm">{row.studentName}</p>
                    <p className="text-[10px] font-mono text-slate-400">Applicant ID {row.applicantId}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-xs font-semibold">{row.classCode}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-slate-800">{row.feeTypeName}</p>
                    <p className="text-[10px] text-slate-400">{row.dueDate}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-right text-slate-700">{fmt(row.standardFee)}</td>
                  <td className="px-4 py-3 font-mono text-right font-bold text-slate-900">{fmt(row.decidedFee)}</td>
                  <td className="px-4 py-3 font-mono text-right text-indigo-700">{row.discount > 0 ? fmt(row.discount) : "—"}</td>
                  <td className="px-4 py-3 font-mono text-right text-amber-700">{row.fine > 0 ? fmt(row.fine) : "—"}</td>
                  <td className="px-4 py-3 font-mono text-right text-emerald-700">{fmt(row.paidAmount)}</td>
                  <td className="px-4 py-3 font-mono text-right font-bold text-right">
                    <span className={row.balance > 0 ? "text-red-600" : "text-slate-400"}>{fmt(row.balance)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      FEE_STATUS_META[row.paymentStatus]?.classes ?? "bg-slate-100 text-slate-600")}>
                      {FEE_STATUS_META[row.paymentStatus]?.label ?? row.paymentStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom pagination */}
      {report && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 gap-1">
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-8 gap-1">
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Tab 4: Student Ledger ────────────────────────────────────────────────────

function TabStudentLedger() {
  const [search, setSearch]           = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [page, setPage]               = useState(1);
  const [selected, setSelected]       = useState<any>(null);
  const [syncing, setSyncing]         = useState(false);
  const [syncMsg, setSyncMsg]         = useState<string | null>(null);
  const printRef                      = useRef<HTMLDivElement>(null);
  const queryClient                   = useQueryClient();
  const PAGE_SIZE = 15;

  const studentsQKey = getListAdminStudentsQueryKey({
    q: search || undefined,
    classCode: classFilter === "all" ? undefined : classFilter,
    page, pageSize: PAGE_SIZE,
  });

  const { data: classesRaw = [] } = useListAdminClasses();
  const classes = classesRaw as any[];

  // Always-loaded student list, filtered by search + class
  const { data: studentsPage, isLoading: listLoading } = useListAdminStudents(
    { q: search || undefined, classCode: classFilter === "all" ? undefined : classFilter, page, pageSize: PAGE_SIZE },
    { query: { queryKey: studentsQKey } },
  );
  const students     = (studentsPage as any)?.items ?? [];
  const totalStudents = (studentsPage as any)?.total ?? 0;
  const totalPages    = Math.max(1, Math.ceil(totalStudents / PAGE_SIZE));

  // After a backfill sync, refresh `selected` from the updated student list
  useEffect(() => {
    if (!selected || selected.coaId) return;
    const updated = ((studentsPage as any)?.items ?? []).find((s: any) => s.id === selected.id);
    if (updated?.coaId) setSelected(updated);
  }, [studentsPage]);

  // Fee challans for the selected student
  const { data: challansRaw = [], isLoading: challansLoading } = useListAdminFeeChallans(
    { studentId: selected?.id },
    { query: { enabled: !!selected?.id, queryKey: getListAdminFeeChallansQueryKey({ studentId: selected?.id }) } },
  );
  const allChallans = challansRaw as FeeChallan[];

  const totalBilled  = allChallans.reduce((s, c) => s + c.amount, 0);
  const totalPaid    = allChallans.filter(c => c.status === "paid").reduce((s, c) => s + c.amount, 0);
  const totalPending = totalBilled - totalPaid;

  function handleSearch(v: string) { setSearch(v); setPage(1); }
  function handleClass(v: string)  { setClassFilter(v); setPage(1); }

  const handleSyncLedger = useCallback(async () => {
    if (!selected || syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const tenant = localStorage.getItem("ccm_admin_website_tenant") || "ccm";
      const token  = localStorage.getItem(TOKEN_KEY);
      const h: Record<string, string> = { "X-Tenant-Id": tenant, "Content-Type": "application/json" };
      if (token) h.Authorization = `Bearer ${token}`;

      // 1. Create sub-ledger accounts for students without one
      await fetch("/api/admin/coa/backfill-students", { method: "POST", headers: h });

      // 2. Post billing JEs for all historical challans that were skipped
      const r2   = await fetch("/api/admin/coa/backfill-challan-jes", { method: "POST", headers: h });
      const data = await r2.json().catch(() => ({}));

      // 3. Refresh the student list so `selected` picks up the new coaId via the useEffect above
      await queryClient.invalidateQueries({ queryKey: studentsQKey });

      setSyncMsg(data.message ?? "Sync complete.");
    } catch (e: any) {
      setSyncMsg("Sync failed — " + (e?.message ?? "unknown error"));
    } finally {
      setSyncing(false);
    }
  }, [selected, syncing, queryClient, studentsQKey]);

  // ── LEDGER VIEW (student selected) ────────────────────────────────────────
  if (selected) {
    return (
      <div className="flex flex-col gap-4">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors w-fit">
          <ChevronLeft className="h-4 w-4" />
          Back to student list
        </button>

        <div ref={printRef} className="grid grid-cols-1 lg:grid-cols-4 gap-4 print:block">
          {/* Student info card */}
          <div className="rounded-2xl border border-border bg-white shadow-sm p-5 space-y-4 lg:col-span-1 print:border-0 print:p-0 print:shadow-none">
            <div className="flex items-center gap-3 print:mb-4">
              <div className="flex items-center justify-center h-11 w-11 rounded-xl bg-indigo-100 shrink-0">
                <User className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <p className="font-extrabold text-slate-900 text-base leading-tight">{selected.fullName}</p>
                <p className="text-xs font-mono text-slate-400">Applicant ID {selected.applicantId}</p>
              </div>
            </div>
            {selected.fatherName && <p className="text-sm text-slate-600 text-center">s/o {selected.fatherName}</p>}
            <div className="text-center">
              <span className="inline-block rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{selected.classCode}</span>
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              {[
                { label: "Total Billed", v: fmt(totalBilled),  c: "text-slate-900" },
                { label: "Total Paid",   v: fmt(totalPaid),    c: "text-emerald-700" },
                { label: "Balance Due",  v: fmt(totalPending), c: totalPending > 0 ? "text-red-600" : "text-slate-400" },
              ].map(s => (
                <div key={s.label} className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">{s.label}</span>
                  <span className={cn("font-bold text-sm", s.c)}>{s.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bank-statement style ledger, sourced from journal_entry_lines via the student's COA link */}
          <div className="lg:col-span-3 print:col-span-3 flex flex-col gap-3">
            {/* Sync banner — shown when the student has no ledger account yet */}
            {!selected.coaId && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-800">
                  This student's ledger account hasn't been set up yet. Click <strong>Sync Ledger</strong> to create it and backfill any existing challans.
                </p>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                  disabled={syncing}
                  onClick={handleSyncLedger}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
                  {syncing ? "Syncing…" : "Sync Ledger"}
                </Button>
              </div>
            )}
            {syncMsg && (
              <p className={cn(
                "rounded-xl px-4 py-2.5 text-sm border",
                syncMsg.startsWith("Sync failed")
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800",
              )}>{syncMsg}</p>
            )}
            <LedgerStatement
              coaId={selected.coaId}
              title={`${selected.fullName} — Fee Ledger`}
              headerFields={[
                { label: "Applicant ID",   value: selected.applicantId },
                { label: "Name",   value: selected.fullName },
                { label: "Class",  value: selected.classCode ?? "—" },
                ...(selected.fatherName ? [{ label: "Father", value: selected.fatherName }] : []),
              ]}
              emptyStateHint="A ledger account is created once the first fee challan is posted for this student."
            />
          </div>
        </div>
      </div>
    );
  }

  // ── LIST VIEW (default) ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <FilterBar>
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <Label>Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Name, Applicant ID, or father's name…" className="pl-8 h-9 text-sm" />
          </div>
        </div>
        <ClassSelect value={classFilter} onChange={handleClass} classes={classes} optional />
      </FilterBar>

      {/* Count + pagination header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {listLoading ? "Loading…"
            : `${totalStudents.toLocaleString()} student${totalStudents !== 1 ? "s" : ""}${classFilter !== "all" ? ` · ${classFilter}` : ""}`}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-slate-500 min-w-[80px] text-center">Page {page} of {totalPages}</span>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Student table */}
      {listLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : students.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
          <User className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">No students found</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                {["Applicant ID", "Name", "Father", "Class/Program", ""].map((h, i) => (
                  <th key={i} className={cn(
                    "text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500",
                    i === 2 && "hidden lg:table-cell",
                    i === 4 && "w-24 text-right pr-5",
                  )}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((s: any) => (
                <tr key={s.id}
                  onClick={() => setSelected(s)}
                  className="hover:bg-indigo-50/50 cursor-pointer transition-colors group">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-slate-500 bg-slate-100 group-hover:bg-indigo-100 px-1.5 py-0.5 rounded transition-colors">{s.applicantId}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{s.fullName}</p>
                    {s.studentEmail && <p className="text-[10px] text-slate-400 mt-0.5">{s.studentEmail}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs hidden lg:table-cell">{s.fatherName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded bg-slate-100 group-hover:bg-indigo-100 px-2 py-0.5 text-xs font-bold text-slate-700 transition-colors">{s.classCode}</span>
                  </td>
                  <td className="px-4 py-3 text-right pr-5">
                    <span className="text-[10px] text-indigo-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">View ledger →</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 gap-1">
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-8 gap-1">
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Embeddable content (used standalone and inside Accounts module) ──────────

export function FeeReportsContent({ embedded = false }: { embedded?: boolean }) {
  const search  = useSearch();
  const [, nav] = useLocation();
  const [localTab, setLocalTab] = useState<TabKey>("summary");

  const tab = embedded
    ? localTab
    : ((new URLSearchParams(search).get("tab") ?? "summary") as TabKey);

  function goTab(key: TabKey) {
    if (embedded) setLocalTab(key);
    else nav(`/fee-reports?tab=${key}`, { replace: true });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-0.5 border-b border-border overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => goTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap -mb-px",
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700",
            )}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>
      <div>
        {tab === "summary"    && <TabSummary />}
        {tab === "ledger"     && <TabChallanLedger />}
        {tab === "class-wise" && <TabClassWise />}
        {tab === "fee-status" && <TabFeeStatus />}
        {tab === "student"    && <TabStudentLedger />}
        {tab === "discount"   && <FeeConcessionContent />}
      </div>
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function FeeReports() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Fee Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Collection summaries, challan ledgers, and class-wise breakdowns.</p>
      </div>
      <FeeReportsContent />
    </div>
  );
}
