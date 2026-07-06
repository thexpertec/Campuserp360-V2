import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDate, formatCurrency } from "@/lib/locale";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowUpCircle, ArrowDownCircle, Loader2, Trash2, Check, Lock,
  Receipt, Filter,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoucherListRow {
  id: string;
  voucher_type: "receipt" | "payment";
  status: "draft" | "posted";
  voucher_no: string;
  date: string;
  cash_bank_code: string | null;
  cash_bank_name: string | null;
  narration: string | null;
  total: string;
}
interface VouchersPage { total: number; page: number; pageSize: number; rows: VoucherListRow[]; }

const PAGE_SIZE = 100;

// ─── Component ──────────────────────────────────────────────────────────────────

export function VouchersList() {
  const qc = useQueryClient();
  const [, nav] = useLocation();

  const [typeFilter, setTypeFilter]     = useState<"" | "receipt" | "payment">("");
  const [statusFilter, setStatusFilter] = useState<"" | "draft" | "posted">("");
  const [deleteId, setDeleteId]         = useState<string | null>(null);

  const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
  if (typeFilter)   params.set("type", typeFilter);
  if (statusFilter) params.set("status", statusFilter);

  const { data: pg, isFetching } = useQuery<VouchersPage>({
    queryKey: ["vouchers", typeFilter, statusFilter],
    queryFn: () => apiFetch<VouchersPage>(`/api/admin/vouchers?${params}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/vouchers/${id}`, { method: "DELETE" }),
    onSuccess: () => { setDeleteId(null); qc.invalidateQueries({ queryKey: ["vouchers"] }); },
  });

  const rows = pg?.rows ?? [];
  const toDelete = rows.find(r => r.id === deleteId);

  function open(r: VoucherListRow) {
    nav(`/${r.voucher_type === "receipt" ? "receipt-voucher" : "payment-voucher"}/${r.id}`);
  }

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-bold text-slate-900 flex-1">Vouchers</h2>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}
            className="h-8 rounded-lg border border-border bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400">
            <option value="">All types</option>
            <option value="receipt">Receipt</option>
            <option value="payment">Payment</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
            className="h-8 rounded-lg border border-border bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400">
            <option value="">All status</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm"
            onClick={() => nav("/receipt-voucher")}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-4 text-xs">
            <ArrowUpCircle className="h-3.5 w-3.5" /> New Receipt
          </Button>
          <Button size="sm"
            onClick={() => nav("/payment-voucher")}
            className="gap-1.5 bg-rose-600 hover:bg-rose-700 text-white h-8 px-4 text-xs">
            <ArrowDownCircle className="h-3.5 w-3.5" /> New Payment
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        {isFetching && (
          <div className="flex items-center gap-2 px-5 py-2 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-600">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        )}

        {rows.length === 0 && !isFetching ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Receipt className="h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">No vouchers yet</p>
            <p className="text-xs text-slate-400">Create a Receipt or Payment voucher to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-border">
                  {["Date", "Voucher #", "Type", "Cash / Bank", "Narration", "Amount", "Status", ""].map(h => (
                    <th key={h} className={cn(
                      "px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500",
                      h === "Amount" ? "text-right px-4" : "text-left",
                      (h === "Status" || h === "Type") ? "text-center" : "",
                    )}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}
                    onClick={() => open(r)}
                    className="group border-b border-border last:border-0 transition-colors hover:bg-slate-50/60 cursor-pointer">
                    <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="px-3 py-3 text-xs font-mono font-semibold text-slate-700">{r.voucher_no}</td>
                    <td className="px-3 py-3 text-center">
                      {r.voucher_type === "receipt" ? (
                        <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 font-bold gap-1">
                          <ArrowUpCircle className="h-3 w-3" /> Receipt
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] bg-rose-100 text-rose-700 font-bold gap-1">
                          <ArrowDownCircle className="h-3 w-3" /> Payment
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">
                      {r.cash_bank_code
                        ? <span className="font-mono">{r.cash_bank_code}<span className="font-sans ml-1 text-slate-400">· {r.cash_bank_name}</span></span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500 max-w-[220px] truncate">
                      {r.narration || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">{formatCurrency(Number(r.total))}</td>
                    <td className="px-3 py-3 text-center">
                      {r.status === "posted" ? (
                        <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 font-bold gap-1">
                          <Check className="h-3 w-3" /> Posted
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 font-bold">Draft</Badge>
                      )}
                    </td>
                    <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {r.status === "draft" ? (
                          <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-red-500" title="Delete draft">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        ) : (
                          <span className="h-7 w-7 inline-flex items-center justify-center text-slate-300" title="Posted — locked">
                            <Lock className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>

              {rows.length > 0 && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {pg?.total ?? 0} voucher{(pg?.total ?? 0) !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-extrabold text-slate-900">
                      {formatCurrency(rows.reduce((s, r) => s + Number(r.total), 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? `${toDelete.voucher_no} will be permanently deleted. This cannot be undone.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700">
              {deleteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
