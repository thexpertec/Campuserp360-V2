import { memo, useMemo, useRef, useState, useCallback, useEffect } from "react";
import { displayCnic, displayPhone, formatPhone } from "@/lib/format";
import { formatCurrency } from "@/lib/locale";
import DocumentVerificationTab from "./admissions/DocumentVerificationTab";
import FeeVerificationTab from "./admissions/FeeVerificationTab";
import { AdmissionsDashboard } from "./applications/AdmissionsDashboard";
import { DataTable, type ColDef } from "@/components/DataTable";
import { keepPreviousData, useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  useListAdminApplications,
  getListAdminApplicationsQueryKey,
  useGetAdminApplicationStatusCounts,
  getGetAdminApplicationStatusCountsQueryKey,
  useUpdateAdminApplicationStatus,
  useBulkUpdateAdminApplicationStatus,
  useBulkScheduleAdminApplicationTest,
  useBulkRecordAdminApplicationResult,
  useBulkRecordAdminApplicationInterview,
  useBulkScheduleAdminApplicationInterview,
  useBulkUpdateAdminApplicationMarks,
  useBulkUpdateInterview,
  usePreviewAdminMeritList,
  useCommitAdminMeritList,
  useAnnounceAdminMeritResults,
  useListActiveTestCentres,
  useListAdminTestCentres,
  useEnrollAdminApplication,
  useBulkEnrollAdminApplications,
  useListAdminClasses,
  useListAdminSections,
  useListAdminHouses,
  useListAdminAcademicYears,
  useScheduleAllAdminApplications,
  useBulkUpdateEntryTest,
  useGetAdminAdmissionFormConfig,
  useUpdateAdminAdmissionFormConfig,
  useGetAdminAdmissionPaymentConfig,
  useUpdateAdminAdmissionPaymentConfig,
} from "@workspace/api-client-react";
import TestCentres from "./TestCentres";
import MeritConfig from "./MeritConfig";
import { buildAttendanceSheetHtml } from "./attendanceSheetHtml";
import { getDocType } from "@/pages/printing/doc-types";
import { loadTemplates, getTemplateTypeByPurpose } from "@/pages/printing/templateCache";
import { fetchPrintSettings, buildPrintHtml, escapeHtml, printHtmlDocument, openPrintWindow, type PrintSettings } from "@/lib/print-utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Search, ChevronLeft, ChevronRight, FileArchive, ArrowUpRight, Printer, Loader2,
  CheckCircle, CheckCircle2, CalendarClock, ClipboardCheck, Trophy, X, ChevronsUpDown, ChevronUp,
  ChevronDown, Download, Clipboard, Settings2, Eye, Edit2, Trash2, ChevronRight as Expand,
  Filter, LayoutGrid, GraduationCap, Users, FileCheck, Award, BadgeCheck,
  MapPin, BookOpen, Save, FileText, Rows3, ArrowUpCircle, AlertCircle, Plus, UserPlus, Wand2,
  FlaskConical, Building2, Lock, Ban, MessageSquare, Upload, FileUp, Copy, ShieldAlert, ListChecks, DollarSign,
  XCircle, AlertTriangle,
} from "lucide-react";
import { Link, useSearch } from "wouter";
import { useDebounce } from "@/hooks/use-debounce";
import { useGridEdit } from "@/hooks/use-grid-edit";
import { GridSelectCell, GridDateCell, GridTextCell, GridNumberCell } from "@/components/grid-cells";
import { Skeleton } from "@/components/ui/skeleton";
import { getToken, clearAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Shared table helpers ─────────────────────────────────────────────────────

type Density = "compact" | "comfortable" | "spacious";
const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "compact",     label: "Compact"     },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious",    label: "Spacious"    },
];
const DENSITY_PY: Record<Density, string> = {
  compact:     "[&>td]:py-1",
  comfortable: "[&>td]:py-2.5",
  spacious:    "[&>td]:py-4",
};

function DensityMenu({ density, setDensity }: { density: Density; setDensity: (d: Density) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-slate-600 font-semibold text-xs capitalize">
          <Rows3 className="h-3.5 w-3.5" /> {density}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">Row Density</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {DENSITY_OPTIONS.map(d => (
          <DropdownMenuItem key={d.value} onClick={() => setDensity(d.value)}
            className={cn("text-sm cursor-pointer", density === d.value && "font-semibold text-indigo-600")}>
            {d.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "received",             label: "Application Received",   color: "#94a3b8" },
  { value: "under_review",         label: "Under Review",            color: "#f59e0b" },
  { value: "pending_verification", label: "Pending Verification",    color: "#f97316" },
  { value: "verified",             label: "Documents Verified",      color: "#3b82f6" },
  { value: "test_scheduled",       label: "Test Scheduled",          color: "#8b5cf6" },
  { value: "test_taken",            label: "Test Taken",              color: "#06b6d4" },
  { value: "interview_scheduled",  label: "Interview Scheduled",     color: "#7c3aed" },
  { value: "interview_taken",      label: "Interview Completed",     color: "#0891b2" },
  { value: "result_announced",     label: "Result Announced",        color: "#10b981" },
  { value: "admitted",             label: "Qualified",               color: "#064A1A" },
  { value: "enrolled",             label: "Enrolled",                color: "#0d9488" },
  { value: "on_hold",              label: "On Hold",                 color: "#94a3b8" },
  { value: "rejected",             label: "Not Selected",            color: "#ef4444" },
];


const RESULT_STATUS_OPTIONS = [
  { value: "result_announced", label: "Result Announced" },
  { value: "admitted",         label: "Qualified"        },
  { value: "rejected",         label: "Not Selected"     },
  { value: "on_hold",          label: "On Hold"          },
];

const ENTRY_TEST_STATUS_OPTIONS = STATUS_OPTIONS.filter(o =>
  ["test_scheduled", "test_taken"].includes(o.value)
);
// Pipeline statuses that come BEFORE the entry test has been taken. Marks may
// only be recorded once the applicant is at test_taken or a later stage.
// Kept in sync with the backend guard in api-server routes/admin.ts.
const ET_BEFORE_TEST_TAKEN = ["received", "under_review", "verified", "test_scheduled"];
const INTERVIEW_STATUS_OPTIONS = STATUS_OPTIONS.filter(o =>
  ["interview_scheduled", "interview_taken"].includes(o.value)
);
const MERIT_LIST_STATUS_OPTIONS = [
  { value: "admitted",  label: "Qualified",     color: "#10b981" },
  { value: "rejected",  label: "Not Qualified",  color: "#ef4444" },
];
const ENROLLMENT_STATUS_OPTIONS = [
  { value: "admitted",  label: "Qualified",  color: "#10b981" },
  { value: "on_hold",   label: "On Hold",    color: "#94a3b8" },
  { value: "rejected",  label: "Rejected",   color: "#ef4444" },
  { value: "enrolled",  label: "Enrolled",   color: "#0d9488" },
];

const PIPELINE_STAGES = [
  { key: "",              label: "Applications"        },
  { key: "doc-verify",    label: "Academics"           },
  { key: "fee-verify",    label: "Fee Verification"    },
  { key: "entry-test",    label: "Entry Test"          },
  { key: "interview",     label: "Interview"           },
  { key: "merit-list",    label: "Merit List"          },
  { key: "enrollment",    label: "Enrollment"          },
];

// ─── Column definitions ───────────────────────────────────────────────────────

type ColKey = "referenceId" | "name" | "fatherName" | "class" | "gender" | "center" | "rollNumber" | "testDate" | "dateApplied" | "status" | "source";

const COL_DEFS: { key: ColKey; label: string; defaultVisible: boolean; defaultWidth: number; sortable: boolean }[] = [
  { key: "referenceId", label: "Applicant ID",   defaultVisible: true,  defaultWidth: 130, sortable: true  },
  { key: "name",        label: "Applicant Name", defaultVisible: true,  defaultWidth: 200, sortable: true  },
  { key: "fatherName",  label: "Father's Name",  defaultVisible: false, defaultWidth: 170, sortable: true  },
  { key: "class",       label: "Class/Program Applied",  defaultVisible: true,  defaultWidth: 160, sortable: true  },
  { key: "gender",      label: "Gender",          defaultVisible: false, defaultWidth: 90,  sortable: false },
  { key: "center",      label: "Exam Center",    defaultVisible: true,  defaultWidth: 170, sortable: true  },
  { key: "rollNumber",  label: "Roll No.",        defaultVisible: false, defaultWidth: 110, sortable: true  },
  { key: "testDate",    label: "Test Date",       defaultVisible: false, defaultWidth: 120, sortable: true  },
  { key: "dateApplied", label: "Date Applied",    defaultVisible: true,  defaultWidth: 120, sortable: true  },
  { key: "source",      label: "Source",          defaultVisible: true,  defaultWidth: 160, sortable: true  },
  { key: "status",      label: "Status",          defaultVisible: true,  defaultWidth: 200, sortable: true  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ClassOpt = { value: string; label: string };
let _classOptionsMut: ClassOpt[] = [];
function classLabel(v: string) { return _classOptionsMut.find(c => c.value === v)?.label ?? v; }
function useClassOptions(): { classOptions: ClassOpt[]; isLoading: boolean } {
  const { data, isLoading } = useListAdminClasses();
  const classOptions = useMemo(
    () => (data ?? []).map((c: any) => ({ value: c.code, label: c.name } as ClassOpt)),
    [data]
  );
  useEffect(() => { if (classOptions.length > 0) _classOptionsMut = classOptions; }, [classOptions]);
  return { classOptions, isLoading };
}
function statusLabel(v: string) { return STATUS_OPTIONS.find(s => s.value === v)?.label ?? v; }

// Shared inline-editable status cell used across stage tabs.
// Pass `allowedStatuses` to restrict which statuses can be set from a given tab.
const InlineStatusCell = memo(function InlineStatusCell({ app, onMutate, isUpdating, allowedStatuses, placeholder, currentValue, disabledOptions }: {
  app: any;
  onMutate: (referenceId: string, status: string) => void;
  isUpdating: boolean;
  allowedStatuses?: typeof STATUS_OPTIONS;
  placeholder?: string;
  currentValue?: string;
  disabledOptions?: Set<string>;
}) {
  const opts = allowedStatuses ?? STATUS_OPTIONS;
  const activeValue = currentValue !== undefined ? currentValue : app.status;
  const hasStatus = opts.some(o => o.value === activeValue);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "group/sbtn flex items-center gap-1.5 rounded-lg px-0.5 py-0.5 transition-all hover:bg-slate-100",
            isUpdating && "opacity-50 pointer-events-none"
          )}
          title="Click to change status"
        >
          {isUpdating ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />Updating…
            </span>
          ) : hasStatus ? (
            <>
              <StatusBadge status={activeValue} label={opts.find(o => o.value === activeValue)?.label} />
              <Edit2 className="h-3 w-3 text-slate-300 group-hover/sbtn:text-slate-500 transition-colors shrink-0" />
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11.5px] font-medium text-slate-400 hover:border-slate-300 hover:text-slate-500 transition-colors">
              {placeholder ?? "Set status"}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5 shadow-xl rounded-2xl" align="start" sideOffset={4}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 pb-1.5">Change Status</p>
        {opts.map(opt => {
          const isDisabled = opt.value === activeValue || disabledOptions?.has(opt.value);
          const disabledTitle = disabledOptions?.has(opt.value) ? "Not available" : undefined;
          return (
            <button
              key={opt.value}
              disabled={isDisabled}
              title={disabledTitle}
              className="flex w-full items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              onClick={() => !isDisabled && onMutate(app.referenceId, opt.value)}
            >
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: opt.color }} />
              <span className="text-[12.5px] font-semibold text-slate-700">{opt.label}</span>
              {opt.value === activeValue && <CheckCircle2 className="h-3 w-3 text-emerald-500 ml-auto" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
});

// Reusable inline numeric marks input used across stage tabs (Entry Test, Interview).
const InlineMarksCell = memo(function InlineMarksCell({
  referenceId, value, max, savingId, onSave, disabled, disabledReason,
}: {
  referenceId: string; value: number | null | undefined; max: number;
  savingId: string | null; onSave: (referenceId: string, v: number) => void;
  disabled?: boolean; disabledReason?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isSaving = savingId === referenceId;

  function startEdit() { setDraft(value != null ? String(value) : ""); setEditing(true); }
  function commit() {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n >= 0 && n <= max && n !== value) onSave(referenceId, n);
    setEditing(false);
  }
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);

  if (isSaving) return <div className="flex items-center gap-1.5 px-1.5"><Loader2 className="h-3 w-3 animate-spin text-indigo-400" /></div>;

  if (disabled) return (
    <div className="flex items-center gap-1 px-1.5 py-0.5" title={disabledReason ?? "Not available at this stage"}>
      {value != null
        ? <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">{value}</span>
        : <>
            <Lock className="h-3 w-3 text-slate-200 shrink-0" />
            <span className="text-xs text-slate-300 italic">—</span>
          </>}
    </div>
  );

  if (editing) return (
    <input ref={inputRef} type="number" min={0} max={max} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { e.preventDefault(); setEditing(false); } }}
      className="w-16 h-7 text-center text-sm font-mono border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
    />
  );

  return (
    <button onClick={startEdit} className="group flex items-center gap-1 px-1.5 py-0.5 rounded-lg hover:bg-slate-50 transition-colors" title={`Click to edit (0–${max})`}>
      {value != null
        ? <span className="text-xs font-bold text-slate-700 bg-slate-100 group-hover:bg-white px-2 py-0.5 rounded-full transition-colors">{value}</span>
        : <span className="text-xs text-slate-300 italic">—</span>}
      <Edit2 className="h-3 w-3 text-slate-200 group-hover:text-slate-400 transition-colors opacity-0 group-hover:opacity-100" />
    </button>
  );
});

// Reusable inline percentage input for Academic Scoring tab (previousMarks stored as text).
const InlinePctCell = memo(function InlinePctCell({
  referenceId, value, savingId, onSave,
}: {
  referenceId: string; value: string | null | undefined;
  savingId: string | null; onSave: (referenceId: string, pct: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [rangeError, setRangeError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSaving = savingId === referenceId;
  const numericVal = value ? parseFloat(value.replace("%", "").trim()) : NaN;
  const displayVal = !isNaN(numericVal) ? `${numericVal}%` : null;

  function startEdit() { setDraft(!isNaN(numericVal) ? String(numericVal) : ""); setRangeError(false); setEditing(true); }
  function commit() {
    const trimmed = draft.trim();
    if (trimmed === "") { setEditing(false); setRangeError(false); return; }
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) { setRangeError(true); return; }
    const n = Number(trimmed);
    if (n < 0 || n > 100) { setRangeError(true); return; }
    setRangeError(false);
    onSave(referenceId, String(Math.round(n * 10) / 10));
    setEditing(false);
  }
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);

  if (isSaving) return <div className="flex items-center gap-1.5 px-1.5"><Loader2 className="h-3 w-3 animate-spin text-indigo-400" /></div>;

  if (editing) return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <input ref={inputRef} type="number" min={0} max={100} step={1} value={draft}
          onChange={e => { setDraft(e.target.value); setRangeError(false); }}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { e.preventDefault(); setEditing(false); setRangeError(false); } }}
          className={`w-16 h-7 text-center text-sm font-mono border rounded focus:outline-none focus:ring-1 bg-white ${rangeError ? "border-red-400 text-red-700 focus:ring-red-400" : "border-indigo-300 focus:ring-indigo-500"}`}
        />
        <span className="text-xs text-slate-400">%</span>
      </div>
      {rangeError && <span className="text-xs text-red-600 leading-tight">Must be 0–100</span>}
    </div>
  );

  return (
    <button onClick={startEdit} className="group flex items-center gap-1 px-1.5 py-0.5 rounded-lg hover:bg-slate-50 transition-colors" title="Click to edit (0–100%)">
      {displayVal != null
        ? <span className="text-sm font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors">{displayVal}</span>
        : <span className="text-xs text-slate-300 italic">—</span>}
      <Edit2 className="h-3 w-3 text-slate-200 group-hover:text-slate-400 transition-colors opacity-0 group-hover:opacity-100" />
    </button>
  );
});

function sourceLabel(v: string) {
  if (v === "visitor_inquiry") return "Visitor Inquiry";
  if (v === "online_admission") return "Online Admission";
  return v ?? "";
}

function getCellText(key: ColKey, app: any): string {
  switch (key) {
    case "referenceId": return app.referenceId ?? "";
    case "name":        return app.fullName ?? "";
    case "fatherName":  return app.fatherName ?? "";
    case "class":       return classLabel(app.classApplying ?? "");
    case "gender":      return (app as any).gender ? ({ male: "Male", female: "Female", other: "Other" }[(app as any).gender as string] ?? (app as any).gender) : "";
    case "center":      return `${app.examCenter ?? ""}${app.city ? ` (${app.city})` : ""}`;
    case "rollNumber":  return app.rollNumber ?? "";
    case "testDate":    return app.testDate ? new Date(app.testDate).toLocaleDateString("en-GB") : "";
    case "dateApplied": return app.createdAt ? new Date(app.createdAt).toLocaleDateString("en-GB") : "";
    case "source":      return sourceLabel((app as any).source ?? "online_admission");
    case "status":      return statusLabel(app.status ?? "");
    default:            return "";
  }
}

function useLocalPref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
  });
  const set = useCallback((v: T) => {
    setVal(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key]);
  return [val, set];
}

// ─── Pipeline progress stepper ────────────────────────────────────────────────

function PipelineProgress({ activeTab }: { activeTab: string }) {
  const activeIndex = PIPELINE_STAGES.findIndex(s => s.key === activeTab);
  return (
    <div className="flex items-center bg-white border border-border rounded-2xl px-4 py-2.5 shadow-sm overflow-x-auto gap-0">
      {PIPELINE_STAGES.map((stage, i) => {
        const isActive = stage.key === activeTab;
        const isPast   = i < activeIndex;
        const href     = stage.key ? `/applications?tab=${stage.key}` : "/applications";
        return (
          <div key={stage.key} className="flex items-center shrink-0">
            {i > 0 && (
              <ChevronRight className={cn("h-3.5 w-3.5 mx-1 shrink-0", isPast ? "text-indigo-300" : isActive ? "text-indigo-400" : "text-slate-200")} />
            )}
            <Link href={href}>
              <button className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap",
                isActive ? "bg-indigo-600 text-white shadow-sm"
                         : isPast  ? "text-indigo-600 hover:bg-indigo-50"
                                   : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              )}>
                <span className={cn(
                  "h-4 w-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                  isActive ? "bg-white/25 text-white"
                           : isPast  ? "bg-indigo-100 text-indigo-600"
                                     : "bg-slate-100 text-slate-400"
                )}>
                  {isPast ? "✓" : i + 1}
                </span>
                {stage.label}
              </button>
            </Link>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stage-status derivation helpers ─────────────────────────────────────────

function derivedEntryTestStatus(status: string): { label: string; color: string } | null {
  if (["received","under_review","pending_verification","verified"].includes(status)) return null;
  if (status === "test_scheduled") return { label: "Scheduled", color: "#8b5cf6" };
  return { label: "Taken", color: "#06b6d4" };
}
// Effective entry-test status value (test_scheduled | test_taken) used as the
// Entry Test tab dropdown value. A student at test_taken or any LATER pipeline
// stage (interview, result, admitted, enrolled…) has, by definition, taken the
// test — so the saved status must not visually fall back to the placeholder once
// they advance. Returns undefined for pre-test stages (placeholder is correct).
function entryTestStatusValue(status: string): string | undefined {
  const d = derivedEntryTestStatus(status);
  if (!d) return undefined;
  return status === "test_scheduled" ? "test_scheduled" : "test_taken";
}
function derivedInterviewStatus(status: string): { label: string; color: string } | null {
  if (!["interview_scheduled","interview_taken","result_announced","admitted","enrolled","on_hold","rejected"].includes(status)) return null;
  if (status === "interview_scheduled") return { label: "Scheduled", color: "#7c3aed" };
  return { label: "Completed", color: "#0891b2" };
}
function derivedEnrollmentStatus(status: string): { label: string; color: string } | null {
  const m: Record<string, { label: string; color: string }> = {
    result_announced: { label: "Result Out",   color: "#10b981" },
    admitted:         { label: "Qualified",    color: "#064A1A" },
    enrolled:         { label: "Enrolled",     color: "#0d9488" },
    on_hold:          { label: "On Hold",      color: "#94a3b8" },
    rejected:         { label: "Not Selected", color: "#ef4444" },
  };
  return m[status] ?? null;
}

function StagePill({ s }: { s: { label: string; color: string } | null }) {
  if (!s) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: `${s.color}22`, color: s.color }}>
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ col, sortCol, sortDir }: { col: ColKey; sortCol: string; sortDir: "asc" | "desc" | null }) {
  if (sortCol !== col) return <ChevronsUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-400" />;
  if (sortDir === "asc")  return <ChevronUp   className="h-3 w-3 text-indigo-600" />;
  return <ChevronDown className="h-3 w-3 text-indigo-600" />;
}

// ─── Expanded row detail ──────────────────────────────────────────────────────

function ExpandedRow({ app, colSpan, onClose }: { app: any; colSpan: number; onClose: () => void }) {
  const feeStatusLabel = (fs: string) => {
    if (fs === "paid")      return "Paid";
    if (fs === "submitted") return "Submitted";
    return "Pending";
  };
  const fields = [
    { label: "Father's Name",    value: app.fatherName       ?? "—" },
    { label: "Date of Birth",    value: app.dob              ? new Date(app.dob).toLocaleDateString("en-GB") : "—" },
    { label: "Contact",          value: app.contactNumber    ?? "—" },
    { label: "Roll Number",      value: app.rollNumber       ?? "—" },
    { label: "Test Date",        value: app.testDate         ? new Date(app.testDate).toLocaleDateString("en-GB") : "—" },
    { label: "Exam Center",      value: app.examCenter       ?? "—" },
    { label: "City",             value: app.city             ?? "—" },
    { label: "Class/Program Applied",    value: classLabel(app.classApplying ?? "") },
    { label: "Payment Status",   value: feeStatusLabel(app.feeStatus ?? "pending") },
    { label: "Application Date", value: app.createdAt ? new Date(app.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
  ];
  return (
    <tr className="bg-indigo-50/40 border-b border-indigo-100">
      <td colSpan={colSpan} className="px-6 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 mb-4">
          {fields.map(f => (
            <div key={f.label}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{f.label}</p>
              <p className="text-[13px] font-semibold text-slate-800 mt-0.5">{f.value}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/applications/${app.referenceId}`}>
            <Button size="sm" className="h-7 text-xs gap-1.5">
              <Eye className="h-3 w-3" /> View Full Application
            </Button>
          </Link>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500" onClick={onClose}>
            <X className="h-3 w-3 mr-1" /> Collapse
          </Button>
        </div>
      </td>
    </tr>
  );
}

function parseAcadPct(v: string): number {
  const n = parseFloat(v.replace(/%/g, "").trim());
  return isNaN(n) || n < 0 ? 0 : Math.min(n, 100);
}

function computeScores(pct: string, test: string, intv: string) {
  const rawA = pct.trim();
  const a = rawA ? (parseAcadPct(rawA) / 100) * 20 : null;
  const nt = parseInt(test.trim());
  const t  = test.trim() && !isNaN(nt) && nt >= 0 && nt <= 100 ? (nt / 100) * 50 : null;
  const ni = parseInt(intv.trim());
  const iv = intv.trim() && !isNaN(ni) && ni >= 0 && ni <= 30 ? ni : null;
  const allEntered = a !== null && t !== null && iv !== null;
  const anyEntered = a !== null || t !== null || iv !== null;
  const meritRaw = allEntered
    ? (a! + t! + iv!)
    : anyEntered
    ? ((a ?? 0) + (t ?? 0) + (iv ?? 0))
    : null;
  const merit = meritRaw !== null && !isNaN(meritRaw) ? Math.round(meritRaw * 10) / 10 : null;
  return {
    acad:      a     !== null ? Math.round(a  * 10) / 10 : null,
    test:      t     !== null ? Math.round(t  * 10) / 10 : null,
    merit,
    isPartial: anyEntered && !allEntered,
  };
}


// ─── Interview Page Wrapper ───────────────────────────────────────────────────
// Performa sub-tab removed — interview marks entered inline in the main grid.

function InterviewPageWrapper() {
  return <InterviewTab />;
}

// ─── Academic Scoring Tab ─────────────────────────────────────────────────────

function AcademicScoringTab() {
  const { toast }  = useToast();
  const queryClient = useQueryClient();
  const { classOptions } = useClassOptions();
  const [classFilter, setClassFilter] = useState("all");
  const [cityFilter, setCityFilter]   = useState("all");
  const [searchTerm, setSearchTerm]   = useState("");
  const [page, setPage]               = useState(1);
  const [savingId, setSavingId]       = useState<string | null>(null);
  const debouncedSearch = useDebounce(searchTerm, 400);
  const PAGE_SIZE = 50;

  const { data: availableCities = [] } = useQuery<string[]>({
    queryKey: ["/api/admin/applications/cities"],
    queryFn: async () => {
      const res = await fetch("/api/admin/applications/cities", { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["/api/admin/applications"] }); }

  async function savePct(referenceId: string, pct: string) {
    setSavingId(referenceId);
    try {
      const res = await fetch(`/api/admin/applications/${referenceId}/marks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ previousMarks: pct }),
      });
      if (!res.ok) throw new Error("Failed");
      invalidate();
      toast({ title: "Academic marks saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }

  const qp = {
    classApplying: classFilter !== "all" ? classFilter : undefined,
    city: cityFilter !== "all" ? cityFilter : undefined,
    q: debouncedSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const { data, isLoading } = useListAdminApplications(qp, {
    query: { queryKey: getListAdminApplicationsQueryKey(qp), placeholderData: keepPreviousData },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  function parseAcad(prev: string | null | undefined): number | null {
    if (!prev) return null;
    const pct = parseFloat(prev.replace("%", "").trim());
    return isNaN(pct) ? null : Math.round((pct / 100) * 20 * 10) / 10;
  }

  type ARow = (typeof items)[number] & { id: string };
  const rows: ARow[] = items.map(a => ({ ...a, id: a.referenceId }));

  const columns: ColDef<ARow>[] = [
    { key: "referenceId", label: "Applicant ID",     defaultVisible: true, defaultWidth: 130, render: r => <span className="font-mono text-xs font-bold text-indigo-600">{r.referenceId}</span>, getText: r => r.referenceId },
    { key: "name",        label: "Student Name",     defaultVisible: true, defaultWidth: 200, render: r => <div><p className="font-semibold text-slate-800 text-[13px]">{r.fullName}</p><p className="text-[11px] text-slate-400">{r.fatherName ?? ""}</p></div>, getText: r => r.fullName ?? "" },
    { key: "class",       label: "Class/Program",            defaultVisible: true, defaultWidth: 110, render: r => <span className="text-[12px] text-slate-600">{classLabel(r.classApplying ?? "")}</span>, getText: r => r.classApplying ?? "" },
    { key: "pct",         label: "Prev Marks %",     defaultVisible: true, defaultWidth: 140,
      render: r => <InlinePctCell referenceId={r.referenceId} value={(r as any).previousMarks} savingId={savingId} onSave={savePct} />,
      getText: r => (r as any).previousMarks ?? "",
    },
    { key: "score",       label: "Academic /20",     defaultVisible: true, defaultWidth: 120,
      render: r => { const s = parseAcad((r as any).previousMarks); return s !== null ? <span className="text-sm font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">{s}</span> : <span className="text-slate-300 text-xs">—</span>; },
      getText: r => { const s = parseAcad((r as any).previousMarks); return s !== null ? String(s) : ""; },
    },
    { key: "status",      label: "Status",           defaultVisible: true, defaultWidth: 170, render: r => <StatusBadge status={r.status} />, getText: r => statusLabel(r.status ?? "") },
  ];

  const withScoreCount = useMemo(() => rows.filter(r => (r as any).previousMarks && !isNaN(parseFloat(String((r as any).previousMarks)))).length, [rows]);

  return (
    <DataTable
      tableId="ccm_academic_scoring_v1"
      title="Academic Scoring"
      subtitle={`${total} applicant${total !== 1 ? "s" : ""} · ${withScoreCount} with academic marks`}
      filters={
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(1); }} placeholder="Search name or ID…" className="pl-8 h-9 text-sm w-64" />
          </div>
          <Select value={classFilter} onValueChange={v => { setClassFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="All Classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cityFilter} onValueChange={v => { setCityFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="All Cities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {availableCities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      }
      columns={columns}
      data={rows}
      total={total}
      isLoading={isLoading}
      page={page}
      pageSize={PAGE_SIZE}
      onPageChange={setPage}
      exportFilename={`academic-scoring-${new Date().toISOString().slice(0,10)}`}
      printTitle="Academic Scoring"
      rowActions={r => (
        <Link href={`/applications/${r.referenceId}`}>
          <button className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
            <Eye className="h-3.5 w-3.5" />
          </button>
        </Link>
      )}
      emptyIcon={<div className="h-14 w-14 rounded-2xl bg-sky-50 flex items-center justify-center"><GraduationCap className="h-7 w-7 text-sky-200" /></div>}
      emptyTitle="No applications found"
      emptyDescription="Use the search and class filters above to find candidates."
    />
  );
}

// ─── Setup Tab (Venues + Merit Formula) ──────────────────────────────────────

// ─── Test Schedules Manager ───────────────────────────────────────────────────

const TEST_SCHEDULE_STATUSES = [
  { value: "upcoming",   label: "Upcoming",   color: "bg-blue-50 border-blue-200 text-blue-700",     dot: "bg-blue-500"   },
  { value: "ongoing",    label: "Ongoing",    color: "bg-amber-50 border-amber-200 text-amber-700",   dot: "bg-amber-500"  },
  { value: "completed",  label: "Completed",  color: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "bg-emerald-500" },
  { value: "cancelled",  label: "Cancelled",  color: "bg-slate-50 border-slate-200 text-slate-400",   dot: "bg-slate-300"  },
];

interface TestSchedule {
  id: string; title: string; testDate: string; testTime: string | null;
  centreId: string | null; centreName: string | null; classApplying: string | null;
  session: string | null; totalSeats: number | null; notes: string | null; status: string;
}

const BLANK_SCHEDULE: Omit<TestSchedule, "id"> = {
  title: "", testDate: "", testTime: "", centreId: null, centreName: "",
  classApplying: "", session: "", totalSeats: null, notes: "", status: "upcoming",
};

function TestSchedulesManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState<Omit<TestSchedule, "id">>(BLANK_SCHEDULE);
  const [saving, setSaving]       = useState(false);

  const { data: centresData } = useQuery<{ items: { id: string; name: string; city: string; venueType: string }[] }>({
    queryKey: ["/api/admin/test-centres"],
    queryFn: async () => {
      const res = await fetch("/api/admin/test-centres?active=true&pageSize=200", { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (!res.ok) return { items: [] };
      return res.json();
    },
    staleTime: 60_000,
  });
  const centres = useMemo(() => (centresData?.items ?? []).filter(c => c.venueType !== "interview"), [centresData]);

  const { data: classesData } = useListAdminClasses();
  const classOptions = useMemo(() => (classesData ?? []).map((c: any) => ({ value: c.code as string, label: c.name as string })), [classesData]);

  const { data: academicYearsData } = useListAdminAcademicYears();
  const yearOptions = useMemo(() => (academicYearsData ?? []).map((y: any) => ({ value: y.id as string, label: y.name as string })), [academicYearsData]);

  const [classOpen, setClassOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);

  const { data, isLoading } = useQuery<{ items: TestSchedule[] }>({
    queryKey: ["/api/admin/test-schedules"],
    queryFn: async () => {
      const res = await fetch("/api/admin/test-schedules", { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });
  const schedules = data?.items ?? [];

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["/api/admin/test-schedules"] }); }

  function openAdd() { setForm(BLANK_SCHEDULE); setEditId(null); setShowForm(true); }
  function openEdit(s: TestSchedule) {
    setForm({ title: s.title, testDate: s.testDate, testTime: s.testTime ?? "", centreId: s.centreId, centreName: s.centreName ?? "", classApplying: s.classApplying ?? "", session: s.session ?? "", totalSeats: s.totalSeats, notes: s.notes ?? "", status: s.status });
    setEditId(s.id);
    setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditId(null); }

  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.title.trim() || !form.testDate.trim() || !form.classApplying || !form.session) return;
    setSaving(true);
    try {
      const url  = editId ? `/api/admin/test-schedules/${editId}` : "/api/admin/test-schedules";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ ...form, totalSeats: form.totalSeats || null }),
      });
      if (!res.ok) throw new Error("Failed");
      invalidate();
      closeForm();
      toast({ title: editId ? "Schedule updated" : "Schedule created" });
    } catch { toast({ title: "Save failed", variant: "destructive" }); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/admin/test-schedules/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (!res.ok) throw new Error("Failed");
      invalidate();
      toast({ title: "Schedule removed" });
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      const res = await fetch(`/api/admin/test-schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      invalidate();
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
  }

  const statusInfo = (s: string) => TEST_SCHEDULE_STATUSES.find(x => x.value === s) ?? TEST_SCHEDULE_STATUSES[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Test Schedules</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage entry test sessions — dates, venues, and seat allocation.</p>
        </div>
        <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add Schedule
        </Button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="border border-violet-200 bg-violet-50/40 rounded-xl p-5 space-y-4">
          <p className="text-sm font-semibold text-violet-800">{editId ? "Edit Schedule" : "New Test Schedule"}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Title *</Label>
              <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Entry Test — Session 2026 Batch A" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Test Date *</Label>
              <Input type="date" value={form.testDate} onChange={e => set("testDate", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Start Time</Label>
              <Input type="time" value={form.testTime ?? ""} onChange={e => set("testTime", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Venue</Label>
              <Select value={form.centreId ?? "__none__"} onValueChange={val => {
                const c = centres.find(x => x.id === val);
                set("centreId", val === "__none__" ? null : val);
                set("centreName", c?.name ?? "");
              }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select venue" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {centres.map(c => <SelectItem key={c.id} value={c.id}>{c.name} · {c.city}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Total Seats</Label>
              <Input type="number" min={0} value={form.totalSeats ?? ""} onChange={e => set("totalSeats", e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 120" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Class/Program Applying *</Label>
              <Popover open={classOpen} onOpenChange={setClassOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className={cn(
                    "flex h-8 w-full items-center justify-between rounded-md border bg-white px-3 text-sm shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-ring",
                    !form.classApplying ? "text-muted-foreground border-slate-200" : "text-slate-900 border-slate-300"
                  )}>
                    <span className="truncate">{classOptions.find(c => c.value === form.classApplying)?.label ?? "Select class…"}</span>
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search class…" className="h-8 text-sm" />
                    <CommandList>
                      <CommandEmpty className="text-sm">No class found.</CommandEmpty>
                      <CommandGroup>
                        {classOptions.map(c => (
                          <CommandItem key={c.value} value={c.label} onSelect={() => { set("classApplying", c.value); setClassOpen(false); }}
                            className={cn("text-sm cursor-pointer", form.classApplying === c.value && "font-semibold text-indigo-600")}>
                            {c.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Session *</Label>
              <Popover open={sessionOpen} onOpenChange={setSessionOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className={cn(
                    "flex h-8 w-full items-center justify-between rounded-md border bg-white px-3 text-sm shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-ring",
                    !form.session ? "text-muted-foreground border-slate-200" : "text-slate-900 border-slate-300"
                  )}>
                    <span className="truncate">{yearOptions.find(y => y.value === form.session)?.label ?? "Select session…"}</span>
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search session…" className="h-8 text-sm" />
                    <CommandList>
                      <CommandEmpty className="text-sm">No session found.</CommandEmpty>
                      <CommandGroup>
                        {yearOptions.map(y => (
                          <CommandItem key={y.value} value={y.label} onSelect={() => { set("session", y.value); setSessionOpen(false); }}
                            className={cn("text-sm cursor-pointer", form.session === y.value && "font-semibold text-indigo-600")}>
                            {y.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} placeholder="Any additional instructions…" className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 bg-violet-600 hover:bg-violet-700" onClick={handleSave} disabled={saving || !form.title.trim() || !form.testDate.trim() || !form.classApplying || !form.session}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {editId ? "Update" : "Create"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={closeForm}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-left">Title</th>
              <th className="px-4 py-2.5 text-left">Date</th>
              <th className="px-4 py-2.5 text-left">Time</th>
              <th className="px-4 py-2.5 text-left">Venue</th>
              <th className="px-4 py-2.5 text-left">Class</th>
              <th className="px-4 py-2.5 text-left">Seats</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400 text-xs">Loading…</td></tr>
            )}
            {!isLoading && schedules.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">No test schedules yet</td></tr>
            )}
            {schedules.map(s => {
              const si = statusInfo(s.status);
              return (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{s.title}</td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                    {s.testDate ? new Date(s.testDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{s.testTime ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-slate-600">{s.centreName ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-slate-500">{s.classApplying ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-slate-500">{s.totalSeats ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2.5">
                    <Select value={s.status} onValueChange={val => handleStatusChange(s.id, val)}>
                      <SelectTrigger className={cn("h-6 text-[10px] font-semibold border rounded-full px-2 gap-1 w-auto shadow-none", si.color)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", si.dot)} /><SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEST_SCHEDULE_STATUSES.map(st => (
                          <SelectItem key={st.value} value={st.value} className="text-xs">{st.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(s)}>
                        <Edit2 className="h-3 w-3 text-slate-400" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDelete(s.id)}>
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Interviewers Manager ─────────────────────────────────────────────────────

interface Interviewer { id: string; name: string; designation: string | null; active: boolean; sortOrder: number; }

function InterviewersManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd]         = useState(false);
  const [addName, setAddName]         = useState("");
  const [addDesig, setAddDesig]       = useState("");
  const [saving, setSaving]           = useState(false);
  const [editId, setEditId]           = useState<string | null>(null);
  const [editName, setEditName]       = useState("");
  const [editDesig, setEditDesig]     = useState("");

  const { data, isLoading } = useQuery<{ items: Interviewer[] }>({
    queryKey: ["/api/admin/interviewers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/interviewers", { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });
  const interviewers = data?.items ?? [];

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["/api/admin/interviewers"] }); }

  async function handleAdd() {
    if (!addName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/interviewers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ name: addName.trim(), designation: addDesig.trim() || null }),
      });
      if (!res.ok) throw new Error("Failed");
      setAddName(""); setAddDesig(""); setShowAdd(false);
      invalidate();
      toast({ title: "Interviewer added" });
    } catch { toast({ title: "Failed to add", variant: "destructive" }); }
    finally { setSaving(false); }
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/interviewers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ name: editName.trim(), designation: editDesig.trim() || null }),
      });
      if (!res.ok) throw new Error("Failed");
      setEditId(null);
      invalidate();
      toast({ title: "Interviewer updated" });
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
    finally { setSaving(false); }
  }

  async function handleToggleActive(iv: Interviewer) {
    try {
      const res = await fetch(`/api/admin/interviewers/${iv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ active: !iv.active }),
      });
      if (!res.ok) throw new Error("Failed");
      invalidate();
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/admin/interviewers/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed");
      invalidate();
      toast({ title: "Interviewer removed" });
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Interviewers</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage the panel of interviewers. Active interviewers appear in the Interview tab dropdown.</p>
        </div>
        <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add Interviewer
        </Button>
      </div>

      {showAdd && (
        <div className="border border-violet-200 bg-violet-50/50 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-violet-800">New Interviewer</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. Col. Ahmed Khan" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Designation</Label>
              <Input value={addDesig} onChange={e => setAddDesig(e.target.value)} placeholder="e.g. Principal" className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 bg-violet-600 hover:bg-violet-700" onClick={handleAdd} disabled={saving || !addName.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => { setShowAdd(false); setAddName(""); setAddDesig(""); }}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-left">#</th>
              <th className="px-4 py-2.5 text-left">Name</th>
              <th className="px-4 py-2.5 text-left">Designation</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-xs">Loading…</td></tr>
            )}
            {!isLoading && interviewers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">No interviewers added yet</td></tr>
            )}
            {interviewers.map((iv, i) => (
              <tr key={iv.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 text-slate-400 text-xs font-mono">{i + 1}</td>
                <td className="px-4 py-2.5">
                  {editId === iv.id ? (
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-sm w-48" />
                  ) : (
                    <span className="font-medium text-slate-800">{iv.name}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-500">
                  {editId === iv.id ? (
                    <Input value={editDesig} onChange={e => setEditDesig(e.target.value)} className="h-7 text-sm w-40" placeholder="Designation" />
                  ) : (
                    iv.designation ?? <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <button onClick={() => handleToggleActive(iv)} className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                    iv.active
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-slate-50 border-slate-200 text-slate-400"
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", iv.active ? "bg-emerald-500" : "bg-slate-300")} />
                    {iv.active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {editId === iv.id ? (
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => handleSaveEdit(iv.id)} disabled={saving}>
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-slate-400" onClick={() => setEditId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setEditId(iv.id); setEditName(iv.name); setEditDesig(iv.designation ?? ""); }}>
                        <Edit2 className="h-3 w-3 text-slate-400" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDelete(iv.id)}>
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Form Fields Manager ──────────────────────────────────────────────────────

function FormFieldsManager() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: fields, isLoading } = useGetAdminAdmissionFormConfig();

  // Local editable state — initialised from server data, mutated on toggle.
  const [draft, setDraft] = useState<Record<string, { enabled: boolean; required: boolean }>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!fields) return;
    const map: Record<string, { enabled: boolean; required: boolean }> = {};
    for (const f of fields) map[f.fieldKey] = { enabled: f.enabled, required: f.required };
    setDraft(map);
    setDirty(false);
  }, [fields]);

  const mut = useUpdateAdminAdmissionFormConfig({
    mutation: {
      onSuccess: () => {
        toast({ title: "Form field settings saved" });
        qc.invalidateQueries({ queryKey: ["getAdminAdmissionFormConfig"] });
        setDirty(false);
      },
      onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
    },
  });

  function toggle(fieldKey: string, prop: "enabled" | "required", value: boolean) {
    setDraft((prev) => {
      const cur = prev[fieldKey] ?? { enabled: true, required: true };
      const next = { ...cur, [prop]: value };
      // If disabling a field, also mark required=false
      if (prop === "enabled" && !value) next.required = false;
      // If re-enabling, restore required=true as a sensible default
      if (prop === "enabled" && value) next.required = true;
      return { ...prev, [fieldKey]: next };
    });
    setDirty(true);
  }

  function save() {
    const payload = (fields ?? []).map((f) => ({
      fieldKey: f.fieldKey,
      enabled: draft[f.fieldKey]?.enabled ?? f.enabled,
      required: draft[f.fieldKey]?.required ?? f.required,
    }));
    mut.mutate({ data: payload });
  }

  if (isLoading) {
    return (
      <div className="py-8 flex items-center justify-center text-sm text-slate-500 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading field configuration…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600">
            Toggle which fields appear on the public admissions form. Disabled fields are hidden from applicants and skipped during validation.
            Fields marked <strong>Always on</strong> are mandatory and cannot be removed.
          </p>
        </div>
        <Button size="sm" disabled={!dirty || mut.isPending} onClick={save} className="shrink-0">
          {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
          Save Changes
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-700 w-[45%]">Field</th>
              <th className="text-center px-4 py-2.5 font-semibold text-slate-700 w-[15%]">Step</th>
              <th className="text-center px-4 py-2.5 font-semibold text-slate-700 w-[20%]">Visible</th>
              <th className="text-center px-4 py-2.5 font-semibold text-slate-700 w-[20%]">Required</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(fields ?? []).map((f) => {
              const cur = draft[f.fieldKey] ?? { enabled: f.enabled, required: f.required };
              const stepLabels: Record<number, string> = { 2: "Student", 3: "Contact", 4: "Guardian" };
              return (
                <tr key={f.fieldKey} className={cn("transition-colors", !cur.enabled && "bg-slate-50/60 text-slate-400")}>
                  <td className="px-4 py-3 font-medium">{f.label}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600">
                      {stepLabels[(f as any).step] ?? `Step ${(f as any).step}`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={cur.enabled}
                      onCheckedChange={(v) => toggle(f.fieldKey, "enabled", v)}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {f.canToggleRequired ? (
                      <Switch
                        checked={cur.required}
                        disabled={!cur.enabled}
                        onCheckedChange={(v) => toggle(f.fieldKey, "required", v)}
                      />
                    ) : (
                      <span className="text-xs text-slate-400 italic">fixed</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Fee & Payment manager ────────────────────────────────────────────────────

function FeePaymentManager() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: config, isLoading } = useGetAdminAdmissionPaymentConfig();

  const [draft, setDraft] = useState({
    applicationFeeEnabled: true,
    applicationFeeAmount: 2000,
    admissionFeeAmount: 15000,
    bankName: "",
    bankBranch: "",
    accountTitle: "",
    accountNumber: "",
    challanInstructions: "",
    enableBankDeposit: true,
    enableJazzcash: false,
    enablePayfast: false,
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!config) return;
    setDraft({
      applicationFeeEnabled: config.applicationFeeEnabled,
      applicationFeeAmount: config.applicationFeeAmount,
      admissionFeeAmount:   config.admissionFeeAmount,
      bankName:             config.bankName,
      bankBranch:           config.bankBranch,
      accountTitle:         config.accountTitle,
      accountNumber:        config.accountNumber,
      challanInstructions:  config.challanInstructions,
      enableBankDeposit:    config.enableBankDeposit,
      enableJazzcash:       config.enableJazzcash,
      enablePayfast:        config.enablePayfast,
    });
    setDirty(false);
  }, [config]);

  const mut = useUpdateAdminAdmissionPaymentConfig({
    mutation: {
      onSuccess: () => {
        toast({ title: "Fee & payment settings saved" });
        qc.invalidateQueries({ queryKey: ["getAdminAdmissionPaymentConfig"] });
        setDirty(false);
      },
      onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
    },
  });

  function setField<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function save() {
    mut.mutate({ data: draft });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading configuration…
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">

      {/* Application Fee Toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
        <div>
          <p className="font-semibold text-sm">Application Fee</p>
          <p className="text-xs text-muted-foreground">
            When disabled, applicants are not charged an application fee and no challan is shown.
          </p>
        </div>
        <Switch
          checked={draft.applicationFeeEnabled}
          onCheckedChange={(v) => setField("applicationFeeEnabled", v)}
        />
      </div>

      {/* Free Application Notice */}
      {!draft.applicationFeeEnabled && (
        <div className="flex items-start gap-3 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
          <CheckCircle className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-accent">Free Application — no challan required</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Applicants will not see the fee challan or payment confirmation sections. Bank details and payment methods below are inactive.
            </p>
          </div>
        </div>
      )}

      {/* Application Fee Amount (dims with toggle) */}
      <div className={cn("space-y-4", !draft.applicationFeeEnabled && "opacity-50 pointer-events-none")}>
        <h3 className="font-semibold text-base">Application Fee Amount</h3>
        <div className="space-y-1.5">
          <Label>Application Fee (PKR)</Label>
          <Input
            type="number"
            min={0}
            max={9999999}
            value={draft.applicationFeeAmount}
            onChange={(e) => setField("applicationFeeAmount", Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">Printed on the bank challan &amp; portal fee section.</p>
        </div>
      </div>

      {/* Bank Details */}
      <div className={cn("space-y-4", !draft.applicationFeeEnabled && "opacity-50 pointer-events-none")}>
        <h3 className="font-semibold text-base">Bank Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Bank Name</Label>
            <Input value={draft.bankName} onChange={(e) => setField("bankName", e.target.value)} placeholder="e.g. National Bank of Pakistan" />
          </div>
          <div className="space-y-1.5">
            <Label>Branch</Label>
            <Input value={draft.bankBranch} onChange={(e) => setField("bankBranch", e.target.value)} placeholder="e.g. Murree Main Branch" />
          </div>
          <div className="space-y-1.5">
            <Label>Account Title</Label>
            <Input value={draft.accountTitle} onChange={(e) => setField("accountTitle", e.target.value)} placeholder="e.g. Principal Cadet College Murree" />
          </div>
          <div className="space-y-1.5">
            <Label>Account Number</Label>
            <Input value={draft.accountNumber} onChange={(e) => setField("accountNumber", e.target.value)} placeholder="e.g. 0004-6000-2000-3201" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Challan Instructions (optional)</Label>
          <Textarea
            rows={3}
            value={draft.challanInstructions}
            onChange={(e) => setField("challanInstructions", e.target.value)}
            placeholder="Any extra instructions printed on the challan or portal…"
          />
        </div>
      </div>

      <Button onClick={save} disabled={!dirty || mut.isPending} className="gap-2">
        {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Changes
      </Button>
    </div>
  );
}

// ─── Setup tab ────────────────────────────────────────────────────────────────

async function fetchAdmissionFeeGate(): Promise<{ gate: string }> {
  const res = await fetch("/api/admin/settings/admission-fee-gate", {
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!res.ok) throw new Error("Failed to load gate setting");
  return res.json();
}

async function updateAdmissionFeeGate(gate: string): Promise<void> {
  const res = await fetch("/api/admin/settings/admission-fee-gate", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
    body: JSON.stringify({ gate }),
  });
  if (!res.ok) throw new Error("Failed to update gate setting");
}

const SETUP_TABS = [
  { key: "venues",          label: "Venues",          icon: Building2    },
  { key: "test-schedules",  label: "Test Schedules",  icon: CalendarClock },
  { key: "interviewers",    label: "Interviewers",    icon: Users        },
  { key: "merit-formula",   label: "Merit Formula",   icon: FlaskConical },
  { key: "form-fields",     label: "Form Fields",     icon: ListChecks   },
  { key: "fee-payment",     label: "Fee & Payment",   icon: DollarSign   },
] as const;
type SetupSubTab = typeof SETUP_TABS[number]["key"];

function SetupTab() {
  const [sub, setSub] = useState<SetupSubTab>("venues");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: gateData, isLoading: gateLoading } = useQuery<{ gate: string }>({
    queryKey: ["admission-fee-gate"],
    queryFn: fetchAdmissionFeeGate,
  });

  const gateMut = useMutation({
    mutationFn: (gate: string) => updateAdmissionFeeGate(gate),
    onSuccess: (_, gate) => {
      toast({
        title: gate === "block" ? "Enrollment gate: BLOCK" : "Enrollment gate: Warn only",
        description: gate === "block"
          ? "Enrollment is now blocked until application fee is verified."
          : "Enrollment will warn but allow if fee is unverified.",
      });
      qc.invalidateQueries({ queryKey: ["admission-fee-gate"] });
    },
    onError: () => toast({ title: "Failed to update gate", variant: "destructive" }),
  });

  const currentGate = gateData?.gate ?? "warn";

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* ── Enrollment Gate Setting ──────────────────────────────────────────── */}
      <Card className="border-amber-100 bg-amber-50/40">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-800">
            <ShieldAlert className="h-4 w-4" /> Enrollment Gate
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-amber-700">
              {currentGate === "block"
                ? "Enrollment is BLOCKED until the application fee is verified. Attempting to enroll a cadet with an unverified fee will fail."
                : "Warn mode — enrollment shows a warning if the application fee is unverified, but still allows it to proceed."}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium text-amber-700">Block enrollment</span>
              <Switch
                checked={currentGate === "block"}
                disabled={gateLoading || gateMut.isPending}
                onCheckedChange={checked => gateMut.mutate(checked ? "block" : "warn")}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sub-tab pills */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 pb-0">
        {SETUP_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
              sub === t.key
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {sub === "venues"         && <TestCentres />}
      {sub === "test-schedules" && <TestSchedulesManager />}
      {sub === "interviewers"   && <InterviewersManager />}
      {sub === "merit-formula"  && <MeritConfig />}
      {sub === "form-fields"    && <FormFieldsManager />}
      {sub === "fee-payment"    && <FeePaymentManager />}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function AdmissionsDashboardPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">Admissions</h1>
        <p className="text-muted-foreground mt-1">Dashboard — Application pipeline, class breakdown and stage deadlines.</p>
      </div>
      <AdmissionsDashboard />
    </div>
  );
}

function StagePage({ children }: { title: string; subtitle: string; tab: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {children}
    </div>
  );
}

export default function Applications() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tab    = params.get("tab")    ?? "";
  const status = params.get("status") ?? "";
  const gender = params.get("gender") ?? "";
  const isNew  = params.get("new")    === "1";

  if (tab === "dashboard")   return <AdmissionsDashboardPage />;
  if (tab === "pipeline")    return <PipelineControlBoard />;
  if (tab === "doc-verify")  return <StagePage title="Academics" subtitle="Review attached documents, verify B-Form and last class result, and record each candidate's previous academic marks." tab="doc-verify"><DocumentVerificationTab /></StagePage>;
  if (tab === "fee-verify")  return <StagePage title="Fee Verification" subtitle="Review candidate fee payment submissions and confirm bank deposits for application fee." tab="fee-verify"><FeeVerificationTab /></StagePage>;
  if (tab === "academic")    return <StagePage title="Academics" subtitle="View and edit each candidate's previous academic marks (used in merit formula)." tab="academic"><AcademicScoringTab /></StagePage>;
  if (tab === "entry-test")  return <StagePage title="Entry Test" subtitle="Manage entry-test scheduling, admit cards and results." tab="entry-test"><EntryTestTab /></StagePage>;
  if (tab === "interview")   return <StagePage title="Interview" subtitle="Interview scheduling and marks entry." tab="interview"><InterviewPageWrapper /></StagePage>;
  if (tab === "merit-list")  return <StagePage title="Merit List" subtitle="Merit ranking, marks entry and final admission decisions." tab="merit-list"><MeritListTab /></StagePage>;
  if (tab === "enrollment")  return <StagePage title="Enrollment" subtitle="Confirmed admissions and Applicant ID assignment." tab="enrollment"><EnrollmentTab /></StagePage>;
  if (tab === "venues" || tab === "setup") return <SetupTab />;

  return <ApplicationsTab initialStatus={status} initialGender={gender} autoOpenCreate={isNew} />;
}

// ─── Pipeline Control Board ───────────────────────────────────────────────────

const BOARD_STAGES = [
  { status: "received",            label: "Application Received",  color: "#94a3b8", dot: "bg-slate-400",   advance: { to: "under_review",  label: "Mark Under Review"   } },
  { status: "under_review",        label: "Under Review",          color: "#f59e0b", dot: "bg-amber-400",   advance: { to: "verified",       label: "Mark All Verified"   } },
  { status: "verified",            label: "Docs Verified",         color: "#3b82f6", dot: "bg-blue-400",    advance: null,                    scheduleTest: true            },
  { status: "test_scheduled",      label: "Test Scheduled",        color: "#8b5cf6", dot: "bg-violet-400",  advance: { to: "test_taken",     label: "Mark Test Taken"     } },
  { status: "test_taken",          label: "Test Taken",            color: "#06b6d4", dot: "bg-cyan-400",    advance: null,                    scheduleInterview: true       },
  { status: "interview_scheduled", label: "Interview Scheduled",   color: "#7c3aed", dot: "bg-purple-500",  advance: { to: "interview_taken", label: "Mark Interview Done" } },
  { status: "interview_taken",     label: "Interview Completed",   color: "#0891b2", dot: "bg-sky-500",     advance: null,                    meritList: true               },
  { status: "result_announced",    label: "Result Announced",      color: "#10b981", dot: "bg-emerald-400", advance: null                                                   },
  { status: "admitted",            label: "Qualified",             color: "#064A1A", dot: "bg-emerald-800", advance: null                                                   },
  { status: "enrolled",            label: "Enrolled",              color: "#0d9488", dot: "bg-teal-500",    advance: null                                                   },
  { status: "rejected",            label: "Not Selected",          color: "#ef4444", dot: "bg-red-400",     advance: null                                                   },
] as const;

type BoardStage = typeof BOARD_STAGES[number];

function useStageCounts() {
  // One grouped query for every stage instead of one count request per stage.
  const { data, isLoading } = useGetAdminApplicationStatusCounts();
  const counts = data?.counts ?? {};
  return BOARD_STAGES.map(s => ({
    ...s,
    count: isLoading ? null : (counts[s.status] ?? 0),
    isLoading,
  }));
}

function AdvanceAllDialog({
  stage,
  count,
  onDone,
}: {
  stage: BoardStage & { advance: NonNullable<BoardStage["advance"]> };
  count: number;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const mutation = useBulkUpdateAdminApplicationStatus({
    mutation: {
      onSuccess: (r) => {
        const skippedCount = (r as any).skipped?.length ?? 0;
        const updatedCount = r.updated ?? 0;
        if (skippedCount > 0 && updatedCount === 0) {
          toast({ title: "No applications advanced", description: "Record marks before setting this status.", variant: "destructive" });
        } else if (skippedCount > 0) {
          toast({ title: `${updatedCount} advanced · ${skippedCount} skipped`, description: "Some were skipped — marks must be recorded first." });
        } else {
          toast({ title: `${updatedCount} applications advanced`, description: `Moved to: ${stage.advance.label}` });
        }
        setOpen(false);
        setNote("");
        onDone();
      },
      onError: () => toast({ title: "Advance failed", variant: "destructive" }),
    },
  });

  async function handleAdvance() {
    const res = await fetch(
      `/api/admin/applications?status=${stage.status}&page=1&pageSize=1000`,
      { headers: { Authorization: `Bearer ${getToken() ?? ""}` } },
    );
    if (!res.ok) { toast({ title: "Failed to load applications", variant: "destructive" }); return; }
    const data = await res.json();
    const ids: string[] = (data.items ?? []).map((a: any) => a.referenceId);
    if (ids.length === 0) { toast({ title: "No applications to advance" }); setOpen(false); return; }
    mutation.mutate({ data: { referenceIds: ids, status: stage.advance.to as never, note: note.trim() || undefined, force: true } as never });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        onClick={() => setOpen(true)}
        disabled={count === 0}
        className={cn(
          "w-full mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all",
          count > 0
            ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow-md"
            : "bg-slate-100 text-slate-300 cursor-not-allowed",
        )}
      >
        <ChevronRight className="h-3.5 w-3.5" />
        Advance All ({count})
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{stage.advance.label}</DialogTitle>
          <DialogDescription>
            This will move all <strong>{count}</strong> application{count !== 1 ? "s" : ""} currently in{" "}
            <em>{stage.label}</em> forward to the next stage. This cannot be undone in bulk.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            <span className="font-bold">Note:</span> This advances every application in this stage regardless of class or individual review. Use the per-stage tabs if you need selective advancement.
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold text-slate-600">Optional note (logged in each timeline)</Label>
            <input
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
              placeholder="e.g. Documents verified by admission committee"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleAdvance} disabled={mutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm — Advance {count}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleTestFromBoardDialog({ count, onDone }: { count: number; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [testDate, setTestDate] = useState("");
  const [centreId, setCentreId] = useState("");
  const [prefix, setPrefix] = useState("CCM-");
  const [startNumber, setStartNumber] = useState("");
  const [padding, setPadding] = useState("4");

  const { data: activeCentres } = useListActiveTestCentres();

  const mutation = useBulkScheduleAdminApplicationTest({
    mutation: {
      onSuccess: (r) => {
        toast({ title: "Tests scheduled", description: `${r.updated} applicants scheduled with roll numbers.` });
        setOpen(false);
        onDone();
      },
      onError: (err: any) => toast({ title: "Schedule failed", description: err?.response?.data?.error ?? "Could not schedule.", variant: "destructive" }),
    },
  });

  async function handleSchedule() {
    if (!testDate || !prefix.trim()) {
      toast({ title: "Test date and roll prefix are required", variant: "destructive" }); return;
    }
    const res = await fetch(
      `/api/admin/applications?status=verified&page=1&pageSize=1000`,
      { headers: { Authorization: `Bearer ${getToken() ?? ""}` } },
    );
    if (!res.ok) { toast({ title: "Failed to load applications", variant: "destructive" }); return; }
    const data = await res.json();
    const ids: string[] = (data.items ?? []).map((a: any) => a.referenceId);
    if (ids.length === 0) { toast({ title: "No verified applications" }); setOpen(false); return; }
    mutation.mutate({ data: { referenceIds: ids, testDate: new Date(testDate).toISOString(), centreId: centreId && centreId !== "__none" ? centreId : undefined, rollNumberPrefix: prefix.trim(), startNumber: startNumber.trim() ? Number(startNumber) : undefined, padding: Number(padding) || 4 } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        onClick={() => setOpen(true)}
        disabled={count === 0}
        className={cn(
          "w-full mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all",
          count > 0
            ? "bg-violet-600 hover:bg-violet-700 text-white shadow-sm hover:shadow-md"
            : "bg-slate-100 text-slate-300 cursor-not-allowed",
        )}
      >
        <CalendarClock className="h-3.5 w-3.5" />
        Schedule Test ({count})
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule Entry Test — All Verified</DialogTitle>
          <DialogDescription>
            Assign a test date and auto-generate roll numbers for all <strong>{count}</strong> verified applicant{count !== 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-3">
          <div className="grid grid-cols-4 items-center gap-3">
            <Label className="text-right text-sm">Test Date <span className="text-red-500">*</span></Label>
            <Input type="date" className="col-span-3" value={testDate} onChange={e => setTestDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-4 items-center gap-3">
            <Label className="text-right text-sm">Exam Centre</Label>
            <div className="col-span-3">
              <Select value={centreId} onValueChange={setCentreId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a centre (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {(activeCentres ?? []).length === 0 ? (
                    <SelectItem value="__none" disabled>No active centres — add one in Exam Centres</SelectItem>
                  ) : (
                    (activeCentres ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground ml-1.5 text-xs">{c.city}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-3">
            <Label className="text-right text-sm">Roll Prefix <span className="text-red-500">*</span></Label>
            <Input className="col-span-3" value={prefix} onChange={e => setPrefix(e.target.value)} />
          </div>
          <div className="grid grid-cols-4 items-center gap-3">
            <Label className="text-right text-sm">Start No.</Label>
            <Input className="col-span-3" type="number" placeholder="Auto" value={startNumber} onChange={e => setStartNumber(e.target.value)} />
          </div>
          <div className="grid grid-cols-4 items-center gap-3">
            <Label className="text-right text-sm">Padding</Label>
            <Input className="col-span-3" type="number" value={padding} onChange={e => setPadding(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSchedule} disabled={mutation.isPending} className="bg-violet-600 hover:bg-violet-700">
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Schedule All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleInterviewFromBoardDialog({ count, onDone }: { count: number; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [date, setDate]       = useState("");
  const [venue, setVenue]     = useState("");
  const [venueId, setVenueId] = useState("");

  const { data: allVenues } = useListAdminTestCentres();
  const interviewVenues = useMemo(() => (allVenues ?? []).filter(v => v.active), [allVenues]);

  const mutation = useBulkScheduleAdminApplicationInterview({
    mutation: {
      onSuccess: (r) => {
        const venueName = interviewVenues.length > 0
          ? interviewVenues.find(v => v.id === venueId)?.name
          : venue.trim();
        toast({ title: "Interviews scheduled", description: `${r.updated} candidates scheduled${venueName ? ` at ${venueName}` : ""}.` });
        setOpen(false);
        setDate(""); setVenue(""); setVenueId("");
        onDone();
      },
      onError: () => toast({ title: "Schedule failed", variant: "destructive" }),
    },
  });

  async function handleSchedule() {
    if (!date) { toast({ title: "Interview date is required", variant: "destructive" }); return; }
    const res = await fetch(
      `/api/admin/applications?status=test_taken&page=1&pageSize=1000`,
      { headers: { Authorization: `Bearer ${getToken() ?? ""}` } },
    );
    if (!res.ok) { toast({ title: "Failed to load applications", variant: "destructive" }); return; }
    const data = await res.json();
    const ids: string[] = (data.items ?? []).map((a: any) => a.referenceId);
    if (ids.length === 0) { toast({ title: "No candidates to schedule" }); setOpen(false); return; }
    mutation.mutate({
      data: {
        referenceIds: ids,
        interviewDate: new Date(date).toISOString(),
        venue: interviewVenues.length === 0 ? (venue.trim() || undefined) : undefined,
        venueId: interviewVenues.length > 0 && venueId && venueId !== "__none" ? venueId : undefined,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        onClick={() => { setDate(""); setVenue(""); setVenueId(""); setOpen(true); }}
        disabled={count === 0}
        className={cn(
          "w-full mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all",
          count > 0
            ? "bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm hover:shadow-md"
            : "bg-slate-100 text-slate-300 cursor-not-allowed",
        )}
      >
        <CalendarClock className="h-3.5 w-3.5" />
        Schedule Interviews ({count})
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule Interviews — All Test-Taken</DialogTitle>
          <DialogDescription>
            Assign an interview date and venue to all <strong>{count}</strong> candidate{count !== 1 ? "s" : ""} who appeared in the entry test.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-3">
          <div className="grid grid-cols-4 items-center gap-3">
            <Label className="text-right text-sm">Date <span className="text-red-500">*</span></Label>
            <Input type="date" className="col-span-3" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-4 items-center gap-3">
            <Label className="text-right text-sm">Venue</Label>
            <div className="col-span-3">
              {interviewVenues.length === 0 ? (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="e.g. Main Hall, Admin Block"
                    value={venue}
                    onChange={e => setVenue(e.target.value)}
                    className="flex-1"
                  />
                  <span className="text-xs text-slate-400 whitespace-nowrap">No venues set up</span>
                </div>
              ) : (
                <Select value={venueId} onValueChange={setVenueId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a venue (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {interviewVenues.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        <span className="font-medium">{v.name}</span>
                        <span className="text-muted-foreground ml-1.5 text-xs">{v.city}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSchedule} disabled={mutation.isPending} className="bg-cyan-600 hover:bg-cyan-700">
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Schedule All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PipelineControlBoard() {
  const queryClient = useQueryClient();
  const stages = useStageCounts();

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/applications"] });
    queryClient.invalidateQueries({ queryKey: getGetAdminApplicationStatusCountsQueryKey() });
  }

  const totalActive = stages
    .filter(s => s.status !== "enrolled" && s.status !== "rejected")
    .reduce((acc, s) => acc + (s.count ?? 0), 0);
  const totalEnrolled = stages.find(s => s.status === "enrolled")?.count ?? 0;
  const totalRejected = stages.find(s => s.status === "rejected")?.count ?? 0;

  return (
    <div className="flex flex-col gap-5 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
            Pipeline Control Board
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live counts for all 10 stages. Advance an entire stage in one click — no manual selection needed.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/applications">
            <Button variant="outline" size="sm">
              <Filter className="mr-1.5 h-3.5 w-3.5" /> Application Table
            </Button>
          </Link>
          <Link href="/applications?tab=merit-list">
            <Button variant="outline" size="sm">
              <Save className="mr-1.5 h-3.5 w-3.5" /> Marks Entry
            </Button>
          </Link>
          <Link href="/applications?tab=merit-list">
            <Button variant="outline" size="sm">
              <Trophy className="mr-1.5 h-3.5 w-3.5" /> Merit List
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active in Pipeline", value: totalActive,   color: "#6366f1" },
          { label: "Enrolled (Done)",    value: totalEnrolled, color: "#0d9488" },
          { label: "Not Selected",       value: totalRejected, color: "#ef4444" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border bg-white p-4 shadow-sm text-center">
            <p className="text-3xl font-extrabold" style={{ color: s.color }}>
              {s.value ?? <span className="text-slate-200 text-2xl">···</span>}
            </p>
            <p className="text-[12px] font-semibold text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Stage cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {stages.map((stage, idx) => {
          const hasAdvance = "advance" in stage && stage.advance !== null;
          const hasScheduleTest = "scheduleTest" in stage && (stage as any).scheduleTest;
          const hasScheduleInterview = "scheduleInterview" in stage && (stage as any).scheduleInterview;
          const hasMeritList = "meritList" in stage && (stage as any).meritList;
          const isTerminal = stage.status === "enrolled" || stage.status === "rejected";
          const count = stage.count ?? 0;
          const isLoaded = !stage.isLoading;

          return (
            <div
              key={stage.status}
              className={cn(
                "rounded-2xl border bg-white shadow-sm flex flex-col p-4 transition-all",
                count > 0 && !isTerminal ? "border-slate-200" : "border-slate-100",
              )}
              style={count > 0 && !isTerminal ? { boxShadow: `0 0 0 2px ${stage.color}30` } : undefined}
            >
              {/* Stage header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-5 w-5 rounded-full items-center justify-center text-[11px] font-extrabold text-white shrink-0"
                    style={{ background: stage.color }}
                  >
                    {idx + 1}
                  </span>
                  <p className="text-[13px] font-bold text-slate-700 leading-snug">{stage.label}</p>
                </div>
                <div className="shrink-0">
                  {isLoaded ? (
                    <span
                      className="text-2xl font-extrabold tabular-nums"
                      style={{ color: count > 0 ? stage.color : "#cbd5e1" }}
                    >
                      {count}
                    </span>
                  ) : (
                    <span className="text-2xl font-extrabold text-slate-200">···</span>
                  )}
                </div>
              </div>

              {/* Status tag */}
              <p className="font-mono text-[10px] text-slate-400 mt-1">{stage.status}</p>

              {/* Action buttons */}
              {hasAdvance && (
                <AdvanceAllDialog
                  stage={stage as BoardStage & { advance: NonNullable<BoardStage["advance"]> }}
                  count={count}
                  onDone={invalidateAll}
                />
              )}
              {hasScheduleTest && (
                <ScheduleTestFromBoardDialog count={count} onDone={invalidateAll} />
              )}
              {hasScheduleInterview && (
                <ScheduleInterviewFromBoardDialog count={count} onDone={invalidateAll} />
              )}
              {hasMeritList && count > 0 && (
                <Link href="/applications?tab=merit-list">
                  <button className="w-full mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors border border-indigo-200">
                    <Trophy className="h-3.5 w-3.5" />
                    Generate Merit List ({count})
                  </button>
                </Link>
              )}
              {isTerminal && count > 0 && (
                <Link href={`/applications?status=${stage.status}`}>
                  <button className="w-full mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-200">
                    <Eye className="h-3 w-3" />
                    View {count}
                  </button>
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick-access strip */}
      <div className="rounded-2xl border bg-slate-50 p-4 flex flex-wrap gap-2 items-center">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mr-1">Quick links:</span>
        {[
          { href: "/applications?tab=entry-test",  label: "Entry Test",  Icon: CalendarClock },
          { href: "/applications?tab=interview",    label: "Interview",   Icon: Users         },
          { href: "/applications?tab=merit-list",   label: "Marks Entry", Icon: Save          },
          { href: "/applications?tab=merit-list",   label: "Merit List",  Icon: Trophy        },
          { href: "/applications?tab=enrollment",   label: "Enrollment",  Icon: GraduationCap },
        ].map(({ href, label, Icon }) => (
          <Link key={label} href={href}>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-700 transition-colors shadow-sm">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Applications Tab ─────────────────────────────────────────────────────────

function ApplicationsTab_REPLACED_BELOW() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { classOptions } = useClassOptions();

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm]       = useState("");
  const [status, setStatus]               = useState("all");
  const [classApplying, setClassApplying] = useState("all");
  const [page, setPage]                   = useState(1);
  const [pageSize, setPageSize]           = useState(25);
  const [downloadingCards, setDownloadingCards] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 400);

  // ── Sort state ───────────────────────────────────────────────────────────────
  const [sortCol, setSortCol] = useState<ColKey | "">("");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  // ── Selection state ──────────────────────────────────────────────────────────
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [lastClickIdx, setLastClickIdx] = useState<number | null>(null);

  // ── Row expansion ────────────────────────────────────────────────────────────
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // ── Column prefs (persisted) ─────────────────────────────────────────────────
  const defaultVis = Object.fromEntries(COL_DEFS.map(c => [c.key, c.defaultVisible])) as Record<ColKey, boolean>;
  const defaultWidths = Object.fromEntries(COL_DEFS.map(c => [c.key, c.defaultWidth])) as Record<ColKey, number>;

  const [colVisibility, setColVisibility] = useLocalPref<Record<ColKey, boolean>>("ccm_col_vis_v2", defaultVis);
  const [colWidths, setColWidths]         = useLocalPref<Record<string, number>>("ccm_col_widths_v2", defaultWidths);

  const visibleCols = COL_DEFS.filter(c => colVisibility[c.key] !== false);

  // ── Data ─────────────────────────────────────────────────────────────────────
  const qp = {
    q: debouncedSearch || undefined,
    status: status !== "all" ? status : undefined,
    classApplying: classApplying !== "all" ? classApplying : undefined,
    page, pageSize,
  };
  const { data, isLoading } = useListAdminApplications(qp, {
    query: { queryKey: getListAdminApplicationsQueryKey(qp), placeholderData: keepPreviousData },
  });
  const items = data?.items ?? [];
  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  // ── Client-side sort on current page ─────────────────────────────────────────
  const sortedItems = useMemo(() => {
    if (!sortCol || !sortDir) return items;
    return [...items].sort((a, b) => {
      const av = getCellText(sortCol as ColKey, a).toLowerCase();
      const bv = getCellText(sortCol as ColKey, b).toLowerCase();
      const c = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === "asc" ? c : -c;
    });
  }, [items, sortCol, sortDir]);


  function cycleSort(col: ColKey) {
    if (sortCol !== col) { setSortCol(col); setSortDir("asc"); }
    else if (sortDir === "asc") { setSortDir("desc"); }
    else { setSortCol(""); setSortDir(null); }
  }

  // ── Mutations ────────────────────────────────────────────────────────────────
  function invalidate() { queryClient.invalidateQueries({ queryKey: ["/api/admin/applications"] }); }

  const inlineMutation = useUpdateAdminApplicationStatus({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Status updated" }); },
      onError:   () => { invalidate(); toast({ title: "Update failed", variant: "destructive" }); },
    },
  });
  const bulkMutation = useBulkUpdateAdminApplicationStatus({
    mutation: {
      onSuccess: (r) => {
        invalidate(); clearSelection();
        toast({ title: "Applications updated", description: `${r.updated} updated.` });
      },
      onError: () => toast({ title: "Bulk update failed", variant: "destructive" }),
    },
  });

  // ── Selection helpers ────────────────────────────────────────────────────────
  const selectedItems  = useMemo(() => sortedItems.filter(a => selected.has(a.referenceId)), [sortedItems, selected]);
  const allPageSelected = items.length > 0 && items.every(a => selected.has(a.referenceId));

  function clearSelection() { setSelected(new Set()); }
  function toggleRow(referenceId: string, idx: number, shiftKey: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      if (shiftKey && lastClickIdx !== null) {
        const [lo, hi] = [Math.min(lastClickIdx, idx), Math.max(lastClickIdx, idx)];
        sortedItems.slice(lo, hi + 1).forEach(a => next.add(a.referenceId));
      } else {
        if (next.has(referenceId)) next.delete(referenceId); else next.add(referenceId);
      }
      return next;
    });
    setLastClickIdx(idx);
  }
  function toggleAllOnPage() {
    setSelected(prev => {
      const next = new Set(prev);
      if (allPageSelected) items.forEach(a => next.delete(a.referenceId));
      else items.forEach(a => next.add(a.referenceId));
      return next;
    });
  }

  // ── Row expansion ─────────────────────────────────────────────────────────────
  function toggleExpand(refId: string) {
    setExpandedRows(prev => { const n = new Set(prev); n.has(refId) ? n.delete(refId) : n.add(refId); return n; });
  }

  // ── Active filter chips ───────────────────────────────────────────────────────
  type Chip = { label: string; clear: () => void };
  const filterChips: Chip[] = [
    ...(debouncedSearch ? [{ label: `"${debouncedSearch}"`, clear: () => { setSearchTerm(""); setPage(1); } }] : []),
    ...(status !== "all" ? [{ label: statusLabel(status),    clear: () => { setStatus("all"); setPage(1); } }] : []),
    ...(classApplying !== "all" ? [{ label: classLabel(classApplying), clear: () => { setClassApplying("all"); setPage(1); } }] : []),
  ];
  function clearAllFilters() { setSearchTerm(""); setStatus("all"); setClassApplying("all"); setPage(1); }

  // ── Column resizing ───────────────────────────────────────────────────────────
  function startResize(key: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[key] ?? defaultWidths[key as ColKey] ?? 120;
    function onMove(me: MouseEvent) {
      setColWidths({ ...colWidths, [key]: Math.max(60, startW + me.clientX - startX) });
    }
    function onUp() { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Export CSV ────────────────────────────────────────────────────────────────
  function exportCSV() {
    const targets = selectedItems.length > 0 ? selectedItems : sortedItems;
    const header = visibleCols.map(c => c.label).join(",");
    const rows = targets.map(app =>
      visibleCols.map(c => `"${getCellText(c.key, app).replace(/"/g, '""')}"`).join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: `applications-${new Date().toISOString().slice(0,10)}.csv` });
    a.click(); URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: `${targets.length} rows` });
  }

  // ── Copy to clipboard ────────────────────────────────────────────────────────
  async function copyToClipboard() {
    const targets = selectedItems.length > 0 ? selectedItems : sortedItems;
    const header  = visibleCols.map(c => c.label).join("\t");
    const rows    = targets.map(app => visibleCols.map(c => getCellText(c.key, app)).join("\t"));
    await navigator.clipboard.writeText([header, ...rows].join("\n"));
    toast({ title: "Copied to clipboard", description: `${targets.length} rows` });
  }

  // ── Admit cards download ──────────────────────────────────────────────────────
  async function handleDownloadAdmitCards() {
    // Opened synchronously (before any await) to survive popup blockers.
    const printWin = openPrintWindow({
      onPopupBlocked: () => toast({ title: "Popup blocked", description: "Please allow popups for this site and try again.", variant: "destructive" }),
    });
    setDownloadingCards(true);
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (classApplying !== "all") params.set("classApplying", classApplying);
      const res = await fetch(`/api/admin/admit-cards.pdf${params.toString() ? `?${params}` : ""}`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) {
        printWin.close();
        toast({ title: "No admit cards", description: res.status === 404 ? "No matching applicants with roll numbers." : "Failed.", variant: "destructive" });
        return;
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        printWin.print(await res.text(), { autoPrint: false });
      } else {
        printWin.close();
        const url = URL.createObjectURL(await res.blob());
        Object.assign(document.createElement("a"), { href: url, download: `admit-cards-${new Date().toISOString().slice(0,10)}.pdf` }).click();
        URL.revokeObjectURL(url);
      }
    } catch {
      printWin.close();
      toast({ title: "Download failed", variant: "destructive" });
    }
    finally { setDownloadingCards(false); }
  }

  // ── Total cols for colspan ────────────────────────────────────────────────────
  // checkbox + visibleCols + expand + actions
  const totalCols = 1 + visibleCols.length + 1 + 1;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 max-w-[1600px] mx-auto">

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
            Applications
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data ? (
              <span>
                Showing <strong>{((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, data.total)}</strong> of{" "}
                <strong>{data.total.toLocaleString()}</strong> applicants
              </span>
            ) : "Loading…"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MeritDialog onCommitted={invalidate} />
          <Button variant="outline" size="sm" onClick={handleDownloadAdmitCards} disabled={downloadingCards}>
            {downloadingCards ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" />}
            Admit Cards
          </Button>
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, Applicant ID, roll number…"
                className="pl-9 h-9"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setPage(1); clearSelection(); }}
              />
            </div>
            <Select value={status} onValueChange={v => { setStatus(v); setPage(1); clearSelection(); }}>
              <SelectTrigger className="w-full md:w-[190px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={classApplying} onValueChange={v => { setClassApplying(v); setPage(1); clearSelection(); }}>
              <SelectTrigger className="w-full md:w-[190px] h-9"><SelectValue placeholder="Class/Program" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {filterChips.length > 0 && (
              <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={clearAllFilters}>
                <X className="mr-1 h-3.5 w-3.5" /> Clear all
              </Button>
            )}
          </div>

          {/* Active filter chips */}
          {filterChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-border">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                <Filter className="h-3 w-3" /> Active filters:
              </span>
              {filterChips.map(chip => (
                <button
                  key={chip.label}
                  onClick={chip.clear}
                  className="flex items-center gap-1 text-[11px] font-semibold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-full px-2.5 py-0.5 transition-colors"
                >
                  {chip.label} <X className="h-2.5 w-2.5" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Selection toolbar ─────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5">
          <span className="text-sm font-bold text-indigo-800">{selected.size} selected</span>
          <div className="h-4 w-px bg-indigo-200" />
          <ScheduleDialog referenceIds={[...selected]} onDone={() => { invalidate(); clearSelection(); }} />
          <ResultsDialog applicants={selectedItems} onDone={() => { invalidate(); clearSelection(); }} />
          {/* Bulk change status — full list */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 border-indigo-200 text-indigo-700 hover:bg-indigo-100" disabled={bulkMutation.isPending}>
                <Edit2 className="mr-1.5 h-3.5 w-3.5" /> Change Status <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400">Set status for {selected.size} selected</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className="flex w-full items-center gap-2.5 px-2 py-1.5 text-sm rounded hover:bg-slate-50 transition-colors"
                  onClick={() => bulkMutation.mutate({ data: { referenceIds: [...selected], status: opt.value as never, force: true } as never })}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: opt.color }} />
                  <span className="text-[12.5px] font-semibold text-slate-700">{opt.label}</span>
                </button>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="h-4 w-px bg-indigo-200" />
          <Button size="sm" variant="ghost" className="h-7 text-indigo-600" onClick={exportCSV}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-indigo-600" onClick={copyToClipboard}>
            <Clipboard className="mr-1.5 h-3.5 w-3.5" /> Copy
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-muted-foreground" onClick={clearSelection}
            data-testid="button-clear-selection">
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      )}

      {/* ── Table card ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">

        {/* Table toolbar */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-slate-50/60">
          <div className="flex items-center gap-2">
            {/* Column picker */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-slate-600 font-semibold text-xs">
                  <LayoutGrid className="h-3.5 w-3.5" /> Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">Show / Hide Columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {COL_DEFS.map(col => (
                  <DropdownMenuCheckboxItem
                    key={col.key}
                    checked={colVisibility[col.key] !== false}
                    onCheckedChange={checked => setColVisibility({ ...colVisibility, [col.key]: !!checked })}
                    className="text-sm"
                  >
                    {col.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <button
                  className="w-full text-left text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded"
                  onClick={() => setColVisibility(defaultVis)}
                >
                  Reset to defaults
                </button>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Export buttons (when nothing selected) */}
            {selected.size === 0 && (
              <>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-slate-600 text-xs" onClick={exportCSV}>
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-slate-600 text-xs" onClick={copyToClipboard}>
                  <Clipboard className="h-3.5 w-3.5" /> Copy
                </Button>
              </>
            )}
          </div>

          {/* Row count */}
          <span className="text-[11px] font-semibold text-slate-400">
            {isLoading ? "Loading…" : `${sortedItems.length} rows on this page`}
          </span>
        </div>

        {/* Scrollable table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ tableLayout: "fixed" }}>

            {/* STICKY HEADER */}
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200" style={{ position: "sticky", top: 0, zIndex: 20 }}>

                {/* Checkbox — sticky left */}
                <th className="border-r border-slate-200 bg-slate-50" style={{ position: "sticky", left: 0, zIndex: 25, width: 44, minWidth: 44 }}>
                  <div className="flex items-center justify-center h-10">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={toggleAllOnPage}
                      aria-label="Select all"
                      data-testid="checkbox-select-all"
                    />
                  </div>
                </th>

                {/* Expand toggle column */}
                <th className="border-r border-slate-200 bg-slate-50" style={{ position: "sticky", left: 44, zIndex: 25, width: 32, minWidth: 32 }}>
                  <div className="h-10" />
                </th>

                {/* Data columns */}
                {visibleCols.map((col, ci) => {
                  const isFirst = ci === 0; // Reference ID — also sticky left
                  const w = colWidths[col.key] ?? col.defaultWidth;
                  return (
                    <th
                      key={col.key}
                      className={cn(
                        "border-r border-slate-200 bg-slate-50 font-semibold text-slate-600 text-xs",
                        isFirst && "z-20"
                      )}
                      style={{
                        width: w, minWidth: w,
                        position: isFirst ? "sticky" : "relative",
                        left: isFirst ? 76 : undefined,
                        zIndex: isFirst ? 22 : undefined,
                      }}
                    >
                      <div
                        className={cn("group flex items-center justify-between gap-1 h-10 px-3 select-none", col.sortable && "cursor-pointer hover:bg-slate-100")}
                        onClick={() => col.sortable && cycleSort(col.key)}
                      >
                        <span className="truncate">{col.label}</span>
                        {col.sortable && <SortIcon col={col.key} sortCol={sortCol} sortDir={sortDir} />}
                      </div>
                      {/* Resize handle */}
                      <div
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400/40 select-none"
                        onMouseDown={e => startResize(col.key, e)}
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                  );
                })}

                {/* Actions — sticky right */}
                <th
                  className="bg-slate-50 border-l border-slate-200"
                  style={{ position: "sticky", right: 0, zIndex: 22, width: 100, minWidth: 100 }}
                >
                  <div className="h-10 flex items-center justify-center px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Actions
                  </div>
                </th>
              </tr>
            </thead>

            {/* BODY */}
            <tbody>
              {isLoading ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td style={{ width: 44 }}><div className="flex justify-center py-3"><Skeleton className="h-4 w-4 rounded" /></div></td>
                    <td style={{ width: 32 }}><div className="py-3 px-2"><Skeleton className="h-4 w-4 rounded" /></div></td>
                    {visibleCols.map(c => (
                      <td key={c.key}><div className="px-3 py-3"><Skeleton className="h-4 rounded" style={{ width: Math.random() * 40 + 60 }} /></div></td>
                    ))}
                    <td><div className="flex justify-center gap-1 py-3 px-2"><Skeleton className="h-6 w-6 rounded" /><Skeleton className="h-6 w-6 rounded" /></div></td>
                  </tr>
                ))
              ) : sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={totalCols}>
                    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                      <div className="h-24 w-24 rounded-3xl bg-slate-100 flex items-center justify-center">
                        <FileArchive className="h-10 w-10 text-slate-300" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-slate-700">No applications found</p>
                        <p className="text-sm text-slate-400 mt-1">Try adjusting your filters or search query.</p>
                      </div>
                      {filterChips.length > 0 && (
                        <Button variant="outline" size="sm" onClick={clearAllFilters}>
                          <X className="mr-1.5 h-3.5 w-3.5" /> Clear all filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                sortedItems.map((app, idx) => {
                  const isSelected  = selected.has(app.referenceId);
                  const isExpanded  = expandedRows.has(app.referenceId);
                  const isUpdating  = inlineMutation.isPending && (inlineMutation.variables as any)?.referenceId === app.referenceId;
                  const dupRefs     = ((app as any).duplicateRefs as string[] | null | undefined) ?? [];

                  return [
                    <tr
                      key={app.referenceId}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn(
                        "group border-b border-slate-100 transition-colors",
                        isSelected ? "bg-indigo-50/60" : "hover:bg-slate-50/70",
                        isExpanded && "bg-indigo-50/30"
                      )}
                    >
                      {/* Checkbox — sticky left */}
                      <td
                        className={cn("border-r border-slate-100", isSelected ? "bg-indigo-50/60" : "bg-white group-hover:bg-slate-50/70")}
                        style={{ position: "sticky", left: 0, zIndex: 10, width: 44 }}
                      >
                        <div className="flex items-center justify-center py-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleRow(app.referenceId, idx, false)}
                            onClick={(e: React.MouseEvent) => toggleRow(app.referenceId, idx, e.shiftKey)}
                            aria-label={`Select ${app.referenceId}`}
                            data-testid={`checkbox-row-${app.referenceId}`}
                          />
                        </div>
                      </td>

                      {/* Expand toggle — sticky left (after checkbox) */}
                      <td
                        className={cn("border-r border-slate-100 cursor-pointer", isSelected ? "bg-indigo-50/60" : "bg-white group-hover:bg-slate-50/70")}
                        style={{ position: "sticky", left: 44, zIndex: 10, width: 32 }}
                        onClick={() => toggleExpand(app.referenceId)}
                      >
                        <div className="flex items-center justify-center py-3">
                          <ChevronRight
                            className={cn("h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 transition-all", isExpanded && "rotate-90 text-indigo-500")}
                          />
                        </div>
                      </td>

                      {/* Data cells */}
                      {visibleCols.map((col, ci) => {
                        const isFirst = ci === 0;
                        const w = colWidths[col.key] ?? col.defaultWidth;

                        return (
                          <td
                            key={col.key}
                            className={cn(
                              "border-r border-slate-100 py-2.5 px-3",
                              isFirst && (isSelected ? "bg-indigo-50/60" : "bg-white group-hover:bg-slate-50/70")
                            )}
                            style={{
                              width: w, minWidth: w, maxWidth: w,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              position: isFirst ? "sticky" : undefined,
                              left: isFirst ? 76 : undefined,
                              zIndex: isFirst ? 10 : undefined,
                            }}
                          >
                            {col.key === "referenceId" && (
                              <div className="flex flex-col gap-0.5">
                                <span className="font-mono text-[12px] font-bold text-indigo-600">{app.referenceId}</span>
                                {dupRefs.length > 0 && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        className="flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-full px-1.5 py-0.5 transition-colors w-fit"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        <AlertCircle className="h-2.5 w-2.5 shrink-0" />
                                        Duplicate
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64 p-3 shadow-xl rounded-xl text-xs" align="start" sideOffset={4}>
                                      <p className="font-bold text-amber-800 mb-1.5">Potential duplicate</p>
                                      <p className="text-slate-600 mb-2">Shares student email, phone, or B-form with:</p>
                                      <div className="flex flex-col gap-1">
                                        {dupRefs.map(r => (
                                          <Link key={r} href={`/applications/${r}`}>
                                            <span className="font-mono text-[11px] text-indigo-600 hover:underline cursor-pointer">{r}</span>
                                          </Link>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                            )}
                            {col.key === "name" && (
                              <span className="font-semibold text-slate-800">{app.fullName}</span>
                            )}
                            {col.key === "status" && (
                              <InlineStatusCell
                                app={app}
                                onMutate={(refId, status) => inlineMutation.mutate({ referenceId: refId, data: { status: status as never, force: true } as never })}
                                isUpdating={isUpdating}
                              />
                            )}
                                            {col.key === "source" && (
                              <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap", (app as any).source === "visitor_inquiry" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700")}>
                                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", (app as any).source === "visitor_inquiry" ? "bg-amber-500" : "bg-blue-500")} />
                                {sourceLabel((app as any).source ?? "online_admission")}
                              </span>
                            )}
                            {col.key !== "referenceId" && col.key !== "name" && col.key !== "status" && col.key !== "source" && (
                              <span className="text-[12.5px] text-slate-600">{getCellText(col.key, app) || <span className="text-slate-300">—</span>}</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Hover quick-action strip — sticky right */}
                      <td
                        className={cn("border-l border-slate-100", isSelected ? "bg-indigo-50/60" : "bg-white group-hover:bg-slate-50/70")}
                        style={{ position: "sticky", right: 0, zIndex: 10, width: 100 }}
                      >
                        <div className="flex items-center justify-center gap-0.5 py-2 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/applications/${app.referenceId}`}>
                            <button className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="View">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </Link>
                          <button
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                            title="Expand row"
                            onClick={() => toggleExpand(app.referenceId)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title="Print admit card"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>,

                    /* Expanded row */
                    isExpanded && (
                      <ExpandedRow
                        key={`${app.referenceId}-expanded`}
                        app={app}
                        colSpan={totalCols}
                        onClose={() => toggleExpand(app.referenceId)}
                      />
                    ),
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ─────────────────────────────────────────────────── */}
      {data && data.total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-3">
            <p className="text-[12px] text-muted-foreground">
              <span className="font-bold text-slate-700">{((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, data.total)}</span>{" "}
              of <span className="font-bold text-slate-700">{data.total.toLocaleString()}</span>
            </p>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); clearSelection(); }}>
              <SelectTrigger className="h-7 w-[90px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1 || isLoading}
              onClick={() => { setPage(1); clearSelection(); }}>
              <ChevronLeft className="h-3 w-3" /><ChevronLeft className="h-3 w-3 -ml-2" />
            </Button>
            <Button variant="outline" size="sm" className="h-7" disabled={page <= 1 || isLoading}
              onClick={() => { setPage(p => p - 1); clearSelection(); }}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <span className="text-xs font-semibold text-slate-600 px-2">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7" disabled={page >= totalPages || isLoading}
              onClick={() => { setPage(p => p + 1); clearSelection(); }}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages || isLoading}
              onClick={() => { setPage(totalPages); clearSelection(); }}>
              <ChevronRight className="h-3 w-3" /><ChevronRight className="h-3 w-3 -ml-2" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bank Pending Verify Dialog ───────────────────────────────────────────────

function BankPendingVerifyDialog({
  referenceId,
  bankRef,
  receiptUrl,
  amount,
  onDone,
}: {
  referenceId: string;
  bankRef: string | null;
  receiptUrl?: string | null;
  amount?: number;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"confirm" | "reject">("confirm");
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const url =
        action === "confirm"
          ? `/api/admin/applications/${referenceId}/fee/confirm`
          : `/api/admin/applications/${referenceId}/fee/reject`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        body: JSON.stringify(action === "reject" ? { note: note.trim() || undefined } : {}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? "Request failed");
      }
    },
    onSuccess: () => {
      toast({
        title: action === "confirm" ? "Fee confirmed" : "Fee rejected",
        description:
          action === "confirm"
            ? "Application fee marked as paid."
            : "Application fee deposit rejected.",
      });
      setOpen(false);
      onDone();
    },
    onError: (err: Error) =>
      toast({ title: "Action failed", description: err.message, variant: "destructive" }),
  });

  return (
    <>
      <button
        onClick={() => { setAction("confirm"); setNote(""); setOpen(true); }}
        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 hover:border-sky-300 cursor-pointer transition-colors"
        title="Click to verify bank deposit"
      >
        <DollarSign className="h-3 w-3" />
        Bank Pending
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verify Bank Deposit</DialogTitle>
            <DialogDescription>
              Confirm or reject this bank deposit for application fee.
            </DialogDescription>
          </DialogHeader>

          {amount != null && amount > 0 && (
            <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-sm flex items-center justify-between">
              <span className="text-violet-700 text-xs font-medium">Expected Amount</span>
              <span className="font-semibold text-violet-900">{formatCurrency(amount)}</span>
            </div>
          )}
          {bankRef && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
              <span className="text-slate-500 text-xs font-medium">Bank Reference</span>
              <p className="font-mono font-semibold text-slate-800 mt-0.5">{bankRef}</p>
            </div>
          )}
          {receiptUrl && (
            <div className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-sm flex items-center justify-between gap-3">
              <span className="text-sky-700 text-xs font-medium">Receipt uploaded</span>
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 underline"
              >
                View Receipt ↗
              </a>
            </div>
          )}

          <div className="space-y-3 py-1">
            <div className="flex gap-2">
              <button
                onClick={() => setAction("confirm")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                  action === "confirm"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirm Payment
              </button>
              <button
                onClick={() => setAction("reject")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                  action === "reject"
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Ban className="h-4 w-4" />
                Reject
              </button>
            </div>

            {action === "reject" && (
              <div className="space-y-1.5">
                <Label htmlFor="fee-reject-note">Reason (optional)</Label>
                <Textarea
                  id="fee-reject-note"
                  placeholder="e.g. Reference not found in bank records…"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={mut.isPending}>
              Cancel
            </Button>
            <Button
              className={
                action === "confirm"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }
              onClick={() => mut.mutate()}
              disabled={mut.isPending}
            >
              {mut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : action === "confirm" ? (
                <BadgeCheck className="mr-2 h-4 w-4" />
              ) : (
                <Ban className="mr-2 h-4 w-4" />
              )}
              {action === "confirm" ? "Confirm Payment" : "Reject Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Applications Tab ─────────────────────────────────────────────────────────

function ApplicationsTab({ initialStatus = "", initialGender = "", autoOpenCreate = false }: { initialStatus?: string; initialGender?: string; autoOpenCreate?: boolean }) {
  const { toast }   = useToast();
  const queryClient = useQueryClient();
  const { classOptions } = useClassOptions();
  const [searchTerm, setSearchTerm]       = useState("");
  const [status, setStatus]               = useState(initialStatus || "all");
  const [classApplying, setClassApplying] = useState("all");
  const [gender, setGender]               = useState(initialGender || "all");

  // Respect per-tenant field config so disabled fields are hidden from filters/columns
  const { data: adminFormConfig } = useGetAdminAdmissionFormConfig();
  const { data: payConfig } = useGetAdminAdmissionPaymentConfig();
  const appFeeAmount: number = (payConfig as any)?.applicationFeeAmount ?? 0;
  const genderFieldEnabled = (adminFormConfig?.find((f) => f.fieldKey === "gender")?.enabled) ?? true;
  const cityFieldEnabled   = (adminFormConfig?.find((f) => f.fieldKey === "city")?.enabled) ?? true;
  const [page, setPage]                   = useState(1);
  const [pageSize, setPageSize]           = useState(25);
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [density, setDensity]             = useLocalPref<Density>("ccm_app_density_v1", "comfortable");
  const [sortItems, setSortItems]         = useState<{ key: string; dir: "asc" | "desc" }[]>([]);
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 400);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/applications"] });
    queryClient.refetchQueries({ queryKey: ["/api/admin/applications"], type: "active" });
  }

  const inlineMutation = useUpdateAdminApplicationStatus({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Status updated" }); },
      onError:   () => { invalidate(); toast({ title: "Update failed", variant: "destructive" }); },
    },
  });

  const bulkMutation = useBulkUpdateAdminApplicationStatus({
    mutation: {
      onSuccess: (data) => { invalidate(); clearSelection(); toast(summarizeBulkStatusResult(data as BulkStatusResult)); },
      onError: () => { invalidate(); toast({ title: "Bulk update failed", variant: "destructive" }); },
    },
  });

  const qp = {
    q: debouncedSearch || undefined,
    status: status !== "all" ? status : undefined,
    classApplying: classApplying !== "all" ? classApplying : undefined,
    gender: gender !== "all" ? (gender as "male" | "female" | "other") : undefined,
    page, pageSize,
    sort: sortItems.length > 0 ? sortItems.map(s => `${s.key}:${s.dir}`).join(",") : undefined,
    duplicatesOnly: duplicatesOnly || undefined,
  };
  const { data, isLoading, isFetching, isError, error } = useListAdminApplications(qp, {
    query: { queryKey: getListAdminApplicationsQueryKey(qp), placeholderData: keepPreviousData },
  });
  const is401 = isError && error instanceof Error && "status" in error && (error as any).status === 401;
  const items      = data?.items ?? [];
  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  const allPageSelected = items.length > 0 && items.every(a => selected.has(a.referenceId));
  function clearSelection() { setSelected(new Set()); }
  function toggleRow(id: string) { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleAllOnPage() {
    setSelected(prev => {
      const n = new Set(prev);
      if (allPageSelected) items.forEach(a => n.delete(a.referenceId)); else items.forEach(a => n.add(a.referenceId));
      return n;
    });
  }

  type Chip = { label: string; clear: () => void };
  const filterChips: Chip[] = [
    ...(debouncedSearch ? [{ label: `"${debouncedSearch}"`, clear: () => { setSearchTerm(""); setSortItems([]); setPage(1); } }] : []),
    ...(status !== "all" ? [{ label: statusLabel(status), clear: () => { setStatus("all"); setSortItems([]); setPage(1); } }] : []),
    ...(classApplying !== "all" ? [{ label: classLabel(classApplying), clear: () => { setClassApplying("all"); setSortItems([]); setPage(1); } }] : []),
    ...(gender !== "all" ? [{ label: gender.charAt(0).toUpperCase() + gender.slice(1), clear: () => { setGender("all"); setSortItems([]); setPage(1); } }] : []),
    ...(duplicatesOnly ? [{ label: "Duplicates only", clear: () => { setDuplicatesOnly(false); setPage(1); } }] : []),
  ];
  function clearAllFilters() { setSearchTerm(""); setStatus("all"); setClassApplying("all"); setGender("all"); setDuplicatesOnly(false); setSortItems([]); setPage(1); }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (gender !== "all") params.set("gender", gender); else params.delete("gender");
    if (status !== "all" && status) params.set("status", status); else params.delete("status");
    const qs = params.toString();
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (newUrl !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [gender, status]);

  const sortedItems = items;

  function cycleSort(col: string, e?: React.MouseEvent) {
    const existing = sortItems.find(s => s.key === col);
    if (e?.shiftKey) {
      if (!existing) { setSortItems(prev => [...prev, { key: col, dir: "asc" }]); setPage(1); }
      else if (existing.dir === "asc") { setSortItems(prev => prev.map(s => s.key === col ? { ...s, dir: "desc" as const } : s)); setPage(1); }
      else { setSortItems(prev => prev.filter(s => s.key !== col)); setPage(1); }
    } else {
      if (!existing) { setSortItems([{ key: col, dir: "asc" }]); setPage(1); }
      else if (existing.dir === "asc") { setSortItems([{ key: col, dir: "desc" }]); setPage(1); }
      else { setSortItems([]); setPage(1); }
    }
  }

  function SortIcon({ col }: { col: string }) {
    const item = sortItems.find(s => s.key === col);
    if (!item) return <ChevronsUpDown className="h-3 w-3 text-slate-300 group-hover:text-slate-400" />;
    return item.dir === "asc"
      ? <ChevronUp className="h-3 w-3 text-indigo-500" />
      : <ChevronDown className="h-3 w-3 text-indigo-500" />;
  }

  function exportCSV() {
    const target = selected.size > 0 ? sortedItems.filter(a => selected.has(a.referenceId)) : sortedItems;
    const header = ["Applicant ID","Student Name","Father Name","Class/Program","Applied On","Phone","Guardian Mobile","City","Fee Status","Payment Ref"].join(",");
    const rows = target.map(app => [
      app.referenceId,
      app.fullName ?? "",
      app.fatherName ?? "",
      (app as any).classApplying ? `Class ${(app as any).classApplying}` : "",
      (app as any).createdAt ? new Date((app as any).createdAt).toLocaleDateString("en-GB") : "",
      (app as any).contactNumber ?? "",
      displayPhone((app as any).guardianMobile) ?? "",
      (app as any).city ?? "",
      (app as any).feeStatus ?? "",
      (app as any).feeBankRef ?? "",
      statusLabel(app.status ?? ""),
    ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: `applications-${new Date().toISOString().slice(0,10)}.csv` }).click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: `${rows.length} rows` });
  }

  return (
    <div className="flex flex-col gap-4 max-w-[1600px] mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Applications</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            {is401
              ? <span className="text-amber-600 font-medium">Session expired — please log in again</span>
              : isError
              ? <><span className="text-red-500">Failed to load</span><button onClick={invalidate} className="text-indigo-600 hover:underline text-xs font-medium">Retry</button></>
              : data
              ? <><span>Showing <strong>{((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, data.total)}</strong> of <strong>{data.total.toLocaleString()}</strong> applicants</span>{isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />}</>
              : <><Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" /><span>Loading…</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportCsvDialog onCreated={invalidate} />
          <BulkCreateDialog onCreated={invalidate} autoOpen={autoOpenCreate} />
        </div>
      </div>

      {/* Filter bar */}
      <Card className="border shadow-sm">
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name, Applicant ID, phone…" className="pl-9 h-9" value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setSortItems([]); setPage(1); clearSelection(); }} />
            </div>
            <Select value={status} onValueChange={v => { setStatus(v); setSortItems([]); setPage(1); clearSelection(); }}>
              <SelectTrigger className="w-full md:w-[190px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={classApplying} onValueChange={v => { setClassApplying(v); setSortItems([]); setPage(1); clearSelection(); }}>
              <SelectTrigger className="w-full md:w-[190px] h-9"><SelectValue placeholder="Class/Program" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {genderFieldEnabled && (
            <Select value={gender} onValueChange={v => { setGender(v); setSortItems([]); setPage(1); clearSelection(); }}>
              <SelectTrigger className="w-full md:w-[150px] h-9"><SelectValue placeholder="Gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Genders</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            )}
            <button
              type="button"
              onClick={() => { setDuplicatesOnly(v => !v); setPage(1); clearSelection(); }}
              className={[
                "flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm font-medium transition-colors shrink-0",
                duplicatesOnly
                  ? "bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100"
                  : "bg-white border-input text-muted-foreground hover:border-orange-300 hover:text-orange-700",
              ].join(" ")}
            >
              <Copy className="h-3.5 w-3.5" />
              Duplicates only
            </button>
            {filterChips.length > 0 && (
              <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={clearAllFilters}>
                <X className="mr-1 h-3.5 w-3.5" /> Clear all
              </Button>
            )}
          </div>
          {filterChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-border">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                <Filter className="h-3 w-3" /> Active filters:
              </span>
              {filterChips.map(chip => (
                <button key={chip.label} onClick={chip.clear}
                  className="flex items-center gap-1 text-[11px] font-semibold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-full px-2.5 py-0.5 transition-colors">
                  {chip.label} <X className="h-2.5 w-2.5" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selection toolbar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5">
          <span className="text-sm font-bold text-indigo-800">{selected.size} selected</span>
          <div className="h-4 w-px bg-indigo-200" />
          <BulkDeleteDialog
            referenceIds={[...selected]}
            onDeleted={() => { clearSelection(); invalidate(); }}
          />
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-muted-foreground" onClick={clearSelection}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      )}

      {/* Session expired banner */}
      {is401 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Your session has expired</p>
            <p className="text-sm text-amber-700 mt-0.5">Please log in again to view and manage applications.</p>
          </div>
          <Link href="/login">
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0">
              Go to Login
            </Button>
          </Link>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">

        {/* Table toolbar */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-slate-50/60">
          <div className="flex items-center gap-1.5">
            <DensityMenu density={density} setDensity={setDensity} />
            <div className="h-4 w-px bg-slate-200" />
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-slate-600 font-semibold text-xs" onClick={async () => {
              const settings = await fetchPrintSettings();
              const PRINT_COLS: { label: string; getText: (app: any) => string }[] = [
                { label: "Applicant ID",     getText: a => a.referenceId ?? "" },
                { label: "Student Name",    getText: a => a.fullName ?? "" },
                { label: "Father Name",     getText: a => a.fatherName ?? "" },
                { label: "Class/Program Applied",   getText: a => a.classApplying ? `Class/Program ${a.classApplying}` : "" },
                { label: "Applied On",      getText: a => a.createdAt ? new Date(a.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "" },
                { label: "Phone",           getText: a => a.contactNumber ?? "" },
                { label: "Guardian Mobile", getText: a => displayPhone(a.guardianMobile) ?? "" },
                { label: "City",            getText: a => a.city ?? "" },
                { label: "Fee Status",      getText: a => { const fs: string = a.feeStatus ?? "pending"; return fs.charAt(0).toUpperCase() + fs.slice(1); } },
                { label: "Payment Ref",     getText: a => a.feeBankRef ?? "" },
                { label: "Verification",    getText: a => statusLabel(a.status ?? "") },
                { label: "Entry Test",      getText: a => derivedEntryTestStatus(a.status ?? "")?.label ?? "" },
                { label: "Interview",       getText: a => derivedInterviewStatus(a.status ?? "")?.label ?? "" },
                { label: "Enrollment",      getText: a => derivedEnrollmentStatus(a.status ?? "")?.label ?? "" },
              ];
              const tableHtml = `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px">
  <thead><tr>${PRINT_COLS.map(c => `<th style="background:#f1f5f9;font-weight:700;text-align:left;padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
  <tbody>${sortedItems.map((r: any, i: number) => `<tr style="${i % 2 === 1 ? "background:#f8fafc" : ""}">${PRINT_COLS.map(c => `<td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;vertical-align:middle">${escapeHtml(c.getText(r)) || "—"}</td>`).join("")}</tr>`).join("")}</tbody>
</table>`;
              const html = buildPrintHtml(tableHtml, settings, "Applications");
              printHtmlDocument(html);
            }}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-slate-600 font-semibold text-xs" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">
            {isLoading ? "Loading…" : `${sortedItems.length} rows on this page`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold">
                <th className="w-10 p-3 text-center">
                  <Checkbox checked={allPageSelected} onCheckedChange={toggleAllOnPage} aria-label="Select all" />
                </th>
                <th className="px-3 py-2.5 text-center w-10">#</th>
                <th className="px-3 py-2.5 text-center w-12">Photo</th>
                <th className="px-3 py-2.5 text-left min-w-[120px] cursor-pointer group select-none" onClick={(e) => cycleSort("referenceId", e)}>
                  <span className="flex items-center gap-1">Applicant ID <SortIcon col="referenceId" /></span>
                </th>
                <th className="px-3 py-2.5 text-left min-w-[160px] cursor-pointer group select-none" onClick={(e) => cycleSort("name", e)}>
                  <span className="flex items-center gap-1">Student Name <SortIcon col="name" /></span>
                </th>
                <th className="px-3 py-2.5 text-left min-w-[140px] cursor-pointer group select-none" onClick={(e) => cycleSort("fatherName", e)}>
                  <span className="flex items-center gap-1">Father Name <SortIcon col="fatherName" /></span>
                </th>
                <th className="px-3 py-2.5 text-left min-w-[90px] cursor-pointer group select-none" onClick={(e) => cycleSort("class", e)}>
                  <span className="flex items-center gap-1">Class <SortIcon col="class" /></span>
                </th>
                <th className="px-3 py-2.5 text-left min-w-[100px] cursor-pointer group select-none" onClick={(e) => cycleSort("createdAt", e)}>
                  <span className="flex items-center gap-1">Applied On <SortIcon col="createdAt" /></span>
                </th>
                <th className="px-3 py-2.5 text-left min-w-[120px]">Phone</th>
                <th className="px-3 py-2.5 text-left min-w-[120px]">Guardian Mobile</th>
                {cityFieldEnabled && (
                <th className="px-3 py-2.5 text-left min-w-[90px] cursor-pointer group select-none" onClick={(e) => cycleSort("city", e)}>
                  <span className="flex items-center gap-1">City <SortIcon col="city" /></span>
                </th>
                )}
                <th className="px-3 py-2.5 text-left min-w-[110px] cursor-pointer group select-none" onClick={(e) => cycleSort("feeStatus", e)}>
                  <span className="flex items-center gap-1">Fee Status <SortIcon col="feeStatus" /></span>
                </th>
                <th className="px-3 py-2.5 text-right min-w-[90px]">Amount</th>
                <th className="px-3 py-2.5 text-left min-w-[110px]">Payment Ref</th>
                <th className="px-3 py-2.5 text-left min-w-[110px]">Entry Test</th>
                <th className="px-3 py-2.5 text-left min-w-[110px]">Interview</th>
                <th className="px-3 py-2.5 text-left min-w-[110px]">Enrollment</th>
                <th className="px-3 py-2.5 text-center w-16">View</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 17 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><Skeleton className="h-4 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={17}>
                    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                      <div className="h-24 w-24 rounded-3xl bg-slate-100 flex items-center justify-center">
                        <FileArchive className="h-10 w-10 text-slate-300" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-slate-700">No applications found</p>
                        <p className="text-sm text-slate-400 mt-1">Try adjusting your filters or search query.</p>
                      </div>
                      {filterChips.length > 0 && (
                        <Button variant="outline" size="sm" onClick={clearAllFilters}>
                          <X className="mr-1.5 h-3.5 w-3.5" /> Clear all filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                sortedItems.map((app, idx) => {
                  const isSel = selected.has(app.referenceId);
                  const sr    = (page - 1) * pageSize + idx + 1;
                  return (
                    <tr key={app.referenceId}
                      className={cn("border-b border-slate-100 transition-colors", isSel ? "bg-indigo-50/60" : "hover:bg-slate-50/60", DENSITY_PY[density])}>
                      <td className="p-3 text-center">
                        <Checkbox checked={isSel} onCheckedChange={() => toggleRow(app.referenceId)} />
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs text-slate-400 font-mono">{sr}</td>
                      {/* Photo */}
                      <td className="px-3 py-2.5 text-center">
                        {(app as any).photoFilename ? (
                          <img
                            src={(app as any).photoFilename?.startsWith("http") || (app as any).photoFilename?.startsWith("/") ? (app as any).photoFilename : `/uploads/${(app as any).photoFilename}`}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover mx-auto ring-1 ring-slate-200"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }}
                          />
                        ) : null}
                        <div className={cn("h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center mx-auto text-indigo-600 text-xs font-bold", (app as any).photoFilename ? "hidden" : "")}>
                          {app.fullName?.[0]?.toUpperCase() ?? "?"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <Link href={`/applications/${app.referenceId}`} className="font-mono text-xs font-bold text-indigo-600 hover:underline hover:text-indigo-800 cursor-pointer">{app.referenceId}</Link>
                          {(((app as any).duplicateRefs as string[] | null | undefined) ?? []).length > 0 && (() => {
                            const dupRefs = (app as any).duplicateRefs as string[];
                            return (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    className="flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-full px-1.5 py-0.5 transition-colors w-fit"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <AlertCircle className="h-2.5 w-2.5 shrink-0" />
                                    Duplicate
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-3 shadow-xl rounded-xl text-xs" align="start" sideOffset={4}>
                                  <p className="font-bold text-amber-800 mb-1.5">Potential duplicate</p>
                                  <p className="text-slate-600 mb-2">Shares student email, phone, or B-form with:</p>
                                  <div className="flex flex-col gap-1">
                                    {dupRefs.map(r => (
                                      <Link key={r} href={`/applications/${r}`}>
                                        <span className="font-mono text-[11px] text-indigo-600 hover:underline cursor-pointer">{r}</span>
                                      </Link>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-slate-800 text-[13px]">{app.fullName}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[12.5px] text-slate-600">
                        {app.fatherName ?? <span className="text-slate-300">—</span>}
                      </td>
                      {/* Class */}
                      <td className="px-3 py-2.5 text-[12px] text-slate-600 whitespace-nowrap">
                        {(app as any).classApplying ? <span className="font-medium">Class {(app as any).classApplying}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      {/* Applied On */}
                      <td className="px-3 py-2.5 text-[12px] text-slate-500 whitespace-nowrap">
                        {(app as any).createdAt ? new Date((app as any).createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-[12.5px] text-slate-600">
                        {(app as any).contactNumber ?? <span className="text-slate-300">—</span>}
                      </td>
                      {/* Guardian Mobile */}
                      <td className="px-3 py-2.5 text-[12.5px] text-slate-600">
                        {displayPhone((app as any).guardianMobile) ?? <span className="text-slate-300">—</span>}
                      </td>
                      {cityFieldEnabled && (
                      <td className="px-3 py-2.5 text-[12.5px] text-slate-600">
                        {(app as any).city ?? <span className="text-slate-300">—</span>}
                      </td>
                      )}
                      {/* Fee Status */}
                      <td className="px-3 py-2.5">
                        {(() => {
                          const fs = (app as any).feeStatus as string | undefined;
                          if (!fs || fs === "pending") return <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">Pending</span>;
                          if (fs === "submitted")    return <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-blue-50 text-blue-600 border border-blue-200">Submitted</span>;
                          if (fs === "verified")     return <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">Verified</span>;
                          if (fs === "rejected")     return <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-600 border border-red-200">Rejected</span>;
                          if (fs === "paid")         return <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300">✓ Paid</span>;
                          if (fs === "bank_pending") return <BankPendingVerifyDialog referenceId={app.referenceId} bankRef={(app as any).feeBankRef ?? null} receiptUrl={(app as any).feeReceiptUrl ?? null} amount={appFeeAmount} onDone={invalidate} />;
                          if (fs === "free")         return <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">Free</span>;
                          return <span className="text-slate-300">—</span>;
                        })()}
                      </td>
                      {/* Amount */}
                      <td className="px-3 py-2.5 text-right">
                        {appFeeAmount > 0
                          ? <span className="text-[12px] font-semibold text-slate-700">{formatCurrency(appFeeAmount)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      {/* Payment Ref */}
                      <td className="px-3 py-2.5 text-[12px] font-mono text-slate-500">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{(app as any).feeBankRef ?? <span className="text-slate-300">—</span>}</span>
                          {(app as any).feeReceiptUrl && (
                            <a
                              href={(app as any).feeReceiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View receipt"
                              className="text-sky-500 hover:text-sky-700 transition-colors"
                              onClick={e => e.stopPropagation()}
                            >
                              <ArrowUpRight className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><StagePill s={derivedEntryTestStatus(app.status ?? "")} /></td>
                      <td className="px-3 py-2.5"><StagePill s={derivedInterviewStatus(app.status ?? "")} /></td>
                      <td className="px-3 py-2.5"><StagePill s={derivedEnrollmentStatus(app.status ?? "")} /></td>
                      <td className="px-3 py-2.5 text-center">
                        <Link href={`/applications/${app.referenceId}`}>
                          <button className="h-7 w-7 rounded-lg flex items-center justify-center mx-auto text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="View">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-3">
            <p className="text-[12px] text-muted-foreground">
              <span className="font-bold text-slate-700">{((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, data.total)}</span>{" "}
              of <span className="font-bold text-slate-700">{data.total.toLocaleString()}</span>
            </p>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); clearSelection(); }}>
              <SelectTrigger className="h-7 w-[90px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1 || isLoading}
              onClick={() => { setPage(1); clearSelection(); }}>
              <ChevronLeft className="h-3 w-3" /><ChevronLeft className="h-3 w-3 -ml-2" />
            </Button>
            <Button variant="outline" size="sm" className="h-7" disabled={page <= 1 || isLoading}
              onClick={() => { setPage(p => p - 1); clearSelection(); }}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <span className="text-xs font-semibold text-slate-600 px-2">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7" disabled={page >= totalPages || isLoading}
              onClick={() => { setPage(p => p + 1); clearSelection(); }}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages || isLoading}
              onClick={() => { setPage(totalPages); clearSelection(); }}>
              <ChevronRight className="h-3 w-3" /><ChevronRight className="h-3 w-3 -ml-2" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dialogs (unchanged from original) ───────────────────────────────────────

function ScheduleDialog({ referenceIds, applicants = [], onDone }: { referenceIds: string[]; applicants?: any[]; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [testDate, setTestDate]       = useState("");
  const [centreId, setCentreId]       = useState("");
  const [prefix, setPrefix]           = useState("CCM-");
  const [startNumber, setStartNumber] = useState("");
  const [padding, setPadding]         = useState("4");

  const selected = applicants.filter(a => referenceIds.includes(a.referenceId));
  const unpaidCount = selected.filter(a => (a as any).admissionFeeStatus !== "paid").length;

  const { data: activeCentres } = useListActiveTestCentres();

  useEffect(() => {
    if (!open) return;
    const ids = selected.map(a => (a as any).testCentreId).filter(Boolean);
    const unique = [...new Set(ids)];
    setCentreId(unique.length === 1 ? (unique[0] as string) : "");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useBulkScheduleAdminApplicationTest({
    mutation: {
      onSuccess: (r) => { toast({ title: "Tests scheduled", description: `${r.updated} applicants scheduled.` }); setOpen(false); onDone(); },
      onError:   (err: any) => toast({ title: "Schedule failed", description: err?.response?.data?.error ?? "Could not schedule.", variant: "destructive" }),
    },
  });

  function submit() {
    if (!testDate || !prefix.trim()) {
      toast({ title: "Missing details", description: "Test date and roll-number prefix are required.", variant: "destructive" }); return;
    }
    mutation.mutate({ data: { referenceIds, testDate: new Date(testDate).toISOString(), centreId: centreId && centreId !== "__none" ? centreId : undefined, rollNumberPrefix: prefix.trim(), startNumber: startNumber.trim() ? Number(startNumber) : undefined, padding: Number(padding) || 4 } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7 border-indigo-200 text-indigo-700 hover:bg-indigo-100" onClick={() => setOpen(true)} data-testid="button-bulk-schedule">
        <CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Schedule
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule Entry Test</DialogTitle>
          <DialogDescription>Assign a test date and auto-generate roll numbers for {referenceIds.length} applicant{referenceIds.length !== 1 ? "s" : ""}.</DialogDescription>
        </DialogHeader>
        {unpaidCount > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-500" />
            <span><strong>{unpaidCount} of {referenceIds.length}</strong> selected applicant{unpaidCount !== 1 ? "s have" : " has"} an unpaid application fee. Verify fee payment before scheduling a test.</span>
          </div>
        )}
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Test Date</Label>
            <Input type="date" className="col-span-3" value={testDate} onChange={e => setTestDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Exam Centre</Label>
            <div className="col-span-3">
              <Select value={centreId} onValueChange={setCentreId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a centre (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {(activeCentres ?? []).length === 0 ? (
                    <SelectItem value="__none" disabled>No active centres — add one in Exam Centres</SelectItem>
                  ) : (
                    (activeCentres ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground ml-1.5 text-xs">{c.city}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Roll Prefix</Label>
            <Input className="col-span-3" value={prefix} onChange={e => setPrefix(e.target.value)} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Start No.</Label>
            <Input className="col-span-3" type="number" placeholder="1" value={startNumber} onChange={e => setStartNumber(e.target.value)} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Padding</Label>
            <Input className="col-span-3" type="number" value={padding} onChange={e => setPadding(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Schedule Setup Dialog (server-side pool filter) ─────────────────────────

const SCHEDULE_FILTER_OPTIONS = [
  {
    group: "By Application Status",
    items: [
      { value: "all",                  label: "All (entire pipeline)" },
      { value: "received",             label: "Received" },
      { value: "under_review",         label: "Under Review" },
      { value: "pending_verification", label: "Pending Verification" },
      { value: "verified",             label: "Doc Verified" },
    ],
  },
  {
    group: "By Fee State",
    items: [
      { value: "fee_submitted", label: "Application Fee Submitted" },
      { value: "fee_confirmed", label: "Application Fee Confirmed" },
    ],
  },
  {
    group: "By Document Verification",
    items: [
      { value: "docs_all_verified", label: "All Docs Verified" },
      { value: "docs_any_pending",  label: "Any Doc Pending" },
    ],
  },
] as const;

function ScheduleSetupDialog({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [filter, setFilter]           = useState("all");
  const [testDate, setTestDate]       = useState("");
  const [centreId, setCentreId]       = useState("");
  const [prefix, setPrefix]           = useState("CCM-");
  const [startNumber, setStartNumber] = useState("");
  const [padding, setPadding]         = useState("4");

  const { data: activeCentres } = useListActiveTestCentres();

  const mutation = useScheduleAllAdminApplications({
    mutation: {
      onSuccess: (r) => {
        toast({ title: "Tests scheduled", description: `${r.scheduled} applicant${r.scheduled !== 1 ? "s" : ""} scheduled.` });
        setOpen(false);
        onDone();
      },
      onError: (err: unknown) => toast({ title: "Schedule failed", description: (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Could not schedule.", variant: "destructive" }),
    },
  });

  function submit() {
    if (!testDate || !prefix.trim()) {
      toast({ title: "Missing details", description: "Test date and roll-number prefix are required.", variant: "destructive" }); return;
    }
    mutation.mutate({
      data: {
        filter: filter as Parameters<typeof mutation.mutate>[0]["data"]["filter"],
        testDate: new Date(testDate).toISOString(),
        centreId: centreId && centreId !== "__none" ? centreId : undefined,
        rollNumberPrefix: prefix.trim(),
        startNumber: startNumber.trim() ? Number(startNumber) : undefined,
        padding: Number(padding) || 4,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="default" className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => setOpen(true)}>
        <Wand2 className="h-3.5 w-3.5" /> Schedule Setup
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule Entry Test — Bulk Setup</DialogTitle>
          <DialogDescription>
            Select a filter to resolve the applicant pool server-side, then assign a test date and roll numbers in one step.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-sm">Schedule For</Label>
            <div className="col-span-3">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a filter…" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_FILTER_OPTIONS.map(group => (
                    <SelectGroup key={group.group}>
                      <SelectLabel className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 py-1">{group.group}</SelectLabel>
                      {group.items.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-sm">Test Date</Label>
            <Input type="date" className="col-span-3" value={testDate} onChange={e => setTestDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-sm">Exam Centre</Label>
            <div className="col-span-3">
              <Select value={centreId} onValueChange={setCentreId}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep applicant's own centre (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Keep applicant's own centre</SelectItem>
                  {(activeCentres ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground ml-1.5 text-xs">{c.city}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-sm">Roll Prefix</Label>
            <Input className="col-span-3" value={prefix} onChange={e => setPrefix(e.target.value)} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-sm">Start No.</Label>
            <Input className="col-span-3" type="number" placeholder="Auto (continue from last)" value={startNumber} onChange={e => setStartNumber(e.target.value)} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-sm">Padding</Label>
            <Input className="col-span-3" type="number" value={padding} onChange={e => setPadding(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultsDialog({ applicants, onDone }: { applicants: any[]; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen]     = useState(false);
  const [newStatus, setNewStatus] = useState("result_announced");

  const mutation = useBulkUpdateAdminApplicationStatus({
    mutation: {
      onSuccess: (r) => { toast({ title: "Results recorded", description: `${r.updated} updated.` }); setOpen(false); onDone(); },
      onError:   () => toast({ title: "Failed", variant: "destructive" }),
    },
  });

  function submit() {
    mutation.mutate({ data: { referenceIds: applicants.map(a => a.referenceId), status: newStatus as never } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7 border-indigo-200 text-indigo-700 hover:bg-indigo-100" onClick={() => setOpen(true)} data-testid="button-bulk-results">
        <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" /> Results
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Results</DialogTitle>
          <DialogDescription>Set result status for {applicants.length} selected applicant{applicants.length !== 1 ? "s" : ""}.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Status</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESULT_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Results
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Create Dialog (admin visitor inquiry entry) ─────────────────────────

type BulkRow = { _id: string; fullName: string; fatherName: string; phone: string; classApplying: string; city: string; gender: string };
function emptyBulkRow(): BulkRow {
  return { _id: crypto.randomUUID(), fullName: "", fatherName: "", phone: "", classApplying: "", city: "", gender: "" };
}

function BulkCreateDialog({ onCreated, autoOpen = false }: { onCreated: () => void; autoOpen?: boolean }) {
  const { toast } = useToast();
  const { classOptions } = useClassOptions();
  const [open, setOpen] = useState(autoOpen);
  const [rows, setRows] = useState<BulkRow[]>([emptyBulkRow()]);
  const [saving, setSaving] = useState(false);

  const updateRow = (id: string, field: keyof BulkRow, value: string) =>
    setRows(p => p.map(r => r._id === id ? { ...r, [field]: value } : r));

  const validRows = rows.filter(r => r.fullName.trim() && r.classApplying);

  async function handleSubmit() {
    if (!validRows.length) { toast({ title: "Add at least one applicant with a name and class" }); return; }
    setSaving(true);
    try {
      const resp = await fetch("/api/admin/applications/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ rows: validRows }),
      });
      if (!resp.ok) {
        if (resp.status === 401) {
          toast({ title: "Session expired — please log in", variant: "destructive" });
          setTimeout(() => {
            clearAuth();
            const base = import.meta.env.BASE_URL.replace(/\/$/, "");
            window.location.replace(`${base}/login`);
          }, 800);
          return;
        }
        throw new Error("Failed");
      }
      const data = await resp.json();
      toast({ title: `${data.created} application(s) created`, description: data.referenceIds.slice(0, 3).join(", ") + (data.referenceIds.length > 3 ? "…" : "") });
      onCreated();
      setOpen(false);
      setRows([emptyBulkRow()]);
    } catch {
      toast({ title: "Failed to create applications", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function handleClose() { setOpen(false); setRows([emptyBulkRow()]); }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <UserPlus className="h-4 w-4" /> New Application
      </Button>
      <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-indigo-600" /> Visitor Inquiry — Bulk Entry
            </DialogTitle>
            <DialogDescription>
              Enter walk-in or phone enquiries. Each row creates one application (Source: Visitor Inquiry). Required: First Name + Class/Program.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-auto flex-1 border border-slate-200 rounded-xl">
            <table className="w-full text-sm border-collapse min-w-[640px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="w-8 px-2 py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">#</th>
                  <th className="px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Full Name <span className="text-red-400">*</span></th>
                  <th className="px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Father Name</th>
                  <th className="px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phone</th>
                  <th className="w-44 px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Class <span className="text-red-400">*</span></th>
                  <th className="w-28 px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gender</th>
                  <th className="px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">City</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={row._id} className={cn("border-b border-slate-100 last:border-0", ri % 2 === 0 ? "bg-white" : "bg-slate-50/50")}>
                    <td className="px-2 py-1.5 text-center text-xs text-slate-400 font-mono">{ri + 1}</td>
                    <td className="px-1 py-1">
                      <Input className="h-7 text-xs border-0 shadow-none bg-transparent focus:bg-white focus:border focus:border-indigo-300 rounded" value={row.fullName} onChange={e => updateRow(row._id, "fullName", e.target.value)} placeholder="Ahmed Khan" />
                    </td>
                    <td className="px-1 py-1">
                      <Input className="h-7 text-xs border-0 shadow-none bg-transparent focus:bg-white focus:border focus:border-indigo-300 rounded" value={row.fatherName} onChange={e => updateRow(row._id, "fatherName", e.target.value)} placeholder="Muhammad Khan" />
                    </td>
                    <td className="px-1 py-1">
                      <Input className="h-7 text-xs border-0 shadow-none bg-transparent focus:bg-white focus:border focus:border-indigo-300 rounded" value={row.phone} onChange={e => updateRow(row._id, "phone", formatPhone(e.target.value))} placeholder="0300-0000000" maxLength={12} />
                    </td>
                    <td className="px-1 py-1">
                      <Select value={row.classApplying || "__none__"} onValueChange={v => updateRow(row._id, "classApplying", v === "__none__" ? "" : v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Select class…</SelectItem>
                          {classOptions.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-1 py-1">
                      <Select value={row.gender || "__none__"} onValueChange={v => updateRow(row._id, "gender", v === "__none__" ? "" : v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-1 py-1">
                      <Input className="h-7 text-xs border-0 shadow-none bg-transparent focus:bg-white focus:border focus:border-indigo-300 rounded" value={row.city} onChange={e => updateRow(row._id, "city", e.target.value)} placeholder="Rawalpindi" />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => rows.length > 1 && setRows(p => p.filter(r => r._id !== row._id))} className={cn("h-6 w-6 rounded flex items-center justify-center transition-colors", rows.length > 1 ? "text-slate-300 hover:text-red-400 hover:bg-red-50" : "text-slate-100 cursor-not-allowed")}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setRows(p => [...p, emptyBulkRow()])}
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Row
          </button>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || validRows.length === 0}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create {validRows.length > 0 ? `${validRows.length} ` : ""}Application{validRows.length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── CSV / XLSX Import Dialog ──────────────────────────────────────────────────

const PREVIEW_CAP = 100;

const TEMPLATE_HEADERS_CREATE = ["register_id", "candidate_name", "father_name", "phone", "class", "gender", "email", "exam_center", "address", "city", "payment_status", "application_date"];
const TEMPLATE_EXAMPLE_CREATE = ["", "Ahmed Khan", "Muhammad Khan", "03001234567", "class-9", "male", "ahmed@example.com", "Rawalpindi", "House 12 Street 4 Rawalpindi", "Rawalpindi", "pending", "2026-01-15"];

const TEMPLATE_HEADERS_UPDATE = ["register_id", "candidate_name", "father_name", "phone", "class", "gender", "email", "exam_center", "address", "city", "payment_status", "application_date"];
const TEMPLATE_EXAMPLE_UPDATE = ["CCM-2026-XXXXXX", "Ahmed Khan", "Muhammad Khan", "03001234567", "class-9", "male", "ahmed@example.com", "Rawalpindi", "House 12 Street 4 Rawalpindi", "Rawalpindi", "paid", "2026-01-15"];

// Normalise a header string to a canonical field key
function normaliseHeader(h: string): keyof ImportRow | null {
  const s = h.toLowerCase().replace(/[\s_\-\.]+/g, "");
  if (s === "registerid" || s === "registernumber" || s === "referenceid" || s === "ccmid" || s === "refid") return "referenceId";
  if (s === "candidatename" || s === "firstname" || s === "first")      return "__fullName__" as keyof ImportRow;
  if (s === "fathername"|| s === "father" || s === "fathersname")      return "fatherName";
  if (s === "phone" || s === "mobileno" || s === "mobile" || s === "contact" || s === "mobilenumber") return "phone";
  if (s === "class" || s === "classapplying" || s === "classapplied")  return "classApplying";
  if (s === "city")                                                     return "city";
  if (s === "gender" || s === "sex")                                    return "gender";
  if (s === "email" || s === "studentemail" || s === "emailaddress")   return "studentEmail";
  if (s === "examcenter" || s === "examcentre" || s === "testcenter" || s === "testcentre") return "examCenter";
  if (s === "address" || s === "presentaddress" || s === "homeaddress") return "presentAddress";
  if (s === "paymentstatus" || s === "payment_status" || s === "feestatus" || s === "fee_status" || s === "paystatus") return "paymentStatus";
  if (s === "applicationdate" || s === "application_date" || s === "dateapplied" || s === "date_applied" || s === "applydate") return "applicationDate";
  // combined "Name" column — flag for post-processing
  if (s === "name" || s === "studentname" || s === "fullname")         return "__fullName__" as keyof ImportRow;
  return null;
}

type ImportRow = { _id: string; referenceId: string; fullName: string; fatherName: string; phone: string; classApplying: string; city: string; gender: string; studentEmail: string; examCenter: string; presentAddress: string; paymentStatus: string; applicationDate: string };

function emptyImportRow(): ImportRow {
  return { _id: crypto.randomUUID(), referenceId: "", fullName: "", fatherName: "", phone: "", classApplying: "", city: "", gender: "", studentEmail: "", examCenter: "", presentAddress: "", paymentStatus: "", applicationDate: "" };
}

function downloadTemplate(updateMode: boolean) {
  const headers = updateMode ? TEMPLATE_HEADERS_UPDATE : TEMPLATE_HEADERS_CREATE;
  const example = updateMode ? TEMPLATE_EXAMPLE_UPDATE : TEMPLATE_EXAMPLE_CREATE;
  const lines = [headers.join(","), example.join(",")];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = updateMode ? "applicants-update-template.csv" : "applicants-template.csv";
  a.click(); URL.revokeObjectURL(url);
}

function normalisePaymentStatus(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === "paid")                        return "paid";
  if (s === "submitted" || s === "submit") return "submitted";
  if (s === "pending" || s === "unpaid" || s === "") return "";
  return "";
}

function normaliseDate(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  // Already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Excel serial number (integer or float like 46175 or 46175.208)
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    // Excel epoch: Dec 30 1899 (accounting for Lotus bug)
    const msPerDay = 86400000;
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + serial * msPerDay);
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  // MM/DD/YYYY or DD/MM/YYYY — try ISO parse as fallback
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return s;
}

function applyRawToImportRow(r: Record<string, string>): ImportRow {
  const row = emptyImportRow();
  let fullName = "";
  for (const [k, v] of Object.entries(r)) {
    const field = normaliseHeader(k);
    if (!field) continue;
    if (field === ("__fullName__" as string)) { fullName = String(v).trim(); continue; }
    (row as Record<string, string>)[field as string] = String(v).trim();
  }
  // Use fullName directly
  if (fullName && !row.fullName) {
    row.fullName = fullName;
  }
  // Normalise payment status and date regardless of source
  row.paymentStatus  = normalisePaymentStatus(row.paymentStatus);
  row.applicationDate = normaliseDate(row.applicationDate);
  return row;
}

async function parseFileToRows(file: File): Promise<ImportRow[]> {
  const XLSX = await import("xlsx");
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
  if (!raw.length) return [];
  return raw.map(r => applyRawToImportRow(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "")]))));
}

async function parsePastedCsv(text: string): Promise<ImportRow[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(text, { type: "string" });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return raw.map(applyRawToImportRow);
}

// ── Bulk Delete Dialog ────────────────────────────────────────────────────────
function BulkDeleteDialog({ referenceIds, onDeleted }: { referenceIds: string[]; onDeleted: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  const count = referenceIds.length;
  const required = `delete ${count} applicant${count !== 1 ? "s" : ""}`;
  const confirmValid = confirmText.trim().toLowerCase() === required.toLowerCase();

  function reset() {
    setConfirmText("");
    setLoading(false);
  }

  async function handleDelete() {
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/applications/bulk-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ referenceIds }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast({ title: data?.error ?? "Delete failed", variant: "destructive" });
        return;
      }
      toast({ title: `${data.deleted} applicant${data.deleted !== 1 ? "s" : ""} permanently deleted` });
      setOpen(false);
      reset();
      onDeleted();
    } catch {
      toast({ title: "Network error — please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
        onClick={() => { reset(); setOpen(true); }}
      >
        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
      </Button>

      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Permanently Delete {count} Applicant{count !== 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>
              This action <strong>cannot be undone</strong>. All records, documents, and history for the selected applicants will be permanently removed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              You are about to delete <strong>{count}</strong> applicant{count !== 1 ? "s" : ""}. To confirm, type:
              <div className="mt-2 font-mono font-bold tracking-wide select-all">{required}</div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-text" className="text-sm">Confirmation phrase</Label>
              <Input
                id="confirm-text"
                placeholder={required}
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && confirmValid && !loading && handleDelete()}
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }} disabled={loading}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={!confirmValid || loading}
              onClick={handleDelete}
            >
              {loading ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Deleting…</> : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImportCsvDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const { classOptions } = useClassOptions();
  const validClassCodes = useMemo(() => new Set(classOptions.map(c => c.value)), [classOptions]);

  const [open, setOpen]         = useState(false);
  const [step, setStep]         = useState<"upload" | "preview">("upload");
  const [updateMode, setUpdateMode] = useState(false);
  const [rows, setRows]         = useState<ImportRow[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [importedSoFar, setImportedSoFar] = useState(0);
  const [importTotal, setImportTotal]     = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function updateRow(id: string, field: keyof ImportRow, value: string) {
    setRows(p => p.map(r => r._id === id ? { ...r, [field]: value } : r));
  }
  function removeRow(id: string) {
    setRows(p => p.filter(r => r._id !== id));
  }

  function rowIsValid(r: ImportRow) {
    if (updateMode) return r.referenceId.trim() !== "";
    return r.fullName.trim() !== "" && r.classApplying !== "";
  }
  function classIsKnown(code: string) {
    return code === "" || validClassCodes.has(code);
  }

  const validRows = rows.filter(rowIsValid);
  const invalidCount = rows.filter(r => !rowIsValid(r)).length;

  async function loadFile(file: File) {
    setParsing(true);
    try {
      const parsed = await parseFileToRows(file);
      if (!parsed.length) { toast({ title: "No rows found", description: "The file appears empty or headers don't match the template." }); return; }
      setRows(parsed);
      setStep("preview");
    } catch {
      toast({ variant: "destructive", title: "Parse error", description: "Could not read the file. Use the template and try again." });
    } finally {
      setParsing(false);
    }
  }

  async function loadPaste() {
    if (!pasteText.trim()) return;
    setParsing(true);
    try {
      const parsed = await parsePastedCsv(pasteText.trim());
      if (!parsed.length) { toast({ title: "No rows found", description: "Check the pasted content — headers must match the template." }); return; }
      setRows(parsed);
      setPasteText("");
      setStep("preview");
    } catch {
      toast({ variant: "destructive", title: "Parse error", description: "Could not parse the pasted text as CSV." });
    } finally {
      setParsing(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }

  const CHUNK_SIZE = 100;

  async function handleSubmit() {
    if (!validRows.length) return;
    setSaving(true);
    setImportedSoFar(0);
    setImportTotal(validRows.length);
    const allReferenceIds: string[] = [];
    let totalCreated = 0;
    let totalUpdated = 0;
    try {
      for (let offset = 0; offset < validRows.length; offset += CHUNK_SIZE) {
        const chunk = validRows.slice(offset, offset + CHUNK_SIZE);
        const resp = await fetch("/api/admin/applications/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ rows: chunk, updateMode }),
        });
        if (!resp.ok) {
          if (resp.status === 401) {
            clearAuth();
            toast({ title: "Session expired — please log in", variant: "destructive" });
            const base = import.meta.env.BASE_URL.replace(/\/$/, "");
            window.location.replace(`${base}/login`);
            return;
          }
          throw new Error("Failed");
        }
        const data = await resp.json();
        totalCreated += (data.created as number) ?? 0;
        totalUpdated += (data.updated as number) ?? 0;
        allReferenceIds.push(...(data.referenceIds as string[]));
        setImportedSoFar(Math.min(offset + CHUNK_SIZE, validRows.length));
      }
      if (updateMode) {
        toast({
          title: `${totalUpdated} application(s) updated`,
          description: allReferenceIds.slice(0, 3).join(", ") + (allReferenceIds.length > 3 ? " …" : ""),
        });
      } else {
        toast({
          title: `${totalCreated} application(s) imported`,
          description: allReferenceIds.slice(0, 3).join(", ") + (allReferenceIds.length > 3 ? " …" : ""),
        });
      }
      onCreated();
      handleClose();
    } catch {
      toast({ variant: "destructive", title: updateMode ? "Update failed" : "Import failed", description: "Could not process applications. Please try again." });
    } finally {
      setSaving(false);
      setImportedSoFar(0);
      setImportTotal(0);
    }
  }

  function handleClose() {
    setOpen(false);
    setStep("upload");
    setRows([]);
    setPasteText("");
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400"
      >
        <Upload className="h-4 w-4" /> Import CSV
      </Button>

      <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5 text-indigo-600" />
              {step === "upload"
                ? (updateMode ? "Update Applicants — Upload File" : "Import Applicants — Upload File")
                : `${updateMode ? "Update" : "Import"} Applicants — Review ${rows.length} Row${rows.length !== 1 ? "s" : ""}`}
            </DialogTitle>
            <DialogDescription>
              {step === "upload"
                ? (updateMode
                    ? "Upload a CSV that includes the Applicant ID column (CCM-YYYY-XXXXXX) to update existing applicant records."
                    : "Upload a CSV or Excel file, or paste CSV text. Columns must match the template.")
                : `${validRows.length} valid row${validRows.length !== 1 ? "s" : ""} ready to ${updateMode ? "update" : "import"}${invalidCount > 0 ? ` · ${invalidCount} row${invalidCount !== 1 ? "s" : ""} ${updateMode ? "missing Applicant ID" : "missing required fields"} (highlighted)` : ""}.`}
            </DialogDescription>
          </DialogHeader>

          {step === "upload" ? (
            <div className="space-y-4 py-2">
              {/* Mode toggle */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                <button
                  onClick={() => setUpdateMode(false)}
                  className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition-colors", !updateMode ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                >
                  Create New
                </button>
                <button
                  onClick={() => setUpdateMode(true)}
                  className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition-colors", updateMode ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                >
                  Update Existing
                </button>
              </div>
              {/* Dropzone */}
              <div
                className={cn(
                  "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer",
                  dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 hover:border-indigo-300 hover:bg-slate-50",
                  parsing && "pointer-events-none opacity-60",
                )}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {parsing ? (
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                ) : (
                  <Upload className="h-8 w-8 text-indigo-400" />
                )}
                <div>
                  <p className="font-semibold text-slate-700">
                    {parsing ? "Parsing file…" : "Drop a CSV or Excel file here, or click to browse"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Supports .csv and .xlsx files — no row limit</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }}
                />
              </div>

              {/* Template download */}
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                <Download className="h-3.5 w-3.5" />
                <span>Not sure about the format?</span>
                <button
                  onClick={e => { e.stopPropagation(); downloadTemplate(updateMode); }}
                  className="font-semibold text-indigo-600 hover:underline"
                >
                  Download template (.csv)
                </button>
              </div>

              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-medium">or paste CSV below</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              {/* Paste area */}
              <div className="space-y-2">
                <Textarea
                  placeholder={`register_id,candidate_name,father_name,phone,class,gender,email,exam_center,address,city,payment_status,application_date\n,Ahmed Khan,Muhammad Khan,03001234567,class-9,male,ahmed@example.com,Rawalpindi,House 12 Street 4,Rawalpindi,pending,2026-01-15`}
                  className="h-28 font-mono text-xs resize-none"
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={!pasteText.trim() || parsing}
                  onClick={loadPaste}
                >
                  {parsing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Clipboard className="mr-1.5 h-3.5 w-3.5" />}
                  Parse &amp; Preview
                </Button>
              </div>
            </div>
          ) : (
            /* Step 2 — Preview & Fix */
            <div className="overflow-auto flex-1 border border-slate-200 rounded-xl">
              <table className="w-full text-sm border-collapse min-w-[900px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="w-8 px-2 py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">#</th>
                    {updateMode
                      ? <th className="w-36 px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Applicant ID <span className="text-red-400">*</span></th>
                      : <th className="w-36 px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Applicant ID</th>
                    }
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Candidate Name{!updateMode && <span className="text-red-400"> *</span>}</th>
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Father Name</th>
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phone</th>
                    <th className="w-44 px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Class{!updateMode && <span className="text-red-400"> *</span>}</th>
                    <th className="w-28 px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gender</th>
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email</th>
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Exam Center</th>
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Address</th>
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">City</th>
                    <th className="w-28 px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment Status</th>
                    <th className="w-32 px-2 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Application Date</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_CAP).map((row, ri) => {
                    const valid = rowIsValid(row);
                    const unknownClass = row.classApplying && !classIsKnown(row.classApplying);
                    return (
                      <tr
                        key={row._id}
                        className={cn(
                          "border-b border-slate-100 last:border-0",
                          !valid ? "bg-red-50/60" : ri % 2 === 0 ? "bg-white" : "bg-slate-50/50",
                        )}
                      >
                        <td className="px-2 py-1.5 text-center text-xs text-slate-400 font-mono">{ri + 1}</td>
                        {updateMode ? (
                          <td className="px-1 py-1">
                            <Input
                              className={cn("h-7 text-xs border-0 shadow-none bg-transparent focus:bg-white focus:border focus:border-indigo-300 rounded font-mono", !row.referenceId.trim() && "placeholder:text-red-400 border border-red-200 bg-red-50/40")}
                              value={row.referenceId}
                              onChange={e => updateRow(row._id, "referenceId", e.target.value.trim().toUpperCase())}
                              placeholder="CCM-YYYY-XXXXXX"
                            />
                          </td>
                        ) : (
                          <td className="px-1 py-1">
                            <Input
                              className="h-7 text-xs border-0 shadow-none bg-transparent focus:bg-white focus:border focus:border-indigo-300 rounded font-mono placeholder:text-slate-300"
                              value={row.referenceId}
                              onChange={e => updateRow(row._id, "referenceId", e.target.value.trim().toUpperCase())}
                              placeholder="auto"
                            />
                          </td>
                        )}
                        <td className="px-1 py-1">
                          <Input
                            className={cn("h-7 text-xs border-0 shadow-none bg-transparent focus:bg-white focus:border focus:border-indigo-300 rounded", !updateMode && !row.fullName.trim() && "placeholder:text-red-400")}
                            value={row.fullName}
                            onChange={e => updateRow(row._id, "fullName", e.target.value)}
                            placeholder="Required"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input className="h-7 text-xs border-0 shadow-none bg-transparent focus:bg-white focus:border focus:border-indigo-300 rounded" value={row.fatherName} onChange={e => updateRow(row._id, "fatherName", e.target.value)} placeholder="Father name" />
                        </td>
                        <td className="px-1 py-1">
                          <Input className="h-7 text-xs border-0 shadow-none bg-transparent focus:bg-white focus:border focus:border-indigo-300 rounded" value={row.phone} onChange={e => updateRow(row._id, "phone", formatPhone(e.target.value))} placeholder="0300-0000000" maxLength={12} />
                        </td>
                        <td className="px-1 py-1">
                          {unknownClass ? (
                            <div className="flex items-center gap-1">
                              <Input
                                className="h-7 text-xs border border-amber-300 bg-amber-50 focus:border-indigo-300 rounded"
                                value={row.classApplying}
                                onChange={e => updateRow(row._id, "classApplying", e.target.value)}
                                placeholder="class code"
                                title="Unknown class code — fix or select from dropdown"
                              />
                              <span className="text-amber-500 text-[10px] font-semibold whitespace-nowrap">Unknown</span>
                            </div>
                          ) : (
                            <Select value={row.classApplying || "__none__"} onValueChange={v => updateRow(row._id, "classApplying", v === "__none__" ? "" : v)}>
                              <SelectTrigger className={cn("h-7 text-xs", !row.classApplying && "border-red-300 bg-red-50/50")}>
                                <SelectValue placeholder="Select class…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Select class…</SelectItem>
                                {classOptions.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className="px-1 py-1">
                          <Select value={row.gender || "__none__"} onValueChange={v => updateRow(row._id, "gender", v === "__none__" ? "" : v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">—</SelectItem>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1">
                          <Input className="h-7 text-xs border-0 shadow-none bg-transparent focus:bg-white focus:border focus:border-indigo-300 rounded" value={row.studentEmail} onChange={e => updateRow(row._id, "studentEmail", e.target.value)} placeholder="email@example.com" />
                        </td>
                        <td className="px-1 py-1">
                          <Input className="h-7 text-xs border-0 shadow-none bg-transparent focus:bg-white focus:border focus:border-indigo-300 rounded" value={row.examCenter} onChange={e => updateRow(row._id, "examCenter", e.target.value)} placeholder="Rawalpindi" />
                        </td>
                        <td className="px-1 py-1">
                          <Input className="h-7 text-xs border-0 shadow-none bg-transparent focus:bg-white focus:border focus:border-indigo-300 rounded" value={row.presentAddress} onChange={e => updateRow(row._id, "presentAddress", e.target.value)} placeholder="Street, City" />
                        </td>
                        <td className="px-1 py-1">
                          <Input className="h-7 text-xs border-0 shadow-none bg-transparent focus:bg-white focus:border focus:border-indigo-300 rounded" value={row.city} onChange={e => updateRow(row._id, "city", e.target.value)} placeholder="City" />
                        </td>
                        <td className="px-1 py-1">
                          <Select value={row.paymentStatus || "__none__"} onValueChange={v => updateRow(row._id, "paymentStatus", v === "__none__" ? "" : v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="pending" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">pending</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="submitted">Submitted</SelectItem>
                              <SelectItem value="paid">Paid</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1">
                          <Input className="h-7 text-xs border-0 shadow-none bg-transparent focus:bg-white focus:border focus:border-indigo-300 rounded" value={row.applicationDate} onChange={e => updateRow(row._id, "applicationDate", e.target.value)} placeholder="YYYY-MM-DD" />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <button
                            onClick={() => removeRow(row._id)}
                            className="h-6 w-6 rounded flex items-center justify-center text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                            title="Remove row"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > PREVIEW_CAP && (
                <div className="px-4 py-2.5 bg-indigo-50 border-t border-indigo-100 text-xs text-indigo-700 text-center font-medium">
                  Showing first {PREVIEW_CAP} of {rows.length} rows — all {rows.length} will be imported
                </div>
              )}
            </div>
          )}

          {saving && importTotal > 0 && (
            <div className="px-1 pb-1 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">
                  {importedSoFar < importTotal
                    ? `Importing… ${importedSoFar} / ${importTotal}`
                    : `Finishing up…`}
                </span>
                <span className="tabular-nums">{importTotal > 0 ? Math.round((importedSoFar / importTotal) * 100) : 0}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${importTotal > 0 ? (importedSoFar / importTotal) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 gap-2">
            {step === "preview" && (
              <Button variant="ghost" size="sm" onClick={() => setStep("upload")} disabled={saving} className="mr-auto">
                ← Back
              </Button>
            )}
            <Button variant="outline" onClick={handleClose} disabled={saving || parsing}>Cancel</Button>
            {step === "upload" ? null : (
              <Button
                onClick={handleSubmit}
                disabled={saving || validRows.length === 0}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {updateMode
                  ? `Update ${validRows.length > 0 ? `${validRows.length} ` : ""}Applicant${validRows.length !== 1 ? "s" : ""}`
                  : `Import ${validRows.length > 0 ? `${validRows.length} ` : ""}Applicant${validRows.length !== 1 ? "s" : ""}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type MeritMode = "all" | "formula";

function MeritDialog({ onCommitted }: { onCommitted: () => void }) {
  const { toast } = useToast();
  const { classOptions } = useClassOptions();
  const [open, setOpen]                   = useState(false);
  const [classApplying, setClassApplying] = useState("");
  const [seats, setSeats]                 = useState("50");
  const [meritMode, setMeritMode]         = useState<MeritMode>("formula");
  // 3-step flow: setup → announced → done
  const [step, setStep]                   = useState<"setup" | "announced" | "done">("setup");
  const [announcedCount, setAnnouncedCount] = useState(0);

  const preview  = usePreviewAdminMeritList();
  const commit   = useCommitAdminMeritList({
    mutation: {
      onSuccess: (r) => {
        const desc = meritMode === "all"
          ? `${r.admitted} candidates qualified.`
          : `${r.admitted} qualified, ${r.rejected} rejected.`;
        toast({ title: "Merit list committed", description: desc });
        setStep("done");
        onCommitted();
      },
      onError: () => toast({ title: "Failed to commit", variant: "destructive" }),
    },
  });
  const announce = useAnnounceAdminMeritResults({
    mutation: {
      onSuccess: (r) => {
        setAnnouncedCount(r.announced ?? 0);
        setStep("announced");
        toast({ title: "Results announced", description: `${r.announced} candidate${r.announced !== 1 ? "s" : ""} can now see their result on the portal.` });
        onCommitted();
      },
      onError: () => toast({ title: "Failed to announce results", variant: "destructive" }),
    },
  });

  const previewData = preview.data;
  const totalSeats  = Number(seats);

  function handlePreview() {
    const cls = meritMode === "all" ? "" : classApplying;
    preview.mutate({ data: { classApplying: cls as never, seats: totalSeats, mode: meritMode } });
  }

  function handleAnnounce() {
    const cls = meritMode === "all" ? "" : classApplying;
    announce.mutate({ data: { classApplying: cls } });
  }

  function handleCommit() {
    const cls = meritMode === "all" ? "" : classApplying;
    commit.mutate({ data: { classApplying: cls as never, seats: totalSeats, rejectRemaining: true, mode: meritMode } });
  }

  function handleClose(v: boolean) {
    setOpen(v);
    if (!v) { preview.reset(); setStep("setup"); setAnnouncedCount(0); }
  }

  function handleModeChange(m: MeritMode) {
    setMeritMode(m);
    preview.reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Trophy className="mr-2 h-4 w-4" /> Generate Merit List
      </Button>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merit List</DialogTitle>
          <DialogDescription>
            {step === "setup"    && (meritMode === "all" ? "List every applicant for the selected class — no scoring, no gates. All will be marked Qualified on commit." : "Preview the ranked candidates, announce results to the portal, then commit final decisions.")}
            {step === "announced" && "Results are now visible to candidates on the portal. Review and commit the final admission decisions."}
            {step === "done"     && "All done — candidates have been updated."}
          </DialogDescription>
        </DialogHeader>

        {/* Step: Done */}
        {step === "done" && (
          <div className="py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
            <p className="font-semibold">Merit list committed successfully.</p>
            <p className="text-sm text-muted-foreground mt-1">
              {meritMode === "all"
                ? "All candidates have been marked Qualified."
                : "Candidates have been updated to Qualified / Waitlisted / Rejected."}
            </p>
          </div>
        )}

        {/* Step: Announced — awaiting final commit */}
        {step === "announced" && (
          <div className="flex flex-col gap-4 py-2">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              <p className="font-semibold">✓ Results announced to {announcedCount} candidate{announcedCount !== 1 ? "s" : ""}</p>
              <p className="text-xs mt-1">Candidates can now log in to the portal and see that results have been announced. Their final decision (Qualified / Waitlisted / Rejected) will be set when you commit below.</p>
            </div>
            {previewData && (
              <div className={cn("grid gap-2", meritMode === "all" ? "grid-cols-1" : "grid-cols-3")}>
                {meritMode === "all" ? (
                  <div className="rounded-xl border bg-white p-3 text-center shadow-sm">
                    <p className="text-xl font-extrabold" style={{ color: "#10b981" }}>{previewData.totalRanked}</p>
                    <p className="text-[11px] font-semibold text-slate-500">To Qualify</p>
                  </div>
                ) : (
                  [
                    { label: "To Qualify",   value: previewData.admitted,                                                           color: "#10b981" },
                    { label: "To Waitlist",  value: previewData.waitlisted,                                                         color: "#f59e0b" },
                    { label: "To Reject",    value: previewData.totalRanked - previewData.admitted - previewData.waitlisted,         color: "#ef4444" },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl border bg-white p-3 text-center shadow-sm">
                      <p className="text-xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
                      <p className="text-[11px] font-semibold text-slate-500">{s.label}</p>
                    </div>
                  ))
                )}
              </div>
            )}
            <p className="text-xs text-slate-400 text-center">This action is irreversible. Commit will finalise all admission decisions.</p>
          </div>
        )}

        {/* Step: Setup + Preview */}
        {step === "setup" && (
          <div className="flex flex-col gap-4 py-2">
            {/* Mode selector */}
            <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
              {(["formula", "all"] as MeritMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  className={cn(
                    "flex-1 py-2 px-3 text-xs font-semibold transition-all",
                    meritMode === m
                      ? "bg-white shadow-sm text-indigo-700 border-b-2 border-indigo-500"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {m === "formula" ? "Formula Merit List" : "All Candidates"}
                </button>
              ))}
            </div>

            {/* Formula banner — only in formula mode */}
            {meritMode === "formula" && (
              <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-2.5 text-xs text-indigo-700">
                <span className="font-bold">Formula:</span> Academic (20) + Entry Test (50) + Interview (30) = Merit Score (100) — Min gates: test ≥40/100, interview ≥12/30, overall ≥50
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {meritMode === "formula" && (
                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Class</Label>
                  <Select value={classApplying} onValueChange={setClassApplying}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="All Classes" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Classes</SelectItem>
                      {classOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {meritMode === "formula" && (
                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Seats Available</Label>
                  <Input className="h-9" type="number" min={1} value={seats} onChange={e => setSeats(e.target.value)} />
                </div>
              )}
            </div>
            {meritMode === "all" && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs text-emerald-700">
                All applicants across every class will be enlisted and marked <strong>Qualified</strong> on commit — no scoring, no class filter.
              </div>
            )}

            {previewData && (
              <>
                {meritMode === "formula" ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Qualified",  value: previewData.admitted,                                                       color: "#10b981" },
                      { label: "Waitlisted", value: previewData.waitlisted,                                                     color: "#f59e0b" },
                      { label: "Rejected",   value: previewData.totalRanked - previewData.admitted - previewData.waitlisted,    color: "#ef4444" },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl border bg-white p-3 text-center shadow-sm">
                        <p className="text-xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
                        <p className="text-[11px] font-semibold text-slate-500">{s.label}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border bg-white p-3 text-center shadow-sm">
                    <p className="text-xl font-extrabold text-emerald-600">{previewData.totalRanked}</p>
                    <p className="text-[11px] font-semibold text-slate-500">Total Candidates</p>
                  </div>
                )}

                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b text-slate-500 font-semibold">
                        <th className="px-3 py-2 text-center w-10">#</th>
                        <th className="px-3 py-2 text-left">Candidate</th>
                        {meritMode === "formula" && (
                          <>
                            <th className="px-3 py-2 text-center">Acad<br/><span className="text-[10px] text-slate-400">/20</span></th>
                            <th className="px-3 py-2 text-center">Test<br/><span className="text-[10px] text-slate-400">/50</span></th>
                            <th className="px-3 py-2 text-center">Interview<br/><span className="text-[10px] text-slate-400">/30</span></th>
                            <th className="px-3 py-2 text-center font-extrabold">Merit<br/><span className="text-[10px] text-slate-400">/100</span></th>
                            <th className="px-3 py-2 text-center">Decision</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.candidates.map(c => (
                        <tr key={c.referenceId} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 text-center font-bold text-slate-500">{c.rank}</td>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-slate-800">{c.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{c.referenceId}</p>
                          </td>
                          {meritMode === "formula" && (
                            <>
                              <td className="px-3 py-2 text-center text-slate-600">{c.academicScore}</td>
                              <td className="px-3 py-2 text-center text-slate-600">{c.testScore}</td>
                              <td className="px-3 py-2 text-center text-slate-600">{c.interviewScore ?? "—"}</td>
                              <td className="px-3 py-2 text-center font-extrabold text-slate-800">{c.meritScore}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full", c.decision === "admitted" ? "bg-emerald-100 text-emerald-700" : c.decision === "waitlisted" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700")}>
                                  {c.decision === "admitted" ? "Qualified" : c.decision === "waitlisted" ? "Waitlisted" : "Rejected"}
                                </span>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400 text-center">Preview only — no changes applied. {meritMode === "formula" ? "Announce results so candidates can see their status, then Commit to finalise." : "Announce results to the portal, then Commit to mark all as Qualified."}</p>
              </>
            )}
          </div>
        )}

        {step !== "done" && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
            {step === "setup" && (
              <>
                <Button variant="outline" onClick={handlePreview} disabled={preview.isPending}>
                  {preview.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Preview
                </Button>
                <Button onClick={handleAnnounce} disabled={announce.isPending || !previewData} className="bg-emerald-600 hover:bg-emerald-700">
                  {announce.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Announce Results
                </Button>
              </>
            )}
            {step === "announced" && (
              <Button onClick={handleCommit} disabled={commit.isPending} className="bg-indigo-600 hover:bg-indigo-700">
                {commit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Commit Final Decisions
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Entry Test Tab ───────────────────────────────────────────────────────────

function EntryTestTab() {
  const { toast }   = useToast();
  const queryClient = useQueryClient();
  const { classOptions } = useClassOptions();
  const [classFilter, setClassFilter]           = useState("all");
  const [cityFilter, setCityFilter]             = useState("all");
  const [searchTerm, setSearchTerm]             = useState("");
  const [page, setPage]                         = useState(1);
  const [downloadingCards, setDownloadingCards] = useState(false);
  const [attendanceOpen, setAttendanceOpen]         = useState(false);
  const [attendanceCentreId, setAttendanceCentreId] = useState<string>("all");
  const [attendanceDate, setAttendanceDate]         = useState("");
  const [printingAttendance, setPrintingAttendance] = useState(false);
  const [savingMarkId, setSavingMarkId]             = useState<string | null>(null);
  const debouncedSearch = useDebounce(searchTerm, 400);
  const PAGE_SIZE = 50;

  async function saveTestMark(referenceId: string, marks: number) {
    setSavingMarkId(referenceId);
    try {
      const res = await fetch(`/api/admin/applications/${referenceId}/marks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ resultMarks: marks }),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Cannot record marks", description: data.error ?? "Test not yet scheduled.", variant: "destructive" });
        return;
      }
      if (!res.ok) throw new Error("Failed");
      invalidate();
      toast({ title: "Marks saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSavingMarkId(null);
    }
  }

  const { data: activeCentresET } = useListActiveTestCentres();

  const { data: adminTestCentres } = useListAdminTestCentres();
  const testCentreOptions = useMemo(() => {
    const filtered = (adminTestCentres ?? [])
      .filter((c) => c.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return [
      { value: "", label: "—" },
      ...filtered.map((c) => ({ value: c.name, label: c.name })),
    ];
  }, [adminTestCentres]);

  const { data: availableCities = [] } = useQuery<string[]>({
    queryKey: ["/api/admin/applications/cities"],
    queryFn: async () => {
      const res = await fetch("/api/admin/applications/cities", { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["/api/admin/applications"] }); }

  const inlineMutation = useUpdateAdminApplicationStatus({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Status updated" }); },
      onError:   () => { toast({ title: "Update failed", variant: "destructive" }); },
    },
  });

  const bulkMutation = useBulkUpdateAdminApplicationStatus({
    mutation: {
      onSuccess: (data) => { invalidate(); toast(summarizeBulkStatusResult(data as BulkStatusResult)); },
      onError:   () => { toast({ title: "Bulk update failed", variant: "destructive" }); },
    },
  });

  const bulkUpdateET = useBulkUpdateEntryTest();
  const [etFailedRefs, setEtFailedRefs] = useState<Set<string>>(new Set());

  const qp = { classApplying: classFilter !== "all" ? classFilter : undefined, city: cityFilter !== "all" ? cityFilter : undefined, q: debouncedSearch || undefined, page, pageSize: PAGE_SIZE };
  const qpSched = { status: "test_scheduled" as const, classApplying: classFilter !== "all" ? classFilter : undefined, page: 1, pageSize: 1 };
  const qpTaken = { status: "test_taken"     as const, classApplying: classFilter !== "all" ? classFilter : undefined, city: cityFilter !== "all" ? cityFilter : undefined, page: 1, pageSize: 1 };

  const { data: allData, isLoading } = useListAdminApplications(qp as Parameters<typeof useListAdminApplications>[0], { query: { queryKey: getListAdminApplicationsQueryKey(qp as Parameters<typeof getListAdminApplicationsQueryKey>[0]), placeholderData: keepPreviousData } });
  const { data: schedData } = useListAdminApplications(qpSched, { query: { queryKey: getListAdminApplicationsQueryKey(qpSched) } });
  const { data: takenData } = useListAdminApplications(qpTaken, { query: { queryKey: getListAdminApplicationsQueryKey(qpTaken) } });

  const items          = allData?.items ?? [];
  const totalItems     = allData?.total ?? 0;
  const totalScheduled = schedData?.total ?? 0;
  const totalTaken     = takenData?.total ?? 0;
  const rows = items.map(app => ({ ...app, id: app.referenceId }));

  const etGrid = useGridEdit(items);

  const ET_FIELDS = ["status", "testDate", "examCenter", "resultMarks"] as const;

  async function handleETSave() {
    const entries = items.filter(r => r.status !== "enrolled").flatMap(r => {
      const origDate  = (r as any).testDate ? String((r as any).testDate).slice(0, 10) : "";
      const origMarks = r.resultMarks != null ? String(r.resultMarks) : "";
      const origs: Record<string, string> = {
        status:      entryTestStatusValue(r.status ?? "") ?? (r.status ?? ""),
        testDate:    origDate,
        examCenter:  r.examCenter ?? "",
        resultMarks: origMarks,
      };
      const entry: any = { referenceId: r.referenceId };
      let dirty = false;
      for (const f of ET_FIELDS) {
        if (!etGrid.isCellDirty(r.referenceId, f, origs[f])) continue;
        const v = etGrid.getCellValue(r.referenceId, f, origs[f]);
        if (f === "resultMarks") {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n >= 0 && n <= 100) { entry.resultMarks = n; dirty = true; }
        } else if (f === "testDate") {
          entry.testDate = v || null; dirty = true;
        } else {
          entry[f] = v; dirty = true;
        }
      }
      return dirty ? [entry] : [];
    });
    if (entries.length === 0) { toast({ title: "No changes to save" }); return; }
    try {
      const result: any = await bulkUpdateET.mutateAsync({ data: { entries: entries as any } });
      const updatedCount = result.updated ?? 0;
      const failedCount  = result.failed  ?? 0;
      const failedIds: string[] = (result.results ?? [])
        .filter((r: any) => !r.success)
        .map((r: any) => r.referenceId as string);

      if (failedCount > 0) {
        setEtFailedRefs(new Set(failedIds));
        const preview = failedIds.slice(0, 5).join(", ");
        const extra   = failedIds.length > 5 ? ` +${failedIds.length - 5} more` : "";
        toast({
          variant: "destructive",
          title: `${updatedCount} updated, ${failedCount} failed`,
          description: `Failed: ${preview}${extra}`,
        });
      } else {
        setEtFailedRefs(new Set());
        toast({ title: `Saved — ${updatedCount} record${updatedCount !== 1 ? "s" : ""} updated` });
        etGrid.discardEdits();
      }
      invalidate();
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
  }

  async function handlePrintAdmitCards() {
    // Opened synchronously (before any await) to survive popup blockers.
    const printWin = openPrintWindow({
      onPopupBlocked: () => toast({ title: "Popup blocked", description: "Please allow popups for this site and try again.", variant: "destructive" }),
    });
    setDownloadingCards(true);
    try {
      const params = new URLSearchParams({ status: "test_scheduled" });
      if (classFilter !== "all") params.set("classApplying", classFilter);
      if (cityFilter !== "all") params.set("city", cityFilter);
      const res = await fetch(`/api/admin/admit-cards.pdf?${params}`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (!res.ok) { printWin.close(); toast({ title: "No admit cards", description: "No scheduled applicants found.", variant: "destructive" }); return; }
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        printWin.print(await res.text(), { autoPrint: false });
        toast({ title: "Admit cards ready", description: "Opened in a new tab — use Print to save as PDF." });
      } else {
        printWin.close();
        const url = URL.createObjectURL(await res.blob());
        Object.assign(document.createElement("a"), { href: url, download: `admit-cards-${new Date().toISOString().slice(0,10)}.pdf` }).click();
        URL.revokeObjectURL(url);
        toast({ title: "Admit cards downloaded" });
      }
    } catch {
      printWin.close();
      toast({ title: "Download failed", variant: "destructive" });
    }
    finally { setDownloadingCards(false); }
  }

  async function handlePrintAttendanceSheet() {
    setPrintingAttendance(true);
    try {
      const selectedCentre = (activeCentresET ?? []).find(c => c.id === attendanceCentreId);
      const params = new URLSearchParams({ status: "test_scheduled", pageSize: "1000", page: "1" });
      if (selectedCentre) params.set("examCenter", selectedCentre.name);

      const allRows: Array<{
        referenceId: string; fullName: string;
        fatherName: string | null; classApplying: string;
        guardianMobile: string | null; examCenter: string;
        feeStatus: string | null; photoFilename: string | null;
        testDate: string | null;
      }> = [];

      let page = 1;
      while (true) {
        params.set("page", String(page));
        const res = await fetch(`/api/admin/applications?${params}`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
        if (!res.ok) break;
        const data = await res.json() as { items: typeof allRows; total: number; pageSize: number };
        allRows.push(...data.items);
        if (allRows.length >= data.total) break;
        page++;
      }

      let filtered = allRows;
      if (attendanceDate) {
        const chosenDate = attendanceDate;
        filtered = allRows.filter(r => r.testDate && r.testDate.slice(0, 10) === chosenDate);
      }

      if (filtered.length === 0) {
        toast({ title: "No candidates found", description: "No scheduled candidates match the selected filters.", variant: "destructive" });
        return;
      }

      const settings = await fetchPrintSettings();
      const centreName = selectedCentre?.name ?? null;
      const dateLabel = attendanceDate ? new Date(attendanceDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : null;
      const filterLabel = [centreName && `Centre: ${centreName}`, dateLabel && `Test Date: ${dateLabel}`].filter(Boolean).join(" | ") || undefined;

      const html = buildAttendanceSheetHtml(filtered, settings, window.location.origin, filterLabel);

      const ok = printHtmlDocument(html, {
        onPopupBlocked: () => toast({ title: "Popup blocked", description: "Please allow pop-ups for this page.", variant: "destructive" }),
      });
      if (!ok) return;

      setAttendanceOpen(false);
      toast({ title: "Attendance sheet ready", description: `${filtered.length} candidate${filtered.length !== 1 ? "s" : ""} printed.` });
    } catch {
      toast({ title: "Print failed", variant: "destructive" });
    } finally {
      setPrintingAttendance(false);
    }
  }

  type ETRow = (typeof rows)[number];
  const etColumns: ColDef<ETRow>[] = [
    { key: "referenceId", label: "Applicant ID",       defaultVisible: true,  defaultWidth: 130, render: r => <span className="font-mono text-xs font-bold text-indigo-600">{r.referenceId}</span>,    getText: r => r.referenceId },
    { key: "name",        label: "Student Name",       defaultVisible: true,  defaultWidth: 200, render: r => <div><p className="font-semibold text-slate-800 text-[13px]">{r.fullName}</p><p className="text-[11px] text-slate-400">{r.fatherName ?? ""}</p></div>, getText: r => r.fullName ?? "" },
    { key: "city",        label: "City",               defaultVisible: true,  defaultWidth: 120, render: r => <span className="text-[12px] text-slate-600">{r.city ?? <span className="text-slate-300">—</span>}</span>, getText: r => r.city ?? "" },
    { key: "status",      label: "Entry Test Status",  defaultVisible: true,  defaultWidth: 210, render: r => r.status === "enrolled" ? <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700"><Lock className="h-3 w-3" />Enrolled</span> : <InlineStatusCell app={r} onMutate={(id, st) => inlineMutation.mutate({ referenceId: id, data: { status: st as never, force: true } as never })} isUpdating={inlineMutation.isPending && inlineMutation.variables?.referenceId === r.referenceId} allowedStatuses={ENTRY_TEST_STATUS_OPTIONS} placeholder="Schedule A Test" currentValue={entryTestStatusValue(r.status ?? "")} />, getText: r => statusLabel(r.status ?? "") },
    { key: "testDate",    label: "Test Date",           defaultVisible: true,  defaultWidth: 130, render: r => <span className="text-[12px] text-slate-600">{(r as any).testDate ? new Date((r as any).testDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : <span className="text-slate-300">—</span>}</span>, getText: r => (r as any).testDate ? new Date((r as any).testDate).toLocaleDateString("en-GB") : "" },
    { key: "examCenter",  label: "Exam Centre",         defaultVisible: true,  defaultWidth: 170, render: r => <div className="flex items-center gap-1.5 text-[12px] text-slate-600">{r.examCenter ? <><MapPin className="h-3 w-3 text-slate-400 shrink-0" />{r.examCenter}</> : <span className="text-slate-300">—</span>}</div>, getText: r => r.examCenter ?? "" },
    { key: "marks",       label: "Marks /100",          defaultVisible: true,  defaultWidth: 130, render: r => <InlineMarksCell referenceId={r.referenceId} value={r.resultMarks} max={100} savingId={savingMarkId} onSave={saveTestMark} disabled={r.status === "enrolled" || ET_BEFORE_TEST_TAKEN.includes(r.status ?? "")} disabledReason={r.status === "enrolled" ? "Applicant is enrolled — record is locked" : "Mark the test as Taken before entering marks"} />, getText: r => r.resultMarks != null ? String(r.resultMarks) : "" },
  ];

  return (
    <>
      <Dialog open={attendanceOpen} onOpenChange={setAttendanceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Print Attendance Sheet</DialogTitle>
            <DialogDescription>Filter candidates for the attendance sheet. Leave blank to include all scheduled candidates.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Exam Centre <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Select value={attendanceCentreId} onValueChange={setAttendanceCentreId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All Centres" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Centres</SelectItem>
                  {(activeCentresET ?? []).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Test Date <span className="text-slate-400 font-normal">(optional)</span></Label>
              <input
                type="date"
                value={attendanceDate}
                onChange={e => setAttendanceDate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {attendanceDate && <p className="text-[11px] text-slate-400">Only candidates with this test date will be included.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttendanceOpen(false)}>Cancel</Button>
            <Button onClick={handlePrintAttendanceSheet} disabled={printingAttendance} className="gap-1.5">
              {printingAttendance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {printingAttendance ? "Generating…" : "Print"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {etGrid.editMode ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <Edit2 className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="font-medium">Excel-style edit mode</span>
              <span className="text-amber-600 text-xs hidden sm:inline">— Yellow cells have unsaved changes. Tab/Shift+Tab, ↑↓ or Enter to navigate.</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={etGrid.discardEdits} disabled={bulkUpdateET.isPending}>
                <X className="h-3.5 w-3.5 mr-1" />Discard
              </Button>
              <Button size="sm" onClick={handleETSave} disabled={bulkUpdateET.isPending || !etGrid.hasChanges} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
                {bulkUpdateET.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save & Update
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wide">Ref ID</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wide">Name</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wide" style={{ minWidth: 140 }}>Status</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wide" style={{ minWidth: 120 }}>Test Date</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wide">Exam Centre</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-500 text-[10px] uppercase tracking-wide" style={{ minWidth: 90 }}>Marks /100</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-3 py-2"><Skeleton className="h-5 w-full rounded" /></td>
                        ))}
                      </tr>
                    ))
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">No applications to edit.</td>
                    </tr>
                  ) : items.map((r, rowIdx) => {
                    const origDate  = (r as any).testDate ? String((r as any).testDate).slice(0, 10) : "";
                    const origMarks = r.resultMarks != null ? String(r.resultMarks) : "";
                    const rowDirty  = Object.keys(etGrid.pending).some(k => k.startsWith(`${r.referenceId}::`));
                    const isEnrolled = r.status === "enrolled";
                    const statusDefault = entryTestStatusValue(r.status ?? "") ?? (r.status ?? "");
                    const pendingStatus = etGrid.getCellValue(r.referenceId, "status", statusDefault);
                    const statusDirty = etGrid.isCellDirty(r.referenceId, "status", statusDefault);
                    // Real status is already at/after test_taken, OR the admin has
                    // explicitly switched the dropdown to Test Taken in this session.
                    const realTestTaken = !ET_BEFORE_TEST_TAKEN.includes(r.status ?? "");
                    const marksEditable = !isEnrolled && (realTestTaken || (statusDirty && pendingStatus === "test_taken"));
                    return (
                      <tr key={r.referenceId} className={cn("hover:bg-slate-50/60 transition-colors", rowDirty && !isEnrolled && "bg-amber-50/30", etFailedRefs.has(r.referenceId) && "bg-red-50 outline outline-1 outline-red-200", isEnrolled && "opacity-60 bg-teal-50/20")}>
                        <td className="px-3 py-1.5 font-mono text-[11px] font-bold text-indigo-600 whitespace-nowrap">{r.referenceId}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <p className="font-semibold text-slate-800 text-[12px]">{r.fullName}</p>
                          <p className="text-[10px] text-slate-400">{r.fatherName ?? ""}</p>
                        </td>
                        <td className="px-2 py-1">
                          {isEnrolled
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-semibold text-teal-700"><Lock className="h-2.5 w-2.5" />Enrolled</span>
                            : <GridSelectCell
                                editMode
                                value={etGrid.getCellValue(r.referenceId, "status", entryTestStatusValue(r.status ?? "") ?? (r.status ?? ""))}
                                onChange={v => etGrid.setCellValue(r.referenceId, "status", v)}
                                dirty={etGrid.isCellDirty(r.referenceId, "status", entryTestStatusValue(r.status ?? "") ?? (r.status ?? ""))}
                                options={ENTRY_TEST_STATUS_OPTIONS}
                                onKeyDown={e => etGrid.handleCellKeyDown(e, rowIdx, 0, ET_FIELDS as unknown as string[], items.length)}
                                cellRef={el => etGrid.registerCellRef(r.referenceId, "status", el)}
                                cellId={`${r.referenceId}:status`}
                              />}
                        </td>
                        <td className="px-2 py-1">
                          <GridDateCell
                            editMode={!isEnrolled}
                            value={isEnrolled ? origDate : etGrid.getCellValue(r.referenceId, "testDate", origDate)}
                            onChange={v => etGrid.setCellValue(r.referenceId, "testDate", v)}
                            dirty={!isEnrolled && etGrid.isCellDirty(r.referenceId, "testDate", origDate)}
                            onKeyDown={e => etGrid.handleCellKeyDown(e, rowIdx, 1, ET_FIELDS as unknown as string[], items.length)}
                            cellRef={el => etGrid.registerCellRef(r.referenceId, "testDate", el)}
                            cellId={`${r.referenceId}:testDate`}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <GridSelectCell
                            editMode={!isEnrolled}
                            value={isEnrolled ? (r.examCenter ?? "") : etGrid.getCellValue(r.referenceId, "examCenter", r.examCenter ?? "")}
                            onChange={v => etGrid.setCellValue(r.referenceId, "examCenter", v)}
                            dirty={!isEnrolled && etGrid.isCellDirty(r.referenceId, "examCenter", r.examCenter ?? "")}
                            options={testCentreOptions}
                            onKeyDown={e => etGrid.handleCellKeyDown(e, rowIdx, 2, ET_FIELDS as unknown as string[], items.length)}
                            cellRef={el => etGrid.registerCellRef(r.referenceId, "examCenter", el)}
                            cellId={`${r.referenceId}:examCenter`}
                          />
                        </td>
                        <td className="px-2 py-1 text-center">
                          {isEnrolled
                            ? <span className="text-xs text-slate-400">{r.resultMarks ?? "—"}</span>
                            : !marksEditable
                            ? <span className="inline-flex items-center justify-center gap-1 text-slate-300" title="Mark the test as Taken before entering marks">
                                <Lock className="h-3 w-3" />
                                <span className="text-xs italic">{r.resultMarks ?? "—"}</span>
                              </span>
                            : <GridNumberCell
                                editMode
                                value={etGrid.getCellValue(r.referenceId, "resultMarks", origMarks)}
                                onChange={v => etGrid.setCellValue(r.referenceId, "resultMarks", v)}
                                dirty={etGrid.isCellDirty(r.referenceId, "resultMarks", origMarks)}
                                min={0}
                                max={100}
                                placeholder="—"
                                onKeyDown={e => etGrid.handleCellKeyDown(e, rowIdx, 3, ET_FIELDS as unknown as string[], items.length)}
                                cellRef={el => etGrid.registerCellRef(r.referenceId, "resultMarks", el)}
                                cellId={`${r.referenceId}:resultMarks`}
                              />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalItems > PAGE_SIZE && (
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
                Showing page {page} of {Math.ceil(totalItems / PAGE_SIZE)} — use normal view to navigate pages.
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
      {/* ── Stage summary bar ── */}
      {(totalTaken > 0 || totalScheduled > 0) && (
        <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs mb-1">
          <span className="text-slate-400 font-medium uppercase tracking-wide text-[10px]">Stage</span>
          <span className="h-3.5 w-px bg-slate-200" />
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-bold text-slate-700">{totalTaken}</span>
            <span className="text-slate-500">completed test</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-violet-400" />
            <span className="font-bold text-slate-700">{totalScheduled}</span>
            <span className="text-slate-500">scheduled (upcoming)</span>
          </span>
          {totalTaken > 0 && (
            <span className="ml-auto text-indigo-600 font-semibold">
              {totalTaken} candidate{totalTaken !== 1 ? "s" : ""} ready to advance →
            </span>
          )}
        </div>
      )}

      <DataTable
      tableId="ccm_entry_test_v3"
      title="Entry Test"
      subtitle={`${totalItems} applicant${totalItems !== 1 ? "s" : ""} in entry-test pipeline`}
      action={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { setEtFailedRefs(new Set()); etGrid.enterEditMode(); }} className="h-9 gap-1.5" disabled={items.length === 0}>
            <Edit2 className="h-3.5 w-3.5" />
            Edit
          </Button>
          <ScheduleSetupDialog onDone={() => invalidate()} />
          <Button size="sm" variant="outline" onClick={() => setAttendanceOpen(true)} disabled={totalScheduled === 0} className="h-9 gap-1.5">
            <Printer className="h-3.5 w-3.5" />
            Attendance Sheet
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrintAdmitCards} disabled={downloadingCards || totalScheduled === 0} className="h-9 gap-1.5">
            {downloadingCards ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
            Admit Cards ({totalScheduled})
          </Button>
          <SmartAdvanceToInterviewDialog classFilter={classFilter} cityFilter={cityFilter} onDone={() => invalidate()} />
        </div>
      }
      filters={
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(1); }} placeholder="Search name or register ID…" className="pl-8 h-9 text-sm w-64" />
          </div>
          <Select value={classFilter} onValueChange={v => { setClassFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="All Classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cityFilter} onValueChange={v => { setCityFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="All Cities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {availableCities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      }
      columns={etColumns}
      data={rows}
      total={totalItems}
      isLoading={isLoading}
      page={page}
      pageSize={PAGE_SIZE}
      onPageChange={setPage}
      exportFilename={`entry-test-${new Date().toISOString().slice(0,10)}`}
      printTitle="Entry Test — Applicants"
      bulkActions={(selectedIds, clearSelection) => (
        <>
          <ScheduleDialog referenceIds={selectedIds} applicants={rows} onDone={() => { invalidate(); clearSelection(); }} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={bulkMutation.isPending}>
                <Edit2 className="h-3 w-3" /> Set Status <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {ENTRY_TEST_STATUS_OPTIONS.map(opt => (
                <button key={opt.value} className="flex w-full items-center gap-2.5 px-2 py-1.5 text-sm rounded hover:bg-slate-50"
                  onClick={() => { bulkMutation.mutate({ data: { referenceIds: selectedIds, status: opt.value as never, force: true } as never }); clearSelection(); }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: opt.color }} />
                  <span className="text-[12.5px] font-semibold text-slate-700">{opt.label}</span>
                </button>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      rowActions={r => (
        <Link href={`/applications/${r.referenceId}`}>
          <button className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
            <Eye className="h-3.5 w-3.5" />
          </button>
        </Link>
      )}
      emptyIcon={<div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center"><CalendarClock className="h-7 w-7 text-slate-300" /></div>}
      emptyTitle="No applications found"
      emptyDescription="Applications will appear here once they reach the entry-test stage."
    />
        </>
      )}
    </>
  );
}

// ─── Merit List Tab ───────────────────────────────────────────────────────────

function MeritListTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { classOptions } = useClassOptions();
  const [classFilter, setClassFilter] = useState("all");
  const [totalSeats, setTotalSeats] = useState(50);

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["/api/admin/applications"] }); }

  // On mount, backfill any merit scores missing from the DB (fire-and-forget)
  useEffect(() => {
    fetch("/api/admin/applications/recalculate-merit", {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    })
      .then(() => invalidate())
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qp = { classApplying: classFilter !== "all" ? classFilter : undefined, page: 1, pageSize: 2000 };
  const { data, isLoading } = useListAdminApplications(qp as Parameters<typeof useListAdminApplications>[0], {
    query: { queryKey: getListAdminApplicationsQueryKey(qp as Parameters<typeof getListAdminApplicationsQueryKey>[0]), placeholderData: keepPreviousData },
  });

  const allItems = data?.items ?? [];

  const ranked = useMemo(() => {
    // Compute meritScore on-the-fly when the DB value is absent.
    // Weights match column headers: academic /20 + test /50 + interview /30 = 100.
    const withScore = allItems.map(app => {
      if (typeof (app as any).meritScore === "number") return app;
      const academic  = parseAcademic((app as any).previousMarks) ?? 0;
      const test      = typeof app.resultMarks === "number" ? Math.round((app.resultMarks / 100) * 50 * 10) / 10 : 0;
      const interview = typeof app.interviewMarks === "number" ? app.interviewMarks : 0;
      return { ...app, meritScore: Math.round((academic + test + interview) * 10) / 10 };
    });
    const sorted = [...withScore].sort((a, b) => {
      const am = typeof (a as any).meritScore === "number" ? (a as any).meritScore : -1;
      const bm = typeof (b as any).meritScore === "number" ? (b as any).meritScore : -1;
      return bm - am;
    });
    return sorted.map((app, i) => ({ ...app, meritPosition: i + 1 }));
  }, [allItems]);

  function parseAcademic(prev: string | null | undefined): number | null {
    if (!prev) return null;
    const pct = parseFloat(prev.replace("%", "").trim());
    return isNaN(pct) ? null : Math.round((pct / 100) * 20 * 10) / 10;
  }

  const { admitted, enrolledCount, waitlisted } = useMemo(() => {
    let admitted = 0, enrolledCount = 0, waitlisted = 0;
    for (const a of ranked) {
      if (a.status === "admitted") admitted++;
      else if (a.status === "enrolled") enrolledCount++;
      else if (a.status === "on_hold") waitlisted++;
    }
    return { admitted, enrolledCount, waitlisted };
  }, [ranked]);

  const meritRows = useMemo(() => ranked.map(app => ({ ...app, id: app.referenceId })), [ranked]);
  type MRow = (typeof meritRows)[number];

  const meritColumns: ColDef<MRow>[] = [
    { key: "rank",      label: "Merit #",     defaultVisible: true, defaultWidth: 80,  render: r => { const mc = (r as any).status === "admitted" ? "text-emerald-700 bg-emerald-50" : (r as any).status === "on_hold" ? "text-amber-700 bg-amber-50" : (r as any).status === "rejected" ? "text-red-700 bg-red-50" : "text-slate-700 bg-slate-50"; return <span className={cn("inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-extrabold", mc)}>{(r as any).meritPosition}</span>; }, getText: r => String((r as any).meritPosition ?? "") },
    { key: "applicant", label: "Applicant",   defaultVisible: true, defaultWidth: 210, render: r => <div><p className="font-semibold text-slate-800">{r.fullName}</p><p className="text-[11px] text-slate-400 font-mono">{r.referenceId}</p></div>, getText: r => r.fullName ?? "" },
    { key: "academic",  label: "Academic /20",defaultVisible: true, defaultWidth: 110, render: r => { const s = parseAcademic((r as any).previousMarks); return s !== null ? <span className="text-slate-700 text-sm">{s}</span> : <span className="text-slate-300">—</span>; }, getText: r => { const s = parseAcademic((r as any).previousMarks); return s !== null ? String(s) : ""; } },
    { key: "test",      label: "Entry Test /50",defaultVisible: true, defaultWidth: 120, render: r => { const s = typeof r.resultMarks === "number" ? Math.round((r.resultMarks / 100) * 50 * 10) / 10 : null; return s !== null ? <span className="text-slate-700 text-sm">{s}</span> : <span className="text-slate-300">—</span>; }, getText: r => typeof r.resultMarks === "number" ? String(Math.round((r.resultMarks / 100) * 50 * 10) / 10) : "" },
    { key: "interview", label: "Interview /30",defaultVisible: true, defaultWidth: 110, render: r => typeof r.interviewMarks === "number" ? <span className="text-slate-700 text-sm">{r.interviewMarks}</span> : <span className="text-slate-300">—</span>, getText: r => r.interviewMarks != null ? String(r.interviewMarks) : "" },
    { key: "merit",     label: "Merit Score",  defaultVisible: true, defaultWidth: 120, render: r => typeof (r as any).meritScore === "number" ? <span className="font-extrabold text-indigo-700">{(r as any).meritScore}</span> : <span className="text-slate-300">—</span>, getText: r => typeof (r as any).meritScore === "number" ? String((r as any).meritScore) : "" },
    { key: "payment",   label: "Payment",      defaultVisible: true, defaultWidth: 130,
      render: r => {
        const fs = (r as any).feeStatus as string | undefined;
        if (!fs || fs === "pending") return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Pending</span>;
        if (fs === "submitted")      return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Submitted</span>;
        if (fs === "verified")       return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Verified</span>;
        if (fs === "rejected")       return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-700">Rejected</span>;
        return <span className="text-slate-300 text-xs">{fs}</span>;
      },
      getText: r => (r as any).feeStatus ?? "",
    },
    { key: "status",    label: "Decision",     defaultVisible: true, defaultWidth: 190, render: r => r.status === "enrolled" ? <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700"><Lock className="h-3 w-3" />Enrolled</span> : <StatusBadge status={r.status} />, getText: r => statusLabel(r.status ?? "") },
  ];

  return (
    <DataTable
          tableId="ccm_merit_list_v2"
          title={`Merit List${classFilter !== "all" ? ` — ${classLabel(classFilter)}` : ""}`}
          subtitle={`${ranked.length} candidate${ranked.length !== 1 ? "s" : ""} · ${admitted} selected · ${enrolledCount} enrolled · ${waitlisted} on hold`}
          action={<MeritDialog onCommitted={invalidate} />}
          filters={
            <div className="flex gap-2 flex-wrap items-end">
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">Seats:</span>
                <Input type="number" className="h-9 w-20 text-sm" value={totalSeats} onChange={e => setTotalSeats(Number(e.target.value))} />
              </div>
            </div>
          }
          columns={meritColumns}
          data={meritRows}
          total={ranked.length}
          isLoading={isLoading}
          pageSize={50}
          clientPaginate
          exportFilename={`merit-list-${classFilter}-${new Date().toISOString().slice(0,10)}`}
          printTitle={`Merit List${classFilter !== "all" ? ` — ${classLabel(classFilter)}` : ""}`}
          rowActions={r => (
            <Link href={`/applications/${r.referenceId}`}>
              <button className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                <Eye className="h-3.5 w-3.5" />
              </button>
            </Link>
          )}
          emptyIcon={<div className="h-14 w-14 rounded-2xl bg-indigo-50 flex items-center justify-center"><Trophy className="h-7 w-7 text-indigo-200" /></div>}
          emptyTitle={classFilter === "all" ? "No applicants found" : `No results yet for ${classLabel(classFilter)}`}
          emptyDescription="No applications found. Import or add applicants first, then use Generate Merit List to commit decisions."
        />
  );
}

// ─── Enrollment Tab ───────────────────────────────────────────────────────────

const ENROLLMENT_STATUSES = ["admitted", "on_hold", "enrolled", "cancelled_by_student", "rejected_by_admission"];

const OUTCOME_PILLS = [
  { label: "All",                    value: "all" },
  { label: "Pending Decision",       value: "pending" },
  { label: "Enrolled",               value: "enrolled" },
  { label: "Cancelled by Student",   value: "cancelled_by_student" },
  { label: "Rejected by Admission",  value: "rejected_by_admission" },
];

function EnrollmentTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { classOptions } = useClassOptions();
  const [classFilter, setClassFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [downloadingCards, setDownloadingCards] = useState(false);
  const [notesApp, setNotesApp] = useState<any>(null);
  const [offerLetterTemplate, setOfferLetterTemplate] = useState<"offer-letter-applicant" | "offer-letter-student-ix-xi">("offer-letter-applicant");
  const [bulkEnrollOpen, setBulkEnrollOpen] = useState(false);
  const [bulkEnrollApps, setBulkEnrollApps] = useState<any[]>([]);
  const { data: enrollTabSections = [] } = useListAdminSections();
  const debouncedSearch = useDebounce(searchTerm, 400);

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["/api/admin/applications"] }); }

  const qpAll = { classApplying: classFilter !== "all" ? classFilter : undefined, q: debouncedSearch || undefined, page: 1, pageSize: 500, status: ENROLLMENT_STATUSES.join(",") } as any;
  const { data: allData, isLoading } = useListAdminApplications(qpAll, { query: { queryKey: getListAdminApplicationsQueryKey(qpAll), placeholderData: keepPreviousData } });

  const enrollmentItems = allData?.items ?? [];

  const { totalQualified, totalEnrolled, totalCancelled, totalRejected } = useMemo(() => {
    let totalQualified = 0, totalEnrolled = 0, totalCancelled = 0, totalRejected = 0;
    for (const a of enrollmentItems) {
      if (a.status === "admitted" || a.status === "on_hold") totalQualified++;
      else if (a.status === "enrolled") totalEnrolled++;
      else if (a.status === "cancelled_by_student") totalCancelled++;
      else if (a.status === "rejected_by_admission") totalRejected++;
    }
    return { totalQualified, totalEnrolled, totalCancelled, totalRejected };
  }, [enrollmentItems]);

  const filteredItems = useMemo(() => (
    outcomeFilter === "all"
      ? enrollmentItems
      : outcomeFilter === "pending"
        ? enrollmentItems.filter(a => a.status === "admitted" || a.status === "on_hold")
        : enrollmentItems.filter(a => a.status === outcomeFilter)
  ), [enrollmentItems, outcomeFilter]);

  async function handlePrintOfferLettersHtml(
    ids?: string[],
    batch?: { reportingDate?: string; hostelBlock?: string; feeAmount?: string },
  ) {
    // Opened synchronously (before any await) to survive popup blockers.
    const printWin = openPrintWindow({
      onPopupBlocked: () => toast({ title: "Popup blocked", description: "Please allow popups for this site and try again.", variant: "destructive" }),
    });
    setDownloadingCards(true);
    try {
      // Prefer the template assigned to the "Offer letter — applicants" purpose
      // in the Printing module; fall back to the selected built-in type.
      const templates = await loadTemplates();
      let tmplType: string = offerLetterTemplate;
      if (offerLetterTemplate === "offer-letter-applicant") {
        const purposeType = getTemplateTypeByPurpose("offer-letter-applicants");
        if (purposeType && templates[purposeType]?.content?.trim()) tmplType = purposeType;
      }
      let tmpl = templates[tmplType];
      if (!tmpl) {
        const tmplRes = await fetch(`/api/admin/print-templates/${offerLetterTemplate}`, {
          headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        });
        if (!tmplRes.ok) {
          printWin.close();
          toast({ title: "Template error", description: "Could not load the selected offer letter template.", variant: "destructive" });
          return;
        }
        tmpl = await tmplRes.json();
      }
      const templateHtml: string = tmpl?.content?.trim()
        ? tmpl.content
        : getDocType(offerLetterTemplate).defaultContent;

      const [tenantRes, sigRes] = await Promise.allSettled([
        fetch("/api/admin/tenant-name", { headers: { Authorization: `Bearer ${getToken() ?? ""}` } }),
        fetch("/api/admin/print-signatures", { headers: { Authorization: `Bearer ${getToken() ?? ""}` } }),
      ]);
      const schoolName: string = tenantRes.status === "fulfilled" && tenantRes.value.ok
        ? ((await tenantRes.value.json()) as { name: string }).name ?? "Cadet College Murree"
        : "Cadet College Murree";

      // Signature/stamp tags, mirroring the Printing module's convention:
      // {{sig_<name>}} / {{stamp_<name>}} per uploaded entry, plus generic
      // {{signature}} / {{stamp}} aliases (empty when none uploaded so the
      // tag disappears cleanly instead of printing literally).
      const sigTags: Record<string, string> = { signature: "", stamp: "" };
      if (sigRes.status === "fulfilled" && sigRes.value.ok) {
        try {
          const entries = (await sigRes.value.json()) as Array<{ name: string; label: string; type: string; url: string }>;
          for (const s of Array.isArray(entries) ? entries : []) {
            const isStamp = s.type === "stamp";
            const img = `<img src="${escapeHtml(s.url)}" style="max-height:${isStamp ? "70px" : "50px"};vertical-align:middle;display:inline-block;" alt="${escapeHtml(s.label)}" />`;
            sigTags[`${isStamp ? "stamp" : "sig"}_${s.name}`] = img;
            const alias = isStamp ? "stamp" : "signature";
            if (!sigTags[alias]) sigTags[alias] = img;
          }
        } catch { /* signatures optional — tags stay empty */ }
      }

      const qualified = ids && ids.length > 0
        ? enrollmentItems.filter(a => ids.includes(a.referenceId))
        : enrollmentItems.filter(
            a => (a.status === "admitted" || a.status === "on_hold") &&
                 (classFilter === "all" || a.classApplying === classFilter),
          );
      if (qualified.length === 0) {
        printWin.close();
        toast({ title: "No applicants to print", description: ids?.length ? "Selected rows not found." : "No qualified or on-hold applicants match the current filter.", variant: "destructive" });
        return;
      }

      const fmtDate = (d: string | null | undefined) => {
        if (!d) return "";
        const parsed = new Date(`${d}`.includes("T") ? d : `${d}T00:00:00`);
        return isNaN(parsed.getTime()) ? String(d) : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
      };
      const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
      const reportingDateStr = fmtDate(batch?.reportingDate);

      function fillTags(html: string, app: any): string {
        const name = app.fullName ?? "";
        const mobile = String(app.guardianMobile || app.studentMobile || "");
        const tags: Record<string, string> = {
          student_name:     name,
          name:             name,
          father_name:      app.fatherName ?? "",
          gr_number:        app.referenceId ?? "",
          applicant_id:     app.referenceId ?? "",
          roll_no:          app.rollNumber ?? "",
          roll_number:      app.rollNumber ?? "",
          serial_no:        app.rollNumber ?? "",
          class:            classLabel(app.classApplying ?? ""),
          session:          app.session ?? String(new Date().getFullYear()),
          section:          "",
          mobile_no:        mobile,
          phone:            mobile,
          email:            app.studentEmail ?? "",
          city:             app.city ?? "",
          present_address:  app.presentAddress ?? "",
          exam_date:        fmtDate(app.testDate),
          test_city:        app.examCenter ?? "",
          test_center_name: app.testVenue ?? app.examCenter ?? "",
          merit_score:      app.meritScore != null ? String(app.meritScore) : "",
          student_photo:    app.photoFilename
                              ? (() => {
                                  const raw = String(app.photoFilename);
                                  const relative = raw.startsWith("http") || raw.startsWith("/") ? raw : `/uploads/${raw}`;
                                  const photoUrl = relative.startsWith("http") ? relative : `${window.location.origin}${relative}`;
                                  return `<span style="display:inline-block;width:110px;height:140px;overflow:hidden;vertical-align:middle;line-height:0;"><img src="${escapeHtml(photoUrl)}" alt="Student" style="width:100%;height:100%;object-fit:cover;display:block;" /></span>`;
                                })()
                              : "",
          reporting_date:   reportingDateStr,
          hostel_block:     batch?.hostelBlock?.trim() ?? "",
          fee_amount:       batch?.feeAmount?.trim() ?? "",
          issue_date:       today,
          school_name:      schoolName,
          ...sigTags,
        };
        // Escape every merged value (applicant data is user-controlled) except
        // trusted raw-HTML tags (photo/signature <img> markup built above with
        // escaped URLs).
        const rawHtmlKey = (key: string) =>
          key === "student_photo" || key === "signature" || key === "stamp" ||
          key.startsWith("sig_") || key.startsWith("stamp_");
        const safe = (key: string): string => {
          const v = tags[key] ?? "";
          return rawHtmlKey(key) ? v : escapeHtml(v);
        };
        return html
          .replace(/\{\{(\w+)\}\}/g, (_m, key: string) => (key in tags ? safe(key) : ""))
          .replace(/\{\{[^}]+\}\}/g, "")
          // Hand-authored templates sometimes use single-brace tags ({name}).
          // Fill known tags only — never strip unknown single-brace text.
          .replace(/\{(\w+)\}/g, (m, key: string) => (key in tags ? safe(key) : m));
      }

      const printSettings: PrintSettings = {
        pageSize:          (tmpl?.pageSize    ?? "A4")       as "A4" | "A5" | "Letter",
        orientation:       (tmpl?.orientation ?? "portrait") as "portrait" | "landscape",
        marginTop:         Number(tmpl?.marginTop    ?? 20),
        marginRight:       Number(tmpl?.marginRight  ?? 15),
        marginBottom:      Number(tmpl?.marginBottom ?? 20),
        marginLeft:        Number(tmpl?.marginLeft   ?? 15),
        bgImageUrl:        (tmpl?.bgImageUrl as string | null) ?? null,
        instituteName:     "",
        showInstituteName: true,
      };

      const pages = qualified.map(app => fillTags(templateHtml, app));

      const fullHtml = buildPrintHtml(pages, printSettings, "");

      printWin.print(fullHtml);
      toast({ title: `${qualified.length} offer letter${qualified.length !== 1 ? "s" : ""} ready to print` });
    } catch {
      printWin.close();
      toast({ title: "Failed to generate offer letters", variant: "destructive" });
    } finally {
      setDownloadingCards(false);
    }
  }

  const enRows = useMemo(() => filteredItems.map(app => ({ ...app, id: app.referenceId })), [filteredItems]);
  type EnRow = (typeof enRows)[number];

  const enColumns: ColDef<EnRow>[] = [
    { key: "referenceId", label: "Applicant ID",  defaultVisible: true, defaultWidth: 130, render: r => <span className="font-mono text-xs font-bold text-indigo-600">{r.referenceId}</span>, getText: r => r.referenceId },
    { key: "name",        label: "Cadet Name",     defaultVisible: true, defaultWidth: 200, render: r => <p className="font-semibold text-slate-800 text-[13px]">{r.fullName}</p>, getText: r => r.fullName ?? "" },
    { key: "fatherName",  label: "Father's Name",  defaultVisible: true, defaultWidth: 180, render: r => <span className="text-slate-600 text-[12.5px]">{r.fatherName ?? "—"}</span>, getText: r => r.fatherName ?? "" },
    { key: "class",       label: "Class/Program",           defaultVisible: true, defaultWidth: 150, render: r => <span className="text-slate-600 text-[12.5px]">{classLabel(r.classApplying ?? "")}</span>, getText: r => classLabel(r.classApplying ?? "") },
    { key: "marks",       label: "Merit Marks",     defaultVisible: true, defaultWidth: 100, render: r => typeof r.resultMarks === "number" ? <span className="font-bold text-slate-800">{r.resultMarks}</span> : <span className="text-slate-300">—</span>, getText: r => r.resultMarks != null ? String(r.resultMarks) : "" },
    { key: "status",      label: "Outcome",         defaultVisible: true, defaultWidth: 190, render: r => <StatusBadge status={r.status ?? ""} />, getText: r => statusLabel(r.status ?? "") },
    {
      key: "admissionFee",
      label: "App. Fee",
      defaultVisible: true,
      defaultWidth: 110,
      render: r => {
        const s = (r as any).feeStatus as string | undefined;
        if (s === "paid") {
          return <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Paid</span>;
        }
        if (s === "rejected") {
          return <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">Rejected</span>;
        }
        if (s === "submitted") {
          return <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Submitted</span>;
        }
        return <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-slate-50 text-slate-400 border border-slate-200">Pending</span>;
      },
      getText: r => {
        const s = (r as any).feeStatus as string | undefined;
        if (s === "paid") return "Paid";
        if (s === "rejected") return "Rejected";
        if (s === "submitted") return "Submitted";
        return "Pending";
      },
    },
    {
      key: "notes",
      label: "Latest Note",
      defaultVisible: true,
      defaultWidth: 220,
      render: r => {
        const note = (r as any).latestEventDescription as string | null;
        return (
          <button
            onClick={() => setNotesApp(r)}
            className="flex items-center gap-1.5 text-left w-full group"
            title="View notes"
          >
            <MessageSquare className="h-3.5 w-3.5 text-slate-400 shrink-0 group-hover:text-indigo-500 transition-colors" />
            <span className="text-xs text-slate-500 truncate max-w-[170px] group-hover:text-slate-700 transition-colors">
              {note ? (note.length > 60 ? note.slice(0, 60) + "…" : note) : "—"}
            </span>
          </button>
        );
      },
      getText: r => (r as any).latestEventDescription ?? "",
    },
  ];

  return (
    <>
      <DataTable
        tableId="ccm_enrollment_v3"
        title="Enrollment"
        subtitle={`${totalQualified} qualified · ${totalEnrolled} enrolled · ${totalCancelled} cancelled · ${totalRejected} rejected`}
        action={
          <div className="flex items-center gap-1.5">
            <Select value={offerLetterTemplate} onValueChange={(v) => setOfferLetterTemplate(v as typeof offerLetterTemplate)}>
              <SelectTrigger className="h-9 w-44 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="offer-letter-applicant">VI-VIII</SelectItem>
                <SelectItem value="offer-letter-student-ix-xi">IX &amp; XI</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => handlePrintOfferLettersHtml(undefined, {})} disabled={downloadingCards || totalQualified === 0} className="h-9 gap-1.5">
              {downloadingCards ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
              Offer Letters ({totalQualified})
            </Button>
          </div>
        }
        filters={
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search name or Applicant ID…" className="pl-8 h-9 text-sm w-64" />
              </div>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="All Classes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {OUTCOME_PILLS.map(pill => (
                <button
                  key={pill.value}
                  onClick={() => setOutcomeFilter(pill.value)}
                  className={cn(
                    "h-7 px-3 rounded-full text-xs font-medium border transition-colors",
                    outcomeFilter === pill.value
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                  )}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        }
        columns={enColumns}
        data={enRows}
        total={filteredItems.length}
        isLoading={isLoading}
        pageSize={50}
        clientPaginate
        exportFilename={`enrollment-${new Date().toISOString().slice(0,10)}`}
        printTitle="Enrollment — Final Outcomes"
        rowActions={r => (
          <div className="flex items-center gap-1">
            {r.status === "enrolled" && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-semibold text-teal-700 mr-1"
                title={(r as any).applicantId ? `Register ID: ${(r as any).applicantId}` : "Student enrolled"}
              >
                <Lock className="h-2.5 w-2.5" />
                {(r as any).applicantId ?? "Enrolled"}
              </span>
            )}
            <Link href={`/applications/${r.referenceId}`}>
              <button className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="View">
                <Eye className="h-3.5 w-3.5" />
              </button>
            </Link>
            <button
              onClick={() => setNotesApp(r)}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              title="Notes"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
            <EnrollButton app={r} onDone={invalidate} />
            <PromoteFromWaitlistButton app={r} onDone={invalidate} />
            <CancelByStudentButton app={r} onDone={invalidate} />
            <RejectByAdmissionButton app={r} onDone={invalidate} />
          </div>
        )}
        bulkActions={(selectedIds) => {
          const admittedSelected = enrollmentItems.filter(
            a => a.status === "admitted" && selectedIds.includes(a.referenceId),
          );
          return (
            <div className="flex items-center gap-1.5">
              {admittedSelected.length > 0 && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 gap-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={() => {
                    setBulkEnrollApps(admittedSelected);
                    setBulkEnrollOpen(true);
                  }}
                >
                  <GraduationCap className="h-3 w-3" />
                  Bulk Enroll ({admittedSelected.length})
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => handlePrintOfferLettersHtml(selectedIds, {})} disabled={downloadingCards} className="h-7 gap-1.5 text-xs">
                {downloadingCards ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3 w-3" />}
                Offer Letters ({selectedIds.length})
              </Button>
            </div>
          );
        }}
        emptyIcon={<div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center"><GraduationCap className="h-7 w-7 text-emerald-200" /></div>}
        emptyTitle="No applicants found"
        emptyDescription="No applicants match the current filters."
      />
      {notesApp && (
        <NotesDrawer
          app={notesApp}
          open={!!notesApp}
          onClose={() => { setNotesApp(null); invalidate(); }}
        />
      )}
      <BulkEnrollDialog
        admittedApps={bulkEnrollApps}
        sections={(enrollTabSections as any[]).map((s: any) => ({ id: s.id, name: s.name }))}
        open={bulkEnrollOpen}
        onOpenChange={setBulkEnrollOpen}
        onDone={() => { setBulkEnrollOpen(false); invalidate(); }}
      />
    </>
  );
}

// ─── Applicant ID auto-generate helper ──────────────────────────────────────────

async function generateNextGr(): Promise<string> {
  try {
    let grFmt: { prefix: string; separator: string; includeYear: boolean; paddingDigits: string } = {
      prefix: "GR", separator: "-", includeYear: true, paddingDigits: "3",
    };
    try {
      // Fetch Applicant ID format from the API (persisted per-tenant, not localStorage)
      const fmtRes = await fetch("/api/admin/settings/gr-format", {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (fmtRes.ok) grFmt = { ...grFmt, ...await fmtRes.json() };
    } catch {}

    const prefix      = grFmt.prefix || "GR";
    const sep         = grFmt.separator || "-";
    const includeYear = grFmt.includeYear !== false;
    const padding     = grFmt.paddingDigits || "3";
    const year        = new Date().getFullYear();

    const qs = new URLSearchParams({ prefix, separator: sep, includeYear: String(includeYear), paddingDigits: padding });
    const res = await fetch(`/api/admin/students/next-gr?${qs}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    });
    if (!res.ok) return "";
    const data = await res.json();

    // Server returns a pre-verified nextApplicantId when format params are supplied
    if (data.nextApplicantId) return data.nextApplicantId;

    // Fallback: build from sequence (backward compat)
    const parts: string[] = [prefix];
    if (includeYear) parts.push(String(year));
    parts.push(String(data.nextSequence).padStart(parseInt(padding), "0"));
    return parts.join(sep);
  } catch {
    return "";
  }
}

// ─── Enroll Button ────────────────────────────────────────────────────────────

function EnrollButton({ app, onDone }: { app: any; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [applicantId, setGrNumber] = useState("");
  const [enrollmentDate, setEnrollmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [genLoading, setGenLoading] = useState(false);
  const [selectedClass, setSelectedClass] = useState(app.classApplying ?? "");
  const [selectedSection, setSelectedSection] = useState((app as any).sectionAllocSectionId ?? "");

  const { data: yearsData = [], isLoading: yearsLoading }    = useListAdminAcademicYears();
  const { data: classesData = [], isLoading: classesLoading }  = useListAdminClasses();
  const { data: sectionsData = [], isLoading: sectionsLoading } = useListAdminSections();
  const { data: housesData = [], isLoading: housesLoading }   = useListAdminHouses();
  const setupLoading = yearsLoading || classesLoading || sectionsLoading || housesLoading;
  const missingSetup = useMemo(() => {
    if (setupLoading) return [];
    const m: string[] = [];
    if (!(yearsData as any[]).length)    m.push("Academic Year");
    if (!(classesData as any[]).length)  m.push("Class/Program");
    if (!(sectionsData as any[]).some((s: any) => s.active)) m.push("Section");
    if (!(housesData as any[]).length)   m.push("House");
    return m;
  }, [setupLoading, yearsData, classesData, sectionsData, housesData]);

  const mutation = useEnrollAdminApplication({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Cadet enrolled", description: `${app.firstName} ${app.lastName} enrolled with GR ${data.applicantId}.` });
        setOpen(false);
        setGrNumber("");
        setEnrollmentDate(new Date().toISOString().slice(0, 10));
        setSelectedClass(app.classApplying ?? "");
        setSelectedSection((app as any).sectionAllocSectionId ?? "");
        onDone();
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "Could not enroll cadet.";
        if (msg.includes("already in use")) {
          generateNextGr().then((gr) => { if (gr) setGrNumber(gr); });
          toast({ title: "Applicant ID taken", description: "That Applicant ID was already in use — updated to the next available number. Review and click Enroll again.", variant: "destructive" });
        } else {
          toast({ title: "Enrollment failed", description: msg, variant: "destructive" });
        }
      },
    },
  });

  // Auto-fill the Applicant ID field as soon as the dialog opens so the user never has
  // to click the "Auto" button manually.
  useEffect(() => {
    if (!open) return;
    setGenLoading(true);
    generateNextGr().then((gr) => {
      if (gr) setGrNumber(gr);
      setGenLoading(false);
    });
  }, [open]);

  if (app.status !== "admitted") return null;

  function handleEnroll() {
    if (missingSetup.length) {
      toast({ title: "Academic setup incomplete", description: `Configure ${missingSetup.join(", ")} before enrolling.`, variant: "destructive" });
      return;
    }
    const gr = applicantId.trim();
    if (!gr) { toast({ title: "Register ID is required", variant: "destructive" }); return; }
    if (!selectedClass) { toast({ title: "Class/Program is required", description: "Select a class to enroll the cadet into.", variant: "destructive" }); return; }
    mutation.mutate({ referenceId: app.referenceId, data: { applicantId: gr, enrollmentDate: enrollmentDate || undefined, classCode: selectedClass, sectionId: selectedSection || undefined } });
  }

  const feeWarning = app.admissionFeeStatus !== "paid";

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setGrNumber(""); setEnrollmentDate(new Date().toISOString().slice(0, 10)); setSelectedClass(app.classApplying ?? ""); setSelectedSection((app as any).sectionAllocSectionId ?? ""); } }}>
      <button
        className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
        title="Enroll as student"
        onClick={() => { setEnrollmentDate(new Date().toISOString().slice(0, 10)); setSelectedClass(app.classApplying ?? ""); setSelectedSection((app as any).sectionAllocSectionId ?? ""); setOpen(true); }}
      >
        <GraduationCap className="h-3.5 w-3.5" />
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enroll Cadet</DialogTitle>
          <DialogDescription>
            Create a student record for <strong>{app.fullName}</strong>.
            All personal details will be copied from the application automatically.
          </DialogDescription>
        </DialogHeader>
        {missingSetup.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Academic setup is incomplete. Configure <strong>{missingSetup.join(", ")}</strong> before enrolling students.</span>
          </div>
        )}
        {feeWarning && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Application fee has not been confirmed yet. You can still enroll, but verify payment first.</span>
          </div>
        )}
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-4 items-center gap-3">
            <Label className="text-right text-sm">Register ID <span className="text-red-500">*</span></Label>
            <div className="col-span-3 flex gap-2">
              <Input
                className="flex-1"
                placeholder="e.g. GR-2026-001"
                value={applicantId}
                onChange={e => setGrNumber(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleEnroll()}
              />
              <Button
                type="button" variant="outline" size="sm" className="shrink-0 gap-1.5 px-3"
                disabled={genLoading}
                title="Auto-generate next Applicant ID from ID Format settings"
                onClick={async () => {
                  setGenLoading(true);
                  const gr = await generateNextGr();
                  if (gr) setGrNumber(gr);
                  setGenLoading(false);
                }}
              >
                {genLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Auto
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-3">
            <Label className="text-right text-sm">Class <span className="text-red-500">*</span></Label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select class…" />
              </SelectTrigger>
              <SelectContent>
                {(classesData as any[]).filter((c: any) => c.active).map((c: any) => (
                  <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-3">
            <Label className="text-right text-sm">Section</Label>
            <Select
              value={selectedSection || "__none__"}
              onValueChange={(v) => setSelectedSection(v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="No section (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No section</SelectItem>
                {(sectionsData as any[]).filter((s: any) => s.active).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-3">
            <Label className="text-right text-sm">Enrollment Date</Label>
            <Input
              type="date"
              className="col-span-3"
              value={enrollmentDate}
              onChange={e => setEnrollmentDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={handleEnroll} disabled={mutation.isPending || !applicantId.trim() || !selectedClass || missingSetup.length > 0}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GraduationCap className="mr-2 h-4 w-4" />}
            Enroll Cadet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Applicant ID helper ──────────────────────────────────────────────────────

async function generateBulkGrNumbers(count: number): Promise<{ applicantIds: string[]; error?: string }> {
  try {
    let grFmt: { prefix: string; separator: string; includeYear: boolean; paddingDigits: string } = {
      prefix: "GR", separator: "-", includeYear: true, paddingDigits: "3",
    };
    const tenantHeaders = {
      Authorization: `Bearer ${getToken() ?? ""}`,
      "X-Tenant-Id": localStorage.getItem("ccm_admin_website_tenant") || "ccm",
    };
    try {
      // Fetch Applicant ID format from the API (persisted per-tenant, not localStorage)
      const fmtRes = await fetch("/api/admin/settings/gr-format", {
        headers: tenantHeaders,
      });
      if (fmtRes.ok) grFmt = { ...grFmt, ...await fmtRes.json() };
    } catch {}
    const prefix      = grFmt.prefix || "GR";
    const sep         = grFmt.separator || "-";
    const includeYear = grFmt.includeYear !== false;
    const padding     = grFmt.paddingDigits || "3";

    // Pass count to get server-verified Applicant IDs for all items at once.
    const qs = new URLSearchParams({
      prefix, separator: sep, includeYear: String(includeYear),
      paddingDigits: padding, count: String(count),
    });
    const res = await fetch(`/api/admin/students/next-gr?${qs}`, {
      headers: tenantHeaders,
    });
    if (!res.ok) {
      let message = `Failed to generate Applicant IDs (HTTP ${res.status}).`;
      try {
        const errBody = await res.json();
        if (errBody?.error) message = errBody.error;
      } catch {}
      return { applicantIds: Array(count).fill(""), error: message };
    }
    const data = await res.json();

    // Server returns a verified array when count param is used.
    if (Array.isArray(data.applicantIds) && data.applicantIds.length === count) {
      return { applicantIds: data.applicantIds };
    }
    // Fallback: single GR (count=1 path)
    if (data.nextApplicantId) return { applicantIds: [data.nextApplicantId] };
    return { applicantIds: Array(count).fill(""), error: "Server did not return the expected Applicant IDs." };
  } catch (err: any) {
    return { applicantIds: Array(count).fill(""), error: err?.message ?? "Failed to generate Applicant IDs." };
  }
}

// ─── Bulk Enroll Dialog ───────────────────────────────────────────────────────

function BulkEnrollDialog({
  admittedApps,
  sections,
  onDone,
  open,
  onOpenChange,
}: {
  admittedApps: any[];
  sections: { id: string; name: string }[];
  onDone: () => void;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [enrollmentDate, setEnrollmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [applicantIds, setGrNumbers] = useState<string[]>([]);
  const [loadingGr, setLoadingGr] = useState(false);
  const [grError, setGrError] = useState<string | null>(null);
  type ResultItem = { referenceId: string; success: boolean; applicantId?: string; error?: string };
  const [results, setResults] = useState<ResultItem[] | null>(null);

  const mutation = useBulkEnrollAdminApplications({
    mutation: {
      onSuccess: (data) => {
        setResults(data.results as ResultItem[]);
        toast({
          title: `Bulk enrollment complete`,
          description: `${data.enrolled} enrolled, ${data.failed} failed.`,
          variant: data.failed > 0 ? "destructive" : "default",
        });
      },
      onError: (err: any) => {
        toast({
          title: "Bulk enrollment failed",
          description: err?.response?.data?.error ?? "Could not enroll cadets.",
          variant: "destructive",
        });
      },
    },
  });

  useEffect(() => {
    if (!open) return;
    setResults(null);
    setGrError(null);
    setEnrollmentDate(new Date().toISOString().slice(0, 10));
    if (admittedApps.length === 0) return;
    setLoadingGr(true);
    generateBulkGrNumbers(admittedApps.length).then(({ applicantIds, error }) => {
      setGrNumbers(applicantIds);
      setGrError(error ?? null);
      setLoadingGr(false);
      if (error) {
        toast({
          title: "Could not generate Applicant IDs",
          description: error,
          variant: "destructive",
        });
      }
    });
  }, [open, admittedApps.length]);

  function handleConfirm() {
    if (loadingGr || grError) return;
    const items = admittedApps.map((app, i) => ({
      referenceId: app.referenceId,
      applicantId: applicantIds[i] ?? "",
      enrollmentDate: enrollmentDate || undefined,
    }));
    mutation.mutate({ data: { items } });
  }

  function handleClose() {
    if (results !== null) {
      onDone();
    }
    onOpenChange(false);
    setResults(null);
    setGrNumbers([]);
    setGrError(null);
  }

  const nameFor = (app: any) => app.fullName ?? "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-teal-600" />
            Bulk Enroll Cadets
          </DialogTitle>
          <DialogDescription>
            {results === null
              ? `Enrolling ${admittedApps.length} qualified cadet${admittedApps.length !== 1 ? "s" : ""}. Applicant IDs are auto-assigned sequentially.`
              : "Enrollment complete. Review the results below."}
          </DialogDescription>
        </DialogHeader>

        {results === null ? (
          <>
            {/* Shared enrollment date */}
            <div className="flex items-center gap-3 py-1">
              <Label className="text-sm shrink-0">Enrollment Date</Label>
              <Input
                type="date"
                className="w-44 h-8 text-sm"
                value={enrollmentDate}
                onChange={(e) => setEnrollmentDate(e.target.value)}
              />
            </div>

            {/* Student list */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left">Cadet Name</th>
                    <th className="px-3 py-2 text-left">Class</th>
                    <th className="px-3 py-2 text-left">Section</th>
                    <th className="px-3 py-2 text-left">Register ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {admittedApps.map((app, i) => {
                    const sectionName = app.sectionAllocSectionId
                      ? (sections.find(s => s.id === app.sectionAllocSectionId)?.name ?? "—")
                      : "—";
                    return (
                    <tr key={app.referenceId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-2 font-medium text-slate-800">{nameFor(app)}</td>
                      <td className="px-3 py-2 text-slate-600">{classLabel(app.classApplying ?? "")}</td>
                      <td className="px-3 py-2 text-slate-600">{sectionName}</td>
                      <td className="px-3 py-2">
                        {loadingGr ? (
                          <span className="flex items-center gap-1 text-slate-400 text-xs">
                            <Loader2 className="h-3 w-3 animate-spin" /> generating…
                          </span>
                        ) : (
                          <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                            {applicantIds[i] ?? "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>

            {grError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {grError}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={mutation.isPending || loadingGr || !!grError || admittedApps.length === 0}
                className="gap-1.5"
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GraduationCap className="h-4 w-4" />
                )}
                Enroll {admittedApps.length} Cadet{admittedApps.length !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Results summary */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left">Cadet Name</th>
                    <th className="px-3 py-2 text-left">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((r) => {
                    const app = admittedApps.find((a) => a.referenceId === r.referenceId);
                    return (
                      <tr key={r.referenceId} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {app ? nameFor(app) : r.referenceId}
                        </td>
                        <td className="px-3 py-2">
                          {r.success ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                              <CheckCircle2 className="h-3 w-3" />
                              Enrolled · {r.applicantId}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-0.5" title={r.error}>
                              <XCircle className="h-3 w-3" />
                              {r.error && r.error.length > 55 ? r.error.slice(0, 55) + "…" : (r.error ?? "Failed")}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <DialogFooter>
              <Button onClick={handleClose} className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Promote from Waitlist Button ─────────────────────────────────────────────

function PromoteFromWaitlistButton({ app, onDone }: { app: any; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const mutation = useUpdateAdminApplicationStatus({
    mutation: {
      onSuccess: () => {
        toast({ title: "Promoted to qualified", description: `${app.fullName} moved from waitlist to qualified.` });
        setOpen(false);
        onDone();
      },
      onError: (err: any) => {
        toast({ title: "Promotion failed", description: err?.response?.data?.error ?? "Could not promote applicant.", variant: "destructive" });
      },
    },
  });

  if (app.status !== "on_hold") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
        title="Promote from waitlist to qualified"
        onClick={() => setOpen(true)}
      >
        <ArrowUpCircle className="h-3.5 w-3.5" />
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote from Waitlist</DialogTitle>
          <DialogDescription>
            Move <strong>{app.fullName}</strong> from the waitlist to <strong>Qualified</strong>.
            They will then be eligible for enrollment.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate({ referenceId: app.referenceId, data: { status: "admitted" as never } })}
            disabled={mutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpCircle className="mr-2 h-4 w-4" />}
            Confirm Promotion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cancel by Student Button ─────────────────────────────────────────────────

function CancelByStudentButton({ app, onDone }: { app: any; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const mutation = useUpdateAdminApplicationStatus({
    mutation: {
      onSuccess: () => {
        toast({ title: "Marked as cancelled", description: `${app.fullName} — Cancelled by Student.` });
        setOpen(false);
        setReason("");
        onDone();
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Could not update status.";
        toast({ title: "Action failed", description: msg, variant: "destructive" });
      },
    },
  });

  if (!["admitted", "on_hold"].includes(app.status ?? "")) return null;

  function handleSubmit() {
    if (!reason.trim()) { toast({ title: "Reason is required", variant: "destructive" }); return; }
    mutation.mutate({ referenceId: app.referenceId, data: { status: "cancelled_by_student" as never, note: reason.trim() } });
  }

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setReason(""); }}>
      <button
        onClick={() => setOpen(true)}
        className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
        title="Cancelled by Student"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelled by Student</DialogTitle>
          <DialogDescription>
            Record that <strong>{app.fullName}</strong> has voluntarily cancelled their admission. A reason is required.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label>Reason <span className="text-red-500">*</span></Label>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Admitted to another institution, family decision…"
            className="min-h-[80px] text-sm"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending || !reason.trim()}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {mutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <X className="mr-2 h-3.5 w-3.5" />}
            Confirm Cancellation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reject by Admission Office Button ────────────────────────────────────────

function RejectByAdmissionButton({ app, onDone }: { app: any; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const mutation = useUpdateAdminApplicationStatus({
    mutation: {
      onSuccess: () => {
        toast({ title: "Marked as rejected", description: `${app.fullName} — Rejected by Admission.` });
        setOpen(false);
        setReason("");
        onDone();
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Could not update status.";
        toast({ title: "Action failed", description: msg, variant: "destructive" });
      },
    },
  });

  if (!["admitted", "on_hold"].includes(app.status ?? "")) return null;

  function handleSubmit() {
    if (!reason.trim()) { toast({ title: "Reason is required", variant: "destructive" }); return; }
    mutation.mutate({ referenceId: app.referenceId, data: { status: "rejected_by_admission" as never, note: reason.trim() } });
  }

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setReason(""); }}>
      <button
        onClick={() => setOpen(true)}
        className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        title="Rejected by Admission"
      >
        <Ban className="h-3.5 w-3.5" />
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejected by Admission</DialogTitle>
          <DialogDescription>
            Record that <strong>{app.fullName}</strong> has been rejected by the Admission Office. A reason is required.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label>Reason <span className="text-red-500">*</span></Label>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Failed medical examination, incomplete documents…"
            className="min-h-[80px] text-sm"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending || !reason.trim()}
            variant="destructive"
          >
            {mutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Ban className="mr-2 h-3.5 w-3.5" />}
            Confirm Rejection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Notes Drawer ─────────────────────────────────────────────────────────────

function NotesDrawer({ app, open, onClose }: { app: any; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: events, isLoading, refetch } = useQuery<any[]>({
    queryKey: [`/api/admin/applications/${app.referenceId}/events`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/applications/${app.referenceId}/events`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed to load events");
      return res.json();
    },
    enabled: open,
  });

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/applications/${app.referenceId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ description: newNote.trim() }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Note added" });
      setNewNote("");
      refetch();
    } catch {
      toast({ title: "Failed to add note", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg flex flex-col" style={{ maxHeight: "85vh" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-indigo-500" />
            Notes — {app.fullName}
          </DialogTitle>
          <DialogDescription>Application {app.referenceId} · timeline and admin notes</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-2 min-h-0" style={{ maxHeight: "calc(85vh - 280px)" }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-400 text-sm">Loading…</div>
          ) : !events?.length ? (
            <div className="flex items-center justify-center py-8 text-slate-400 text-sm">No events yet</div>
          ) : events.map((ev: any) => (
            <div key={ev.id} className="border-b border-slate-100 pb-2.5 last:border-0">
              <div className="flex items-start justify-between gap-2 mb-0.5">
                <span className="text-[12.5px] font-medium text-slate-700">{ev.title}</span>
                <span className="text-[11px] text-slate-400 shrink-0">
                  {new Date(ev.occurredAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
              {ev.description && (
                <p className="text-[12px] text-slate-500 leading-relaxed">{ev.description}</p>
              )}
            </div>
          ))}
        </div>

        <div className="border-t pt-3 space-y-2">
          <Label className="text-xs text-slate-500">Add a note</Label>
          <Textarea
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Free-text note visible to all admins…"
            className="text-sm min-h-[72px] resize-none"
          />
          <Button
            onClick={handleAddNote}
            disabled={saving || !newNote.trim()}
            size="sm"
            className="w-full"
          >
            {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
            Add Note
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Interview Schedule Dialog ────────────────────────────────────────────────

// ─── Smart Advance to Interview Dialog ────────────────────────────────────────

function SmartAdvanceToInterviewDialog({
  classFilter,
  cityFilter,
  onDone,
}: {
  classFilter: string;
  cityFilter: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen]       = useState(false);
  const [date, setDate]       = useState("");
  const [venue, setVenue]     = useState("");
  const [venueId, setVenueId] = useState("");
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<{ scored: any[]; noScore: any[] } | null>(null);

  const { data: allVenues } = useListAdminTestCentres();
  const interviewVenues = useMemo(() => (allVenues ?? []).filter((v: any) => v.active), [allVenues]);

  const mutation = useBulkScheduleAdminApplicationInterview({
    mutation: {
      onSuccess: (r: any) => {
        const skipped = (r.skipped ?? []).length;
        const venueName =
          interviewVenues.length > 0
            ? interviewVenues.find((v: any) => v.id === venueId)?.name
            : venue.trim();
        toast({
          title: `${r.updated} candidate${r.updated !== 1 ? "s" : ""} advanced to Interview`,
          description: [venueName && `Venue: ${venueName}`, skipped > 0 && `${skipped} skipped`].filter(Boolean).join(" · ") || undefined,
        });
        setOpen(false);
        onDone();
      },
      onError: () => toast({ title: "Failed to schedule interviews", variant: "destructive" }),
    },
  });

  async function handleOpen() {
    setLoading(true);
    setDate(""); setVenue(""); setVenueId("");
    try {
      const params = new URLSearchParams({ status: "test_taken", page: "1", pageSize: "1000" });
      if (classFilter !== "all") params.set("classApplying", classFilter);
      if (cityFilter !== "all") params.set("city", cityFilter);
      const res = await fetch(`/api/admin/applications?${params}`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const loaded: any[] = data.items ?? [];
      setCandidates({
        scored:  loaded.filter(a => typeof a.resultMarks === "number"),
        noScore: loaded.filter(a => typeof a.resultMarks !== "number"),
      });
      setOpen(true);
    } catch {
      toast({ title: "Failed to load candidates", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function handleConfirm() {
    if (!candidates || candidates.scored.length === 0 || !date) return;
    mutation.mutate({
      data: {
        referenceIds: candidates.scored.map((a: any) => a.referenceId),
        interviewDate: new Date(date).toISOString(),
        venue: interviewVenues.length === 0 ? (venue.trim() || undefined) : undefined,
        venueId: interviewVenues.length > 0 && venueId && venueId !== "__none" ? venueId : undefined,
      },
    });
  }

  const scoredCount  = candidates?.scored.length  ?? 0;
  const noScoreCount = candidates?.noScore.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
        onClick={handleOpen}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Advance to Interview
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Advance to Interview</DialogTitle>
          <DialogDescription>
            Move candidates who have taken the entry test into the interview stage.
          </DialogDescription>
        </DialogHeader>

        {candidates && (
          <div className="flex flex-col gap-4 py-1">
            {/* Breakdown tiles */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-3 text-center">
                <p className="text-3xl font-extrabold text-emerald-700">{scoredCount}</p>
                <p className="text-xs text-emerald-600 mt-1 font-medium">have scores → will advance</p>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-3 text-center">
                <p className="text-3xl font-extrabold text-slate-400">{noScoreCount}</p>
                <p className="text-xs text-slate-500 mt-1">no score → will be skipped</p>
              </div>
            </div>

            {scoredCount === 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                No candidates with scores found. Enter entry test marks first in the Marks Entry tab.
              </div>
            )}

            {scoredCount > 0 && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Interview Date <span className="text-destructive">*</span>
                  </Label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Venue <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  {interviewVenues.length === 0 ? (
                    <Input placeholder="e.g. Main Hall" value={venue} onChange={e => setVenue(e.target.value)} className="h-9" />
                  ) : (
                    <Select value={venueId} onValueChange={setVenueId}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select a venue" /></SelectTrigger>
                      <SelectContent>
                        {interviewVenues.map((v: any) => (
                          <SelectItem key={v.id} value={v.id}>{v.name}{v.city ? ` — ${v.city}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </>
            )}

            {noScoreCount > 0 && (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-600">{noScoreCount} skipped — no score entered</p>
                </div>
                <div className="max-h-24 overflow-y-auto px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {candidates.noScore.map((a: any) => (
                      <span key={a.referenceId} className="inline-block rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                        {a.referenceId}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={handleConfirm}
            disabled={mutation.isPending || scoredCount === 0 || !date}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Advance {scoredCount} to Interview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function InterviewScheduleDialog({ referenceIds, items, onDone }: {
  referenceIds: string[];
  items: { referenceId: string; status?: string | null }[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen]         = useState(false);
  const [date, setDate]         = useState("");
  const [venue, setVenue]       = useState("");
  const [venueId, setVenueId]   = useState("");

  const { data: allVenues } = useListAdminTestCentres();
  const interviewVenues = useMemo(() => (allVenues ?? []).filter(v => v.active), [allVenues]);

  // Identify selected apps that can't be scheduled (status ≠ test_taken)
  const refSet = new Set(referenceIds);
  const selectedItems = items.filter(a => refSet.has(a.referenceId));
  const nonEligible   = selectedItems.filter(a => a.status !== "test_taken");

  const mutation = useBulkScheduleAdminApplicationInterview({
    mutation: {
      onSuccess: (r: any) => {
        const skippedCount = (r.skipped ?? []).length;
        const venueName = interviewVenues.length > 0
          ? interviewVenues.find(v => v.id === venueId)?.name
          : venue.trim();
        toast({
          title: "Interview scheduled",
          description: `${r.updated} applicant${r.updated !== 1 ? "s" : ""} scheduled${venueName ? ` at ${venueName}` : ""}${skippedCount > 0 ? ` · ${skippedCount} skipped (entry test not yet marked)` : ""}.`,
        });
        setOpen(false);
        setDate(""); setVenue(""); setVenueId("");
        onDone();
      },
      onError: () => toast({ title: "Schedule failed", variant: "destructive" }),
    },
  });

  function handleOpen() {
    setDate(""); setVenue("");
    const refSet = new Set(referenceIds);
    const sel = items.filter(a => refSet.has(a.referenceId));
    const ids = sel.map(a => (a as any).interviewVenueId).filter(Boolean);
    const unique = [...new Set(ids)];
    setVenueId(unique.length === 1 && interviewVenues.length > 0 ? (unique[0] as string) : "");
    setOpen(true);
  }

  function handleConfirm() {
    if (!date) return;
    mutation.mutate({
      data: {
        referenceIds,
        interviewDate: new Date(date).toISOString(),
        venue: interviewVenues.length === 0 ? (venue.trim() || undefined) : undefined,
        venueId: interviewVenues.length > 0 && venueId && venueId !== "__none" ? venueId : undefined,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7 border-cyan-200 text-cyan-700 hover:bg-cyan-100" onClick={handleOpen} data-testid="button-schedule-interview">
        <CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Schedule Interview
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Interview</DialogTitle>
          <DialogDescription>
            Assign an interview date and venue to{" "}
            <strong>{referenceIds.length} selected applicant{referenceIds.length !== 1 ? "s" : ""}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          {/* Eligibility summary */}
          <div className="flex items-center justify-between rounded-lg bg-muted/40 border border-border px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">Will be scheduled</span>
            <span className="font-semibold text-cyan-700">{referenceIds.length - nonEligible.length} applicant{referenceIds.length - nonEligible.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Skipped warning — compact with scrollable list */}
          {nonEligible.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-200 bg-amber-100/60">
                <span className="text-amber-600 text-sm">⚠</span>
                <p className="text-xs font-semibold text-amber-800">
                  {nonEligible.length} will be skipped — entry test not yet completed
                </p>
              </div>
              <div className="max-h-28 overflow-y-auto px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {nonEligible.map(a => (
                    <span key={a.referenceId} className="inline-block rounded bg-amber-100 border border-amber-200 px-1.5 py-0.5 font-mono text-[10px] text-amber-700">
                      {a.referenceId}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Date */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Interview Date <span className="text-destructive">*</span>
            </Label>
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Venue */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Venue <span className="text-muted-foreground font-normal">(optional)</span></Label>
            {interviewVenues.length === 0 ? (
              <Input
                placeholder="e.g. Main Hall, Admin Block"
                value={venue}
                onChange={e => setVenue(e.target.value)}
                className="h-9"
              />
            ) : (
              <Select value={venueId} onValueChange={setVenueId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select a venue" />
                </SelectTrigger>
                <SelectContent>
                  {interviewVenues.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      <span className="font-medium">{v.name}</span>
                      {v.city && <span className="text-muted-foreground ml-1.5 text-xs">{v.city}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            className="bg-cyan-600 hover:bg-cyan-700"
            onClick={handleConfirm}
            disabled={mutation.isPending || !date}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Schedule {referenceIds.length - nonEligible.length} Applicant{referenceIds.length - nonEligible.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Interview Marks Dialog ───────────────────────────────────────────────────

function InterviewMarksDialog({ applicants, onDone }: { applicants: any[]; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [marks, setMarks] = useState<Record<string, string>>({});

  function openDialog() {
    const init: Record<string, string> = {};
    applicants.forEach(a => { init[a.referenceId] = ""; });
    setMarks(init);
    setOpen(true);
  }

  const mutation = useBulkRecordAdminApplicationInterview({
    mutation: {
      onSuccess: (r) => {
        toast({
          title: "Interview marks recorded",
          description: `${r.passed} passed (≥12/30), ${r.failed} below threshold.`,
        });
        setOpen(false);
        onDone();
      },
      onError: () => toast({ title: "Failed to record marks", variant: "destructive" }),
    },
  });

  function submit() {
    const entries = applicants
      .map(a => ({ referenceId: a.referenceId, marks: parseInt(marks[a.referenceId] ?? "0", 10) }))
      .filter(e => !isNaN(e.marks));
    mutation.mutate({ data: { entries } });
  }

  const allFilled = applicants.every(a => marks[a.referenceId] !== "" && marks[a.referenceId] !== undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7 border-indigo-200 text-indigo-700 hover:bg-indigo-100" onClick={openDialog} data-testid="button-bulk-interview-marks">
        <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" /> Record Marks
      </Button>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Interview Marks</DialogTitle>
          <DialogDescription>
            Enter marks out of 30 for each candidate. Min threshold: <strong>12/30</strong> to advance to merit list.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-2.5 text-xs text-indigo-700 mb-2">
          <span className="font-bold">Formula reminder:</span> Academic (20) + Entry Test (50) + Interview (30) = Merit Score (100)
        </div>
        <div className="flex flex-col gap-2 py-2">
          {applicants.map(a => {
            const v = marks[a.referenceId] ?? "";
            const n = parseInt(v, 10);
            const valid = v === "" || (!isNaN(n) && n >= 0 && n <= 30);
            const color = v === "" ? "" : n >= 12 ? "border-emerald-400 bg-emerald-50" : "border-red-300 bg-red-50";
            return (
              <div key={a.referenceId} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors", color || "border-slate-200")}>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{a.fullName}</p>
                  <p className="text-[11px] text-slate-400 font-mono">{a.referenceId}</p>
                </div>
                {typeof a.resultMarks === "number" && (
                  <span className="text-[11px] text-slate-500 shrink-0">Test: {a.resultMarks}/100</span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    className={cn("w-16 h-8 text-center text-sm font-bold", !valid && "border-red-400")}
                    placeholder="0–30"
                    value={v}
                    onChange={e => {
                      const raw = e.target.value;
                      const n = Number(raw);
                      const clamped = raw !== "" && !isNaN(n) ? String(Math.min(30, Math.max(0, n))) : raw;
                      setMarks(prev => ({ ...prev, [a.referenceId]: clamped }));
                    }}
                  />
                  <span className="text-xs text-slate-400">/30</span>
                </div>
                {v !== "" && (
                  <span className={cn("text-[11px] font-semibold shrink-0", n >= 12 ? "text-emerald-600" : "text-red-500")}>
                    {n >= 12 ? "Pass" : "Fail"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending || !allFilled}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Marks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk status result → toast summary ──────────────────────────────────────
// The bulk status endpoint always responds 200 with { updated, notFound, skipped }.
// Records that fail the transition guard (e.g. "Interview Completed" requires
// marks) land in `skipped` rather than throwing — so a blanket success toast
// hides real failures. This derives an honest message from the response.
type BulkStatusResult = {
  updated?: number;
  notFound?: string[];
  skipped?: { referenceId: string; reason: string }[];
};

function summarizeBulkStatusResult(data: BulkStatusResult): {
  title: string;
  description?: string;
  variant?: "destructive";
} {
  const updated  = data?.updated ?? 0;
  const skipped  = data?.skipped ?? [];
  const notFound = data?.notFound ?? [];
  const failed   = skipped.length + notFound.length;

  if (updated > 0 && failed === 0) {
    return { title: `Status updated — ${updated} applicant${updated === 1 ? "" : "s"}` };
  }

  const reason =
    skipped[0]?.reason ??
    (notFound.length ? `Not found: ${notFound.join(", ")}` : undefined);

  if (updated > 0) {
    return {
      variant: "destructive",
      title: `${updated} updated, ${failed} skipped`,
      description: reason,
    };
  }

  return {
    variant: "destructive",
    title: "No changes applied",
    description: reason ?? "No applicants were updated.",
  };
}

// ─── Interview Tab ────────────────────────────────────────────────────────────

function InterviewTab() {
  const { toast }   = useToast();
  const queryClient = useQueryClient();
  const { classOptions } = useClassOptions();
  const [classFilter, setClassFilter] = useState("all");
  const [cityFilter, setCityFilter]   = useState("all");
  const [searchTerm, setSearchTerm]   = useState("");
  const [page, setPage]               = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);
  const PAGE_SIZE = 50;

  const { data: availableCities = [] } = useQuery<string[]>({
    queryKey: ["/api/admin/applications/cities"],
    queryFn: async () => {
      const res = await fetch("/api/admin/applications/cities", { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["/api/admin/applications"] }); }

  const inlineMutation = useUpdateAdminApplicationStatus({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Status updated" }); },
      onError:   () => { toast({ title: "Update failed", variant: "destructive" }); },
    },
  });

  const bulkMutation = useBulkUpdateAdminApplicationStatus({
    mutation: {
      onSuccess: (data) => { invalidate(); toast(summarizeBulkStatusResult(data as BulkStatusResult)); },
      onError:   () => { toast({ title: "Bulk update failed", variant: "destructive" }); },
    },
  });

  const [savingMarkId, setSavingMarkId]         = useState<string | null>(null);
  const [savingInterviewerId, setSavingInterviewerId] = useState<string | null>(null);

  const { data: interviewersData } = useQuery<{ items: Interviewer[] }>({
    queryKey: ["/api/admin/interviewers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/interviewers", { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (!res.ok) return { items: [] };
      return res.json();
    },
    staleTime: 60_000,
  });
  const interviewerOptions = (interviewersData?.items ?? []).filter(iv => iv.active);

  async function saveInterviewedBy(referenceId: string, interviewedBy: string | null) {
    setSavingInterviewerId(referenceId);
    try {
      const res = await fetch(`/api/admin/applications/${referenceId}/interviewed-by`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ interviewedBy }),
      });
      if (!res.ok) throw new Error("Failed");
      invalidate();
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSavingInterviewerId(null);
    }
  }

  async function saveInterviewMark(referenceId: string, marks: number) {
    setSavingMarkId(referenceId);
    try {
      const res = await fetch(`/api/admin/applications/${referenceId}/marks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ interviewMarks: marks }),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Cannot record marks", description: data.error ?? "Interview not yet scheduled.", variant: "destructive" });
        return;
      }
      if (!res.ok) throw new Error("Failed");
      invalidate();
      toast({ title: "Interview marks saved — status set to Interview Taken" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSavingMarkId(null);
    }
  }

  const qp = { classApplying: classFilter !== "all" ? classFilter : undefined, city: cityFilter !== "all" ? cityFilter : undefined, q: debouncedSearch || undefined, page, pageSize: PAGE_SIZE };
  const { data: allData, isLoading } = useListAdminApplications(qp, { query: { queryKey: getListAdminApplicationsQueryKey(qp), placeholderData: keepPreviousData } });

  const items      = allData?.items ?? [];
  const totalItems = allData?.total ?? 0;
  const ivRows = useMemo(() => items.map(app => ({ ...app, id: app.referenceId })), [items]);
  type IVRow = (typeof ivRows)[number];

  const INTERVIEW_PASS = 12;
  const INTERVIEW_MAX = 30;
  const ivPassed  = useMemo(() => ivRows.filter(r => typeof r.interviewMarks === "number" && r.interviewMarks >= INTERVIEW_PASS), [ivRows, INTERVIEW_PASS]);
  const ivFailed  = useMemo(() => ivRows.filter(r => typeof r.interviewMarks === "number" && r.interviewMarks < INTERVIEW_PASS), [ivRows, INTERVIEW_PASS]);
  const ivNoScore = useMemo(() => ivRows.filter(r => r.status === "interview_taken" && typeof r.interviewMarks !== "number"), [ivRows]);

  const ivGrid = useGridEdit(items);

  const { data: allVenues } = useListAdminTestCentres();
  const interviewVenues = useMemo(() => (allVenues ?? []).filter((v: any) => v.active), [allVenues]);
  const ivVenueOptions = [
    { value: "", label: "— None —" },
    ...interviewVenues.map((v: any) => ({ value: v.id as string, label: v.name as string })),
  ];

  const IV_FIELDS = ["interviewDate", "interviewVenueId", "interviewedBy", "interviewMarks"] as const;

  const ivInterviewerOptions = [
    { value: "", label: "— None —" },
    ...interviewerOptions.map(iv => ({ value: iv.name, label: iv.name + (iv.designation ? ` · ${iv.designation}` : "") })),
  ];

  const bulkUpdateIV = useBulkUpdateInterview({
    mutation: {
      onSuccess: (r: any) => {
        toast({ title: "Interview details saved", description: `${r.updated} record${r.updated !== 1 ? "s" : ""} updated.` });
        ivGrid.discardEdits();
        invalidate();
      },
      onError: () => toast({ title: "Save failed", variant: "destructive" }),
    },
  });

  async function handleIVSave() {
    const invalidRows = items.filter(r => {
      if (r.status === "enrolled") return false;
      const origMarks = r.interviewMarks != null ? String(r.interviewMarks) : "";
      const v = ivGrid.getCellValue(r.referenceId, "interviewMarks", origMarks).trim();
      if (v === "") return false;
      const n = Number(v);
      return !Number.isInteger(n) || n < 0 || n > INTERVIEW_MAX;
    });
    if (invalidRows.length > 0) {
      toast({
        title: "Invalid interview marks",
        description: `Marks must be a whole number from 0 to ${INTERVIEW_MAX}. Fix the ${invalidRows.length} highlighted row${invalidRows.length !== 1 ? "s" : ""} before saving.`,
        variant: "destructive",
      });
      return;
    }
    const entries = items.filter(r => r.status !== "enrolled").flatMap(r => {
      const origDate    = r.interviewDate ? String(r.interviewDate).slice(0, 10) : "";
      const origVenueId = (r as any).interviewVenueId ?? "";
      const origVenue   = (r as any).interviewVenue   ?? "";
      const origBy      = (r as any).interviewedBy ?? "";
      const origMarks   = r.interviewMarks != null ? String(r.interviewMarks) : "";
      const cellVenueOrig = interviewVenues.length > 0 ? origVenueId : origVenue;
      const origs: Record<string, string> = {
        interviewDate:    origDate,
        interviewVenueId: cellVenueOrig,
        interviewedBy:    origBy,
        interviewMarks:   origMarks,
      };
      const entry: any = { referenceId: r.referenceId };
      let dirty = false;
      for (const f of IV_FIELDS) {
        if (!ivGrid.isCellDirty(r.referenceId, f, origs[f])) continue;
        const v = ivGrid.getCellValue(r.referenceId, f, origs[f]);
        if (f === "interviewMarks") {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n >= 0 && n <= 30) { entry.interviewMarks = n; dirty = true; }
        } else if (f === "interviewDate") {
          entry.interviewDate = v || null; dirty = true;
        } else if (f === "interviewedBy") {
          entry.interviewedBy = v || null; dirty = true;
        } else if (f === "interviewVenueId") {
          if (interviewVenues.length > 0) {
            entry.interviewVenueId = v || null;
            entry.interviewVenue   = interviewVenues.find((iv: any) => iv.id === v)?.name ?? null;
          } else {
            entry.interviewVenue = v || null;
          }
          dirty = true;
        }
      }
      return dirty ? [entry] : [];
    });
    if (entries.length === 0) { toast({ title: "No changes to save" }); return; }
    bulkUpdateIV.mutate({ data: { entries } });
  }

  const ivColumns: ColDef<IVRow>[] = [
    { key: "referenceId",    label: "Applicant ID",        defaultVisible: false, defaultWidth: 120, render: r => <span className="font-mono text-xs font-bold text-indigo-600">{r.referenceId}</span>, getText: r => r.referenceId },
    { key: "name",           label: "Student Name",        defaultVisible: true,  defaultWidth: 200, render: r => <div><p className="font-semibold text-slate-800 text-[13px]">{r.fullName}</p><p className="text-[11px] text-slate-400 font-mono">{r.referenceId}</p></div>, getText: r => r.fullName ?? "" },
    { key: "status",         label: "Interview Status",    defaultVisible: true,  defaultWidth: 180, render: r => r.status === "enrolled" ? <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700"><Lock className="h-3 w-3" />Enrolled</span> : <InlineStatusCell app={r} onMutate={(id, st) => inlineMutation.mutate({ referenceId: id, data: { status: st as never, force: true } as never })} isUpdating={inlineMutation.isPending && inlineMutation.variables?.referenceId === r.referenceId} allowedStatuses={INTERVIEW_STATUS_OPTIONS} placeholder="Schedule An Interview" />, getText: r => statusLabel(r.status ?? "") },
    { key: "interviewDate",  label: "Date",                defaultVisible: true,  defaultWidth: 115, render: r => <span className="text-[12px] text-slate-600">{r.interviewDate ? new Date(r.interviewDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : <span className="text-slate-300">—</span>}</span>, getText: r => r.interviewDate ? new Date(r.interviewDate).toLocaleDateString("en-GB") : "" },
    { key: "interviewVenue", label: "Venue",               defaultVisible: true,  defaultWidth: 140, render: r => <div className="flex items-center gap-1.5 text-[12px] text-slate-600">{(r as any).interviewVenue ? <><MapPin className="h-3 w-3 text-slate-400 shrink-0" /><span className="truncate">{(r as any).interviewVenue}</span></> : <span className="text-slate-300">—</span>}</div>, getText: r => (r as any).interviewVenue ?? "" },
    { key: "interviewedBy",  label: "Interviewed By",      defaultVisible: true,  defaultWidth: 155, render: r => <span className="text-[12px] text-slate-600">{(r as any).interviewedBy ?? <span className="text-slate-300">—</span>}</span>, getText: r => (r as any).interviewedBy ?? "" },
    { key: "marks",          label: "Marks /30",           defaultVisible: true,  defaultWidth: 110, render: r => <InlineMarksCell referenceId={r.referenceId} value={r.interviewMarks} max={30} savingId={savingMarkId} onSave={saveInterviewMark} disabled={r.status === "enrolled"} disabledReason="Applicant is enrolled — record is locked" />, getText: r => r.interviewMarks != null ? String(r.interviewMarks) : "" },
    { key: "readiness",      label: "Result",              defaultVisible: true,  defaultWidth: 130,
      render: r => {
        if (typeof r.interviewMarks === "number") {
          return r.interviewMarks >= INTERVIEW_PASS
            ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Passed ({r.interviewMarks}/30)
              </span>
            : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />Below threshold ({r.interviewMarks}/30)
              </span>;
        }
        if (r.status === "interview_taken") return (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[10px] font-semibold text-orange-700" title="Interview marked as taken but score not yet recorded">
            <AlertCircle className="h-3 w-3 text-orange-400 shrink-0" />Score Pending
          </span>
        );
        return null;
      },
      getText: r => typeof r.interviewMarks === "number" ? (r.interviewMarks >= INTERVIEW_PASS ? `Passed (${r.interviewMarks}/30)` : `Below threshold (${r.interviewMarks}/30)`) : r.status === "interview_taken" ? "Score Pending" : "",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* ── Stage summary bar ── */}
      {(ivPassed.length > 0 || ivFailed.length > 0 || ivNoScore.length > 0) && (
        <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <span className="text-slate-400 font-medium uppercase tracking-wide text-[10px]">Stage</span>
          <span className="h-3.5 w-px bg-slate-200" />
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-bold text-slate-700">{ivPassed.length}</span>
            <span className="text-slate-500">passed ({">="}{INTERVIEW_PASS}/30)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <span className="font-bold text-slate-700">{ivFailed.length}</span>
            <span className="text-slate-500">below threshold</span>
          </span>
          {ivNoScore.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="font-bold text-slate-700">{ivNoScore.length}</span>
              <span className="text-slate-500">awaiting score</span>
            </span>
          )}
          {ivPassed.length > 0 && (
            <span className="ml-auto text-indigo-600 font-semibold">
              {ivPassed.length} candidate{ivPassed.length !== 1 ? "s" : ""} eligible for merit list →
            </span>
          )}
        </div>
      )}
    {ivGrid.editMode ? (
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <Edit2 className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="font-medium">Edit Interview Details</span>
            <span className="text-amber-600 text-xs hidden sm:inline">— Yellow cells have unsaved changes. Tab/Shift+Tab, ↑↓ or Enter to navigate.</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={ivGrid.discardEdits} disabled={bulkUpdateIV.isPending}>
              <X className="h-3.5 w-3.5 mr-1" />Discard
            </Button>
            <Button size="sm" onClick={handleIVSave} disabled={bulkUpdateIV.isPending || !ivGrid.hasChanges} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
              {bulkUpdateIV.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save All
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wide whitespace-nowrap">Reg ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wide whitespace-nowrap">Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wide" style={{ minWidth: 120 }}>Interview Date</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wide" style={{ minWidth: 140 }}>Venue</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wide" style={{ minWidth: 150 }}>Interviewed By</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-500 text-[10px] uppercase tracking-wide" style={{ minWidth: 90 }}>Marks /30</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-500 text-[10px] uppercase tracking-wide">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">No applications to edit.</td>
                  </tr>
                ) : items.map((r, rowIdx) => {
                  const origDate    = r.interviewDate ? String(r.interviewDate).slice(0, 10) : "";
                  const origVenueId = (r as any).interviewVenueId ?? "";
                  const origVenue   = (r as any).interviewVenue ?? "";
                  const cellVenueOrig = interviewVenues.length > 0 ? origVenueId : origVenue;
                  const origBy    = (r as any).interviewedBy ?? "";
                  const origMarks = r.interviewMarks != null ? String(r.interviewMarks) : "";
                  const marksVal  = ivGrid.getCellValue(r.referenceId, "interviewMarks", origMarks);
                  const marksTrim = marksVal.trim();
                  const marksN    = Number(marksTrim);
                  const marksInvalid = r.status !== "enrolled" && marksTrim !== "" && (!Number.isInteger(marksN) || marksN < 0 || marksN > INTERVIEW_MAX);
                  const marksValid   = marksTrim !== "" && Number.isInteger(marksN) && marksN >= 0 && marksN <= INTERVIEW_MAX;
                  const rowDirty  = Object.keys(ivGrid.pending).some(k => k.startsWith(`${r.referenceId}::`));
                  const isEnrolled = r.status === "enrolled";
                  const passRow   = !isEnrolled && marksValid ? (marksN >= INTERVIEW_PASS ? "bg-emerald-50/30" : "bg-red-50/30") : "";
                  return (
                    <tr key={r.referenceId} className={cn("hover:bg-slate-50/60 transition-colors", rowDirty && !isEnrolled && "bg-amber-50/30", passRow, isEnrolled && "opacity-60 bg-teal-50/20")}>
                      <td className="px-3 py-1.5 font-mono text-[11px] font-bold text-indigo-600 whitespace-nowrap">{r.referenceId}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {isEnrolled
                          ? <div><p className="font-semibold text-slate-800 text-[12px]">{r.fullName}</p><span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-1.5 py-0.5 text-[9px] font-semibold text-teal-700"><Lock className="h-2 w-2" />Enrolled</span></div>
                          : <div><p className="font-semibold text-slate-800 text-[12px]">{r.fullName}</p><p className="text-[10px] text-slate-400">{r.fatherName ?? ""}</p></div>}
                      </td>
                      <td className="px-2 py-1">
                        <GridDateCell
                          editMode={!isEnrolled}
                          value={isEnrolled ? origDate : ivGrid.getCellValue(r.referenceId, "interviewDate", origDate)}
                          onChange={v => ivGrid.setCellValue(r.referenceId, "interviewDate", v)}
                          dirty={!isEnrolled && ivGrid.isCellDirty(r.referenceId, "interviewDate", origDate)}
                          onKeyDown={e => ivGrid.handleCellKeyDown(e, rowIdx, 0, IV_FIELDS as unknown as string[], items.length)}
                          cellRef={el => ivGrid.registerCellRef(r.referenceId, "interviewDate", el)}
                          cellId={`${r.referenceId}:interviewDate`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        {interviewVenues.length > 0 ? (
                          <GridSelectCell
                            editMode={!isEnrolled}
                            value={isEnrolled ? origVenueId : ivGrid.getCellValue(r.referenceId, "interviewVenueId", origVenueId)}
                            onChange={v => ivGrid.setCellValue(r.referenceId, "interviewVenueId", v)}
                            dirty={!isEnrolled && ivGrid.isCellDirty(r.referenceId, "interviewVenueId", cellVenueOrig)}
                            options={ivVenueOptions}
                            onKeyDown={e => ivGrid.handleCellKeyDown(e, rowIdx, 1, IV_FIELDS as unknown as string[], items.length)}
                            cellRef={el => ivGrid.registerCellRef(r.referenceId, "interviewVenueId", el)}
                            cellId={`${r.referenceId}:interviewVenueId`}
                          />
                        ) : (
                          <GridTextCell
                            editMode={!isEnrolled}
                            value={isEnrolled ? origVenue : ivGrid.getCellValue(r.referenceId, "interviewVenueId", origVenue)}
                            onChange={v => ivGrid.setCellValue(r.referenceId, "interviewVenueId", v)}
                            dirty={!isEnrolled && ivGrid.isCellDirty(r.referenceId, "interviewVenueId", cellVenueOrig)}
                            placeholder="—"
                            onKeyDown={e => ivGrid.handleCellKeyDown(e, rowIdx, 1, IV_FIELDS as unknown as string[], items.length)}
                            cellRef={el => ivGrid.registerCellRef(r.referenceId, "interviewVenueId", el)}
                            cellId={`${r.referenceId}:interviewVenueId`}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {isEnrolled
                          ? <span className="text-xs text-slate-400">{origBy || "—"}</span>
                          : <GridSelectCell
                              editMode
                              value={ivGrid.getCellValue(r.referenceId, "interviewedBy", origBy)}
                              onChange={v => ivGrid.setCellValue(r.referenceId, "interviewedBy", v)}
                              dirty={ivGrid.isCellDirty(r.referenceId, "interviewedBy", origBy)}
                              options={ivInterviewerOptions}
                              onKeyDown={e => ivGrid.handleCellKeyDown(e, rowIdx, 2, IV_FIELDS as unknown as string[], items.length)}
                              cellRef={el => ivGrid.registerCellRef(r.referenceId, "interviewedBy", el)}
                              cellId={`${r.referenceId}:interviewedBy`}
                            />}
                      </td>
                      <td className="px-2 py-1 text-center align-top">
                        {isEnrolled
                          ? <span className="text-xs text-slate-400">{r.interviewMarks ?? "—"}</span>
                          : <>
                              <GridNumberCell
                                editMode
                                value={marksVal}
                                onChange={val => ivGrid.setCellValue(r.referenceId, "interviewMarks", val)}
                                dirty={ivGrid.isCellDirty(r.referenceId, "interviewMarks", origMarks)}
                                invalid={marksInvalid}
                                min={0}
                                max={INTERVIEW_MAX}
                                placeholder={`0–${INTERVIEW_MAX}`}
                                onKeyDown={e => ivGrid.handleCellKeyDown(e, rowIdx, 3, IV_FIELDS as unknown as string[], items.length)}
                                cellRef={el => ivGrid.registerCellRef(r.referenceId, "interviewMarks", el)}
                                cellId={`${r.referenceId}:interviewMarks`}
                              />
                              {marksInvalid && (
                                <p className="mt-1 flex items-center justify-center gap-1 text-[10px] font-medium text-red-600 whitespace-nowrap">
                                  <AlertCircle className="h-3 w-3 shrink-0" />
                                  Must be 0–{INTERVIEW_MAX}
                                </p>
                              )}
                            </>}
                      </td>
                      <td className="px-3 py-1.5 text-center text-[11px] font-semibold whitespace-nowrap align-top">
                        {!isEnrolled && marksValid
                          ? marksN >= INTERVIEW_PASS
                            ? <span className="text-emerald-600">Pass</span>
                            : <span className="text-red-500">Fail</span>
                          : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalItems > PAGE_SIZE && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
              Showing page {page} of {Math.ceil(totalItems / PAGE_SIZE)} — use normal view to navigate pages.
            </div>
          )}
        </div>
      </div>
    ) : (
    <DataTable
      tableId="ccm_interview_v2"
      title="Interview"
      subtitle={`${totalItems} applicant${totalItems !== 1 ? "s" : ""} in interview pipeline`}
      action={
        <Button size="sm" variant="outline" onClick={() => ivGrid.enterEditMode()} className="h-9 gap-1.5" disabled={items.length === 0}>
          <Edit2 className="h-3.5 w-3.5" />
          Edit Interview Details
        </Button>
      }
      filters={
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(1); }} placeholder="Search name or register ID…" className="pl-8 h-9 text-sm w-64" />
          </div>
          <Select value={classFilter} onValueChange={v => { setClassFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="All Classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cityFilter} onValueChange={v => { setCityFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="All Cities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {availableCities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      }
      columns={ivColumns}
      data={ivRows}
      total={totalItems}
      isLoading={isLoading}
      page={page}
      pageSize={PAGE_SIZE}
      onPageChange={setPage}
      exportFilename={`interviews-${new Date().toISOString().slice(0,10)}`}
      printTitle="Interview — Applicants"
      bulkActions={(selectedIds, clearSelection) => (
        <>
          <InterviewScheduleDialog referenceIds={selectedIds} items={items} onDone={() => { invalidate(); clearSelection(); }} />
          <InterviewMarksDialog applicants={items.filter(a => selectedIds.includes(a.referenceId))} onDone={() => { invalidate(); clearSelection(); }} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={bulkMutation.isPending}>
                <Edit2 className="h-3 w-3" /> Set Status <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {INTERVIEW_STATUS_OPTIONS.map(opt => (
                <button key={opt.value} className="flex w-full items-center gap-2.5 px-2 py-1.5 text-sm rounded hover:bg-slate-50"
                  onClick={() => { bulkMutation.mutate({ data: { referenceIds: selectedIds, status: opt.value as never, force: true } as never }); clearSelection(); }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: opt.color }} />
                  <span className="text-[12.5px] font-semibold text-slate-700">{opt.label}</span>
                </button>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      rowActions={r => (
        <Link href={`/applications/${r.referenceId}`}>
          <button className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
            <Eye className="h-3.5 w-3.5" />
          </button>
        </Link>
      )}
      emptyIcon={<div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center"><Users className="h-7 w-7 text-slate-300" /></div>}
      emptyTitle="No applications found"
      emptyDescription="Applications will appear here once they reach the interview stage."
    />
    )}
    </div>
  );
}
