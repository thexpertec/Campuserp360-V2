import { useState, useEffect, useMemo } from "react";
import { todayIso } from "@/lib/locale";
import { useLocation, useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  VoucherGrid, blankRow, type VoucherGridRow, type AccountOption,
} from "./VoucherGrid";
import {
  ArrowLeft, ArrowUpCircle, ArrowDownCircle, Loader2, Check, Send,
  AlertCircle, Lock,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }

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

interface CashBankAccount { id: string; code: string; name: string; type: string; }

interface VoucherDetail {
  id: string;
  voucher_type: "receipt" | "payment";
  status: "draft" | "posted";
  voucher_no: string;
  date: string;
  cash_bank_account_id: string | null;
  narration: string | null;
  posted_at: string | null;
  rows: Array<{ id: string; account_id: string | null; ref: string | null; amount: string }>;
}

// ─── Config per voucher type ──────────────────────────────────────────────────

const CONFIG = {
  receipt: {
    title:     "Receipt Voucher",
    subtitle:  "Record money received — debit the cash/bank account against income accounts.",
    accent:    "emerald",
    Icon:      ArrowUpCircle,
    rowLabel:  "Income Accounts",
    createUrl: "/api/admin/vouchers/receipt",
    rowsUrl:   "/api/admin/accounts/income",
    listTab:   "receipt",
  },
  payment: {
    title:     "Payment Voucher",
    subtitle:  "Record money paid out — credit the cash/bank account against expense accounts.",
    accent:    "rose",
    Icon:      ArrowDownCircle,
    rowLabel:  "Expense Accounts",
    createUrl: "/api/admin/vouchers/payment",
    rowsUrl:   "/api/admin/accounts/expense",
    listTab:   "payment",
  },
} as const;

const ACCENT: Record<string, { bg: string; text: string; btn: string; ring: string; iconBg: string }> = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", btn: "bg-emerald-600 hover:bg-emerald-700", ring: "border-emerald-200", iconBg: "bg-emerald-100 text-emerald-600" },
  rose:    { bg: "bg-rose-50",    text: "text-rose-700",    btn: "bg-rose-600 hover:bg-rose-700",       ring: "border-rose-200",    iconBg: "bg-rose-100 text-rose-600" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function VoucherPage({ type }: { type: "receipt" | "payment" }) {
  const cfg = CONFIG[type];
  const accent = ACCENT[cfg.accent];
  const qc = useQueryClient();
  const [, nav] = useLocation();

  // Route can be /receipt-voucher or /receipt-voucher/:id
  const routePath = type === "receipt" ? "/receipt-voucher/:id" : "/payment-voucher/:id";
  const [, params] = useRoute(routePath);
  const voucherId = params?.id ?? null;

  // ── Form state
  const [date, setDate]           = useState(todayStr());
  const [cashBankId, setCashBankId] = useState("");
  const [narration, setNarration] = useState("");
  const [rows, setRows]           = useState<VoucherGridRow[]>([blankRow()]);
  const [status, setStatus]       = useState<"draft" | "posted">("draft");
  const [voucherNo, setVoucherNo] = useState<string | null>(null);
  const [savedId, setSavedId]     = useState<string | null>(voucherId);
  const [error, setError]         = useState<string | null>(null);

  const readOnly = status === "posted";

  // ── Reference data
  const { data: cashBanks = [] } = useQuery<CashBankAccount[]>({
    queryKey: ["accounts-cash-bank"],
    queryFn: () => apiFetch<CashBankAccount[]>("/api/admin/accounts/cash-bank"),
    staleTime: 60_000,
  });
  const { data: rowAccounts = [] } = useQuery<AccountOption[]>({
    queryKey: ["accounts-rows", type],
    queryFn: () => apiFetch<AccountOption[]>(cfg.rowsUrl),
    staleTime: 60_000,
  });

  // ── Load existing voucher (edit / reopen)
  const { data: loaded } = useQuery<VoucherDetail>({
    queryKey: ["voucher", voucherId],
    queryFn: () => apiFetch<VoucherDetail>(`/api/admin/vouchers/${voucherId}`),
    enabled: !!voucherId,
  });

  useEffect(() => {
    if (!loaded) return;
    setSavedId(loaded.id);
    setVoucherNo(loaded.voucher_no);
    setDate(loaded.date.slice(0, 10));
    setCashBankId(loaded.cash_bank_account_id ?? "");
    setNarration(loaded.narration ?? "");
    setStatus(loaded.status);
    setRows(
      loaded.rows.length
        ? loaded.rows.map(r => ({
            id: r.id,
            accountId: r.account_id ?? "",
            ref: r.ref ?? "",
            amount: r.amount != null ? String(Number(r.amount)) : "",
          }))
        : [blankRow()],
    );
  }, [loaded]);

  const total = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows]);

  function rowsPayload() {
    return rows
      .filter(r => r.accountId || Number(r.amount) > 0 || r.ref.trim())
      .map(r => ({ accountId: r.accountId || null, ref: r.ref.trim() || null, amount: Number(r.amount) || 0 }));
  }

  // ── Save draft (create or update)
  const saveMut = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({ date, cashBankAccountId: cashBankId || null, narration, rows: rowsPayload() });
      if (savedId) {
        return apiFetch<VoucherDetail>(`/api/admin/vouchers/${savedId}`, { method: "PUT", body });
      }
      return apiFetch<VoucherDetail>(cfg.createUrl, { method: "POST", body });
    },
    onSuccess: (v) => {
      setError(null);
      setSavedId(v.id);
      setVoucherNo(v.voucher_no);
      setStatus(v.status);
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      qc.invalidateQueries({ queryKey: ["voucher", v.id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  // ── Post JE
  const postMut = useMutation({
    mutationFn: async () => {
      if (!savedId) throw new Error("Save the draft before posting");
      return apiFetch<VoucherDetail>(`/api/admin/vouchers/${savedId}/post`, { method: "POST" });
    },
    onSuccess: (v) => {
      setError(null);
      setStatus(v.status);
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      qc.invalidateQueries({ queryKey: ["voucher", v.id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const validDraft = !!date && rowsPayload().some(r => r.accountId && r.amount > 0);
  const canPost = !!savedId && status === "draft" && !!cashBankId && total > 0 && validDraft;

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => nav("/accounts?tab=vouchers")}
          className="h-10 w-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors flex-shrink-0 mt-0.5">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0", accent.iconBg)}>
          <cfg.Icon className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{cfg.title}</h1>
            <StatusBadge status={status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{cfg.subtitle}</p>
        </div>
        {voucherNo && (
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Voucher #</p>
            <p className="text-lg font-mono font-bold text-slate-900">{voucherNo}</p>
          </div>
        )}
      </div>

      {/* Posted lock banner */}
      {readOnly && (
        <div className="flex items-center gap-2.5 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
          <Lock className="h-4 w-4 text-slate-500 shrink-0" />
          <p className="text-xs text-slate-600">This voucher has been posted and is locked. It can no longer be edited.</p>
        </div>
      )}

      {/* Header card: date + cash/bank */}
      <div className="rounded-2xl border border-border bg-white shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</Label>
            <Input type="date" value={date} disabled={readOnly}
              onChange={e => setDate(e.target.value)} max={todayIso()} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {type === "receipt" ? "Received In (Cash / Bank)" : "Paid From (Cash / Bank)"}
            </Label>
            <select
              value={cashBankId} disabled={readOnly}
              onChange={e => setCashBankId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-white px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-60">
              <option value="">— Select account —</option>
              {cashBanks.map(b => (
                <option key={b.id} value={b.id}>{b.code} · {b.name}</option>
              ))}
            </select>
          </div>
        </div>

        {cashBanks.length === 0 && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 mt-3">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 leading-snug">
              <span className="font-semibold">No cash/bank accounts found</span>{" — "}
              <Link href="/accounts?tab=setup" className="underline hover:text-amber-900">set up a Cash or Bank account first</Link>.
            </div>
          </div>
        )}
      </div>

      {/* Account grid */}
      <div className="space-y-2">
        <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{cfg.rowLabel}</Label>
        <VoucherGrid rows={rows} accounts={rowAccounts} onChange={setRows} readOnly={readOnly} />
      </div>

      {/* Narration */}
      <div className="space-y-1.5">
        <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Narration</Label>
        <Textarea value={narration} disabled={readOnly}
          onChange={e => setNarration(e.target.value)}
          placeholder="Notes / description for this voucher…"
          className="text-sm min-h-[72px]" />
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{error}
        </p>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t border-border pt-4">
        {!readOnly && (
          <>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !validDraft}
              variant="outline"
              className="gap-1.5 h-9">
              {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {savedId ? "Update Draft" : "Save Draft"}
            </Button>
            <Button
              onClick={() => postMut.mutate()}
              disabled={postMut.isPending || !canPost}
              className={cn("gap-1.5 h-9 text-white", accent.btn)}>
              {postMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Post JE
            </Button>
            {!savedId && <span className="text-xs text-slate-400">Save a draft first, then post the journal entry.</span>}
          </>
        )}
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => nav("/accounts?tab=vouchers")} className="h-9 text-slate-600">
          {readOnly ? "Back to list" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "draft" | "posted" }) {
  return status === "posted" ? (
    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px] font-bold gap-1">
      <Check className="h-3 w-3" /> POSTED
    </Badge>
  ) : (
    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] font-bold">DRAFT</Badge>
  );
}
