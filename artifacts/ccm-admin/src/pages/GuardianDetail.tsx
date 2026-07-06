import { useState } from "react";
import { formatDate, formatCurrency } from "@/lib/locale";
import { useParams, useLocation } from "wouter";
import { formatCnic, formatPhone } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, Users, Phone, CreditCard, MapPin, FileText,
  Edit2, Baby, Loader2, GraduationCap, Hash, Search,
  UserPlus, UserMinus, CheckCircle2, ExternalLink,
  Wallet, AlertTriangle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type GuardianChild = {
  id: string;
  applicantId: string;
  fullName: string;
  classCode: string;
  status: string;
  sectionName: string | null;
};

type GuardianDetail = {
  id: string;
  familyId: string;
  familySeq: number;
  name: string;
  cnic: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  children: GuardianChild[];
};

type FeeSummaryStudent = {
  id: string;
  applicantId: string;
  fullName: string;
  classCode: string;
  status: string;
  outstanding: number;
  overdueCount: number;
  totalChallans: number;
};

type FeeSummary = {
  students: FeeSummaryStudent[];
  familyOutstanding: number;
  familyOverdueCount: number;
};

type StudentSearchResult = {
  id: string;
  applicantId: string;
  fullName: string;
  classCode: string;
  status: string;
  guardianId: string | null;
};

type GuardianInput = {
  name: string;
  cnic?: string;
  phone?: string;
  city?: string;
  address?: string;
  notes?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = (await import("@/lib/auth")).getToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).error ?? "Request failed");
  }
  return res.json();
}

const CLASS_LABELS: Record<string, string> = {
  "class-7": "Class VII",
  "class-8": "Class VIII",
  "class-9": "Class IX",
  "class-11-premedical": "Class XI (Pre-Med)",
  "class-11-preengineering": "Class XI (Pre-Eng)",
  "class-11-ics": "Class XI (ICS)",
};

function classLabel(code: string) {
  return CLASS_LABELS[code] ?? code;
}

function pkr(amount: number) {
  return formatCurrency(amount);
}

function InfoField({ label, value, mono = false }: {
  label: string; value: React.ReactNode; mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
      <p className={`text-sm font-semibold text-slate-800 break-words${mono ? " font-mono" : ""}`}>{value ?? "—"}</p>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, action }: {
  title: string; icon: React.ElementType; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-border bg-slate-50/60">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0">
            <Icon className="h-3.5 w-3.5 text-slate-600" />
          </span>
          <span className="font-bold text-sm text-slate-800">{title}</span>
        </div>
        {action}
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

// ─── Edit form ────────────────────────────────────────────────────────────────

function EditGuardianDialog({
  guardian,
  onClose,
  onSaved,
}: {
  guardian: GuardianDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<GuardianInput>({
    name: guardian.name,
    cnic: guardian.cnic ?? "",
    phone: guardian.phone ?? "",
    city: guardian.city ?? "",
    address: guardian.address ?? "",
    notes: guardian.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  function set(field: keyof GuardianInput, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/admin/guardians/${guardian.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name.trim(),
          cnic: form.cnic?.trim() || null,
          phone: form.phone?.trim() || null,
          city: form.city?.trim() || null,
          address: form.address?.trim() || null,
          notes: form.notes?.trim() || null,
        }),
      });
      toast({ title: "Guardian updated" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Guardian — {guardian.familyId}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">
              Full Name <span className="text-red-500">*</span>
            </Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">CNIC</Label>
            <Input value={form.cnic} onChange={(e) => set("cnic", formatCnic(e.target.value))} placeholder="35200-1234567-8" maxLength={15} />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">Phone</Label>
            <Input value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} placeholder="0300-1234567" maxLength={12} />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">City</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Rawalpindi" />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">Address</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Link student dialog ──────────────────────────────────────────────────────

function LinkStudentDialog({
  guardianId,
  currentChildren,
  onClose,
  onLinked,
}: {
  guardianId: string;
  currentChildren: GuardianChild[];
  onClose: () => void;
  onLinked: () => void;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  const linkedIds = new Set(currentChildren.map((c) => c.id));

  async function handleSearch() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const data = await apiFetch<{ items: StudentSearchResult[] }>(
        `/api/admin/students?q=${encodeURIComponent(q)}&pageSize=10&status=active`,
      );
      setResults(data.items);
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }

  async function handleLink(studentId: string) {
    setLinking(studentId);
    try {
      await apiFetch(`/api/admin/students/${studentId}/guardian`, {
        method: "PATCH",
        body: JSON.stringify({ guardianId }),
      });
      toast({ title: "Student linked to guardian" });
      onLinked();
    } catch (err: any) {
      toast({ title: "Link failed", description: err.message, variant: "destructive" });
    } finally {
      setLinking(null);
    }
  }

  async function handleUnlink(studentId: string) {
    setLinking(studentId);
    try {
      await apiFetch(`/api/admin/students/${studentId}/guardian`, {
        method: "PATCH",
        body: JSON.stringify({ guardianId: null }),
      });
      toast({ title: "Student unlinked" });
      onLinked();
    } catch (err: any) {
      toast({ title: "Unlink failed", description: err.message, variant: "destructive" });
    } finally {
      setLinking(null);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-indigo-500" />
            Link Students
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Input
              placeholder="Search by name or Applicant ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={handleSearch} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {results.length > 0 && (
            <div className="divide-y divide-border rounded-xl border border-border overflow-hidden max-h-64 overflow-y-auto">
              {results.map((s) => {
                const isLinked = linkedIds.has(s.id);
                const isLinkedElsewhere = !isLinked && s.guardianId && s.guardianId !== guardianId;
                return (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {s.fullName}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">{s.applicantId} · {classLabel(s.classCode)}</p>
                      {isLinkedElsewhere && (
                        <p className="text-xs text-amber-600 font-medium">Already linked to another guardian</p>
                      )}
                    </div>
                    {isLinked
                      ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            onClick={() => handleUnlink(s.id)}
                            disabled={linking === s.id}
                          >
                            {linking === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />}
                            Unlink
                          </Button>
                        )
                      : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border-indigo-200"
                            onClick={() => handleLink(s.id)}
                            disabled={linking === s.id}
                          >
                            {linking === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                            Link
                          </Button>
                        )}
                  </div>
                );
              })}
            </div>
          )}

          {results.length === 0 && q && !searching && (
            <p className="text-center text-sm text-muted-foreground py-4">No students found for "{q}"</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GuardianDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editOpen, setEditOpen]     = useState(false);
  const [linkOpen, setLinkOpen]     = useState(false);

  const queryKey = ["admin-guardian-detail", id];
  const feeSummaryKey = ["admin-guardian-fee-summary", id];

  const { data: guardian, isLoading, isError } = useQuery<GuardianDetail>({
    queryKey,
    queryFn: () => apiFetch(`/api/admin/guardians/${id}`),
    enabled: !!id,
  });

  const { data: feeSummary, isLoading: feeLoading } = useQuery<FeeSummary>({
    queryKey: feeSummaryKey,
    queryFn: () => apiFetch(`/api/admin/guardians/${id}/fee-summary`),
    enabled: !!id,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ["admin-guardians"] });
  }

  async function handleUnlinkChild(childId: string, childName: string) {
    try {
      await apiFetch(`/api/admin/students/${childId}/guardian`, {
        method: "PATCH",
        body: JSON.stringify({ guardianId: null }),
      });
      toast({ title: `${childName} unlinked from guardian` });
      invalidate();
    } catch (err: any) {
      toast({ title: "Unlink failed", description: err.message, variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !guardian) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-red-600 font-semibold">Guardian not found</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate("/guardians")}>
            Back to Guardians
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-4xl mx-auto">

      {/* Back + header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 mt-0.5 shrink-0"
          onClick={() => navigate("/guardians")}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">{guardian.name}</h1>
            <span className="font-mono text-sm font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-2 py-0.5">
              {guardian.familyId}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Guardian record · {guardian.children.length} linked student{guardian.children.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-9 shrink-0"
          onClick={() => setEditOpen(true)}
        >
          <Edit2 className="h-3.5 w-3.5" />
          Edit
        </Button>
      </div>

      {/* Guardian details */}
      <SectionCard title="Guardian Information" icon={Users}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
          <InfoField label="Full Name"  value={guardian.name} />
          <InfoField label="Family ID"  value={<span className="font-mono text-indigo-600">{guardian.familyId}</span>} />
          <InfoField label="CNIC"       value={
            guardian.cnic
              ? <span className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-slate-400" />{guardian.cnic}</span>
              : "—"
          } mono />
          <InfoField label="Phone"      value={
            guardian.phone
              ? <a href={`tel:${guardian.phone}`} className="text-blue-600 hover:underline flex items-center gap-1"><Phone className="h-3 w-3" />{guardian.phone}</a>
              : "—"
          } />
          <InfoField label="City"       value={
            guardian.city
              ? <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-slate-400" />{guardian.city}</span>
              : "—"
          } />
          <InfoField label="Address"    value={guardian.address ?? "—"} />
        </div>
        {guardian.notes && (
          <>
            <Separator className="my-5" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1">
                <FileText className="h-3 w-3" /> Notes
              </p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{guardian.notes}</p>
            </div>
          </>
        )}
      </SectionCard>

      {/* Children */}
      <SectionCard
        title={`Linked Children (${guardian.children.length})`}
        icon={Baby}
        action={
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setLinkOpen(true)}
          >
            <UserPlus className="h-3 w-3" />
            Link / Unlink
          </Button>
        }
      >
        {guardian.children.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <Baby className="h-10 w-10 text-slate-200" />
            <p className="text-sm font-semibold text-slate-500">No students linked yet</p>
            <p className="text-xs text-muted-foreground">
              Use "Link / Unlink" to connect students to this guardian.
            </p>
            <Button size="sm" variant="outline" className="mt-2 h-7 text-xs gap-1" onClick={() => setLinkOpen(true)}>
              <UserPlus className="h-3 w-3" /> Link a Student
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Applicant ID</th>
                  <th className="text-left pb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Name</th>
                  <th className="text-left pb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Class/Program</th>
                  <th className="text-left pb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Section</th>
                  <th className="text-left pb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Status</th>
                  <th className="pb-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {guardian.children.map((child) => (
                  <tr key={child.id} className="hover:bg-slate-50/60 transition-colors group">
                    <td className="py-3 font-mono text-xs font-bold text-slate-600">{child.applicantId}</td>
                    <td className="py-3 font-semibold text-slate-800">{child.fullName}</td>
                    <td className="py-3 text-xs text-muted-foreground">{classLabel(child.classCode)}</td>
                    <td className="py-3 text-xs text-muted-foreground">{child.sectionName ?? "—"}</td>
                    <td className="py-3">
                      <Badge
                        variant={child.status === "active" ? "default" : "secondary"}
                        className={`text-[11px] capitalize ${child.status === "active" ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : ""}`}
                      >
                        {child.status}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button
                          className="h-7 px-2 flex items-center gap-1 rounded-md border border-border bg-white hover:bg-slate-50 text-xs text-slate-500 hover:text-indigo-600 transition-colors"
                          onClick={() => navigate(`/students/${child.id}`)}
                          title="View student profile"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Profile
                        </button>
                        <button
                          className="h-7 px-2 flex items-center gap-1 rounded-md border border-red-200 bg-white hover:bg-red-50 text-xs text-red-400 hover:text-red-600 transition-colors"
                          onClick={() => handleUnlinkChild(child.id, child.fullName)}
                          title="Unlink student"
                        >
                          <UserMinus className="h-3 w-3" />
                          Unlink
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Family Fee Summary */}
      <SectionCard title="Family Fee Summary" icon={Wallet}>
        {feeLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
        ) : !feeSummary || feeSummary.students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <Wallet className="h-10 w-10 text-slate-200" />
            <p className="text-sm font-semibold text-slate-500">No fee records found</p>
            <p className="text-xs text-muted-foreground">Fee challans will appear here once generated for linked students.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Family totals */}
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-slate-50 px-4 py-3">
              <div className="flex-1 min-w-[150px]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Total Outstanding</p>
                <p className={`text-lg font-extrabold ${feeSummary.familyOutstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {pkr(feeSummary.familyOutstanding)}
                </p>
              </div>
              {feeSummary.familyOverdueCount > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  <span className="text-sm font-semibold text-red-700">
                    {feeSummary.familyOverdueCount} overdue challan{feeSummary.familyOverdueCount !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
              {feeSummary.familyOutstanding === 0 && (
                <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="text-sm font-semibold text-emerald-700">All dues cleared</span>
                </div>
              )}
            </div>

            {/* Per-student breakdown */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left pb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Student</th>
                    <th className="text-left pb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Class/Program</th>
                    <th className="text-right pb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Outstanding</th>
                    <th className="text-right pb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Overdue</th>
                    <th className="text-right pb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Challans</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {feeSummary.students.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3">
                        <p className="font-semibold text-slate-800">{s.fullName}</p>
                        <p className="text-xs font-mono text-muted-foreground">{s.applicantId}</p>
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">{classLabel(s.classCode)}</td>
                      <td className="py-3 text-right">
                        <span className={`font-semibold tabular-nums ${s.outstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {pkr(s.outstanding)}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {s.overdueCount > 0 ? (
                          <Badge className="text-[11px] bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
                            {s.overdueCount}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right text-xs text-muted-foreground tabular-nums">{s.totalChallans}</td>
                    </tr>
                  ))}
                </tbody>
                {feeSummary.students.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-border">
                      <td colSpan={2} className="pt-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Family Total</td>
                      <td className="pt-3 text-right">
                        <span className={`font-extrabold tabular-nums ${feeSummary.familyOutstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {pkr(feeSummary.familyOutstanding)}
                        </span>
                      </td>
                      <td className="pt-3 text-right">
                        {feeSummary.familyOverdueCount > 0 ? (
                          <Badge className="text-[11px] bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
                            {feeSummary.familyOverdueCount}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="pt-3 text-right text-xs font-semibold text-slate-600 tabular-nums">
                        {feeSummary.students.reduce((s, c) => s + c.totalChallans, 0)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Metadata */}
      <div className="text-xs text-muted-foreground px-1">
        Created {formatDate(guardian.createdAt)} ·
        Last updated {formatDate(guardian.updatedAt)}
      </div>

      {/* Dialogs */}
      {editOpen && (
        <EditGuardianDialog
          guardian={guardian}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); invalidate(); }}
        />
      )}
      {linkOpen && (
        <LinkStudentDialog
          guardianId={guardian.id}
          currentChildren={guardian.children}
          onClose={() => setLinkOpen(false)}
          onLinked={() => { invalidate(); }}
        />
      )}
    </div>
  );
}
