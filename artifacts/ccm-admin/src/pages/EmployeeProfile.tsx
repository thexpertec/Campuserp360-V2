import { useState, useRef, useEffect } from "react";
import { formatDate, formatCurrency } from "@/lib/locale";
import { formatCnic, formatPhone } from "@/lib/format";
import { useParams, useLocation } from "wouter";
import {
  useGetAdminEmployee,
  getGetAdminEmployeeQueryKey,
  useGetAdminEmployeeByStaffId,
  getGetAdminEmployeeByStaffIdQueryKey,
  useUpdateAdminEmployee,
  useDeleteAdminEmployee,
  useCreateAdminEmployeeBankAccount,
  useUpdateAdminEmployeeBankAccount,
  useDeleteAdminEmployeeBankAccount,
  useCreateAdminEmployeeSalaryTransaction,
  useUpdateAdminEmployeeSalaryTransaction,
  useUploadAdminEmployeePhoto,
  useListAdminHrDepartments,
  useListAdminHrDesignations,
  useListAdminHrEmployeeSalaryTemplates,
  type EmployeeDetail,
  type EmployeeBankAccount,
  type EmployeeSalaryTransaction,
  type EmployeeSalaryTemplate,
} from "@workspace/api-client-react";
import { SalaryTemplateModal } from "@/pages/hr/SalaryTemplateModal";
import LedgerStatement from "@/components/LedgerStatement";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, User, Mail, Phone, MapPin, Briefcase,
  Building2, GraduationCap, Calendar, CreditCard, FileText,
  BadgeCheck, Edit3, Trash2, Plus, Check, X, Key,
  Upload, Star, AlertCircle, Loader2, ExternalLink,
  Wallet, Shield, Clock,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = ["director","admin","teacher","accountant","admission_officer","librarian","medical_officer","support"];
const ROLE_LABELS: Record<string, string> = {
  director: "Director", admin: "Admin", teacher: "Teacher", accountant: "Accountant",
  admission_officer: "Admission Officer", librarian: "Librarian",
  medical_officer: "Medical Officer", support: "Support Staff",
};

const ROLE_COLORS: Record<string, string> = {
  director: "bg-violet-100 text-violet-800", admin: "bg-indigo-100 text-indigo-800",
  teacher: "bg-sky-100 text-sky-800", accountant: "bg-emerald-100 text-emerald-800",
  admission_officer: "bg-amber-100 text-amber-800", librarian: "bg-teal-100 text-teal-800",
  medical_officer: "bg-rose-100 text-rose-800", support: "bg-slate-100 text-slate-700",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500", on_leave: "bg-amber-500",
  inactive: "bg-slate-400", terminated: "bg-red-500",
};

const TABS = [
  { key: "basic",  label: "Basic Details",  icon: User       },
  { key: "salary", label: "Salary",         icon: Wallet     },
  { key: "bank",   label: "Bank Account",   icon: CreditCard },
  { key: "docs",   label: "Documents",      icon: FileText   },
  { key: "ledger", label: "Ledger",         icon: FileText   },
] as const;

type TabKey = typeof TABS[number]["key"];

function fmt(n: number) { return formatCurrency(n); }

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: React.ElementType }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 text-slate-400 shrink-0" />}
        <p className="text-sm font-semibold text-slate-800 break-words">{value || <span className="text-slate-300 font-normal">—</span>}</p>
      </div>
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

// ─── Tab: Basic Details ───────────────────────────────────────────────────────

function TabBasic({ emp, onSaved }: { emp: EmployeeDetail; onSaved: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing]   = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [form, setForm]         = useState<Record<string, any>>({});
  const { data: depts = [] }    = useListAdminHrDepartments();
  const { data: desigs = [] }   = useListAdminHrDesignations();
  const updateMut               = useUpdateAdminEmployee();

  const filteredDesigs = (desigs as any[]).filter(
    (d: any) => !form.departmentId || !d.departmentId || d.departmentId === form.departmentId
  );

  function startEdit() {
    setForm({
      fullName: emp.fullName, fatherName: emp.fatherName ?? "",
      gender: emp.gender ?? "", religion: emp.religion ?? "", bloodGroup: emp.bloodGroup ?? "",
      dateOfBirth: emp.dateOfBirth ?? "", cnic: emp.cnic ?? "", email: emp.email ?? "",
      phone: emp.phone ?? "", presentAddress: emp.presentAddress ?? "",
      permanentAddress: emp.permanentAddress ?? "", role: emp.role,
      designationId: emp.designationId ?? "", departmentId: emp.departmentId ?? "",
      qualification: emp.qualification ?? "",
      experience: emp.experience ?? "", joiningDate: emp.joiningDate ?? "",
      contractType: emp.contractType ?? "permanent", status: emp.status,
      attendanceMode: emp.attendanceMode ?? "time_based",
      scheduledStartTime: emp.scheduledStartTime ?? "",
      scheduledEndTime: emp.scheduledEndTime ?? "",
      graceMinutes: emp.graceMinutes ?? "",
    });
    setEditing(true);
  }

  async function save() {
    try {
      const payload = { ...form };
      if (!payload.designationId) delete payload.designationId;
      if (!payload.departmentId)  delete payload.departmentId;
      // Scheduled hours only apply to time-based staff; clear the (nullable)
      // time columns for lecture-based. graceMinutes is NOT NULL DEFAULT 0, so
      // it must always be a number — never null — or validation rejects it.
      if (payload.attendanceMode === "lecture_based") {
        payload.scheduledStartTime = null;
        payload.scheduledEndTime = null;
        payload.graceMinutes = 0;
      } else {
        payload.scheduledStartTime = payload.scheduledStartTime || null;
        payload.scheduledEndTime = payload.scheduledEndTime || null;
        payload.graceMinutes = payload.graceMinutes === "" || payload.graceMinutes == null ? 0 : Number(payload.graceMinutes);
      }
      await updateMut.mutateAsync({ id: emp.id, data: payload as any });
      toast({ title: "Saved successfully" });
      setEditing(false);
      onSaved();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to save", description: (err as any)?.data?.error ?? (err as Error)?.message });
    }
  }

  function sf(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  if (editing) {
    return (
      <div className="rounded-2xl border border-border bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-slate-900">Edit Details</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="gap-1 h-8">
              <X className="h-3.5 w-3.5" />Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={updateMut.isPending} className="gap-1 h-8">
              {updateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Save
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EditField label="Full Name"><Input value={form.fullName} onChange={e => sf("fullName", e.target.value)} /></EditField>
          <EditField label="Father Name"><Input value={form.fatherName} onChange={e => sf("fatherName", e.target.value)} /></EditField>
          <EditField label="Role">
            <Select value={form.role} onValueChange={v => sf("role", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
            </Select>
          </EditField>
          <EditField label="Status">
            <Select value={form.status} onValueChange={v => sf("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["active","on_leave","inactive","terminated"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </EditField>
          <EditField label="Gender">
            <Select value={form.gender} onValueChange={v => sf("gender", v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent>
            </Select>
          </EditField>
          <EditField label="Date of Birth"><Input type="date" value={form.dateOfBirth} onChange={e => sf("dateOfBirth", e.target.value)} /></EditField>
          <EditField label="CNIC"><Input value={form.cnic} onChange={e => sf("cnic", formatCnic(e.target.value))} placeholder="35201-1234567-1" maxLength={15} /></EditField>
          <EditField label="Religion"><Input value={form.religion} onChange={e => sf("religion", e.target.value)} /></EditField>
          <EditField label="Blood Group">
            <Select value={form.bloodGroup} onValueChange={v => sf("bloodGroup", v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>{["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}</SelectContent>
            </Select>
          </EditField>
          <EditField label="Joining Date"><Input type="date" value={form.joiningDate} onChange={e => sf("joiningDate", e.target.value)} /></EditField>
          <EditField label="Contract Type">
            <Select value={form.contractType} onValueChange={v => sf("contractType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="permanent">Permanent</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="visiting">Visiting</SelectItem>
              </SelectContent>
            </Select>
          </EditField>
          <EditField label="Email"><Input type="email" value={form.email} onChange={e => sf("email", e.target.value)} /></EditField>
          <EditField label="Phone"><Input value={form.phone} onChange={e => sf("phone", formatPhone(e.target.value))} placeholder="0300-1234567" maxLength={12} /></EditField>
          <EditField label="Qualification"><Input value={form.qualification} onChange={e => sf("qualification", e.target.value)} /></EditField>
          <EditField label="Experience"><Input value={form.experience} onChange={e => sf("experience", e.target.value)} /></EditField>
          <EditField label="Department">
            <Select value={form.departmentId || "__none__"} onValueChange={v => { sf("departmentId", v === "__none__" ? "" : v); sf("designationId", ""); }}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {(depts as any[]).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </EditField>
          <EditField label="Designation">
            <Select value={form.designationId || "__none__"} onValueChange={v => sf("designationId", v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {filteredDesigs.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </EditField>
          <EditField label="Attendance Mode">
            <Select value={form.attendanceMode || "time_based"} onValueChange={v => sf("attendanceMode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="time_based">Time-based (clock in/out)</SelectItem>
                <SelectItem value="lecture_based">Lecture-based (per timetable)</SelectItem>
              </SelectContent>
            </Select>
          </EditField>
          {form.attendanceMode !== "lecture_based" ? (
            <>
              <EditField label="Scheduled Start"><Input type="time" value={form.scheduledStartTime} onChange={e => sf("scheduledStartTime", e.target.value)} /></EditField>
              <EditField label="Scheduled End"><Input type="time" value={form.scheduledEndTime} onChange={e => sf("scheduledEndTime", e.target.value)} /></EditField>
              <EditField label="Grace (minutes)"><Input type="number" min={0} value={form.graceMinutes} onChange={e => sf("graceMinutes", e.target.value)} placeholder="0" /></EditField>
            </>
          ) : (
            <div className="sm:col-span-2 flex items-end">
              <p className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-3 py-2">
                Marked per scheduled lecture from the timetable, rolled up to a daily total.
              </p>
            </div>
          )}
          <div className="col-span-full space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">Present Address</Label>
            <Input value={form.presentAddress} onChange={e => sf("presentAddress", e.target.value)} />
          </div>
          <div className="col-span-full space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">Permanent Address</Label>
            <Input value={form.permanentAddress} onChange={e => sf("permanentAddress", e.target.value)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-slate-50">
          <h3 className="font-extrabold text-slate-800 text-sm">Personal Information</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setAuthOpen(true)}>
              <Key className="h-3 w-3" />Authentication
            </Button>
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={startEdit}>
              <Edit3 className="h-3 w-3" />Edit
            </Button>
          </div>
        </div>
        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          <Field label="Full Name"    value={emp.fullName}     />
          <Field label="Father Name"  value={emp.fatherName}   />
          <Field label="Gender"       value={emp.gender}       />
          <Field label="Date of Birth" value={emp.dateOfBirth} icon={Calendar} />
          <Field label="CNIC"         value={emp.cnic}         icon={BadgeCheck} />
          <Field label="Religion"     value={emp.religion}     />
          <Field label="Blood Group"  value={emp.bloodGroup}   />
          <Field label="Nationality"  value={emp.nationality}  />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-slate-50">
          <h3 className="font-extrabold text-slate-800 text-sm">Professional Information</h3>
        </div>
        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          <Field label="Role"           value={ROLE_LABELS[emp.role] ?? emp.role}  icon={Briefcase} />
          <Field label="Designation"    value={emp.designationName}    />
          <Field label="Department"     value={emp.departmentName}     icon={Building2} />
          <Field label="Salary Grade"   value={emp.salaryGradeName}    />
          <Field label="Qualification"  value={emp.qualification}      icon={GraduationCap} />
          <Field label="Experience"     value={emp.experience}         />
          <Field label="Joining Date"   value={emp.joiningDate}        icon={Calendar} />
          <Field label="Contract Type"  value={emp.contractType}       />
          <Field label="Status"         value={emp.status}             />
          <Field label="Staff ID"       value={emp.staffId}            />
          <Field label="Username"       value={emp.username}           icon={Shield} />
          <Field label="Attendance Mode" value={emp.attendanceMode === "lecture_based" ? "Lecture-based" : "Time-based"} />
          {emp.attendanceMode !== "lecture_based" && (
            <Field label="Work Hours"
              value={emp.scheduledStartTime && emp.scheduledEndTime
                ? `${emp.scheduledStartTime}–${emp.scheduledEndTime}${emp.graceMinutes ? ` · +${emp.graceMinutes}m grace` : ""}`
                : undefined} />
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-slate-50">
          <h3 className="font-extrabold text-slate-800 text-sm">Contact Information</h3>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Email"             value={emp.email}            icon={Mail}    />
          <Field label="Phone"             value={emp.phone}            icon={Phone}   />
          <Field label="Present Address"   value={emp.presentAddress}   icon={MapPin}  />
          <Field label="Permanent Address" value={emp.permanentAddress} icon={MapPin}  />
        </div>
      </div>

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} emp={emp} onSaved={onSaved} />
    </div>
  );
}

// ─── Auth dialog ──────────────────────────────────────────────────────────────

function AuthDialog({ open, onClose, emp, onSaved }: { open: boolean; onClose: () => void; emp: EmployeeDetail; onSaved: () => void }) {
  const { toast } = useToast();
  const [username, setUsername] = useState(emp.username ?? "");
  const [password, setPassword] = useState("");
  const updateMut = useUpdateAdminEmployee();

  async function save() {
    if (!username.trim()) { toast({ variant: "destructive", title: "Username required" }); return; }
    try {
      const payload: any = { username };
      if (password) payload.passwordHash = password; // API should hash it
      await updateMut.mutateAsync({ id: emp.id, data: payload });
      toast({ title: "Auth credentials updated" });
      onSaved();
      onClose();
    } catch (err) { toast({ variant: "destructive", title: "Failed to update auth", description: (err as any)?.data?.error ?? (err as Error)?.message }); }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Authentication</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="staff.username" />
          </div>
          <div className="space-y-1.5">
            <Label>New Password <span className="text-slate-400 font-normal text-xs">(leave blank to keep)</span></Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={updateMut.isPending}>
            {updateMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab: Salary ──────────────────────────────────────────────────────────────

function TabSalary({ emp, onSaved }: { emp: EmployeeDetail; onSaved: () => void }) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editTx, setEditTx]   = useState<EmployeeSalaryTransaction | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [form, setForm]       = useState({ month: "", basicSalary: 0, allowances: 0, deductions: 0, status: "pending", remarks: "" });
  const createMut = useCreateAdminEmployeeSalaryTransaction();
  const updateMut = useUpdateAdminEmployeeSalaryTransaction();

  const { data: templatesData } = useListAdminHrEmployeeSalaryTemplates();
  const tpl = ((templatesData ?? []) as EmployeeSalaryTemplate[]).find(t => t.employeeId === emp.id) ?? null;
  const tplItems = tpl?.items ?? [];
  const tplIncentives = tplItems.filter(i => i.itemType === "incentive");
  const tplDeductions = tplItems.filter(i => i.itemType === "deduction");
  const tplIncTotal = tplIncentives.reduce((s, i) => s + (i.calculationType === "percentage" ? Math.round((tpl?.basicSalary ?? 0) * i.value / 100) : i.value), 0);
  const tplDedTotal = tplDeductions.reduce((s, i) => s + (i.calculationType === "percentage" ? Math.round((tpl?.basicSalary ?? 0) * i.value / 100) : i.value), 0);
  const tplNet = (tpl?.basicSalary ?? 0) + tplIncTotal - tplDedTotal;

  const txs = emp.salaryTransactions ?? [];
  const totalPaid = txs.filter(t => t.status === "paid").reduce((s, t) => s + (t.amountPaid ?? t.netSalary), 0);
  const totalPending = txs.reduce((s, t) => {
    if (t.status !== "paid") return s + t.netSalary;
    const paid = t.amountPaid ?? t.netSalary;
    return s + Math.max(t.netSalary - paid, 0);
  }, 0);

  function sf(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  async function submitAdd() {
    if (!form.month) { toast({ variant: "destructive", title: "Month required" }); return; }
    try {
      await createMut.mutateAsync({ id: emp.id, data: { ...form, basicSalary: Number(form.basicSalary), allowances: Number(form.allowances), deductions: Number(form.deductions) } });
      toast({ title: "Transaction added" });
      setAddOpen(false);
      setForm({ month: "", basicSalary: 0, allowances: 0, deductions: 0, status: "pending", remarks: "" });
      onSaved();
    } catch (err) { toast({ variant: "destructive", title: "Failed to add transaction", description: (err as any)?.data?.error ?? (err as Error)?.message }); }
  }

  return (
    <div className="space-y-4">
      {/* Salary configuration */}
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-slate-50">
          <h3 className="font-extrabold text-slate-800 text-sm">Salary Configuration</h3>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setTplOpen(true)}>
            <Edit3 className="h-3.5 w-3.5" />{tpl ? "Edit Salary" : "Define Salary"}
          </Button>
        </div>
        {!tpl ? (
          <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <Wallet className="h-8 w-8 opacity-20" />
            <p className="text-sm font-medium">No salary defined yet</p>
            <p className="text-xs text-slate-400">Define this employee's basic salary, incentives, deductions and leave rules.</p>
            <Button size="sm" variant="outline" className="gap-1.5 mt-1" onClick={() => setTplOpen(true)}>
              <Plus className="h-3.5 w-3.5" />Define Salary
            </Button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Basic Salary</p>
                <p className="text-lg font-extrabold text-slate-900 mt-0.5">{fmt(tpl.basicSalary)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Incentives</p>
                <p className="text-lg font-extrabold text-emerald-700 mt-0.5">{tplIncTotal > 0 ? `+${fmt(tplIncTotal)}` : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deductions</p>
                <p className="text-lg font-extrabold text-red-600 mt-0.5">{tplDedTotal > 0 ? `−${fmt(tplDedTotal)}` : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Net Salary</p>
                <p className="text-lg font-extrabold text-slate-900 mt-0.5">{fmt(tplNet)}</p>
              </div>
            </div>
            {(tplIncentives.length > 0 || tplDeductions.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {tplIncentives.map(i => (
                  <span key={i.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 text-[11px] font-semibold">
                    +{i.name}: {i.calculationType === "percentage" ? `${i.value}%` : fmt(i.value)}
                  </span>
                ))}
                {tplDeductions.map(i => (
                  <span key={i.id} className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 text-[11px] font-semibold">
                    −{i.name}: {i.calculationType === "percentage" ? `${i.value}%` : fmt(i.value)}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Leave deductions: <strong className="text-slate-700">{tpl.leaveDeductEnabled ? "On" : "Off"}</strong>
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Short-leave deductions: <strong className="text-slate-700">{tpl.shortLeaveEnabled ? "On" : "Off"}</strong>
              </span>
              {tpl.effectiveFrom && <span>Effective from <strong className="text-slate-700">{tpl.effectiveFrom}</strong></span>}
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                tpl.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                {tpl.active ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-white shadow-sm p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Paid (24 mo)</p>
          <p className="text-lg font-extrabold text-emerald-700 mt-1">{fmt(totalPaid)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white shadow-sm p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Outstanding</p>
          <p className={cn("text-lg font-extrabold mt-1", totalPending > 0 ? "text-amber-700" : "text-slate-400")}>{fmt(totalPending)}</p>
        </div>
      </div>

      {/* Transactions */}
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-slate-50">
          <h3 className="font-extrabold text-slate-800 text-sm">Salary Transactions</h3>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" />Add
          </Button>
        </div>
        {txs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No salary records yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 border-b border-border">
                {["Month","Basic","Allowances","Deductions","Net Salary","Amount Paid","Status","Paid On",""].map((h,i) => (
                  <th key={i} className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {txs.map(tx => (
                <tr key={tx.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-bold text-slate-800">{tx.month}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{fmt(tx.basicSalary)}</td>
                  <td className="px-4 py-3 font-mono text-emerald-700">+{fmt(tx.allowances)}</td>
                  <td className="px-4 py-3 font-mono text-red-600">-{fmt(tx.deductions)}</td>
                  <td className="px-4 py-3 font-mono font-extrabold text-slate-900">{fmt(tx.netSalary)}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">
                    {tx.status === "paid" ? (
                      tx.amountPaid != null && tx.amountPaid < tx.netSalary
                        ? <span className="text-amber-700 font-semibold">{fmt(tx.amountPaid)} <span className="text-[10px] font-normal">(partial)</span></span>
                        : fmt(tx.amountPaid ?? tx.netSalary)
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      tx.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{tx.paidAt ? formatDate(tx.paidAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add transaction dialog */}
      <Dialog open={addOpen} onOpenChange={v => { if (!v) setAddOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Salary Transaction</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Month *</Label>
              <Input type="month" value={form.month} onChange={e => sf("month", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Basic Salary</Label>
              <Input type="number" min={0} value={form.basicSalary} onChange={e => sf("basicSalary", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Allowances</Label>
              <Input type="number" min={0} value={form.allowances} onChange={e => sf("allowances", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Deductions</Label>
              <Input type="number" min={0} value={form.deductions} onChange={e => sf("deductions", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => sf("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Net (auto-calculated)</Label>
              <p className="text-sm font-bold text-slate-800 h-9 flex items-center">{fmt(Number(form.basicSalary) + Number(form.allowances) - Number(form.deductions))}</p>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Remarks</Label>
              <Input value={form.remarks} onChange={e => sf("remarks", e.target.value)} placeholder="Optional note…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitAdd} disabled={createMut.isPending}>{createMut.isPending ? "Saving…" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Salary configuration editor */}
      {tplOpen && (
        <SalaryTemplateModal
          employee={{ id: emp.id, staffId: emp.staffId, fullName: emp.fullName, role: emp.role }}
          editing={tpl}
          onClose={() => setTplOpen(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

// ─── Tab: Bank Account ────────────────────────────────────────────────────────

function TabBank({ emp, onSaved }: { emp: EmployeeDetail; onSaved: () => void }) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ bankName: "", branchName: "", accountTitle: "", accountNumber: "", iban: "", isPrimary: false });
  const createMut = useCreateAdminEmployeeBankAccount();
  const deleteMut = useDeleteAdminEmployeeBankAccount();

  const accounts = emp.bankAccounts ?? [];
  function sf(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  async function addAccount() {
    if (!form.bankName || !form.accountNumber) { toast({ variant: "destructive", title: "Bank name and account number required" }); return; }
    try {
      await createMut.mutateAsync({ id: emp.id, data: form });
      toast({ title: "Bank account added" });
      setAddOpen(false);
      setForm({ bankName: "", branchName: "", accountTitle: "", accountNumber: "", iban: "", isPrimary: false });
      onSaved();
    } catch (err) { toast({ variant: "destructive", title: "Failed to add bank account", description: (err as any)?.data?.error ?? (err as Error)?.message }); }
  }

  async function removeAccount(accId: string) {
    if (!confirm("Remove this bank account?")) return;
    try {
      await deleteMut.mutateAsync({ id: emp.id, accId });
      toast({ title: "Removed" });
      onSaved();
    } catch (err) { toast({ variant: "destructive", title: "Failed to remove bank account", description: (err as any)?.data?.error ?? (err as Error)?.message }); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-slate-50">
          <h3 className="font-extrabold text-slate-800 text-sm">Bank Accounts</h3>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" />Add Account
          </Button>
        </div>
        {accounts.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
            <CreditCard className="h-8 w-8 opacity-20" />
            <p className="text-sm font-medium">No bank accounts added</p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" />Add First Account
            </Button>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {accounts.map(acc => (
              <div key={acc.id} className={cn(
                "rounded-xl border p-4 relative",
                acc.isPrimary ? "border-indigo-300 bg-indigo-50/40" : "border-border bg-white"
              )}>
                {acc.isPrimary && (
                  <span className="absolute top-3 right-10 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 uppercase">
                    <Star className="h-3 w-3" />Primary
                  </span>
                )}
                <button className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                  onClick={() => removeAccount(acc.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <div className="space-y-2 pr-8">
                  <p className="font-extrabold text-slate-900">{acc.bankName}</p>
                  {acc.branchName && <p className="text-xs text-slate-500">{acc.branchName}</p>}
                  {acc.accountTitle && <p className="text-sm text-slate-600 font-semibold">{acc.accountTitle}</p>}
                  <p className="font-mono text-sm font-bold tracking-wider text-slate-800">{acc.accountNumber}</p>
                  {acc.iban && <p className="font-mono text-xs text-slate-500">{acc.iban}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={v => { if (!v) setAddOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Bank Account</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Bank Name *</Label><Input value={form.bankName} onChange={e => sf("bankName", e.target.value)} placeholder="HBL, UBL, MCB…" /></div>
            <div className="space-y-1.5"><Label>Branch Name</Label><Input value={form.branchName} onChange={e => sf("branchName", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Account Title</Label><Input value={form.accountTitle} onChange={e => sf("accountTitle", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Account Number *</Label><Input value={form.accountNumber} onChange={e => sf("accountNumber", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>IBAN</Label><Input value={form.iban} onChange={e => sf("iban", e.target.value)} placeholder="PK36SCBL0000001123456702" /></div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isPrimary} onChange={e => sf("isPrimary", e.target.checked)} className="h-4 w-4 rounded border-border" />
              <span className="text-sm font-medium text-slate-700">Set as primary account</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addAccount} disabled={createMut.isPending}>{createMut.isPending ? "Saving…" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab: Documents ───────────────────────────────────────────────────────────

const DOC_TYPES = [
  { value: "cnic_front",        label: "CNIC Front"         },
  { value: "cnic_back",         label: "CNIC Back"          },
  { value: "degree",            label: "Degree / Certificate" },
  { value: "experience_letter", label: "Experience Letter"  },
  { value: "other",             label: "Other"              },
];
const DOC_LABEL_MAP: Record<string, string> = Object.fromEntries(DOC_TYPES.map(d => [d.value, d.label]));

function TabDocuments({ emp, onSaved }: { emp: EmployeeDetail; onSaved: () => void }) {
  const { toast }  = useToast();
  const docs       = (emp as any).documents ?? [];
  const fileRef    = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType]     = useState("other");
  const [docLabel, setDocLabel]   = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const token = (await import("@/lib/auth")).getToken();
        const res = await fetch(`/api/admin/employees/${emp.id}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ fileBase64: base64, fileName: file.name, docType, docLabel: docLabel.trim() || undefined }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Upload failed"); }
        toast({ title: "Document uploaded" });
        onSaved();
        setDocLabel("");
        if (fileRef.current) fileRef.current.value = "";
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message ?? "Upload failed" });
      setUploading(false);
    }
  }

  async function removeDoc(docId: string, filename: string) {
    if (!confirm(`Remove document "${filename}"?`)) return;
    try {
      const token = (await import("@/lib/auth")).getToken();
      const res = await fetch(`/api/admin/employees/${emp.id}/documents/${docId}`, {
        method: "DELETE",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error("Delete failed");
      toast({ title: "Document removed" });
      onSaved();
    } catch {
      toast({ variant: "destructive", title: "Failed to remove document" });
    }
  }

  return (
    <div className="space-y-4">
      {/* Upload panel */}
      <div className="rounded-2xl border border-border bg-white shadow-sm p-5">
        <h3 className="font-extrabold text-slate-800 text-sm mb-4">Upload Document</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1.5 w-44">
            <Label className="text-xs">Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 flex-1 min-w-[160px]">
            <Label className="text-xs">Custom Label <span className="text-slate-400">(optional)</span></Label>
            <input
              value={docLabel}
              onChange={e => setDocLabel(e.target.value)}
              placeholder="e.g. Matric Certificate 2019"
              className="h-8 w-full rounded-md border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-white"
            />
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-xs shrink-0" disabled={uploading}
            onClick={() => fileRef.current?.click()}>
            {uploading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Uploading…" : "Choose File"}
          </Button>
          <input ref={fileRef} type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
            className="hidden" onChange={handleFile} />
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Accepted: PDF, JPG, PNG, WEBP, DOC, DOCX (max 10 MB)</p>
      </div>

      {/* Documents list */}
      {docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
          <FileText className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">No documents uploaded yet</p>
          <p className="text-xs text-slate-400">Use the panel above to upload the first document.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {docs.map((doc: any) => (
            <div key={doc.id} className="rounded-2xl border border-border bg-white shadow-sm p-4 flex items-center gap-3 group">
              <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-indigo-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-800 text-sm truncate">
                  {doc.docLabel || DOC_LABEL_MAP[doc.docType] || doc.docType}
                </p>
                <p className="text-xs text-slate-400">{formatDate(doc.uploadedAt)}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a href={`/api/admin/employees/${emp.id}/documents/${doc.id}/download?token=${encodeURIComponent(getToken() ?? "")}`} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button onClick={() => removeDoc(doc.id, doc.filename ?? doc.docType)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Photo upload ─────────────────────────────────────────────────────────────

function PhotoSection({ emp, onSaved }: { emp: EmployeeDetail; onSaved: () => void }) {
  const { toast } = useToast();
  const fileRef    = useRef<HTMLInputElement>(null);
  const uploadMut  = useUploadAdminEmployeePhoto();
  const [loading, setLoading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        await uploadMut.mutateAsync({ id: emp.id, data: { fileBase64: base64, fileName: file.name } });
        toast({ title: "Photo updated" });
        onSaved();
        setLoading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast({ variant: "destructive", title: "Upload failed" });
      setLoading(false);
    }
  }

  const colorIdx = (emp.fullName.charCodeAt(0) ?? 0) % 6;
  const avatarColors = [
    "bg-indigo-200 text-indigo-800", "bg-sky-200 text-sky-800",
    "bg-emerald-200 text-emerald-800", "bg-violet-200 text-violet-800",
    "bg-rose-200 text-rose-800", "bg-amber-200 text-amber-800",
  ];

  return (
    <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
      <div className="h-28 w-28 rounded-2xl flex items-center justify-center text-4xl font-extrabold shadow-lg border-4 border-white ring-2 ring-white/40 overflow-hidden"
        style={{ background: "rgba(255,255,255,0.15)" }}>
        {emp.photoFilename && (
          <img
            src={emp.photoFilename?.startsWith("http") || emp.photoFilename?.startsWith("/") ? emp.photoFilename : `/uploads/employees/${emp.photoFilename}`}
            alt="photo"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
              (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex");
            }}
          />
        )}
        <span
          className="text-white text-3xl font-extrabold drop-shadow"
          style={{ display: emp.photoFilename ? "none" : "flex" }}
        >
          {emp.fullName[0]}
        </span>
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
          {loading ? <Loader2 className="h-6 w-6 text-white animate-spin" /> : <Upload className="h-6 w-6 text-white" />}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ─── Profile hero ─────────────────────────────────────────────────────────────

function ProfileHero({ emp, onSaved }: { emp: EmployeeDetail; onSaved: () => void }) {
  const statusDot = STATUS_COLORS[emp.status] ?? "bg-slate-400";

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-lg">
      {/* Gradient banner */}
      <div className="h-36 w-full bg-gradient-to-r from-slate-800 via-indigo-900 to-slate-900" />

      {/* Bottom content */}
      <div className="bg-white border border-border border-t-0 rounded-b-2xl px-6 pb-5">
        <div className="flex items-end gap-5 -mt-14">
          <PhotoSection emp={emp} onSaved={onSaved} />
          <div className="pb-3 min-w-0 flex-1">
            <div className="flex items-start gap-3 flex-wrap">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900 leading-tight">
                  {emp.fullName}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {emp.designationName ?? ROLE_LABELS[emp.role] ?? emp.role}
                  {emp.departmentName ? ` · ${emp.departmentName}` : ""}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide",
                  ROLE_COLORS[emp.role] ?? "bg-slate-100 text-slate-600")}>
                  {ROLE_LABELS[emp.role] ?? emp.role}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-slate-100 text-slate-700">
                  <span className={cn("h-2 w-2 rounded-full", statusDot)} />
                  {emp.status.replace("_", " ")}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-indigo-600 bg-indigo-50 rounded-lg px-2.5 py-1">
                {emp.staffId}
              </span>
              {emp.email && (
                <a href={`mailto:${emp.email}`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 transition-colors">
                  <Mail className="h-3 w-3" />{emp.email}
                </a>
              )}
              {emp.phone && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Phone className="h-3 w-3" />{emp.phone}
                </span>
              )}
              {emp.joiningDate && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Calendar className="h-3 w-3" />Joined {emp.joiningDate}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EmployeeProfile() {
  const { staffId } = useParams<{ staffId: string }>();
  const [, nav]     = useLocation();
  const { toast }   = useToast();
  const qc          = useQueryClient();
  const [tab, setTab] = useState<TabKey>(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    return (q === "basic" || q === "salary" || q === "bank" || q === "docs" || q === "ledger" ? q : "basic") as TabKey;
  });

  // Detect legacy UUID bookmarks and redirect to clean staff-ID URL
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staffId ?? "");

  // Normal path: look up by staff ID (generated hook auto-attaches auth token)
  const { data: empByStaff, isLoading: staffLoading, error: staffError } = useGetAdminEmployeeByStaffId(staffId!, {
    query: { enabled: !!staffId && !isUUID, queryKey: getGetAdminEmployeeByStaffIdQueryKey(staffId!) },
  });

  // Legacy UUID path: fetch by ID to discover the staff ID, then redirect
  const { data: legacyEmp } = useGetAdminEmployee(isUUID ? staffId! : "", {
    query: {
      enabled: !!staffId && isUUID,
      queryKey: getGetAdminEmployeeQueryKey(isUUID ? staffId! : ""),
    },
  });
  useEffect(() => {
    const sid = (legacyEmp as EmployeeDetail | undefined)?.staffId;
    if (isUUID && sid) nav(`/employees/${sid}`);
  }, [isUUID, (legacyEmp as EmployeeDetail | undefined)?.staffId]);

  const emp  = isUUID ? undefined : empByStaff;
  const id   = emp?.id ?? "";
  const isLoading = isUUID || staffLoading;
  const error = staffError;

  const deleteMut = useDeleteAdminEmployee();

  function refresh() { qc.invalidateQueries({ queryKey: ["employee-by-staff-id", staffId] }); }

  async function handleDelete() {
    if (!confirm(`Delete ${emp?.fullName}? This cannot be undone.`)) return;
    try {
      await deleteMut.mutateAsync({ id: id! });
      toast({ title: "Employee deleted" });
      nav("/employees");
    } catch { toast({ variant: "destructive", title: "Failed to delete" }); }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error || !emp) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
        <AlertCircle className="h-10 w-10 opacity-30" />
        <p className="font-semibold">Employee not found</p>
        <Button variant="outline" size="sm" onClick={() => nav("/employees")}>
          <ChevronLeft className="h-4 w-4 mr-1" />Back to Directory
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={() => nav("/employees")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors font-semibold">
          <ChevronLeft className="h-4 w-4" />Staff Directory
        </button>
        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleteMut.isPending}
          className="h-8 gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50">
          <Trash2 className="h-3.5 w-3.5" />Delete Employee
        </Button>
      </div>

      {/* Hero */}
      <ProfileHero emp={emp} onSaved={refresh} />

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap -mb-px",
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700",
            )}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div className="pb-8">
        {tab === "basic"   && <TabBasic    emp={emp} onSaved={refresh} />}
        {tab === "salary"  && <TabSalary   emp={emp} onSaved={refresh} />}
        {tab === "bank"    && <TabBank     emp={emp} onSaved={refresh} />}
        {tab === "docs"    && <TabDocuments emp={emp} onSaved={refresh} />}
        {tab === "ledger"  && (
          emp.coaId ? (
            <LedgerStatement
              coaId={emp.coaId}
              title={`Employee Ledger — ${emp.fullName}`}
              headerFields={[
                { label: "Staff ID", value: emp.staffId ?? "—" },
                { label: "Designation", value: (emp as any).designationName ?? "—" },
                { label: "Department", value: (emp as any).departmentName ?? "—" },
              ]}
              emptyStateHint="This employee has no linked ledger account yet."
            />
          ) : (
            <div className="rounded-2xl border border-border bg-white shadow-sm p-8 text-center text-sm text-muted-foreground">
              No ledger account is linked to this employee yet.
            </div>
          )
        )}
      </div>
    </div>
  );
}
