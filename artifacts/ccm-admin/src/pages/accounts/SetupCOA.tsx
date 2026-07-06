import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Plus, Pencil, Trash2, Sparkles, CheckCircle2, X,
  TrendingUp, TrendingDown, Layers, CreditCard, Scale, AlertCircle,
  Lock, RefreshCw, ChevronRight, ChevronDown, Tag, BookOpen,
  FileText, BarChart3, ArrowUpRight, ArrowDownLeft, Minus,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

// ─── Types ────────────────────────────────────────────────────────────────────

type CoaType      = "asset" | "liability" | "equity" | "income" | "expense";
type CoaKind      = "group" | "ledger";
type NormalBal    = "dr" | "cr";
type SourceModule = "fee" | "bank" | "vendor" | "store" | "hr" | "student" | "employee";

interface CoaAccount {
  id:              string;
  code:            string;
  name:            string;
  type:            CoaType;
  kind:            CoaKind;
  normalBalance:   NormalBal;
  parentId:        string | null;
  description:     string | null;
  isActive:        boolean;
  sortOrder:       number;
  debitBalance:    number;
  creditBalance:   number;
  netBalance:      number;
  sourceModule:    SourceModule | null;
  isSystemAccount: boolean;
}

type TreeNode = CoaAccount & { children: TreeNode[]; depth: number; subCount: number; subtreeNet: number };

// ─── API helper ───────────────────────────────────────────────────────────────

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

// ─── Tree building ────────────────────────────────────────────────────────────

function buildTree(accounts: CoaAccount[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  accounts.forEach(a => map.set(a.id, { ...a, children: [], depth: 0, subCount: 0, subtreeNet: a.netBalance }));

  const roots: TreeNode[] = [];
  accounts.forEach(a => {
    const node = map.get(a.id)!;
    if (a.parentId && map.has(a.parentId)) {
      map.get(a.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  function assignDepthAndCount(nodes: TreeNode[], depth: number) {
    nodes.sort((a, b) => a.code.localeCompare(b.code));
    for (const n of nodes) {
      n.depth    = depth;
      n.subCount = n.children.length;
      assignDepthAndCount(n.children, depth + 1);
      if (n.kind === "group") {
        n.subtreeNet = n.children.reduce((s, c) => s + c.subtreeNet, 0);
      }
    }
    return nodes;
  }

  return assignDepthAndCount(roots, 0);
}

function isSubLedgerModule(m: string | null): boolean {
  return m === "student" || m === "employee";
}

function flattenTree(nodes: TreeNode[], expanded: Set<string>): TreeNode[] {
  const result: TreeNode[] = [];
  function walk(list: TreeNode[]) {
    for (const n of list) {
      result.push(n);
      if (expanded.has(n.id) && n.children.length > 0) {
        // student/employee children are rendered as a paginated SubLedgerGroup —
        // don't push them into the flat list as individual rows.
        const hasSubLedger = n.children.some(c => isSubLedgerModule(c.sourceModule));
        if (!hasSubLedger) {
          walk(n.children);
        }
      }
    }
  }
  walk(nodes);
  return result;
}

// ─── Type metadata ────────────────────────────────────────────────────────────

const TYPE_ORDER: CoaType[] = ["asset", "liability", "equity", "income", "expense"];

const TYPE_META: Record<CoaType, {
  label: string; color: string; bg: string; border: string;
  badgeBg: string; badgeText: string; Icon: React.ElementType;
}> = {
  asset:     { label: "Asset",      color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200",    badgeBg: "bg-blue-100",    badgeText: "text-blue-700",    Icon: Layers     },
  liability: { label: "Liability",  color: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200",    badgeBg: "bg-rose-100",    badgeText: "text-rose-700",    Icon: CreditCard },
  equity:    { label: "Equity",     color: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200",  badgeBg: "bg-violet-100",  badgeText: "text-violet-700",  Icon: Scale      },
  income:    { label: "Income",     color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", badgeBg: "bg-emerald-100", badgeText: "text-emerald-700", Icon: TrendingUp },
  expense:   { label: "Expense",    color: "text-orange-700",  bg: "bg-orange-50",  border: "border-orange-200",  badgeBg: "bg-orange-100",  badgeText: "text-orange-700",  Icon: TrendingDown },
};

const MODULE_META: Record<SourceModule, { label: string; bg: string; text: string }> = {
  fee:      { label: "Fee",          bg: "bg-emerald-100", text: "text-emerald-700" },
  bank:     { label: "Cash & Bank",  bg: "bg-sky-100",     text: "text-sky-700"     },
  vendor:   { label: "Vendor AP",    bg: "bg-rose-100",    text: "text-rose-700"    },
  store:    { label: "Inventory",    bg: "bg-orange-100",  text: "text-orange-700"  },
  hr:       { label: "HR",           bg: "bg-violet-100",  text: "text-violet-700"  },
  student:  { label: "Student",      bg: "bg-indigo-100",  text: "text-indigo-700"  },
  employee: { label: "Staff",        bg: "bg-teal-100",    text: "text-teal-700"    },
};

// ─── Balance helpers ──────────────────────────────────────────────────────────

function balStr(net: number) {
  if (net === 0) return null;
  return `${Math.abs(net).toLocaleString("en-PK")} ${net > 0 ? "Dr" : "Cr"}`;
}

// ─── Stats card ───────────────────────────────────────────────────────────────

function StatsCard({ type, accounts }: { type: CoaType; accounts: CoaAccount[] }) {
  const meta  = TYPE_META[type];
  const cnt   = accounts.length;
  const net   = accounts.reduce((s, a) => s + a.netBalance, 0);
  const bal   = balStr(net);
  return (
    <div className={cn("rounded-xl border px-4 py-3 flex flex-col gap-1.5 min-w-0", meta.bg, meta.border)}>
      <div className="flex items-center gap-1.5">
        <meta.Icon className={cn("h-3.5 w-3.5 flex-shrink-0", meta.color)} />
        <span className={cn("text-[11px] font-bold uppercase tracking-wider truncate", meta.color)}>{meta.label}s</span>
      </div>
      <p className="text-xs text-slate-500">{cnt} account{cnt !== 1 ? "s" : ""}</p>
      {bal && <p className={cn("text-sm font-bold font-mono", net > 0 ? "text-blue-700" : "text-rose-700")}>{bal}</p>}
    </div>
  );
}

// ─── Ledger slide-over ────────────────────────────────────────────────────────

interface LedgerLine {
  jeId:           string;
  date:           string;
  narration:      string | null;
  sourceModule:   string | null;
  drAmount:       number;
  crAmount:       number;
  memo:           string | null;
  runningBalance: number;
}

interface LedgerResponse {
  account:     CoaAccount;
  total:       number;
  page:        number;
  pageSize:    number;
  debitTotal:  number;
  creditTotal: number;
  netBalance:  number;
  lines:       LedgerLine[];
}

function LedgerSlideOver({ accountId, onClose }: { accountId: string | null; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const open = !!accountId;

  const { data, isLoading } = useQuery<LedgerResponse>({
    queryKey: ["coa-ledger", accountId, page],
    queryFn:  () => apiFetch<LedgerResponse>(`/api/admin/coa/ledger/${accountId}?page=${page}&pageSize=50`),
    enabled:  !!accountId,
  });

  useEffect(() => { if (!open) setPage(1); }, [open]);

  const lines    = data?.lines ?? [];
  const total    = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 50;
  const pages    = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-3xl flex flex-col gap-0 p-0 overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-600" />
            {data?.account ? `${data.account.code} — ${data.account.name}` : "Account Ledger"}
          </SheetTitle>
          {data && (
            <div className="flex flex-wrap gap-4 text-sm text-slate-500 mt-1">
              <span className="flex items-center gap-1">
                <ArrowUpRight className="h-3.5 w-3.5 text-blue-500" />
                Dr {data.debitTotal.toLocaleString("en-PK")}
              </span>
              <span className="flex items-center gap-1">
                <ArrowDownLeft className="h-3.5 w-3.5 text-rose-500" />
                Cr {data.creditTotal.toLocaleString("en-PK")}
              </span>
              <span className={cn("flex items-center gap-1 font-semibold",
                data.netBalance > 0 ? "text-blue-700" : data.netBalance < 0 ? "text-rose-700" : "text-slate-500")}>
                <Minus className="h-3 w-3" />
                Net {Math.abs(data.netBalance).toLocaleString("en-PK")} {data.netBalance >= 0 ? "Dr" : "Cr"}
              </span>
              <span className="ml-auto text-slate-400 text-xs">{total} transactions</span>
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <FileText className="h-10 w-10 mb-3 text-slate-200" />
              <p className="text-sm">No transactions posted to this account yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-[90px]">Date</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Narration</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-[100px]">Debit</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-[100px]">Credit</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-[120px]">Balance</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={`${l.jeId}-${i}`} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{l.date}</td>
                    <td className="px-4 py-2.5">
                      <div className="text-slate-800 leading-snug">{l.narration ?? "—"}</div>
                      {l.memo && <div className="text-xs text-slate-400">{l.memo}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-blue-700">
                      {l.drAmount > 0 ? l.drAmount.toLocaleString("en-PK") : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-rose-600">
                      {l.crAmount > 0 ? l.crAmount.toLocaleString("en-PK") : ""}
                    </td>
                    <td className={cn(
                      "px-4 py-2.5 text-right font-mono font-semibold",
                      l.runningBalance > 0 ? "text-blue-700" : l.runningBalance < 0 ? "text-rose-700" : "text-slate-400"
                    )}>
                      {l.runningBalance !== 0
                        ? `${Math.abs(l.runningBalance).toLocaleString("en-PK")} ${l.runningBalance > 0 ? "Dr" : "Cr"}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50 flex-shrink-0">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 text-xs">Prev</Button>
            <span className="text-xs text-slate-500">Page {page} of {pages}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="h-8 text-xs">Next</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Trial balance ────────────────────────────────────────────────────────────

function TrialBalance({ accounts }: { accounts: CoaAccount[] }) {
  const ledger = accounts.filter(a => a.kind === "ledger" && (a.debitBalance !== 0 || a.creditBalance !== 0));
  const totalDr  = ledger.reduce((s, a) => s + a.debitBalance, 0);
  const totalCr  = ledger.reduce((s, a) => s + a.creditBalance, 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01;

  if (ledger.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <BarChart3 className="h-10 w-10 mb-3 text-slate-200" />
        <p className="text-sm">No posted journal entries yet.</p>
        <p className="text-xs mt-1 text-slate-300">Post vouchers to see live balances here.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
      <div className="flex items-center bg-slate-50 border-b border-border px-4 py-2.5">
        <div className="flex-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Account</div>
        <div className="w-[140px] text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Debit</div>
        <div className="w-[140px] text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Credit</div>
      </div>
      {ledger.map(a => (
        <div key={a.id} className="flex items-center border-b border-slate-100 last:border-0 hover:bg-slate-50/50 min-h-[40px] px-4">
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs text-indigo-600 font-semibold flex-shrink-0">{a.code}</span>
            <span className="text-sm text-slate-700 truncate">{a.name}</span>
          </div>
          <div className="w-[140px] text-right font-mono text-sm text-blue-700">
            {a.debitBalance > 0 ? a.debitBalance.toLocaleString("en-PK") : ""}
          </div>
          <div className="w-[140px] text-right font-mono text-sm text-rose-600">
            {a.creditBalance > 0 ? a.creditBalance.toLocaleString("en-PK") : ""}
          </div>
        </div>
      ))}
      <div className={cn(
        "flex items-center px-4 py-3 border-t-2",
        balanced ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"
      )}>
        <div className="flex-1 flex items-center gap-2">
          {balanced
            ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            : <AlertCircle  className="h-4 w-4 text-red-600" />}
          <span className={cn("text-sm font-semibold", balanced ? "text-emerald-700" : "text-red-700")}>
            {balanced ? "Balanced" : "Out of balance"}
          </span>
        </div>
        <div className="w-[140px] text-right font-mono font-bold text-slate-800">{totalDr.toLocaleString("en-PK")}</div>
        <div className="w-[140px] text-right font-mono font-bold text-slate-800">{totalCr.toLocaleString("en-PK")}</div>
      </div>
    </div>
  );
}

// ─── Sub-ledger group (student / employee drill-down) ─────────────────────────
// Renders the children of a student/employee group as a paginated, searchable
// compact table instead of individual TreeRow items.

function SubLedgerGroup({
  accounts,
  onLedger,
}: {
  accounts: TreeNode[];
  onLedger?: (n: TreeNode) => void;
}) {
  const [q, setQ]       = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return accounts;
    return accounts.filter(a =>
      a.name.toLowerCase().includes(ql) || a.code.toLowerCase().includes(ql)
    );
  }, [accounts, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [q]);

  return (
    <div className="bg-slate-50/60 border-b border-slate-100">
      {/* search bar — only when list is long enough to need filtering */}
      {accounts.length > PAGE_SIZE && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-100 bg-white/70">
          <Search className="h-3 w-3 text-slate-400 flex-shrink-0" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by name or code…"
            className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder-slate-400"
          />
          {q && (
            <button onClick={() => setQ("")} className="text-slate-400 hover:text-slate-600">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {slice.length === 0 ? (
        <div className="px-8 py-3 text-xs text-slate-400 italic">No accounts match your search.</div>
      ) : (
        slice.map(n => {
          const b = balStr(n.netBalance);
          return (
            <div
              key={n.id}
              className="flex items-center border-b border-slate-100/70 last:border-0 hover:bg-indigo-50/30 transition-colors min-h-[34px] px-4 gap-2"
              style={{ paddingLeft: `${(n.depth * 24) + 12}px` }}
            >
              <span className="w-[76px] pr-2 font-mono text-[11px] font-semibold text-slate-400 flex-shrink-0 truncate">
                {n.code}
              </span>
              <span className="flex-1 text-xs text-slate-700 truncate">{n.name}</span>
              {b ? (
                <span className={cn("text-[11px] font-mono font-semibold flex-shrink-0", n.netBalance > 0 ? "text-blue-600" : "text-rose-600")}>
                  {b}
                </span>
              ) : (
                <span className="text-[11px] text-slate-300 flex-shrink-0">—</span>
              )}
              {onLedger && (
                <button
                  title="View ledger"
                  onClick={() => onLedger(n)}
                  className="h-5 w-5 flex items-center justify-center rounded text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors flex-shrink-0"
                >
                  <FileText className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-slate-100 bg-white/50">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="text-[11px] text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-[11px] text-slate-400">
            {filtered.length} accounts · Page {page} of {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => setPage(p => p + 1)}
            className="text-[11px] text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tree row ─────────────────────────────────────────────────────────────────

function TreeRow({
  node,
  isExpanded,
  onToggle,
  onAddChild,
  onEdit,
  onDelete,
  onLedger,
}: {
  node:       TreeNode;
  isExpanded: boolean;
  onToggle:   () => void;
  onAddChild: (n: TreeNode) => void;
  onEdit:     (n: TreeNode) => void;
  onDelete:   (n: TreeNode) => void;
  onLedger?:  (n: TreeNode) => void;
}) {
  const meta          = TYPE_META[node.type];
  const isGroup       = node.kind === "group";
  const isSourceLinked = !!node.sourceModule;
  const isLocked      = node.isSystemAccount || isSourceLinked;
  const lockTitle     = node.isSystemAccount
    ? "System-managed — cannot edit"
    : isSourceLinked
      ? `Managed by ${MODULE_META[node.sourceModule!]?.label ?? node.sourceModule} — edit from that module`
      : "Edit";
  const indent        = node.depth * 24;

  return (
    <div className="flex items-center border-b border-slate-100 last:border-0 group hover:bg-slate-50/60 transition-colors min-h-[44px]">

      {/* Indent + chevron toggle */}
      <div className="flex items-center flex-shrink-0" style={{ paddingLeft: `${8 + indent}px`, width: `${48 + indent}px` }}>
        {isGroup && node.subCount > 0 ? (
          <button
            onClick={onToggle}
            className="h-5 w-5 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors flex-shrink-0">
            {isExpanded
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : isGroup ? (
          <button
            onClick={onToggle}
            className="h-5 w-5 flex items-center justify-center rounded text-slate-300 hover:text-slate-400 hover:bg-slate-100 transition-colors flex-shrink-0">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="h-5 w-5 flex-shrink-0" />
        )}
      </div>

      {/* Code */}
      <div className="flex-shrink-0 w-[80px] pr-3">
        <span className={cn("font-mono text-[13px] font-semibold text-indigo-600 cursor-pointer hover:text-indigo-800 hover:underline")}
          onClick={() => !isLocked && onEdit(node)}>
          {node.code}
        </span>
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0 pr-3 py-2.5">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className={cn("text-sm leading-snug truncate", isGroup ? "font-semibold text-slate-800" : "text-slate-700")}>
            {node.name}
          </span>
          {node.description && (
            <span className="text-xs text-slate-400 truncate hidden sm:inline">— {node.description}</span>
          )}
        </div>
      </div>

      {/* Tags strip */}
      <div className="flex items-center gap-1 flex-shrink-0 pr-3 flex-wrap justify-end">
        {/* Module badge */}
        {node.sourceModule && (() => {
          const mm = MODULE_META[node.sourceModule];
          return (
            <span className={cn("inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap", mm.bg, mm.text)}>
              {mm.label}
            </span>
          );
        })()}

        {/* Kind badge */}
        {isGroup ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 whitespace-nowrap">
            <Layers className="h-2.5 w-2.5" />Group
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
            <Tag className="h-2.5 w-2.5" />Ledger
          </span>
        )}

        {/* Account head badge */}
        <span className={cn("inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap", meta.badgeBg, meta.badgeText)}>
          {meta.label}
        </span>

        {/* Normal balance */}
        <span className="text-[10px] font-mono font-bold text-slate-500 px-0.5">
          {node.normalBalance.toUpperCase()}
        </span>

        {/* Sub-count (groups only) */}
        {isGroup && (
          <span className="text-[10px] text-slate-400 whitespace-nowrap pl-0.5">
            {node.subCount} sub
          </span>
        )}

        {/* Balance indicator — hidden when zero */}
        {(() => {
          const displayNet = isGroup ? node.subtreeNet : node.netBalance;
          const b = balStr(displayNet);
          if (!b) return null;
          return (
            <span className={cn(
              "inline-flex items-center text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap",
              displayNet > 0
                ? "bg-blue-50 text-blue-700"
                : "bg-rose-50 text-rose-700"
            )}>
              {b}
            </span>
          );
        })()}
      </div>

      {/* Hover actions */}
      <div className="flex items-center gap-0.5 flex-shrink-0 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isGroup && onLedger && (
          <button title="View ledger" onClick={() => onLedger(node)}
            className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
            <FileText className="h-3.5 w-3.5" />
          </button>
        )}
        {isGroup && (
          <button title="Add sub-account" onClick={() => onAddChild(node)}
            className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          title={lockTitle}
          disabled={isLocked}
          onClick={() => !isLocked && onEdit(node)}
          className={cn(
            "h-6 w-6 flex items-center justify-center rounded transition-colors",
            isLocked ? "text-slate-200 cursor-not-allowed" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          )}>
          {isLocked ? <Lock className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
        </button>
        {!isLocked && (
          <button title="Delete" onClick={() => onDelete(node)}
            className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Auto-numbering helper ────────────────────────────────────────────────────

function computeNextCode(parentId: string, accounts: CoaAccount[], offset: number): string {
  if (!parentId) return "";
  const par = accounts.find(a => a.id === parentId);
  if (!par) return "";
  const children = accounts.filter(a => a.parentId === parentId);
  const parNum = parseInt(par.code, 10);
  if (isNaN(parNum)) return "";
  let max = parNum;
  for (const c of children) {
    const n = parseInt(c.code, 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return String(max + 1 + offset);
}

// ─── Ledger row type ──────────────────────────────────────────────────────────

type LedgerRow = { id: string; code: string; name: string; codeOverridden: boolean };

// ─── Create / Edit modal ──────────────────────────────────────────────────────

interface ModalProps {
  mode:     "add" | "edit";
  account?: CoaAccount;
  parentId?: string | null;
  parentType?: CoaType;
  accounts: CoaAccount[];
  onSave:   (data: any) => void;
  onClose:  () => void;
  loading:  boolean;
  error:    string | null;
}

function normalBalFromType(t: CoaType): NormalBal {
  return (["liability", "equity", "income"] as CoaType[]).includes(t) ? "cr" : "dr";
}

function AccountModal({ mode, account, parentId, parentType, accounts, onSave, onClose, loading, error }: ModalProps) {
  const isEdit = mode === "edit";

  const initType = account?.type ?? parentType ?? "asset";
  const [kind,   setKind]   = useState<CoaKind>(account?.kind ?? "group");
  const [type,   setType]   = useState<CoaType>(initType as CoaType);
  const [parent, setParent] = useState<string>(account?.parentId ?? parentId ?? "");

  // Group / edit fields
  const [code,      setCode]     = useState(account?.code ?? "");
  const [name,      setName]     = useState(account?.name ?? "");
  const [desc,      setDesc]     = useState(account?.description ?? "");
  const [normBal,   setNormBal]  = useState<NormalBal>(
    account?.normalBalance as NormalBal ?? normalBalFromType(initType as CoaType)
  );
  const [codeManuallySet, setCodeManuallySet] = useState(false);

  // Ledger rows (create mode, kind=ledger)
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([
    { id: crypto.randomUUID(), code: "", name: "", codeOverridden: false },
  ]);

  // Edit mode: new sub-accounts to add under a group
  const [editEntries, setEditEntries] = useState<Array<{ id: string; code: string; name: string }>>([]);

  // Existing children of the account being edited
  const existingChildren = useMemo(
    () => isEdit && account
      ? accounts.filter(a => a.parentId === account.id).sort((a, b) => a.code.localeCompare(b.code))
      : [],
    [accounts, account, isEdit]
  );

  function addEditEntry() {
    const offset = existingChildren.length + editEntries.length;
    setEditEntries(prev => [...prev, { id: crypto.randomUUID(), code: computeNextCode(account?.id ?? "", accounts, offset), name: "" }]);
  }
  function removeEditEntry(id: string) {
    setEditEntries(prev => {
      const next = prev.filter(e => e.id !== id);
      return next.map((e, i) => ({ ...e, code: computeNextCode(account?.id ?? "", accounts, existingChildren.length + i) }));
    });
  }
  function updateEditEntry(id: string, field: "code" | "name", value: string) {
    setEditEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  }

  // Auto-suggest code for group create when parent changes
  const suggestedGroupCode = useMemo(
    () => computeNextCode(parent, accounts, 0),
    [parent, accounts]
  );

  // Apply group code suggestion when parent changes (if not manually overridden)
  useEffect(() => {
    if (!isEdit && kind === "group" && !codeManuallySet) {
      setCode(suggestedGroupCode);
    }
  }, [suggestedGroupCode, kind, isEdit, codeManuallySet]);

  // Recompute non-overridden ledger row codes when parent changes
  useEffect(() => {
    if (!isEdit && kind === "ledger") {
      setLedgerRows(rows =>
        rows.map((row, i) =>
          row.codeOverridden ? row : { ...row, code: computeNextCode(parent, accounts, i) }
        )
      );
    }
  }, [parent, isEdit, kind, accounts]);

  // Auto-derive normal balance from type in create mode
  useEffect(() => {
    if (!isEdit) setNormBal(normalBalFromType(type));
  }, [type, isEdit]);

  // Reset rows/code when switching kind in create mode
  const prevKindRef = useRef(kind);
  useEffect(() => {
    if (isEdit || kind === prevKindRef.current) return;
    prevKindRef.current = kind;
    setCodeManuallySet(false);
    if (kind === "group") {
      setCode(computeNextCode(parent, accounts, 0));
    } else {
      setLedgerRows([
        { id: crypto.randomUUID(), code: computeNextCode(parent, accounts, 0), name: "", codeOverridden: false },
      ]);
    }
  }, [kind, isEdit, parent, accounts]);

  const parentGroups = useMemo(
    () => accounts
      .filter(a => a.type === type && a.kind === "group" && a.id !== account?.id)
      .sort((a, b) => a.code.localeCompare(b.code)),
    [accounts, type, account?.id]
  );

  // Ledger row helpers
  function addLedgerRow() {
    const offset = ledgerRows.length;
    setLedgerRows(rows => [
      ...rows,
      { id: crypto.randomUUID(), code: computeNextCode(parent, accounts, offset), name: "", codeOverridden: false },
    ]);
  }

  function removeLedgerRow(id: string) {
    setLedgerRows(rows => {
      if (rows.length <= 1) return rows;
      const next = rows.filter(r => r.id !== id);
      return next.map((row, i) =>
        row.codeOverridden ? row : { ...row, code: computeNextCode(parent, accounts, i) }
      );
    });
  }

  function updateLedgerRowCode(id: string, value: string) {
    setLedgerRows(rows => rows.map(r => r.id === id ? { ...r, code: value, codeOverridden: true } : r));
  }

  function updateLedgerRowName(id: string, value: string) {
    setLedgerRows(rows => rows.map(r => r.id === id ? { ...r, name: value } : r));
  }

  const filledLedgerRows = ledgerRows.filter(r => r.name.trim());

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (isEdit) return !!(code.trim() && name.trim());
    if (kind === "group") return !!(code.trim() && name.trim());
    // Ledger create: must have a parent selected and at least one named row
    return !!parent && filledLedgerRows.length > 0;
  }, [loading, isEdit, kind, code, name, parent, filledLedgerRows.length]);

  function submit() {
    if (!canSubmit) return;

    if (isEdit) {
      const filledEditEntries = editEntries.filter(e => e.name.trim());
      onSave({
        code:          code.trim(),
        name:          name.trim(),
        description:   desc.trim() || null,
        kind,
        normalBalance: normBal,
        ...(filledEditEntries.length > 0 ? {
          entries: filledEditEntries.map(e => ({ code: e.code.trim(), name: e.name.trim() })),
        } : {}),
      });
      return;
    }

    if (kind === "group") {
      onSave({
        code:          code.trim(),
        name:          name.trim(),
        description:   desc.trim() || null,
        type,
        kind:          "group" as CoaKind,
        normalBalance: normBal,
        parentId:      parent || null,
        entries:       [],
      });
      return;
    }

    // Ledger batch create
    onSave({
      _batch:   true,
      parentId: parent || null,
      accounts: filledLedgerRows.map(r => ({
        code:          r.code.trim(),
        name:          r.name.trim(),
        type,
        kind:          "ledger" as CoaKind,
        normalBalance: normBal,
        parentId:      parent || null,
      })),
    });
  }

  const typeMeta = TYPE_META[type];
  const saveLabel = loading
    ? "Saving…"
    : isEdit
      ? "Save Changes"
      : kind === "ledger"
        ? `Create ${filledLedgerRows.length > 1 ? `${filledLedgerRows.length} Accounts` : "Account"}`
        : "Save";

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[600px] p-0 gap-0 overflow-hidden rounded-2xl">

        {/* Modal header — green */}
        <div className="bg-emerald-600 px-6 py-4 flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-lg leading-snug">
              {isEdit ? "Edit Account" : "Create Account"}
            </h2>
            <p className="text-emerald-100 text-sm mt-0.5">
              {kind === "group" ? "Group — can hold sub-accounts" : "Ledger — final posting account"}
              {" · "}{typeMeta.label}
            </p>
          </div>
          <button onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Single-screen body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[70vh]">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{error}
            </p>
          )}

          {/* ACCOUNT KIND (create only) */}
          {!isEdit && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Account Kind <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                {(["group", "ledger"] as CoaKind[]).map(k => (
                  <button key={k} type="button" onClick={() => setKind(k)}
                    className={cn(
                      "relative flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all",
                      kind === k
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    )}>
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
                      kind === k ? "bg-emerald-100" : "bg-slate-100"
                    )}>
                      {k === "group"
                        ? <Layers className={cn("h-4 w-4", kind === k ? "text-emerald-700" : "text-slate-500")} />
                        : <Tag    className={cn("h-4 w-4", kind === k ? "text-emerald-700" : "text-slate-500")} />}
                    </div>
                    <div>
                      <p className={cn("font-semibold text-sm", kind === k ? "text-emerald-900" : "text-slate-700")}>
                        {k === "group" ? "Group" : "Ledger"}
                      </p>
                      <p className={cn("text-xs mt-0.5", kind === k ? "text-emerald-700" : "text-slate-400")}>
                        {k === "group" ? "Can have sub-accounts" : "Final ledger entry"}
                      </p>
                    </div>
                    {kind === k && (
                      <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
                        <CheckCircle2 className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ACCOUNT HEAD (create only) */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Account Head <span className="text-red-500">*</span>
              </Label>
              <Select value={type} onValueChange={v => { setType(v as CoaType); setParent(""); }}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_ORDER.map(t => (
                    <SelectItem key={t} value={t}>
                      <span className={cn("font-medium", TYPE_META[t].color)}>{TYPE_META[t].label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* PARENT GROUP (create only) */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Account Group{" "}
                <span className="text-slate-400 font-normal normal-case">(parent)</span>
                {kind === "ledger" && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <Select value={parent || "__none__"} onValueChange={v => { setParent(v === "__none__" ? "" : v); setCodeManuallySet(false); }}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="— Top-level (no parent) —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Top-level (no parent) —</SelectItem>
                  {parentGroups.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-mono text-[11px] text-slate-400 mr-2">{a.code}</span>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* GROUP CREATE — Code + Name + Description */}
          {!isEdit && kind === "group" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Code <span className="text-red-500">*</span>
                    {suggestedGroupCode && !codeManuallySet && (
                      <span className="ml-1.5 text-emerald-600 font-normal normal-case text-[10px]">auto</span>
                    )}
                  </Label>
                  <Input
                    value={code}
                    onChange={e => { setCode(e.target.value); setCodeManuallySet(true); }}
                    className="h-10 font-mono"
                    placeholder="e.g. 1110"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Account Name <span className="text-red-500">*</span>
                  </Label>
                  <Input value={name} onChange={e => setName(e.target.value)}
                    className="h-10" placeholder="e.g. Current Account" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Description <span className="text-slate-400 font-normal normal-case">(optional)</span>
                </Label>
                <textarea
                  value={desc} onChange={e => setDesc(e.target.value)} rows={2}
                  placeholder="Brief description…"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-colors"
                />
              </div>
            </>
          )}

          {/* LEDGER CREATE — inline row list */}
          {!isEdit && kind === "ledger" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Accounts to Create
                </Label>
                <span className="text-xs text-slate-400">
                  {ledgerRows.length} {ledgerRows.length === 1 ? "row" : "rows"}
                </span>
              </div>

              {/* Column headers */}
              <div
                className="grid text-[10px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-200 pb-1.5"
                style={{ gridTemplateColumns: "120px 1fr 28px" }}>
                <span>Code</span>
                <span>Account Name <span className="text-red-500">*</span></span>
                <span />
              </div>

              <div className="space-y-2">
                {ledgerRows.map((row, idx) => (
                  <div key={row.id} className="grid gap-2 items-center"
                    style={{ gridTemplateColumns: "120px 1fr 28px" }}>
                    <div className="relative">
                      <Input
                        value={row.code}
                        onChange={e => updateLedgerRowCode(row.id, e.target.value)}
                        className="h-9 font-mono text-sm pr-8"
                        placeholder={parent ? "auto" : "code"}
                      />
                      {!row.codeOverridden && row.code && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-emerald-500 font-semibold pointer-events-none">
                          auto
                        </span>
                      )}
                    </div>
                    <Input
                      value={row.name}
                      onChange={e => updateLedgerRowName(row.id, e.target.value)}
                      className="h-9 text-sm"
                      placeholder="e.g. Cash in Hand"
                      autoFocus={idx === 0}
                    />
                    <button
                      onClick={() => removeLedgerRow(row.id)}
                      disabled={ledgerRows.length <= 1}
                      className="h-7 w-7 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={addLedgerRow}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-700 border border-dashed border-slate-300 hover:border-emerald-400 rounded-xl w-full py-2.5 justify-center transition-colors">
                <Plus className="h-3.5 w-3.5" />Add Account
              </button>

              {!parent && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  Select a parent group above to enable auto-numbering
                </p>
              )}
            </div>
          )}

          {/* EDIT MODE — Code + Name + Description + NormalBal */}
          {isEdit && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Code <span className="text-red-500">*</span>
                  </Label>
                  <Input value={code} onChange={e => setCode(e.target.value)}
                    className="h-10 font-mono" placeholder="e.g. 1110" autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Account Name <span className="text-red-500">*</span>
                  </Label>
                  <Input value={name} onChange={e => setName(e.target.value)}
                    className="h-10" placeholder="e.g. Cash in Hand" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Description <span className="text-slate-400 font-normal normal-case">(optional)</span>
                </Label>
                <textarea
                  value={desc} onChange={e => setDesc(e.target.value)} rows={2}
                  placeholder="Brief description…"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Normal Balance
                </Label>
                <Select value={normBal} onValueChange={v => setNormBal(v as NormalBal)}>
                  <SelectTrigger className="h-10 w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dr">Dr (Debit-normal)</SelectItem>
                    <SelectItem value="cr">Cr (Credit-normal)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Existing sub-accounts (group only) */}
              {kind === "group" && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Sub-Accounts {existingChildren.length > 0 && `(${existingChildren.length})`}
                  </Label>
                  {existingChildren.length > 0 ? (
                    <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                      {existingChildren.map(child => (
                        <div key={child.id} className="flex items-center gap-3 px-3 py-2 text-sm bg-slate-50">
                          <span className="font-mono text-xs text-slate-500 w-20 shrink-0">{child.code}</span>
                          <span className="text-slate-700 truncate flex-1">{child.name}</span>
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            child.kind === "ledger" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"
                          )}>{child.kind}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No sub-accounts yet.</p>
                  )}

                  {/* Add new sub-accounts */}
                  {editEntries.length > 0 && (
                    <div className="space-y-1.5 mt-1">
                      {editEntries.map(entry => (
                        <div key={entry.id} className="flex items-center gap-2">
                          <Input
                            value={entry.code} onChange={e => updateEditEntry(entry.id, "code", e.target.value)}
                            className="h-8 font-mono w-24 text-xs shrink-0" placeholder="Code" />
                          <Input
                            value={entry.name} onChange={e => updateEditEntry(entry.id, "name", e.target.value)}
                            className="h-8 text-xs flex-1" placeholder="Account name" />
                          <button onClick={() => removeEditEntry(entry.id)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={addEditEntry}
                    className="flex items-center gap-2 text-xs text-slate-500 hover:text-emerald-700 border border-dashed border-slate-300 hover:border-emerald-400 rounded-xl w-full py-2 justify-center transition-colors mt-1">
                    <Plus className="h-3 w-3" />Add Sub-Account
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3 bg-slate-50">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {saveLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ModalState {
  mode:       "add" | "edit";
  account?:   CoaAccount;
  parentId?:  string | null;
  parentType?: CoaType;
}

export function SetupCOA() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search,       setSearch]       = useState("");
  const [filterType,   setFilterType]   = useState<CoaType | "all">("all");
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set());
  const initializedRef                  = useRef(false);
  const [modal,        setModal]        = useState<ModalState | null>(null);
  const [modalError,   setModalError]   = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CoaAccount | null>(null);
  const [seedConfirm,  setSeedConfirm]  = useState(false);
  const [seedResult,   setSeedResult]   = useState<string | null>(null);
  const [syncResult,   setSyncResult]   = useState<string | null>(null);
  const [ledgerAccount, setLedgerAccount] = useState<CoaAccount | null>(null);

  // ── Data fetch ─────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery<CoaAccount[]>({
    queryKey: ["coa"],
    queryFn:  () => apiFetch<CoaAccount[]>("/api/admin/coa"),
    staleTime: 30_000,
  });
  const accounts = data ?? [];

  // ── Tree + initial expansion ───────────────────────────────────────────────

  const tree = useMemo(() => {
    return buildTree(
      filterType === "all" ? accounts : accounts.filter(a => a.type === filterType)
    );
  }, [accounts, filterType]);

  // Expand root-level nodes once on first load
  useEffect(() => {
    if (!initializedRef.current && tree.length > 0) {
      initializedRef.current = true;
      setExpanded(new Set(tree.map(n => n.id)));
    }
  }, [tree.length]);

  // ── Search: flat filtered list ─────────────────────────────────────────────

  const q = search.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q) return [];
    return accounts.filter(a =>
      a.code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      (a.description?.toLowerCase().includes(q) ?? false)
    ).sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts, q]);

  const visibleTree = useMemo(() => flattenTree(tree, expanded), [tree, expanded]);

  // ── Toggle expand ──────────────────────────────────────────────────────────

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (body: any) => apiFetch("/api/admin/coa", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async (_data, variables) => {
      await qc.refetchQueries({ queryKey: ["coa"] });
      if (variables.parentId) {
        setExpanded(prev => {
          const next = new Set(prev);
          next.add(variables.parentId);
          return next;
        });
      }
      setModal(null);
      setModalError(null);
      toast({ title: "Account created", description: `${variables.name} has been added.` });
    },
    onError: (e: any) => {
      setModalError(e.message);
      toast({ variant: "destructive", title: "Failed to create account", description: e.message });
    },
  });

  const batchCreateMut = useMutation({
    mutationFn: (body: { accounts: any[]; parentId: string | null }) =>
      apiFetch<{ created: any[]; errors: string[] }>("/api/admin/coa/batch", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async (data, variables) => {
      await qc.refetchQueries({ queryKey: ["coa"] });
      if (variables.parentId) {
        setExpanded(prev => {
          const next = new Set(prev);
          next.add(variables.parentId!);
          return next;
        });
      }
      setModal(null);
      setModalError(null);
      const n = data.created.length;
      toast({
        title: `${n} account${n !== 1 ? "s" : ""} created`,
        description: data.errors.length > 0 ? `${data.errors.length} row(s) skipped.` : undefined,
      });
    },
    onError: (e: any) => {
      setModalError(e.message);
      toast({ variant: "destructive", title: "Failed to create accounts", description: e.message });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      apiFetch(`/api/admin/coa/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: async (_data, variables) => {
      await qc.refetchQueries({ queryKey: ["coa"] });
      setModal(null);
      setModalError(null);
      toast({ title: "Account updated", description: `${variables.body.name} has been saved.` });
    },
    onError: (e: any) => {
      setModalError(e.message);
      toast({ variant: "destructive", title: "Failed to update account", description: e.message });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/coa/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.refetchQueries({ queryKey: ["coa"] });
      setDeleteTarget(null);
      toast({ title: "Account deleted" });
    },
    onError: (e: any) => {
      setDeleteTarget(null);
      toast({ variant: "destructive", title: "Failed to delete account", description: e.message });
    },
  });

  const seedMut = useMutation<{ message: string; inserted: number; skipped: number }, Error, boolean>({
    mutationFn: (force: boolean) =>
      apiFetch<{ message: string; inserted: number; skipped: number }>("/api/admin/coa/seed", {
        method: "POST", body: JSON.stringify({ force }),
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["coa"] });
      setSeedConfirm(false);
      setSeedResult(r.message);
      setTimeout(() => setSeedResult(null), 7000);
    },
    onError: (e: any) => { setSeedConfirm(false); alert(e.message); },
  });

  const syncMut = useMutation<{ message: string }, Error, void>({
    mutationFn: () => apiFetch<{ message: string }>("/api/admin/coa/backfill-modules", { method: "POST" }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["coa"] });
      setSyncResult(r.message);
      setTimeout(() => setSyncResult(null), 9000);
    },
    onError: (e: any) => alert(e.message),
  });

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function openAddRoot() {
    setModalError(null);
    setModal({ mode: "add" });
  }

  function openAddChild(node: CoaAccount) {
    setModalError(null);
    setModal({ mode: "add", parentId: node.id, parentType: node.type });
  }

  function openEdit(acc: CoaAccount) {
    setModalError(null);
    setModal({ mode: "edit", account: acc });
  }

  function handleSave(data: any) {
    if (!modal) return;
    if (modal.mode === "add") {
      if (data._batch) {
        batchCreateMut.mutate({ accounts: data.accounts, parentId: data.parentId ?? null });
      } else {
        createMut.mutate(data);
      }
    } else if (modal.account) {
      updateMut.mutate({ id: modal.account.id, body: data });
    }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-5 gap-3">
          {[0,1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-10 rounded-xl" />
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-none border-t" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Stats cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-3">
        {TYPE_ORDER.map(t => (
          <StatsCard key={t} type={t} accounts={accounts.filter(a => a.type === t)} />
        ))}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search accounts…" className="h-9 pl-9 text-sm w-56" />
        </div>

        {/* Type filter pills */}
        <div className="flex gap-1">
          <button onClick={() => setFilterType("all")}
            className={cn("text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
              filterType === "all" ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700")}>
            All
          </button>
          {TYPE_ORDER.map(t => {
            const meta = TYPE_META[t];
            return (
              <button key={t} onClick={() => setFilterType(filterType === t ? "all" : t)}
                className={cn("text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                  filterType === t
                    ? cn(meta.bg, meta.border, meta.color, "font-semibold")
                    : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700")}>
                {meta.label}s
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline"
            disabled={syncMut.isPending}
            className="h-9 text-xs gap-1.5 text-teal-700 border-teal-200 hover:bg-teal-50"
            onClick={() => syncMut.mutate()}>
            <RefreshCw className={cn("h-3.5 w-3.5", syncMut.isPending && "animate-spin")} />
            {syncMut.isPending ? "Syncing…" : "Sync Modules"}
          </Button>
          <Button size="sm" variant="outline"
            className="h-9 text-xs gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50"
            onClick={() => setSeedConfirm(true)}>
            <Sparkles className="h-3.5 w-3.5" />
            Load Defaults
          </Button>
          <Button size="sm"
            className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={openAddRoot}>
            <Plus className="h-3.5 w-3.5" />
            New Account
          </Button>
        </div>
      </div>

      {/* Banners */}
      {seedResult && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
          <span>{seedResult}</span>
          <button onClick={() => setSeedResult(null)} className="ml-auto text-emerald-500 hover:text-emerald-700 text-xs underline">Dismiss</button>
        </div>
      )}
      {syncResult && (
        <div className="flex items-center gap-2.5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-teal-600" />
          <span>{syncResult}</span>
          <button onClick={() => setSyncResult(null)} className="ml-auto text-teal-500 hover:text-teal-700 text-xs underline">Dismiss</button>
        </div>
      )}

      {/* ── COA tree + Trial Balance tabs ─────────────────────────── */}
      <Tabs defaultValue="coa">
        <TabsList className="mb-3 h-9">
          <TabsTrigger value="coa" className="text-xs gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />Chart of Accounts
          </TabsTrigger>
          <TabsTrigger value="tb" className="text-xs gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />Trial Balance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tb">
          <TrialBalance accounts={accounts} />
        </TabsContent>

        <TabsContent value="coa">

      {/* ── Tree view ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">

        {/* Column header row */}
        <div className="flex items-center bg-slate-50 border-b border-border px-4 py-2">
          <div className="flex-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Account</div>
          <div className="flex-shrink-0 pr-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Kind · Head · Bal</div>
        </div>

        {/* Rows */}
        {q ? (
          searchResults.length === 0 ? (
            <div className="px-4 py-12 text-center text-slate-400">
              <Search className="h-7 w-7 mx-auto mb-2 text-slate-200" />
              No accounts match "{search}"
            </div>
          ) : (
            searchResults.map(account => {
              const node = { ...account, children: [], depth: 0, subCount: 0, subtreeNet: account.netBalance } as TreeNode;
              return (
                <TreeRow key={account.id} node={node}
                  isExpanded={false} onToggle={() => {}}
                  onAddChild={openAddChild} onEdit={openEdit} onDelete={setDeleteTarget}
                  onLedger={setLedgerAccount} />
              );
            })
          )
        ) : (
          visibleTree.length === 0 ? (
            <div className="px-4 py-14 text-center text-slate-400">
              <Layers className="h-8 w-8 mx-auto mb-2 text-slate-200" />
              No accounts yet. Click <strong>Load Defaults</strong> to seed the chart.
            </div>
          ) : (
            visibleTree.map(node => (
              <Fragment key={node.id}>
                <TreeRow node={node}
                  isExpanded={expanded.has(node.id)}
                  onToggle={() => toggleExpand(node.id)}
                  onAddChild={openAddChild} onEdit={openEdit} onDelete={setDeleteTarget}
                  onLedger={setLedgerAccount} />
                {expanded.has(node.id) &&
                  node.children.some(c => isSubLedgerModule(c.sourceModule)) && (
                  <SubLedgerGroup accounts={node.children} onLedger={setLedgerAccount} />
                )}
              </Fragment>
            ))
          )
        )}
      </div>

        </TabsContent>
      </Tabs>

      {/* ── Modal ────────────────────────────────────────────────────── */}
      {modal && (
        <AccountModal
          mode={modal.mode}
          account={modal.account}
          parentId={modal.parentId}
          parentType={modal.parentType}
          accounts={accounts}
          onSave={handleSave}
          onClose={() => setModal(null)}
          loading={createMut.isPending || updateMut.isPending || batchCreateMut.isPending}
          error={modalError}
        />
      )}

      {/* ── Delete confirm ───────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.code} — {deleteTarget?.name}</strong>?
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}>
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Seed confirm ─────────────────────────────────────────────── */}
      <Dialog open={seedConfirm} onOpenChange={setSeedConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Load Default Accounts</DialogTitle>
            <DialogDescription>
              Loads the standard CCM chart of accounts. Existing codes are skipped.
              Choose <strong>Force Reset</strong> to wipe and reload all defaults.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setSeedConfirm(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => seedMut.mutate(true)} disabled={seedMut.isPending}
              className="border-red-200 text-red-600 hover:bg-red-50">
              Force Reset
            </Button>
            <Button onClick={() => seedMut.mutate(false)} disabled={seedMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {seedMut.isPending ? "Loading…" : "Load Defaults"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Ledger slide-over ─────────────────────────────────────────── */}
      <LedgerSlideOver
        accountId={ledgerAccount?.id ?? null}
        onClose={() => setLedgerAccount(null)}
      />
    </div>
  );
}
