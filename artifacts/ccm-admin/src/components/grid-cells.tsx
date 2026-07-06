import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/locale";

interface BaseCellProps {
  editMode: boolean;
  dirty?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  cellRef?: (el: HTMLElement | null) => void;
  cellId?: string;
}

interface GridTextCellProps extends BaseCellProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
}

export function GridTextCell({
  editMode,
  value,
  onChange,
  dirty,
  onKeyDown,
  cellRef,
  cellId,
  placeholder,
  className,
  invalid,
}: GridTextCellProps) {
  if (!editMode) {
    return (
      <span className={cn("text-sm text-slate-700", className)}>
        {value || <span className="text-muted-foreground/50 italic">—</span>}
      </span>
    );
  }
  return (
    <input
      ref={cellRef as (el: HTMLInputElement | null) => void}
      data-cell-id={cellId}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder ?? "—"}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full h-6 px-1.5 text-xs border rounded focus:outline-none focus:ring-1",
        invalid
          ? "bg-red-50 border-red-400 focus:ring-red-400 text-red-700"
          : dirty
            ? "bg-yellow-50 border-amber-400 focus:ring-amber-400 focus:ring-indigo-400"
            : "bg-white border-slate-300 focus:ring-indigo-400",
        className,
      )}
    />
  );
}

interface GridNumberCellProps extends BaseCellProps {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  invalid?: boolean;
}

export function GridNumberCell({
  editMode,
  value,
  onChange,
  dirty,
  onKeyDown,
  cellRef,
  cellId,
  min,
  max,
  placeholder,
  invalid,
}: GridNumberCellProps) {
  if (!editMode) {
    return (
      <span className="text-sm font-mono text-slate-700">
        {value || <span className="text-muted-foreground/50 italic">—</span>}
      </span>
    );
  }
  return (
    <input
      ref={cellRef as (el: HTMLInputElement | null) => void}
      data-cell-id={cellId}
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      min={min}
      max={max}
      placeholder={placeholder ?? "—"}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full h-6 px-1.5 text-xs border rounded focus:outline-none focus:ring-1 text-center font-mono",
        invalid
          ? "bg-red-50 border-red-400 focus:ring-red-400 text-red-700"
          : dirty
            ? "bg-yellow-50 border-amber-400 focus:ring-amber-400"
            : "bg-white border-slate-300 focus:ring-indigo-400",
      )}
    />
  );
}

interface GridSelectCellProps extends BaseCellProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  emptyLabel?: string;
}

export function GridSelectCell({
  editMode,
  value,
  onChange,
  dirty,
  onKeyDown,
  cellRef,
  cellId,
  options,
  emptyLabel,
}: GridSelectCellProps) {
  const label = options.find((o) => o.value === value)?.label;
  const displayText = label ?? value;

  if (!editMode) {
    return (
      <span className="text-sm text-slate-700">
        {displayText || <span className="text-muted-foreground/50 italic">—</span>}
      </span>
    );
  }
  const valueInOptions = !value || options.some((o) => o.value === value);
  return (
    <select
      ref={cellRef as (el: HTMLSelectElement | null) => void}
      data-cell-id={cellId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={cn(
        "w-full h-6 px-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white",
        dirty ? "bg-yellow-50 border-amber-400 focus:ring-amber-400" : "border-slate-300",
      )}
    >
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {!valueInOptions && (
        <option key={`__legacy__${value}`} value={value}>
          {value}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

interface GridDateCellProps extends BaseCellProps {
  value: string;
  onChange: (v: string) => void;
}

export function GridDateCell({
  editMode,
  value,
  onChange,
  dirty,
  onKeyDown,
  cellRef,
  cellId,
}: GridDateCellProps) {
  if (!editMode) {
    const display = value ? formatDate(value) : null;
    return (
      <span className="text-sm text-slate-700">
        {display ?? <span className="text-muted-foreground/50 italic">—</span>}
      </span>
    );
  }
  return (
    <input
      ref={cellRef as (el: HTMLInputElement | null) => void}
      data-cell-id={cellId}
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={cn(
        "w-full h-6 px-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-indigo-400",
        dirty ? "bg-yellow-50 border-amber-400 focus:ring-amber-400" : "bg-white border-slate-300",
      )}
    />
  );
}
