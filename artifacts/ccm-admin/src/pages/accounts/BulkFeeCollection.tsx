import { Link } from "wouter";
import { useState, useRef, useCallback, useEffect } from "react";
import { formatCurrency, todayIso } from "@/lib/locale";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, X, CheckCircle2, AlertCircle, Loader2,
  Plus, ArrowLeft, Send, Eye, AlertTriangle, History, PlusCircle, ChevronDown,
} from "lucide-react";
import { BulkCollectionHistory } from "./BulkCollectionHistory";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BankAccount {
  id: string;
  type: "cash" | "bank";
  account_title: string;
  bank_name?: string | null;
  is_active: boolean;
}

interface StudentResult {
  id: string;
  fullName: string;
  applicantId: string;
  classCode: string;
  guardianMobile?: string | null;
  fatherName?: string | null;
}

interface PendingChallan {
  id: string;
  amount: number;
  month: string | null;
  feeTypeName: string;
  status: string;
}

interface GridRow {
  key: string;
  studentId: string | null;
  studentData: StudentResult | null;
  challans: PendingChallan[];
  dueAmount: number;
  paidAmount: string;
  loading: boolean;
  searching: boolean;
  fetchError: string | null;
  postStatus: "idle" | "ok" | "error";
  postError: string | null;
  selected: boolean;
  searchText: string;
  dropdownResults: StudentResult[];
  showDropdown: boolean;
  activeDropdownIdx: number;
  initialLoaded: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _rowId = 0;
function emptyRow(): GridRow {
  return {
    key: `r${++_rowId}`,
    studentId: null, studentData: null,
    challans: [], dueAmount: 0, paidAmount: "",
    loading: false, searching: false, fetchError: null,
    postStatus: "idle", postError: null,
    selected: true,
    searchText: "", dropdownResults: [], showDropdown: false,
    activeDropdownIdx: -1,
    initialLoaded: false,
  };
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmt(n: number) { return formatCurrency(n); }

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

const INIT_ROWS = 5;

// ── Main component ─────────────────────────────────────────────────────────────

export function BulkFeeCollection() {
  const { toast } = useToast();

  const [subTab, setSubTab]           = useState<"collect" | "history">("collect");
  const [date, setDate]               = useState(todayStr);
  const [bankAccountId, setBankAccountId] = useState("");
  const [rows, setRows]               = useState<GridRow[]>(() => Array.from({ length: INIT_ROWS }, emptyRow));
  const [mode, setMode]               = useState<"edit" | "review">("edit");
  const [submitting, setSubmitting]   = useState(false);

  const [focusedRowKey, setFocusedRowKey] = useState<string | null>(null);
  const [focusedCol, setFocusedCol]       = useState<"student" | "amount" | null>(null);

  const [acctInputText, setAcctInputText]       = useState("");
  const [showAcctDropdown, setShowAcctDropdown] = useState(false);
  const [acctHighlightIdx, setAcctHighlightIdx] = useState(-1);
  const acctInputRef  = useRef<HTMLInputElement | null>(null);
  const acctDropRef   = useRef<HTMLDivElement | null>(null);

  const studentRefs   = useRef<(HTMLInputElement | null)[]>([]);
  const amountRefs    = useRef<(HTMLInputElement | null)[]>([]);
  const dropdownRefs  = useRef<Record<string, HTMLDivElement | null>>({});
  const searchTimers  = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingFocus  = useRef<{ idx: number; col: "student" | "amount" } | null>(null);

  // Bank accounts
  const { data: rawAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn:  () => apiFetch<BankAccount[]>("/api/admin/bank-accounts"),
    staleTime: 60_000,
  });
  const bankAccounts   = (rawAccounts as BankAccount[]).filter(a => a.is_active);
  const cashAccounts   = bankAccounts.filter(a => a.type === "cash");
  const bankOnlyAccts  = bankAccounts.filter(a => a.type === "bank");
  const selectedAcct   = bankAccounts.find(a => a.id === bankAccountId);
  const selectedAcctLabel = selectedAcct
    ? (selectedAcct.bank_name ? `${selectedAcct.bank_name} — ${selectedAcct.account_title}` : selectedAcct.account_title)
    : "Not selected";

  // Focus pending row after rows.length changes (new row added)
  useEffect(() => {
    if (!pendingFocus.current) return;
    const { idx, col } = pendingFocus.current;
    pendingFocus.current = null;
    setTimeout(() => {
      if (col === "student") studentRefs.current[idx]?.focus();
      else amountRefs.current[idx]?.focus();
    }, 40);
  }, [rows.length]);

  // ── Row state helpers ────────────────────────────────────────────────────

  function updateRow(key: string, update: Partial<GridRow>) {
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...update } : r));
  }

  function addRow() {
    setRows(prev => {
      pendingFocus.current = { idx: prev.length, col: "student" };
      return [...prev, emptyRow()];
    });
  }

  function removeRow(key: string) {
    setRows(prev => {
      const next = prev.filter(r => r.key !== key);
      return next.length === 0 ? [emptyRow()] : next;
    });
  }

  function clearStudent(key: string) {
    updateRow(key, {
      studentId: null, studentData: null,
      searchText: "", challans: [], dueAmount: 0, paidAmount: "",
      fetchError: null, dropdownResults: [], showDropdown: false,
      searching: false, activeDropdownIdx: -1,
      postStatus: "idle", postError: null,
    });
  }

  // ── Keyboard navigation ──────────────────────────────────────────────────

  const focusStudent = useCallback((idx: number) => {
    if (idx < 0) return;
    if (idx >= rows.length) {
      setRows(prev => {
        pendingFocus.current = { idx: prev.length, col: "student" };
        return [...prev, emptyRow()];
      });
      return;
    }
    studentRefs.current[idx]?.focus();
  }, [rows.length]);

  const focusAmount = useCallback((idx: number) => {
    if (idx < 0 || idx >= rows.length) return;
    amountRefs.current[idx]?.focus();
  }, [rows.length]);

  function handleStudentKeyDown(e: React.KeyboardEvent, idx: number) {
    const row = rows[idx];

    if (row.showDropdown) {
      const selectables = row.dropdownResults.filter(
        s => !rows.some(r => r.key !== row.key && r.studentId === s.id)
      );
      const count = selectables.length;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(row.activeDropdownIdx + 1, count - 1);
        updateRow(row.key, { activeDropdownIdx: next });
        const container = dropdownRefs.current[row.key];
        if (container) {
          const item = container.children[next] as HTMLElement | undefined;
          item?.scrollIntoView({ block: "nearest" });
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(row.activeDropdownIdx - 1, -1);
        updateRow(row.key, { activeDropdownIdx: prev });
        const container = dropdownRefs.current[row.key];
        if (container && prev >= 0) {
          const item = container.children[prev] as HTMLElement | undefined;
          item?.scrollIntoView({ block: "nearest" });
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (row.activeDropdownIdx >= 0 && row.activeDropdownIdx < count) {
          selectStudent(row.key, selectables[row.activeDropdownIdx], idx);
        } else {
          updateRow(row.key, { showDropdown: false, activeDropdownIdx: -1 });
          focusStudent(idx + 1);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        updateRow(row.key, { showDropdown: false, activeDropdownIdx: -1 });
        return;
      }
    }

    if (e.key === "Escape") {
      updateRow(row.key, { showDropdown: false, activeDropdownIdx: -1 });
      return;
    }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      focusAmount(idx);
      return;
    }
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      if (idx > 0) focusAmount(idx - 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      focusStudent(idx + 1);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusAmount(idx);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusStudent(idx + 1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      focusStudent(idx - 1);
      return;
    }
  }

  function handleAmountKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusStudent(idx);
      return;
    }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (idx + 1 >= rows.length) {
        setRows(prev => {
          pendingFocus.current = { idx: prev.length, col: "student" };
          return [...prev, emptyRow()];
        });
      } else {
        focusStudent(idx + 1);
      }
      return;
    }
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      focusStudent(idx);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (idx + 1 >= rows.length) {
        setRows(prev => {
          pendingFocus.current = { idx: prev.length, col: "amount" };
          return [...prev, emptyRow()];
        });
      } else {
        focusAmount(idx + 1);
      }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); focusAmount(idx + 1); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); focusAmount(idx - 1); return; }
  }

  // ── Student search ────────────────────────────────────────────────────────

  async function loadInitialStudents(key: string) {
    setRows(prev => prev.map(r =>
      r.key === key ? { ...r, showDropdown: true, searching: true, activeDropdownIdx: -1 } : r
    ));
    try {
      const data = await apiFetch<{ items: StudentResult[] }>(
        `/api/admin/students?status=active&pageSize=15&sort=name:asc`
      );
      setRows(prev => prev.map(r =>
        r.key === key
          ? { ...r, dropdownResults: data.items ?? [], searching: false, showDropdown: true, initialLoaded: true }
          : r
      ));
    } catch {
      setRows(prev => prev.map(r =>
        r.key === key ? { ...r, searching: false } : r
      ));
    }
  }

  function handleSearchChange(key: string, value: string) {
    const hasQuery = value.trim().length >= 1;
    setRows(prev => prev.map(r => {
      if (r.key !== key) return r;
      return {
        ...r,
        searchText: value,
        studentId: null, studentData: null,
        challans: [], dueAmount: 0, paidAmount: "",
        fetchError: null,
        showDropdown: true,
        dropdownResults: hasQuery ? r.dropdownResults : r.dropdownResults,
        searching: hasQuery,
        activeDropdownIdx: -1,
        initialLoaded: hasQuery ? r.initialLoaded : r.initialLoaded,
      };
    }));

    clearTimeout(searchTimers.current[key]);
    if (hasQuery) {
      searchTimers.current[key] = setTimeout(async () => {
        try {
          const data = await apiFetch<{ items: StudentResult[] }>(
            `/api/admin/students?q=${encodeURIComponent(value.trim())}&status=active&pageSize=12`
          );
          setRows(prev => prev.map(r =>
            r.key === key
              ? { ...r, dropdownResults: data.items ?? [], showDropdown: true, searching: false }
              : r
          ));
        } catch {
          setRows(prev => prev.map(r =>
            r.key === key ? { ...r, searching: false } : r
          ));
        }
      }, 220);
    }
  }

  async function selectStudent(key: string, student: StudentResult, rowIdx: number) {
    // Duplicate guard
    const isDup = rows.some(r => r.key !== key && r.studentId === student.id);
    if (isDup) {
      toast({
        title: "Already in list",
        description: `${student.fullName} is already added`,
        variant: "destructive",
      });
      return;
    }

    updateRow(key, {
      studentId: student.id,
      studentData: student,
      searchText: student.fullName,
      showDropdown: false,
      dropdownResults: [],
      searching: false,
      activeDropdownIdx: -1,
      loading: true,
      fetchError: null,
    });

    // Move focus to amount immediately
    setTimeout(() => amountRefs.current[rowIdx]?.focus(), 40);

    // Fetch pending challans
    try {
      const challans = await apiFetch<PendingChallan[]>(
        `/api/admin/fee-challans/pending-by-student?studentId=${student.id}`
      );
      const dueAmount = challans.reduce((s, c) => s + c.amount, 0);
      setRows(prev => prev.map(r =>
        r.key === key
          ? { ...r, challans, dueAmount, paidAmount: String(dueAmount), loading: false }
          : r
      ));
    } catch (e: any) {
      setRows(prev => prev.map(r =>
        r.key === key ? { ...r, loading: false, fetchError: e.message } : r
      ));
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────

  const filledRows        = rows.filter(r => r.studentId && r.challans.length > 0);
  const selectedRows      = filledRows.filter(r => r.selected);
  const allFilled         = filledRows.length > 0;
  const allChecked        = allFilled && filledRows.every(r => r.selected);
  const someChecked       = filledRows.some(r => r.selected);
  const totalDue          = filledRows.reduce((s, r) => s + r.dueAmount, 0);
  const totalPaid         = filledRows.reduce((s, r) => s + (Number(r.paidAmount) || 0), 0);
  const selectedDue       = selectedRows.reduce((s, r) => s + r.dueAmount, 0);
  const selectedPaid      = selectedRows.reduce((s, r) => s + (Number(r.paidAmount) || 0), 0);
  const hasPartial        = selectedRows.some(r => {
    const p = Number(r.paidAmount);
    return p > 0 && p < r.dueAmount;
  });
  const canPostForReview  = selectedRows.length > 0 && selectedRows.every(r => Number(r.paidAmount) > 0);

  function toggleSelectAll() {
    const target = !allChecked;
    setRows(prev => prev.map(r => r.studentId ? { ...r, selected: target } : r));
  }

  function toggleRow(key: string) {
    setRows(prev => prev.map(r => r.key === key ? { ...r, selected: !r.selected } : r));
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  function handlePostForReview() {
    if (!canPostForReview) return;
    setMode("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleFinalPost() {
    if (submitting) return;
    setSubmitting(true);

    // Snapshot selected rows in submission order so we can match API results by index
    const submittedRows = [...selectedRows];
    const entries = submittedRows.map(r => ({
      challanIds: r.challans.map(c => c.id),
      paidAmount: Number(r.paidAmount) || r.dueAmount,
    }));

    try {
      const resp = await apiFetch<{
        ok: boolean;
        updated: number;
        results: { entryIndex: number; success: boolean; updated: number; error?: string }[];
      }>("/api/admin/fee-challans/bulk-collect", {
        method: "POST",
        body: JSON.stringify({
          date,
          bankAccountId: bankAccountId || undefined,
          entries,
        }),
      });

      // Reconcile per-row outcomes
      const successKeys = new Set<string>();
      const errorMap    = new Map<string, string>();

      (resp.results ?? []).forEach(result => {
        const row = submittedRows[result.entryIndex];
        if (!row) return;
        if (result.success) {
          successKeys.add(row.key);
        } else {
          errorMap.set(row.key, result.error ?? "Failed");
        }
      });

      // Fallback: if API returned no results array, treat everything as success
      if (!resp.results?.length) {
        submittedRows.forEach(r => successKeys.add(r.key));
      }

      setRows(prev => prev.map(r => {
        if (successKeys.has(r.key)) return { ...r, postStatus: "ok" as const };
        if (errorMap.has(r.key))   return { ...r, postStatus: "error" as const, postError: errorMap.get(r.key) ?? null };
        return r;
      }));

      const succeedCount = successKeys.size;
      const failCount    = errorMap.size;

      toast({
        title: succeedCount > 0
          ? `${succeedCount} student${succeedCount > 1 ? "s" : ""} posted${failCount > 0 ? ` · ${failCount} failed` : " successfully"}`
          : `${failCount} row${failCount > 1 ? "s" : ""} failed — check grid for details`,
        variant: failCount > 0 && succeedCount === 0 ? "destructive" : undefined,
      });

      // Remove successful rows after brief animation; failed rows stay visible in review
      setTimeout(() => {
        if (failCount === 0) {
          // All succeeded — reset grid and return to edit
          setRows(Array.from({ length: INIT_ROWS }, emptyRow));
          setMode("edit");
        } else {
          // Partial failure — remove ok rows, stay in review so user sees inline errors
          // User must click Back to return to edit and correct failed rows
          setRows(prev => prev.filter(r => r.postStatus !== "ok"));
        }
      }, 1200);
    } catch (e: any) {
      toast({ title: "Post failed", description: e.message, variant: "destructive" });
      setRows(prev => prev.map(r =>
        submittedRows.some(s => s.key === r.key)
          ? { ...r, postStatus: "error" as const, postError: e.message }
          : r
      ));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Sub-tab toggle ────────────────────────────────────────────────────────

  const subTabBar = (
    <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
      <button
        onClick={() => setSubTab("collect")}
        className={cn(
          "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all",
          subTab === "collect"
            ? "bg-white text-emerald-700 shadow-sm"
            : "text-slate-500 hover:text-slate-700"
        )}>
        <PlusCircle className="h-3.5 w-3.5" />
        Collect
      </button>
      <button
        onClick={() => setSubTab("history")}
        className={cn(
          "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all",
          subTab === "history"
            ? "bg-white text-emerald-700 shadow-sm"
            : "text-slate-500 hover:text-slate-700"
        )}>
        <History className="h-3.5 w-3.5" />
        History
      </button>
    </div>
  );

  // ── History tab ───────────────────────────────────────────────────────────

  if (subTab === "history") {
    return (
      <div className="flex flex-col gap-5">
        {subTabBar}
        <BulkCollectionHistory />
      </div>
    );
  }

  // ── Review mode ───────────────────────────────────────────────────────────

  if (mode === "review") {
    return (
      <div className="flex flex-col gap-5">
        {subTabBar}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Review — {selectedRows.length} Student{selectedRows.length > 1 ? "s" : ""}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Date: {date} · Account: {selectedAcctLabel}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setMode("edit")} disabled={submitting}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
            <Button
              onClick={handleFinalPost}
              disabled={submitting || bankAccounts.length === 0}
              title={bankAccounts.length === 0 ? "Set up a Cash or Bank account first" : undefined}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {submitting
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Posting…</>
                : <><Send className="h-4 w-4 mr-1.5" /> Final Post</>}
            </Button>
          </div>
        </div>

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

        <div className="rounded-none border-2 border-slate-400 bg-white overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-200">
                <th className="border border-slate-300 text-left px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-600 w-10">Sr</th>
                <th className="border border-slate-300 text-left px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-600">Student</th>
                <th className="border border-slate-300 text-left px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-600">Fee Types</th>
                <th className="border border-slate-300 text-right px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-600 w-36">Due</th>
                <th className="border border-slate-300 text-right px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-600 w-40">Collecting</th>
              </tr>
            </thead>
            <tbody>
              {selectedRows.map((row, idx) => (
                <tr
                  key={row.key}
                  className={cn(
                    "transition-colors",
                    row.postStatus === "ok"    ? "bg-emerald-50" :
                    row.postStatus === "error" ? "bg-red-50"     : "bg-white hover:bg-slate-50"
                  )}>
                  <td className="border border-slate-200 px-4 py-3.5 text-sm text-slate-500 font-mono text-center">{idx + 1}</td>
                  <td className="border border-slate-200 px-4 py-3.5">
                    <p className="font-semibold text-slate-900">
                      {row.studentData?.fullName}
                    </p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      {row.studentData?.applicantId} · {row.studentData?.classCode}
                    </p>
                    {row.postStatus === "ok" && (
                      <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1 mt-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Posted
                      </p>
                    )}
                    {row.postStatus === "error" && (
                      <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                        <AlertCircle className="h-3.5 w-3.5" /> {row.postError}
                      </p>
                    )}
                  </td>
                  <td className="border border-slate-200 px-4 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {row.challans.filter(c => c.amount > 0).map(c => (
                        <span
                          key={c.id}
                          className="inline-flex items-center text-[11px] font-medium bg-slate-100 text-slate-600 rounded px-2 py-0.5 whitespace-nowrap border border-slate-200">
                          {c.feeTypeName} · {fmt(c.amount)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="border border-slate-200 px-4 py-3.5 text-right font-mono text-slate-600 text-sm">{fmt(row.dueAmount)}</td>
                  <td className="border border-slate-200 px-4 py-3.5 text-right">
                    <span className={cn(
                      "font-mono font-bold text-sm",
                      Number(row.paidAmount) < row.dueAmount ? "text-amber-600" : "text-slate-900"
                    )}>
                      {fmt(Number(row.paidAmount) || 0)}
                    </span>
                    {Number(row.paidAmount) < row.dueAmount && (
                      <p className="text-xs text-amber-500 mt-0.5">Partial payment</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-400 font-bold">
                <td colSpan={3} className="border border-slate-300 px-4 py-3.5 text-sm text-slate-700 uppercase tracking-wider">
                  Total — {selectedRows.length} student{selectedRows.length > 1 ? "s" : ""}
                </td>
                <td className="border border-slate-300 px-4 py-3.5 text-right font-mono text-slate-700 text-sm">{fmt(selectedDue)}</td>
                <td className="border border-slate-300 px-4 py-3.5 text-right font-mono text-slate-900 text-base">{fmt(selectedPaid)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {subTabBar}

      {/* ── Global header ─────────────────────────────────────────────────── */}
      <div className="rounded-sm border-2 border-slate-300 bg-white shadow-sm p-4 sticky top-0 z-10">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Collection Date
            </Label>
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              max={todayIso()}
              className="h-9 w-44 text-sm"
            />
          </div>

          <div className="space-y-1.5 flex-1 min-w-[220px] max-w-xs">
            <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Received Into{" "}
              <span className="text-slate-400 font-normal normal-case tracking-normal">
                (applies to all rows)
              </span>
            </Label>
            {(() => {
              const acctLabel = (a: BankAccount) =>
                a.bank_name ? `${a.bank_name} — ${a.account_title}` : a.account_title;
              const hasAccounts = bankAccounts.length > 0;
              const filteredAccts = bankAccounts.filter(a =>
                acctInputText.trim() === "" ||
                acctLabel(a).toLowerCase().includes(acctInputText.toLowerCase())
              );
              const groupedItems: { group: string; acct: BankAccount }[] = [
                ...cashAccounts
                  .filter(a => filteredAccts.includes(a))
                  .map(a => ({ group: "Cash", acct: a })),
                ...bankOnlyAccts
                  .filter(a => filteredAccts.includes(a))
                  .map(a => ({ group: "Bank", acct: a })),
              ];
              const displayValue = showAcctDropdown
                ? acctInputText
                : selectedAcct ? acctLabel(selectedAcct) : acctInputText;
              return (
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <input
                      ref={acctInputRef}
                      type="text"
                      value={displayValue}
                      placeholder={hasAccounts ? "Search account…" : "No accounts set up yet"}
                      disabled={!hasAccounts}
                      onChange={e => {
                        setAcctInputText(e.target.value);
                        setBankAccountId("");
                        setShowAcctDropdown(true);
                        setAcctHighlightIdx(-1);
                      }}
                      onFocus={() => {
                        setAcctInputText(selectedAcct ? acctLabel(selectedAcct) : "");
                        setShowAcctDropdown(true);
                        setAcctHighlightIdx(-1);
                      }}
                      onBlur={() => setTimeout(() => {
                        setShowAcctDropdown(false);
                        if (!bankAccountId) setAcctInputText("");
                      }, 160)}
                      onKeyDown={e => {
                        if (!showAcctDropdown) return;
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setAcctHighlightIdx(i => Math.min(i + 1, groupedItems.length - 1));
                          const el = acctDropRef.current?.children[Math.min(acctHighlightIdx + 1, groupedItems.length - 1)] as HTMLElement | undefined;
                          el?.scrollIntoView({ block: "nearest" });
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setAcctHighlightIdx(i => Math.max(i - 1, -1));
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          if (acctHighlightIdx >= 0 && acctHighlightIdx < groupedItems.length) {
                            const a = groupedItems[acctHighlightIdx].acct;
                            setBankAccountId(a.id);
                            setAcctInputText(acctLabel(a));
                            setShowAcctDropdown(false);
                          }
                        } else if (e.key === "Escape") {
                          setShowAcctDropdown(false);
                          if (selectedAcct) setAcctInputText(acctLabel(selectedAcct));
                        }
                      }}
                      className={cn(
                        "h-9 w-full rounded-lg border pl-8 pr-8 text-sm focus:outline-none focus:ring-2 transition-colors",
                        !hasAccounts
                          ? "border-amber-200 bg-amber-50 text-amber-600 cursor-not-allowed placeholder:text-amber-500"
                          : bankAccountId
                          ? "border-emerald-300 bg-emerald-50/40 text-slate-800 focus:ring-emerald-300"
                          : "border-input bg-white text-slate-700 focus:ring-slate-300",
                      )}
                    />
                    <ChevronDown className={cn(
                      "absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-transform",
                      showAcctDropdown ? "rotate-180 text-slate-500" : "text-slate-400",
                    )} />
                  </div>
                  {showAcctDropdown && (
                    <div
                      ref={acctDropRef}
                      className="absolute top-full left-0 right-0 z-40 mt-1 bg-white border border-border rounded-xl shadow-xl max-h-64 overflow-y-auto">
                      {/* Search hint */}
                      {acctInputText.trim() !== "" && (
                        <div className="px-3 pt-2 pb-1 flex items-center gap-1.5 border-b border-slate-100">
                          <Search className="h-3 w-3 text-slate-400" />
                          <span className="text-xs text-slate-400">Searching for <span className="font-medium text-slate-600">"{acctInputText}"</span></span>
                        </div>
                      )}
                      {groupedItems.length === 0 && hasAccounts ? (
                        <p className="px-3 py-4 text-xs text-slate-400 text-center">No accounts match</p>
                      ) : !hasAccounts ? (
                        <div className="px-3 py-4 text-center space-y-2">
                          <p className="text-xs text-amber-700 font-medium">No bank or cash accounts set up yet.</p>
                          <Link
                            href="/accounts?tab=setup"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            Set up Cash &amp; Bank accounts →
                          </Link>
                        </div>
                      ) : (() => {
                        const nodes: React.ReactNode[] = [];
                        let lastGroup = "";
                        groupedItems.forEach((item, i) => {
                          if (item.group !== lastGroup) {
                            lastGroup = item.group;
                            nodes.push(
                              <div key={`g-${item.group}`} className="px-3 pt-2.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <span className="flex-1 border-t border-slate-100" />
                                {item.group}
                                <span className="flex-1 border-t border-slate-100" />
                              </div>
                            );
                          }
                          nodes.push(
                            <button
                              key={item.acct.id}
                              type="button"
                              onMouseDown={e => {
                                e.preventDefault();
                                setBankAccountId(item.acct.id);
                                setAcctInputText(acctLabel(item.acct));
                                setShowAcctDropdown(false);
                                acctInputRef.current?.blur();
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center gap-2",
                                i === acctHighlightIdx
                                  ? "bg-blue-50 text-blue-900"
                                  : item.acct.id === bankAccountId
                                  ? "bg-emerald-50 text-emerald-800 font-medium"
                                  : "hover:bg-slate-50 text-slate-700",
                              )}>
                              {item.acct.id === bankAccountId && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              )}
                              <span className={item.acct.id === bankAccountId ? "" : "pl-5"}>
                                {acctLabel(item.acct)}
                              </span>
                            </button>
                          );
                        });
                        return nodes;
                      })()}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <p className="text-xs text-slate-400 italic hidden lg:block">
            Tab / Enter to move between cells. Tab past the last row adds a new one.
          </p>
        </div>
      </div>

      {/* ── Grid ──────────────────────────────────────────────────────────── */}
      <div className="rounded-none border-2 border-slate-400 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-200 select-none">
                <th className="border border-slate-300 px-3 py-3.5 w-10 text-center">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                    className={cn(!allFilled && "opacity-30 pointer-events-none")}
                  />
                </th>
                <th className="border border-slate-300 px-3 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-600 w-8">
                  Sr
                </th>
                <th className="border border-slate-300 px-3 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-600 min-w-[280px]">
                  Student · GR · Phone
                </th>
                <th className="border border-slate-300 px-3 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-slate-600 w-36">
                  Due Amount
                </th>
                <th className="border border-slate-300 px-3 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
                  Fee Types
                </th>
                <th className="border border-slate-300 px-3 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-slate-600 w-40">
                  Paid Amount
                </th>
                <th className="border border-slate-300 w-10" />
              </tr>
            </thead>

            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.key}
                  className={cn(
                    "group transition-colors",
                    row.postStatus === "ok"    ? "bg-emerald-50" :
                    row.postStatus === "error" ? "bg-red-50"     :
                    focusedRowKey === row.key  ? "bg-blue-50"    : "bg-white hover:bg-slate-50/60"
                  )}>

                  {/* Checkbox */}
                  <td className="border border-slate-200 px-3 py-3.5 text-center align-middle">
                    {row.studentId && (
                      <Checkbox
                        checked={row.selected}
                        onCheckedChange={() => toggleRow(row.key)}
                      />
                    )}
                  </td>

                  {/* Sr */}
                  <td className="border border-slate-200 px-3 py-3.5 text-sm text-slate-500 font-mono align-middle text-center">
                    {idx + 1}
                  </td>

                  {/* Student search cell */}
                  <td className="border border-slate-200 px-2 py-1.5 relative align-middle">
                    <div className="relative">
                      <Search className={cn(
                        "absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none",
                        row.studentId ? "text-emerald-500" : "text-slate-300",
                      )} />
                      <input
                        ref={el => { studentRefs.current[idx] = el; }}
                        type="text"
                        value={row.searchText}
                        onChange={e => handleSearchChange(row.key, e.target.value)}
                        onFocus={() => {
                          setFocusedRowKey(row.key);
                          setFocusedCol("student");
                          if (!row.studentId) {
                            if (row.searchText.trim().length === 0) {
                              if (row.initialLoaded && row.dropdownResults.length > 0) {
                                updateRow(row.key, { showDropdown: true, activeDropdownIdx: -1 });
                              } else {
                                loadInitialStudents(row.key);
                              }
                            } else {
                              updateRow(row.key, { showDropdown: true, activeDropdownIdx: -1 });
                            }
                          } else {
                            updateRow(row.key, { showDropdown: true, activeDropdownIdx: -1 });
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => updateRow(row.key, { showDropdown: false, activeDropdownIdx: -1 }), 160);
                          setFocusedRowKey(k => k === row.key ? null : k);
                        }}
                        onKeyDown={e => handleStudentKeyDown(e, idx)}
                        placeholder="Click or type to search…"
                        autoComplete="off"
                        className={cn(
                          "w-full h-10 rounded-none border-0 pl-7 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400 transition-colors bg-transparent",
                          row.studentId
                            ? "font-medium text-slate-800"
                            : "text-slate-700",
                          row.fetchError ? "ring-2 ring-inset ring-red-300" : "",
                        )}
                      />

                      {/* Right-side icon: spinner → clear → chevron */}
                      {row.loading ? (
                        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400 pointer-events-none" />
                      ) : row.studentId ? (
                        <button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); clearStudent(row.key); }}
                          title="Clear student"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : row.searching ? (
                        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-blue-400 pointer-events-none" />
                      ) : (
                        <ChevronDown className={cn(
                          "absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-transform text-slate-400",
                          row.showDropdown && "rotate-180",
                        )} />
                      )}
                    </div>

                    {/* GR · Class · Phone sub-line */}
                    {row.studentId && row.studentData && (
                      <p className="text-[10px] text-slate-500 mt-0.5 pl-7 leading-tight">
                        {row.studentData.applicantId} · {row.studentData.classCode}
                        {row.studentData.guardianMobile ? ` · ${row.studentData.guardianMobile}` : ""}
                      </p>
                    )}

                    {/* Fetch error */}
                    {row.fetchError && (
                      <p className="text-[10px] text-red-500 mt-0.5 flex items-center gap-0.5">
                        <AlertCircle className="h-3 w-3 flex-shrink-0" /> {row.fetchError}
                      </p>
                    )}

                    {/* Search dropdown */}
                    {row.showDropdown && (
                      <div
                        ref={el => { dropdownRefs.current[row.key] = el; }}
                        className="absolute top-full left-0 right-0 z-30 mt-0.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto">

                        {/* Header bar */}
                        <div className="sticky top-0 bg-slate-50 border-b border-slate-100 px-3 py-1.5 flex items-center gap-2">
                          {row.searchText.trim().length > 0 ? (
                            <>
                              <Search className="h-3 w-3 text-slate-400" />
                              <span className="text-[10px] text-slate-500 font-medium">
                                Results for <span className="text-slate-700">"{row.searchText}"</span>
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Browse students</span>
                              <span className="text-[10px] text-slate-300">· type to filter</span>
                            </>
                          )}
                        </div>

                        {row.searching ? (
                          <div className="flex items-center gap-2 px-3 py-4 text-xs text-slate-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                            Searching…
                          </div>
                        ) : row.dropdownResults.length === 0 ? (
                          <div className="px-3 py-5 text-center">
                            <p className="text-xs text-slate-400">No students found</p>
                            {row.searchText.trim().length > 0 && (
                              <p className="text-[10px] text-slate-300 mt-1">Try a different name, GR, or phone number</p>
                            )}
                          </div>
                        ) : (() => {
                          const selectables = row.dropdownResults.filter(
                            s => !rows.some(r => r.key !== row.key && r.studentId === s.id)
                          );
                          return row.dropdownResults.map((s) => {
                            const alreadyAdded = rows.some(r => r.key !== row.key && r.studentId === s.id);
                            const selectableIdx = selectables.indexOf(s);
                            const isActive = !alreadyAdded && selectableIdx === row.activeDropdownIdx;
                            const isCurrent = s.id === row.studentId;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                disabled={alreadyAdded}
                                onMouseDown={e => { e.preventDefault(); selectStudent(row.key, s, idx); }}
                                onMouseEnter={() => {
                                  if (!alreadyAdded) updateRow(row.key, { activeDropdownIdx: selectableIdx });
                                }}
                                className={cn(
                                  "w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-b border-slate-100 last:border-0 transition-colors",
                                  alreadyAdded
                                    ? "opacity-40 cursor-default bg-slate-50"
                                    : isCurrent
                                    ? "bg-emerald-50"
                                    : isActive
                                    ? "bg-blue-50 cursor-pointer"
                                    : "hover:bg-slate-50 cursor-pointer",
                                )}>
                                {/* Status dot */}
                                <span className={cn(
                                  "shrink-0 h-2 w-2 rounded-full",
                                  alreadyAdded ? "bg-slate-200" :
                                  isCurrent    ? "bg-emerald-400" :
                                  isActive     ? "bg-blue-400" : "bg-slate-200",
                                )} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-slate-800 truncate leading-tight">
                                    {s.fullName}
                                    {alreadyAdded && <span className="ml-1.5 text-[9px] text-slate-400 font-normal">already added</span>}
                                    {isCurrent && <span className="ml-1.5 text-[9px] text-emerald-500 font-bold">✓ current</span>}
                                  </p>
                                  <p className="text-[10px] text-slate-400 font-mono leading-tight mt-0.5">
                                    {s.applicantId} · {s.classCode}
                                    {s.guardianMobile ? ` · ${s.guardianMobile}` : ""}
                                  </p>
                                </div>
                                {isActive && (
                                  <span className="shrink-0 text-[10px] text-blue-400 font-medium">↵ select</span>
                                )}
                              </button>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </td>

                  {/* Due Amount */}
                  <td className="border border-slate-200 px-3 py-3.5 text-right align-middle">
                    {row.loading ? (
                      <Skeleton className="h-5 w-20 ml-auto rounded" />
                    ) : row.studentId && row.challans.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">No pending</span>
                    ) : row.dueAmount > 0 ? (
                      <span className="font-mono font-semibold text-slate-700 text-sm">
                        {fmt(row.dueAmount)}
                      </span>
                    ) : null}
                  </td>

                  {/* Fee Types */}
                  <td className="border border-slate-200 px-3 py-3.5 align-middle">
                    <div className="flex flex-wrap gap-1">
                      {row.challans.filter(c => c.amount > 0).map(c => (
                        <span
                          key={c.id}
                          className="inline-flex items-center text-[11px] font-medium bg-slate-100 text-slate-600 rounded px-2 py-0.5 whitespace-nowrap border border-slate-200">
                          {c.feeTypeName} · {fmt(c.amount)}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Paid Amount */}
                  <td className="border border-slate-200 px-1 py-1 align-middle">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none font-medium">
                        Rs
                      </span>
                      <input
                        ref={el => { amountRefs.current[idx] = el; }}
                        type="number"
                        min={0}
                        step={1}
                        value={row.paidAmount}
                        onChange={e => updateRow(row.key, { paidAmount: e.target.value })}
                        onFocus={e => {
                          (e.target as HTMLInputElement).select();
                          setFocusedRowKey(row.key);
                          setFocusedCol("amount");
                        }}
                        onBlur={() => setFocusedRowKey(k => k === row.key ? null : k)}
                        onKeyDown={e => handleAmountKeyDown(e, idx)}
                        disabled={!row.studentId || row.challans.length === 0 || row.loading}
                        placeholder="0"
                        className={cn(
                          "w-full h-10 rounded-none border-0 pl-9 pr-2 text-right text-sm font-mono focus:outline-none focus:ring-2 focus:ring-inset transition-colors",
                          !row.studentId || row.challans.length === 0
                            ? "bg-slate-50 text-slate-300 cursor-not-allowed"
                            : Number(row.paidAmount) > 0 && Number(row.paidAmount) < row.dueAmount
                            ? "bg-amber-50 text-amber-800 focus:ring-amber-400"
                            : Number(row.paidAmount) >= row.dueAmount && row.dueAmount > 0
                            ? "bg-emerald-50 text-emerald-900 focus:ring-emerald-400"
                            : "bg-transparent text-slate-700 focus:ring-blue-400",
                        )}
                      />
                      {/* Partial payment badge */}
                      {row.studentId && row.dueAmount > 0 &&
                        Number(row.paidAmount) > 0 &&
                        Number(row.paidAmount) < row.dueAmount && (
                        <AlertTriangle className="absolute top-1/2 -translate-y-1/2 right-2 h-3.5 w-3.5 text-amber-500 pointer-events-none" />
                      )}
                    </div>
                  </td>

                  {/* Remove */}
                  <td className="border border-slate-200 px-2 py-3.5 align-middle text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="h-7 w-7 flex items-center justify-center mx-auto rounded opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Totals footer */}
            {filledRows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-400">
                  <td colSpan={3} className="border border-slate-300 px-3 py-3.5 text-sm font-bold text-slate-700 uppercase tracking-wider">
                    Total — {filledRows.length} student{filledRows.length > 1 ? "s" : ""}
                    {someChecked && selectedRows.length < filledRows.length
                      ? <span className="text-slate-400 font-normal ml-1">({selectedRows.length} selected)</span>
                      : null}
                  </td>
                  <td className="border border-slate-300 px-3 py-3.5 text-right font-mono font-bold text-slate-700 text-sm">
                    {fmt(totalDue)}
                  </td>
                  <td className="border border-slate-300" />
                  <td className="border border-slate-300 px-3 py-3.5 text-right font-mono font-bold text-slate-900 text-base">
                    {fmt(totalPaid)}
                  </td>
                  <td className="border border-slate-300" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Add row button */}
        <div className="px-4 py-2.5 border-t-2 border-slate-400 bg-slate-50">
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium">
            <Plus className="h-4 w-4" /> Add row
          </button>
        </div>
      </div>

      {/* ── Bottom action bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between rounded-sm border-2 border-slate-300 bg-white shadow-sm px-5 py-3 sticky bottom-4">
        <div className="flex items-center gap-3 text-sm flex-wrap">
          {selectedRows.length > 0 ? (
            <>
              <span className="text-slate-600 font-medium">
                {selectedRows.length} student{selectedRows.length > 1 ? "s" : ""}
              </span>
              <span className="text-slate-300">·</span>
              <span className="font-mono font-semibold text-slate-800">{fmt(selectedPaid)}</span>
              {hasPartial && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-amber-600 text-xs font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> includes partial payments
                  </span>
                </>
              )}
            </>
          ) : (
            <span className="text-slate-400 text-xs">
              Search students and enter amounts to begin
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRows(Array.from({ length: INIT_ROWS }, emptyRow))}
            disabled={rows.every(r => !r.studentId)}
            className="text-slate-500 h-8">
            Clear All
          </Button>
          <Button
            size="sm"
            onClick={handlePostForReview}
            disabled={!canPostForReview}
            className="h-8 bg-slate-800 hover:bg-slate-900 text-white gap-1.5">
            <Eye className="h-3.5 w-3.5" /> Post for Review
          </Button>
        </div>
      </div>
    </div>
  );
}
