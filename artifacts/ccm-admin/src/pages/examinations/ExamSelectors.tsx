import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ClassRecord { id: string; code: string; name: string; }
export interface AcademicYear { id: string; name: string; active: boolean; sortOrder: number; }

export function ClassSelect({
  value, onChange, classes, classesLoading, className,
}: {
  value: string;
  onChange: (v: string) => void;
  classes: ClassRecord[];
  classesLoading: boolean;
  className?: string;
}) {
  if (classesLoading) {
    return (
      <div className={cn("mt-1 flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-muted/40 text-sm text-muted-foreground", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Loading classes…</span>
      </div>
    );
  }
  if (classes.length === 0) {
    return (
      <Select disabled value="">
        <SelectTrigger className={cn("mt-1", className)}>
          <SelectValue placeholder="No classes configured" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__empty__">No classes found — configure in Academic Setup</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("mt-1", className)}>
        <SelectValue placeholder="Select class…" />
      </SelectTrigger>
      <SelectContent>
        {classes.map(c => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function SessionSelect({
  value, onChange, academicYears, className,
}: {
  value: string;
  onChange: (v: string) => void;
  academicYears: AcademicYear[];
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("mt-1", className)}>
        <SelectValue placeholder="Select session…" />
      </SelectTrigger>
      <SelectContent>
        {academicYears.map(y => (
          <SelectItem key={y.id} value={y.name}>
            {y.name}{y.active ? " (Current)" : ""}
          </SelectItem>
        ))}
        {academicYears.length === 0 && (
          <SelectItem value="__empty__" disabled>No academic years configured</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

// ── Filter variants ────────────────────────────────────────────────────────────
// Used in Results, DateSheet, Merit, ReportCard filter bars.
// Empty string = "nothing selected / show all".
// When allLabel is provided, prepends an "All X" item with value "".

export function ClassFilterSelect({
  value, onChange, classes, allLabel, className,
}: {
  value: string;
  onChange: (v: string) => void;
  classes: ClassRecord[];
  allLabel?: string;
  className?: string;
}) {
  // Radix SelectItem requires non-empty values; map "" <-> "__all__" internally.
  const displayValue = allLabel ? (value === "" ? "__all__" : value) : value;
  const handleChange = (v: string) => onChange(allLabel && v === "__all__" ? "" : v);
  return (
    <Select value={displayValue} onValueChange={handleChange}>
      <SelectTrigger className={cn("h-9 text-sm", className)}>
        <SelectValue placeholder={allLabel ?? "Select class…"} />
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value="__all__">{allLabel}</SelectItem>}
        {classes.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
        {!allLabel && classes.length === 0 && (
          <SelectItem value="__empty__" disabled>No classes configured</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

export function SessionFilterSelect({
  value, onChange, academicYears, allLabel, disabled, className,
}: {
  value: string;
  onChange: (v: string) => void;
  academicYears: AcademicYear[];
  allLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  // Radix SelectItem requires non-empty values; map "" <-> "__all__" internally.
  const displayValue = allLabel ? (value === "" ? "__all__" : value) : value;
  const handleChange = (v: string) => onChange(allLabel && v === "__all__" ? "" : v);
  return (
    <Select value={displayValue} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger className={cn("h-9 text-sm", className)}>
        <SelectValue placeholder={allLabel ?? "Select session…"} />
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value="__all__">{allLabel}</SelectItem>}
        {academicYears.map(y => (
          <SelectItem key={y.id} value={y.name}>
            {y.name}{y.active ? " (Current)" : ""}
          </SelectItem>
        ))}
        {!allLabel && academicYears.length === 0 && (
          <SelectItem value="__empty__" disabled>No academic years configured</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
