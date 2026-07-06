import { useMemo, useState, useCallback, useEffect, useRef, memo } from "react";
import { formatPhone, formatCnic, displayPhone } from "@/lib/format";
import { useLocation, useSearch } from "wouter";
import { GuardianPicker, type GuardianOption } from "@/components/GuardianPicker";
import { StudentsDashboard } from "./students/StudentsDashboard";
import { StudentAttendanceTab } from "./students/StudentAttendanceTab";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import {
  useListAdminStudents,
  getListAdminStudentsQueryKey,
  useUpdateAdminStudent,
  useDeleteAdminStudent,
  useGetAdminStudent,
  getGetAdminStudentQueryKey,
  useListAdminClasses,
  useListAdminSections,
  useListAdminHouses,
  useListAdminAcademicYears,
  useListAdminApplications,
  type AdminStudentSummary,
} from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  X,
  Plus,
  Minus,
  Pencil,
  Trash2,
  Loader2,
  Filter,
  GraduationCap,
  UserCheck,
  Users,
  BookmarkPlus,
  Download,
  Clipboard,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DataTable, type ColDef } from "@/components/DataTable";

// ─── Constants ────────────────────────────────────────────────────────────────

const STUDENT_STATUSES = [
  { value: "active",      label: "Active",      color: "bg-green-100 text-green-800"   },
  { value: "alumni",      label: "Alumni",      color: "bg-blue-100 text-blue-800"     },
  { value: "expelled",    label: "Expelled",    color: "bg-red-100 text-red-800"       },
  { value: "transferred", label: "Transferred", color: "bg-orange-100 text-orange-800" },
  { value: "deceased",    label: "Deceased",    color: "bg-slate-100 text-slate-600"   },
];

const BLOOD_GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const RELATIONS    = ["Father","Mother","Guardian","Uncle","Aunt","Grandfather","Grandmother","Other"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusMeta(s: string) {
  return STUDENT_STATUSES.find((x) => x.value === s) ?? STUDENT_STATUSES[0];
}
function initials(s: AdminStudentSummary) {
  return (s.fullName?.[0] ?? "").toUpperCase();
}

function buildSavePayload(
  edits: Record<string, string>,
): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(edits)) {
    if (k === "name") {
      const idx = v.lastIndexOf(" ");
      p.fullName = v.trim();
    } else if (k === "class")   { p.classCode = v; }
    else if (k === "section")   { p.sectionId = v || undefined; }
    else if (k === "house")     { p.houseId   = v || undefined; }
    else                        { p[k] = v || undefined; }
  }
  return p;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const m = statusMeta(status);
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", m.color)}>
      {m.label}
    </span>
  );
}

// ─── Saved-views localStorage hook ───────────────────────────────────────────

function useLocalPref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as T : fallback; } catch { return fallback; }
  });
  const set = useCallback((v: T) => {
    setVal(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key]);
  return [val, set];
}

// ─── Expanded row ─────────────────────────────────────────────────────────────

function ExpandedRow({
  student, colSpan, onClose, onDelete, sectionName, houseName,
}: {
  student: AdminStudentSummary; colSpan: number; onClose: () => void;
  onDelete: () => void; sectionName: string; houseName: string;
}) {
  const fields = [
    { label: "Register ID",  value: student.applicantId },
    { label: "Mobile",      value: student.mobile ?? "—" },
    { label: "Guardian",    value: student.guardianMobile ?? "—" },
    { label: "City",        value: student.city ?? "—" },
    { label: "Class/Program",       value: student.classCode },
    { label: "Section",     value: sectionName || "—" },
    { label: "House",       value: houseName || "—" },
    { label: "Enrolled",    value: student.enrollmentDate ?? "—" },
  ];
  return (
    <tr className="bg-blue-50/40 border-b border-blue-100">
      <td colSpan={colSpan} className="px-6 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 mb-4">
          {fields.map((f) => (
            <div key={f.label}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{f.label}</p>
              <p className="text-[13px] font-semibold text-slate-800 mt-0.5">{f.value}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive gap-1.5">
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {student.fullName}?</AlertDialogTitle>
                <AlertDialogDescription>This permanently removes the student record. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 ml-2" onClick={onClose}>
            <X className="h-3 w-3 mr-1" /> Collapse
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─── Student form dialog ───────────────────────────────────────────────────────

type FormState = {
  applicantId: string; rollNo: string; fullName: string;
  dateOfBirth: string; bloodGroup: string; religion: string; nationality: string;
  mobile: string; email: string; address: string; city: string; province: string;
  fatherName: string; guardianName: string; relation: string;
  occupation: string; guardianMobile: string; guardianCnic: string;
  guardianId: string;
  classCode: string; sectionId: string; houseId: string; academicYearId: string;
  enrollmentDate: string; status: string;
};

const emptyForm: FormState = {
  applicantId: "", rollNo: "", fullName: "",
  dateOfBirth: "", bloodGroup: "", religion: "", nationality: "Pakistani",
  mobile: "", email: "", address: "", city: "", province: "",
  fatherName: "", guardianName: "", relation: "Father",
  occupation: "", guardianMobile: "", guardianCnic: "",
  guardianId: "",
  classCode: "", sectionId: "", houseId: "", academicYearId: "",
  enrollmentDate: new Date().toISOString().slice(0, 10), status: "active",
};

type EnrollRow = {
  _rowId: string;
  applicationId: string;
  applicantId: string;
  fullName: string;
  /** Linked guardian record (replaces free-text fatherName + guardianMobile) */
  guardian: GuardianOption | null;
  phone: string;
  dateOfBirth: string;
  bloodGroup: string;
};

function mkEnrollRow(): EnrollRow {
  return { _rowId: crypto.randomUUID(), applicationId: "", applicantId: "", fullName: "", guardian: null, phone: "", dateOfBirth: "", bloodGroup: "" };
}

async function fetchRegisterIds(count: number): Promise<string[]> {
  const token = getToken();
  const res = await fetch(`/api/admin/students/next-gr?count=${count}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await res.json() as { applicantIds?: string[]; nextApplicantId?: string; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Could not generate Register ID");
  if (Array.isArray(json.applicantIds) && json.applicantIds.length > 0) {
    return json.applicantIds.slice(0, count);
  }
  if (json.nextApplicantId) return [json.nextApplicantId];
  throw new Error("Could not generate Register ID");
}

// ─── Phone validation (Pakistan) ────────────────────────────────────────────────

// Normalises common prefixes/separators so validation is forgiving of input style.
function normalizePkPhone(raw: string): string {
  let d = raw.replace(/[\s\-()]/g, "");
  if (d.startsWith("+92")) d = "0" + d.slice(3);
  else if (d.startsWith("0092")) d = "0" + d.slice(4);
  else if (d.startsWith("92") && d.length === 12) d = "0" + d.slice(2);
  return d;
}

// Mobile must be 11 digits in the form 03xx-xxxxxxx.
function isValidPkMobile(raw: string): boolean {
  return /^03\d{9}$/.test(normalizePkPhone(raw));
}

// Phone may be a mobile or a landline: 10–11 digits starting with 0.
function isValidPkPhone(raw: string): boolean {
  return /^0\d{9,10}$/.test(normalizePkPhone(raw));
}

function studentToForm(s: AdminStudentSummary): FormState {
  return {
    applicantId: s.applicantId, rollNo: (s as any).rollNo ?? "", fullName: s.fullName ?? "",
    dateOfBirth: "", bloodGroup: "", religion: "", nationality: "Pakistani",
    mobile: s.mobile ?? "", email: "", address: "", city: s.city ?? "", province: "",
    fatherName: s.fatherName ?? "", guardianName: "", relation: "Father",
    occupation: "", guardianMobile: s.guardianMobile ?? "", guardianCnic: "",
    guardianId: (s as any).guardianId ?? "",
    classCode: s.classCode, sectionId: s.sectionId ?? "", houseId: s.houseId ?? "",
    academicYearId: s.academicYearId ?? "", enrollmentDate: s.enrollmentDate ?? "",
    status: s.status,
  };
}

type FormTab = "personal" | "contact" | "guardian" | "academic";

// Memoized enrollment-grid row. Because every prop (row + callbacks) is stable,
// typing in one row only re-renders that row instead of the whole grid — the
// key fix for the lag when many rows are open at once.
const EnrollGridRow = memo(function EnrollGridRow({
  row, ri, cell, disableRemove, onUpd, onUpdGuardian, onNav, onGenGr, onRemove,
}: {
  row: EnrollRow;
  ri: number;
  cell: string;
  disableRemove: boolean;
  onUpd: (rowId: string, k: keyof EnrollRow, v: string) => void;
  onUpdGuardian: (rowId: string, g: GuardianOption | null) => void;
  onNav: (e: React.KeyboardEvent, ri: number, ci: number) => void;
  onGenGr: (rowId: string) => void;
  onRemove: (rowId: string) => void;
}) {
  return (
    <tr className={cn("border-b border-slate-100", ri % 2 === 0 ? "bg-white" : "bg-slate-50/30")}>
      <td className="text-center text-[11px] text-slate-400 border-r border-slate-100 select-none font-mono">{ri + 1}</td>
      <td className="p-0 border-r border-slate-100">
        <div className="flex items-center">
          <input data-r={ri} data-c={0} value={row.applicantId} placeholder="CCM-2026-001"
            onChange={e => onUpd(row._rowId, "applicantId", e.target.value)} onKeyDown={e => onNav(e, ri, 0)}
            className={cn(cell, "font-mono text-xs")} />
          {!row.applicantId && (
            <button type="button" title="Auto-generate Applicant ID" onClick={() => onGenGr(row._rowId)}
              className="px-1.5 h-9 text-[10px] font-bold text-indigo-500 hover:text-indigo-800 hover:bg-indigo-50 transition-colors shrink-0 border-l border-slate-100">
              Gen
            </button>
          )}
        </div>
      </td>
      <td className="p-0 border-r border-slate-100">
        <input data-r={ri} data-c={1} value={row.fullName} placeholder="Full name"
          onChange={e => onUpd(row._rowId, "fullName", e.target.value)} onKeyDown={e => onNav(e, ri, 1)}
          className={cell} />
      </td>
      <td className="p-0 border-r border-slate-100 h-[34px]">
        <GuardianPicker
          value={row.guardian}
          onChange={(g) => onUpdGuardian(row._rowId, g)}
          variant="inline"
          className="h-[34px]"
        />
      </td>
      <td className="p-0 border-r border-slate-100">
        <input data-r={ri} data-c={3} value={row.phone} placeholder="0300-0000000" maxLength={12}
          onChange={e => onUpd(row._rowId, "phone", formatPhone(e.target.value))} onKeyDown={e => onNav(e, ri, 3)}
          title={row.phone.trim() && !isValidPkPhone(row.phone) ? "Enter a valid phone number (10–11 digits starting with 0)" : undefined}
          className={cn(cell, row.phone.trim() && !isValidPkPhone(row.phone) && "ring-1 ring-inset ring-red-400 bg-red-50/60")} />
      </td>
      <td className="p-0 border-r border-slate-100">
        <input data-r={ri} data-c={4} type="date" value={row.dateOfBirth}
          onChange={e => onUpd(row._rowId, "dateOfBirth", e.target.value)} onKeyDown={e => onNav(e, ri, 4)}
          className={cell} />
      </td>
      <td className="text-center align-middle">
        <button onClick={() => onRemove(row._rowId)} disabled={disableRemove}
          className="h-9 w-9 flex items-center justify-center mx-auto text-slate-300 hover:text-red-500 disabled:opacity-0 disabled:cursor-not-allowed transition-colors">
          <Minus className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
});

export function StudentFormDialog({
  open, onOpenChange, editing, onSaved, classes, sections, houses, years,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: AdminStudentSummary | null;
  onSaved: (created?: AdminStudentSummary[]) => void;
  classes: any[]; sections: any[]; houses: any[]; years: any[];
}) {
  const { toast } = useToast();

  // ── Edit mode (tabbed form) ──────────────────────────────────────────────────
  const [form, setForm]         = useState<FormState>(emptyForm);
  const [activeTab, setActiveTab] = useState<FormTab>("personal");
  const [formGuardianOpt, setFormGuardianOpt] = useState<GuardianOption | null>(null);
  const updateMutation = useUpdateAdminStudent({ mutation: { onSuccess: () => { toast({ title: "Student updated" }); onSaved(); onOpenChange(false); } } });
  const updating = updateMutation.isPending;
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(editing ? studentToForm(editing) : emptyForm);
      setFormGuardianOpt(null);
      setActiveTab("personal");
    }
  }
  const { data: editingDetail } = useGetAdminStudent(editing?.id ?? "", {
    query: { enabled: !!editing?.id && open, queryKey: getGetAdminStudentQueryKey(editing?.id ?? "") },
  });
  useEffect(() => {
    if (!editingDetail) return;
    setForm((f) => ({
      ...f,
      dateOfBirth:  editingDetail.dateOfBirth  ?? "",
      bloodGroup:   editingDetail.bloodGroup   ?? "",
      religion:     editingDetail.religion     ?? "",
      nationality:  editingDetail.nationality  ?? "Pakistani",
      email:        editingDetail.email        ?? "",
      address:      editingDetail.address      ?? "",
      province:     editingDetail.province     ?? "",
      guardianName: editingDetail.guardianName ?? "",
      relation:     editingDetail.relation     ?? "Father",
      occupation:   editingDetail.occupation   ?? "",
      guardianCnic: editingDetail.guardianCnic ?? "",
      guardianId:   (editingDetail as any).guardianId ?? "",
    }));
  }, [editingDetail]);
  function setF<K extends keyof FormState>(key: K, value: string) { setForm((f) => ({ ...f, [key]: value })); }
  function handleEditSave() {
    if (!form.applicantId.trim()) { toast({ title: "Register ID required", variant: "destructive" }); setActiveTab("personal"); return; }
    if (!form.fullName.trim()) { toast({ title: "Name required", variant: "destructive" }); setActiveTab("personal"); return; }
    if (!form.classCode) { toast({ title: "Class/Program required", variant: "destructive" }); setActiveTab("academic"); return; }
    updateMutation.mutate({ id: editing!.id, data: {
      applicantId: form.applicantId.trim(), rollNo: form.rollNo || undefined,
      fullName: form.fullName.trim(),
      dateOfBirth: form.dateOfBirth || undefined, bloodGroup: form.bloodGroup || undefined,
      religion: form.religion || undefined, nationality: form.nationality || undefined,
      mobile: form.mobile || undefined, email: form.email || undefined,
      address: form.address || undefined, city: form.city || undefined, province: form.province || undefined,
      fatherName: form.fatherName || undefined, guardianName: form.guardianName || undefined,
      relation: form.relation || undefined, occupation: form.occupation || undefined,
      guardianMobile: form.guardianMobile || undefined, guardianCnic: form.guardianCnic || undefined,
      guardianId: form.guardianId || undefined,
      classCode: form.classCode, sectionId: form.sectionId || undefined,
      houseId: form.houseId || undefined, academicYearId: form.academicYearId || undefined,
      enrollmentDate: form.enrollmentDate || undefined, status: form.status,
    } as any});
  }

  // ── Bulk enroll mode (spreadsheet) ──────────────────────────────────────────
  const [classCode, setClassCode]   = useState("");
  const [sectionId, setSectionId]   = useState("");
  const [houseId, setHouseId]       = useState("");
  const [yearId, setYearId]         = useState("");
  useEffect(() => {
    if (years.length && !yearId) {
      const def = years.find((y: any) => y.isDefault) ?? years[0];
      if (def) setYearId(def.id);
    }
  }, [years, yearId]);
  const [enrollDate, setEnrollDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus]         = useState("active");
  const [enrollRows, setEnrollRows] = useState<EnrollRow[]>([mkEnrollRow()]);
  const [busy, setBusy]             = useState(false);
  const gridRef                     = useRef<HTMLDivElement>(null);

  const stateRef = useRef({ enrollRows });
  stateRef.current = { enrollRows };

  // Mandatory Academic Setup: enrollment is blocked unless at least one of each
  // configuration exists. The dropdown option lists are the source of truth.
  const missingSetup = useMemo(() => {
    const m: string[] = [];
    if (!years.length)    m.push("Academic Year");
    if (!classes.length)  m.push("Class/Program");
    if (!sections.some((s: any) => s.active)) m.push("Section");
    if (!houses.length)   m.push("House");
    return m;
  }, [years, classes, sections, houses]);

  // Fetch server-verified Register IDs whenever the bulk dialog opens.
  useEffect(() => {
    if (!open || editing) return;
    let cancelled = false;
    (async () => {
      try {
        const ids = await fetchRegisterIds(1);
        if (cancelled) return;
        setEnrollRows([{ ...mkEnrollRow(), applicantId: ids[0] ?? "" }]);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: "Could not load Register ID",
            description: err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, editing, toast]);
  const updE = useCallback((rowId: string, k: keyof EnrollRow, v: string) => {
    setEnrollRows(p => p.map(r => r._rowId === rowId ? { ...r, [k]: v } : r));
  }, []);
  const updGuardian = useCallback((rowId: string, g: GuardianOption | null) => {
    setEnrollRows(p => p.map(r => r._rowId === rowId ? { ...r, guardian: g } : r));
  }, []);
  const addEnrollRow = useCallback(async () => {
    try {
      const ids = await fetchRegisterIds(1);
      setEnrollRows(p => [...p, { ...mkEnrollRow(), applicantId: ids[0] ?? "" }]);
    } catch (err) {
      toast({
        title: "Could not generate Register ID",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);
  const removeEnrollRow = useCallback((rowId: string) => {
    setEnrollRows(p => p.length > 1 ? p.filter(r => r._rowId !== rowId) : p);
  }, []);
  const focusCell = useCallback((ri: number, ci: number) => {
    gridRef.current?.querySelector<HTMLElement>(`[data-r="${ri}"][data-c="${ci}"]`)?.focus();
  }, []);
  const nav = useCallback((e: React.KeyboardEvent, ri: number, ci: number) => {
    const len = stateRef.current.enrollRows.length;
    if (e.key === "ArrowDown") { e.preventDefault(); if (ri === len - 1) { addEnrollRow(); setTimeout(() => focusCell(ri + 1, ci), 20); } else focusCell(ri + 1, ci); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (ri > 0) focusCell(ri - 1, ci); }
    else if (e.key === "Enter") { e.preventDefault(); if (ri === len - 1) { addEnrollRow(); setTimeout(() => focusCell(ri + 1, 0), 20); } else focusCell(ri + 1, 0); }
  }, [addEnrollRow, focusCell]);
  async function handleBulkSave() {
    if (missingSetup.length) {
      toast({
        title: "Academic setup incomplete",
        description: `Configure ${missingSetup.join(", ")} before enrolling students.`,
        variant: "destructive",
      });
      return;
    }
    if (!classCode) { toast({ title: "Select a class first", variant: "destructive" }); return; }
    const valid = enrollRows.filter(r => r.applicantId.trim() && r.fullName.trim());
    if (!valid.length) { toast({ title: "Fill Applicant ID and Full Name for at least one row", variant: "destructive" }); return; }

    // Block on invalid phone numbers before enrolling anyone.
    const badPhoneRow = valid.find(r => r.phone.trim() && !isValidPkPhone(r.phone));
    if (badPhoneRow) {
      const rowNo = enrollRows.findIndex(r => r._rowId === badPhoneRow._rowId) + 1;
      toast({
        title: `Invalid phone number in row ${rowNo}`,
        description: "Phone must be a valid number (10–11 digits starting with 0). Fix the highlighted field.",
        variant: "destructive",
      });
      return;
    }

    // Block on duplicate Applicant IDs within the batch.
    const grList = valid.map(r => r.applicantId.trim());
    const dupGr = grList.find((g, i) => grList.indexOf(g) !== i);
    if (dupGr) {
      toast({
        title: "Duplicate Applicant ID",
        description: `GR ${dupGr} is used by more than one row. Each student needs a unique Applicant ID.`,
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    try {
      const token = getToken();
      const res = await fetch("/api/admin/students/bulk-enroll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          classCode,
          sectionId: sectionId || undefined,
          houseId: houseId || undefined,
          academicYearId: yearId || undefined,
          enrollmentDate: enrollDate || undefined,
          status,
          students: valid.map((row) => ({
            fullName: row.fullName.trim(),
            fatherName: row.guardian?.name?.trim() || undefined,
            guardianId: row.guardian?.id || undefined,
            mobile: row.phone.trim() || undefined,
            dateOfBirth: row.dateOfBirth || undefined,
            bloodGroup: row.bloodGroup || undefined,
            applicationId: row.applicationId || undefined,
          })),
        }),
      });
      const json = await res.json() as { items?: AdminStudentSummary[]; count?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not enroll students");

      const created = json.items ?? [];
      toast({
        title: `${created.length} student${created.length > 1 ? "s" : ""} enrolled`,
        description: created.length === 1
          ? `Register ID ${created[0]?.applicantId} assigned.`
          : `Register IDs ${created.map((s) => s.applicantId).join(", ")} assigned.`,
      });
      onSaved(created);
      onOpenChange(false);
      setEnrollRows([mkEnrollRow()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not enroll students";
      toast({ title: msg, variant: "destructive" });
    } finally { setBusy(false); }
  }

  const _admittedParams = { status: "admitted", pageSize: 200 };
  const { data: admittedPage } = useListAdminApplications(
    _admittedParams,
    { query: { enabled: open && !editing, queryKey: ["/api/admin/applications", _admittedParams] } },
  );
  const admittedApps = (admittedPage?.items ?? []) as any[];

  const [admittedSearch, setAdmittedSearch]     = useState("");
  const [admittedPickOpen, setAdmittedPickOpen] = useState(false);
  const filteredAdmitted = useMemo(() => {
    const q = admittedSearch.toLowerCase();
    if (!q) return admittedApps.slice(0, 25);
    return admittedApps.filter((a: any) =>
      `${a.fullName} ${a.referenceId} ${a.classApplying}`.toLowerCase().includes(q)
    ).slice(0, 25);
  }, [admittedApps, admittedSearch]);

  async function pickAdmittedApplicant(referenceId: string) {
    setAdmittedPickOpen(false);
    setAdmittedSearch("");
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/applications/${referenceId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const app = await res.json();
      if (!res.ok) throw new Error(app?.error);
      const patch = {
        fullName:    app.fullName       ?? "",
        phone:       app.studentMobile  ?? "",
        dateOfBirth: app.dateOfBirth    ?? "",
      };
      // Auto-fill shared section from section_allocations if the admitted app
      // has a pre-assigned placement and the admin hasn't manually set one yet.
      const listApp = admittedApps.find((a: any) => a.referenceId === referenceId);
      if (listApp?.sectionAllocSectionId && !sectionId) {
        setSectionId(listApp.sectionAllocSectionId);
      }
      // Carry the applicationId (DB UUID) on the row so the backend can sync
      // application status → enrolled and write the audit event on student
      // creation. listApp.id is the UUID PK; referenceId is the human-readable
      // reference and must not be used as a FK.
      const rowPatch = { ...patch, applicationId: listApp?.id ?? "" };
      const emptyIdx = enrollRows.findIndex(r => !r.fullName.trim());
      if (emptyIdx >= 0) {
        const target = enrollRows[emptyIdx];
        setEnrollRows(p => p.map(r => (r._rowId === target._rowId ? { ...r, ...rowPatch } : r)));
      } else {
        try {
          const ids = await fetchRegisterIds(1);
          setEnrollRows(p => [...p, { ...mkEnrollRow(), ...rowPatch, applicantId: ids[0] ?? "" }]);
        } catch {
          setEnrollRows(p => [...p, { ...mkEnrollRow(), ...rowPatch }]);
        }
      }
    } catch {
      toast({ title: "Could not load applicant details", variant: "destructive" });
    }
  }

  const genGrForRow = useCallback(async (rowId: string) => {
    try {
      const ids = await fetchRegisterIds(1);
      setEnrollRows(p => p.map(r => (r._rowId === rowId ? { ...r, applicantId: ids[0] ?? "" } : r)));
    } catch (err) {
      toast({
        title: "Could not generate Register ID",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const cell = "w-full h-9 px-2.5 text-sm bg-transparent border-0 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 transition-colors placeholder:text-slate-300";
  const ready = enrollRows.filter(r => r.applicantId.trim() && r.fullName.trim()).length;

  // Rows whose Phone fails validation (only non-empty values).
  const phoneErrorRows = useMemo(() => enrollRows
    .map((r, i) => ({ idx: i + 1, r }))
    .filter(({ r }) => r.phone.trim() && !isValidPkPhone(r.phone)),
    [enrollRows]);

  // Applicant IDs used by more than one row in the grid.
  const dupGrNumbers = useMemo(() => {
    const grs = enrollRows.map(r => r.applicantId.trim()).filter(Boolean);
    return [...new Set(grs.filter((g, i) => grs.indexOf(g) !== i))];
  }, [enrollRows]);

  const hasBulkErrors = phoneErrorRows.length > 0 || dupGrNumbers.length > 0;

  const TABS: { key: FormTab; label: string }[] = [
    { key: "personal", label: "Personal" }, { key: "contact", label: "Contact" },
    { key: "guardian", label: "Guardian" }, { key: "academic", label: "Academic" },
  ];

  // ── Edit mode: keep the full tabbed dialog ───────────────────────────────────
  if (editing) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
            <DialogDescription>Updating record for {editing.fullName}.</DialogDescription>
          </DialogHeader>
          <div className="flex border-b border-border -mx-1">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  activeTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {t.label}
              </button>
            ))}
          </div>
          {activeTab === "personal" && (
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="space-y-1.5"><Label>Register ID *</Label><Input value={form.applicantId} onChange={(e) => setF("applicantId", e.target.value)} placeholder="e.g. CCM-2026-001" /></div>
              <div className="space-y-1.5"><Label>Roll No.</Label><Input value={form.rollNo} onChange={(e) => setF("rollNo", e.target.value)} placeholder="e.g. 1, 2, 3…" /></div>
              <div className="space-y-1.5"><Label>Full Name *</Label><Input value={form.fullName} onChange={(e) => setF("fullName", e.target.value)} /></div>
              <div className="space-y-1.5"></div>
              <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" value={form.dateOfBirth} onChange={(e) => setF("dateOfBirth", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Blood Group</Label>
                <Select value={form.bloodGroup} onValueChange={(v) => setF("bloodGroup", v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{BLOOD_GROUPS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Religion</Label><Input value={form.religion} onChange={(e) => setF("religion", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Nationality</Label><Input value={form.nationality} onChange={(e) => setF("nationality", e.target.value)} /></div>
            </div>
          )}
          {activeTab === "contact" && (
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="space-y-1.5"><Label>Mobile</Label><Input value={form.mobile} onChange={(e) => setF("mobile", formatPhone(e.target.value))} maxLength={12} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setF("email", e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setF("address", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={(e) => setF("city", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Province</Label><Input value={form.province} onChange={(e) => setF("province", e.target.value)} /></div>
            </div>
          )}
          {activeTab === "guardian" && (
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="col-span-2 space-y-1.5">
                <Label>Linked Guardian Record</Label>
                <GuardianPicker
                  value={formGuardianOpt}
                  onChange={(g) => {
                    setFormGuardianOpt(g);
                    setF("guardianId", g?.id ?? "");
                    if (g && !form.fatherName) setF("fatherName", g.name);
                  }}
                  placeholder="Search or create a guardian…"
                />
                {form.guardianId && !formGuardianOpt && (
                  <p className="text-[11px] text-muted-foreground">Guardian linked (ID: {form.guardianId.slice(0, 8)}…). Search to change.</p>
                )}
              </div>
              <div className="space-y-1.5"><Label>Father's Name</Label><Input value={form.fatherName} onChange={(e) => setF("fatherName", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Guardian Name</Label><Input value={form.guardianName} onChange={(e) => setF("guardianName", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Relation</Label>
                <Select value={form.relation} onValueChange={(v) => setF("relation", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RELATIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Occupation</Label><Input value={form.occupation} onChange={(e) => setF("occupation", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Guardian Mobile</Label><Input value={form.guardianMobile} onChange={(e) => setF("guardianMobile", formatPhone(e.target.value))} maxLength={12} /></div>
              <div className="space-y-1.5"><Label>Guardian CNIC</Label><Input value={form.guardianCnic} onChange={(e) => setF("guardianCnic", formatCnic(e.target.value))} maxLength={15} /></div>
            </div>
          )}
          {activeTab === "academic" && (
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="col-span-2 space-y-1.5"><Label>Class/Program *</Label>
                <Select value={form.classCode || "__none__"} onValueChange={(v) => setF("classCode", v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select class…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>— Select class —</SelectItem>
                    {classes.map((c: any) => <SelectItem key={c.id} value={c.code}>{c.name}</SelectItem>)}
                    {classes.length === 0 && <SelectItem value="__no_classes__" disabled>No classes configured</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Section</Label>
                <Select value={form.sectionId || "__none__"} onValueChange={(v) => setF("sectionId", v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select section…" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">None</SelectItem>{sections.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>House</Label>
                <Select value={form.houseId || "__none__"} onValueChange={(v) => setF("houseId", v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select house…" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">None</SelectItem>{houses.map((h: any) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Academic Year</Label>
                <Select value={form.academicYearId || "__none__"} onValueChange={(v) => setF("academicYearId", v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select year…" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">None</SelectItem>{years.map((y: any) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Enrollment Date</Label><Input type="date" value={form.enrollmentDate} onChange={(e) => setF("enrollmentDate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setF("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STUDENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={updating}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={updating}>
              {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Bulk enroll mode: spreadsheet dialog ─────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1120px] w-[96vw] p-0 gap-0 overflow-hidden">

        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Bulk Enroll Students</h2>
            <p className="text-sm text-slate-500 mt-0.5">Set the class and shared fields, then add one row per student.</p>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-1.5 font-mono shrink-0 ml-4">
            <span className="bg-white border border-slate-200 rounded px-1 py-0.5">↑↓</span> rows &nbsp;
            <span className="bg-white border border-slate-200 rounded px-1 py-0.5">Tab</span> columns &nbsp;
            <span className="bg-white border border-slate-200 rounded px-1 py-0.5">Enter</span> next row
          </div>
        </div>

        {/* Shared header */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/60">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Shared Defaults (applies to all rows)</p>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <div className="sm:col-span-2">
              <p className="text-[10px] font-semibold text-slate-400 mb-1">Class <span className="text-red-400">*</span></p>
              <select value={classCode} onChange={e => setClassCode(e.target.value)}
                className="w-full h-8 px-2 text-sm bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">— Select class —</option>
                {classes.map((c: any) => <option key={c.id} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 mb-1">Section</p>
              <select value={sectionId} onChange={e => setSectionId(e.target.value)}
                className="w-full h-8 px-2 text-sm bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">None</option>
                {sections.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 mb-1">House</p>
              <select value={houseId} onChange={e => setHouseId(e.target.value)}
                className="w-full h-8 px-2 text-sm bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">None</option>
                {houses.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 mb-1">Academic Year</p>
              <select value={yearId} onChange={e => setYearId(e.target.value)}
                className="w-full h-8 px-2 text-sm bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">None</option>
                {years.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 mb-1">Status</p>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full h-8 px-2 text-sm bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-300">
                {STUDENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-2">
            <p className="text-[10px] font-semibold text-slate-400 mb-1">Enrollment Date</p>
            <input type="date" value={enrollDate} onChange={e => setEnrollDate(e.target.value)}
              className="h-8 px-2 text-sm bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
        </div>

        {/* Admitted applicant searchable combobox */}
        {admittedApps.length > 0 && (
          <div className="px-6 py-2.5 border-b border-slate-100 bg-indigo-50/40">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 shrink-0">From Qualified</span>
              {(() => {
                const pickedCount = enrollRows.filter(r => r.applicationId).length;
                const withSectionCount = enrollRows.filter(r => r.applicationId && admittedApps.find((a: any) => a.id === r.applicationId && a.sectionAllocId)).length;
                if (pickedCount === 0) return null;
                return (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 shrink-0" title="These rows were pre-filled from qualified applicants">
                    {pickedCount} selected{withSectionCount > 0 ? `, ${withSectionCount} with section pre-assigned` : ""}
                  </span>
                );
              })()}
              <div className="flex-1 relative">
                <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-indigo-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input
                  value={admittedSearch}
                  onChange={e => { setAdmittedSearch(e.target.value); setAdmittedPickOpen(true); }}
                  onFocus={() => setAdmittedPickOpen(true)}
                  onBlur={() => setTimeout(() => setAdmittedPickOpen(false), 150)}
                  placeholder="Search qualified applicants to pre-fill a row…"
                  className="w-full h-8 pl-7 pr-3 text-sm bg-white border border-indigo-200 rounded-md outline-none focus:ring-2 focus:ring-indigo-300"
                />
                {admittedPickOpen && filteredAdmitted.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-30 mt-1 border border-indigo-100 rounded-xl bg-white shadow-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {filteredAdmitted.map((a: any) => (
                      <button key={a.referenceId} type="button"
                        className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-sm transition-colors"
                        onMouseDown={() => pickAdmittedApplicant(a.referenceId)}>
                        <span className="font-semibold text-slate-800">{a.fullName}</span>
                        <span className="text-slate-400 text-xs ml-2">{a.referenceId} · Class/Program {a.classApplying}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Grid */}
        <div className="overflow-x-auto max-h-[44vh] overflow-y-auto" ref={gridRef}>
          <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ minWidth: 140 }} /><col style={{ minWidth: 130 }} />
              <col style={{ minWidth: 200 }} /><col style={{ minWidth: 120 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 38 }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 border-b-2 border-slate-200 select-none">
                <th className="py-2.5 text-center text-[10px] text-slate-400 border-r border-slate-200">#</th>
                {[
                  { l: "Register ID", req: true }, { l: "Full Name", req: true },
                  { l: "Guardian" }, { l: "Phone" }, { l: "Date of Birth" },
                ].map(({ l, req }) => (
                  <th key={l} className="px-2.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-r border-slate-200 last:border-r-0 whitespace-nowrap">
                    {l}{req && <span className="text-red-400 ml-0.5">*</span>}
                  </th>
                ))}
                <th className="border-l border-slate-200" />
              </tr>
            </thead>
            <tbody>
              {enrollRows.map((row, ri) => (
                <EnrollGridRow
                  key={row._rowId}
                  row={row}
                  ri={ri}
                  cell={cell}
                  disableRemove={enrollRows.length === 1}
                  onUpd={updE}
                  onUpdGuardian={updGuardian}
                  onNav={nav}
                  onGenGr={genGrForRow}
                  onRemove={removeEnrollRow}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60">
          <button onClick={addEnrollRow} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors font-medium">
            <Plus className="h-3.5 w-3.5" /> Add Row
          </button>
        </div>

        {hasBulkErrors && (
          <div className="px-6 pt-3 space-y-1">
            {phoneErrorRows.length > 0 && (
              <p className="text-xs text-red-600">
                Invalid phone number in row{phoneErrorRows.length > 1 ? "s" : ""} {phoneErrorRows.map(p => p.idx).join(", ")}. Guardian Mobile must be a valid 11-digit mobile (03xx-xxxxxxx).
              </p>
            )}
            {dupGrNumbers.length > 0 && (
              <p className="text-xs text-red-600">
                Duplicate Applicant ID{dupGrNumbers.length > 1 ? "s" : ""}: {dupGrNumbers.join(", ")}. Each student needs a unique Applicant ID.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white">
          <p className="text-xs text-slate-400">
            {missingSetup.length ? <span className="text-red-500">Academic setup incomplete — configure {missingSetup.join(", ")} first</span>
              : !classCode ? <span className="text-amber-500">Select a class first</span>
              : hasBulkErrors ? <span className="text-red-500">Fix the highlighted errors to enable save</span>
              : ready > 0 ? <><span className="font-semibold text-slate-700">{ready}</span> of {enrollRows.length} rows ready</>
              : <span className="text-amber-500">Fill Register ID + Name to enable save</span>}
          </p>
          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleBulkSave} disabled={busy || ready === 0 || !classCode || hasBulkErrors || missingSetup.length > 0}>
              {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {`Enroll ${ready} Student${ready !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Saved views ──────────────────────────────────────────────────────────────

type SortKey = { col: string; dir: "asc" | "desc" };
type SavedView = {
  id: string; name: string;
  sortKeys: SortKey[];
  filters: {
    searchTerm: string; filterStatus: string; filterClass: string;
    filterSection: string; filterHouse: string; filterYear: string;
  };
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function Students() {
  const searchStr = useSearch();
  const urlTab = new URLSearchParams(searchStr).get("tab") ?? "dashboard";

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  // ── Lookup data ───────────────────────────────────────────────────────────
  const { data: classesData = [] }  = useListAdminClasses();
  const { data: sectionsData = [] } = useListAdminSections();
  const { data: housesData = [] }   = useListAdminHouses();
  const { data: yearsData = [] }    = useListAdminAcademicYears();
  const classes  = classesData  as any[];
  const sections = sectionsData as any[];
  const houses   = useMemo(() => {
    const seen = new Set<string>();
    return (housesData as any[]).filter((h: any) => {
      const key = String(h.name ?? "").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [housesData]);
  const years    = useMemo(() => {
    const seen = new Set<string>();
    return (yearsData as any[]).filter((y: any) => {
      const key = String(y.name ?? "").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [yearsData]);
  const sectionMap  = useMemo(() => new Map(sections.map((s: any) => [s.id, s.name])), [sections]);
  const houseMap    = useMemo(() => new Map(houses.map((h: any) => [h.id, h.name])), [houses]);
  const houseColor  = useMemo(() => new Map(houses.map((h: any) => [h.id, h.color])), [houses]);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchTerm,    setSearchTerm]    = useState("");
  const [filterStatus,  setFilterStatus]  = useState("all");
  const [filterClass,   setFilterClass]   = useState("all");
  const [filterSection, setFilterSection] = useState("all");
  const [filterHouse,   setFilterHouse]   = useState("all");
  const [filterYear,    setFilterYear]    = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [sortState, setSortState] = useState<{ key: string; dir: "asc" | "desc" }[]>([]);
  const debouncedSearch = useDebounce(searchTerm, 400);

  // ── Saved views ───────────────────────────────────────────────────────────
  const [savedViews,     setSavedViews]     = useLocalPref<SavedView[]>("ccm_stu_views_v1", []);
  const [savingViewName, setSavingViewName] = useState(false);
  const [viewNameInput,  setViewNameInput]  = useState("");

  function saveCurrentView() {
    const name = viewNameInput.trim();
    if (!name) return;
    const view: SavedView = {
      id: Date.now().toString(), name,
      sortKeys: [],
      filters: { searchTerm, filterStatus, filterClass, filterSection, filterHouse, filterYear },
    };
    setSavedViews([...savedViews, view]);
    setSavingViewName(false);
    setViewNameInput("");
    toast({ title: `View "${name}" saved` });
  }
  function loadView(v: SavedView) {
    setSearchTerm(v.filters.searchTerm);
    setFilterStatus(v.filters.filterStatus);
    setFilterClass(v.filters.filterClass);
    setFilterSection(v.filters.filterSection);
    setFilterHouse(v.filters.filterHouse);
    setFilterYear(v.filters.filterYear);
    setPage(1);
    toast({ title: `Loaded view "${v.name}"` });
  }

  // ── Query ─────────────────────────────────────────────────────────────────
  const qp = {
    q:              debouncedSearch || undefined,
    status:         filterStatus  !== "all" ? filterStatus  : undefined,
    classCode:      filterClass   !== "all" ? filterClass   : undefined,
    sectionId:      filterSection !== "all" ? filterSection : undefined,
    houseId:        filterHouse   !== "all" ? filterHouse   : undefined,
    academicYearId: filterYear    !== "all" ? filterYear    : undefined,
    page, pageSize,
    sort: sortState.length > 0 ? sortState.map(s => `${s.key}:${s.dir}`).join(",") : undefined,
  };
  const { data, isLoading } = useListAdminStudents(qp, {
    query: { queryKey: getListAdminStudentsQueryKey(qp), placeholderData: keepPreviousData },
  });
  const items = data?.items ?? [];

  // ── Mutations ─────────────────────────────────────────────────────────────
  function invalidate(created?: AdminStudentSummary[]) {
    if (created?.length) {
      queryClient.setQueriesData(
        { queryKey: ["/api/admin/students"] },
        (old: { items?: AdminStudentSummary[]; total?: number; page?: number; pageSize?: number } | undefined) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: [...created, ...old.items],
            total: (old.total ?? old.items.length) + created.length,
          };
        },
      );
    }
    queryClient.invalidateQueries({ queryKey: ["/api/admin/students"] });
  }

  const deleteMutation = useDeleteAdminStudent({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Student deleted" }); },
      onError:   () => toast({ title: "Delete failed", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateAdminStudent({
    mutation: {
      onSuccess: () => invalidate(),
      onError:   () => toast({ title: "Save failed", variant: "destructive" }),
    },
  });

  // ── Dialog ────────────────────────────────────────────────────────────────
  const [dialogOpen,     setDialogOpen]     = useState(false);
  const [editingStudent, setEditingStudent] = useState<AdminStudentSummary | null>(null);
  function openAdd()  { setEditingStudent(null); setDialogOpen(true); }
  function openEdit(s: AdminStudentSummary) { setEditingStudent(s); setDialogOpen(true); }

  // ── onSaveRow ─────────────────────────────────────────────────────────────
  async function handleSaveRow(id: string, edits: Record<string, string>) {
    const payload = buildSavePayload(edits);
    await new Promise<void>((resolve, reject) => {
      updateMutation.mutate({ id, data: payload }, {
        onSuccess: () => resolve(),
        onError:   () => reject(new Error("save failed")),
      });
    });
  }

  // ── Column definitions ────────────────────────────────────────────────────
  const columns = useMemo<ColDef<AdminStudentSummary>[]>(() => [
    {
      key: "applicantId", label: "Register ID", defaultVisible: true, defaultWidth: 120,
      sortable: true, editable: false,
      render: (s) => <span className="font-mono text-xs font-semibold text-slate-600">{s.applicantId}</span>,
      getText: (s) => s.applicantId,
    },
    {
      key: "name", label: "Student Name", defaultVisible: true, defaultWidth: 200,
      sortable: true, editable: true,
      render: (s) => (
        <button
          className="flex items-center gap-2 min-w-0 text-left w-full group/name"
          onClick={(e) => { e.stopPropagation(); navigate(`/students/${s.applicantId}`); }}
        >
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-[10px] font-bold bg-blue-100 text-blue-700">{initials(s)}</AvatarFallback>
          </Avatar>
          <span className="font-semibold text-slate-800 truncate group-hover/name:text-blue-600 group-hover/name:underline transition-colors">
            {s.fullName}
          </span>
        </button>
      ),
      getText: (s) => s.fullName ?? "",
      getEditValue: (s) => s.fullName ?? "",
    },
    {
      key: "fatherName", label: "Father's Name", defaultVisible: false, defaultWidth: 170,
      sortable: true, editable: true,
      render: (s) => <span className="text-slate-700">{s.fatherName || <span className="text-muted-foreground">—</span>}</span>,
      getText: (s) => s.fatherName ?? "",
      getEditValue: (s) => s.fatherName ?? "",
    },
    {
      key: "class", label: "Class/Program", defaultVisible: true, defaultWidth: 150,
      sortable: true, editable: true,
      render: (s) => <span className="font-medium">{s.classCode}</span>,
      getText: (s) => s.classCode,
      getEditValue: (s) => s.classCode,
      renderEdit: (value, onChange, cellProps) => (
        <select
          {...(cellProps as any)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 cursor-pointer"
        >
          {classes.map((c: any) => <option key={c.id} value={c.code}>{c.name}</option>)}
        </select>
      ),
    },
    {
      key: "section", label: "Section", defaultVisible: false, defaultWidth: 100,
      sortable: true, editable: true,
      render: (s) => <span className="text-slate-700">{sectionMap.get(s.sectionId ?? "") || <span className="text-muted-foreground">—</span>}</span>,
      getText: (s) => sectionMap.get(s.sectionId ?? "") ?? "",
      getEditValue: (s) => s.sectionId ?? "",
      renderEdit: (value, onChange, cellProps) => (
        <select
          {...(cellProps as any)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 cursor-pointer"
        >
          <option value="">None</option>
          {sections.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      ),
    },
    {
      key: "house", label: "House", defaultVisible: true, defaultWidth: 120,
      sortable: true, editable: true,
      render: (s) => {
        const houseName = houseMap.get(s.houseId ?? "");
        const hColor = houseColor.get(s.houseId ?? "");
        return houseName ? (
          <span className="flex items-center gap-1.5">
            {hColor && <span className="h-2.5 w-2.5 rounded-full border border-white/50 shadow-sm shrink-0" style={{ backgroundColor: hColor }} />}
            <span className="truncate">{houseName}</span>
          </span>
        ) : <span className="text-muted-foreground">—</span>;
      },
      getText: (s) => houseMap.get(s.houseId ?? "") ?? "",
      getEditValue: (s) => s.houseId ?? "",
      renderEdit: (value, onChange, cellProps) => (
        <select
          {...(cellProps as any)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 cursor-pointer"
        >
          <option value="">None</option>
          {houses.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      ),
    },
    {
      key: "mobile", label: "Contact", defaultVisible: false, defaultWidth: 130,
      sortable: false, editable: true,
      render: (s) => <span className="text-slate-700">{s.mobile || <span className="text-muted-foreground">—</span>}</span>,
      getText: (s) => s.mobile ?? "",
      getEditValue: (s) => s.mobile ?? "",
    },
    {
      key: "enrollmentDate", label: "Enrolled", defaultVisible: true, defaultWidth: 110,
      sortable: true, editable: false,
      render: (s) => <span className="text-slate-700">{s.enrollmentDate || <span className="text-muted-foreground">—</span>}</span>,
      getText: (s) => s.enrollmentDate ?? "",
    },
    {
      key: "status", label: "Status", defaultVisible: true, defaultWidth: 120,
      sortable: true, editable: true,
      render: (s) => <StatusBadge status={s.status} />,
      getText: (s) => statusMeta(s.status).label,
      getEditValue: (s) => s.status,
      renderEdit: (value, onChange, cellProps) => (
        <select
          {...(cellProps as any)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 cursor-pointer"
        >
          {STUDENT_STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ),
    },
  ], [classes, sections, houses, sectionMap, houseMap, houseColor, navigate]);

  // ── Filter chips ──────────────────────────────────────────────────────────
  type Chip = { label: string; clear: () => void };
  const filterChips: Chip[] = [
    ...(debouncedSearch  ? [{ label: `"${debouncedSearch}"`, clear: () => { setSearchTerm(""); setSortState([]); setPage(1); } }] : []),
    ...(filterStatus  !== "all" ? [{ label: statusMeta(filterStatus).label, clear: () => { setFilterStatus("all");  setSortState([]); setPage(1); } }] : []),
    ...(filterClass   !== "all" ? [{ label: filterClass,                    clear: () => { setFilterClass("all");   setSortState([]); setPage(1); } }] : []),
    ...(filterSection !== "all" ? [{ label: sectionMap.get(filterSection) ?? filterSection, clear: () => { setFilterSection("all"); setSortState([]); setPage(1); } }] : []),
    ...(filterHouse   !== "all" ? [{ label: houseMap.get(filterHouse) ?? filterHouse,       clear: () => { setFilterHouse("all");   setSortState([]); setPage(1); } }] : []),
    ...(filterYear    !== "all" ? [{ label: years.find((y: any) => y.id === filterYear)?.name ?? filterYear, clear: () => { setFilterYear("all"); setSortState([]); setPage(1); } }] : []),
  ];
  function clearAllFilters() {
    setSearchTerm(""); setFilterStatus("all"); setFilterClass("all");
    setFilterSection("all"); setFilterHouse("all"); setFilterYear("all"); setSortState([]); setPage(1);
  }

  // ─── Dashboard / Attendance short-circuit ─────────────────────────────────
  if (urlTab === "dashboard" || urlTab === "attendance") {
    const isAttendance = urlTab === "attendance";
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">Students</h1>
          <p className="text-muted-foreground mt-1">
            {isAttendance
              ? "Attendance — Mark and review daily cadet attendance by class."
              : "Dashboard — Enrolment overview, class and house distribution."}
          </p>
        </div>
        {isAttendance ? <StudentAttendanceTab /> : <StudentsDashboard />}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <DataTable
        tableId="ccm_students_v3"
        title="Students"
        subtitle={
          data ? (
            <span>
              Showing <strong>{((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, data.total)}</strong> of{" "}
              <strong>{data.total.toLocaleString()}</strong> enrolled cadets
            </span>
          ) : "Loading…"
        }
        action={
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" /> Enroll Student
          </Button>
        }
        filters={
          <Card className="border shadow-sm">
            <CardContent className="p-3 md:p-4">
              <div className="flex flex-col md:flex-row gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search name, Applicant ID, father…" className="pl-9 h-9"
                    value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setSortState([]); setPage(1); }} />
                </div>
                <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setSortState([]); setPage(1); }}>
                  <SelectTrigger className="w-full md:w-[150px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {STUDENT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterClass} onValueChange={(v) => { setFilterClass(v); setSortState([]); setPage(1); }}>
                  <SelectTrigger className="w-full md:w-[160px] h-9"><SelectValue placeholder="Class/Program" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes.map((c: any) => <SelectItem key={c.id} value={c.code}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterSection} onValueChange={(v) => { setFilterSection(v); setSortState([]); setPage(1); }}>
                  <SelectTrigger className="w-full md:w-[130px] h-9"><SelectValue placeholder="Section" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {sections.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterHouse} onValueChange={(v) => { setFilterHouse(v); setSortState([]); setPage(1); }}>
                  <SelectTrigger className="w-full md:w-[130px] h-9"><SelectValue placeholder="House" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Houses</SelectItem>
                    {houses.map((h: any) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterYear} onValueChange={(v) => { setFilterYear(v); setSortState([]); setPage(1); }}>
                  <SelectTrigger className="w-full md:w-[140px] h-9"><SelectValue placeholder="Year" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {years.map((y: any) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {filterChips.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={clearAllFilters}>
                    <X className="mr-1 h-3.5 w-3.5" /> Clear all
                  </Button>
                )}
              </div>
              {filterChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-border">
                  <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1"><Filter className="h-3 w-3" /> Active filters:</span>
                  {filterChips.map(chip => (
                    <button key={chip.label} onClick={chip.clear}
                      className="flex items-center gap-1 text-[11px] font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-full px-2.5 py-0.5 transition-colors">
                      {chip.label} <X className="h-2.5 w-2.5" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        }
        toolbarSlot={
          <DropdownMenu
            onOpenChange={(open) => {
              if (!open) { setSavingViewName(false); setViewNameInput(""); }
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-slate-600 text-xs">
                <BookmarkPlus className="h-3.5 w-3.5" />
                Views {savedViews.length > 0 && <span className="ml-0.5 text-blue-600">({savedViews.length})</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">Saved Views</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-sm cursor-pointer text-slate-500"
                onClick={() => { clearAllFilters(); }}>
                Reset filters
              </DropdownMenuItem>
              {savedViews.length > 0 && <DropdownMenuSeparator />}
              {savedViews.map((v) => (
                <div key={v.id} className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 rounded group">
                  <button className="text-sm text-left flex-1 truncate" onClick={() => loadView(v)}>{v.name}</button>
                  <button className="text-slate-300 hover:text-red-500 ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setSavedViews(savedViews.filter((sv) => sv.id !== v.id))}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <DropdownMenuSeparator />
              {savingViewName ? (
                <div className="px-2 py-1.5 flex gap-1.5">
                  <input autoFocus className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-400"
                    placeholder="View name…" value={viewNameInput}
                    onChange={(e) => setViewNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveCurrentView(); if (e.key === "Escape") setSavingViewName(false); }} />
                  <Button size="sm" className="h-6 text-xs px-2" onClick={saveCurrentView}>Save</Button>
                </div>
              ) : (
                <DropdownMenuItem className="text-sm cursor-pointer text-blue-600 font-medium"
                  onClick={(e) => { e.preventDefault(); setSavingViewName(true); setViewNameInput(""); }}>
                  + Save current view
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        }
        columns={columns}
        data={items}
        total={data?.total}
        isLoading={isLoading}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        sortState={sortState}
        onSortChange={(s) => { setSortState(s); setPage(1); }}
        onSaveRow={handleSaveRow}
        renderExpanded={(student, colSpan, onClose) => (
          <ExpandedRow
            student={student}
            colSpan={colSpan}
            sectionName={sectionMap.get(student.sectionId ?? "") ?? ""}
            houseName={houseMap.get(student.houseId ?? "") ?? ""}
            onClose={onClose}
            onDelete={() => deleteMutation.mutate({ id: student.id })}
          />
        )}
        bulkActions={(selectedIds, clearSelection) => (
          <>
            <Button size="sm" variant="outline" className="h-7 border-blue-200 text-blue-700 hover:bg-blue-100"
              onClick={() => { toast({ title: `${selectedIds.length} students marked active` }); clearSelection(); }}>
              <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Set Active
            </Button>
            <Button size="sm" variant="outline" className="h-7 border-blue-200 text-blue-700 hover:bg-blue-100"
              onClick={() => { toast({ title: `${selectedIds.length} students marked alumni` }); clearSelection(); }}>
              <GraduationCap className="mr-1.5 h-3.5 w-3.5" /> Set Alumni
            </Button>
          </>
        )}
        emptyIcon={<Users className="h-10 w-10 opacity-30" />}
        emptyTitle="No students found"
        emptyDescription={filterChips.length > 0 ? "Try adjusting your filters." : "Enroll the first cadet to get started."}
        emptyAction={filterChips.length === 0 ? (
          <Button size="sm" className="mt-2" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" /> Enroll Student
          </Button>
        ) : undefined}
        exportFilename="students"
        printTitle="Student Roster"
      />

      <StudentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editingStudent}
        onSaved={invalidate}
        classes={classes}
        sections={sections}
        houses={houses}
        years={years}
      />
    </>
  );
}
