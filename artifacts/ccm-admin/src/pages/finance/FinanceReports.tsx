import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { formatDate, formatCurrency, todayIso } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Loader2, ChevronLeft, ChevronRight, FileText, Users, TrendingUp, BookOpen, AlertTriangle, Receipt } from "lucide-react";

// ─── API helper ───────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = getToken();
  const tenantId = localStorage.getItem("ccm_admin_website_tenant") || "ccm";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "X-Tenant-Id": tenantId,
  };
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as any).error ?? `HTTP ${res.status}`); }
  return res.json();
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmt(n: number | string | null | undefined) {
  return formatCurrency(Number(n ?? 0));
}

function fmtDate(d: string | null | undefined) {
  return formatDate(d ?? null);
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    paid: "bg-green-100 text-green-700", approved: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700", draft: "bg-slate-100 text-slate-600",
    overdue: "bg-red-100 text-red-700", void: "bg-slate-100 text-slate-400",
    pending_approval: "bg-blue-100 text-blue-700", partial: "bg-orange-100 text-orange-700",
    recorded: "bg-indigo-100 text-indigo-700",
  };
  return map[s] ?? "bg-slate-100 text-slate-600";
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

// ─── Shared UI components ────────────────────────────────────────────────────

function Pagination({ page, pageSize, total, onPage }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1 && total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between text-xs text-slate-500 pt-3">
      <span>{((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1}
          className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
        <span className="px-2">{page} / {pages}</span>
        <button onClick={() => onPage(page + 1)} disabled={page >= pages}
          className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function PageSizeSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <FilterField label="Show">
      <select value={value} onChange={e => onChange(Number(e.target.value))}
        className="h-8 text-sm border border-input rounded-md px-2 bg-background w-20">
        <option value={25}>25</option>
        <option value={50}>50</option>
        <option value={100}>100</option>
      </select>
    </FilterField>
  );
}

function SummaryCard({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${cls}`}>
      <p className="text-xs font-medium mb-1 opacity-80">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2.5 font-medium whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, right, mono, cls }: { children: React.ReactNode; right?: boolean; mono?: boolean; cls?: string }) {
  return (
    <td className={`px-3 py-2 ${right ? "text-right" : ""} ${mono ? "font-mono" : ""} ${cls ?? ""}`}>
      {children}
    </td>
  );
}

// ─── Options types ────────────────────────────────────────────────────────────

interface ReportOptions {
  academicYears: { id: string; name: string }[];
  feeTypes:      { id: string; name: string }[];
  departments:   { id: string; name: string }[];
  bankAccounts:  { id: string; account_title: string; bank_name: string | null }[];
  classCodes:    string[];
  coaAccounts:   { id: string; code: string; name: string; type: string }[];
  allCoaAccounts: { id: string; code: string; name: string; type: string }[];
  sourceModules:  string[];
}

// Human-readable labels for source_module values seen across the app.
const SOURCE_MODULE_LABELS: Record<string, string> = {
  manual:              "Manual JE",
  fee:                 "Fee Receipt",
  "fee-billed":        "Fee Billing",
  "application-fee":   "Application Fee",
  "admission-fee":     "Admission Fee",
  "payroll-expense":   "Payroll (Expense)",
  "payroll-payment":   "Payroll (Payment)",
  "vendor-bill":       "Vendor Bill",
  "vendor-bill-pay":   "Vendor Bill Payment",
  vendor:              "Vendor Payment",
  store:               "Store",
  receipt:             "Receipt Voucher",
  payment:             "Payment Voucher",
};

function sourceModuleLabel(m: string | null): string {
  if (!m) return "Manual JE";
  return SOURCE_MODULE_LABELS[m] ?? m.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEE COLLECTION REPORT
// ═══════════════════════════════════════════════════════════════════════════════

interface FeeRow {
  id: string; challan_number: string | null; month: string | null;
  issue_date: string; due_date: string; amount: number; paid_amount: number | null;
  balance: number; status: string; paid_at: string | null; payment_method: string | null;
  account_title: string | null; remarks: string | null;
  applicant_id: string; roll_no: string | null;
  student_name: string; class_code: string; section_name: string | null;
  fee_type_name: string; academic_year_name: string; collected_by_name: string | null;
}
interface FeeSummary { totalBilled: number; totalPaid: number; totalOutstanding: number; }
interface FeePage { total: number; page: number; pageSize: number; rows: FeeRow[]; summary: FeeSummary; }

function FeeCollectionReport({ options }: { options: ReportOptions }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [f, setF] = useState({
    dateFrom: "", dateTo: "", status: "", academicYearId: "",
    feeTypeId: "", month: "", classCode: "",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF(p => ({ ...p, [k]: e.target.value })); setPage(1);
  };

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (f.dateFrom)       params.set("dateFrom", f.dateFrom);
  if (f.dateTo)         params.set("dateTo", f.dateTo);
  if (f.status)         params.set("status", f.status);
  if (f.academicYearId) params.set("academicYearId", f.academicYearId);
  if (f.feeTypeId)      params.set("feeTypeId", f.feeTypeId);
  if (f.month)          params.set("month", f.month);
  if (f.classCode)      params.set("classCode", f.classCode);

  const { data, isFetching } = useQuery<FeePage>({
    queryKey: ["rpt-fee", params.toString()],
    queryFn: () => apiFetch(`/api/admin/reports/fee-collection?${params}`),
    staleTime: 30_000,
  });

  const csvParams = new URLSearchParams(params);
  csvParams.delete("page"); csvParams.delete("pageSize"); csvParams.set("format", "csv");

  const rows = data?.rows ?? [];
  const sum  = data?.summary;

  return (
    <div className="space-y-4">
      {/* Filters card */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Fee Collection Report</h3>
          <Button size="sm" variant="outline"
            onClick={() => downloadCsv(`/api/admin/reports/fee-collection?${csvParams}`, "fee-collection-report.csv")}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <FilterField label="Issue Date From">
            <Input type="date" value={f.dateFrom} onChange={set("dateFrom")} max={todayIso()} className="h-8 text-sm w-36" />
          </FilterField>
          <FilterField label="Issue Date To">
            <Input type="date" value={f.dateTo} onChange={set("dateTo")} max={todayIso()} className="h-8 text-sm w-36" />
          </FilterField>
          <FilterField label="Month">
            <Input type="month" value={f.month} onChange={set("month")} className="h-8 text-sm w-36" />
          </FilterField>
          <FilterField label="Status">
            <select value={f.status} onChange={set("status")} className="h-8 text-sm border border-input rounded-md px-2 bg-background w-36">
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="partial">Partial</option>
              <option value="overdue">Overdue</option>
            </select>
          </FilterField>
          <FilterField label="Academic Year">
            <select value={f.academicYearId} onChange={set("academicYearId")} className="h-8 text-sm border border-input rounded-md px-2 bg-background w-36">
              <option value="">All Years</option>
              {options.academicYears.map(ay => <option key={ay.id} value={ay.id}>{ay.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Fee Type">
            <select value={f.feeTypeId} onChange={set("feeTypeId")} className="h-8 text-sm border border-input rounded-md px-2 bg-background w-40">
              <option value="">All Types</option>
              {options.feeTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Class/Program">
            <select value={f.classCode} onChange={set("classCode")} className="h-8 text-sm border border-input rounded-md px-2 bg-background w-32">
              <option value="">All Classes</option>
              {options.classCodes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FilterField>
          <PageSizeSelect value={pageSize} onChange={n => { setPageSize(n); setPage(1); }} />
        </div>

        {/* Summary cards */}
        {sum && !isFetching && (
          <div className="grid grid-cols-3 gap-3 pt-1">
            <SummaryCard label="Total Billed"      value={fmt(sum.totalBilled)}      cls="bg-indigo-50 border-indigo-100 text-indigo-800" />
            <SummaryCard label="Total Collected"   value={fmt(sum.totalPaid)}        cls="bg-green-50 border-green-100 text-green-800" />
            <SummaryCard label="Total Outstanding" value={fmt(sum.totalOutstanding)} cls="bg-red-50 border-red-100 text-red-800" />
          </div>
        )}

        <p className="text-xs text-slate-500">
          {isFetching ? "Loading…" : `${(data?.total ?? 0).toLocaleString()} records`}
          {isFetching && <Loader2 className="inline h-3 w-3 ml-2 animate-spin" />}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs text-slate-500">
                <Th>Challan #</Th>
                <Th>Applicant ID</Th>
                <Th>Roll #</Th>
                <Th>Student</Th>
                <Th>Class</Th>
                <Th>Section</Th>
                <Th>Fee Type</Th>
                <Th>Academic Year</Th>
                <Th>Month</Th>
                <Th>Issue Date</Th>
                <Th>Due Date</Th>
                <Th right>Amount Due</Th>
                <Th right>Paid</Th>
                <Th right>Balance</Th>
                <Th>Status</Th>
                <Th>Payment Date</Th>
                <Th>Payment Mode</Th>
                <Th>Collected By</Th>
                <Th>Remarks</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={19} className="px-3 py-10 text-center text-slate-400 text-xs">
                  {isFetching ? "Loading…" : "No records match the selected filters"}
                </td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/50">
                  <Td mono cls="text-xs text-slate-600">{r.challan_number ?? "—"}</Td>
                  <Td mono cls="text-xs text-slate-600">{r.applicant_id}</Td>
                  <Td cls="text-xs text-slate-500">{r.roll_no ?? "—"}</Td>
                  <Td cls="font-medium text-slate-800 whitespace-nowrap">{r.student_name}</Td>
                  <Td cls="text-slate-600">{r.class_code}</Td>
                  <Td cls="text-slate-600">{r.section_name ?? "—"}</Td>
                  <Td cls="text-slate-600 whitespace-nowrap">{r.fee_type_name}</Td>
                  <Td cls="text-slate-600 whitespace-nowrap">{r.academic_year_name}</Td>
                  <Td cls="text-slate-600">{r.month ?? "—"}</Td>
                  <Td cls="text-slate-600 whitespace-nowrap">{fmtDate(r.issue_date)}</Td>
                  <Td cls="text-slate-600 whitespace-nowrap">{fmtDate(r.due_date)}</Td>
                  <Td right mono cls="text-slate-700">{fmt(r.amount)}</Td>
                  <Td right mono cls="text-slate-700">{r.paid_amount != null ? fmt(r.paid_amount) : "—"}</Td>
                  <Td right mono cls={r.balance > 0 ? "text-red-600 font-semibold" : "text-green-700"}>{fmt(r.balance)}</Td>
                  <Td>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(r.status)}`}>
                      {r.status}
                    </span>
                  </Td>
                  <Td cls="text-slate-600 whitespace-nowrap">{fmtDate(r.paid_at)}</Td>
                  <Td cls="text-slate-600 capitalize">{r.payment_method ?? "—"}</Td>
                  <Td cls="text-slate-600 whitespace-nowrap">{r.collected_by_name ?? "—"}</Td>
                  <Td cls="text-slate-500 max-w-[140px] truncate">{r.remarks ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPage={setPage} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DUE FEE REPORT
// ═══════════════════════════════════════════════════════════════════════════════

interface DueFeeRow {
  id: string; challan_number: string | null; due_date: string;
  amount: number; paid_amount: number | null; balance: number; days_overdue: number;
  applicant_id: string; roll_no: string | null; student_name: string;
  class_code: string; section_name: string | null; academic_year_name: string;
}
interface DueFeeSummary { studentsWithDues: number; totalOutstanding: number; overdueChallans: number; }
interface DueFeePage { total: number; page: number; pageSize: number; rows: DueFeeRow[]; summary: DueFeeSummary; }

function DueFeeReport({ options }: { options: ReportOptions }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [f, setF] = useState({
    dueDateFrom: "", dueDateTo: "", academicYearId: "", classCode: "",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF(p => ({ ...p, [k]: e.target.value })); setPage(1);
  };

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (f.dueDateFrom)    params.set("dueDateFrom", f.dueDateFrom);
  if (f.dueDateTo)      params.set("dueDateTo", f.dueDateTo);
  if (f.academicYearId) params.set("academicYearId", f.academicYearId);
  if (f.classCode)      params.set("classCode", f.classCode);

  const { data, isFetching } = useQuery<DueFeePage>({
    queryKey: ["rpt-due-fees", params.toString()],
    queryFn: () => apiFetch(`/api/admin/reports/due-fees?${params}`),
    staleTime: 30_000,
  });

  const csvParams = new URLSearchParams(params);
  csvParams.delete("page"); csvParams.delete("pageSize"); csvParams.set("format", "csv");

  const rows = data?.rows ?? [];
  const sum  = data?.summary;

  return (
    <div className="space-y-4">
      {/* Filters card */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Due Fee Report</h3>
          <Button size="sm" variant="outline"
            onClick={() => downloadCsv(`/api/admin/reports/due-fees?${csvParams}`, "due-fee-report.csv")}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <FilterField label="Due Date From">
            <Input type="date" value={f.dueDateFrom} onChange={set("dueDateFrom")} className="h-8 text-sm w-36" />
          </FilterField>
          <FilterField label="Due Date To">
            <Input type="date" value={f.dueDateTo} onChange={set("dueDateTo")} className="h-8 text-sm w-36" />
          </FilterField>
          <FilterField label="Academic Year">
            <select value={f.academicYearId} onChange={set("academicYearId")} className="h-8 text-sm border border-input rounded-md px-2 bg-background w-36">
              <option value="">All Years</option>
              {options.academicYears.map(ay => <option key={ay.id} value={ay.id}>{ay.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Class/Program">
            <select value={f.classCode} onChange={set("classCode")} className="h-8 text-sm border border-input rounded-md px-2 bg-background w-32">
              <option value="">All Classes</option>
              {options.classCodes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FilterField>
          <PageSizeSelect value={pageSize} onChange={n => { setPageSize(n); setPage(1); }} />
        </div>

        {/* Summary cards */}
        {sum && !isFetching && (
          <div className="grid grid-cols-3 gap-3 pt-1">
            <SummaryCard label="Students With Dues"  value={sum.studentsWithDues.toLocaleString()} cls="bg-amber-50 border-amber-100 text-amber-800" />
            <SummaryCard label="Total Outstanding"    value={fmt(sum.totalOutstanding)}             cls="bg-red-50 border-red-100 text-red-800" />
            <SummaryCard label="Overdue Challans"     value={sum.overdueChallans.toLocaleString()}  cls="bg-orange-50 border-orange-100 text-orange-800" />
          </div>
        )}

        <p className="text-xs text-slate-500">
          {isFetching ? "Loading…" : `${(data?.total ?? 0).toLocaleString()} records`}
          {isFetching && <Loader2 className="inline h-3 w-3 ml-2 animate-spin" />}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs text-slate-500">
                <Th>Challan #</Th>
                <Th>Applicant ID</Th>
                <Th>Roll #</Th>
                <Th>Student</Th>
                <Th>Class</Th>
                <Th>Section</Th>
                <Th>Academic Year</Th>
                <Th>Due Date</Th>
                <Th right>Days Overdue</Th>
                <Th right>Billed</Th>
                <Th right>Paid</Th>
                <Th right>Outstanding</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={12} className="px-3 py-10 text-center text-slate-400 text-xs">
                  {isFetching ? "Loading…" : "No students have outstanding dues for the selected filters"}
                </td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/50">
                  <Td mono cls="text-xs text-slate-600">{r.challan_number ?? "—"}</Td>
                  <Td mono cls="text-xs text-slate-600">{r.applicant_id}</Td>
                  <Td cls="text-xs text-slate-500">{r.roll_no ?? "—"}</Td>
                  <Td cls="font-medium text-slate-800 whitespace-nowrap">{r.student_name}</Td>
                  <Td cls="text-slate-600">{r.class_code}</Td>
                  <Td cls="text-slate-600">{r.section_name ?? "—"}</Td>
                  <Td cls="text-slate-600 whitespace-nowrap">{r.academic_year_name}</Td>
                  <Td cls="text-slate-600 whitespace-nowrap">{fmtDate(r.due_date)}</Td>
                  <Td right mono cls={r.days_overdue > 0 ? "text-red-600 font-semibold" : "text-slate-500"}>
                    {r.days_overdue > 0 ? r.days_overdue : "—"}
                  </Td>
                  <Td right mono cls="text-slate-700">{fmt(r.amount)}</Td>
                  <Td right mono cls="text-slate-700">{r.paid_amount != null ? fmt(r.paid_amount) : "—"}</Td>
                  <Td right mono cls="text-red-600 font-semibold">{fmt(r.balance)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPage={setPage} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYROLL REPORT (with dynamic allowance/deduction columns)
// ═══════════════════════════════════════════════════════════════════════════════

interface PayrollCol { name: string; item_type: "incentive" | "deduction"; }

interface PayrollRow {
  id: string; month: string; basic_salary: number; allowances: number;
  deductions: number; net_salary: number; status: string;
  paid_at: string | null; remarks: string | null;
  staff_id: string; employee_name: string; role: string; contract_type: string | null;
  department_name: string | null; designation_name: string | null;
  prepared_by_name: string | null;
  template_items: { name: string; type: string; calcType: string; value: number }[] | null;
}
interface PayrollPage { total: number; page: number; pageSize: number; rows: PayrollRow[]; }

function PayrollReport({ options }: { options: ReportOptions }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [f, setF] = useState({ year: "", monthFrom: "", monthTo: "", status: "", departmentId: "" });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF(p => ({ ...p, [k]: e.target.value })); setPage(1);
  };

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (f.year)         params.set("year", f.year);
  if (f.monthFrom)    params.set("monthFrom", f.monthFrom);
  if (f.monthTo)      params.set("monthTo", f.monthTo);
  if (f.status)       params.set("status", f.status);
  if (f.departmentId) params.set("departmentId", f.departmentId);

  // Fetch dynamic columns (allowance/deduction names for this tenant)
  const { data: colsData } = useQuery<PayrollCol[]>({
    queryKey: ["rpt-payroll-cols"],
    queryFn: () => apiFetch("/api/admin/reports/payroll-columns"),
    staleTime: 5 * 60_000,
  });

  const { data, isFetching } = useQuery<PayrollPage>({
    queryKey: ["rpt-payroll", params.toString()],
    queryFn: () => apiFetch(`/api/admin/reports/payroll?${params}`),
    staleTime: 30_000,
  });

  const csvParams = new URLSearchParams(params);
  csvParams.delete("page"); csvParams.delete("pageSize"); csvParams.set("format", "csv");

  const rows     = data?.rows ?? [];
  const cols     = colsData ?? [];
  const incCols  = cols.filter(c => c.item_type === "incentive");
  const dedCols  = cols.filter(c => c.item_type === "deduction");

  // Helper: look up a named item value from a row
  const itemVal = (row: PayrollRow, name: string) => {
    const it = row.template_items?.find(i => i.name === name);
    return it ? it.value : null;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Payroll Report</h3>
          <Button size="sm" variant="outline"
            onClick={() => downloadCsv(`/api/admin/reports/payroll?${csvParams}`, "payroll-report.csv")}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <FilterField label="Year">
            <Input type="number" min="2000" max="2100" placeholder="e.g. 2025"
              value={f.year} onChange={set("year")} className="h-8 text-sm w-28" />
          </FilterField>
          <FilterField label="Month From">
            <Input type="month" value={f.monthFrom} onChange={set("monthFrom")} className="h-8 text-sm w-36" />
          </FilterField>
          <FilterField label="Month To">
            <Input type="month" value={f.monthTo} onChange={set("monthTo")} className="h-8 text-sm w-36" />
          </FilterField>
          <FilterField label="Status">
            <select value={f.status} onChange={set("status")} className="h-8 text-sm border border-input rounded-md px-2 bg-background w-36">
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
            </select>
          </FilterField>
          <FilterField label="Department">
            <select value={f.departmentId} onChange={set("departmentId")} className="h-8 text-sm border border-input rounded-md px-2 bg-background w-40">
              <option value="">All Departments</option>
              {options.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </FilterField>
          <PageSizeSelect value={pageSize} onChange={n => { setPageSize(n); setPage(1); }} />
        </div>

        <p className="text-xs text-slate-500">
          {isFetching ? "Loading…" : `${(data?.total ?? 0).toLocaleString()} records`}
          {isFetching && <Loader2 className="inline h-3 w-3 ml-2 animate-spin" />}
        </p>
      </div>

      {/* Table with dynamic allowance/deduction columns */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs text-slate-500">
                <Th>Month</Th>
                <Th>Staff ID</Th>
                <Th>Employee</Th>
                <Th>Role</Th>
                <Th>Contract</Th>
                <Th>Department</Th>
                <Th>Designation</Th>
                <Th right>Basic Pay</Th>
                {incCols.map(c => <Th key={c.name} right>{c.name}</Th>)}
                <Th right>Gross Pay</Th>
                {dedCols.map(c => <Th key={c.name} right>{c.name}</Th>)}
                <Th right>Net Pay</Th>
                <Th>Status</Th>
                <Th>Payment Date</Th>
                <Th>Prepared By</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={15 + incCols.length + dedCols.length} className="px-3 py-10 text-center text-slate-400 text-xs">
                  {isFetching ? "Loading…" : "No payroll records match the selected filters"}
                </td></tr>
              ) : rows.map(r => {
                const grossPay = r.basic_salary + r.allowances;
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/50">
                    <Td mono cls="text-slate-700">{r.month}</Td>
                    <Td mono cls="text-xs text-slate-600">{r.staff_id}</Td>
                    <Td cls="font-medium text-slate-800 whitespace-nowrap">{r.employee_name}</Td>
                    <Td cls="text-slate-600 capitalize">{r.role.replace(/_/g, " ")}</Td>
                    <Td cls="text-slate-600 capitalize">{r.contract_type ?? "—"}</Td>
                    <Td cls="text-slate-600 whitespace-nowrap">{r.department_name ?? "—"}</Td>
                    <Td cls="text-slate-600 whitespace-nowrap">{r.designation_name ?? "—"}</Td>
                    <Td right mono cls="text-slate-700">{fmt(r.basic_salary)}</Td>
                    {incCols.map(c => {
                      const v = itemVal(r, c.name);
                      return <Td key={c.name} right mono cls="text-green-700">{v != null ? fmt(v) : "—"}</Td>;
                    })}
                    <Td right mono cls="text-slate-700 font-semibold">{fmt(grossPay)}</Td>
                    {dedCols.map(c => {
                      const v = itemVal(r, c.name);
                      return <Td key={c.name} right mono cls="text-red-600">{v != null ? fmt(v) : "—"}</Td>;
                    })}
                    <Td right mono cls="font-bold text-slate-900">{fmt(r.net_salary)}</Td>
                    <Td>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                    </Td>
                    <Td cls="text-slate-600 whitespace-nowrap">{fmtDate(r.paid_at)}</Td>
                    <Td cls="text-slate-600 whitespace-nowrap">{r.prepared_by_name ?? "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPage={setPage} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INCOME / EXPENSE REPORT
// ═══════════════════════════════════════════════════════════════════════════════

interface IERow {
  id: string; date: string; voucher_number: string | null; payee: string;
  description: string | null; amount: string; status: string;
  is_void: boolean; recorded_at: string | null;
  bank_account_title: string | null; bank_name: string | null; bank_account_type: string | null;
  coa_code: string | null; coa_name: string | null; coa_type: string | null;
}
interface IEPage {
  total: number; page: number; pageSize: number; rows: IERow[];
  summary: { totalIncome: number; totalExpense: number; net: number };
}

function IncomeExpenseReport({ options }: { options: ReportOptions }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [f, setF] = useState({ dateFrom: "", dateTo: "", status: "", type: "", bankAccountId: "", coaId: "" });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF(p => ({ ...p, [k]: e.target.value })); setPage(1);
  };

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (f.dateFrom)      params.set("dateFrom", f.dateFrom);
  if (f.dateTo)        params.set("dateTo", f.dateTo);
  if (f.status)        params.set("status", f.status);
  if (f.type)          params.set("type", f.type);
  if (f.bankAccountId) params.set("bankAccountId", f.bankAccountId);
  if (f.coaId)         params.set("coaId", f.coaId);

  const { data, isFetching } = useQuery<IEPage>({
    queryKey: ["rpt-ie", params.toString()],
    queryFn: () => apiFetch(`/api/admin/reports/income-expense?${params}`),
    staleTime: 30_000,
  });

  const csvParams = new URLSearchParams(params);
  csvParams.delete("page"); csvParams.delete("pageSize"); csvParams.set("format", "csv");

  const rows = data?.rows ?? [];
  const sum  = data?.summary ?? { totalIncome: 0, totalExpense: 0, net: 0 };

  // COA accounts filtered by selected type
  const coaOpts = f.type
    ? options.coaAccounts.filter(a => a.type === f.type)
    : options.coaAccounts;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Income / Expense Report</h3>
          <Button size="sm" variant="outline"
            onClick={() => downloadCsv(`/api/admin/reports/income-expense?${csvParams}`, "income-expense-report.csv")}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <FilterField label="From Date">
            <Input type="date" value={f.dateFrom} onChange={set("dateFrom")} max={todayIso()} className="h-8 text-sm w-36" />
          </FilterField>
          <FilterField label="To Date">
            <Input type="date" value={f.dateTo} onChange={set("dateTo")} max={todayIso()} className="h-8 text-sm w-36" />
          </FilterField>
          <FilterField label="Type">
            <select value={f.type} onChange={e => { set("type")(e); setF(p => ({ ...p, coaId: "" })); }}
              className="h-8 text-sm border border-input rounded-md px-2 bg-background w-36">
              <option value="">All Types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </FilterField>
          <FilterField label="COA Account">
            <select value={f.coaId} onChange={set("coaId")} className="h-8 text-sm border border-input rounded-md px-2 bg-background w-52">
              <option value="">All Accounts</option>
              {coaOpts.map(a => (
                <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Status">
            <select value={f.status} onChange={set("status")} className="h-8 text-sm border border-input rounded-md px-2 bg-background w-36">
              <option value="">All</option>
              <option value="recorded">Recorded</option>
              <option value="void">Void</option>
            </select>
          </FilterField>
          <FilterField label="Bank Account">
            <select value={f.bankAccountId} onChange={set("bankAccountId")} className="h-8 text-sm border border-input rounded-md px-2 bg-background w-48">
              <option value="">All Banks</option>
              {options.bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.bank_name ? `${b.bank_name} — ${b.account_title}` : b.account_title}
                </option>
              ))}
            </select>
          </FilterField>
          <PageSizeSelect value={pageSize} onChange={n => { setPageSize(n); setPage(1); }} />
        </div>

        {/* Summary cards */}
        {!isFetching && data && (
          <div className="grid grid-cols-3 gap-3 pt-1">
            <SummaryCard label="Total Income"          value={fmt(sum.totalIncome)}  cls="bg-green-50 border-green-100 text-green-800" />
            <SummaryCard label="Total Expense"         value={fmt(sum.totalExpense)} cls="bg-red-50 border-red-100 text-red-800" />
            <SummaryCard label="Net (Income − Expense)" value={fmt(sum.net)}
              cls={sum.net >= 0 ? "bg-slate-50 border-slate-200 text-slate-800" : "bg-red-50 border-red-200 text-red-800"} />
          </div>
        )}

        <p className="text-xs text-slate-500">
          {isFetching ? "Loading…" : `${(data?.total ?? 0).toLocaleString()} records`}
          {isFetching && <Loader2 className="inline h-3 w-3 ml-2 animate-spin" />}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs text-slate-500">
                <Th>Date</Th>
                <Th>Ref # / Voucher</Th>
                <Th>Payee / Payer</Th>
                <Th>Narration</Th>
                <Th>Type</Th>
                <Th>COA Account</Th>
                <Th>Bank Account</Th>
                <Th right>Amount</Th>
                <Th>Status</Th>
                <Th>Void</Th>
                <Th>Recorded At</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-slate-400 text-xs">
                  {isFetching ? "Loading…" : "No records match the selected filters"}
                </td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className={`border-b last:border-0 hover:bg-slate-50/50 ${r.is_void ? "opacity-50" : ""}`}>
                  <Td cls="whitespace-nowrap text-slate-700">{fmtDate(r.date)}</Td>
                  <Td mono cls="text-xs text-slate-600">{r.voucher_number ?? "—"}</Td>
                  <Td cls="font-medium text-slate-800 whitespace-nowrap">{r.payee}</Td>
                  <Td cls="text-slate-600 max-w-[180px] truncate">{r.description ?? "—"}</Td>
                  <Td>
                    {r.coa_type ? (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize
                        ${r.coa_type === "income" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {r.coa_type}
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </Td>
                  <Td cls="text-slate-600 text-xs whitespace-nowrap">
                    {r.coa_code ? `${r.coa_code} · ${r.coa_name}` : "—"}
                  </Td>
                  <Td cls="text-slate-600 text-xs whitespace-nowrap">
                    {r.bank_account_title
                      ? (r.bank_name ? `${r.bank_name} — ${r.bank_account_title}` : r.bank_account_title)
                      : "—"}
                  </Td>
                  <Td right mono cls="font-semibold text-slate-800">{fmt(r.amount)}</Td>
                  <Td>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(r.status)}`}>
                      {r.status}
                    </span>
                  </Td>
                  <Td>
                    {r.is_void
                      ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-500">Yes</span>
                      : <span className="text-slate-300 text-xs">No</span>}
                  </Td>
                  <Td cls="text-slate-500 text-xs whitespace-nowrap">{fmtDate(r.recorded_at)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPage={setPage} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALL TRANSACTIONS REPORT (unified ledger view across every source module)
// ═══════════════════════════════════════════════════════════════════════════════

interface AllTxnRow {
  id: string; date: string; narration: string | null;
  source_ref: string | null; source_module: string | null; source_ref_id: string | null;
  is_voided: boolean; posted_at: string | null; status: string;
  account_code: string; account_name: string; account_type: string;
  dr_amount: string; cr_amount: string; memo: string | null;
}
interface AllTxnPage {
  total: number; page: number; pageSize: number; rows: AllTxnRow[];
  summary: { totalDebit: number; totalCredit: number };
}

function AllTransactionsReport({ options }: { options: ReportOptions }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [f, setF] = useState({ dateFrom: "", dateTo: "", accountId: "", sourceModule: "", status: "" });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF(p => ({ ...p, [k]: e.target.value })); setPage(1);
  };

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (f.dateFrom)     params.set("dateFrom", f.dateFrom);
  if (f.dateTo)        params.set("dateTo", f.dateTo);
  if (f.accountId)     params.set("accountId", f.accountId);
  if (f.sourceModule)  params.set("sourceModule", f.sourceModule);
  if (f.status)        params.set("status", f.status);

  const { data, isFetching } = useQuery<AllTxnPage>({
    queryKey: ["rpt-all-txn", params.toString()],
    queryFn: () => apiFetch(`/api/admin/reports/all-transactions?${params}`),
    staleTime: 30_000,
  });

  const csvParams = new URLSearchParams(params);
  csvParams.delete("page"); csvParams.delete("pageSize"); csvParams.set("format", "csv");

  const rows = data?.rows ?? [];
  const sum  = data?.summary ?? { totalDebit: 0, totalCredit: 0 };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">All Transactions</h3>
          <Button size="sm" variant="outline"
            onClick={() => downloadCsv(`/api/admin/reports/all-transactions?${csvParams}`, "all-transactions-report.csv")}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <FilterField label="From Date">
            <Input type="date" value={f.dateFrom} onChange={set("dateFrom")} max={todayIso()} className="h-8 text-sm w-36" />
          </FilterField>
          <FilterField label="To Date">
            <Input type="date" value={f.dateTo} onChange={set("dateTo")} max={todayIso()} className="h-8 text-sm w-36" />
          </FilterField>
          <FilterField label="Account">
            <select value={f.accountId} onChange={set("accountId")} className="h-8 text-sm border border-input rounded-md px-2 bg-background w-52">
              <option value="">All Accounts</option>
              {options.allCoaAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Source Module">
            <select value={f.sourceModule} onChange={set("sourceModule")} className="h-8 text-sm border border-input rounded-md px-2 bg-background w-44">
              <option value="">All Sources</option>
              {options.sourceModules.map(m => (
                <option key={m} value={m}>{sourceModuleLabel(m)}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Status">
            <select value={f.status} onChange={set("status")} className="h-8 text-sm border border-input rounded-md px-2 bg-background w-32">
              <option value="">All</option>
              <option value="posted">Posted</option>
              <option value="draft">Draft</option>
              <option value="void">Void</option>
            </select>
          </FilterField>
          <PageSizeSelect value={pageSize} onChange={n => { setPageSize(n); setPage(1); }} />
        </div>

        {/* Summary cards */}
        {!isFetching && data && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <SummaryCard label="Total Debit"  value={fmt(sum.totalDebit)}  cls="bg-indigo-50 border-indigo-100 text-indigo-800" />
            <SummaryCard label="Total Credit" value={fmt(sum.totalCredit)} cls="bg-emerald-50 border-emerald-100 text-emerald-800" />
          </div>
        )}

        <p className="text-xs text-slate-500">
          {isFetching ? "Loading…" : `${(data?.total ?? 0).toLocaleString()} ledger lines`}
          {isFetching && <Loader2 className="inline h-3 w-3 ml-2 animate-spin" />}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs text-slate-500">
                <Th>Date</Th>
                <Th>Account</Th>
                <Th right>Debit</Th>
                <Th right>Credit</Th>
                <Th>Narration</Th>
                <Th>Source</Th>
                <Th>Reference</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400 text-xs">
                  {isFetching ? "Loading…" : "No ledger transactions match the selected filters"}
                </td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className={`border-b last:border-0 hover:bg-slate-50/50 ${r.is_voided ? "opacity-50" : ""}`}>
                  <Td cls="whitespace-nowrap text-slate-700">{fmtDate(r.date)}</Td>
                  <Td cls="text-slate-700 text-xs whitespace-nowrap">
                    <span className="font-mono text-slate-500">{r.account_code}</span> · {r.account_name}
                  </Td>
                  <Td right mono cls={Number(r.dr_amount) > 0 ? "text-indigo-700 font-semibold" : "text-slate-300"}>
                    {Number(r.dr_amount) > 0 ? fmt(r.dr_amount) : "—"}
                  </Td>
                  <Td right mono cls={Number(r.cr_amount) > 0 ? "text-emerald-700 font-semibold" : "text-slate-300"}>
                    {Number(r.cr_amount) > 0 ? fmt(r.cr_amount) : "—"}
                  </Td>
                  <Td cls="text-slate-600 max-w-[220px] truncate">{r.memo || r.narration || "—"}</Td>
                  <Td cls="text-slate-600 text-xs whitespace-nowrap">{sourceModuleLabel(r.source_module)}</Td>
                  <Td cls="text-slate-500 text-xs whitespace-nowrap font-mono">{r.source_ref ?? (r.source_ref_id ? r.source_ref_id.slice(0, 8) : "—")}</Td>
                  <Td>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(r.status)}`}>
                      {r.status}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPage={setPage} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECEIPT & PAYMENT SUMMARY REPORT
// ═══════════════════════════════════════════════════════════════════════════════

interface RPCashAccount { id: string; coaId: string | null; label: string; type: string; }
interface RPLedgerRow { id: string; code: string; name: string; type: string; amounts: Record<string, number>; total: number; }
interface RPData {
  dateFrom: string; dateTo: string;
  cashAccounts: RPCashAccount[];
  openingBalance: number; closingBalance: number; totalReceipts: number; totalPayments: number; netChange: number;
  receiptRows: RPLedgerRow[]; paymentRows: RPLedgerRow[];
}

function ReceiptPaymentSummaryReport() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [f, setF] = useState({ dateFrom: monthStart, dateTo: today });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF(p => ({ ...p, [k]: e.target.value }));
  };

  const params = new URLSearchParams();
  if (f.dateFrom) params.set("dateFrom", f.dateFrom);
  if (f.dateTo)   params.set("dateTo", f.dateTo);

  const { data, isFetching } = useQuery<RPData>({
    queryKey: ["rpt-receipt-payment", params.toString()],
    queryFn: () => apiFetch(`/api/admin/reports/receipt-payment-summary?${params}`),
    staleTime: 30_000,
  });

  const csvParams = new URLSearchParams(params);
  csvParams.set("format", "csv");

  const cashAccounts = data?.cashAccounts ?? [];
  const receiptRows  = data?.receiptRows ?? [];
  const paymentRows  = data?.paymentRows ?? [];
  const hasActivity  = receiptRows.length > 0 || paymentRows.length > 0
    || (data ? data.openingBalance !== 0 || data.closingBalance !== 0 : false);

  function LedgerTable({ title, rows, leadLabel, leadValue, trailLabel, trailValue, totalLabel, totalValue, leadFirst }: {
    title: string; rows: RPLedgerRow[];
    leadLabel?: string; leadValue?: number;
    trailLabel?: string; trailValue?: number;
    totalLabel: string; totalValue: number;
    leadFirst: boolean;
  }) {
    return (
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden flex-1 min-w-0">
        <div className="px-4 py-2.5 border-b bg-slate-50">
          <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50/60 text-xs text-slate-500">
                <Th>Ledger</Th>
                {cashAccounts.map(c => <Th key={c.id} right>{c.label}</Th>)}
                <Th right>Total</Th>
              </tr>
            </thead>
            <tbody>
              {leadFirst && leadLabel && (
                <tr className="border-b bg-indigo-50/60 font-semibold">
                  <Td cls="text-indigo-800">{leadLabel}</Td>
                  {cashAccounts.map(c => <Td key={c.id} right mono cls="text-indigo-300">—</Td>)}
                  <Td right mono cls="text-indigo-800">{fmt(leadValue)}</Td>
                </tr>
              )}
              {rows.length === 0 ? (
                <tr><td colSpan={cashAccounts.length + 2} className="px-3 py-8 text-center text-slate-400 text-xs">
                  No activity for the selected date range
                </td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/50">
                  <Td cls="text-slate-700 whitespace-nowrap">
                    <span className="font-mono text-xs text-slate-400">{r.code}</span> · {r.name}
                  </Td>
                  {cashAccounts.map(c => (
                    <Td key={c.id} right mono cls="text-slate-600">
                      {r.amounts[c.id] ? fmt(r.amounts[c.id]) : "—"}
                    </Td>
                  ))}
                  <Td right mono cls="font-semibold text-slate-800">{fmt(r.total)}</Td>
                </tr>
              ))}
              {!leadFirst && trailLabel && (
                <tr className="border-b bg-indigo-50/60 font-semibold">
                  <Td cls="text-indigo-800">{trailLabel}</Td>
                  {cashAccounts.map(c => <Td key={c.id} right mono cls="text-indigo-300">—</Td>)}
                  <Td right mono cls="text-indigo-800">{fmt(trailValue)}</Td>
                </tr>
              )}
              <tr className="bg-slate-100 font-bold">
                <Td cls="text-slate-800">{totalLabel}</Td>
                {cashAccounts.map(c => (
                  <Td key={c.id} right mono cls="text-slate-800">
                    {fmt(rows.reduce((s, r) => s + (r.amounts[c.id] ?? 0), 0))}
                  </Td>
                ))}
                <Td right mono cls="text-slate-900">{fmt(totalValue)}</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Receipt & Payment Summary</h3>
          <Button size="sm" variant="outline"
            onClick={() => downloadCsv(`/api/admin/reports/receipt-payment-summary?${csvParams}`, "receipt-payment-summary.csv")}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <FilterField label="From Date">
            <Input type="date" value={f.dateFrom} onChange={set("dateFrom")} max={todayIso()} className="h-8 text-sm w-36" />
          </FilterField>
          <FilterField label="To Date">
            <Input type="date" value={f.dateTo} onChange={set("dateTo")} max={todayIso()} className="h-8 text-sm w-36" />
          </FilterField>
        </div>

        {data && !isFetching && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
            <SummaryCard label="Opening Balance" value={fmt(data.openingBalance)} cls="bg-slate-50 border-slate-200 text-slate-800" />
            <SummaryCard label="Total Receipts"  value={fmt(data.totalReceipts)}  cls="bg-green-50 border-green-100 text-green-800" />
            <SummaryCard label="Total Payments"  value={fmt(data.totalPayments)}  cls="bg-red-50 border-red-100 text-red-800" />
            <SummaryCard label="Closing Balance" value={fmt(data.closingBalance)} cls="bg-indigo-50 border-indigo-100 text-indigo-800" />
            <SummaryCard label="Net Change" value={fmt(data.netChange)}
              cls={data.netChange >= 0 ? "bg-green-50 border-green-100 text-green-800" : "bg-red-50 border-red-100 text-red-800"} />
          </div>
        )}

        {isFetching && (
          <p className="text-xs text-slate-500"><Loader2 className="inline h-3 w-3 mr-2 animate-spin" />Loading…</p>
        )}
        {cashAccounts.length === 0 && !isFetching && (
          <p className="text-xs text-amber-600">No active cash or bank accounts are configured, so no columns can be shown.</p>
        )}
      </div>

      {!isFetching && !hasActivity ? (
        <div className="rounded-xl border border-border bg-white shadow-sm p-10 text-center text-slate-400 text-sm">
          No receipts or payments were recorded in the selected date range.
        </div>
      ) : (
        <div className="flex flex-col xl:flex-row gap-4">
          <LedgerTable
            title="Receipts"
            rows={receiptRows}
            leadFirst
            leadLabel="Opening Balance"
            leadValue={data?.openingBalance ?? 0}
            totalLabel="Total Receipts"
            totalValue={data?.totalReceipts ?? 0}
          />
          <LedgerTable
            title="Payments"
            rows={paymentRows}
            leadFirst={false}
            trailLabel="Closing Balance"
            trailValue={data?.closingBalance ?? 0}
            totalLabel="Total Payments"
            totalValue={data?.totalPayments ?? 0}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT: FinanceReports with sub-tab nav
// ═══════════════════════════════════════════════════════════════════════════════

const SUB_TABS = [
  { key: "fee",      label: "Fee Collection",   icon: FileText },
  { key: "due-fees", label: "Due Fees",         icon: AlertTriangle },
  { key: "payroll",  label: "Payroll",           icon: Users },
  { key: "ie",       label: "Income / Expense",  icon: TrendingUp },
  { key: "rp",       label: "Receipt & Payment", icon: Receipt },
  { key: "all",      label: "All Transactions",  icon: BookOpen },
] as const;
type SubTab = typeof SUB_TABS[number]["key"];

export function FinanceReports() {
  const [sub, setSub] = useState<SubTab>("fee");

  const { data: options, isLoading: optLoading } = useQuery<ReportOptions>({
    queryKey: ["rpt-options"],
    queryFn: () => apiFetch("/api/admin/reports/options"),
    staleTime: 5 * 60_000,
  });

  const opts: ReportOptions = options ?? {
    academicYears: [], feeTypes: [], departments: [],
    bankAccounts: [], classCodes: [], coaAccounts: [],
    allCoaAccounts: [], sourceModules: [],
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Financial Reports</h2>
        <p className="text-sm text-slate-500 mt-0.5">Full-detail reports with server-side filters and CSV export.</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {SUB_TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setSub(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              sub === key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {optLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading report options…
        </div>
      ) : (
        <>
          {sub === "fee"      && <FeeCollectionReport options={opts} />}
          {sub === "due-fees" && <DueFeeReport         options={opts} />}
          {sub === "payroll"  && <PayrollReport        options={opts} />}
          {sub === "ie"       && <IncomeExpenseReport  options={opts} />}
          {sub === "rp"       && <ReceiptPaymentSummaryReport />}
          {sub === "all"      && <AllTransactionsReport options={opts} />}
        </>
      )}
    </div>
  );
}
