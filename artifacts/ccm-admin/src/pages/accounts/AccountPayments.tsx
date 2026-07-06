import { useState, useRef } from "react";
import { formatDate, formatCurrency, todayIso } from "@/lib/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, Ban, Check, X, Loader2,
  AlertCircle, ArrowDownCircle, ChevronLeft, ChevronRight,
  Building2, Wallet, Filter,
} from "lucide-react";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }
// Builds "YYYY-MM" from local year/month, not toISOString() (which converts
// to UTC first and rolls day-1 midnight back a month for positive UTC offsets).
function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmt(n: number | string) {
  return formatCurrency(Number(n));
}
function fmtDate(d: string) {
  return formatDate(d);
}

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

interface BankAccount { id: string; type: string; bank_name: string | null; account_title: string; is_active: boolean; }
interface CoaAccount  { id: string; code: string; name: string; type: "income" | "expense"; parentId: string | null; }
interface Payment {
  id: string; date: string; voucher_number: string | null; payee: string;
  description: string | null; amount: string; status: "recorded" | "void";
  bank_account_id: string | null; bank_account_title: string | null;
  bank_name: string | null; bank_account_type: string | null;
  coa_account_id: string | null; coa_code: string | null; coa_name: string | null;
  created_at: string;
}
interface PaymentsPage { total: number; page: number; pageSize: number; rows: Payment[]; }
interface Summary { count: number; total: number; }

// ─── Form ─────────────────────────────────────────────────────────────────────

interface FormState {
  date: string; voucherNumber: string; payee: string;
  description: string; amount: string;
  bankAccountId: string; coaAccountId: string;
}
const BLANK: FormState = {
  date: todayStr(), voucherNumber: "", payee: "",
  description: "", amount: "", bankAccountId: "", coaAccountId: "",
};

function PaymentForm({
  initial = BLANK, bankAccounts, coaAccounts,
  onSave, onCancel, saving, error,
}: {
  initial?: FormState;
  bankAccounts: BankAccount[];
  coaAccounts: CoaAccount[];
  onSave: (f: FormState) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const set = (k: keyof FormState) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  const firstRef = useRef<HTMLInputElement>(null);

  const expenseCoa = coaAccounts.filter(a => a.type === "expense");
  const activeBanks = bankAccounts.filter(a => a.is_active);
  const valid = form.payee.trim() && form.date && Number(form.amount) > 0;

  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-5 space-y-4">
      <p className="text-sm font-bold text-indigo-800">
        {initial === BLANK ? "New Payment" : "Edit Payment"}
      </p>

      {activeBanks.length === 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 leading-snug">
            <span className="font-semibold">No payment accounts configured</span>
            {" — "}
            <a href="/admin/accounts?tab=setup" target="_blank" className="underline hover:text-amber-900">
              set up a Cash or Bank account first
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Date */}
        <div className="space-y-1">
          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date *</Label>
          <Input ref={firstRef} type="date" value={form.date} onChange={e => set("date")(e.target.value)}
            max={todayIso()} className="h-8 text-xs bg-white" />
        </div>

        {/* Voucher # */}
        <div className="space-y-1">
          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Voucher #</Label>
          <Input value={form.voucherNumber} onChange={e => set("voucherNumber")(e.target.value)}
            placeholder="PV-001" className="h-8 text-xs bg-white" />
        </div>

        {/* Payee */}
        <div className="space-y-1 col-span-2">
          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payee *</Label>
          <Input value={form.payee} onChange={e => set("payee")(e.target.value)}
            placeholder="Vendor / person name" className="h-8 text-xs bg-white" />
        </div>

        {/* Amount */}
        <div className="space-y-1">
          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount *</Label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">Rs</span>
            <Input type="number" min={0} step={1}
              value={form.amount} onChange={e => set("amount")(e.target.value)}
              onFocus={e => e.target.select()}
              placeholder="0" className="h-8 text-xs bg-white pl-7 font-mono" />
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1 col-span-2 sm:col-span-1 lg:col-span-2">
          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description</Label>
          <Input value={form.description} onChange={e => set("description")(e.target.value)}
            placeholder="What was this payment for?" className="h-8 text-xs bg-white" />
        </div>

        {/* Bank / Cash Account */}
        <div className="space-y-1 col-span-2">
          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Paid From (Account)</Label>
          <select
            value={form.bankAccountId} onChange={e => set("bankAccountId")(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400">
            <option value="">— Select account —</option>
            {activeBanks.map(b => (
              <option key={b.id} value={b.id}>
                {b.type === "bank" ? `🏦 ${b.bank_name ? `${b.bank_name} · ` : ""}` : "💵 "}
                {b.account_title}
              </option>
            ))}
          </select>
        </div>

        {/* COA / Category */}
        <div className="space-y-1 col-span-2">
          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category (COA)</Label>
          <select
            value={form.coaAccountId} onChange={e => set("coaAccountId")(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400">
            <option value="">— Select category —</option>
            {expenseCoa.map(c => (
              <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{error}
        </p>
      )}

      <div className="flex gap-2">
        <Button size="sm" disabled={saving || !valid || activeBanks.length === 0} onClick={() => onSave(form)}
          className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-4 text-xs">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Save Payment
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-8 px-3 text-xs text-slate-600">
          <X className="h-3 w-3 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Payment row ──────────────────────────────────────────────────────────────

function PaymentRow({
  p, onEdit, onVoid, onDelete,
}: {
  p: Payment;
  onEdit: () => void;
  onVoid: () => void;
  onDelete: () => void;
}) {
  const voided = p.status === "void";
  return (
    <tr className={cn("group border-b border-border last:border-0 transition-colors hover:bg-slate-50/60", voided && "opacity-50")}>
      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtDate(p.date)}</td>
      <td className="px-3 py-3 text-xs font-mono text-slate-500">{p.voucher_number ?? "—"}</td>
      <td className="px-3 py-3">
        <p className="text-sm font-semibold text-slate-900">{p.payee}</p>
        {p.description && <p className="text-[11px] text-slate-400 mt-0.5">{p.description}</p>}
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">
        {p.bank_account_title ? (
          <span className="flex items-center gap-1">
            {p.bank_account_type === "bank"
              ? <Building2 className="h-3 w-3 text-blue-500 flex-shrink-0" />
              : <Wallet className="h-3 w-3 text-emerald-500 flex-shrink-0" />}
            <span className="truncate max-w-[100px]">{p.bank_account_title}</span>
          </span>
        ) : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">
        {p.coa_code
          ? <span className="font-mono">{p.coa_code}<span className="font-sans ml-1 text-slate-400">· {p.coa_name}</span></span>
          : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">{fmt(p.amount)}</td>
      <td className="px-3 py-3 text-center">
        {voided
          ? <Badge variant="secondary" className="text-[10px] bg-red-100 text-red-600 font-bold">VOID</Badge>
          : <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 font-bold">OK</Badge>}
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {!voided && (
            <>
              <Button size="sm" variant="ghost" onClick={onEdit}
                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700">
                <Pencil className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onVoid}
                title="Void this payment"
                className="h-7 w-7 p-0 text-slate-400 hover:text-amber-600">
                <Ban className="h-3 w-3" />
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete}
            className="h-7 w-7 p-0 text-slate-400 hover:text-red-500">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export function AccountPayments() {
  const qc = useQueryClient();

  // ── Filters
  const [dateFrom,  setDateFrom]  = useState("");
  const [dateTo,    setDateTo]    = useState("");
  const [showVoid,  setShowVoid]  = useState(false);
  const [page,      setPage]      = useState(1);

  // ── UI state
  const [showAdd,   setShowAdd]   = useState(false);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [voidId,    setVoidId]    = useState<string | null>(null);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Reference data
  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn: () => apiFetch<BankAccount[]>("/api/admin/bank-accounts"),
    staleTime: 60_000,
  });
  const { data: coaRaw = [] } = useQuery<CoaAccount[]>({
    queryKey: ["coa"],
    queryFn: () => apiFetch<CoaAccount[]>("/api/admin/coa"),
    staleTime: 60_000,
  });

  // ── Summary (this month)
  const { data: summary } = useQuery<Summary>({
    queryKey: ["account-payments-summary", thisMonth()],
    queryFn: () => apiFetch<Summary>(`/api/admin/account-payments/summary?month=${thisMonth()}`),
  });

  // ── Payments list
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo)   params.set("dateTo",   dateTo);
  if (!showVoid) params.set("status",  "recorded");

  const { data: pg, isFetching } = useQuery<PaymentsPage>({
    queryKey: ["account-payments", page, dateFrom, dateTo, showVoid],
    queryFn: () => apiFetch<PaymentsPage>(`/api/admin/account-payments?${params}`),
  });

  const payments    = pg?.rows ?? [];
  const totalPages  = Math.ceil((pg?.total ?? 0) / PAGE_SIZE);
  const invalidate  = () => qc.invalidateQueries({ queryKey: ["account-payments"] });

  // ── Mutations
  const createMut = useMutation({
    mutationFn: (f: FormState) => apiFetch("/api/admin/account-payments", {
      method: "POST",
      body: JSON.stringify({
        date: f.date, voucherNumber: f.voucherNumber, payee: f.payee,
        description: f.description, amount: Number(f.amount),
        bankAccountId: f.bankAccountId || null,
        coaAccountId:  f.coaAccountId  || null,
      }),
    }),
    onSuccess: () => { setShowAdd(false); setFormError(null); invalidate();
      qc.invalidateQueries({ queryKey: ["account-payments-summary"] }); },
    onError: (e: Error) => setFormError(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, f }: { id: string; f: FormState }) =>
      apiFetch(`/api/admin/account-payments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date: f.date, voucherNumber: f.voucherNumber, payee: f.payee,
          description: f.description, amount: Number(f.amount),
          bankAccountId: f.bankAccountId || null,
          coaAccountId:  f.coaAccountId  || null,
        }),
      }),
    onSuccess: () => { setEditId(null); setFormError(null); invalidate(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const voidMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/account-payments/${id}/void`, { method: "POST" }),
    onSuccess: () => { setVoidId(null); invalidate(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/account-payments/${id}`, { method: "DELETE" }),
    onSuccess: () => { setDeleteId(null); invalidate(); },
  });

  // ── Helpers
  function formInitial(p: Payment): FormState {
    return {
      date:          p.date.slice(0, 10),
      voucherNumber: p.voucher_number ?? "",
      payee:         p.payee,
      description:   p.description ?? "",
      amount:        String(p.amount),
      bankAccountId: p.bank_account_id ?? "",
      coaAccountId:  p.coa_account_id  ?? "",
    };
  }

  const toDelete = payments.find(p => p.id === deleteId);
  const toVoid   = payments.find(p => p.id === voidId);

  // ── Render
  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-white shadow-sm p-5 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
            <ArrowDownCircle className="h-5 w-5 text-rose-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">This Month</p>
            <p className="text-2xl font-extrabold text-slate-900 font-mono">{fmt(summary?.total ?? 0)}</p>
            <p className="text-xs text-slate-400">{summary?.count ?? 0} payment{(summary?.count ?? 0) !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-white shadow-sm p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Accounts Configured</p>
            <p className="text-2xl font-extrabold text-slate-900">
              {(bankAccounts as BankAccount[]).filter(b => b.is_active).length}
            </p>
            <p className="text-xs text-slate-400">active bank / cash accounts</p>
          </div>
          <Wallet className="h-8 w-8 text-slate-200" />
        </div>
      </div>

      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-bold text-slate-900 flex-1">Payment Vouchers</h2>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            placeholder="From" max={todayIso()} className="h-8 text-xs w-32" />
          <span className="text-slate-400 text-xs">—</span>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
            placeholder="To" max={todayIso()} className="h-8 text-xs w-32" />
          <button
            onClick={() => setShowVoid(v => !v)}
            className={cn(
              "h-8 px-3 rounded-lg text-xs font-semibold border transition-colors",
              showVoid ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-border hover:border-slate-400",
            )}>
            {showVoid ? "Hide Void" : "Show Void"}
          </button>
        </div>

        <Button size="sm"
          onClick={() => { setShowAdd(true); setEditId(null); setFormError(null); }}
          className="gap-1.5 bg-slate-900 hover:bg-slate-700 text-white h-8 px-4 text-xs">
          <Plus className="h-3.5 w-3.5" /> New Payment
        </Button>
      </div>

      {/* Add form */}
      {showAdd && !editId && (
        <PaymentForm
          bankAccounts={bankAccounts as BankAccount[]}
          coaAccounts={coaRaw as CoaAccount[]}
          onSave={f => createMut.mutate(f)}
          onCancel={() => { setShowAdd(false); setFormError(null); }}
          saving={createMut.isPending}
          error={formError}
        />
      )}

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        {isFetching && (
          <div className="flex items-center gap-2 px-5 py-2 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-600">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        )}

        {payments.length === 0 && !isFetching ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <ArrowDownCircle className="h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">No payments recorded yet</p>
            <p className="text-xs text-slate-400">Use the "New Payment" button to record an expense or payment.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-border">
                  {["Date", "Voucher #", "Payee", "Paid From", "Category", "Amount", "Status", ""].map(h => (
                    <th key={h} className={cn(
                      "px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500",
                      h === "Amount" ? "text-right px-4" : "text-left",
                      h === "Status" ? "text-center" : "",
                    )}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map(p =>
                  editId === p.id ? (
                    <tr key={p.id}>
                      <td colSpan={8} className="px-4 py-3">
                        <PaymentForm
                          initial={formInitial(p)}
                          bankAccounts={bankAccounts as BankAccount[]}
                          coaAccounts={coaRaw as CoaAccount[]}
                          onSave={f => updateMut.mutate({ id: p.id, f })}
                          onCancel={() => { setEditId(null); setFormError(null); }}
                          saving={updateMut.isPending}
                          error={formError}
                        />
                      </td>
                    </tr>
                  ) : (
                    <PaymentRow
                      key={p.id}
                      p={p}
                      onEdit={() => { setEditId(p.id); setShowAdd(false); setFormError(null); }}
                      onVoid={() => setVoidId(p.id)}
                      onDelete={() => setDeleteId(p.id)}
                    />
                  )
                )}
              </tbody>

              {/* Footer totals */}
              {payments.length > 0 && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {pg?.total ?? 0} payment{(pg?.total ?? 0) !== 1 ? "s" : ""} total
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-extrabold text-slate-900">
                      {fmt(payments.filter(p => p.status === "recorded").reduce((s, p) => s + Number(p.amount), 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-white">
            <p className="text-xs text-slate-500">
              Page {page} of {totalPages} · {pg?.total} records
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-7 w-7 p-0">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-7 w-7 p-0">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Void confirm */}
      <AlertDialog open={!!voidId} onOpenChange={open => !open && setVoidId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toVoid?.payee} — {fmt(toVoid?.amount ?? 0)}" will be marked as voided.
              The record is kept for audit; no money moves.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => voidId && voidMut.mutate(voidId)}
              className="bg-amber-600 hover:bg-amber-700 text-white">
              {voidMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Void Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payment?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.payee} — {fmt(toDelete?.amount ?? 0)}" will be permanently deleted.
              Consider voiding instead to preserve the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMut.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700 text-white">
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
