import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, BookOpen, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/locale";

// ── API helpers ────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  // Super-admin sessions have no tenantId embedded in their token, so the
  // server can only resolve a tenant from the request host (which won't match
  // any tenant's configured domain on a dev/preview/test host) or this
  // override header. Mirrors the pattern used elsewhere in ccm-admin.
  const tenant = localStorage.getItem("ccm_admin_website_tenant") || "ccm";
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-Tenant-Id": tenant,
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface CoaAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  kind: string;
  isActive: boolean;
}

interface JESummary {
  id: string;
  date: string;
  narration: string;
  sourceRef: string | null;
  sourceRefId: string | null;
  sourceModule: string | null;
  isVoided: boolean;
  createdAt: string;
  totalAmount: number;
}

interface JELine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  drAmount: number;
  crAmount: number;
  memo: string | null;
  sortOrder: number;
}

interface JEDetail {
  id: string;
  date: string;
  narration: string;
  sourceRef: string | null;
  sourceRefId: string | null;
  sourceModule: string | null;
  isVoided: boolean;
  createdAt: string;
  lines: JELine[];
}

interface JEPage {
  total: number;
  page: number;
  pageSize: number;
  entries: JESummary[];
}

// ── Draft line for the entry form ──────────────────────────────────────────────
// Committed account selection lives here; search/display text is local to AccountSearchCell.

interface DraftLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  drAmount: string;
  crAmount: string;
  memo: string;
}

function newDraftLine(): DraftLine {
  return {
    id: Math.random().toString(36).slice(2),
    accountId: "",
    accountCode: "",
    accountName: "",
    drAmount: "",
    crAmount: "",
    memo: "",
  };
}

// ── Account search combobox cell ───────────────────────────────────────────────
// All search/focus/dropdown state is INTERNAL. The parent only hears about
// committed selections (onSelect) or explicit clears (onClear). This ensures
// that clicking from the account cell to another cell never wipes the selection.

interface SelectedAccount { id: string; code: string; name: string }

function AccountSearchCell({
  selected,
  accounts,
  inputRef,
  onSelect,
  onClear,
  onKeyDown,
  onPaste,
}: {
  selected: SelectedAccount | null;
  accounts: CoaAccount[];
  inputRef?: (el: HTMLInputElement | null) => void;
  onSelect: (acc: CoaAccount) => void;
  onClear: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchText, setSearchText]   = useState("");
  const [isFocused,  setIsFocused]    = useState(false);
  const [isOpen,     setIsOpen]       = useState(false);

  // What the input actually renders: search text while focused, display label otherwise
  const displayValue = isFocused
    ? searchText
    : selected
      ? `${selected.code} — ${selected.name}`
      : "";

  const filtered = searchText.trim()
    ? accounts
        .filter(
          (a) =>
            a.code.toLowerCase().includes(searchText.toLowerCase()) ||
            a.name.toLowerCase().includes(searchText.toLowerCase()),
        )
        .slice(0, 12)
    : accounts.slice(0, 12);

  // Close dropdown only — never reset committed selection — on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
        setSearchText("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleFocus() {
    setIsFocused(true);
    setIsOpen(true);
    setSearchText(""); // let user type fresh; selected account stays committed
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setSearchText(v);
    setIsOpen(true);
    // Explicit full-clear (backspace to empty) removes the committed account
    if (v === "" && selected) {
      onClear();
    }
  }

  function handleSelect(acc: CoaAccount) {
    onSelect(acc);       // commit to parent
    setSearchText("");
    setIsFocused(false);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder="Search account…"
        className={cn(
          "w-full h-6 px-1.5 text-xs border rounded focus:outline-none focus:ring-1",
          selected
            ? "bg-white border-slate-300 focus:ring-indigo-400"
            : "bg-amber-50 border-amber-400 focus:ring-amber-400",
        )}
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-0.5 w-72 bg-white border border-slate-200 rounded shadow-lg overflow-auto max-h-48">
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(a);
              }}
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-indigo-50 flex gap-2 items-center"
            >
              <span className="font-mono text-slate-500 w-14 flex-shrink-0">{a.code}</span>
              <span className="text-slate-700 truncate">{a.name}</span>
              <span
                className={cn(
                  "ml-auto text-[10px] px-1 rounded flex-shrink-0",
                  a.type === "asset"
                    ? "bg-blue-100 text-blue-700"
                    : a.type === "liability"
                      ? "bg-orange-100 text-orange-700"
                      : a.type === "equity"
                        ? "bg-purple-100 text-purple-700"
                        : a.type === "income"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700",
                )}
              >
                {a.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── JE Entry Form (Excel grid) ─────────────────────────────────────────────────
// Columns: 0=account, 1=memo, 2=debit, 3=credit
const COL_COUNT = 4;

function JEForm({
  accounts,
  onCancel,
  onSaved,
}: {
  accounts: CoaAccount[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [narration, setNarration] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() => [newDraftLine(), newDraftLine()]);
  const { toast } = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Refs for grid keyboard navigation: cellRefs[rowIdx][colIdx]
  const cellRefs = useRef<Array<Array<HTMLInputElement | null>>>([]);

  function ensureRef(row: number, col: number) {
    if (!cellRefs.current[row]) cellRefs.current[row] = [];
    return (el: HTMLInputElement | null) => {
      if (!cellRefs.current[row]) cellRefs.current[row] = [];
      cellRefs.current[row]![col] = el;
    };
  }

  function focusCell(row: number, col: number) {
    const el = cellRefs.current[row]?.[col];
    if (el) {
      el.focus();
      if (el.type !== "number") el.select();
    }
  }

  // Add a new row and focus the account cell of the new row
  const addLineAndFocus = useCallback(() => {
    const newLine = newDraftLine();
    setLines((prev) => {
      const next = [...prev, newLine];
      // Focus after state update
      setTimeout(() => focusCell(next.length - 1, 0), 30);
      return next;
    });
  }, []);

  function handleCellKeyDown(
    e: React.KeyboardEvent,
    rowIdx: number,
    colIdx: number,
  ) {
    const isLastRow = rowIdx === lines.length - 1;
    const isLastCol = colIdx === COL_COUNT - 1;

    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (isLastCol) {
        if (isLastRow) {
          addLineAndFocus();
        } else {
          focusCell(rowIdx + 1, 0);
        }
      } else {
        focusCell(rowIdx, colIdx + 1);
      }
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      if (colIdx === 0) {
        if (rowIdx > 0) focusCell(rowIdx - 1, COL_COUNT - 1);
      } else {
        focusCell(rowIdx, colIdx - 1);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isLastRow) {
        addLineAndFocus();
      } else {
        focusCell(rowIdx + 1, colIdx);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (isLastRow) {
        addLineAndFocus();
      } else {
        focusCell(rowIdx + 1, colIdx);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rowIdx > 0) focusCell(rowIdx - 1, colIdx);
    } else if (e.key === "ArrowRight") {
      const target = e.target as HTMLInputElement;
      // Only move cells when the caret is already at the end of the text —
      // otherwise this would hijack normal text editing within a cell.
      // Number inputs don't expose selectionStart/selectionEnd in most
      // browsers (they read back as null), so treat those as always at a
      // navigable boundary — Excel does the same for numeric cells.
      const atEnd =
        target.type === "number" ||
        (target.selectionStart === target.value.length && target.selectionEnd === target.value.length);
      if (atEnd) {
        if (!isLastCol) {
          e.preventDefault();
          focusCell(rowIdx, colIdx + 1);
        }
      }
    } else if (e.key === "ArrowLeft") {
      const target = e.target as HTMLInputElement;
      const atStart = target.type === "number" || (target.selectionStart === 0 && target.selectionEnd === 0);
      if (atStart) {
        if (colIdx > 0) {
          e.preventDefault();
          focusCell(rowIdx, colIdx - 1);
        }
      }
    }
  }

  // ── Excel-style paste — split clipboard TSV/CSV into rows/cells starting at
  // the focused cell, growing the grid as needed. Matches column 0 against the
  // chart of accounts by code, "code — name", or exact name.
  function handleGridPaste(e: React.ClipboardEvent, rowIdx: number, colIdx: number) {
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const rows = text.replace(/\r/g, "").split("\n").filter((r, i, arr) => !(i === arr.length - 1 && r === ""));
    const isMultiCell = rows.length > 1 || rows[0]?.includes("\t");
    if (!isMultiCell) return; // let the browser handle a normal single-cell paste

    e.preventDefault();
    setLines((prev) => {
      const next = [...prev];
      rows.forEach((rowText, ri) => {
        const cells = rowText.split("\t");
        const targetRow = rowIdx + ri;
        while (next.length <= targetRow) next.push(newDraftLine());
        cells.forEach((cellText, ci) => {
          const targetCol = colIdx + ci;
          if (targetCol >= COL_COUNT) return;
          const val = (cellText ?? "").trim();
          const line = { ...next[targetRow] };
          if (targetCol === 0) {
            const codeGuess = val.split(/[\s—-]/)[0];
            const acc = accounts.find(
              (a) =>
                a.code === val ||
                a.code === codeGuess ||
                `${a.code} — ${a.name}` === val ||
                a.name.toLowerCase() === val.toLowerCase(),
            );
            if (acc) {
              line.accountId = acc.id;
              line.accountCode = acc.code;
              line.accountName = acc.name;
            }
          } else if (targetCol === 1) {
            line.memo = val;
          } else if (targetCol === 2) {
            const num = val.replace(/,/g, "");
            line.drAmount = num;
            if (num) line.crAmount = "";
          } else if (targetCol === 3) {
            const num = val.replace(/,/g, "");
            line.crAmount = num;
            if (num) line.drAmount = "";
          }
          next[targetRow] = line;
        });
      });
      return next;
    });
  }

  const totalDr = lines.reduce((s, l) => s + (parseFloat(l.drAmount) || 0), 0);
  const totalCr = lines.reduce((s, l) => s + (parseFloat(l.crAmount) || 0), 0);
  const diff = Math.abs(totalDr - totalCr);
  const balanced = diff < 0.001 && totalDr > 0.001;

  // Valid lines: accountId selected AND (debit or credit is non-zero)
  const validLines = lines.filter(
    (l) => l.accountId && (parseFloat(l.drAmount) > 0 || parseFloat(l.crAmount) > 0),
  );
  const canPost = balanced && validLines.length >= 2 && !submitting;

  function updateLine(id: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function handleAccountSelect(lineId: string, acc: CoaAccount) {
    updateLine(lineId, { accountId: acc.id, accountCode: acc.code, accountName: acc.name });
  }

  function handleAccountClear(lineId: string) {
    updateLine(lineId, { accountId: "", accountCode: "", accountName: "" });
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length > 2 ? prev.filter((l) => l.id !== id) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!date) return setSubmitError("Date is required");
    if (!narration.trim()) return setSubmitError("Narration is required");
    if (!balanced)
      return setSubmitError(
        `Journal entry is unbalanced — DR ${totalDr.toFixed(2)} ≠ CR ${totalCr.toFixed(2)}`,
      );
    if (validLines.length < 2)
      return setSubmitError("At least 2 lines with a valid account and non-zero amount are required");

    setSubmitting(true);
    try {
      await apiFetch("/api/admin/journal-entries", {
        method: "POST",
        body: JSON.stringify({
          date,
          narration: narration.trim(),
          sourceRef: sourceRef.trim() || null,
          lines: validLines.map((l) => ({
            accountId: l.accountId,
            drAmount: parseFloat(l.drAmount) || 0,
            crAmount: parseFloat(l.crAmount) || 0,
            memo: l.memo.trim() || null,
          })),
        }),
      });
      toast({ title: "Journal entry posted", description: `${validLines.length} lines · DR ${totalDr.toFixed(2)}` });
      onSaved();
    } catch (err: any) {
      setSubmitError(err.message ?? "Failed to save journal entry");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-indigo-50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-semibold text-indigo-800">New Journal Entry</span>
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {/* Header fields */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              max={todayIso()}
              className="w-full h-8 px-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Narration <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Description of the transaction…"
              required
              className="w-full h-8 px-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Reference / Voucher No.
            </label>
            <input
              type="text"
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
              placeholder="e.g. JV-001"
              className="w-full h-8 px-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        </div>

        {/* Keyboard hint */}
        <p className="text-[10px] text-slate-400">
          Enter / Tab → next cell &nbsp;·&nbsp; Shift+Tab ← prev cell &nbsp;·&nbsp; Enter / ↓ on last row → add row &nbsp;·&nbsp; ↑↓←→ navigate cells &nbsp;·&nbsp; Paste a range from Excel to fill multiple rows at once
        </p>

        {/* Lines table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-2 py-2 text-left font-medium text-slate-500 w-6">#</th>
                <th className="px-2 py-2 text-left font-medium text-slate-500">Account</th>
                <th className="px-2 py-2 text-left font-medium text-slate-500">Description / Memo</th>
                <th className="px-2 py-2 text-right font-medium text-slate-500 w-32">Debit (Dr)</th>
                <th className="px-2 py-2 text-right font-medium text-slate-500 w-32">Credit (Cr)</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, rowIdx) => (
                <tr key={line.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-1.5 text-slate-400 text-center">{rowIdx + 1}</td>

                  {/* col 0 — account */}
                  <td className="px-2 py-1.5">
                    <AccountSearchCell
                      selected={line.accountId ? { id: line.accountId, code: line.accountCode, name: line.accountName } : null}
                      accounts={accounts}
                      inputRef={ensureRef(rowIdx, 0)}
                      onSelect={(a) => handleAccountSelect(line.id, a)}
                      onClear={() => handleAccountClear(line.id)}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIdx, 0)}
                      onPaste={(e) => handleGridPaste(e, rowIdx, 0)}
                    />
                  </td>

                  {/* col 1 — memo */}
                  <td className="px-2 py-1.5">
                    <input
                      ref={ensureRef(rowIdx, 1)}
                      type="text"
                      value={line.memo}
                      onChange={(e) => updateLine(line.id, { memo: e.target.value })}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIdx, 1)}
                      onPaste={(e) => handleGridPaste(e, rowIdx, 1)}
                      placeholder="Optional memo…"
                      className="w-full h-6 px-1.5 text-xs border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </td>

                  {/* col 2 — debit */}
                  <td className="px-2 py-1.5">
                    <input
                      ref={ensureRef(rowIdx, 2)}
                      type="number"
                      value={line.drAmount}
                      onChange={(e) =>
                        updateLine(line.id, {
                          drAmount: e.target.value,
                          crAmount: e.target.value ? "" : line.crAmount,
                        })
                      }
                      onKeyDown={(e) => handleCellKeyDown(e, rowIdx, 2)}
                      onPaste={(e) => handleGridPaste(e, rowIdx, 2)}
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      className={cn(
                        "w-full h-6 px-1.5 text-xs border rounded bg-white focus:outline-none focus:ring-1 text-right font-mono",
                        parseFloat(line.drAmount) > 0
                          ? "border-blue-400 focus:ring-blue-400 text-blue-700"
                          : "border-slate-300 focus:ring-indigo-400",
                      )}
                    />
                  </td>

                  {/* col 3 — credit */}
                  <td className="px-2 py-1.5">
                    <input
                      ref={ensureRef(rowIdx, 3)}
                      type="number"
                      value={line.crAmount}
                      onChange={(e) =>
                        updateLine(line.id, {
                          crAmount: e.target.value,
                          drAmount: e.target.value ? "" : line.drAmount,
                        })
                      }
                      onKeyDown={(e) => handleCellKeyDown(e, rowIdx, 3)}
                      onPaste={(e) => handleGridPaste(e, rowIdx, 3)}
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      className={cn(
                        "w-full h-6 px-1.5 text-xs border rounded bg-white focus:outline-none focus:ring-1 text-right font-mono",
                        parseFloat(line.crAmount) > 0
                          ? "border-emerald-400 focus:ring-emerald-400 text-emerald-700"
                          : "border-slate-300 focus:ring-indigo-400",
                      )}
                    />
                  </td>

                  <td className="px-1 py-1.5 text-center">
                    {lines.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                        tabIndex={-1}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td colSpan={3} className="px-2 py-2">
                  <button
                    type="button"
                    onClick={addLineAndFocus}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    tabIndex={-1}
                  >
                    <Plus className="h-3 w-3" />
                    Add line
                  </button>
                </td>
                <td className="px-2 py-2 text-right font-mono font-semibold text-sm text-blue-700">
                  {totalDr > 0
                    ? totalDr.toLocaleString("en-PK", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : "—"}
                </td>
                <td
                  className={cn(
                    "px-2 py-2 text-right font-mono font-semibold text-sm",
                    balanced ? "text-emerald-700" : totalCr > 0 ? "text-red-600" : "text-slate-400",
                  )}
                >
                  {totalCr > 0
                    ? totalCr.toLocaleString("en-PK", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : "—"}
                </td>
                <td />
              </tr>
              {totalDr > 0 && !balanced && (
                <tr className="bg-red-50">
                  <td colSpan={6} className="px-2 py-1.5 text-xs text-red-600 font-medium">
                    ⚠ Unbalanced by{" "}
                    {diff.toLocaleString("en-PK", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    — DR and CR totals must be equal before posting
                  </td>
                </tr>
              )}
              {balanced && (
                <tr className="bg-emerald-50">
                  <td colSpan={6} className="px-2 py-1.5 text-xs text-emerald-600 font-medium">
                    ✓ Entry is balanced — {validLines.length} valid line
                    {validLines.length !== 1 ? "s" : ""}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        {submitError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {submitError}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-slate-400">
            {!balanced && totalDr > 0
              ? "Complete the entry to enable posting"
              : validLines.length < 2
                ? "Add at least 2 lines with non-zero amounts"
                : ""}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canPost}
              title={
                !balanced
                  ? "Entry must be balanced (DR = CR)"
                  : validLines.length < 2
                    ? "Need at least 2 valid lines"
                    : "Post journal entry"
              }
              className="px-5 py-1.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Posting…" : "Post Journal Entry"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Inline detail panel (used inside the table as an expanded row) ─────────────

function InlineJEDetail({ jeId }: { jeId: string }) {
  const { data, isLoading } = useQuery<JEDetail>({
    queryKey: ["journal-entry", jeId],
    queryFn: () => apiFetch(`/api/admin/journal-entries/${jeId}`),
    staleTime: 15_000,
  });

  function fmt(n: number) {
    return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  if (isLoading) {
    return (
      <div className="px-8 py-4 space-y-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-3 bg-slate-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const totalDr = data.lines.reduce((s, l) => s + l.drAmount, 0);
  const totalCr = data.lines.reduce((s, l) => s + l.crAmount, 0);

  return (
    <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-400 border-b border-slate-200">
            <th className="pb-1.5 text-left font-medium w-6">#</th>
            <th className="pb-1.5 text-left font-medium">Account</th>
            <th className="pb-1.5 text-left font-medium">Memo</th>
            <th className="pb-1.5 text-right font-medium w-28">Debit</th>
            <th className="pb-1.5 text-right font-medium w-28">Credit</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line, i) => (
            <tr key={line.id} className="border-b border-slate-100 last:border-0">
              <td className="py-1.5 text-slate-400 text-center">{i + 1}</td>
              <td className="py-1.5">
                <span className="font-mono text-slate-500">{line.accountCode}</span>
                <span className="text-slate-700 ml-2">{line.accountName}</span>
              </td>
              <td className="py-1.5 text-slate-400 italic">{line.memo ?? "—"}</td>
              <td className="py-1.5 text-right font-mono text-blue-600">
                {line.drAmount > 0 ? fmt(line.drAmount) : "—"}
              </td>
              <td className="py-1.5 text-right font-mono text-emerald-600">
                {line.crAmount > 0 ? fmt(line.crAmount) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200">
            <td colSpan={3} className="pt-1.5 text-slate-500 font-semibold">Total</td>
            <td className="pt-1.5 text-right font-mono font-bold text-blue-700">{fmt(totalDr)}</td>
            <td className="pt-1.5 text-right font-mono font-bold text-emerald-700">{fmt(totalCr)}</td>
          </tr>
        </tfoot>
      </table>
      {(data.sourceRef || (data.sourceModule && data.sourceModule !== "manual")) && (
        <p className="mt-2 text-xs text-slate-400 flex items-center gap-3">
          {data.sourceRef && (
            <span>Ref: <span className="text-slate-600 font-medium">{data.sourceRef}</span></span>
          )}
          {data.sourceModule && data.sourceModule !== "manual" && (
            <span className="capitalize">Source: {SOURCE_MODULE_LABELS[data.sourceModule] ?? data.sourceModule}</span>
          )}
          {data.sourceModule && data.sourceModule !== "manual" && data.sourceRefId && (
            <SourceLink sourceModule={data.sourceModule} sourceRefId={data.sourceRefId} />
          )}
        </p>
      )}
    </div>
  );
}

// ── Source-module labels + drill-through link resolution ───────────────────────
// Maps the sourceModule strings written by je-factory callers across the app
// to a friendly label and, where a per-record page already exists, a route to
// jump straight to the originating record.
const SOURCE_MODULE_LABELS: Record<string, string> = {
  "fee-billed":       "Fee Challan",
  "fee":              "Fee Collection",
  "vendor-bill":      "Vendor Bill",
  "vendor-bill-pay":  "Vendor Bill Payment",
  "vendor":           "Vendor Payment",
  "application-fee":  "Admission — Application Fee",
  "admission-fee":    "Admission — Admission Fee",
  "payroll-expense":  "Payroll (Salary Accrual)",
  "payroll-payment":  "Payroll (Salary Payment)",
  "store":            "Store Transaction",
  "receipt":          "Receipt Voucher",
  "payment":          "Payment Voucher",
  "manual":           "Manual Entry",
};

type ResolvedSource =
  | { kind: "student"; applicantId: string; label: string }
  | { kind: "employee"; staffId: string; label: string }
  | { kind: "vendor"; vendorId: string; label: string }
  | { kind: null };

function SourceLink({ sourceModule, sourceRefId }: { sourceModule: string; sourceRefId: string }) {
  // Only modules with a real, addressable per-record page get a direct link.
  // Everything else still shows a label (above) but no dead link.
  const isApplication = sourceModule === "application-fee" || sourceModule === "admission-fee";
  const isResolvable =
    sourceModule === "fee-billed" || sourceModule === "fee" ||
    sourceModule === "vendor-bill" || sourceModule === "vendor-bill-pay" ||
    sourceModule === "payroll-expense" || sourceModule === "payroll-payment";

  const { data: appData } = useQuery<{ referenceId: string } | null>({
    queryKey: ["application-ref", sourceRefId],
    queryFn: () =>
      apiFetch<{ referenceId: string }>(`/api/admin/applications/by-id/${sourceRefId}`).catch(() => null),
    staleTime: 60_000,
    retry: false,
    enabled: isApplication,
  });

  const { data: resolved } = useQuery<ResolvedSource>({
    queryKey: ["je-resolve-source", sourceModule, sourceRefId],
    queryFn: () =>
      apiFetch<ResolvedSource>(
        `/api/admin/journal-entries/resolve-source?module=${encodeURIComponent(sourceModule)}&refId=${encodeURIComponent(sourceRefId)}`,
      ).catch(() => ({ kind: null }) as ResolvedSource),
    staleTime: 60_000,
    retry: false,
    enabled: isResolvable,
  });

  if (isApplication) {
    if (!appData?.referenceId) return null;
    return (
      <a href={`/applications/${appData.referenceId}`} className="text-indigo-600 hover:underline font-medium">
        View application →
      </a>
    );
  }
  if (sourceModule === "receipt") {
    return <a href={`/receipt-voucher/${sourceRefId}`} className="text-indigo-600 hover:underline font-medium">View voucher →</a>;
  }
  if (sourceModule === "payment") {
    return <a href={`/payment-voucher/${sourceRefId}`} className="text-indigo-600 hover:underline font-medium">View voucher →</a>;
  }
  if (isResolvable) {
    if (!resolved || resolved.kind === null) return null;
    if (resolved.kind === "student") {
      return (
        <a href={`/students/${resolved.applicantId}?tab=fees`} className="text-indigo-600 hover:underline font-medium">
          View student — {resolved.label} →
        </a>
      );
    }
    if (resolved.kind === "employee") {
      return (
        <a href={`/employees/${resolved.staffId}?tab=salary`} className="text-indigo-600 hover:underline font-medium">
          View employee — {resolved.label} →
        </a>
      );
    }
    if (resolved.kind === "vendor") {
      return (
        <a href={`/vendors?vendorId=${resolved.vendorId}`} className="text-indigo-600 hover:underline font-medium">
          View vendor — {resolved.label} →
        </a>
      );
    }
  }
  return null;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function JournalEntries() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterSourceModule, setFilterSourceModule] = useState("");
  const [filterReference, setFilterReference] = useState("");
  const [referenceInput, setReferenceInput] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pageSize = 20;

  // Deep-link support: /finance?tab=journal-entries&je=<id> opens straight to
  // that entry, bypassing whatever page/filters it would otherwise fall on.
  const [deepLinkJeId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("je"));

  // Build query params from filters
  const filterParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filterFrom) filterParams.set("from", filterFrom);
  if (filterTo) filterParams.set("to", filterTo);
  if (filterSourceModule) filterParams.set("sourceModule", filterSourceModule);
  if (filterReference) filterParams.set("reference", filterReference);

  const { data: jeData, isLoading } = useQuery<JEPage>({
    queryKey: ["journal-entries", page, filterFrom, filterTo, filterSourceModule, filterReference],
    queryFn: () => apiFetch(`/api/admin/journal-entries?${filterParams}`),
    staleTime: 15_000,
  });

  // If we arrived via a JE deep-link, fetch that entry directly (it may live
  // on a different page / outside the current filters) and expand it inline.
  const { data: deepLinkJe } = useQuery<JEDetail>({
    queryKey: ["journal-entry", deepLinkJeId],
    queryFn: () => apiFetch(`/api/admin/journal-entries/${deepLinkJeId}`),
    enabled: !!deepLinkJeId,
    staleTime: 15_000,
    retry: false,
  });

  useEffect(() => {
    if (deepLinkJeId) setExpandedId(deepLinkJeId);
  }, [deepLinkJeId]);

  const { data: coaData } = useQuery<CoaAccount[]>({
    queryKey: ["coa-accounts"],
    queryFn: () => apiFetch("/api/admin/coa"),
    staleTime: 60_000,
  });

  // Only ledger accounts that are active — group accounts cannot receive postings
  const ledgerAccounts = (coaData ?? []).filter((a) => a.kind === "ledger" && a.isActive);
  const entries = jeData?.entries ?? [];
  const total = jeData?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  function handleSaved() {
    setShowForm(false);
    qc.invalidateQueries({ queryKey: ["journal-entries"] });
    setPage(1);
  }

  function applyFilters() {
    setFilterReference(referenceInput.trim());
    setPage(1);
    qc.invalidateQueries({ queryKey: ["journal-entries"] });
  }

  function clearFilters() {
    setFilterFrom("");
    setFilterTo("");
    setFilterSourceModule("");
    setFilterReference("");
    setReferenceInput("");
    setPage(1);
  }

  function fmt(n: number) {
    return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const hasFilter = !!filterFrom || !!filterTo || !!filterSourceModule || !!filterReference;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Journal Entries</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Manual double-entry postings to the general ledger.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setExpandedId(null); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New Journal Entry
          </button>
        )}
      </div>

      {/* New JE form */}
      {showForm && (
        <JEForm
          accounts={ledgerAccounts}
          onCancel={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}

      {/* Deep-linked entry (e.g. opened from a source screen's "Open in Journal
          Entries" link) — shown directly regardless of current page/filters,
          since the entry may not be on the currently visible page. */}
      {deepLinkJeId && deepLinkJe && (
        <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-100/60 border-b border-indigo-200">
            <div className="flex items-center gap-2 text-sm font-medium text-indigo-800">
              <BookOpen className="h-4 w-4" />
              Linked journal entry — {deepLinkJe.date}
              {deepLinkJe.isVoided && (
                <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Voided</span>
              )}
            </div>
            <a href={window.location.pathname + window.location.search.replace(/[?&]je=[^&]*/, "").replace(/^&/, "?")}
               className="text-xs text-indigo-500 hover:underline"
            >
              Dismiss
            </a>
          </div>
          <p className="px-4 pt-3 text-sm text-slate-700">{deepLinkJe.narration}</p>
          <InlineJEDetail jeId={deepLinkJe.id} />
        </div>
      )}

      {/* Date-range filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500 font-medium">From</label>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            max={todayIso()}
            className="h-7 px-2 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500 font-medium">To</label>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            max={todayIso()}
            className="h-7 px-2 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500 font-medium">Source</label>
          <select
            value={filterSourceModule}
            onChange={(e) => setFilterSourceModule(e.target.value)}
            className="h-7 px-2 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
          >
            <option value="">All modules</option>
            <option value="manual">Manual Entry</option>
            {Object.entries(SOURCE_MODULE_LABELS)
              .filter(([key]) => key !== "manual")
              .map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500 font-medium">Ref / Description</label>
          <input
            type="text"
            value={referenceInput}
            onChange={(e) => setReferenceInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
            placeholder="Search reference or narration…"
            className="h-7 px-2 text-xs border border-slate-300 rounded w-52 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
        <button
          onClick={applyFilters}
          className="flex items-center gap-1 h-7 px-3 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700"
        >
          <Search className="h-3 w-3" />
          Filter
        </button>
        {hasFilter && (
          <button
            onClick={clearFilters}
            className="h-7 px-3 text-xs text-slate-500 border border-slate-300 rounded hover:bg-slate-50"
          >
            Clear
          </button>
        )}
        {hasFilter && (
          <span className="text-xs text-slate-400 italic">
            Filtered results ({total} entr{total === 1 ? "y" : "ies"})
          </span>
        )}
      </div>

      {/* List table with inline expandable rows */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border">
              <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs w-5" />
              <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs">Date</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs">Narration</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs">Ref</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500 text-xs">Source</th>
              <th className="px-4 py-3 text-right font-medium text-slate-500 text-xs">Amount</th>
              <th className="px-4 py-3 text-center font-medium text-slate-500 text-xs">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-slate-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            {!isLoading && entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">
                  {hasFilter
                    ? "No journal entries match the selected date range."
                    : "No journal entries yet. Click New Journal Entry to create one."}
                </td>
              </tr>
            )}
            {!isLoading &&
              entries.map((e) => {
                const expanded = expandedId === e.id;
                return (
                  <>
                    <tr
                      key={e.id}
                      onClick={() => setExpandedId(expanded ? null : e.id)}
                      className={cn(
                        "border-b border-border transition-colors cursor-pointer select-none",
                        expanded
                          ? "bg-indigo-50/60 border-indigo-100"
                          : e.isVoided
                            ? "opacity-50 bg-slate-50 hover:bg-slate-100/70"
                            : "hover:bg-slate-50/70",
                      )}
                    >
                      <td className="pl-3 pr-1 py-3 text-slate-400">
                        {expanded
                          ? <ChevronUp className="h-3.5 w-3.5" />
                          : <ChevronDown className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{e.date}</td>
                      <td className="px-4 py-3 text-slate-800 max-w-xs">
                        <span className="line-clamp-1">{e.narration}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{e.sourceRef ?? "—"}</td>
                      <td className="px-4 py-3" onClick={(evt) => evt.stopPropagation()}>
                        {e.sourceModule && e.sourceModule !== "manual" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded whitespace-nowrap">
                              {SOURCE_MODULE_LABELS[e.sourceModule] ?? e.sourceModule}
                            </span>
                            {e.sourceRefId && (
                              <SourceLink sourceModule={e.sourceModule} sourceRefId={e.sourceRefId} />
                            )}
                          </span>
                        ) : (
                          <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                            Manual
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-700">
                        {fmt(e.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.isVoided ? (
                          <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                            Voided
                          </span>
                        ) : (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                            Posted
                          </span>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${e.id}-detail`} className="border-b border-indigo-100 bg-indigo-50/30">
                        <td colSpan={7} className="p-0">
                          <InlineJEDetail jeId={e.id} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-slate-50">
            <span className="text-xs text-slate-500">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-600 px-2">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
