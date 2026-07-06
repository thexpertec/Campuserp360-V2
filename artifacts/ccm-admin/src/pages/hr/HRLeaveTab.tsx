import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminHrLeaveRequests, getListAdminHrLeaveRequestsQueryKey,
  useCreateAdminHrLeaveRequest, useUpdateAdminHrLeaveRequest, useDeleteAdminHrLeaveRequest,
  useListAdminEmployees, getListAdminEmployeesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DataTable, type ColDef } from "@/components/DataTable";
import { Plus, Pencil, Trash2, Loader2, Briefcase, Search, Check, ChevronsUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const today = () => new Date().toISOString().slice(0, 10);

type F = {
  employeeId: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: string;
  approvedBy: string;
};

function empty(): F {
  return { employeeId: "", leaveType: "casual", fromDate: today(), toDate: today(), reason: "", status: "pending", approvedBy: "" };
}
function toForm(r: any): F {
  return { employeeId: r.employeeId ?? "", leaveType: r.leaveType ?? "casual", fromDate: r.fromDate ?? today(), toDate: r.toDate ?? today(), reason: r.reason ?? "", status: r.status ?? "pending", approvedBy: r.approvedBy ?? "" };
}
function toBody(f: F) {
  return { employeeId: f.employeeId, leaveType: f.leaveType, fromDate: f.fromDate, toDate: f.toDate, reason: f.reason.trim() || undefined, status: f.status || undefined, approvedBy: f.approvedBy.trim() || undefined };
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-600",
};

const LEAVE_TYPES = ["casual", "sick", "annual", "maternity", "emergency", "unpaid"];

// Calculate number of calendar days between two dates (inclusive)
function daysCount(from: string, to: string): number {
  if (!from || !to) return 0;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

export function HRLeaveTab() {
  const qc = useQueryClient();

  // Load leave requests
  const { data: leaveData, isLoading } = useListAdminHrLeaveRequests();

  // Load ALL active employees (large pageSize so we get everyone)
  const empParams = { pageSize: 500, page: 1, status: "all" } as const;
  const { data: empData } = useListAdminEmployees(empParams, {
    query: { queryKey: getListAdminEmployeesQueryKey(empParams) },
  });
  const empList: any[] = (empData as any)?.employees ?? [];

  function empName(r: any): string {
    if (r.fullName) return r.fullName;
    const e = empList.find((x: any) => x.id === r.employeeId);
    return e ? e.fullName : "—";
  }

  const inv = () => qc.invalidateQueries({ queryKey: getListAdminHrLeaveRequestsQueryKey() });
  const createMut = useCreateAdminHrLeaveRequest({ mutation: { onSuccess: inv } });
  const updateMut = useUpdateAdminHrLeaveRequest({ mutation: { onSuccess: inv } });
  const deleteMut = useDeleteAdminHrLeaveRequest({ mutation: { onSuccess: inv } });

  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm]       = useState<F>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [approverOpen, setApproverOpen] = useState(false);
  const [fromDateError, setFromDateError] = useState<string | null>(null);
  const { toast } = useToast();

  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const selectedEmployee = empList.find((e: any) => e.id === form.employeeId);
  const joiningDate: string | null = selectedEmployee?.joiningDate ?? null;

  function validateFromDate(f: F): string | null {
    const emp = empList.find((e: any) => e.id === f.employeeId);
    const jd = emp?.joiningDate;
    if (jd && f.fromDate && f.fromDate < jd) {
      return `From date cannot be before the employee's joining date (${jd})`;
    }
    return null;
  }

  // Approver options: active employees holding admin/director leadership designations
  const APPROVER_DESIGNATION = /admin|director|principal/i;
  const approverOptions = empList
    .filter((e: any) => (e.status ?? "active") === "active" && APPROVER_DESIGNATION.test(e.designationName ?? ""))
    .map((e: any) => ({
      id: String(e.id),
      name: e.fullName ?? "",
      designation: e.designationName as string,
    }))
    .filter(o => o.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  // Preserve legacy hand-typed approver names so editing old records never loses data
  const legacyApprover =
    form.approvedBy && !approverOptions.some(o => o.name === form.approvedBy) ? form.approvedBy : null;

  function openAdd()        { setEditing(null); setForm(empty()); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toForm(r)); setOpen(true); }
  function onClose()        { setOpen(false); setEditing(null); }

  const days = daysCount(form.fromDate, form.toDate);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFromDateError(null);
    if (!form.employeeId) { toast({ title: "Please select an employee", variant: "destructive" }); return; }
    if (form.toDate < form.fromDate) { toast({ title: "To date must be ≥ From date", variant: "destructive" }); return; }
    const fromErr = validateFromDate(form);
    if (fromErr) { setFromDateError(fromErr); return; }
    const body = toBody(form);
    if (editing) {
      const { employeeId: _employeeId, ...updateBody } = body;
      updateMut.mutate({ id: editing.id, data: updateBody }, {
        onSuccess: () => { toast({ title: "Leave request updated" }); onClose(); },
        onError:   (err) => {
          const msg = (err as any)?.data?.error ?? (err as Error)?.message;
          if ((err as any)?.data?.field === "fromDate") setFromDateError(msg);
          toast({ title: "Failed to update", description: msg, variant: "destructive" });
        },
      });
    } else {
      createMut.mutate({ data: body }, {
        onSuccess: () => { toast({ title: "Leave request submitted" }); onClose(); },
        onError:   (err) => {
          const msg = (err as any)?.data?.error ?? (err as Error)?.message;
          if ((err as any)?.data?.field === "fromDate") setFromDateError(msg);
          toast({ title: "Failed to submit", description: msg, variant: "destructive" });
        },
      });
    }
  }

  const allRows = Array.isArray(leaveData) ? leaveData : [];
  const rows = allRows.filter(r =>
    !searchQ || [empName(r), r.leaveType, r.status, r.fromDate, r.toDate, r.reason ?? ""].join(" ").toLowerCase().includes(searchQ.toLowerCase())
  );

  const cols: ColDef<any>[] = [
    {
      key: "employee", label: "Employee", sortable: true, defaultVisible: true, defaultWidth: 200,
      render: r => <span className="text-sm font-medium">{empName(r)}</span>,
      getText: r => empName(r),
    },
    {
      key: "leaveType", label: "Type", sortable: true, defaultVisible: true, defaultWidth: 110,
      render: r => <span className="text-sm capitalize">{r.leaveType || "—"}</span>,
      getText: r => r.leaveType ?? "",
    },
    {
      key: "fromDate", label: "From", sortable: true, defaultVisible: true, defaultWidth: 110,
      render: r => <span className="text-sm">{r.fromDate || "—"}</span>,
      getText: r => r.fromDate ?? "",
    },
    {
      key: "toDate", label: "To", sortable: true, defaultVisible: true, defaultWidth: 110,
      render: r => <span className="text-sm">{r.toDate || "—"}</span>,
      getText: r => r.toDate ?? "",
    },
    {
      key: "days", label: "Days", sortable: true, defaultVisible: true, defaultWidth: 70,
      render: r => <span className="text-sm font-semibold text-slate-700">{daysCount(r.fromDate, r.toDate)}</span>,
      getText: r => String(daysCount(r.fromDate, r.toDate)),
    },
    {
      key: "status", label: "Status", sortable: true, defaultVisible: true, defaultWidth: 110,
      render: r => <Badge variant="outline" className={STATUS_COLORS[r.status] ?? ""}>{r.status || "—"}</Badge>,
      getText: r => r.status ?? "",
    },
    {
      key: "approvedBy", label: "Approved By", defaultVisible: false, defaultWidth: 160,
      render: r => <span className="text-sm text-slate-500">{r.approvedBy || "—"}</span>,
      getText: r => r.approvedBy ?? "",
    },
    {
      key: "_actions", label: "", defaultVisible: true, defaultWidth: 100,
      render: r => (
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
      getText: () => "",
    },
  ];

  return (
    <>
      <DataTable
        tableId="ccm_hr_leave_v3"
        title="Leave Management"
        subtitle="Leave applications and approval status"
        action={
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1.5" />Apply Leave
          </Button>
        }
        filters={
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search by name, type, status…"
              className="pl-8 h-9 text-sm"
            />
          </div>
        }
        columns={cols}
        data={rows}
        total={rows.length}
        isLoading={isLoading}
        pageSize={50}
        clientPaginate
        emptyIcon={
          <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Briefcase className="h-7 w-7 text-slate-300" />
          </div>
        }
        emptyTitle="No leave requests"
        emptyDescription="Click Apply Leave to submit the first leave request."
      />

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Leave Request" : "Apply Leave"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {/* Employee */}
            <div className="space-y-1.5">
              <Label>Employee <span className="text-destructive">*</span></Label>
              <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={empList.length ? "Select employee…" : "Loading employees…"} />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {empList.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.fullName}
                      {e.staffId ? <span className="text-muted-foreground ml-1.5 text-xs">· {e.staffId}</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type + Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Leave Type <span className="text-destructive">*</span></Label>
                <Select value={form.leaveType} onValueChange={v => setForm(f => ({ ...f, leaveType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAVE_TYPES.map(t => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Dates */}
              <div className="space-y-1.5">
                <Label>From Date <span className="text-destructive">*</span></Label>
                <Input
                  required type="date"
                  value={form.fromDate}
                  min={joiningDate ?? undefined}
                  onChange={e => {
                    setFromDateError(null);
                    setForm(f => ({ ...f, fromDate: e.target.value }));
                  }}
                  aria-invalid={!!fromDateError}
                />
                {joiningDate && (
                  <p className="text-xs text-muted-foreground">Employee joined on {joiningDate}</p>
                )}
                {fromDateError && (
                  <p className="text-xs text-destructive">{fromDateError}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>To Date <span className="text-destructive">*</span></Label>
                <Input
                  required type="date"
                  value={form.toDate}
                  min={form.fromDate}
                  onChange={set("toDate")}
                />
              </div>
            </div>

            {/* Duration chip */}
            {days > 0 && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-1.5">
                Duration: <span className="font-semibold text-foreground">{days} day{days !== 1 ? "s" : ""}</span>
              </p>
            )}

            {/* Reason + Approved By */}
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea value={form.reason} onChange={set("reason")} placeholder="Reason for leave" className="min-h-[70px] resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label>Approved By</Label>
              <Popover open={approverOpen} onOpenChange={setApproverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={approverOpen}
                    className="w-full justify-between font-normal"
                  >
                    {form.approvedBy
                      ? <span className="truncate">{form.approvedBy}</span>
                      : <span className="text-muted-foreground">Select approving authority…</span>}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command>
                    <CommandInput placeholder="Search admins & directors…" className="h-9 text-sm" />
                    <CommandList className="max-h-56">
                      <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                        No matching approver.
                      </CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__"
                          onSelect={() => { setForm(f => ({ ...f, approvedBy: "" })); setApproverOpen(false); }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${form.approvedBy ? "opacity-0" : "opacity-100"}`} />
                          <span className="text-muted-foreground">None</span>
                        </CommandItem>
                        {legacyApprover && (
                          <CommandItem
                            value={`legacy ${legacyApprover}`}
                            onSelect={() => { setForm(f => ({ ...f, approvedBy: legacyApprover })); setApproverOpen(false); }}
                          >
                            <Check className="mr-2 h-4 w-4 opacity-100" />
                            {legacyApprover}
                            <span className="text-muted-foreground ml-1.5 text-xs">· previously entered</span>
                          </CommandItem>
                        )}
                        {approverOptions.map(o => (
                          <CommandItem
                            key={o.id}
                            value={`${o.name} ${o.designation} ${o.id}`}
                            onSelect={() => { setForm(f => ({ ...f, approvedBy: o.name })); setApproverOpen(false); }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${form.approvedBy === o.name ? "opacity-100" : "opacity-0"}`} />
                            {o.name}
                            <span className="text-muted-foreground ml-1.5 text-xs">— {o.designation}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Save Changes" : "Submit Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete leave request?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the leave request permanently.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteMut.mutate({ id: deleteId! }, {
                  onSuccess: () => { setDeleteId(null); toast({ title: "Request deleted" }); },
                  onError:   (err) => { setDeleteId(null); toast({ title: "Failed to delete", description: (err as any)?.data?.error ?? (err as Error)?.message, variant: "destructive" }); },
                });
              }}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
