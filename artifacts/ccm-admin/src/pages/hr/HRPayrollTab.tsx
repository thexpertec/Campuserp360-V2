import { useState, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { formatDate, formatCurrency } from "@/lib/locale";
import { useAdminNames } from "@/components/AuditStamp";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import {
  Calendar, Zap, DollarSign, CheckCircle2, Clock,
  ChevronDown, AlertCircle, Banknote, Users, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { JEViewerButton } from "@/components/JEViewerButton";

// ── Types ──────────────────────────────────────────────────────────────────────
type PayrollRow = {
  id: string;
  employeeId: string;
  month: string;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  amountPaid: number | null;
  status: "pending" | "paid" | "rejected" | "approved";
  paidAt: string | null;
  bankAccountId: string | null;
  bankAccountTitle: string | null;
  remarks: string | null;
  createdAt: string;
  preparedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  employeeStaffId: string | null;
  employeeFullName: string | null;
  employeeRole: string | null;
  designationName: string | null;
  departmentName: string | null;
};

type GenerateResult = { generated: number; updated?: number; skipped: number; message?: string; errors?: string[] };
type PayAllResult  = { paid: number };

type BankAccount = {
  id: string;
  type: "cash" | "bank";
  account_title: string;
  bank_name: string | null;
  iban_number: string | null;
  is_active: boolean;
  sort_order: number;
};

// ── API helpers ────────────────────────────────────────────────────────────────
function payrollKey(month: string) { return ["admin", "payroll", month]; }

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // getAdminTenantId() on the server falls back to host-domain matching only,
      // which fails on *.replit.app / non-canonical domains ("Tenant not resolved").
      // Raw fetch() calls here bypass the api-client-react default headers, so
      // the tenant must be pinned explicitly (mirrors lib/auth.ts initAuth()).
      "X-Tenant-Id": "ccm",
      ...(options.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

async function fetchPayroll(month: string): Promise<PayrollRow[]> {
  return apiFetch<PayrollRow[]>(`/api/admin/payroll?month=${encodeURIComponent(month)}`);
}

async function generatePayroll(month: string): Promise<GenerateResult> {
  return apiFetch<GenerateResult>("/api/admin/payroll/generate", {
    method: "POST",
    body: JSON.stringify({ month }),
  });
}

async function payOne(txId: string, opts: { bankAccountId?: string; paidAt?: string; amountPaid?: number }): Promise<PayrollRow> {
  return apiFetch<PayrollRow>(`/api/admin/payroll/${txId}/pay`, {
    method: "PUT",
    body: JSON.stringify(opts),
  });
}

async function payAll(month: string, opts: { bankAccountId?: string; paidAt?: string }): Promise<PayAllResult> {
  return apiFetch<PayAllResult>("/api/admin/payroll/pay-all", {
    method: "POST",
    body: JSON.stringify({ month, ...opts }),
  });
}

// ── Month helpers ──────────────────────────────────────────────────────────────
// Formats a Date's local year/month as "YYYY-MM" without going through
// toISOString() — toISOString() converts to UTC first, which rolls a local
// day-1 midnight back to the previous month for any positive UTC offset
// (e.g. Pakistan, UTC+5), silently cancelling out month navigation.
function ymLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function thisMonth(): string {
  return ymLocal(new Date());
}

// Local YYYY-MM-DD for date inputs — avoids the same UTC-rollback issue as ymLocal.
function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function prevMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y!, mo! - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return ymLocal(d);
}

function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y!, mo! - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return ymLocal(d);
}

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-emerald-50 border-emerald-200 text-emerald-700">
        <CheckCircle2 className="h-2.5 w-2.5" /> Paid
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-blue-50 border-blue-200 text-blue-700">
        <CheckCircle2 className="h-2.5 w-2.5" /> Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-rose-50 border-rose-200 text-rose-700">
        <Clock className="h-2.5 w-2.5" /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-amber-50 border-amber-200 text-amber-700">
      <Clock className="h-2.5 w-2.5" /> Pending
    </span>
  );
}

// ── Account selector ───────────────────────────────────────────────────────────
function AccountSelector({
  accounts, value, onChange,
}: {
  accounts: BankAccount[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-slate-50 px-3 py-3 text-center">
        <p className="text-xs text-slate-500">No bank or cash accounts set up yet.</p>
        <Link
          href="/accounts?tab=setup"
          className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> Set up Cash & Bank accounts
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {accounts.map(a => (
        <label
          key={a.id}
          className={cn(
            "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 cursor-pointer transition-colors",
            value === a.id ? "border-emerald-500 bg-emerald-50" : "border-border hover:bg-slate-50",
          )}
        >
          <input type="radio" name="payAcct" className="sr-only"
            checked={value === a.id} onChange={() => onChange(a.id)} />
          <div className={cn(
            "h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
            value === a.id ? "border-emerald-500 bg-emerald-500" : "border-slate-300",
          )}>
            {value === a.id && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-slate-800">{a.account_title}</span>
            {a.bank_name && <span className="text-xs text-slate-400 ml-1">— {a.bank_name}</span>}
          </div>
        </label>
      ))}
    </div>
  );
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────
function ConfirmDialog({
  title, description, onConfirm, onCancel, loading, confirmDisabled, confirmDisabledReason, children,
}: {
  title: string; description: string;
  onConfirm: () => void; onCancel: () => void; loading?: boolean;
  confirmDisabled?: boolean; confirmDisabledReason?: string;
  children?: React.ReactNode;
}) {
  const isDisabled = loading || confirmDisabled;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <AlertCircle className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
        </div>
        {children}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>Cancel</Button>
          <span title={confirmDisabled && confirmDisabledReason ? confirmDisabledReason : undefined} className="inline-flex">
            <Button size="sm" onClick={onConfirm} disabled={isDisabled}>
              {loading ? "Processing…" : "Confirm"}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function HRPayrollTab() {
  const qc = useQueryClient();
  const [month, setMonth]                   = useState(thisMonth);
  const [confirm, setConfirm]               = useState<"generate" | "pay-all" | null>(null);
  const [payingId, setPayingId]             = useState<string | null>(null);
  const [payOneDialogId, setPayOneDialogId] = useState<string | null>(null);
  const [payOneBankId, setPayOneBankId]     = useState<string | null>(null);
  const [payAllBankId, setPayAllBankId]     = useState<string | null>(null);
  const [payOneDate, setPayOneDate]         = useState<string>(() => ymdLocal(new Date()));
  const [payOneAmount, setPayOneAmount]     = useState<string>("");
  const [payAllDate, setPayAllDate]         = useState<string>(() => ymdLocal(new Date()));

  const inv = useCallback(() => {
    qc.invalidateQueries({ queryKey: payrollKey(month) });
  }, [qc, month]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: payrollKey(month),
    queryFn: () => fetchPayroll(month),
  });

  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn: () => apiFetch<BankAccount[]>("/api/admin/bank-accounts"),
  });

  // Auto-select when only one account exists
  useEffect(() => {
    if (bankAccounts.length === 1) {
      const id = bankAccounts[0]!.id;
      setPayOneBankId(prev => prev ?? id);
      setPayAllBankId(prev => prev ?? id);
    }
  }, [bankAccounts]);

  const generateMut = useMutation({
    mutationFn: () => generatePayroll(month),
    onSuccess: (res) => {
      inv();
      if (res.errors?.length) {
        toast({
          title: `Payroll Generated With ${res.errors.length} Error${res.errors.length > 1 ? "s" : ""}`,
          description: [
            res.generated > 0 ? `Generated ${res.generated} slip${res.generated > 1 ? "s" : ""}` : null,
            (res.updated ?? 0) > 0 ? `updated ${res.updated} pending slip${res.updated! > 1 ? "s" : ""}` : null,
            `Failed: ${res.errors.join("; ")}`,
          ].filter(Boolean).join(", ") + ".",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Payroll Generated",
          description: (res.generated > 0 || (res.updated ?? 0) > 0)
            ? [
                res.generated > 0 ? `Generated ${res.generated} slip${res.generated > 1 ? "s" : ""}` : null,
                (res.updated ?? 0) > 0 ? `updated ${res.updated} pending slip${res.updated! > 1 ? "s" : ""}` : null,
                res.skipped > 0 ? `${res.skipped} already finalized` : null,
              ].filter(Boolean).join(", ") + "."
            : res.message ?? `All employees already have finalized slips for this month.`,
        });
      }
      setConfirm(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "Failed to generate payroll.", variant: "destructive" });
      setConfirm(null);
    },
  });

  const payAllMut = useMutation({
    mutationFn: () => payAll(month, { bankAccountId: payAllBankId ?? undefined, paidAt: payAllDate || undefined }),
    onSuccess: (res) => {
      inv();
      toast({ title: "Salaries Paid", description: `Marked ${res.paid} transaction${res.paid !== 1 ? "s" : ""} as paid.` });
      setConfirm(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "Failed to pay all.", variant: "destructive" });
      setConfirm(null);
    },
  });

  const payOneMut = useMutation({
    mutationFn: ({ txId, bankAccountId, paidAt, amountPaid }: { txId: string; bankAccountId?: string; paidAt?: string; amountPaid?: number }) =>
      payOne(txId, { bankAccountId, paidAt, amountPaid }),
    onSuccess: () => {
      inv();
      setPayingId(null);
      setPayOneDialogId(null);
      setPayOneDate(ymdLocal(new Date()));
      setPayOneAmount("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "Failed to mark as paid.", variant: "destructive" });
      setPayingId(null);
    },
  });

  // Computed stats
  const pending    = rows.filter(r => r.status === "pending");
  const paid       = rows.filter(r => r.status === "paid");
  const totalNet   = rows.reduce((s, r) => s + r.netSalary, 0);
  const paidNet    = paid.reduce((s, r) => s + r.netSalary, 0);
  const pendingNet = pending.reduce((s, r) => s + r.netSalary, 0);
  const allPaid    = rows.length > 0 && pending.length === 0;
  const isFutureMonth = month > thisMonth();

  const payingRow = payOneDialogId ? rows.find(r => r.id === payOneDialogId) : null;

  // Resolve preparedBy/approvedBy names for audit trail display
  const auditNames = useAdminNames([
    ...rows.map(r => r.preparedBy),
    ...rows.map(r => r.approvedBy),
  ]);

  return (
    <div className="space-y-5">

      {/* ── Month navigator + actions ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">

        {/* Month picker */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonth(prevMonth(month))}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background min-w-[160px] justify-center">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold">{monthLabel(month)}</span>
          </div>
          <button
            onClick={() => setMonth(nextMonth(month))}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ChevronDown className="h-4 w-4 -rotate-90" />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {!allPaid && pending.length > 0 && (
            <Button
              size="sm" variant="outline"
              onClick={() => setConfirm("pay-all")}
              className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            >
              <DollarSign className="h-3.5 w-3.5 mr-1.5" />
              Pay All ({pending.length})
            </Button>
          )}
          <span title={isFutureMonth ? "Payroll can't be generated for a future month" : undefined} className="inline-flex">
            <Button
              size="sm"
              onClick={() => setConfirm("generate")}
              disabled={generateMut.isPending || isFutureMonth}
            >
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Generate Payroll
            </Button>
          </span>
        </div>
      </div>

      {/* ── Summary cards ── */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Employees",    value: rows.length,                         icon: Users,        color: "text-blue-600",    bg: "bg-blue-50"    },
            { label: "Total Payroll",value: formatCurrency(totalNet),  icon: Banknote,     color: "text-foreground",  bg: "bg-muted/40"   },
            { label: "Paid",         value: formatCurrency(paidNet),   icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Pending",      value: formatCurrency(pendingNet),icon: Clock,        color: "text-amber-600",   bg: "bg-amber-50"   },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="rounded-xl border border-border bg-white px-4 py-3 flex items-center gap-3">
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", bg)}>
                <Icon className={cn("h-4 w-4", color)} />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
                <p className={cn("text-sm font-bold", color)}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Table ── */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-20 flex flex-col items-center gap-4 text-muted-foreground border border-dashed border-border rounded-xl">
          <div className="h-16 w-16 rounded-2xl bg-muted/40 flex items-center justify-center">
            <Banknote className="h-8 w-8 opacity-30" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">No payroll generated for {monthLabel(month)}</p>
            <p className="text-xs mt-1">Click <strong>Generate Payroll</strong> to create salary slips from employee templates.</p>
          </div>
          <Button size="sm" onClick={() => setConfirm("generate")}>
            <Zap className="h-3.5 w-3.5 mr-1.5" /> Generate Payroll
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Employee</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Basic (PKR)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Allowances</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Deductions</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground font-bold">Net Salary</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border last:border-0 hover:bg-muted/20 transition-colors",
                    i % 2 === 0 ? "" : "bg-muted/5",
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {row.employeeFullName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.employeeStaffId}
                      {row.designationName && <> · {row.designationName}</>}
                      {row.departmentName && <> · {row.departmentName}</>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{formatCurrency(row.basicSalary)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-emerald-600">
                    {row.allowances > 0 ? `+${formatCurrency(row.allowances)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-rose-600">
                    {row.deductions > 0 ? `−${formatCurrency(row.deductions)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-bold">
                    {formatCurrency(row.netSalary)}
                    {row.status === "paid" && row.amountPaid != null && row.amountPaid < row.netSalary && (
                      <div className="text-[10px] font-medium text-amber-700 mt-0.5">
                        Paid {formatCurrency(row.amountPaid)} (partial)
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={row.status} />
                    {row.status === "paid" && row.paidAt && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDate(row.paidAt)}
                      </div>
                    )}
                    {row.status === "paid" && row.bankAccountTitle && (
                      <div className="mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium bg-blue-50 border-blue-200 text-blue-700 max-w-[120px] truncate" title={row.bankAccountTitle}>
                        <Banknote className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{row.bankAccountTitle}</span>
                      </div>
                    )}
                    {row.preparedBy && auditNames[row.preparedBy] && (
                      <div className="text-[10px] text-muted-foreground mt-1 italic">
                        by {auditNames[row.preparedBy]}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {row.status === "pending" ? (
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                          disabled={payOneMut.isPending && payingId === row.id}
                          onClick={() => { setPayOneDialogId(row.id); setPayingId(row.id); setPayOneDate(ymdLocal(new Date())); setPayOneAmount(""); }}
                        >
                          {payOneMut.isPending && payingId === row.id ? "Paying…" : (
                            <><DollarSign className="h-3 w-3 mr-1" />Pay</>
                          )}
                        </Button>
                      ) : null}
                      {row.status === "paid" && (
                        <JEViewerButton sourceRefId={row.id} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Footer totals */}
            {rows.length > 1 && (
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">{rows.length} employees</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold">
                    {formatCurrency(rows.reduce((s, r) => s + r.basicSalary, 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-emerald-600">
                    {rows.reduce((s, r) => s + r.allowances, 0) > 0
                      ? `+${formatCurrency(rows.reduce((s, r) => s + r.allowances, 0))}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-rose-600">
                    {rows.reduce((s, r) => s + r.deductions, 0) > 0
                      ? `−${formatCurrency(rows.reduce((s, r) => s + r.deductions, 0))}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-bold">
                    {formatCurrency(totalNet)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="text-[10px] text-muted-foreground">
                      {paid.length}/{rows.length} paid
                    </span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ── Generate confirm dialog ── */}
      {confirm === "generate" && (
        <ConfirmDialog
          title={`Generate Payroll — ${monthLabel(month)}`}
          description={`This will create salary slips for all active employees that have a salary template configured, applying attendance and leave deductions. Pending slips for ${monthLabel(month)} are recomputed; approved or paid slips are left untouched.`}
          loading={generateMut.isPending}
          onConfirm={() => generateMut.mutate()}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* ── Pay All dialog (with account selector) ── */}
      {confirm === "pay-all" && (
        <ConfirmDialog
          title={`Pay All — ${monthLabel(month)}`}
          description={`This will mark all ${pending.length} pending salary slip${pending.length !== 1 ? "s" : ""} as paid (${formatCurrency(pendingNet)} total). This cannot be undone.`}
          loading={payAllMut.isPending}
          onConfirm={() => payAllMut.mutate()}
          onCancel={() => setConfirm(null)}
          confirmDisabled={bankAccounts.length === 0 || !payAllBankId}
          confirmDisabledReason={bankAccounts.length === 0 ? "Set up a Cash or Bank account first" : "Select a 'Drawn from' account before confirming"}
        >
          {bankAccounts.length === 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 leading-snug">
                <span className="font-semibold">No payment accounts configured</span>
                {" — "}
                <Link href="/accounts?tab=setup" className="underline hover:text-amber-900">
                  set up a Cash or Bank account first
                </Link>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Drawn from</p>
            <AccountSelector
              accounts={bankAccounts}
              value={payAllBankId}
              onChange={setPayAllBankId}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment date</p>
            <input
              type="date"
              value={payAllDate}
              max={ymdLocal(new Date())}
              onChange={e => setPayAllDate(e.target.value)}
              className="w-full h-9 rounded-lg border border-border px-3 text-sm"
            />
          </div>
        </ConfirmDialog>
      )}

      {/* ── Pay One dialog (with account selector, date, amount) ── */}
      {payOneDialogId && payingRow && (
        <ConfirmDialog
          title={`Pay — ${payingRow.employeeFullName}`}
          description={`Mark salary for ${monthLabel(payingRow.month)} as paid (net salary ${formatCurrency(payingRow.netSalary)}). This cannot be undone.`}
          loading={payOneMut.isPending}
          onConfirm={() => {
            const amt = payOneAmount === "" ? payingRow.netSalary : Number(payOneAmount);
            payOneMut.mutate({
              txId: payOneDialogId,
              bankAccountId: payOneBankId ?? undefined,
              paidAt: payOneDate || undefined,
              amountPaid: amt,
            });
          }}
          onCancel={() => { setPayOneDialogId(null); setPayingId(null); setPayOneDate(ymdLocal(new Date())); setPayOneAmount(""); }}
          confirmDisabled={
            bankAccounts.length === 0 || !payOneBankId ||
            (payOneAmount !== "" && (!Number.isFinite(Number(payOneAmount)) || Number(payOneAmount) <= 0 || Number(payOneAmount) > payingRow.netSalary))
          }
          confirmDisabledReason={
            bankAccounts.length === 0 ? "Set up a Cash or Bank account first"
            : !payOneBankId ? "Select a 'Drawn from' account before confirming"
            : "Amount must be greater than 0 and not exceed the net salary"
          }
        >
          {bankAccounts.length === 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 leading-snug">
                <span className="font-semibold">No payment accounts configured</span>
                {" — "}
                <Link href="/accounts?tab=setup" className="underline hover:text-amber-900">
                  set up a Cash or Bank account first
                </Link>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Drawn from</p>
            <AccountSelector
              accounts={bankAccounts}
              value={payOneBankId}
              onChange={setPayOneBankId}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment date</p>
              <input
                type="date"
                value={payOneDate}
                max={ymdLocal(new Date())}
                onChange={e => setPayOneDate(e.target.value)}
                className="w-full h-9 rounded-lg border border-border px-3 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</p>
              <input
                type="number"
                min={1}
                max={payingRow.netSalary}
                placeholder={String(payingRow.netSalary)}
                value={payOneAmount}
                onChange={e => setPayOneAmount(e.target.value)}
                className="w-full h-9 rounded-lg border border-border px-3 text-sm font-mono"
              />
            </div>
          </div>
          {payOneAmount !== "" && Number(payOneAmount) > 0 && Number(payOneAmount) < payingRow.netSalary && (
            <p className="text-[11px] text-amber-700">
              Partial payment — {formatCurrency(payingRow.netSalary - Number(payOneAmount))} will remain outstanding.
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
