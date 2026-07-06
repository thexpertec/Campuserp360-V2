import { useState } from "react";
import { formatCurrency as _formatCurrency } from "@/lib/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, Clock, DollarSign, BookOpen, FileText, Briefcase, AlertCircle,
  RefreshCw, Filter, User, XCircle,
} from "lucide-react";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

const API = (import.meta.env.VITE_API_BASE as string) || "";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() ?? ""}`,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error ?? "Request failed"), { status: res.status });
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned non-JSON response (${res.status})`);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Module = "finance" | "fees" | "exams" | "payroll" | "admissions";

interface InboxItem {
  module:          Module;
  type:            string;
  id:              string;
  label:           string;
  amount?:         number;
  createdBy?:      string | null;
  createdByName?:  string | null;
  createdAt:       string;
  date?:           string | null;
  approveUrl:      string;
  rejectUrl?:      string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODULE_META: Record<Module, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  finance:    { label: "Finance",    icon: FileText,    color: "text-indigo-700", bg: "bg-indigo-50"  },
  fees:       { label: "Fees",       icon: DollarSign,  color: "text-green-700",  bg: "bg-green-50"   },
  exams:      { label: "Exams",      icon: BookOpen,    color: "text-purple-700", bg: "bg-purple-50"  },
  payroll:    { label: "Payroll",    icon: Briefcase,   color: "text-pink-700",   bg: "bg-pink-50"    },
  admissions: { label: "Admissions", icon: User,        color: "text-orange-700", bg: "bg-orange-50"  },
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1)  return `${Math.floor(diff / 60_000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatCurrency(n?: number) {
  if (n == null) return null;
  return _formatCurrency(n);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ApprovalsInbox() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeModule, setActiveModule] = useState<Module | "all">("all");
  const [approvingId, setApprovingId]   = useState<string | null>(null);
  const [rejectingId, setRejectingId]   = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<{ items: InboxItem[]; total: number }>({
    queryKey: ["approvals-inbox"],
    queryFn:  () => apiFetch("/api/admin/approvals/inbox"),
    refetchInterval: 30_000,
  });

  const items   = data?.items ?? [];
  const visible = activeModule === "all" ? items : items.filter((i) => i.module === activeModule);

  const counts: Record<string, number> = { all: items.length };
  for (const item of items) counts[item.module] = (counts[item.module] ?? 0) + 1;

  const approveMutation = useMutation({
    mutationFn: async (item: InboxItem) => {
      const path = item.approveUrl.replace(/^\/api/, "");
      return apiFetch(`/api${path}`, { method: "POST" });
    },
    onMutate:   (item) => setApprovingId(item.id),
    onSettled:  () => setApprovingId(null),
    onSuccess:  (_data, item) => {
      qc.invalidateQueries({ queryKey: ["approvals-inbox"] });
      qc.invalidateQueries({ queryKey: ["approvals-count"] });
      toast({ title: "Approved", description: item.label });
    },
    onError: (e: Error) => {
      toast({ title: "Cannot approve", description: e.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (item: InboxItem) => {
      if (!item.rejectUrl) throw new Error("No reject URL available");
      const path = item.rejectUrl.replace(/^\/api/, "");
      return apiFetch(`/api${path}`, { method: "POST" });
    },
    onMutate:   (item) => setRejectingId(item.id),
    onSettled:  () => setRejectingId(null),
    onSuccess:  (_data, item) => {
      qc.invalidateQueries({ queryKey: ["approvals-inbox"] });
      qc.invalidateQueries({ queryKey: ["approvals-count"] });
      toast({ title: "Rejected", description: item.label, variant: "destructive" });
    },
    onError: (e: Error) => {
      toast({ title: "Cannot reject", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4 text-amber-700" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Approvals Inbox</h1>
            <p className="text-xs text-muted-foreground">Items awaiting your checker approval (you cannot approve your own submissions)</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Module filter */}
      <div className="flex flex-wrap gap-2">
        {(["all", "finance", "fees", "exams", "payroll"] as const).map((m) => {
          const count = counts[m] ?? 0;
          const isActive = activeModule === m;
          return (
            <button
              key={m}
              onClick={() => setActiveModule(m)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              <Filter className="h-3 w-3" />
              {m === "all" ? "All" : MODULE_META[m].label}
              {count > 0 && (
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted-foreground/20"
                )}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Failed to load approvals inbox. {(error as Error).message}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-muted/30 p-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500 opacity-60" />
          <p className="font-medium text-foreground">All clear!</p>
          <p className="text-sm text-muted-foreground">
            {activeModule === "all"
              ? "No items awaiting your approval."
              : `No ${MODULE_META[activeModule as Module]?.label} items awaiting approval.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const meta = MODULE_META[item.module];
            const Icon = meta.icon;
            const isApproving = approvingId === item.id;
            const isRejecting = rejectingId === item.id;
            const isBusy = isApproving || isRejecting;
            return (
              <div
                key={item.id}
                className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg mt-0.5", meta.bg)}>
                  <Icon className={cn("h-4 w-4", meta.color)} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="secondary"
                      className={cn("text-[10px] uppercase font-bold tracking-wide", meta.color, meta.bg)}
                    >
                      {meta.label}
                    </Badge>
                    {item.amount != null && (
                      <span className="text-xs font-semibold text-foreground">{formatCurrency(item.amount)}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-foreground truncate">{item.label}</p>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 shrink-0" />
                      {formatRelative(item.createdAt)}
                    </span>
                    {item.date && (
                      <span className="text-xs text-muted-foreground">· {item.date}</span>
                    )}
                    {item.createdByName && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3 shrink-0" />
                        {item.createdByName}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.rejectUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectMutation.mutate(item)}
                      disabled={isBusy || rejectMutation.isPending}
                      className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                    >
                      {isRejecting ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5 mr-1.5" />
                          Reject
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => approveMutation.mutate(item)}
                    disabled={isBusy || approveMutation.isPending}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isApproving ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        Approve
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
