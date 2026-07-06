import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDate, formatCurrency } from "@/lib/locale";
import { fetchPrintSettings, buildPrintHtml, escapeHtml, printHtmlDocument } from "@/lib/print-utils";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Download, Printer, FileText } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

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

interface LedgerAccount {
  id:   string;
  code: string;
  name: string;
}

interface LedgerResponse {
  account:         LedgerAccount;
  total:           number;
  page:            number;
  pageSize:        number;
  debitTotal:      number;
  creditTotal:     number;
  netBalance:      number;
  openingBalance:  number;
  closingBalance:  number;
  lines:           LedgerLine[];
}

export interface LedgerStatementHeaderField {
  label: string;
  value: string;
}

export interface LedgerStatementProps {
  /** Chart-of-accounts id the entity is linked to (student/employee/vendor coaId). */
  coaId:       string | null | undefined;
  /** Document title used for the print/export output and page heading. */
  title:       string;
  /** Small key/value pairs shown above the statement (e.g. Applicant ID, class, phone). */
  headerFields?: LedgerStatementHeaderField[];
  /** Shown when the entity has no linked ledger account yet. */
  emptyStateHint?: string;
}

const PAGE_SIZE = 50;

function authHeaders(): Record<string, string> {
  const token = getToken();
  const tenant = localStorage.getItem("ccm_admin_website_tenant") || "ccm";
  const headers: Record<string, string> = { "X-Tenant-Id": tenant };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchLedger(coaId: string, params: URLSearchParams): Promise<LedgerResponse> {
  const res = await fetch(`/api/admin/coa/ledger/${coaId}?${params.toString()}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map(r => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Bank-statement-style ledger view: opening balance, dated debit/credit/running
 * balance rows sourced from journal_entry_lines via /admin/coa/ledger/:id, and
 * a closing balance. Shared by Student, Employee, and Vendor ledger screens —
 * callers just pass the entity's coaId and a small header description.
 */
export default function LedgerStatement({ coaId, title, headerFields = [], emptyStateHint }: LedgerStatementProps) {
  const [from, setFrom] = useState("");
  const [to, setTo]     = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [coaId, from, to]);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (from) params.set("from", from);
  if (to)   params.set("to", to);

  const { data, isLoading, isError, error } = useQuery<LedgerResponse>({
    queryKey: ["ledger-statement", coaId, page, from, to],
    queryFn:  () => fetchLedger(coaId as string, params),
    enabled:  !!coaId,
  });

  if (!coaId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground rounded-2xl border border-dashed border-border bg-slate-50/50">
        <FileText className="h-8 w-8 opacity-20" />
        <p className="text-sm font-medium">No ledger account linked</p>
        <p className="text-xs text-slate-400 max-w-sm text-center">
          {emptyStateHint ?? "A ledger account is created automatically once the first transaction is posted for this record."}
        </p>
      </div>
    );
  }

  const lines          = data?.lines ?? [];
  const total          = data?.total ?? 0;
  const totalPages     = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const openingBalance = data?.openingBalance ?? 0;
  const closingBalance = data?.closingBalance ?? 0;

  function balanceLabel(n: number) {
    return `${formatCurrency(Math.abs(n))} ${n >= 0 ? "Dr" : "Cr"}`;
  }

  async function handlePrint() {
    if (!data) return;
    const settings = await fetchPrintSettings();
    const html = buildStatementHtml();
    const printSettingsHtml = buildPrintHtml(html, settings, title);
    printHtmlDocument(printSettingsHtml);
  }

  function buildStatementHtml(): string {
    const rangeLabel = from || to ? `${from ? formatDate(from) : "Start"} – ${to ? formatDate(to) : "Today"}` : "All transactions";
    const headerHtml = headerFields.length
      ? `<table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px">
          <tr>${headerFields.map(f => `<td style="padding:2px 12px 2px 0;color:#64748b">${escapeHtml(f.label)}:</td><td style="padding:2px 0;font-weight:700">${escapeHtml(f.value)}</td>`).join("")}</tr>
        </table>`
      : "";
    const rowsHtml = lines.map((l, i) => `<tr style="${i % 2 === 1 ? "background:#f8fafc" : ""}">
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0">${escapeHtml(formatDate(l.date))}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0">${escapeHtml(l.narration ?? "—")}${l.memo ? `<br/><span style="color:#94a3b8;font-size:9px">${escapeHtml(l.memo)}</span>` : ""}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace">${l.drAmount ? formatCurrency(l.drAmount) : ""}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace">${l.crAmount ? formatCurrency(l.crAmount) : ""}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;font-weight:600">${escapeHtml(balanceLabel(l.runningBalance))}</td>
      </tr>`).join("");

    return `${headerHtml}
      <p style="font-size:10px;color:#94a3b8;margin-bottom:8px">Statement period: ${escapeHtml(rangeLabel)}</p>
      <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px">
        <thead>
          <tr>${["Date", "Description", "Debit", "Credit", "Balance"].map(h => `<th style="background:#f1f5f9;font-weight:700;text-align:${h === "Date" || h === "Description" ? "left" : "right"};padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:.05em">${h}</th>`).join("")}</tr>
        </thead>
        <tbody>
          <tr style="background:#eef2ff"><td colspan="4" style="padding:6px 8px;font-weight:700">Opening Balance</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">${escapeHtml(balanceLabel(openingBalance))}</td></tr>
          ${rowsHtml}
          <tr style="background:#1e293b;color:#fff;font-weight:700"><td colspan="4" style="padding:7px 8px">Closing Balance</td><td style="padding:7px 8px;text-align:right;font-family:monospace">${escapeHtml(balanceLabel(closingBalance))}</td></tr>
        </tbody>
      </table>`;
  }

  function handleExportCsv() {
    if (!data) return;
    const rows: string[][] = [
      ["Date", "Description", "Source", "Memo", "Debit", "Credit", "Balance"],
      ["", "Opening Balance", "", "", "", "", String(openingBalance)],
      ...lines.map(l => [
        l.date,
        l.narration ?? "",
        l.sourceModule ?? "",
        l.memo ?? "",
        l.drAmount ? String(l.drAmount) : "",
        l.crAmount ? String(l.crAmount) : "",
        String(l.runningBalance),
      ]),
      ["", "Closing Balance", "", "", "", "", String(closingBalance)],
    ];
    downloadCsv(`${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-ledger.csv`, rows);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="rounded-2xl border border-border bg-white shadow-sm p-4 flex flex-wrap items-end gap-3 print:hidden">
        <div className="space-y-1.5 min-w-[150px]">
          <Label>From</Label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5 min-w-[150px]">
          <Label>To</Label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 text-sm" />
        </div>
        {(from || to) && (
          <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => { setFrom(""); setTo(""); }}>
            Clear filters
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={handleExportCsv} disabled={!data}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
        <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={handlePrint} disabled={!data}>
          <Printer className="h-3.5 w-3.5" /> Print Statement
        </Button>
      </div>

      {isError ? (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error instanceof Error ? error.message : "Failed to load ledger."}
        </p>
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Opening Balance", v: balanceLabel(openingBalance), c: "text-slate-700" },
              { label: "Total Debit",     v: formatCurrency(data?.debitTotal ?? 0),  c: "text-blue-700" },
              { label: "Total Credit",    v: formatCurrency(data?.creditTotal ?? 0), c: "text-rose-700" },
              { label: "Closing Balance", v: balanceLabel(closingBalance), c: closingBalance >= 0 ? "text-blue-700" : "text-rose-700" },
            ].map(s => (
              <div key={s.label} className="rounded-2xl border border-border bg-white shadow-sm p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
                <p className={cn("text-base font-extrabold mt-1", s.c)}>{s.v}</p>
              </div>
            ))}
          </div>

          {/* Statement table */}
          <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-border">
                  {["Date", "Description", "Debit", "Credit", "Balance"].map((h, i) => (
                    <th key={h} className={cn(
                      "px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500",
                      i === 0 || i === 1 ? "text-left" : "text-right",
                    )}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="bg-indigo-50/60">
                  <td colSpan={4} className="px-4 py-2.5 font-bold text-slate-700 text-xs">Opening Balance</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-800">{balanceLabel(openingBalance)}</td>
                </tr>
                {lines.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">No transactions in this period.</td></tr>
                ) : lines.map(l => (
                  <tr key={l.jeId + l.date + l.runningBalance} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(l.date)}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">{l.narration ?? "—"}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {l.sourceModule ? l.sourceModule.replace(/[-_]/g, " ") : ""}{l.memo ? `${l.sourceModule ? " · " : ""}${l.memo}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-blue-700">{l.drAmount ? formatCurrency(l.drAmount) : "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-rose-700">{l.crAmount ? formatCurrency(l.crAmount) : "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-slate-900">{balanceLabel(l.runningBalance)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-900 text-white">
                  <td colSpan={4} className="px-4 py-3 font-bold text-xs">Closing Balance</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{balanceLabel(closingBalance)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 print:hidden">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 gap-1">
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-8 gap-1">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
