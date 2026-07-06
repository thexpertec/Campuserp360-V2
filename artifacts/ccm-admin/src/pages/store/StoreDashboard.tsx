import { useQuery } from "@tanstack/react-query";
import { formatDate, formatCurrencyCompact } from "@/lib/locale";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { getToken } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Package, ArrowUpRight, PackageOpen, AlertTriangle,
  TrendingDown, Tag, Ruler, ArrowDownToLine, ArrowUpFromLine,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoreSummary {
  totalItems:      number;
  lowStockCount:   number;
  outOfStock:      number;
  totalStockValue: number;
  todayIn:         number;
  todayOut:        number;
  recentTransactions: {
    id: string; transactionType: string; quantity: number;
    transactionDate: string; issuedTo: string | null; itemName: string | null;
  }[];
  lowStockItems: {
    id: string; name: string; currentStock: number; reorderLevel: number;
  }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

function fade(delay = 0) {
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay, ease: [0.4, 0, 0.2, 1] as any },
  };
}

function fmtPKR(n: number) {
  return formatCurrencyCompact(n);
}

function fmtDate(d: string) {
  return formatDate(d);
}

const QUICK_LINKS = [
  { label: "Items List",   sub: "Browse inventory",     href: "/store?tab=items",         grad: "from-orange-500 to-amber-600",  icon: Package         },
  { label: "Issue Stock",  sub: "Record outgoing items",href: "/store?tab=items",         grad: "from-rose-500 to-pink-600",     icon: ArrowUpFromLine },
  { label: "Receive Stock",sub: "Log incoming items",   href: "/store?tab=items",         grad: "from-emerald-500 to-teal-600",  icon: ArrowDownToLine },
  { label: "Categories",   sub: "Manage categories",    href: "/store?tab=categorization",grad: "from-violet-500 to-indigo-600", icon: Tag             },
  { label: "Units",        sub: "Units of measure",     href: "/store?tab=units",         grad: "from-sky-500 to-blue-600",      icon: Ruler           },
  { label: "Low Stock",    sub: "Items needing reorder",href: "/store?tab=items",         grad: "from-red-500 to-rose-600",      icon: TrendingDown    },
];

// ── KPI card ──────────────────────────────────────────────────────────────────

interface KpiProps {
  title: string; value: string | number; sub: string;
  icon: React.ElementType; grad: string; href: string; delay?: number; loading?: boolean;
  warn?: boolean;
}

function KpiCard({ title, value, sub, icon: Icon, grad, href, delay = 0, loading, warn }: KpiProps) {
  if (loading) return <Skeleton className="h-36 rounded-2xl" />;
  return (
    <motion.div {...fade(delay)}>
      <Link href={href}>
        <div className={cn(
          "relative rounded-2xl p-5 cursor-pointer overflow-hidden bg-gradient-to-br text-white shadow-lg",
          "hover:shadow-xl hover:scale-[1.02] transition-all duration-200",
          warn ? "from-red-500 to-rose-600" : grad,
        )}>
          <div className="absolute inset-0 bg-white/10 rounded-2xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">{title}</p>
              <p className="text-3xl font-extrabold text-white mt-1 leading-none" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                {value}
              </p>
              <p className="text-[11px] text-white/60 mt-1.5 font-medium">{sub}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="relative mt-3 flex items-center gap-1 text-[10.5px] font-semibold text-white/70">
            View <ArrowUpRight className="h-3 w-3" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function StoreDashboard() {
  const { data, isLoading } = useQuery<StoreSummary>({
    queryKey: ["store-summary"],
    queryFn:  () => apiFetch("/api/admin/store/summary"),
    staleTime: 30_000,
  });

  const maxStock = Math.max(1, ...(data?.lowStockItems ?? []).map(i => i.reorderLevel));

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Items"  value={isLoading ? "—" : (data?.totalItems ?? 0)}
          sub="Active inventory items" icon={Package} grad="from-orange-500 to-amber-600"
          href="/store?tab=items" delay={0} loading={isLoading} />
        <KpiCard title="Stock Value"  value={isLoading ? "—" : fmtPKR(data?.totalStockValue ?? 0)}
          sub="Current stock × unit price" icon={PackageOpen} grad="from-emerald-500 to-teal-600"
          href="/store?tab=items" delay={0.07} loading={isLoading} />
        <KpiCard title="Low Stock"  value={isLoading ? "—" : (data?.lowStockCount ?? 0)}
          sub="At or below reorder level" icon={AlertTriangle} grad="from-amber-500 to-orange-600"
          href="/store?tab=items" delay={0.14} loading={isLoading}
          warn={(data?.lowStockCount ?? 0) > 0 && (data?.outOfStock ?? 0) === 0} />
        <KpiCard title="Out of Stock"  value={isLoading ? "—" : (data?.outOfStock ?? 0)}
          sub="Zero units remaining" icon={TrendingDown} grad="from-rose-500 to-pink-600"
          href="/store?tab=items" delay={0.21} loading={isLoading}
          warn={(data?.outOfStock ?? 0) > 0} />
      </div>

      {/* Low stock alerts + Quick links */}
      <motion.div {...fade(0.1)} className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Low stock list */}
        <Card className="lg:col-span-3 border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Low Stock Alerts
                </CardTitle>
                <CardDescription className="text-xs font-medium">Items at or below their reorder level</CardDescription>
              </div>
              <Link href="/store?tab=items">
                <button className="text-xs font-semibold text-orange-600 hover:text-orange-800 flex items-center gap-1">
                  All Items <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>
            ) : (data?.lowStockItems ?? []).length === 0 ? (
              <div className="py-10 text-center">
                <Package className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">All items are well-stocked.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {(data?.lowStockItems ?? []).map((item, i) => {
                  const pct = item.reorderLevel > 0 ? Math.round((item.currentStock / item.reorderLevel) * 100) : 0;
                  const isOut = item.currentStock === 0;
                  return (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className={cn(
                        "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold",
                        isOut ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700",
                      )}>
                        {isOut ? "0" : item.currentStock}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[12.5px] font-semibold text-slate-800 truncate">{item.name}</span>
                          <span className="text-[10.5px] text-slate-400 ml-2 whitespace-nowrap">reorder: {item.reorderLevel}</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, pct)}%` }}
                            transition={{ duration: 0.6, delay: i * 0.05 }}
                            className={cn("h-full rounded-full", isOut ? "bg-red-400" : "bg-amber-400")}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick links + today activity */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Today's activity */}
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                Today's Activity
              </CardTitle>
              <CardDescription className="text-xs font-medium">Stock movements recorded today</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 flex gap-3">
              {isLoading ? (
                <Skeleton className="h-16 w-full rounded-xl" />
              ) : (
                <>
                  <div className="flex-1 rounded-xl bg-emerald-50 border border-emerald-100 flex flex-col items-center justify-center py-3 gap-1">
                    <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
                    <span className="text-xl font-extrabold text-emerald-700">{data?.todayIn ?? 0}</span>
                    <span className="text-[10px] font-semibold text-emerald-600">Units In</span>
                  </div>
                  <div className="flex-1 rounded-xl bg-rose-50 border border-rose-100 flex flex-col items-center justify-center py-3 gap-1">
                    <ArrowUpFromLine className="h-4 w-4 text-rose-600" />
                    <span className="text-xl font-extrabold text-rose-700">{data?.todayOut ?? 0}</span>
                    <span className="text-[10px] font-semibold text-rose-600">Units Out</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick links */}
          <Card className="border-0 shadow-md flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                Quick Access
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-2">
                {QUICK_LINKS.map(l => (
                  <Link key={l.label} href={l.href}>
                    <div className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3 cursor-pointer text-center shadow-md bg-gradient-to-br text-white",
                      "hover:scale-[1.04] transition-all",
                      l.grad,
                    )}>
                      <l.icon className="h-4 w-4" />
                      <span className="text-[10.5px] font-bold leading-tight">{l.label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Recent transactions */}
      <motion.div {...fade(0.15)}>
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-extrabold" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  Recent Transactions
                </CardTitle>
                <CardDescription className="text-xs font-medium">Latest stock movements</CardDescription>
              </div>
              <Link href="/store?tab=items">
                <button className="text-xs font-semibold text-orange-600 hover:text-orange-800 flex items-center gap-1">
                  All Transactions <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
            ) : (data?.recentTransactions ?? []).length === 0 ? (
              <div className="py-8 text-center">
                <PackageOpen className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">No transactions yet. Use the Items tab to record stock movements.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {(data?.recentTransactions ?? []).map(tx => {
                  const isIn = tx.transactionType === "in";
                  return (
                    <div key={tx.id} className="flex items-center gap-3 py-2.5">
                      <div className={cn(
                        "h-8 w-8 rounded-xl flex items-center justify-center shrink-0",
                        isIn ? "bg-emerald-100" : "bg-rose-100",
                      )}>
                        {isIn
                          ? <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" />
                          : <ArrowUpFromLine className="h-3.5 w-3.5 text-rose-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-semibold text-slate-800 truncate">
                          {tx.itemName ?? "Unknown item"}
                        </p>
                        <p className="text-[10.5px] text-slate-400">
                          {tx.issuedTo ? `→ ${tx.issuedTo}` : ""} · {fmtDate(tx.transactionDate)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={cn(
                          "text-sm font-bold",
                          isIn ? "text-emerald-600" : "text-rose-600",
                        )}>
                          {isIn ? "+" : "−"}{tx.quantity}
                        </span>
                        <p className={cn(
                          "text-[10px] font-semibold capitalize",
                          isIn ? "text-emerald-500" : "text-rose-500",
                        )}>
                          {tx.transactionType}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
