import { useState, useEffect, useMemo, useRef } from "react";
import { formatCnic, formatPhone } from "@/lib/format";
import { useLocation } from "wouter";
import {
  useListAdminEmployees,
  getListAdminEmployeesQueryKey,
  useCreateAdminEmployee,
  useListAdminHrDepartments,
  useListAdminHrDesignations,
  type EmployeeListRow,
  type EmployeeInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Minus, Briefcase, Loader2 } from "lucide-react";
import { DataTable, type ColDef } from "@/components/DataTable";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = [
  { key: "all",               label: "All" },
  { key: "director",          label: "Director" },
  { key: "admin",             label: "Admin" },
  { key: "teacher",           label: "Teacher" },
  { key: "accountant",        label: "Accountant" },
  { key: "admission_officer", label: "Admission Officer" },
  { key: "librarian",         label: "Librarian" },
  { key: "medical_officer",   label: "Medical Officer" },
  { key: "support",           label: "Support Staff" },
];

const ROLE_COLORS: Record<string, string> = {
  director:          "bg-violet-100 text-violet-700",
  admin:             "bg-indigo-100 text-indigo-700",
  teacher:           "bg-sky-100 text-sky-700",
  accountant:        "bg-emerald-100 text-emerald-700",
  admission_officer: "bg-amber-100 text-amber-700",
  librarian:         "bg-teal-100 text-teal-700",
  medical_officer:   "bg-rose-100 text-rose-700",
  support:           "bg-slate-100 text-slate-600",
};

const STATUS_META: Record<string, { label: string; classes: string }> = {
  active:     { label: "Active",      classes: "bg-emerald-100 text-emerald-700" },
  on_leave:   { label: "On Leave",    classes: "bg-amber-100 text-amber-700"    },
  inactive:   { label: "Inactive",    classes: "bg-slate-100 text-slate-500"    },
  terminated: { label: "Terminated",  classes: "bg-red-100 text-red-700"        },
};

const PAGE_SIZE = 25;

// ─── Avatar ───────────────────────────────────────────────────────────────────

function EmployeeAvatar({ emp }: { emp: EmployeeListRow }) {
  const colorIdx = (emp.fullName.charCodeAt(0) ?? 0) % 6;
  const colors = [
    "bg-indigo-100 text-indigo-700", "bg-sky-100 text-sky-700",
    "bg-emerald-100 text-emerald-700", "bg-violet-100 text-violet-700",
    "bg-rose-100 text-rose-700", "bg-amber-100 text-amber-700",
  ];
  return (
    <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0", colors[colorIdx])}>
      {emp.fullName[0]}
    </div>
  );
}

// ─── Add Employee modal ───────────────────────────────────────────────────────

type EmpRow = {
  _rowId: string;
  fullName: string;
  cnic: string;
  phone: string;
  email: string;
  gender: string;
  dateOfBirth: string;
  qualification: string;
};

function mkEmpRow(): EmpRow {
  return { _rowId: crypto.randomUUID(), fullName: "", cnic: "", phone: "", email: "", gender: "", dateOfBirth: "", qualification: "" };
}

function AddEmployeeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: depts = [] }  = useListAdminHrDepartments();
  const { data: desigs = [] } = useListAdminHrDesignations();
  const createMut = useCreateAdminEmployee();

  const [role, setRole]       = useState("teacher");
  const [deptId, setDeptId]   = useState("");
  const [desigId, setDesigId] = useState("");

  const filteredDesigs = useMemo(() =>
    (desigs as any[]).filter((d: any) => !deptId || !d.departmentId || d.departmentId === deptId),
    [desigs, deptId]
  );
  const [contractType, setCT] = useState("permanent");
  const [joiningDate, setJD]  = useState(new Date().toISOString().slice(0, 10));
  const [attendanceMode, setAttMode] = useState("time_based");
  const [rows, setRows]       = useState<EmpRow[]>([mkEmpRow()]);
  const [busy, setBusy]       = useState(false);
  const gridRef               = useRef<HTMLDivElement>(null);

  function reset() {
    setRole("teacher"); setDeptId(""); setDesigId(""); setCT("permanent");
    setJD(new Date().toISOString().slice(0, 10)); setRows([mkEmpRow()]);
    setAttMode("time_based");
  }
  function upd(rowId: string, k: keyof EmpRow, v: string) {
    setRows(p => p.map(r => r._rowId === rowId ? { ...r, [k]: v } : r));
  }
  function addRow() { setRows(p => [...p, mkEmpRow()]); }
  function removeRow(rowId: string) { setRows(p => p.length > 1 ? p.filter(r => r._rowId !== rowId) : p); }
  function focusCell(ri: number, ci: number) {
    gridRef.current?.querySelector<HTMLElement>(`[data-r="${ri}"][data-c="${ci}"]`)?.focus();
  }
  function nav(e: React.KeyboardEvent, ri: number, ci: number) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (ri === rows.length - 1) { addRow(); setTimeout(() => focusCell(ri + 1, ci), 20); } else focusCell(ri + 1, ci); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (ri > 0) focusCell(ri - 1, ci); }
    else if (e.key === "Enter") { e.preventDefault(); if (ri === rows.length - 1) { addRow(); setTimeout(() => focusCell(ri + 1, 0), 20); } else focusCell(ri + 1, 0); }
  }

  async function submit() {
    const valid = rows.filter(r => r.fullName.trim());
    if (!valid.length) { toast({ variant: "destructive", title: "Full name required for at least one row" }); return; }
    setBusy(true);
    try {
      for (const row of valid) {
        await createMut.mutateAsync({
          data: {
            fullName: row.fullName.trim(),
            cnic: row.cnic.trim() || undefined, phone: row.phone.trim() || undefined,
            email: row.email.trim() || undefined, gender: row.gender || undefined,
            dateOfBirth: row.dateOfBirth || undefined, qualification: row.qualification.trim() || undefined,
            role, departmentId: deptId || undefined, designationId: desigId || undefined,
            contractType: contractType as any, joiningDate: joiningDate || undefined,
            attendanceMode: attendanceMode as any,
          },
        });
      }
      toast({ title: `${valid.length} employee${valid.length > 1 ? "s" : ""} added` });
      await qc.invalidateQueries({ queryKey: getListAdminEmployeesQueryKey() });
      reset(); onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? "Failed to save employees";
      toast({ variant: "destructive", title: "Failed to save employees", description: msg !== "Failed to save employees" ? msg : undefined });
    } finally { setBusy(false); }
  }

  const cell = "w-full h-9 px-2.5 text-sm bg-transparent border-0 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 transition-colors placeholder:text-slate-300";
  const ready = rows.filter(r => r.fullName.trim()).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-[1120px] w-[96vw] p-0 gap-0 overflow-hidden">

        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Add Employees</h2>
            <p className="text-sm text-slate-500 mt-0.5">Set shared defaults at top, then fill per-employee details in the grid.</p>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-1.5 font-mono shrink-0 ml-4">
            <span className="bg-white border border-slate-200 rounded px-1 py-0.5">↑↓</span> rows &nbsp;
            <span className="bg-white border border-slate-200 rounded px-1 py-0.5">Tab</span> columns &nbsp;
            <span className="bg-white border border-slate-200 rounded px-1 py-0.5">Enter</span> next row
          </div>
        </div>

        {/* Shared defaults header */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/60">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Shared Defaults (applies to all rows)</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 mb-1">Role</p>
              <select value={role} onChange={e => setRole(e.target.value)}
                className="w-full h-8 px-2 text-sm bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-300">
                {ROLES.filter(r => r.key !== "all").map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 mb-1">Department</p>
              <select value={deptId} onChange={e => { setDeptId(e.target.value); setDesigId(""); }}
                className="w-full h-8 px-2 text-sm bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">— None —</option>
                {(depts as any[]).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 mb-1">Designation</p>
              <select value={desigId} onChange={e => setDesigId(e.target.value)}
                className="w-full h-8 px-2 text-sm bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">— None —</option>
                {filteredDesigs.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 mb-1">Contract Type</p>
              <select value={contractType} onChange={e => setCT(e.target.value)}
                className="w-full h-8 px-2 text-sm bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-300">
                <option value="permanent">Permanent</option>
                <option value="contract">Contract</option>
                <option value="visiting">Visiting</option>
              </select>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 mb-1">Joining Date</p>
              <input type="date" value={joiningDate} onChange={e => setJD(e.target.value)}
                className="w-full h-8 px-2 text-sm bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 mb-1">Attendance Mode</p>
              <select value={attendanceMode} onChange={e => setAttMode(e.target.value)}
                className="w-full h-8 px-2 text-sm bg-white border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-300">
                <option value="time_based">Time-based (clock in/out)</option>
                <option value="lecture_based">Lecture-based (per timetable)</option>
              </select>
            </div>
            {attendanceMode === "lecture_based" && (
              <div className="col-span-2 sm:col-span-3 flex items-center">
                <p className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-3 py-1.5">
                  Attendance is marked per scheduled lecture from the timetable, then rolled up to a daily total.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-x-auto max-h-[44vh] overflow-y-auto" ref={gridRef}>
          <table className="w-full text-sm border-collapse" style={{ minWidth: 700 }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ minWidth: 200 }} />
              <col style={{ minWidth: 130 }} /><col style={{ minWidth: 120 }} /><col style={{ minWidth: 160 }} />
              <col style={{ width: 90 }} /><col style={{ width: 120 }} /><col style={{ minWidth: 130 }} />
              <col style={{ width: 38 }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 border-b-2 border-slate-200 select-none">
                <th className="py-2.5 text-center text-[10px] text-slate-400 border-r border-slate-200">#</th>
                {[
                  { l: "Full Name", req: true },
                  { l: "CNIC" }, { l: "Phone" }, { l: "Email" }, { l: "Gender" }, { l: "Date of Birth" }, { l: "Qualification" },
                ].map(({ l, req }) => (
                  <th key={l} className="px-2.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-r border-slate-200 last:border-r-0 whitespace-nowrap">
                    {l}{req && <span className="text-red-400 ml-0.5">*</span>}
                  </th>
                ))}
                <th className="border-l border-slate-200" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row._rowId} className={cn("border-b border-slate-100", ri % 2 === 0 ? "bg-white" : "bg-slate-50/30")}>
                  <td className="text-center text-[11px] text-slate-400 border-r border-slate-100 select-none font-mono">{ri + 1}</td>
                  <td className="p-0 border-r border-slate-100">
                    <input data-r={ri} data-c={0} value={row.fullName} placeholder="Muhammad Ahmed"
                      onChange={e => upd(row._rowId, "fullName", e.target.value)} onKeyDown={e => nav(e, ri, 0)}
                      className={cell} />
                  </td>
                  <td className="p-0 border-r border-slate-100">
                    <input data-r={ri} data-c={1} value={row.cnic} placeholder="35201-0000000-0" maxLength={15}
                      onChange={e => upd(row._rowId, "cnic", formatCnic(e.target.value))} onKeyDown={e => nav(e, ri, 1)}
                      className={cn(cell, "font-mono text-xs")} />
                  </td>
                  <td className="p-0 border-r border-slate-100">
                    <input data-r={ri} data-c={2} value={row.phone} placeholder="0300-0000000" maxLength={12}
                      onChange={e => upd(row._rowId, "phone", formatPhone(e.target.value))} onKeyDown={e => nav(e, ri, 2)}
                      className={cell} />
                  </td>
                  <td className="p-0 border-r border-slate-100">
                    <input data-r={ri} data-c={3} type="email" value={row.email} placeholder="email@example.com"
                      onChange={e => upd(row._rowId, "email", e.target.value)} onKeyDown={e => nav(e, ri, 3)}
                      className={cell} />
                  </td>
                  <td className="p-0 border-r border-slate-100">
                    <select data-r={ri} data-c={4} value={row.gender}
                      onChange={e => upd(row._rowId, "gender", e.target.value)}
                      className="w-full h-9 px-2 text-sm bg-white border border-slate-200 rounded-none outline-none focus:ring-1 focus:ring-inset focus:ring-blue-300 cursor-pointer transition-colors">
                      <option value="">— Select —</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </td>
                  <td className="p-0 border-r border-slate-100">
                    <input data-r={ri} data-c={5} type="date" value={row.dateOfBirth}
                      onChange={e => upd(row._rowId, "dateOfBirth", e.target.value)} onKeyDown={e => nav(e, ri, 5)}
                      className={cell} />
                  </td>
                  <td className="p-0 border-r border-slate-100">
                    <input data-r={ri} data-c={6} value={row.qualification} placeholder="M.Sc, B.Ed…"
                      onChange={e => upd(row._rowId, "qualification", e.target.value)} onKeyDown={e => nav(e, ri, 6)}
                      className={cell} />
                  </td>
                  <td className="text-center align-middle">
                    <button onClick={() => removeRow(row._rowId)} disabled={rows.length === 1}
                      className="h-9 w-9 flex items-center justify-center mx-auto text-slate-300 hover:text-red-500 disabled:opacity-0 disabled:cursor-not-allowed transition-colors">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60">
          <button onClick={addRow} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors font-medium">
            <Plus className="h-3.5 w-3.5" /> Add Row
          </button>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white">
          <p className="text-xs text-slate-400">
            {ready > 0 ? <><span className="font-semibold text-slate-700">{ready}</span> of {rows.length} rows ready</> : <span className="text-amber-500">Fill First + Last Name to enable save</span>}
          </p>
          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || ready === 0} className="min-w-[130px]">
              {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {`Save ${ready} Employee${ready !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Employees() {
  const [, nav] = useLocation();
  const [role, setRole] = useState("all");
  const [q, setQ]       = useState("");
  const [debouncedQ, setDQ] = useState("");
  const [page, setPage] = useState(1);
  const [sortState, setSortState] = useState<{ key: string; dir: "asc" | "desc" }[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDQ(q); setSortState([]); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const params = {
    role: role === "all" ? undefined : role,
    q: debouncedQ || undefined,
    status: "all",
    page,
    pageSize: PAGE_SIZE,
    sort: sortState.length > 0 ? sortState.map(s => `${s.key}:${s.dir}`).join(",") : undefined,
  };

  const { data, isLoading } = useListAdminEmployees(params, {
    query: { queryKey: getListAdminEmployeesQueryKey(params) },
  });

  const result = data as { employees: EmployeeListRow[]; total: number } | undefined;
  const rows   = result?.employees ?? [];
  const total  = result?.total ?? 0;

  const columns = useMemo<ColDef<EmployeeListRow>[]>(() => [
    {
      key: "staffId", label: "Staff ID", defaultVisible: true, defaultWidth: 110,
      sortable: true,
      render: (e) => <span className="font-mono text-xs font-bold text-indigo-600">{e.staffId}</span>,
      getText: (e) => e.staffId ?? "",
    },
    {
      key: "name", label: "Name", defaultVisible: true, defaultWidth: 220,
      sortable: true,
      render: (e) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <EmployeeAvatar emp={e} />
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-sm leading-tight truncate">
              {e.fullName}
            </p>
            {e.designationName && (
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{e.designationName}</p>
            )}
          </div>
        </div>
      ),
      getText: (e) => e.fullName,
    },
    {
      key: "fatherName", label: "Father", defaultVisible: true, defaultWidth: 150,
      sortable: true,
      render: (e) => <span className="text-slate-600 text-xs">{e.fatherName ?? "—"}</span>,
      getText: (e) => e.fatherName ?? "",
    },
    {
      key: "role", label: "Role", defaultVisible: true, defaultWidth: 130,
      sortable: true,
      render: (e) => (
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
          ROLE_COLORS[e.role] ?? "bg-slate-100 text-slate-600")}>
          {e.role.replace("_", " ")}
        </span>
      ),
      getText: (e) => e.role,
    },
    {
      key: "status", label: "Status", defaultVisible: true, defaultWidth: 110,
      sortable: true,
      render: (e) => {
        const m = STATUS_META[e.status] ?? STATUS_META.inactive;
        return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", m.classes)}>{m.label}</span>;
      },
      getText: (e) => STATUS_META[e.status]?.label ?? e.status,
    },
    {
      key: "gender", label: "Gender", defaultVisible: false, defaultWidth: 90,
      sortable: true,
      render: (e) => <span className="text-slate-600 text-xs">{e.gender ?? "—"}</span>,
      getText: (e) => e.gender ?? "",
    },
    {
      key: "bloodGroup", label: "Blood", defaultVisible: false, defaultWidth: 80,
      render: (e) => e.bloodGroup ? (
        <span className="inline-block rounded-md bg-red-50 text-red-600 px-1.5 py-0.5 text-[10px] font-bold">{e.bloodGroup}</span>
      ) : <span className="text-slate-300 text-xs">N/A</span>,
      getText: (e) => e.bloodGroup ?? "",
    },
    {
      key: "joiningDate", label: "Joining Date", defaultVisible: true, defaultWidth: 120,
      sortable: true,
      render: (e) => <span className="text-slate-600 text-xs">{e.joiningDate ?? "—"}</span>,
      getText: (e) => e.joiningDate ?? "",
    },
    {
      key: "qualification", label: "Qualification", defaultVisible: true, defaultWidth: 150,
      render: (e) => <span className="text-slate-600 text-xs">{e.qualification ?? "—"}</span>,
      getText: (e) => e.qualification ?? "",
    },
    {
      key: "email", label: "Email", defaultVisible: true, defaultWidth: 180,
      render: (e) => e.email ? (
        <span className="text-xs text-slate-500 truncate block">{e.email}</span>
      ) : <span className="text-slate-300 text-xs">—</span>,
      getText: (e) => e.email ?? "",
    },
    {
      key: "phone", label: "Phone", defaultVisible: false, defaultWidth: 130,
      render: (e) => <span className="text-slate-600 text-xs">{e.phone ?? "—"}</span>,
      getText: (e) => e.phone ?? "",
    },
    {
      key: "address", label: "Address", defaultVisible: false, defaultWidth: 200,
      render: (e) => <span className="text-slate-500 text-xs truncate block">{e.presentAddress ?? "—"}</span>,
      getText: (e) => e.presentAddress ?? "",
    },
  ], []);

  return (
    <>
      <DataTable
        tableId="ccm_employees_v1"
        title="Staff Directory"
        subtitle="Manage all teaching and non-teaching staff records"
        action={
          <Button onClick={() => setAddOpen(true)} className="gap-1.5 h-9">
            <Plus className="h-4 w-4" /> Add Employee
          </Button>
        }
        filters={
          <div className="flex flex-col gap-3">
            {/* Role tabs */}
            <div className="flex gap-0.5 border-b border-border overflow-x-auto">
              {ROLES.map((r) => (
                <button key={r.key} onClick={() => { setRole(r.key); setSortState([]); setPage(1); }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap -mb-px",
                    role === r.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700",
                  )}>
                  {r.label}
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, staff ID, email…"
                className="pl-8 h-9 text-sm" />
            </div>
          </div>
        }
        columns={columns}
        data={rows}
        total={total}
        isLoading={isLoading}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        sortState={sortState}
        onSortChange={(s) => { setSortState(s); setPage(1); }}
        rowActions={(emp) => (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500"
            onClick={() => nav(`/employees/${emp.staffId}`)}>
            View
          </Button>
        )}
        emptyIcon={
          <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Briefcase className="h-7 w-7 text-slate-300" />
          </div>
        }
        emptyTitle="No employees found"
        emptyDescription="Add the first staff member to get started."
        emptyAction={
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add First Employee
          </Button>
        }
        exportFilename="employees"
        printTitle="Staff Directory"
      />

      <AddEmployeeModal open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
