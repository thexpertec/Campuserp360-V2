import { useRef } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/locale";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Plus, X, ChevronsUpDown, Check } from "lucide-react";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccountOption { id: string; code: string; name: string; }

export interface VoucherGridRow {
  id:        string;
  accountId: string;
  ref:       string;
  amount:    string;
}

export function blankRow(): VoucherGridRow {
  return { id: crypto.randomUUID(), accountId: "", ref: "", amount: "" };
}

// ─── Account combobox cell ──────────────────────────────────────────────────────

function AccountCell({
  value, accounts, onChange, readOnly,
}: {
  value: string;
  accounts: AccountOption[];
  onChange: (id: string) => void;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find(a => a.id === value);

  if (readOnly) {
    return (
      <div className="h-9 flex items-center px-2.5 text-xs text-slate-700 truncate">
        {selected ? (
          <span className="truncate"><span className="font-mono text-slate-500">{selected.code}</span> · {selected.name}</span>
        ) : <span className="text-slate-300">—</span>}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-9 w-full flex items-center justify-between gap-1 px-2.5 text-xs text-left bg-transparent",
            "hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:bg-white rounded-sm",
            !selected && "text-slate-400",
          )}>
          <span className="truncate">
            {selected
              ? <><span className="font-mono text-slate-500">{selected.code}</span> · {selected.name}</>
              : "Select account…"}
          </span>
          <ChevronsUpDown className="h-3 w-3 text-slate-400 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[320px]" align="start">
        <Command
          filter={(val, search) => {
            // val is the account id; match against code+name we attach in keywords
            return val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search account…" className="h-9 text-xs" />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-slate-400">No account found.</CommandEmpty>
            <CommandGroup>
              {accounts.map(a => (
                <CommandItem
                  key={a.id}
                  value={`${a.code} ${a.name}`}
                  onSelect={() => { onChange(a.id); setOpen(false); }}
                  className="text-xs gap-2"
                >
                  <Check className={cn("h-3.5 w-3.5", value === a.id ? "opacity-100 text-indigo-600" : "opacity-0")} />
                  <span className="font-mono text-slate-500">{a.code}</span>
                  <span className="truncate">{a.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

export function VoucherGrid({
  rows, accounts, onChange, readOnly = false,
}: {
  rows: VoucherGridRow[];
  accounts: AccountOption[];
  onChange: (rows: VoucherGridRow[]) => void;
  readOnly?: boolean;
}) {
  const gridRef = useRef<HTMLDivElement>(null);

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  function update(id: string, patch: Partial<VoucherGridRow>) {
    onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  function remove(id: string) {
    const next = rows.filter(r => r.id !== id);
    onChange(next.length ? next : [blankRow()]);
  }
  function addRow() {
    onChange([...rows, blankRow()]);
  }

  // Spreadsheet keyboard navigation across input cells (data-cell="r-c").
  function onCellKeyDown(e: React.KeyboardEvent, rowIdx: number, col: number) {
    const isLastRow = rowIdx === rows.length - 1;

    if (e.key === "Enter") {
      e.preventDefault();
      if (col === 2 && isLastRow) {
        // Enter on the last amount cell → append a new row and focus its account ref input
        addRow();
        requestAnimationFrame(() => focusCell(rowIdx + 1, 1));
        return;
      }
      focusCell(rowIdx + 1, col);
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); focusCell(rowIdx + 1, col); }
    if (e.key === "ArrowUp")   { e.preventDefault(); focusCell(rowIdx - 1, col); }
  }

  function focusCell(rowIdx: number, col: number) {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${rowIdx}-${col}"]`);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }

  return (
    <div ref={gridRef} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      {/* Header */}
      <div className="grid grid-cols-[1fr_180px_140px_40px] bg-slate-50 border-b border-slate-200">
        <div className="px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Account</div>
        <div className="px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Ref</div>
        <div className="px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Amount</div>
        <div />
      </div>

      {/* Rows */}
      {rows.map((row, idx) => (
        <div key={row.id}
          className="grid grid-cols-[1fr_180px_140px_40px] border-b border-slate-100 last:border-0 items-center hover:bg-slate-50/40">
          {/* Account */}
          <div className="border-r border-slate-100">
            <AccountCell
              value={row.accountId}
              accounts={accounts}
              readOnly={readOnly}
              onChange={(id) => update(row.id, { accountId: id })}
            />
          </div>

          {/* Ref */}
          <div className="border-r border-slate-100">
            {readOnly ? (
              <div className="h-9 flex items-center px-2.5 text-xs text-slate-600 truncate">{row.ref || <span className="text-slate-300">—</span>}</div>
            ) : (
              <input
                data-cell={`${idx}-1`}
                value={row.ref}
                onChange={e => update(row.id, { ref: e.target.value })}
                onKeyDown={e => onCellKeyDown(e, idx, 1)}
                placeholder="—"
                className="h-9 w-full px-2.5 text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:bg-white rounded-sm"
              />
            )}
          </div>

          {/* Amount */}
          <div className="border-r border-slate-100">
            {readOnly ? (
              <div className="h-9 flex items-center justify-end px-2.5 text-xs font-mono font-semibold text-slate-800">{formatCurrency(Number(row.amount) || 0)}</div>
            ) : (
              <input
                data-cell={`${idx}-2`}
                type="number"
                min={0}
                step="0.01"
                value={row.amount}
                onChange={e => update(row.id, { amount: e.target.value })}
                onKeyDown={e => onCellKeyDown(e, idx, 2)}
                onFocus={e => e.target.select()}
                placeholder="0"
                className="h-9 w-full px-2.5 text-xs font-mono text-right bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:bg-white rounded-sm"
              />
            )}
          </div>

          {/* Remove */}
          <div className="flex items-center justify-center">
            {!readOnly && (
              <button
                type="button"
                onClick={() => remove(row.id)}
                title="Remove row"
                className="h-6 w-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Footer: add row + total */}
      <div className="grid grid-cols-[1fr_180px_140px_40px] bg-slate-50 border-t border-slate-200 items-center">
        <div className="px-2.5 py-2">
          {!readOnly && (
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
              <Plus className="h-3.5 w-3.5" /> Add row
            </button>
          )}
        </div>
        <div className="px-2.5 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</div>
        <div className="px-2.5 py-2 text-right text-sm font-mono font-extrabold text-slate-900">{formatCurrency(total)}</div>
        <div />
      </div>
    </div>
  );
}
