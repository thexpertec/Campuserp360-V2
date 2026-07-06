import { useState, useCallback } from "react";
import { formatDate, formatCurrency } from "@/lib/locale";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2, XCircle, Search, ChevronLeft, ChevronRight,
  Loader2, BadgeCheck, AlertCircle, Eye, Clock, IndianRupee,
  Ban, RotateCcw, Banknote, ExternalLink,
} from "lucide-react";
import { useListAdminClasses, useGetAdminAdmissionPaymentConfig } from "@workspace/api-client-react";
import { useDebounce } from "@/hooks/use-debounce";
import { keepPreviousData, useQuery, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type FeeRecord = {
  referenceId: string;
  applicantId: string | null;
  candidateName: string;
  fatherName: string;
  classApplying: string;
  status: string;
  feeStatus: string;
  feeBankRef: string | null;
  feeReceiptUrl: string | null;
  feeSubmittedAt: string | null;
  feeConfirmedAt: string | null;
  admissionFeeStatus: string;
  admissionFeeBankRef: string | null;
  admissionFeeConfirmedAt: string | null;
  admissionFeeVerifiedByName: string | null;
  admissionFeeActionAt: string | null;
  admissionFeeRejectionReason: string | null;
  admissionFeeVerifiedAmount: number | null;
  createdAt: string;
};

type FeeVerifyPage = {
  data: FeeRecord[];
  total: number;
  appFeePending: number;
  appFeeSubmitted: number;
  appFeePaid: number;
  admFeePending: number;
  admFeeSubmitted: number;
  admFeePaid: number;
  page: number;
  pageSize: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const ALL_CLASSES  = "__all_classes__";
const ALL_FEE_TYPE = "__all_fee_type__";
const ALL_STATUS   = "__all_status__";

const FEE_TYPE_OPTIONS = [
  { value: ALL_FEE_TYPE, label: "All Fees"        },
  { value: "app",        label: "Application Fee" },
  { value: "admission",  label: "Application Fee"   },
];

const STATUS_FILTER_OPTIONS = [
  { value: ALL_STATUS,   label: "All"       },
  { value: "pending",    label: "Pending"   },
  { value: "submitted",  label: "Submitted" },
  { value: "paid",       label: "Verified"  },
  { value: "rejected",   label: "Rejected"  },
];

// ─── Fetch & mutate helpers ───────────────────────────────────────────────────

async function fetchFeeVerify(params: {
  q: string; classApplying: string; feeType: string; feeStatus: string; page: number;
}): Promise<FeeVerifyPage> {
  const sp = new URLSearchParams();
  if (params.q)                               sp.set("q", params.q);
  if (params.classApplying !== ALL_CLASSES)   sp.set("classApplying", params.classApplying);
  if (params.feeType !== ALL_FEE_TYPE)        sp.set("feeType", params.feeType);
  if (params.feeStatus !== ALL_STATUS)        sp.set("feeStatus", params.feeStatus);
  sp.set("page",     String(params.page));
  sp.set("pageSize", String(PAGE_SIZE));
  const tenant = localStorage.getItem("ccm_admin_website_tenant") || "ccm";
  const res = await fetch(`/api/admin/applications/fee-verification?${sp}`, {
    headers: { Authorization: `Bearer ${getToken() ?? ""}`, "X-Tenant-Id": tenant },
  });
  if (!res.ok) throw new Error("Failed to load fee verification list");
  return res.json();
}

function tenantHeader(): string {
  return localStorage.getItem("ccm_admin_website_tenant") || "ccm";
}

async function confirmFee(referenceId: string): Promise<void> {
  const res = await fetch(`/api/admin/applications/${referenceId}/fee/confirm`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() ?? ""}`,
      "X-Tenant-Id": tenantHeader(),
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? "Failed to confirm fee");
  }
}

async function admFeeAction(
  referenceId: string,
  action: "verify" | "reject" | "revert",
  opts?: { amount?: number; bankRef?: string; reason?: string },
): Promise<void> {
  const res = await fetch(`/api/admin/applications/${referenceId}/admission-fee/action`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() ?? ""}`,
      "X-Tenant-Id": tenantHeader(),
    },
    body: JSON.stringify({ action, ...opts }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? "Failed to update application fee");
  }
}

// ─── Fee status badges ─────────────────────────────────────────────────────────

function AppFeeStatusBadge({ status }: { status: string }) {
  if (status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Paid
      </span>
    );
  }
  if (status === "submitted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <AlertCircle className="h-3 w-3" /> Submitted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

function AdmFeeStatusBadge({ status }: { status: string }) {
  if (status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <BadgeCheck className="h-3 w-3" /> Verified
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
        <XCircle className="h-3 w-3" /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

// ─── Application Fee Confirm button ────────────────────────────────────────────

function AppFeeConfirmButton({ referenceId, onConfirmed }: { referenceId: string; onConfirmed: () => void }) {
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: () => confirmFee(referenceId),
    onSuccess: () => {
      toast({ title: "Application fee confirmed", description: "Marked as paid." });
      onConfirmed();
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });
  return (
    <Button size="sm" variant="outline"
      className="h-6 px-2 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
      onClick={() => mut.mutate()} disabled={mut.isPending}
    >
      {mut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><BadgeCheck className="h-3 w-3 mr-1" />Confirm</>}
    </Button>
  );
}

// ─── Admission Fee action buttons (Verify / Reject / Revert) ──────────────────

function AdmFeeActions({ referenceId, row, onDone }: {
  referenceId: string;
  row: FeeRecord;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [bankRef, setBankRef] = useState(row.admissionFeeBankRef ?? "");
  const [reason, setReason] = useState("");

  const status = row.admissionFeeStatus;

  const mut = useMutation({
    mutationFn: (vars: { action: "verify" | "reject" | "revert"; opts?: { amount?: number; bankRef?: string; reason?: string } }) =>
      admFeeAction(referenceId, vars.action, vars.opts),
    onSuccess: (_d, vars) => {
      const labels = { verify: "Application fee verified", reject: "Application fee rejected", revert: "Status reverted to pending" };
      toast({ title: labels[vars.action] });
      setVerifyOpen(false);
      setRejectOpen(false);
      onDone();
    },
    onError: (err: Error) => toast({ title: "Action failed", description: err.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="flex items-center gap-1 flex-wrap">
        {/* Verify — available for submitted or rejected */}
        {(status === "submitted" || status === "pending" || status === "rejected") && (
          <Button size="sm" variant="outline"
            className="h-6 px-2 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            onClick={() => { setAmount(""); setBankRef(row.admissionFeeBankRef ?? ""); setVerifyOpen(true); }}
            disabled={mut.isPending}
          >
            <BadgeCheck className="h-3 w-3 mr-1" /> Verify
          </Button>
        )}

        {/* Reject — available for submitted or pending */}
        {(status === "submitted" || status === "pending") && (
          <Button size="sm" variant="outline"
            className="h-6 px-2 text-xs border-red-200 text-red-700 hover:bg-red-50"
            onClick={() => { setReason(""); setRejectOpen(true); }}
            disabled={mut.isPending}
          >
            <Ban className="h-3 w-3 mr-1" /> Reject
          </Button>
        )}

        {/* Revert — available for verified or rejected */}
        {(status === "paid" || status === "rejected") && (
          <Button size="sm" variant="outline"
            className="h-6 px-2 text-xs border-slate-200 text-slate-500 hover:bg-slate-50"
            onClick={() => mut.mutate({ action: "revert" })}
            disabled={mut.isPending}
          >
            {mut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RotateCcw className="h-3 w-3 mr-1" /> Revert</>}
          </Button>
        )}
      </div>

      {/* Verify dialog */}
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verify Application Fee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="adm-amount">Amount (Rs.) — optional</Label>
              <Input id="adm-amount" type="number" placeholder="e.g. 25000" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-bankref">Bank Reference — optional</Label>
              <Input id="adm-bankref" placeholder="e.g. TXN-XXXXXX" value={bankRef} onChange={e => setBankRef(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={mut.isPending}
              onClick={() => mut.mutate({
                action: "verify",
                opts: { amount: amount ? Number(amount) : undefined, bankRef: bankRef.trim() || undefined },
              })}
            >
              {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-2 h-4 w-4" />}
              Confirm Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Application Fee</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="adm-reason">Reason (optional)</Label>
            <Textarea id="adm-reason" placeholder="e.g. Incorrect amount deposited, wrong account used…" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={mut.isPending}
              onClick={() => mut.mutate({ action: "reject", opts: { reason: reason.trim() || undefined } })}
            >
              {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
              Reject Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function FeeVerificationTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [q, setQ]                     = useState("");
  const [classApplying, setClass]     = useState(ALL_CLASSES);
  const [feeType, setFeeType]         = useState(ALL_FEE_TYPE);
  const [feeStatus, setFeeStatus]     = useState(ALL_STATUS);
  const [page, setPage]               = useState(1);

  const debouncedQ = useDebounce(q, 300);

  const queryKey = ["fee-verification", debouncedQ, classApplying, feeType, feeStatus, page];

  const { data, isLoading, isError } = useQuery<FeeVerifyPage>({
    queryKey,
    queryFn: () => fetchFeeVerify({ q: debouncedQ, classApplying, feeType, feeStatus, page }),
    placeholderData: keepPreviousData,
  });

  const { data: classesData } = useListAdminClasses();
  const classOptions = (classesData ?? []).map((c: any) => ({ value: c.code, label: c.name }));

  const { data: payConfig } = useGetAdminAdmissionPaymentConfig();
  const appFeeAmount: number = (payConfig as any)?.applicationFeeAmount ?? 2000;

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["fee-verification"] });
  }, [qc]);

  const rows   = data?.data ?? [];
  const total  = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handlePageChange(delta: number) {
    setPage(p => Math.max(1, Math.min(totalPages, p + delta)));
  }

  function resetPage() { setPage(1); }

  return (
    <div className="space-y-4">

      {/* ── Summary stats ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <StatPill label="Total" value={data?.total ?? 0} color="slate" />
        <StatPill label="App Fee: Pending" value={data?.appFeePending ?? 0} color="slate" icon={<Clock className="h-3 w-3" />} />
        <StatPill label="App Fee: Submitted" value={data?.appFeeSubmitted ?? 0} color="amber" icon={<AlertCircle className="h-3 w-3" />} />
        <StatPill label="App Fee: Paid" value={data?.appFeePaid ?? 0} color="emerald" icon={<CheckCircle2 className="h-3 w-3" />} />
        <StatPill label="Adm Fee: Pending" value={data?.admFeePending ?? 0} color="slate" icon={<Clock className="h-3 w-3" />} />
        <StatPill label="Adm Fee: Submitted" value={data?.admFeeSubmitted ?? 0} color="amber" icon={<AlertCircle className="h-3 w-3" />} />
        <StatPill label="Adm Fee: Verified" value={data?.admFeePaid ?? 0} color="emerald" icon={<BadgeCheck className="h-3 w-3" />} />
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name or Applicant ID..."
            value={q}
            onChange={e => { setQ(e.target.value); resetPage(); }}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <Select value={classApplying} onValueChange={v => { setClass(v); resetPage(); }}>
          <SelectTrigger className="h-8 text-sm w-[150px]">
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLASSES}>All Classes</SelectItem>
            {classOptions.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={feeType} onValueChange={v => { setFeeType(v); resetPage(); }}>
          <SelectTrigger className="h-8 text-sm w-[155px]">
            <SelectValue placeholder="All Fees" />
          </SelectTrigger>
          <SelectContent>
            {FEE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={feeStatus} onValueChange={v => { setFeeStatus(v); resetPage(); }}>
          <SelectTrigger className="h-8 text-sm w-[140px]">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-white overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50/70">
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-12">Applicant ID</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[160px]">Candidate</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[140px]">Father</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-[110px]">Class</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide w-[100px]">Amount</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[220px]">Application Fee</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[260px]">Admission Fee</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-16">Profile</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 8 }).map((__, j) => (
                  <td key={j} className="px-3 py-2.5">
                    <Skeleton className="h-4 w-full rounded" />
                  </td>
                ))}
              </tr>
            ))}

            {isError && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-destructive">
                  Failed to load fee verification data.
                </td>
              </tr>
            )}

            {!isLoading && !isError && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <IndianRupee className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  No records match the current filters.
                </td>
              </tr>
            )}

            {rows.map(r => (
              <FeeRow key={r.referenceId} row={r} appFeeAmount={appFeeAmount} onConfirmed={invalidate} />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => handlePageChange(-1)} disabled={page <= 1}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 font-medium">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => handlePageChange(1)} disabled={page >= totalPages}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Row component ─────────────────────────────────────────────────────────────

function FeeRow({ row, appFeeAmount, onConfirmed }: { row: FeeRecord; appFeeAmount: number; onConfirmed: () => void }) {
  const { toast } = useToast();
  const [cashOpen, setCashOpen] = useState(false);
  const [cashRef, setCashRef] = useState("");
  const [cashNote, setCashNote] = useState("");

  const cashMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/applications/${row.referenceId}/fee/cash`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
          "X-Tenant-Id": tenantHeader(),
        },
        body: JSON.stringify({
          cashRef: cashRef.trim(),
          note: cashNote.trim() || undefined,
          amount: appFeeAmount,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? "Failed to record cash payment");
      }
    },
    onSuccess: () => {
      toast({ title: "Cash payment recorded", description: "Application fee marked as paid." });
      setCashOpen(false);
      setCashRef("");
      setCashNote("");
      onConfirmed();
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <>
    <tr className="hover:bg-slate-50/60 transition-colors">
      {/* GR */}
      <td className="px-3 py-2.5 text-[11px] font-mono text-slate-400">
        {row.applicantId ?? "—"}
      </td>

      {/* Candidate */}
      <td className="px-3 py-2.5">
        <p className="text-[12.5px] font-medium text-slate-800">{row.candidateName}</p>
        <p className="text-[11px] text-muted-foreground font-mono">{row.referenceId}</p>
      </td>

      {/* Father */}
      <td className="px-3 py-2.5 text-[12.5px] text-slate-600">
        {row.fatherName ?? <span className="text-slate-300">—</span>}
      </td>

      {/* Class */}
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
          {row.classApplying}
        </span>
      </td>

      {/* Amount */}
      <td className="px-3 py-2.5 text-right">
        <span className="text-[12px] font-semibold text-slate-700">
          {formatCurrency(appFeeAmount)}
        </span>
      </td>

      {/* Application Fee */}
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <AppFeeStatusBadge status={row.feeStatus} />
            {row.feeStatus !== "paid" && (
              <AppFeeConfirmButton referenceId={row.referenceId} onConfirmed={onConfirmed} />
            )}
            {row.feeStatus !== "paid" && (
              <Button size="sm" variant="outline"
                className="h-6 px-2 text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                onClick={() => { setCashRef(""); setCashNote(""); setCashOpen(true); }}
              >
                <Banknote className="h-3 w-3 mr-1" />Cash
              </Button>
            )}
          </div>
          {row.feeBankRef && (
            <p className="text-[11px] text-muted-foreground font-mono">
              Ref: <span className="font-medium text-slate-700">{row.feeBankRef}</span>
            </p>
          )}
          {row.feeReceiptUrl && (
            <a
              href={row.feeReceiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-sky-600 hover:text-sky-800 font-medium underline underline-offset-2"
            >
              <ExternalLink className="h-3 w-3" />View Receipt ↗
            </a>
          )}
          {row.feeConfirmedAt && (
            <p className="text-[10px] text-emerald-600">
              Confirmed {formatDate(row.feeConfirmedAt)}
            </p>
          )}
        </div>
      </td>

      {/* Admission Fee */}
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <AdmFeeStatusBadge status={row.admissionFeeStatus} />
            <AdmFeeActions referenceId={row.referenceId} row={row} onDone={onConfirmed} />
          </div>

          {row.admissionFeeBankRef && (
            <p className="text-[11px] text-muted-foreground font-mono">
              Ref: <span className="font-medium text-slate-700">{row.admissionFeeBankRef}</span>
            </p>
          )}

          {row.admissionFeeVerifiedAmount && (
            <p className="text-[11px] text-slate-600">
              Amount: <span className="font-medium">{formatCurrency(row.admissionFeeVerifiedAmount)}</span>
            </p>
          )}

          {row.admissionFeeRejectionReason && (
            <p className="text-[11px] text-red-600 italic">
              Reason: {row.admissionFeeRejectionReason}
            </p>
          )}

          {row.admissionFeeVerifiedByName && row.admissionFeeActionAt && (
            <p className="text-[10px] text-muted-foreground">
              {row.admissionFeeStatus === "paid" ? "Verified" : row.admissionFeeStatus === "rejected" ? "Rejected" : "Last action"}{" "}
              by <span className="font-medium">{row.admissionFeeVerifiedByName}</span>{" "}
              on {formatDate(row.admissionFeeActionAt)}
            </p>
          )}
        </div>
      </td>

      {/* Profile link */}
      <td className="px-3 py-2.5 text-center">
        <Link href={`/applications/${row.referenceId}`}>
          <button
            className="h-7 w-7 rounded-lg flex items-center justify-center mx-auto text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="View profile"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </Link>
      </td>
    </tr>

    {/* Cash Payment Dialog */}
    <Dialog open={cashOpen} onOpenChange={setCashOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Cash Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Recording for: <span className="font-medium text-foreground">{row.candidateName}</span>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`cash-ref-${row.referenceId}`}>Receipt / Voucher No. <span className="text-destructive">*</span></Label>
            <Input
              id={`cash-ref-${row.referenceId}`}
              placeholder="e.g. CASH-001"
              value={cashRef}
              onChange={e => setCashRef(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`cash-note-${row.referenceId}`}>Note (optional)</Label>
            <Input
              id={`cash-note-${row.referenceId}`}
              placeholder="e.g. Paid at admissions counter"
              value={cashNote}
              onChange={e => setCashNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCashOpen(false)}>Cancel</Button>
          <Button
            className="bg-violet-600 hover:bg-violet-700 text-white"
            disabled={!cashRef.trim() || cashMutation.isPending}
            onClick={() => cashMutation.mutate()}
          >
            {cashMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Banknote className="mr-2 h-4 w-4" />}
            Record Cash Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({
  label, value, color, icon,
}: {
  label: string; value: number; color: "slate" | "amber" | "emerald"; icon?: React.ReactNode;
}) {
  const cls = {
    slate:   "bg-slate-50 text-slate-600 border-slate-200",
    amber:   "bg-amber-50 text-amber-700 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  }[color];

  return (
    <div className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium", cls)}>
      {icon}
      <span>{value}</span>
      <span className="text-[11px] font-normal opacity-75">{label}</span>
    </div>
  );
}
