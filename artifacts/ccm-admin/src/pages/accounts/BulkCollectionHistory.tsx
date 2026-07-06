import { useState } from "react";
import { formatDate, formatCurrency, todayIso } from "@/lib/locale";
import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronDown, ChevronRight, Calendar, Banknote,
  Users, Hash, AlertCircle, ChevronLeft, ChevronRight as ChevronRightIcon,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Session {
  collection_date: string;
  account_title: string;
  payment_method: string;
  challan_count: number;
  student_count: number;
  total_amount: number;
}

interface StudentDetail {
  studentId: string;
  applicantId: string;
  fullName: string;
  classCode: string;
  paidAmount: number;
  challans: {
    id: string;
    feeTypeName: string;
    amount: number;
    paidAmount: number;
    month: string | null;
  }[];
}

interface HistoryResponse {
  sessions: Session[];
  total: number;
  page: number;
  pageSize: number;
}

interface DetailResponse {
  students: StudentDetail[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

function fmt(n: number) {
  return formatCurrency(n);
}

function fmtDate(d: string) {
  return formatDate(d);
}

function methodBadge(method: string) {
  if (method === "bank")   return "bg-blue-50 text-blue-700 border border-blue-200";
  if (method === "cheque") return "bg-purple-50 text-purple-700 border border-purple-200";
  if (method === "online") return "bg-indigo-50 text-indigo-700 border border-indigo-200";
  return "bg-slate-100 text-slate-600 border border-slate-200";
}

// ── Expanded row ──────────────────────────────────────────────────────────────

function SessionDetail({ date, accountTitle, paymentMethod }: { date: string; accountTitle: string; paymentMethod: string }) {
  const { data, isLoading, error } = useQuery<DetailResponse>({
    queryKey: ["bulk-history-detail", date, accountTitle, paymentMethod],
    queryFn: () =>
      apiFetch<DetailResponse>(
        `/api/admin/fee-challans/bulk-history/detail?date=${encodeURIComponent(date)}&accountTitle=${encodeURIComponent(accountTitle)}&paymentMethod=${encodeURIComponent(paymentMethod)}`
      ),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="px-6 py-4 space-y-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-4 flex items-center gap-2 text-sm text-red-600">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        {(error as Error).message}
      </div>
    );
  }

  const students = data?.students ?? [];

  return (
    <div className="border-t border-border bg-slate-50/60">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left px-6 py-2.5 font-bold text-[10px] uppercase tracking-wider text-slate-400 w-8">Sr</th>
              <th className="text-left px-4 py-2.5 font-bold text-[10px] uppercase tracking-wider text-slate-400">Student</th>
              <th className="text-left px-4 py-2.5 font-bold text-[10px] uppercase tracking-wider text-slate-400">Fee Types</th>
              <th className="text-right px-4 py-2.5 font-bold text-[10px] uppercase tracking-wider text-slate-400 w-32">Amount Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((s, idx) => (
              <tr key={s.studentId} className="hover:bg-white/70 transition-colors">
                <td className="px-6 py-2.5 text-slate-400 font-mono">{idx + 1}</td>
                <td className="px-4 py-2.5">
                  <p className="font-semibold text-slate-800">
                    {s.fullName}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    ID-{s.applicantId} · Class {s.classCode}
                  </p>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {s.challans.map(c => (
                      <span
                        key={c.id}
                        className="inline-flex items-center text-[10px] font-medium bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5 whitespace-nowrap border border-emerald-100">
                        {c.feeTypeName}
                        {c.month ? ` (${c.month})` : ""}
                        {" · "}{fmt(c.paidAmount)}
                        {c.paidAmount < c.amount && (
                          <span className="ml-1 text-amber-500">partial</span>
                        )}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-800">
                  {fmt(s.paidAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {students.length === 0 && (
          <p className="text-center text-slate-400 text-xs py-6">No students found for this session.</p>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function BulkCollectionHistory() {
  const [page, setPage]         = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const pageSize = 20;

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo   ? { dateTo   } : {}),
  });

  const { data, isLoading, error, refetch } = useQuery<HistoryResponse>({
    queryKey: ["bulk-history", page, dateFrom, dateTo],
    queryFn: () => apiFetch<HistoryResponse>(`/api/admin/fee-challans/bulk-history?${params}`),
    staleTime: 30_000,
  });

  const sessions   = data?.sessions ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function sessionKey(s: Session) {
    return `${s.collection_date}|${s.account_title}|${s.payment_method}`;
  }

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyFilters() {
    setPage(1);
    void refetch();
  }

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white shadow-sm p-4">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">From</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            max={todayIso()}
            className="h-8 w-36 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">To</label>
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            max={todayIso()}
            className="h-8 w-36 text-sm"
          />
        </div>
        <Button size="sm" onClick={applyFilters} className="h-8">
          Filter
        </Button>
        {(dateFrom || dateTo) && (
          <Button size="sm" variant="ghost" onClick={clearFilters} className="h-8 text-slate-500">
            Clear
          </Button>
        )}
        <p className="ml-auto text-xs text-slate-400">
          {total} session{total !== 1 ? "s" : ""} found
        </p>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center bg-slate-50 border-b border-border px-4 py-3 gap-4">
          <span className="w-6" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Date · Account</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 text-center w-24">Method</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 text-right w-24">Students</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 text-right w-24">Challans</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 text-right w-32">Total</span>
        </div>

        {isLoading && (
          <div className="divide-y divide-border">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="px-4 py-4">
                <Skeleton className="h-5 w-full rounded" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-6 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && sessions.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
            <Calendar className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">No collection sessions found</p>
            <p className="text-xs">
              {dateFrom || dateTo
                ? "Try adjusting the date filter."
                : "Bulk collections will appear here after they are posted."}
            </p>
          </div>
        )}

        {!isLoading && !error && sessions.map(session => {
          const key       = sessionKey(session);
          const isOpen    = expanded.has(key);

          return (
            <div key={key} className="border-b border-border last:border-0">
              {/* Summary row */}
              <button
                onClick={() => toggleExpand(key)}
                className={cn(
                  "w-full grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center px-4 py-3.5 gap-4",
                  "hover:bg-slate-50/80 transition-colors text-left",
                  isOpen && "bg-emerald-50/40",
                )}>
                <span className="w-6 flex items-center justify-center text-slate-400">
                  {isOpen
                    ? <ChevronDown className="h-4 w-4" />
                    : <ChevronRight className="h-4 w-4" />}
                </span>

                <div>
                  <p className="font-semibold text-slate-900 text-sm">
                    {fmtDate(session.collection_date)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Banknote className="h-3 w-3 text-slate-400" />
                    <p className="text-xs text-slate-500">{session.account_title}</p>
                  </div>
                </div>

                <div className="w-24 flex justify-center">
                  <span className={cn(
                    "text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize",
                    methodBadge(session.payment_method),
                  )}>
                    {session.payment_method}
                  </span>
                </div>

                <div className="w-24 flex items-center justify-end gap-1 text-xs text-slate-600">
                  <Users className="h-3 w-3 text-slate-400" />
                  {session.student_count}
                </div>

                <div className="w-24 flex items-center justify-end gap-1 text-xs text-slate-600">
                  <Hash className="h-3 w-3 text-slate-400" />
                  {session.challan_count}
                </div>

                <div className="w-32 text-right font-mono font-bold text-sm text-slate-900">
                  {fmt(Number(session.total_amount))}
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <SessionDetail
                  date={session.collection_date}
                  accountTitle={session.account_title}
                  paymentMethod={session.payment_method}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages} · {total} session{total !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="h-8 gap-1">
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="h-8 gap-1">
              Next <ChevronRightIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
