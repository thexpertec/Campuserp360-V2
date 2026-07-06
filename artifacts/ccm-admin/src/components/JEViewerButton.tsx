import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { formatCurrency } from "@/lib/locale";
import { BookOpen, ChevronLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return res.json() as Promise<T>;
}

interface JESummary {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  totalDebit: number;
  status: string;
  type: string;
}

interface JELine {
  id: string;
  coaCode: string;
  coaName: string;
  debitAmount: number;
  creditAmount: number;
  narration?: string | null;
  sortOrder: number;
}

interface JEDetail extends JESummary {
  reference?: string | null;
  notes?: string | null;
  totalCredit: number;
  lines: JELine[];
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface JEViewerButtonProps {
  sourceRefId: string;
  className?: string;
}

const STATUS_DOT: Record<string, string> = {
  posted:   "bg-emerald-500",
  draft:    "bg-amber-400",
  reversed: "bg-slate-400",
};

// ── Component ─────────────────────────────────────────────────────────────────
export function JEViewerButton({ sourceRefId, className }: JEViewerButtonProps) {
  const [open,       setOpen]       = useState(false);
  const [detailId,   setDetailId]   = useState<string | null>(null);

  // List of JEs linked to this source record
  const { data: jes = [], isLoading: listLoading } = useQuery<JESummary[]>({
    queryKey: ["je-by-ref", sourceRefId],
    queryFn:  () => apiFetch<{ rows: JESummary[] }>(
      `/api/admin/journal-entries?sourceRefId=${encodeURIComponent(sourceRefId)}&limit=10`
    ).then(r => r.rows ?? []),
    enabled:   open,
    staleTime: 30_000,
  });

  // Full detail (with lines) for the selected JE
  const { data: detail, isLoading: detailLoading } = useQuery<JEDetail>({
    queryKey: ["je-detail", detailId],
    queryFn:  () => apiFetch<JEDetail>(`/api/admin/journal-entries/${detailId}`),
    enabled:  !!detailId,
    staleTime: 60_000,
  });

  function openPopover(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open) setDetailId(null);
    setOpen(o => !o);
  }

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        title="View journal entries"
        onClick={openPopover}
        className={cn(
          "h-6 w-6 flex items-center justify-center rounded text-slate-400",
          "hover:text-indigo-600 hover:bg-indigo-50 transition-colors",
          open && "text-indigo-600 bg-indigo-50",
        )}
      >
        <BookOpen className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setDetailId(null); }} />

          {/* Popover */}
          <div
            className="absolute right-0 top-7 z-50 w-80 rounded-xl border border-border bg-white shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-3 py-2 border-b border-border bg-slate-50 flex items-center justify-between">
              {detailId ? (
                <button
                  onClick={() => setDetailId(null)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-indigo-600 uppercase tracking-wide transition-colors"
                >
                  <ChevronLeft className="h-3 w-3" /> Back to list
                </button>
              ) : (
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Journal Entries</span>
              )}
              <button onClick={() => { setOpen(false); setDetailId(null); }} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
            </div>

            {/* ── List view ─────────────────────────────────────────── */}
            {!detailId && (
              listLoading ? (
                <div className="flex items-center justify-center py-6 gap-2 text-slate-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : jes.length === 0 ? (
                <div className="py-5 text-center text-xs text-slate-400">No journal entries found.</div>
              ) : (
                <div className="divide-y divide-border max-h-60 overflow-y-auto">
                  {jes.map(je => (
                    <button
                      key={je.id}
                      className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors"
                      onClick={() => setDetailId(je.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0 mt-0.5", STATUS_DOT[je.status] ?? "bg-slate-400")} />
                        <span className="font-mono text-xs font-semibold text-slate-700">{je.entryNumber}</span>
                        <span className="text-[10px] text-slate-400 ml-auto">{je.date}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 truncate pl-3.5">{je.description}</p>
                      <p className="text-[10px] text-slate-400 pl-3.5 mt-0.5 font-mono">
                        {formatCurrency(je.totalDebit)} · <span className={cn("capitalize", je.status === "posted" ? "text-emerald-600" : "text-amber-600")}>{je.status}</span>
                        <span className="text-indigo-400 ml-1">→ click to view lines</span>
                      </p>
                    </button>
                  ))}
                </div>
              )
            )}

            {/* ── Detail view ────────────────────────────────────────── */}
            {detailId && (
              detailLoading || !detail ? (
                <div className="flex items-center justify-center py-6 gap-2 text-slate-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading lines…
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {/* JE header info */}
                  <div className="px-3 py-2.5 border-b border-border bg-slate-50/60">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[detail.status] ?? "bg-slate-400")} />
                      <span className="font-mono text-xs font-semibold text-slate-700">{detail.entryNumber}</span>
                      <span className="text-[10px] text-slate-400 ml-auto">{detail.date}</span>
                    </div>
                    <p className="text-xs text-slate-700 font-medium mt-0.5 pl-3.5">{detail.description}</p>
                    {detail.reference && (
                      <p className="text-[10px] text-slate-400 pl-3.5 font-mono">Ref: {detail.reference}</p>
                    )}
                  </div>

                  {/* Lines table */}
                  <div className="divide-y divide-border">
                    {/* Sub-header */}
                    <div className="grid px-3 py-1 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider"
                      style={{ gridTemplateColumns: "1fr 70px 70px" }}>
                      <div>Account</div>
                      <div className="text-right">Dr</div>
                      <div className="text-right">Cr</div>
                    </div>
                    {detail.lines.map(line => (
                      <div key={line.id}
                        className="grid px-3 py-2 text-xs items-center"
                        style={{ gridTemplateColumns: "1fr 70px 70px" }}>
                        <div>
                          <p className="font-semibold text-slate-700">{line.coaCode} · {line.coaName}</p>
                          {line.narration && <p className="text-[10px] text-slate-400 mt-0.5">{line.narration}</p>}
                        </div>
                        <div className="text-right font-mono text-blue-700">
                          {line.debitAmount > 0 ? formatCurrency(line.debitAmount) : ""}
                        </div>
                        <div className="text-right font-mono text-emerald-700">
                          {line.creditAmount > 0 ? formatCurrency(line.creditAmount) : ""}
                        </div>
                      </div>
                    ))}
                    {/* Totals row */}
                    <div className="grid px-3 py-1.5 bg-slate-50 text-[11px] font-bold"
                      style={{ gridTemplateColumns: "1fr 70px 70px" }}>
                      <div className="text-slate-500 uppercase tracking-wide text-[10px]">Total</div>
                      <div className="text-right font-mono text-blue-800">{formatCurrency(detail.totalDebit)}</div>
                      <div className="text-right font-mono text-emerald-800">{formatCurrency(detail.totalCredit)}</div>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
