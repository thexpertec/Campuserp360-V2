import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { displayCnic, displayPhone } from "@/lib/format";
import { formatCurrency } from "@/lib/locale";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  useGetAdminApplication,
  getGetAdminApplicationQueryKey,
  getGetAdminDashboardSummaryQueryKey,
  getListAdminApplicationsQueryKey,
  useUpdateAdminApplicationInfo,
  useAddAdminApplicationEvent,
  useEnrollAdminApplication,
  useGetAdminApplicationDuplicates,
  useListAdminClasses,
  useListAdminSections,
  useListAdminHouses,
  useListAdminAcademicYears,
  useGetAdminAdmissionPaymentConfig,
  getGetAdminApplicationDuplicatesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { ArrowLeft, MapPin, Phone, Mail, User, Briefcase, GraduationCap, Clock, RefreshCw, MessageSquarePlus, Loader2, CheckCircle2, XCircle, AlertCircle, BadgeCheck, Wand2, Upload, FileText, Camera, FilePlus2, ExternalLink, Banknote, Pencil } from "lucide-react";
import { getToken } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

import { Link, useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";


export default function ApplicationDetail() {
  const { referenceId } = useParams();
  const queryClient = useQueryClient();
  const [duplicateBannerDismissed, setDuplicateBannerDismissed] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetAdminApplicationQueryKey(referenceId || "") });
    queryClient.invalidateQueries({ queryKey: getGetAdminDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAdminApplicationsQueryKey() });
  };

  const updateInfoMutation = useUpdateAdminApplicationInfo();
  const patchInfo = useCallback(async (field: string, value: string) => {
    await updateInfoMutation.mutateAsync({
      referenceId: referenceId || "",
      data: { [field]: value } as any,
    });
    invalidate();
  }, [referenceId]);

  const { data: app, isLoading, error } = useGetAdminApplication(referenceId || "", {
    query: {
      enabled: !!referenceId,
      queryKey: getGetAdminApplicationQueryKey(referenceId || ""),
    }
  });

  const { data: payConfig } = useGetAdminAdmissionPaymentConfig();
  const appFeeAmount: number = (payConfig as any)?.applicationFeeAmount ?? 0;

  const { data: duplicatesData } = useGetAdminApplicationDuplicates(referenceId || "", {
    query: { enabled: !!referenceId && !isLoading && !error, queryKey: getGetAdminApplicationDuplicatesQueryKey(referenceId || "") },
  });

  const duplicates = duplicatesData?.duplicates ?? [];
  const showDuplicateBanner = !duplicateBannerDismissed && duplicates.length > 0;

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (error || !app) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-4">
        <p className="text-destructive font-medium text-lg">Application not found or access denied.</p>
        <Link href="/applications">
          <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Applications</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Duplicate warning banner */}
      {showDuplicateBanner && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Potential duplicate application detected</p>
            <p className="mt-0.5">
              This applicant shares the same email, phone, or B-form number with{" "}
              {duplicates.length === 1 ? "another application" : `${duplicates.length} other applications`}:{" "}
              {duplicates.map((d, i) => (
                <span key={d.referenceId}>
                  {i > 0 && ", "}
                  <Link href={`/applications/${d.referenceId}`}>
                    <span className="font-mono font-medium underline underline-offset-2 cursor-pointer hover:text-amber-700 dark:hover:text-amber-300">
                      {d.referenceId}
                    </span>
                  </Link>{" "}
                  <span className="text-amber-800 dark:text-amber-300">({d.fullName})</span>
                </span>
              ))}
              . Please review before proceeding.
            </p>
          </div>
          <button
            onClick={() => setDuplicateBannerDismissed(true)}
            className="shrink-0 rounded p-0.5 text-amber-600 hover:bg-amber-200/60 hover:text-amber-900 dark:text-amber-400 dark:hover:bg-amber-800/40 dark:hover:text-amber-100"
            aria-label="Dismiss"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <Link href="/applications">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 -ml-2 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight flex items-center gap-3">
              {app.fullName}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-9">
            <span className="font-mono text-sm text-primary font-medium">{app.referenceId}</span>
            <span className="text-muted-foreground text-sm">•</span>
            <span className="text-muted-foreground text-sm">Applied on {new Date(app.createdAt).toLocaleDateString()}</span>
            <span className="text-muted-foreground text-sm">•</span>
            <StatusBadge status={app.status} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Application Details</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="timeline">Activity Timeline</TabsTrigger>
            </TabsList>
            
            <TabsContent value="details" className="space-y-6 mt-6">
              {/* Student Information */}
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5 text-muted-foreground" />
                    Student Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                  <InlineEditField label="Full Name" value={app.fullName} onSave={v => patchInfo("fullName", v)} />
                  <InlineSelectField
                    label="Gender"
                    value={(app as any).gender ?? ""}
                    displayValue={(app as any).gender ? ({ male: "Male", female: "Female", other: "Other" }[(app as any).gender as string] ?? (app as any).gender) : "—"}
                    options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }]}
                    onSave={v => patchInfo("gender", v)}
                  />
                  <InlineEditField label="Date of Birth" value={app.dateOfBirth ? new Date(app.dateOfBirth).toLocaleDateString() : "—"} rawValue={app.dateOfBirth ?? ""} type="date" onSave={v => patchInfo("dateOfBirth", v)} />
                  <InlineEditField label="Blood Group" value={app.bloodGroup || "—"} onSave={v => patchInfo("bloodGroup", v)} />
                  <InlineEditField label="Religion" value={app.religion || "—"} onSave={v => patchInfo("religion", v)} />
                  <InlineEditField label="Mobile" value={app.studentMobile || "—"} type="tel" onSave={v => patchInfo("studentMobile", v)} />
                  <InlineEditField label="Email" value={app.studentEmail || "—"} type="email" onSave={v => patchInfo("studentEmail", v)} />
                </CardContent>
              </Card>

              {/* Admission Information */}
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-muted-foreground" />
                    Admission Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                  <InlineEditField label="Class/Program Applying For" value={app.classApplying || "—"} onSave={v => patchInfo("classApplying", v)} />
                  <InfoItem label="Session" value={app.session} />
                  <InlineEditField label="Previous School Marks" value={app.previousMarks || "—"} onSave={v => patchInfo("previousMarks", v)} />
                  <InlineEditField label="Exam Center" value={app.examCenter || "—"} onSave={v => patchInfo("examCenter", v)} />
                  {app.rollNumber && <InfoItem label="Roll Number" value={app.rollNumber} />}
                  {app.testDate && <InfoItem label="Test Date" value={new Date(app.testDate).toLocaleDateString()} />}
                  {app.resultMarks !== null && app.resultMarks !== undefined && <InfoItem label="Test Result (Marks)" value={app.resultMarks.toString()} />}
                </CardContent>
              </Card>

              {/* Guardian Information */}
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-muted-foreground" />
                    Parent/Guardian Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                  <InlineEditField label="Father's Name" value={app.fatherName || "—"} onSave={v => patchInfo("fatherName", v)} />
                  <InlineEditField label="Guardian Name" value={app.guardianName || "—"} onSave={v => patchInfo("guardianName", v)} />
                  <InlineEditField label="Relation" value={app.relation || "—"} onSave={v => patchInfo("relation", v)} />
                  <InlineEditField label="CNIC" value={displayCnic(app.parentCnic) || "—"} rawValue={app.parentCnic || ""} onSave={v => patchInfo("parentCnic", v)} />
                  <InlineEditField label="Mobile" value={displayPhone(app.guardianMobile) || "—"} rawValue={app.guardianMobile || ""} type="tel" onSave={v => patchInfo("guardianMobile", v)} />
                  <InlineEditField label="Occupation" value={app.occupation || "—"} onSave={v => patchInfo("occupation", v)} />
                </CardContent>
              </Card>

              {/* Address */}
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                    Address Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                  <InlineEditField label="Present Address" value={app.presentAddress || "—"} className="sm:col-span-2" onSave={v => patchInfo("presentAddress", v)} />
                  <InlineEditField label="City" value={app.city || "—"} onSave={v => patchInfo("city", v)} />
                  <InlineEditField label="State/Province" value={app.state || "—"} onSave={v => patchInfo("state", v)} />
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="documents" className="mt-6">
              <DocumentsTab referenceId={app.referenceId} candidateName={app.fullName} />
            </TabsContent>

            <TabsContent value="timeline" className="mt-6">
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    Activity Timeline
                  </CardTitle>
                  <CardDescription>Chronological history of this application</CardDescription>
                </CardHeader>
                <CardContent>
                  {app.events && app.events.length > 0 ? (
                    <div className="space-y-8 pl-4 py-2">
                      {app.events.map((event, i) => (
                        <div key={event.id} className="relative flex gap-6">
                          <div className="absolute -left-4 top-1 h-full w-px bg-border">
                            {i === app.events.length - 1 && <div className="absolute top-0 h-full w-full bg-card" />}
                          </div>
                          <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-card" />
                          <div className="flex-1 pb-2">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 mb-1">
                              <h4 className="text-sm font-medium text-foreground">{event.title}</h4>
                              <time className="text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(event.occurredAt).toLocaleDateString()} {new Date(event.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </time>
                            </div>
                            {event.description && (
                              <p className="text-sm text-muted-foreground">{event.description}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">No activity recorded yet.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="border-border shadow-sm overflow-hidden">
            <div className="bg-muted p-6 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 rounded-full bg-background border-4 border-card shadow-sm flex items-center justify-center mb-4 overflow-hidden">
                {app.photoFilename ? (
                  <img
                    src={app.photoFilename?.startsWith("http") || app.photoFilename?.startsWith("/") ? app.photoFilename : `/uploads/${app.photoFilename}`}
                    alt={app.fullName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                      (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex");
                    }}
                  />
                ) : null}
                <User className="h-10 w-10 text-muted-foreground" style={{ display: app.photoFilename ? "none" : "block" }} />
              </div>
              <h3 className="font-heading font-semibold text-lg">{app.fullName}</h3>
              <p className="text-sm text-muted-foreground mt-1">Applying for {app.classApplying}</p>
            </div>
            <CardContent className="p-0">
              <div className="flex flex-col">
                <ContactLink icon={<Phone className="h-4 w-4" />} label={app.studentMobile} href={`tel:${app.studentMobile}`} />
                <Separator />
                <ContactLink icon={<Mail className="h-4 w-4" />} label={app.studentEmail || 'No email provided'} href={app.studentEmail ? `mailto:${app.studentEmail}` : undefined} />
                <Separator />
                <ContactLink icon={<Phone className="h-4 w-4" />} label={`Guardian: ${app.guardianMobile}`} href={`tel:${app.guardianMobile}`} />
              </div>
            </CardContent>
          </Card>

          {/* Payment Status Card */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Payment Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {appFeeAmount > 0 && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground font-medium">Application Fee</span>
                  <span className="font-semibold text-foreground">{formatCurrency(appFeeAmount)}</span>
                </div>
              )}
              {(app as any).paymentMethod && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground font-medium">Payment Method</span>
                  <span className="font-semibold capitalize text-foreground">
                    {((app as any).paymentMethod as string)
                      .replace("_", " ")
                      .replace("bank deposit", "Bank Deposit")
                      .replace("jazzcash", "JazzCash")
                      .replace("payfast", "PayFast")
                      .replace("simulate", "Simulated")
                      .replace("free", "Free (No Fee)")}
                  </span>
                </div>
              )}
              <PaymentRow
                label="Application Fee"
                status={(app as any).feeStatus ?? "pending"}
                bankRef={(app as any).feeBankRef}
                confirmedAt={(app as any).feeConfirmedAt}
                receiptUrl={(app as any).feeReceiptUrl ?? null}
                paidAmount={(app as any).feePaidAmount ?? null}
                defaultAmount={appFeeAmount}
                referenceId={app.referenceId}
                feeType="fee"
                paymentMethod={(app as any).paymentMethod ?? null}
                feeSubmittedAt={(app as any).feeSubmittedAt ?? null}
                onConfirmed={invalidate}
              />
            </CardContent>
          </Card>

          <LifecycleActions
            referenceId={app.referenceId}
            currentStatus={app.status}
            admissionFeeStatus={(app as any).admissionFeeStatus}
            resultMarks={(app as any).resultMarks ?? null}
            interviewMarks={(app as any).interviewMarks ?? null}
            testDate={(app as any).testDate ?? null}
            interviewDate={(app as any).interviewDate ?? null}
            classApplying={app.classApplying ?? null}
            sectionAllocSectionId={(app as any).sectionAllocSectionId ?? null}
          />
        </div>
      </div>
    </div>
  );
}

// ── Document types shown by default even if not yet uploaded ─────────────────
const DEFAULT_DOC_TYPES = [
  { key: "b_form",      label: "B-Form / Birth Certificate" },
  { key: "marksheet",   label: "Academic Marksheet / Result" },
  { key: "photo",       label: "Passport Photo"               },
];

type DocRecord = {
  id: string; docType: string; originalName: string; url: string;
  mimeType: string; fileSize: number; status: string;
  rejectionReason?: string | null; uploadedAt: string;
};

function DocumentsTab({ referenceId, candidateName }: { referenceId: string; candidateName: string }) {
  const { toast } = useToast();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null); // docType being uploaded
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const pendingDocType = useRef<string>("");

  const authH = useCallback((): Record<string, string> => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, []);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/applications/${referenceId}/documents`, { headers: authH() });
      if (res.ok) {
        const data = await res.json();
        setPhotoUrl(data.photoUrl ?? null);
        setDocs(data.documents ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [referenceId, authH]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  async function uploadPhoto(file: File) {
    setUploading("__photo__");
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch(`/api/admin/applications/${referenceId}/photo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authH() },
        body: JSON.stringify({ fileBase64: base64, mimeType: file.type, originalName: file.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setPhotoUrl(data.photoUrl);
      toast({ title: "Photo updated" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Photo upload failed", description: e.message });
    } finally { setUploading(null); }
  }

  async function uploadDoc(file: File, docType: string) {
    setUploading(docType);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch(`/api/admin/applications/${referenceId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authH() },
        body: JSON.stringify({ docType, fileBase64: base64, mimeType: file.type, originalName: file.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      await loadDocs();
      toast({ title: "Document uploaded", description: `${docType.replace(/_/g, " ")} updated.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Upload failed", description: e.message });
    } finally { setUploading(null); }
  }

  // Merge default doc types with actual uploaded docs
  const docTypeMap = new Map<string, DocRecord | null>();
  DEFAULT_DOC_TYPES.forEach(d => docTypeMap.set(d.key, null));
  docs.forEach(d => docTypeMap.set(d.docType, d));

  const mergedRows: { key: string; label: string; doc: DocRecord | null }[] = [];
  DEFAULT_DOC_TYPES.forEach(dt => mergedRows.push({ key: dt.key, label: dt.label, doc: docTypeMap.get(dt.key) ?? null }));
  // Extra docs not in the default list
  docs.filter(d => !DEFAULT_DOC_TYPES.some(dt => dt.key === d.docType))
    .forEach(d => mergedRows.push({ key: d.docType, label: d.docType.replace(/_/g, " "), doc: d }));

  if (loading) return (
    <div className="space-y-3">
      {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Photo section */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4 text-muted-foreground" />
            Candidate Photo
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full border-2 border-border overflow-hidden bg-muted flex items-center justify-center shrink-0">
            {photoUrl && (
              <img
                src={photoUrl}
                alt={candidateName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex");
                }}
              />
            )}
            <User
              className="h-8 w-8 text-muted-foreground"
              style={{ display: photoUrl ? "none" : "flex" }}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">JPG or PNG, max 4 MB. Replaces the existing photo.</p>
            <Button
              size="sm" variant="outline" className="gap-1.5"
              disabled={uploading === "__photo__"}
              onClick={() => photoInputRef.current?.click()}
            >
              {uploading === "__photo__" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              {photoUrl ? "Replace Photo" : "Upload Photo"}
            </Button>
            <input ref={photoInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />
          </div>
        </CardContent>
      </Card>

      {/* Documents list */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Documents
          </CardTitle>
          <CardDescription>Upload B-Form, marksheets, and other supporting documents. Existing files are replaced when you upload again.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {mergedRows.map(({ key, label, doc }) => (
            <div key={key} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
              <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                {doc?.mimeType === "application/pdf"
                  ? <FileText className="h-4 w-4 text-muted-foreground" />
                  : <FileText className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium capitalize">{label}</p>
                {doc ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {doc.originalName} · {Math.round(doc.fileSize / 1024)} KB · {new Date(doc.uploadedAt).toLocaleDateString()}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not uploaded yet</p>
                )}
              </div>
              {doc && (
                <DocStatusBadge status={doc.status} />
              )}
              {doc && doc.url && (
                <a href={`${doc.url}?token=${encodeURIComponent(getToken() ?? "")}`} target="_blank" rel="noopener noreferrer">
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Open document">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </a>
              )}
              <Button
                size="sm" variant="outline" className="shrink-0 gap-1.5 h-7 text-xs"
                disabled={uploading === key}
                onClick={() => { pendingDocType.current = key; docInputRef.current?.click(); }}
              >
                {uploading === key
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : doc ? <Upload className="h-3 w-3" /> : <FilePlus2 className="h-3 w-3" />}
                {doc ? "Replace" : "Upload"}
              </Button>
            </div>
          ))}

          {/* Upload a new document type */}
          <div className="pt-3">
            <NewDocUploadRow
              onUpload={(file, docType) => uploadDoc(file, docType)}
              uploading={uploading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Hidden file input for doc uploads */}
      <input ref={docInputRef} type="file" className="hidden" accept="image/jpeg,image/png,application/pdf"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f && pendingDocType.current) uploadDoc(f, pendingDocType.current);
          e.target.value = "";
        }} />
    </div>
  );
}

function DocStatusBadge({ status }: { status: string }) {
  if (status === "verified")
    return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] h-5">Verified</Badge>;
  if (status === "rejected")
    return <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] h-5">Rejected</Badge>;
  return <Badge variant="outline" className="text-[10px] h-5 text-amber-700 border-amber-200 bg-amber-50">Pending</Badge>;
}

function NewDocUploadRow({ onUpload, uploading }: {
  onUpload: (file: File, docType: string) => void;
  uploading: string | null;
}) {
  const [label, setLabel] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const slugify = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  return (
    <div className="flex items-center gap-2">
      <FilePlus2 className="h-4 w-4 text-muted-foreground shrink-0" />
      <Input
        className="h-7 text-xs flex-1" placeholder="Document label (e.g. Medical Certificate)"
        value={label} onChange={e => setLabel(e.target.value)}
      />
      <Button
        size="sm" variant="outline" className="shrink-0 gap-1.5 h-7 text-xs"
        disabled={!label.trim() || !!uploading}
        onClick={() => ref.current?.click()}
      >
        <Upload className="h-3 w-3" /> Upload
      </Button>
      <input ref={ref} type="file" className="hidden" accept="image/jpeg,image/png,application/pdf"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f && label.trim()) { onUpload(f, slugify(label)); setLabel(""); }
          e.target.value = "";
        }} />
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]!);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function LifecycleActions({
  referenceId,
  currentStatus,
  admissionFeeStatus,
  resultMarks,
  interviewMarks,
  testDate,
  interviewDate,
  classApplying,
  sectionAllocSectionId,
}: {
  referenceId: string;
  currentStatus: string;
  admissionFeeStatus?: string | null;
  resultMarks?: number | null;
  interviewMarks?: number | null;
  testDate?: string | null;
  interviewDate?: string | null;
  classApplying?: string | null;
  sectionAllocSectionId?: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [noteOpen, setNoteOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [applicantId, setGrNumber] = useState("");
  const [enrollmentDate, setEnrollmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [enrollClass, setEnrollClass] = useState(classApplying ?? "");
  const [enrollSection, setEnrollSection] = useState(sectionAllocSectionId ?? "");
  const [genLoading, setGenLoading] = useState(false);

  const { data: yearsData = [] }    = useListAdminAcademicYears();
  const { data: classesData = [] }  = useListAdminClasses();
  const { data: sectionsData = [] } = useListAdminSections();
  const { data: housesData = [] }   = useListAdminHouses();
  const missingSetup = useMemo(() => {
    const m: string[] = [];
    if (!(yearsData as any[]).length)    m.push("Academic Year");
    if (!(classesData as any[]).length)  m.push("Class/Program");
    if (!(sectionsData as any[]).some((s: any) => s.active)) m.push("Section");
    if (!(housesData as any[]).length)   m.push("House");
    return m;
  }, [yearsData, classesData, sectionsData, housesData]);

  // Soft warnings shown in the enroll dialog — staff can proceed despite these.
  const softWarnings = useMemo(() => {
    const w: string[] = [];
    for (const item of missingSetup) w.push(`Academic setup incomplete: ${item} not configured`);
    if (admissionFeeStatus && admissionFeeStatus !== "paid") w.push("Admission fee not yet verified");
    if (testDate && resultMarks == null) w.push("Written test result not recorded");
    if (interviewDate && interviewMarks == null) w.push("Interview result not recorded");
    return w;
  }, [missingSetup, admissionFeeStatus, testDate, resultMarks, interviewDate, interviewMarks]);

  const refreshAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: getGetAdminApplicationQueryKey(referenceId) });
    queryClient.invalidateQueries({ queryKey: getGetAdminDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAdminApplicationsQueryKey() });
  };

  const eventMutation = useAddAdminApplicationEvent({
    mutation: {
      onSuccess: () => {
        refreshAfterChange();
        setNoteOpen(false);
        setNoteTitle("");
        setNoteBody("");
        toast({ title: "Note added", description: "Your note has been added to the timeline." });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Could not add note", description: "Please try again." });
      },
    },
  });

  // Sections available for the currently selected class (uses the sections
  // embedded in the ClassRecord so no extra request is needed).
  const enrollClassRecord = useMemo(
    () => (classesData as any[]).find((c: any) => c.code === enrollClass) ?? null,
    [classesData, enrollClass],
  );
  const filteredSections = useMemo(
    () => (enrollClassRecord?.sections ?? (sectionsData as any[]).filter((s: any) => s.active)) as { id: string; name: string }[],
    [enrollClassRecord, sectionsData],
  );

  const enrollMutation = useEnrollAdminApplication({
    mutation: {
      onSuccess: (data) => {
        refreshAfterChange();
        setEnrollOpen(false);
        setGrNumber("");
        setEnrollmentDate(new Date().toISOString().slice(0, 10));
        setEnrollClass(classApplying ?? "");
        setEnrollSection(sectionAllocSectionId ?? "");
        toast({ title: "Cadet enrolled", description: `Student record created with Applicant ID ${data.applicantId}.` });
      },
      onError: (err: any) => {
        const msg = err?.data?.error ?? err?.response?.data?.error ?? err?.message ?? "Could not enroll cadet.";
        toast({ variant: "destructive", title: "Enrollment failed", description: msg });
      },
    },
  });

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm">Lifecycle Actions</CardTitle>
        <CardDescription>Changes appear instantly in the candidate's portal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {currentStatus === "admitted" && (
          <Dialog open={enrollOpen} onOpenChange={(o) => { setEnrollOpen(o); if (!o) { setGrNumber(""); setEnrollmentDate(new Date().toISOString().slice(0, 10)); setEnrollClass(classApplying ?? ""); setEnrollSection(sectionAllocSectionId ?? ""); } }}>
            <DialogTrigger asChild>
              <Button variant="default" className="w-full justify-start bg-teal-600 hover:bg-teal-700">
                <GraduationCap className="mr-2 h-4 w-4" /> Enroll as Student
                {softWarnings.length > 0 && <AlertCircle className="ml-auto h-3.5 w-3.5 opacity-70" />}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enroll Cadet</DialogTitle>
                <DialogDescription>
                  Create a student record for this applicant. All personal details are copied from the application automatically.
                </DialogDescription>
              </DialogHeader>
              {softWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>Proceed with caution — the following items are outstanding:</span>
                  </div>
                  <ul className="ml-5 list-disc space-y-0.5">
                    {softWarnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                  <p className="mt-1 text-amber-700">You can still enroll now, but it is recommended to resolve these first.</p>
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
                      onKeyDown={e => e.key === "Enter" && applicantId.trim() && enrollMutation.mutate({ referenceId, data: { applicantId: applicantId.trim(), enrollmentDate: enrollmentDate || undefined, force: softWarnings.length > 0, classCode: enrollClass || undefined, sectionId: enrollSection || undefined } })}
                    />
                    <Button
                      type="button" variant="outline" size="sm" className="shrink-0 gap-1.5 px-3"
                      disabled={genLoading}
                      title="Auto-generate next Applicant ID from ID Format settings"
                      onClick={async () => {
                        setGenLoading(true);
                        try {
                          // Fetch GR format from the API (persisted per-tenant, not localStorage)
                          let fmt: { prefix: string; separator: string; includeYear: boolean; paddingDigits: string } = {
                            prefix: "GR", separator: "-", includeYear: true, paddingDigits: "3",
                          };
                          try {
                            const fmtRes = await fetch("/api/admin/settings/gr-format", {
                              headers: { Authorization: `Bearer ${getToken() ?? ""}` },
                            });
                            if (fmtRes.ok) fmt = { ...fmt, ...await fmtRes.json() };
                          } catch {}

                          const prefix = fmt.prefix || "GR";
                          const sep    = fmt.separator || "-";
                          const qs = new URLSearchParams({
                            prefix,
                            separator: sep,
                            includeYear: String(fmt.includeYear !== false),
                            paddingDigits: fmt.paddingDigits || "3",
                          });
                          const res = await fetch(`/api/admin/students/next-gr?${qs}`, {
                            headers: { Authorization: `Bearer ${getToken() ?? ""}` },
                          });
                          if (res.ok) {
                            const data = await res.json();
                            // Server returns a pre-verified nextGr when all format params are supplied
                            if (data.nextGr) {
                              setGrNumber(data.nextGr);
                            } else {
                              const parts: string[] = [prefix];
                              if (fmt.includeYear !== false) parts.push(String(new Date().getFullYear()));
                              parts.push(String(data.nextSequence).padStart(parseInt(fmt.paddingDigits || "3"), "0"));
                              setGrNumber(parts.join(sep));
                            }
                          }
                        } finally {
                          setGenLoading(false);
                        }
                      }}
                    >
                      {genLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                      Auto
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label className="text-right text-sm">Class <span className="text-red-500">*</span></Label>
                  <Select value={enrollClass} onValueChange={(v) => { setEnrollClass(v); setEnrollSection(""); }}>
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
                  <Select value={enrollSection} onValueChange={setEnrollSection} disabled={filteredSections.length === 0}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={filteredSections.length === 0 ? "No sections available" : "Select section…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredSections.map((s) => (
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
                <DialogClose asChild>
                  <Button variant="outline" disabled={enrollMutation.isPending}>Cancel</Button>
                </DialogClose>
                <Button
                  className="bg-teal-600 hover:bg-teal-700"
                  onClick={() => enrollMutation.mutate({ referenceId, data: { applicantId: applicantId.trim(), enrollmentDate: enrollmentDate || undefined, force: softWarnings.length > 0, classCode: enrollClass || undefined, sectionId: enrollSection || undefined } })}
                  disabled={enrollMutation.isPending || !applicantId.trim() || !enrollClass.trim()}
                >
                  {enrollMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GraduationCap className="mr-2 h-4 w-4" />}
                  {softWarnings.length > 0 ? "Enroll Anyway" : "Enroll Cadet"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full justify-start">
              <MessageSquarePlus className="mr-2 h-4 w-4" /> Add Timeline Note
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Timeline Note</DialogTitle>
              <DialogDescription>
                Record an internal note or activity on this application's timeline.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="note-title">Title</Label>
                <input
                  id="note-title"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="e.g. Called guardian"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="note-body">Details (optional)</Label>
                <Textarea
                  id="note-body"
                  placeholder="Add more detail…"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  maxLength={2000}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                onClick={() => eventMutation.mutate({ referenceId, data: { title: noteTitle.trim(), description: noteBody.trim() || undefined } })}
                disabled={eventMutation.isPending || !noteTitle.trim()}
              >
                {eventMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Note
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function InfoItem({ label, value, className }: { label: string, value: string, className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function InlineEditField({
  label, value, rawValue, onSave, type = "text", className,
}: {
  label: string;
  value: string;
  rawValue?: string;
  onSave: (v: string) => Promise<void>;
  type?: "text" | "date" | "number" | "email" | "tel";
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    const raw = rawValue !== undefined ? rawValue : (value === "—" ? "" : value);
    setDraft(raw);
    setSaveError(null);
    setSavedOk(false);
    setEditing(true);
  }

  async function commit() {
    if (!editing) return;
    const trimmed = draft.trim();
    const original = rawValue !== undefined ? rawValue : (value === "—" ? "" : value);
    if (trimmed === original) { setEditing(false); return; }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(trimmed);
      setSavedOk(true);
      setEditing(false);
      setTimeout(() => setSavedOk(false), 1500);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error ?? err?.message ?? "Failed to save");
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editing]);

  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <Input
            ref={inputRef}
            type={type}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
            }}
            onBlur={commit}
            disabled={saving}
            className="h-7 text-sm py-1 px-2 max-w-xs"
          />
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
        </div>
      ) : (
        <button
          onClick={startEdit}
          className="group flex items-center gap-1.5 text-left w-full rounded hover:bg-slate-50 px-1 -mx-1 py-0.5 transition-colors"
        >
          <span className={`text-sm font-medium ${savedOk ? "text-green-600" : "text-foreground"}`}>{value || "—"}</span>
          {savedOk
            ? <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
            : <Pencil className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground/70 shrink-0 transition-colors" />}
        </button>
      )}
      {saveError && <p className="text-xs text-red-500 mt-0.5">{saveError}</p>}
    </div>
  );
}

function InlineSelectField({
  label, value, displayValue, options, onSave, className,
}: {
  label: string;
  value: string;
  displayValue: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => Promise<void>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  async function commit(v: string) {
    if (v === value) { setEditing(false); return; }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(v);
      setSavedOk(true);
      setEditing(false);
      setTimeout(() => setSavedOk(false), 1500);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error ?? err?.message ?? "Failed to save");
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <Select
            value={draft || value}
            onValueChange={v => { setDraft(v); commit(v); }}
            disabled={saving}
          >
            <SelectTrigger className="h-7 text-sm w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
        </div>
      ) : (
        <button
          onClick={() => { setSaveError(null); setSavedOk(false); setDraft(value); setEditing(true); }}
          className="group flex items-center gap-1.5 text-left w-full rounded hover:bg-slate-50 px-1 -mx-1 py-0.5 transition-colors"
        >
          <span className={`text-sm font-medium ${savedOk ? "text-green-600" : "text-foreground"}`}>{displayValue || "—"}</span>
          {savedOk
            ? <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
            : <Pencil className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground/70 shrink-0 transition-colors" />}
        </button>
      )}
      {saveError && <p className="text-xs text-red-500 mt-0.5">{saveError}</p>}
    </div>
  );
}

function PaymentRow({ label, status, bankRef, confirmedAt, receiptUrl, paidAmount, defaultAmount, referenceId, feeType, paymentMethod, feeSubmittedAt, onConfirmed }: {
  label: string;
  status: string;
  bankRef?: string | null;
  confirmedAt?: string | null;
  receiptUrl?: string | null;
  paidAmount?: number | null;
  defaultAmount?: number;
  referenceId?: string;
  feeType?: "fee";
  paymentMethod?: string | null;
  feeSubmittedAt?: string | null;
  onConfirmed?: () => void;
}) {
  const { toast } = useToast();
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [cashOpen, setCashOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cashRef, setCashRef] = useState("");
  const [cashNote, setCashNote] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cashDate, setCashDate] = useState(todayStr());
  const [cashReceiptUrl, setCashReceiptUrl] = useState<string | null>(null);
  const [cashReceiptName, setCashReceiptName] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  function openCashDialog() {
    setCashRef("");
    setCashNote("");
    setCashAmount(defaultAmount && defaultAmount > 0 ? String(defaultAmount) : "");
    setCashDate(todayStr());
    setCashReceiptUrl(null);
    setCashReceiptName(null);
    setCashOpen(true);
  }

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please upload an image file", variant: "destructive" });
      return;
    }
    setUploadingReceipt(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/admin/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ dataUrl, filename: file.name, tags: "receipt" }),
      });
      if (!res.ok) throw new Error("upload failed");
      const item = (await res.json()) as { url: string };
      setCashReceiptUrl(item.url);
      setCashReceiptName(file.name);
      toast({ title: "Receipt uploaded" });
    } catch {
      toast({ title: "Receipt upload failed", variant: "destructive" });
    } finally {
      setUploadingReceipt(false);
    }
  }

  const cashMutation = useMutation({
    mutationFn: async () => {
      const tenantId = localStorage.getItem("ccm_admin_website_tenant") || "ccm";
      const res = await fetch(`/api/admin/applications/${referenceId}/fee/cash`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
          "X-Tenant-Id": tenantId,
        },
        body: JSON.stringify({
          cashRef: cashRef.trim(),
          amount: Number(cashAmount),
          paidDate: cashDate || undefined,
          receiptUrl: cashReceiptUrl || undefined,
          note: cashNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? "Failed to record cash payment");
      }
    },
    onSuccess: () => {
      toast({ title: "Cash payment recorded", description: "Application fee marked as paid." });
      setCashOpen(false);
      onConfirmed?.();
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const amountValid = (() => {
    const n = Number(cashAmount);
    return Number.isFinite(n) && Number.isInteger(n) && n > 0;
  })();

  const isPaid      = status === "paid";
  const isSubmitted = status === "submitted" || (!isPaid && !!bankRef);
  const canRecordCash = !isPaid && referenceId && feeType;

  const icon = isPaid
    ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
    : isSubmitted
    ? <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
    : <XCircle className="h-4 w-4 text-slate-300 shrink-0" />;

  const badge = isPaid
    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Paid</span>
    : isSubmitted
    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Submitted</span>
    : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-300">Pending</span>;

  const hasPaymentOnFile = !!(bankRef || paidAmount || confirmedAt || feeSubmittedAt);
  const paymentMethodLabel = paymentMethod
    ? paymentMethod
        .replace(/_/g, " ")
        .replace(/^./, c => c.toUpperCase())
    : (isSubmitted ? "Bank Deposit" : null);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isPaid ? (
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-amber-400"
            >
              {badge}
            </button>
          ) : badge}
          {canRecordCash && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
              onClick={openCashDialog}
            >
              <Banknote className="h-3 w-3 mr-1" />Cash
            </Button>
          )}
        </div>
      </div>
      {isPaid && typeof paidAmount === "number" && paidAmount > 0 && (
        <p className="text-xs text-muted-foreground pl-6">
          Amount paid: <span className="font-medium text-foreground">{formatCurrency(paidAmount)}</span>
        </p>
      )}
      {bankRef && (
        <p className="text-xs text-muted-foreground pl-6">
          Ref: <span className="font-mono font-medium">{bankRef}</span>
        </p>
      )}
      {receiptUrl && (
        <p className="text-xs pl-6">
          <a
            href={receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 font-medium underline underline-offset-2"
          >
            <ExternalLink className="h-3 w-3" />View Receipt ↗
          </a>
        </p>
      )}
      {confirmedAt && (
        <p className="text-xs text-muted-foreground pl-6">
          Confirmed {new Date(confirmedAt).toLocaleDateString()}
        </p>
      )}

      {/* Payment Details Dialog (read-only) */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{label} — Payment Details</DialogTitle>
            <DialogDescription>
              {hasPaymentOnFile
                ? "Details on file for this payment."
                : "No payment has been recorded for this fee yet."}
            </DialogDescription>
          </DialogHeader>
          {hasPaymentOnFile ? (
            <div className="space-y-2.5 py-1 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium text-foreground">
                  {confirmedAt
                    ? new Date(confirmedAt).toLocaleDateString()
                    : feeSubmittedAt
                    ? new Date(feeSubmittedAt).toLocaleDateString()
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium text-foreground">
                  {typeof paidAmount === "number" && paidAmount > 0 ? formatCurrency(paidAmount) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Reference ID</span>
                <span className="font-mono font-medium text-foreground">{bankRef || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Payment Method</span>
                <span className="font-medium text-foreground">{paymentMethodLabel || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Account</span>
                <span className="font-medium text-muted-foreground text-right">
                  {paymentMethod === "cash" ? "Cash (paid in person)" : "Not recorded"}
                </span>
              </div>
              {receiptUrl && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Receipt</span>
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 font-medium underline underline-offset-2"
                  >
                    <ExternalLink className="h-3 w-3" />View ↗
                  </a>
                </div>
              )}
              {isSubmitted && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mt-1">
                  Awaiting confirmation from the admissions office.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              No payment recorded yet. Use the <span className="font-medium">Cash</span> button to record a cash payment received at the office.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash Payment Dialog */}
      <Dialog open={cashOpen} onOpenChange={setCashOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Cash Payment</DialogTitle>
            <DialogDescription>Enter the cash receipt or voucher number issued at the office.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cash-amount">Amount (Rs) <span className="text-destructive">*</span></Label>
                <Input
                  id="cash-amount"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder="e.g. 2000"
                  value={cashAmount}
                  onChange={e => setCashAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cash-date">Payment Date <span className="text-destructive">*</span></Label>
                <Input
                  id="cash-date"
                  type="date"
                  max={todayStr()}
                  value={cashDate}
                  onChange={e => setCashDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cash-ref">Receipt / Reference No. <span className="text-destructive">*</span></Label>
              <Input
                id="cash-ref"
                placeholder="e.g. CASH-001"
                value={cashRef}
                onChange={e => setCashRef(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Receipt Image (optional)</Label>
              <input
                ref={receiptInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleReceiptUpload}
              />
              {cashReceiptUrl ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span className="truncate text-foreground">{cashReceiptName ?? "Receipt uploaded"}</span>
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => { setCashReceiptUrl(null); setCashReceiptName(null); }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center"
                  disabled={uploadingReceipt}
                  onClick={() => receiptInputRef.current?.click()}
                >
                  {uploadingReceipt
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</>
                    : <><Upload className="mr-2 h-4 w-4" />Upload Receipt</>}
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cash-note">Note (optional)</Label>
              <Input
                id="cash-note"
                placeholder="e.g. Paid at admissions counter"
                value={cashNote}
                onChange={e => setCashNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCashOpen(false)}>Cancel</Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white"
              disabled={!cashRef.trim() || !amountValid || !cashDate || uploadingReceipt || cashMutation.isPending}
              onClick={() => cashMutation.mutate()}
            >
              {cashMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Banknote className="mr-2 h-4 w-4" />}
              Record Cash Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function ContactLink({ icon, label, href }: { icon: React.ReactNode, label: string, href?: string }) {
  const content = (
    <div className="flex items-center gap-3 px-6 py-4 hover:bg-muted/50 transition-colors">
      <div className="text-muted-foreground">{icon}</div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
  
  if (href) {
    return <a href={href} className="block">{content}</a>;
  }
  return <div>{content}</div>;
}

function DetailSkeleton() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-[400px] w-full rounded-xl" />
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-[300px] w-full rounded-xl" />
          <Skeleton className="h-[200px] w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
