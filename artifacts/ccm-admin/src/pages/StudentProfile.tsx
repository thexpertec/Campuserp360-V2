import { memo, useState, useRef, useEffect } from "react";
import { formatDate, formatCurrency } from "@/lib/locale";
import { displayCnic, displayPhone } from "@/lib/format";
import { useParams, useLocation } from "wouter";
import {
  useGetAdminStudent,
  getGetAdminStudentQueryKey,
  useGetAdminStudentByGr,
  getGetAdminStudentByGrQueryKey,
  useListAdminSections,
  useListAdminHouses,
  useListAdminClasses,
  useListAdminAcademicYears,
  useListAdminFeeChallans,
  getListAdminFeeChallansQueryKey,
  useMarkAdminFeeChallanPaid,
  useListAdminBankAccounts,
  type AdminStudentDetail,
  type AdminStudentSummary,
  type FeeChallan,
  type CashBankAccount,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight,
  User, Users, BookOpen, GraduationCap, DollarSign, FileText,
  Library, CreditCard, FolderOpen, History, Home,
  Calendar, AlertCircle, CheckCircle2, Clock, Printer,
  Download, ExternalLink, Phone, Mail, MapPin,
  BarChart3, TrendingUp, Award, BookMarked,
  AlertTriangle, Hash, Star, Building2, Bed,
  Stethoscope, ShieldCheck, Receipt, Loader2,
  Search, UserPlus, Link2Off,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { StudentFormDialog } from "./Students";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = {
  key: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
  badgeVariant?: "default" | "destructive" | "secondary" | "outline";
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; classes: string }> = {
  active:      { label: "Active",      classes: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  alumni:      { label: "Alumni",      classes: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  expelled:    { label: "Expelled",    classes: "bg-red-500/15 text-red-400 border-red-500/30" },
  transferred: { label: "Transferred", classes: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  deceased:    { label: "Deceased",    classes: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
};

const CLASS_LABELS: Record<string, string> = {
  "class-7":                 "Class VII",
  "class-8":                 "Class VIII",
  "class-9":                 "Class IX",
  "class-11-premedical":     "Class XI (Pre-Med)",
  "class-11-preengineering": "Class XI (Pre-Eng)",
  "class-11-ics":            "Class XI (ICS)",
};


// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = (await import("@/lib/auth")).getToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

function classLabel(code: string) { return CLASS_LABELS[code] ?? code; }
function initials(d: AdminStudentDetail) {
  return (d.fullName?.[0] ?? "").toUpperCase();
}
function fmt(val: string | null | undefined, fallback = "—") {
  return val?.trim() || fallback;
}

// ─── Small shared components ──────────────────────────────────────────────────

const InfoField = memo(function InfoField({ label, value, mono = false, span = 1 }: {
  label: string; value: React.ReactNode; mono?: boolean; span?: number;
}) {
  return (
    <div className={span > 1 ? `col-span-${span}` : undefined}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
      <p className={cn("text-sm font-semibold text-slate-800 break-words", mono && "font-mono")}>{value ?? "—"}</p>
    </div>
  );
});

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

const StatCard = memo(function StatCard({ icon: Icon, label, value, sub, color = "bg-slate-100 text-slate-600" }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-white p-4 shadow-sm">
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl shrink-0", color)}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 truncate">{label}</p>
        <p className="text-xl font-extrabold text-slate-800 leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
});

// ─── Guardian types + dialog ───────────────────────────────────────────────────

type GuardianBrief = {
  id: string;
  familyId: string;
  name: string;
  cnic: string | null;
  phone: string | null;
  city: string | null;
};

function ChangeGuardianDialog({ studentId, onClose, onLinked }: {
  studentId: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GuardianBrief[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  async function handleSearch() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const data = await apiFetch<{ data: GuardianBrief[] }>(
        `/api/admin/guardians?q=${encodeURIComponent(q)}&pageSize=10`,
      );
      setResults(data.data);
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }

  async function handleLink(guardianId: string) {
    setLinking(guardianId);
    try {
      await apiFetch(`/api/admin/students/${studentId}/guardian`, {
        method: "PATCH",
        body: JSON.stringify({ guardianId }),
      });
      toast({ title: "Guardian linked" });
      onLinked();
    } catch (err: any) {
      toast({ title: "Link failed", description: err.message, variant: "destructive" });
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
            Link Guardian Record
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Input
              placeholder="Search by name, CNIC, phone, or Family ID…"
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
              {results.map((g) => (
                <div key={g.id} className="flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{g.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {g.familyId}{g.cnic ? ` · ${g.cnic}` : ""}{g.phone ? ` · ${g.phone}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border-indigo-200"
                    onClick={() => handleLink(g.id)}
                    disabled={linking === g.id}
                  >
                    {linking === g.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                    Link
                  </Button>
                </div>
              ))}
            </div>
          )}
          {results.length === 0 && q && !searching && (
            <p className="text-center text-sm text-muted-foreground py-4">No guardians found for "{q}"</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}

// ─── Tab: Basic Details ───────────────────────────────────────────────────────

function TabBasicDetails({
  student, studentId, className, sectionName, houseName, houseColor, yearName, statusMeta,
}: {
  student: AdminStudentDetail; studentId: string; className: string; sectionName: string;
  houseName: string; houseColor: string | null; yearName: string;
  statusMeta: { label: string; classes: string };
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("other");
  const [changeGuardianOpen, setChangeGuardianOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const guardianId: string | null = (student as any).guardianId ?? null;
  const { data: guardianRec, isLoading: guardianLoading } = useQuery<GuardianBrief | null>({
    queryKey: ["student-guardian", guardianId],
    queryFn: () => guardianId
      ? apiFetch<GuardianBrief>(`/api/admin/guardians/${guardianId}`)
      : Promise.resolve(null),
    enabled: true,
  });

  async function handleUnlinkGuardian() {
    setUnlinking(true);
    try {
      await apiFetch(`/api/admin/students/${studentId}/guardian`, {
        method: "PATCH",
        body: JSON.stringify({ guardianId: null }),
      });
      qc.invalidateQueries({ queryKey: getGetAdminStudentQueryKey(studentId) });
      qc.invalidateQueries({ queryKey: ["student-guardian", guardianId] });
      toast({ title: "Guardian unlinked" });
    } catch (err: any) {
      toast({ title: "Unlink failed", description: err.message, variant: "destructive" });
    } finally {
      setUnlinking(false);
    }
  }

  type DocRow = { id: string; docType: string; originalName: string; mimeType: string; fileSize: number; uploadedAt: string };
  const { data: docs = [], isLoading: docsLoading } = useQuery<DocRow[]>({
    queryKey: ["student-docs", studentId],
    queryFn: () => apiFetch(`/api/admin/students/${studentId}/documents`),
    enabled: !!studentId,
  });

  const DOC_TYPES = [
    { value: "birth_certificate", label: "Birth Certificate" },
    { value: "cnic", label: "CNIC / B-Form" },
    { value: "photo", label: "Photograph" },
    { value: "leaving_certificate", label: "Leaving Certificate" },
    { value: "medical", label: "Medical Record" },
    { value: "other", label: "Other" },
  ];

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const token = (await import("@/lib/auth")).getToken();
      const res = await fetch(`/api/admin/students/${studentId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ docType, originalName: file.name, mimeType: file.type, fileSize: file.size, data: base64 }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      qc.invalidateQueries({ queryKey: ["student-docs", studentId] });
      toast({ title: "Document uploaded", description: file.name });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDeleteDoc(docId: string) {
    const token = (await import("@/lib/auth")).getToken();
    await fetch(`/api/admin/students/${studentId}/documents/${docId}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    qc.invalidateQueries({ queryKey: ["student-docs", studentId] });
    toast({ title: "Document deleted" });
  }

  function fmtSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function docIcon(mimeType: string) {
    if (mimeType.startsWith("image/")) return <Star className="h-4 w-4 text-purple-500" />;
    if (mimeType === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
    return <FileText className="h-4 w-4 text-slate-400" />;
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Personal */}
      <SectionCard title="Personal Information" icon={User}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-5">
          <InfoField label="Full Name"     value={student.fullName} />
          <InfoField label="Register ID"   value={student.applicantId} mono />
          <InfoField label="Date of Birth" value={fmt(student.dateOfBirth)} />
          <InfoField label="Blood Group"   value={fmt(student.bloodGroup)} />
          <InfoField label="Religion"      value={fmt(student.religion)} />
          <InfoField label="Nationality"   value={fmt(student.nationality)} />
          <InfoField label="Status"        value={
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold", statusMeta.classes)}>
              {statusMeta.label}
            </span>
          } />
        </div>
        <Separator className="my-5" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Contact</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-5">
          <InfoField label="Mobile" value={
            student.mobile
              ? <a href={`tel:${student.mobile}`} className="text-blue-600 hover:underline flex items-center gap-1"><Phone className="h-3 w-3" />{displayPhone(student.mobile)}</a>
              : "—"
          } />
          <InfoField label="Email" value={
            student.email
              ? <a href={`mailto:${student.email}`} className="text-blue-600 hover:underline flex items-center gap-1"><Mail className="h-3 w-3" />{student.email}</a>
              : "—"
          } />
          <InfoField label="City"     value={fmt(student.city)} />
          <InfoField label="Province" value={fmt(student.province)} />
          <div className="col-span-2 sm:col-span-3 lg:col-span-4">
            <InfoField label="Address" value={fmt(student.address)} />
          </div>
        </div>
      </SectionCard>

      {/* Guardian */}
      <SectionCard
        title="Guardian & Family"
        icon={Users}
        action={
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setChangeGuardianOpen(true)}
          >
            <UserPlus className="h-3 w-3" />
            {guardianId ? "Change" : "Link Guardian"}
          </Button>
        }
      >
        {guardianId && (
          <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            {guardianLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                <span className="text-sm text-muted-foreground">Loading guardian record…</span>
              </div>
            ) : guardianRec ? (
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Linked Guardian Record</span>
                    <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-100 border border-indigo-200 rounded px-1.5 py-0.5">
                      {guardianRec.familyId}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Name</p>
                      <p className="text-sm font-semibold text-slate-800">{guardianRec.name}</p>
                    </div>
                    {guardianRec.cnic && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">CNIC</p>
                        <p className="text-sm font-semibold text-slate-800 font-mono">{displayCnic(guardianRec.cnic)}</p>
                      </div>
                    )}
                    {guardianRec.phone && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Phone</p>
                        <a href={`tel:${guardianRec.phone}`} className="text-sm font-semibold text-blue-600 hover:underline flex items-center gap-1">
                          <Phone className="h-3 w-3" />{displayPhone(guardianRec.phone)}
                        </a>
                      </div>
                    )}
                    {guardianRec.city && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">City</p>
                        <p className="text-sm font-semibold text-slate-800">{guardianRec.city}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={`/guardians/${guardianId}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" /> View Record
                  </a>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
                    onClick={handleUnlinkGuardian}
                    disabled={unlinking}
                  >
                    {unlinking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2Off className="h-3 w-3" />}
                    Unlink
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-5">
          <InfoField label="Father's Name"   value={fmt(student.fatherName)} />
          <InfoField label="Guardian Name"   value={fmt(student.guardianName)} />
          <InfoField label="Relation"        value={fmt(student.relation)} />
          <InfoField label="Occupation"      value={fmt(student.occupation)} />
          <InfoField label="Guardian Mobile" value={
            student.guardianMobile
              ? <a href={`tel:${student.guardianMobile}`} className="text-blue-600 hover:underline flex items-center gap-1"><Phone className="h-3 w-3" />{displayPhone(student.guardianMobile)}</a>
              : "—"
          } />
          <InfoField label="Guardian CNIC" value={displayCnic(student.guardianCnic)} mono />
        </div>
      </SectionCard>

      {changeGuardianOpen && (
        <ChangeGuardianDialog
          studentId={studentId}
          onClose={() => setChangeGuardianOpen(false)}
          onLinked={() => {
            setChangeGuardianOpen(false);
            qc.invalidateQueries({ queryKey: getGetAdminStudentQueryKey(studentId) });
            qc.invalidateQueries({ queryKey: ["student-guardian", guardianId] });
          }}
        />
      )}

      {/* Academic placement */}
      <SectionCard title="Academic Placement" icon={GraduationCap}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-5">
          <InfoField label="Class/Program"  value={className} />
          <InfoField label="Section" value={sectionName || "—"} />
          <InfoField label="House" value={
            houseName
              ? <span className="flex items-center gap-1.5">
                  {houseColor && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: houseColor }} />}
                  {houseName}
                </span>
              : "—"
          } />
          <InfoField label="Academic Year"    value={yearName || "—"} />
          <InfoField label="Enrollment Date"  value={fmt(student.enrollmentDate)} />
          <InfoField label="Application"      value={
            student.applicationId
              ? <a href="/admin/applications" className="text-blue-600 hover:underline flex items-center gap-1 text-xs font-mono"><ExternalLink className="h-3 w-3" />View</a>
              : "—"
          } />
        </div>
      </SectionCard>

      {/* Documents */}
      <SectionCard title="Documents" icon={FolderOpen}
        action={
          <div className="flex items-center gap-2">
            <select
              value={docType}
              onChange={e => setDocType(e.target.value)}
              className="text-xs border border-border rounded-md px-2 py-1 bg-white text-slate-700 h-7"
            >
              {DOC_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
            </select>
            <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={handleFileChange} />
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Upload
            </Button>
          </div>
        }>
        {docsLoading ? (
          <div className="space-y-2">{[...Array(2)].map((_,i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <FolderOpen className="h-10 w-10 text-slate-200" />
            <p className="text-sm font-semibold text-slate-500">No documents uploaded yet</p>
            <p className="text-xs text-muted-foreground">Select a type and click Upload to add the cadet's documents.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="shrink-0">{docIcon(doc.mimeType)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{doc.originalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {DOC_TYPES.find(d => d.value === doc.docType)?.label ?? doc.docType} · {fmtSize(doc.fileSize)} · {formatDate(doc.uploadedAt)}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <a
                    href={`/api/admin/students/${studentId}/documents/${doc.id}/download`}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border bg-white hover:bg-slate-50 transition-colors"
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-500" />
                  </a>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleDeleteDoc(doc.id)} title="Delete">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

    </div>
  );
}

// ─── Tab: Fee Structure ───────────────────────────────────────────────────────

function TabFeeStructure({ classCode, academicYearId }: { classCode: string; academicYearId: string }) {
  const { data, isLoading } = useQuery<{
    feeTypes: { id: string; name: string; feeCode: string; duration: string }[];
    amounts: Record<string, Record<string, number>>;
  }>({
    queryKey: ["fee-schedule-profile", academicYearId],
    queryFn: () => apiFetch(`/api/admin/fee-schedule?academicYearId=${academicYearId}`),
    enabled: !!academicYearId,
  });

  if (!academicYearId) return (
    <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
      <Receipt className="h-10 w-10 opacity-20" />
      <p className="text-sm font-medium">No academic year assigned</p>
      <p className="text-xs">Assign an academic year to this student to view fee structure.</p>
    </div>
  );

  if (isLoading) return <div className="space-y-2">{[...Array(4)].map((_,i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>;

  const feeTypes = data?.feeTypes ?? [];
  const classAmounts = data?.amounts?.[classCode] ?? {};
  const rows = feeTypes.map(ft => ({
    name: ft.name,
    feeCode: ft.feeCode,
    duration: ft.duration,
    amount: classAmounts[ft.id] ?? null,
  })).filter(r => r.amount !== null);

  const monthlyTotal = rows.filter(r => r.duration === "monthly").reduce((s, r) => s + (r.amount ?? 0), 0);
  const annualTotal  = rows.filter(r => r.duration === "annual").reduce((s, r) => s + (r.amount ?? 0), 0);

  if (rows.length === 0) return (
    <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
      <FileText className="h-10 w-10 opacity-20" />
      <p className="text-sm font-medium">No fee schedule for this class yet</p>
      <p className="text-xs">Configure the fee schedule in Fee Master → Fee Schedule.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={Receipt}    label="Monthly Total"  value={formatCurrency(monthlyTotal)} sub="Recurring monthly"  color="bg-indigo-100 text-indigo-600" />
        <StatCard icon={DollarSign} label="Annual Total"   value={formatCurrency(annualTotal)}  sub="Annual / one-time"  color="bg-blue-100 text-blue-600" />
        <StatCard icon={Star}       label="Concession"     value="None"                                  sub="No active waiver"   color="bg-slate-100 text-slate-600" />
      </div>

      <SectionCard title="Fee Components" icon={FileText}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Component</th>
                <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Type</th>
                <th className="text-right py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Amount (Rs)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.feeCode} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 font-semibold text-slate-700">{row.name}</td>
                  <td className="py-3 text-xs text-muted-foreground capitalize">{row.duration}</td>
                  <td className="py-3 text-right font-mono font-semibold text-slate-800">{formatCurrency(row.amount ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Concessions & Waivers" icon={ShieldCheck}>
        <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
          <ShieldCheck className="h-10 w-10 text-slate-200" />
          <p className="text-sm font-semibold text-slate-500">No concessions on record</p>
          <p className="text-xs text-muted-foreground">Concessions will appear here once applied.</p>
          <Button size="sm" variant="outline" className="mt-2 h-7 text-xs">Apply Concession</Button>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Ledger ──────────────────────────────────────────────────────────────

const CHALLAN_STATUS_CLASSES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  paid:    "bg-emerald-100 text-emerald-700",
  partial: "bg-blue-100 text-blue-700",
  overdue: "bg-red-100 text-red-700",
};
const CHALLAN_STATUS_LABELS: Record<string, string> = {
  pending: "Pending", paid: "Paid", partial: "Partial", overdue: "Overdue",
};

function today() { return new Date().toISOString().slice(0, 10); }

function TabLedger({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [confirmChallan, setConfirmChallan] = useState<FeeChallan | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [paidDate, setPaidDate] = useState(today());
  const [paidDateError, setPaidDateError] = useState("");

  const { data: challansRaw = [], isLoading } = useListAdminFeeChallans(
    { studentId },
    { query: { enabled: !!studentId, queryKey: getListAdminFeeChallansQueryKey({ studentId }) } },
  );
  const challans = challansRaw as FeeChallan[];

  const { data: bankAccountsRaw = [] } = useListAdminBankAccounts();
  const bankAccounts = bankAccountsRaw as CashBankAccount[];
  const cashAccounts = bankAccounts.filter(a => a.type === "cash" && a.isActive);
  const bankOnlyAccounts = bankAccounts.filter(a => a.type === "bank" && a.isActive);
  const noPaymentAccounts = cashAccounts.length === 0 && bankOnlyAccounts.length === 0;

  const markPaidMut = useMarkAdminFeeChallanPaid({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getListAdminFeeChallansQueryKey({ studentId }) });
        const updatedChallan = data as FeeChallan;
        toast({ title: updatedChallan.status === "paid" ? "Challan marked as paid" : "Partial payment recorded" });
        setConfirmChallan(null);
        setPaidDate(today());
        setPaidDateError("");
      },
      onError: (err: any) => {
        const msg: string = err?.data?.error ?? err?.message ?? "Failed to record payment";
        if (msg.toLowerCase().includes("date") || err?.data?.field === "paidAt") {
          setPaidDateError(msg);
        } else {
          toast({ title: "Failed to record payment", description: msg, variant: "destructive" });
        }
      },
    },
  });

  const totalPaid    = challans.reduce((s, c) => {
    if (c.status === "paid") return s + c.amount;
    if (c.status === "partial" && c.paidAmount) return s + c.paidAmount;
    return s;
  }, 0);
  const totalDue     = challans.reduce((s, c) => {
    if (c.status === "paid") return s;
    if (c.status === "partial" && c.paidAmount) return s + (c.amount - c.paidAmount);
    return s + c.amount;
  }, 0);
  const overdueCount = challans.filter(c => c.status === "overdue").length;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={CheckCircle2} label="Total Paid"      value={formatCurrency(totalPaid)}  sub="All time"              color="bg-emerald-100 text-emerald-600" />
        <StatCard icon={AlertCircle}  label="Outstanding"     value={formatCurrency(totalDue)}   sub="Unpaid"                color={totalDue > 0 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600"} />
        <StatCard icon={Receipt}      label="Challans Raised" value={String(challans.length)}             sub={`${overdueCount} overdue`} color="bg-indigo-100 text-indigo-600" />
      </div>

      {challans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
          <Receipt className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">No challans on record</p>
          <p className="text-xs">Challans generated from Fee Master will appear here.</p>
        </div>
      ) : (
        <SectionCard title="Payment History" icon={Receipt}>
          <div className="space-y-2">
            {challans.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                  c.status === "overdue" ? "border-red-200 bg-red-50" : "border-border bg-white hover:bg-slate-50/60",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-800">{c.feeTypeName}</span>
                    <span className="font-mono text-xs text-slate-400">{c.feeCode}</span>
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      CHALLAN_STATUS_CLASSES[c.status] ?? "bg-slate-100 text-slate-600",
                    )}>
                      {CHALLAN_STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.month ? `${c.month} · ` : ""}{c.academicYearName} · Due: {c.dueDate}
                    {c.paidAt && <span className="text-emerald-600"> · Paid: {formatDate(c.paidAt)}</span>}
                    {c.remarks && <span className="text-slate-400"> · {c.remarks}</span>}
                  </p>
                  {c.status === "partial" && c.paidAmount != null && (
                    <p className="text-xs mt-0.5">
                      <span className="text-emerald-600 font-medium">Paid: {formatCurrency(c.paidAmount)}</span>
                      <span className="text-slate-400"> · </span>
                      <span className="text-red-500 font-medium">Remaining: {formatCurrency(c.amount - c.paidAmount)}</span>
                    </p>
                  )}
                </div>
                <p className="font-extrabold text-slate-900 font-mono">{formatCurrency(c.amount)}</p>
                {c.status !== "paid" && (
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => {
                      setConfirmChallan(c);
                      setPaidDate(today());
                      setPaidDateError("");
                      const remaining = c.status === "partial" && c.paidAmount != null
                        ? c.amount - c.paidAmount
                        : c.amount;
                      setPayAmount(remaining);
                    }}
                  >
                    {c.status === "partial" ? "Pay Remaining" : "Mark Paid"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Mark Paid confirmation dialog */}
      <Dialog open={!!confirmChallan} onOpenChange={open => { if (!open) setConfirmChallan(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {confirmChallan && (() => {
            const alreadyPaid = confirmChallan.status === "partial" && confirmChallan.paidAmount != null
              ? confirmChallan.paidAmount : 0;
            const maxPayable  = confirmChallan.amount - alreadyPaid;
            const isPartial   = payAmount > 0 && payAmount < maxPayable;
            const remaining   = payAmount > 0 ? maxPayable - payAmount : 0;
            const amountInvalid = payAmount <= 0 || payAmount > maxPayable;
            return (
              <div className="space-y-3 py-1 text-sm text-slate-700">
                <p>
                  <span className="font-semibold">{confirmChallan.feeTypeName}</span>
                  {alreadyPaid > 0 && (
                    <span className="text-slate-500"> · Already paid: <span className="font-mono">{formatCurrency(alreadyPaid)}</span></span>
                  )}
                </p>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">
                    Amount paid <span className="text-slate-400">(max {formatCurrency(maxPayable)})</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={maxPayable}
                    value={payAmount || ""}
                    onChange={e => setPayAmount(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder={`e.g. ${maxPayable}`}
                  />
                  {isPartial && remaining > 0 && (
                    <p className="text-xs text-blue-600 font-medium">
                      Remaining after this payment: {formatCurrency(remaining)}
                    </p>
                  )}
                  {amountInvalid && payAmount !== 0 && (
                    <p className="text-xs text-red-500">Enter an amount between 1 and {formatCurrency(maxPayable)}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Payment date</label>
                  <input
                    type="date"
                    value={paidDate}
                    max={today()}
                    onChange={e => { setPaidDate(e.target.value); if (e.target.value <= today()) setPaidDateError(""); }}
                    className={cn(
                      "w-full rounded-md border bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring",
                      paidDateError ? "border-red-400 focus:ring-red-400" : "border-input",
                    )}
                  />
                  {paidDateError && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />{paidDateError}
                    </p>
                  )}
                </div>
                {noPaymentAccounts && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 leading-snug">
                      <span className="font-semibold">No payment accounts configured</span>
                      {" — "}
                      <a href="/admin/accounts?tab=setup" target="_blank" className="underline hover:text-amber-900">
                        set up a Cash or Bank account first
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {confirmChallan && (() => {
            const alreadyPaid = confirmChallan.status === "partial" && confirmChallan.paidAmount != null
              ? confirmChallan.paidAmount : 0;
            const maxPayable  = confirmChallan.amount - alreadyPaid;
            const isPartialSubmit = payAmount > 0 && payAmount < maxPayable;
            const invalid = payAmount <= 0 || payAmount > maxPayable;
            const dateInvalid = !paidDate || paidDate > today();
            return (
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setConfirmChallan(null)} disabled={markPaidMut.isPending}>
                  Cancel
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={markPaidMut.isPending || noPaymentAccounts || invalid || dateInvalid}
                  onClick={() => {
                    if (dateInvalid) { setPaidDateError("Payment date cannot be in the future"); return; }
                    setPaidDateError("");
                    markPaidMut.mutate({ id: confirmChallan.id, data: { paidAmount: payAmount, paidAt: paidDate } });
                  }}
                >
                  {markPaidMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                  {isPartialSubmit ? "Record Partial Payment" : "Confirm Full Payment"}
                </Button>
              </DialogFooter>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab: Attendance ──────────────────────────────────────────────────────────

function TabAttendance({ studentId }: { studentId: string }) {
  const { data: records = [], isLoading } = useQuery<{ attendanceDate: string; status: string }[]>({
    queryKey: ["student-attendance", studentId],
    queryFn: () => apiFetch(`/api/admin/students/attendance?studentId=${studentId}`),
    enabled: !!studentId,
  });

  if (isLoading) return <div className="space-y-2">{[...Array(4)].map((_,i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>;

  const totalPresent = records.filter(r => r.status === "present").length;
  const totalAbsent  = records.filter(r => r.status === "absent").length;
  const totalLate    = records.filter(r => r.status === "late").length;
  const totalDays    = records.length;
  const overallPct   = totalDays > 0 ? Math.round(((totalPresent + totalLate) / totalDays) * 100) : 0;

  // Group by YYYY-MM
  const byMonth = new Map<string, { present: number; absent: number; late: number; total: number }>();
  for (const r of records) {
    const key = r.attendanceDate.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, { present: 0, absent: 0, late: 0, total: 0 });
    const m = byMonth.get(key)!;
    m.total++;
    if (r.status === "present") m.present++;
    else if (r.status === "absent") m.absent++;
    else if (r.status === "late") m.late++;
  }
  const months = Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([key, v]) => {
    const [yr, mo] = key.split("-");
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const d2 = new Date(Number(yr), Number(mo) - 1, 1);
    const label = `${monthNames[d2.getMonth()]} ${String(d2.getFullYear()).slice(-2)}`;
    return { label, ...v };
  });

  return (
    <div className="flex flex-col gap-4">
      {totalDays === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
          <Calendar className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">No attendance records yet</p>
          <p className="text-xs">Attendance marked from the Attendance module will appear here.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={CheckCircle2} label="Present"  value={String(totalPresent)} sub="Days"         color="bg-emerald-100 text-emerald-600" />
            <StatCard icon={AlertCircle}  label="Absent"   value={String(totalAbsent)}  sub="Days"         color="bg-red-100 text-red-600" />
            <StatCard icon={Clock}        label="Late"     value={String(totalLate)}     sub="Days"         color="bg-amber-100 text-amber-600" />
            <StatCard icon={TrendingUp}   label="Rate"     value={`${overallPct}%`}      sub="Overall"      color="bg-blue-100 text-blue-600" />
          </div>

          <SectionCard title="Monthly Breakdown" icon={Calendar}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400 w-24">Month</th>
                    <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Attendance</th>
                    <th className="text-right py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400 w-24">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {months.map((row) => {
                    const pct = row.total > 0 ? Math.round(((row.present + row.late) / row.total) * 100) : 0;
                    return (
                      <tr key={row.label}>
                        <td className="py-3 font-semibold text-slate-700">{row.label}</td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <Progress value={pct} className="h-2 flex-1" />
                            <span className="text-xs text-muted-foreground w-20 shrink-0 text-right">{row.present + row.late}/{row.total} days</span>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <span className={cn("text-xs font-bold", pct >= 85 ? "text-emerald-600" : pct >= 75 ? "text-amber-600" : "text-red-600")}>
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── Tab: Exams ───────────────────────────────────────────────────────────────

function TabExams({ studentId }: { studentId: string }) {
  const { data: sessions = [], isLoading } = useQuery<{
    sessionLabel: string;
    totalObtained: number;
    totalMax: number;
    percentage: number | null;
    subjects: { subjectName: string; totalMarks: number; obtainedMarks: number | null; isAbsent: boolean; passMarks: number }[];
  }[]>({
    queryKey: ["student-exam-results", studentId],
    queryFn: () => apiFetch(`/api/admin/exams/student-results?studentId=${studentId}`),
    enabled: !!studentId,
  });

  if (isLoading) return <div className="space-y-2">{[...Array(3)].map((_,i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>;

  if (sessions.length === 0) return (
    <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
      <BarChart3 className="h-10 w-10 opacity-20" />
      <p className="text-sm font-medium">No exam results yet</p>
      <p className="text-xs">Results entered in the Exams module will appear here.</p>
    </div>
  );

  const latest = sessions[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={Award}    label="Latest Session"  value={latest.sessionLabel} sub="Most recent"     color="bg-emerald-100 text-emerald-600" />
        <StatCard icon={BarChart3} label="Latest Score"   value={latest.percentage !== null ? `${latest.percentage}%` : "—"} sub={`${latest.totalObtained}/${latest.totalMax} marks`} color="bg-blue-100 text-blue-600" />
        <StatCard icon={Star}     label="Sessions Taken"  value={String(sessions.length)} sub="Total sessions"  color="bg-amber-100 text-amber-600" />
      </div>

      {sessions.map((sess) => (
        <SectionCard key={sess.sessionLabel} title={sess.sessionLabel} icon={BarChart3}
          action={
            <span className={cn("text-base font-black", (sess.percentage ?? 0) >= 80 ? "text-emerald-600" : (sess.percentage ?? 0) >= 60 ? "text-amber-600" : "text-red-600")}>
              {sess.percentage !== null ? `${sess.percentage}%` : "—"}
            </span>
          }>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Subject</th>
                  <th className="text-center py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Marks</th>
                  <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400 pl-4">Progress</th>
                  <th className="text-center py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sess.subjects.map((sub) => {
                  const pct = sub.totalMarks > 0 && sub.obtainedMarks !== null ? Math.round((sub.obtainedMarks / sub.totalMarks) * 100) : 0;
                  const passed = sub.obtainedMarks !== null && sub.obtainedMarks >= sub.passMarks;
                  return (
                    <tr key={sub.subjectName} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 font-semibold text-slate-700">{sub.subjectName}</td>
                      <td className="py-2.5 text-center font-mono font-bold text-slate-800">
                        {sub.isAbsent ? <span className="text-xs text-muted-foreground italic">Absent</span> : `${sub.obtainedMarks ?? "—"}/${sub.totalMarks}`}
                      </td>
                      <td className="py-2.5 pl-4 pr-4 w-48">
                        {!sub.isAbsent && <Progress value={pct} className="h-1.5" />}
                      </td>
                      <td className="py-2.5 text-center">
                        {sub.isAbsent
                          ? <span className="text-xs font-bold text-slate-400">Absent</span>
                          : <span className={cn("text-xs font-extrabold", passed ? "text-emerald-600" : "text-red-600")}>{passed ? "Pass" : "Fail"}</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-border">
                <tr>
                  <td className="py-2.5 font-extrabold text-slate-900">Total</td>
                  <td className="py-2.5 text-center font-mono font-extrabold text-slate-900">{sess.totalObtained}/{sess.totalMax}</td>
                  <td />
                  <td className="py-2.5 text-center">
                    <span className={cn("text-xs font-extrabold", (sess.percentage ?? 0) >= 60 ? "text-emerald-600" : "text-red-600")}>
                      {sess.percentage !== null ? `${sess.percentage}%` : "—"}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

// ─── Tab: Library ─────────────────────────────────────────────────────────────

function TabLibrary({ studentId }: { studentId: string }) {
  const { data: books = [], isLoading } = useQuery<{
    id: string; bookTitle: string; bookAuthor: string | null;
    issueDate: string; dueDate: string; returnDate: string | null;
    status: string; fine: number | null;
  }[]>({
    queryKey: ["student-library", studentId],
    queryFn: () => apiFetch(`/api/admin/library/issues?studentId=${studentId}`),
    enabled: !!studentId,
  });

  if (isLoading) return <div className="space-y-2">{[...Array(3)].map((_,i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;

  const totalFine    = books.reduce((s, b) => s + Number(b.fine ?? 0), 0);
  const issuedCount  = books.filter((b) => b.status !== "returned").length;
  const overdueCount = books.filter((b) => b.status === "overdue").length;

  const STATUS_STYLES: Record<string, { text: string; classes: string; icon: React.ElementType }> = {
    returned: { text: "Returned", classes: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
    issued:   { text: "Issued",   classes: "bg-blue-100 text-blue-700",       icon: BookOpen     },
    overdue:  { text: "Overdue",  classes: "bg-red-100 text-red-700",         icon: AlertCircle  },
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={BookMarked}  label="Currently Issued" value={String(issuedCount)}                               sub="Books"      color="bg-blue-100 text-blue-600" />
        <StatCard icon={AlertCircle} label="Overdue"          value={String(overdueCount)}                              sub="Books"      color={overdueCount > 0 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600"} />
        <StatCard icon={Receipt}     label="Total Fine"       value={totalFine > 0 ? formatCurrency(totalFine) : "None"} sub="Outstanding" color={totalFine > 0 ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-600"} />
      </div>

      {books.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
          <Library className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">No library issues on record</p>
          <p className="text-xs">Issued books from the Library module will appear here.</p>
        </div>
      ) : (
        <SectionCard title="Books" icon={Library}>
          <div className="divide-y divide-border">
            {books.map((book) => {
              const s = STATUS_STYLES[book.status] ?? STATUS_STYLES.issued;
              const Icon = s.icon;
              return (
                <div key={book.id} className={cn(
                  "flex flex-col sm:flex-row sm:items-center gap-3 py-4 first:pt-0 last:pb-0",
                  book.status === "overdue" && "rounded-xl border border-red-100 bg-red-50/50 px-3 py-3",
                )}>
                  <Icon className={cn("h-5 w-5 shrink-0", book.status === "overdue" ? "text-red-500" : book.status === "issued" ? "text-blue-500" : "text-emerald-500")} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">{book.bookTitle}</p>
                    {book.bookAuthor && <p className="text-xs text-muted-foreground">{book.bookAuthor}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Issued: {book.issueDate} · Due: {book.dueDate}
                      {book.returnDate && <span className="text-emerald-600"> · Returned: {book.returnDate}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(book.fine ?? 0) > 0 && (
                      <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                        Fine: {formatCurrency(book.fine ?? 0)}
                      </span>
                    )}
                    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", s.classes)}>
                      {s.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ─── Tab: Hostel ──────────────────────────────────────────────────────────────

function TabHostel({ studentId }: { studentId: string }) {
  const { data: allocations = [], isLoading } = useQuery<{
    id: string; block: string | null; room: string | null; bedNumber: string | null;
    fromDate: string | null; toDate: string | null; status: string; notes: string | null;
  }[]>({
    queryKey: ["student-hostel", studentId],
    queryFn: () => apiFetch(`/api/admin/hostel/allocations?studentId=${studentId}`),
    enabled: !!studentId,
  });

  if (isLoading) return <div className="space-y-2">{[...Array(2)].map((_,i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>;

  const active = allocations.find(a => a.status === "active") ?? allocations[0] ?? null;

  if (!active) return (
    <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
      <Home className="h-10 w-10 opacity-20" />
      <p className="text-sm font-medium">No hostel allocation on record</p>
      <p className="text-xs">Allocations from the Hostel module will appear here.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Room Allocation" icon={Home}
        action={
          <span className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-0.5",
            active.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>
            {active.status}
          </span>
        }>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-5">
          <InfoField label="Block / Wing"  value={active.block ?? "—"} />
          <InfoField label="Room"          value={active.room ?? "—"} mono />
          <InfoField label="Bed"           value={active.bedNumber ?? "—"} />
          <InfoField label="Check-In Date" value={active.fromDate ?? "—"} />
          {active.toDate && <InfoField label="Check-Out Date" value={active.toDate} />}
        </div>
        {active.notes && (
          <>
            <Separator className="my-4" />
            <p className="text-xs text-muted-foreground">{active.notes}</p>
          </>
        )}
      </SectionCard>

      {allocations.length > 1 && (
        <SectionCard title="Allocation History" icon={History}>
          <div className="divide-y divide-border">
            {allocations.map(a => (
              <div key={a.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{[a.block, a.room, a.bedNumber].filter(Boolean).join(" · ") || "—"}</p>
                  <p className="text-xs text-muted-foreground">{a.fromDate ?? "?"} → {a.toDate ?? "Present"}</p>
                </div>
                <span className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-0.5",
                  a.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <DisciplinarySection studentId={studentId} />
    </div>
  );
}

// ─── Disciplinary Section (used inside TabHostel) ─────────────────────────────

function DisciplinarySection({ studentId }: { studentId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    incidentDate: new Date().toISOString().slice(0, 10),
    type: "warning",
    severity: "minor",
    description: "",
    actionTaken: "",
    reportedBy: "",
  });

  type DiscRow = { id: string; incidentDate: string; severity: string; type: string; description: string; actionTaken: string | null; reportedBy: string | null; status: string };
  const { data: incidents = [], isLoading } = useQuery<DiscRow[]>({
    queryKey: ["student-disciplinary", studentId],
    queryFn: () => apiFetch(`/api/admin/students/${studentId}/disciplinary`),
    enabled: !!studentId,
  });

  async function handleAdd() {
    if (!form.description.trim()) { toast({ title: "Description is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const token = (await import("@/lib/auth")).getToken();
      const res = await fetch(`/api/admin/students/${studentId}/disciplinary`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      qc.invalidateQueries({ queryKey: ["student-disciplinary", studentId] });
      setShowForm(false);
      setForm({ incidentDate: new Date().toISOString().slice(0, 10), type: "warning", severity: "minor", description: "", actionTaken: "", reportedBy: "" });
      toast({ title: "Incident recorded" });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const token = (await import("@/lib/auth")).getToken();
    await fetch(`/api/admin/students/${studentId}/disciplinary/${id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    qc.invalidateQueries({ queryKey: ["student-disciplinary", studentId] });
    toast({ title: "Record deleted" });
  }

  const SEVERITY_COLORS: Record<string, string> = {
    minor: "bg-yellow-100 text-yellow-700",
    moderate: "bg-orange-100 text-orange-700",
    severe: "bg-red-100 text-red-700",
  };

  return (
    <SectionCard title="Incidents & Notes" icon={AlertTriangle}
      action={
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowForm(v => !v)}>
          <AlertTriangle className="h-3 w-3" /> {showForm ? "Cancel" : "Add Incident"}
        </Button>
      }>
      {showForm && (
        <div className="mb-4 p-4 rounded-xl border border-orange-200 bg-orange-50/60 flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Date</label>
              <input type="date" value={form.incidentDate} onChange={e => setForm(f => ({ ...f, incidentDate: e.target.value }))}
                className="text-xs border border-border rounded-md px-2 py-1.5 bg-white" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="text-xs border border-border rounded-md px-2 py-1.5 bg-white">
                <option value="warning">Warning</option>
                <option value="detention">Detention</option>
                <option value="suspension">Suspension</option>
                <option value="fine">Fine</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Severity</label>
              <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                className="text-xs border border-border rounded-md px-2 py-1.5 bg-white">
                <option value="minor">Minor</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Description *</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className="text-xs border border-border rounded-md px-2 py-1.5 bg-white resize-none"
              placeholder="Describe the incident..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Action Taken</label>
              <input type="text" value={form.actionTaken} onChange={e => setForm(f => ({ ...f, actionTaken: e.target.value }))}
                className="text-xs border border-border rounded-md px-2 py-1.5 bg-white" placeholder="Optional" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reported By</label>
              <input type="text" value={form.reportedBy} onChange={e => setForm(f => ({ ...f, reportedBy: e.target.value }))}
                className="text-xs border border-border rounded-md px-2 py-1.5 bg-white" placeholder="Officer name" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" className="h-7 text-xs gap-1" onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
              Save Incident
            </Button>
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="space-y-2">{[...Array(2)].map((_,i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
          <CheckCircle2 className="h-10 w-10 text-emerald-200" />
          <p className="text-sm font-semibold text-slate-500">No incidents on record</p>
          <p className="text-xs text-muted-foreground">Cadet has a clean disciplinary record.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {incidents.map(inc => (
            <div key={inc.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-700 capitalize">{inc.type}</span>
                    <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5 capitalize", SEVERITY_COLORS[inc.severity] ?? "bg-slate-100 text-slate-600")}>{inc.severity}</span>
                    <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5", inc.status === "open" ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600")}>{inc.status}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{inc.incidentDate}</span>
                  </div>
                  <p className="text-xs text-slate-700">{inc.description}</p>
                  {inc.actionTaken && <p className="text-xs text-muted-foreground mt-0.5">Action: {inc.actionTaken}</p>}
                  {inc.reportedBy && <p className="text-xs text-muted-foreground">Reported by: {inc.reportedBy}</p>}
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                  onClick={() => handleDelete(inc.id)} title="Delete">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Tab: Enrolment History ───────────────────────────────────────────────────

type EnrollmentEntry = {
  id: string; studentId: string; academicYearId: string | null; yearName: string | null;
  classCode: string; sectionId: string | null; sectionName: string | null;
  houseId: string | null; houseName: string | null; houseColor: string | null;
  startDate: string | null; endDate: string | null; status: string; createdAt: string;
};

function TabHistory({ studentId, className, sectionName, yearName }: {
  studentId: string; className: string; sectionName: string; yearName: string;
}) {
  type TimelineEvent = { id: string; date: string; category: string; title: string; description: string; meta?: string };
  const { data: events = [], isLoading } = useQuery<TimelineEvent[]>({
    queryKey: ["student-timeline", studentId],
    queryFn: () => apiFetch(`/api/admin/students/${studentId}/timeline`),
    enabled: !!studentId,
  });

  const { data: enrollments = [], isLoading: enrollmentsLoading } = useQuery<EnrollmentEntry[]>({
    queryKey: ["student-enrollments", studentId],
    queryFn: () => apiFetch(`/api/admin/students/${studentId}/enrollments`),
    enabled: !!studentId,
  });

  const CATEGORY_STYLES: Record<string, { icon: React.ElementType; dot: string; badge: string }> = {
    fee:          { icon: Receipt,       dot: "bg-emerald-400", badge: "bg-emerald-100 text-emerald-700" },
    library:      { icon: Library,       dot: "bg-purple-400",  badge: "bg-purple-100 text-purple-700" },
    hostel:       { icon: Home,          dot: "bg-orange-400",  badge: "bg-orange-100 text-orange-700" },
    disciplinary: { icon: AlertTriangle, dot: "bg-red-400",     badge: "bg-red-100 text-red-700" },
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Activity Timeline" icon={History}>
        {isLoading ? (
          <div className="space-y-3">{[...Array(4)].map((_,i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <History className="h-10 w-10 text-slate-200" />
            <p className="text-sm font-semibold text-slate-500">No activity yet</p>
            <p className="text-xs text-muted-foreground">Events from Fee, Library, Hostel and other modules will appear here.</p>
          </div>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-2 top-1 bottom-1 w-px bg-border" />
            <div className="flex flex-col gap-0">
              {events.map((ev, idx) => {
                const style = CATEGORY_STYLES[ev.category] ?? { icon: Clock, dot: "bg-slate-300", badge: "bg-slate-100 text-slate-600" };
                const Icon = style.icon;
                return (
                  <div key={ev.id} className={cn("relative flex gap-3 py-3", idx !== events.length - 1 && "border-b border-border/60")}>
                    <div className={cn("absolute -left-4 top-4 h-2.5 w-2.5 rounded-full ring-2 ring-white shrink-0", style.dot)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5 flex items-center gap-1", style.badge)}>
                          <Icon className="h-2.5 w-2.5" />
                          {ev.category}
                        </span>
                        {ev.meta && (
                          <span className="text-[10px] text-muted-foreground capitalize">{ev.meta}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto">{ev.date}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{ev.title}</p>
                      <p className="text-xs text-muted-foreground">{ev.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Class/Program Progression" icon={GraduationCap}>
        {enrollmentsLoading ? (
          <div className="space-y-2">{[...Array(2)].map((_,i) => <Skeleton key={i} className="h-10 rounded-md" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Year</th>
                  <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Class</th>
                  <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Section</th>
                  <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">House</th>
                  <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Period</th>
                  <th className="text-left py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {enrollments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                      No enrollment records yet. Records are created when a student is enrolled.
                    </td>
                  </tr>
                ) : enrollments.map((e) => {
                  const STATUS_COLORS: Record<string, string> = {
                    active:      "bg-emerald-100 text-emerald-700",
                    promoted:    "bg-blue-100 text-blue-700",
                    transferred: "bg-amber-100 text-amber-700",
                    left:        "bg-red-100 text-red-700",
                  };
                  const badgeCls = STATUS_COLORS[e.status] ?? "bg-slate-100 text-slate-600";
                  const period = [e.startDate, e.endDate].filter(Boolean).join(" → ");
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 font-semibold text-slate-700">{e.yearName || "—"}</td>
                      <td className="py-3 font-semibold text-slate-800">{classLabel(e.classCode)}</td>
                      <td className="py-3 text-slate-600">{e.sectionName || "—"}</td>
                      <td className="py-3">
                        {e.houseName ? (
                          <span className="flex items-center gap-1.5">
                            {e.houseColor && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: e.houseColor }} />}
                            <span className="text-slate-600">{e.houseName}</span>
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">{period || (e.status === "active" ? "Ongoing" : "—")}</td>
                      <td className="py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold capitalize", badgeCls)}>{e.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TABS: Tab[] = [
  { key: "details",    label: "Basic Details",      icon: User        },
  { key: "academic",   label: "Academic",           icon: GraduationCap },
  { key: "fees",       label: "Fee Structure",       icon: DollarSign  },
  { key: "ledger",     label: "Ledger",              icon: Receipt     },
  { key: "attendance", label: "Attendance",          icon: Calendar    },
  { key: "exams",      label: "Exams",               icon: BarChart3   },
  { key: "library",    label: "Library",             icon: Library     },
  { key: "hostel",     label: "Hostel",              icon: Home        },
  { key: "history",    label: "Enrolment History",   icon: History     },
];

export default function StudentProfile() {
  const { applicantId } = useParams<{ applicantId: string }>();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState(
    () => new URLSearchParams(window.location.search).get("tab") ?? "details",
  );
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Detect legacy UUID bookmarks — redirect to the clean GR-number URL
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicantId ?? "");

  // Normal path: look up by Applicant ID (generated hook auto-attaches auth token)
  const { data: student, isLoading: grLoading, isError } = useGetAdminStudentByGr(applicantId!, {
    query: { enabled: !!applicantId && !isUUID, queryKey: getGetAdminStudentByGrQueryKey(applicantId!) },
  });

  // Legacy UUID path: fetch by ID to discover the Applicant ID, then redirect
  const { data: legacyStudent } = useGetAdminStudent(isUUID ? applicantId! : "", {
    query: {
      enabled: !!applicantId && isUUID,
      queryKey: getGetAdminStudentQueryKey(isUUID ? applicantId! : ""),
    },
  });
  useEffect(() => {
    const grn = (legacyStudent as AdminStudentDetail | undefined)?.applicantId;
    if (isUUID && grn) navigate(`/students/${grn}`);
  }, [isUUID, (legacyStudent as AdminStudentDetail | undefined)?.applicantId]);

  // UUID used for all internal operations (mutations, sub-queries, etc.)
  const id = student?.id ?? "";
  const isLoading = isUUID || grLoading;

  const { data: sectionsData = [] } = useListAdminSections();
  const { data: housesData   = [] } = useListAdminHouses();
  const { data: classesData  = [] } = useListAdminClasses();
  const { data: yearsData    = [] } = useListAdminAcademicYears();

  const sections = sectionsData as any[];
  const houses   = housesData   as any[];
  const years    = yearsData    as any[];

  const sectionName = sections.find((s: any) => s.id === student?.sectionId)?.name ?? "";
  const houseName   = houses.find((h: any) => h.id === student?.houseId)?.name ?? "";
  const houseColor  = houses.find((h: any) => h.id === student?.houseId)?.color ?? null;
  const yearName    = years.find((y: any) => y.id === student?.academicYearId)?.name ?? "";
  const className   = classLabel(student?.classCode ?? "");

  // ── Challan data (for badge + alert) ─────────────────────────────────────────
  const { data: challansForBadgeRaw = [] } = useListAdminFeeChallans(
    { studentId: id! },
    { query: { enabled: !!id, queryKey: getListAdminFeeChallansQueryKey({ studentId: id! }) } },
  );
  const challansForBadge = challansForBadgeRaw as import("@workspace/api-client-react").FeeChallan[];
  const overdueChallans  = challansForBadge.filter((c) => c.status === "overdue");

  // ── Library issues (for fine badge) ──────────────────────────────────────────
  const { data: libraryIssuesForBadge = [] } = useQuery<{ fine: number | null }[]>({
    queryKey: ["student-library", id!],
    queryFn: () => apiFetch(`/api/admin/library/issues?studentId=${id}`),
    enabled: !!id,
  });

  // ── Derived ──────────────────────────────────────────────────────────────────
  const totalFine = (libraryIssuesForBadge as { fine: number | null }[]).reduce((s, b) => s + Number(b.fine ?? 0), 0);
  const feeDue    = challansForBadge.filter((c) => c.status !== "paid").reduce((s, c) => s + Number(c.amount ?? 0), 0);

  // Badge overrides on tabs
  const tabBadges: Record<string, { label: string; variant: "destructive" | "secondary" }> = {};
  if (overdueChallans.length > 0) tabBadges["ledger"]  = { label: String(overdueChallans.length), variant: "destructive" };
  if (totalFine > 0)              tabBadges["library"] = { label: `Fine`,                         variant: "destructive" };

  // ── Loading / Error ───────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="max-w-[1100px] mx-auto space-y-4">
      <Skeleton className="h-8 w-48" />
      <ProfileSkeleton />
    </div>
  );

  if (isError || !student) return (
    <div className="flex flex-col items-center justify-center py-32 gap-3">
      <AlertCircle className="h-12 w-12 text-muted-foreground opacity-40" />
      <p className="font-semibold text-slate-700">Student not found</p>
      <Button variant="ghost" size="sm" onClick={() => navigate("/students")}>← Back to Students</Button>
    </div>
  );

  const statusMeta = STATUS_META[student.status] ?? STATUS_META.active;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-4">

      {/* ── Breadcrumb ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => navigate("/students")}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-semibold transition-colors"
        >
          <ChevronLeft className="h-4 w-4" /> Students
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-semibold text-foreground">{student.fullName}</span>
      </div>

      {/* ── Hero card ─────────────────────────────────────────────────────── */}
      <div
        className="relative rounded-2xl overflow-hidden border border-slate-800"
        style={{ background: "linear-gradient(135deg,#0f172a 0%,#1a1040 60%,#0f2027 100%)" }}
      >
        {/* House glow */}
        {houseColor && (
          <div
            className="absolute -top-12 -right-12 h-48 w-48 rounded-full opacity-20 blur-3xl pointer-events-none"
            style={{ backgroundColor: houseColor }}
          />
        )}

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5 p-6">
          {/* Avatar */}
          <div
            className="h-20 w-20 rounded-2xl flex items-center justify-center border-2 shrink-0 shadow-xl overflow-hidden"
            style={{ borderColor: houseColor ?? "#334155", backgroundColor: `${houseColor ?? "#1e293b"}33` }}
          >
            {student.photoFilename && (
              <img
                src={student.photoFilename.startsWith("http") || student.photoFilename.startsWith("/") ? student.photoFilename : `/uploads/${student.photoFilename}`}
                alt={student.fullName}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex");
                }}
              />
            )}
            <span
              className="text-3xl font-black text-white"
              style={{ display: student.photoFilename ? "none" : "flex" }}
            >
              {initials(student)}
            </span>
          </div>

          {/* Name / meta */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-extrabold text-white tracking-tight" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                {student.fullName}
              </h1>
              <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold", statusMeta.classes)}>
                {statusMeta.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
              <span className="flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" />
                <span className="font-mono font-bold text-white/70">{student.applicantId}</span>
              </span>
              <span className="text-slate-600">·</span>
              <span className="flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" />
                {className}
                {sectionName && <span className="text-white/40"> / {sectionName}</span>}
              </span>
              {houseName && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="flex items-center gap-1.5">
                    {houseColor && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: houseColor }} />}
                    {houseName} House
                  </span>
                </>
              )}
              {yearName && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {yearName}
                  </span>
                </>
              )}
            </div>
            {student.enrollmentDate && (
              <p className="mt-1 text-xs text-slate-500">Enrolled {student.enrollmentDate}</p>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button size="sm" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 gap-1.5"
              onClick={() => { setActiveTab("ledger"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              <Receipt className="h-3.5 w-3.5" /> View Ledger
            </Button>
            <Button size="sm" className="gap-1.5 bg-white text-slate-900 hover:bg-white/90"
              onClick={() => setEditDialogOpen(true)}>
              <FileText className="h-3.5 w-3.5" /> Edit Profile
            </Button>
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px border-t border-white/10 bg-white/5">
          {[
            { label: "Attendance",   value: "—",         positive: true,  tab: "attendance" },
            { label: "Class/Program Rank",   value: "—",         positive: true,  tab: "exams"      },
            { label: "Fee Due",      value: feeDue > 0 ? formatCurrency(feeDue) : "None", positive: feeDue === 0, tab: "ledger" },
            { label: "Library Fine", value: totalFine > 0 ? formatCurrency(totalFine) : "None", positive: totalFine === 0, tab: "library" },
          ].map((stat) => (
            <button
              key={stat.label}
              onClick={() => { setActiveTab(stat.tab); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              className="text-left px-5 py-3 bg-white/5 hover:bg-white/10 transition-colors"
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{stat.label}</p>
              <p className={cn("text-lg font-extrabold mt-0.5", stat.positive ? "text-emerald-400" : "text-red-400")}>
                {stat.value}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Alert banners ─────────────────────────────────────────────────── */}
      {(overdueChallans.length > 0 || totalFine > 0) && (
        <div className="flex flex-wrap gap-2">
          {overdueChallans.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 font-semibold">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              {overdueChallans.length} fee challan{overdueChallans.length > 1 ? "s" : ""} overdue
              <Button size="sm" variant="ghost" className="h-6 text-xs text-red-600 hover:bg-red-100 ml-1"
                onClick={() => setActiveTab("ledger")}>
                View →
              </Button>
            </div>
          )}
          {totalFine > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-700 font-semibold">
              <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
              Library fine pending: {formatCurrency(totalFine)}
              <Button size="sm" variant="ghost" className="h-6 text-xs text-orange-600 hover:bg-orange-100 ml-1"
                onClick={() => setActiveTab("library")}>
                View →
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Tab layout ────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>

        {/* Tab bar */}
        <div className="rounded-xl border border-border bg-white shadow-sm overflow-x-auto">
          <TabsList className="flex w-full h-auto bg-transparent p-0 rounded-none gap-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const badge = tabBadges[tab.key];
              return (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className={cn(
                    "relative flex items-center gap-2 px-4 py-3.5 rounded-none text-xs font-semibold transition-all border-b-2 whitespace-nowrap flex-1",
                    "text-slate-500 border-transparent bg-transparent shadow-none",
                    "hover:text-slate-800 hover:bg-slate-50/60",
                    "data-[state=active]:text-indigo-700 data-[state=active]:border-indigo-600 data-[state=active]:bg-indigo-50/50",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {badge && (
                    <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white">
                      {badge.label}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Tab content panels */}
        <TabsContent value="details"    className="mt-0">
          <TabBasicDetails student={student} studentId={id!} className={className} sectionName={sectionName}
            houseName={houseName} houseColor={houseColor} yearName={yearName} statusMeta={statusMeta} />
        </TabsContent>
        <TabsContent value="academic"   className="mt-0">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-indigo-500" /> Academic Placement
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Class</p>
                  <p className="text-sm font-semibold text-slate-800">{className || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Section</p>
                  <p className="text-sm font-semibold text-slate-800">{sectionName || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">House</p>
                  <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    {houseColor && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: houseColor }} />}
                    {houseName || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Academic Year</p>
                  <p className="text-sm font-semibold text-slate-800">{yearName || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Enrollment Date</p>
                  <p className="text-sm font-semibold text-slate-800">{student.enrollmentDate ? formatDate(student.enrollmentDate) : "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Status</p>
                  <p className="text-sm font-semibold text-slate-800 capitalize">{student.status || "—"}</p>
                </div>
              </div>
            </div>
            <TabExams studentId={id!} />
          </div>
        </TabsContent>
        <TabsContent value="fees"       className="mt-0"><TabFeeStructure classCode={student.classCode ?? ""} academicYearId={student.academicYearId ?? ""} /></TabsContent>
        <TabsContent value="ledger"     className="mt-0"><TabLedger studentId={id!} /></TabsContent>
        <TabsContent value="attendance" className="mt-0"><TabAttendance studentId={id!} /></TabsContent>
        <TabsContent value="exams"      className="mt-0"><TabExams studentId={id!} /></TabsContent>
        <TabsContent value="library"    className="mt-0"><TabLibrary studentId={id!} /></TabsContent>
        <TabsContent value="hostel"     className="mt-0"><TabHostel studentId={id!} /></TabsContent>
        <TabsContent value="history"    className="mt-0"><TabHistory studentId={id!} className={className} sectionName={sectionName} yearName={yearName} /></TabsContent>

      </Tabs>

      <StudentFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editing={student as unknown as AdminStudentSummary}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: getGetAdminStudentByGrQueryKey(applicantId!) });
          queryClient.invalidateQueries({ queryKey: getGetAdminStudentQueryKey(student.id) });
        }}
        classes={classesData as any[]}
        sections={sectionsData as any[]}
        houses={housesData as any[]}
        years={yearsData as any[]}
      />

    </div>
  );
}
