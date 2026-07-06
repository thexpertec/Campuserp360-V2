import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { formatCurrencyCompact } from "@/lib/locale";
import { Wallet, Receipt, CheckCircle2, AlertCircle, TrendingUp, DollarSign, Users, ShoppingCart } from "lucide-react";

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

interface FeeOverview {
  totalChallans: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  totalBilled: number;
  totalPaid: number;
  byMonth: { month: string; billed: number; paid: number }[];
}

interface FinanceSummary {
  feeCollectedThisMonth: number;
  feeOutstanding: number;
  salariesThisMonth: number;
  vendorApOutstanding: number;
  month: string;
}

function StatCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>; color: string; bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-5 py-4 flex items-center gap-4 shadow-sm">
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function FinanceDashboard({ tab = "dashboard" }: { tab?: string }) {
  const { data, isLoading } = useQuery<FeeOverview>({
    queryKey: ["fee-overview"],
    queryFn: () => apiFetch("/api/admin/dashboard/fee-overview"),
    staleTime: 30_000,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<FinanceSummary>({
    queryKey: ["finance-summary"],
    queryFn: () => apiFetch("/api/admin/finance/summary"),
    staleTime: 30_000,
  });

  const totalChallans = data?.totalChallans ?? 0;
  const paidCount     = data?.paidCount     ?? 0;
  const pendingCount  = data?.pendingCount  ?? 0;
  const overdueCount  = data?.overdueCount  ?? 0;
  const totalBilled   = data?.totalBilled   ?? 0;
  const totalPaid     = data?.totalPaid     ?? 0;
  const paidPct       = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;
  const outstanding   = totalBilled - totalPaid;

  const months = (data?.byMonth ?? []).slice(-6);
  const maxBilled = Math.max(1, ...months.map(v => v.billed));

  const monthLabel = summary?.month
    ? new Date(summary.month + "-01").toLocaleString("default", { month: "long", year: "numeric" })
    : "This Month";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Finance</h2>
        <p className="text-sm text-slate-500 mt-0.5">Fee collection summary, outstanding dues and payment trends.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Challans"  value={isLoading ? "…" : totalChallans}                    icon={Receipt}      color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard label="Collected"       value={isLoading ? "…" : formatCurrencyCompact(totalPaid)}          icon={CheckCircle2} color="text-green-600"  bg="bg-green-50"
          sub={`${paidPct}% of total billed`} />
        <StatCard label="Outstanding"     value={isLoading ? "…" : formatCurrencyCompact(outstanding)}        icon={AlertCircle}  color="text-red-600"    bg="bg-red-50"
          sub={`${pendingCount + overdueCount} pending challan${(pendingCount + overdueCount) !== 1 ? "s" : ""}`} />
        <StatCard label="Total Billed"    value={isLoading ? "…" : formatCurrencyCompact(totalBilled)}        icon={DollarSign}   color="text-amber-600"  bg="bg-amber-50" />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Live COA Summary — {monthLabel}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Fee Collected"
            value={summaryLoading ? "…" : formatCurrencyCompact(summary?.feeCollectedThisMonth ?? 0)}
            sub="This month (paid challans)"
            icon={CheckCircle2}
            color="text-emerald-600"
            bg="bg-emerald-50"
          />
          <StatCard
            label="Fee Receivable"
            value={summaryLoading ? "…" : formatCurrencyCompact(summary?.feeOutstanding ?? 0)}
            sub="Pending & overdue challans"
            icon={AlertCircle}
            color="text-orange-600"
            bg="bg-orange-50"
          />
          <StatCard
            label="Salaries"
            value={summaryLoading ? "…" : formatCurrencyCompact(summary?.salariesThisMonth ?? 0)}
            sub="Approved + paid this month"
            icon={Users}
            color="text-purple-600"
            bg="bg-purple-50"
          />
          <StatCard
            label="Vendor AP"
            value={summaryLoading ? "…" : formatCurrencyCompact(summary?.vendorApOutstanding ?? 0)}
            sub="Outstanding payables"
            icon={ShoppingCart}
            color="text-rose-600"
            bg="bg-rose-50"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Collection Rate</h3>
            <span className="text-lg font-bold text-green-600 tabular-nums">{isLoading ? "…" : `${paidPct}%`}</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden mb-4">
            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${paidPct}%` }} />
          </div>
          <div className="space-y-2">
            {[
              { label: "Paid",    count: paidCount,    color: "bg-green-500", text: "text-green-700" },
              { label: "Pending", count: pendingCount,  color: "bg-amber-400", text: "text-amber-700" },
              { label: "Overdue", count: overdueCount,  color: "bg-red-500",   text: "text-red-700" },
            ].map(({ label, count, color, text }) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${color}`} />
                  <span className="text-slate-600">{label}</span>
                </div>
                <span className={`font-semibold tabular-nums ${text}`}>{isLoading ? "—" : count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Monthly Collection</h3>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-4 bg-slate-100 rounded-full animate-pulse" />)}</div>
          ) : months.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No fee data yet</p>
          ) : (
            <div className="space-y-3">
              {months.map(({ month, billed, paid }) => (
                <div key={month} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-20 flex-shrink-0 font-medium truncate">{month}</span>
                  <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden relative">
                    <div className="h-full rounded bg-indigo-100 absolute inset-0" style={{ width: `${(billed / maxBilled) * 100}%` }} />
                    <div className="h-full rounded bg-green-500 absolute inset-0" style={{ width: `${(paid / maxBilled) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-14 text-right tabular-nums">
                    {formatCurrencyCompact(paid)}<span className="text-slate-400">/{formatCurrencyCompact(billed)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Module Sections</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Fee Master",     sub: "Fee types & schedule",   icon: Wallet,       color: "text-indigo-600", bg: "bg-indigo-50",   href: "/fee-master" },
            { label: "Fee Reports",    sub: "Student-wise ledger",     icon: TrendingUp,   color: "text-green-600",  bg: "bg-green-50",    href: "/fee-master?tab=student-wise" },
            { label: "Fee Collection", sub: "Challan collection desk", icon: CheckCircle2, color: "text-emerald-600",bg: "bg-emerald-50",  href: "/fee-master?tab=collect" },
            { label: "Challans",       sub: "Generate challans",       icon: Receipt,      color: "text-amber-600",  bg: "bg-amber-50",    href: "/fee-master?tab=generate-challan" },
          ].map(({ label, sub, icon: Icon, color, bg, href }) => (
            <a key={label} href={href} className="flex items-center gap-3 px-3 py-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer no-underline">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{label}</p>
                <p className="text-xs text-slate-400 truncate">{sub}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
