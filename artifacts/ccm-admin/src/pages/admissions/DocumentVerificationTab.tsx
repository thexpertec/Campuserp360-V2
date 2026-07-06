import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CheckCircle2, XCircle, Search, ChevronLeft, ChevronRight, Loader2,
  FileText, Paperclip, User, Minus, Pencil, Check, X as XIcon, ExternalLink, AlertTriangle, Download, Lock,
} from "lucide-react";
import { useListAdminClasses, useBulkUpdateDocVerification } from "@workspace/api-client-react";
import { useDebounce } from "@/hooks/use-debounce";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useGridEdit } from "@/hooks/use-grid-edit";
import { GridTextCell, GridSelectCell } from "@/components/grid-cells";

// ─── Types ────────────────────────────────────────────────────────────────────

type DocVerifStatus = "not_verified" | "partial_verified" | "verified";

type DocVerifyRecord = {
  referenceId: string;
  applicantId: string | null;
  candidateName: string;
  fatherName: string;
  classApplying: string;
  lastClass: string | null;
  yearOfLastResult: string | null;
  academicScore: string | null;
  bFormUrl: string | null;
  degreeUrl: string | null;
  docVerificationStatus: DocVerifStatus;
  status: string;
  createdAt: string;
};

type DocVerifyPage = {
  data: DocVerifyRecord[];
  total: number;
  verifiedCount: number;
  partialCount: number;
  pendingCount: number;
  page: number;
  pageSize: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const ALL_CLASSES = "__all_classes__";
const ALL_STATUS  = "__all_status__";

const STATUS_FILTER_OPTIONS = [
  { value: ALL_STATUS,         label: "All"              },
  { value: "not_verified",     label: "Not Verified"     },
  { value: "partial_verified", label: "Partial Verified" },
  { value: "verified",         label: "Verified"         },
];

const VERIFICATION_STATUS_OPTIONS: { value: DocVerifStatus; label: string }[] = [
  { value: "not_verified",     label: "Not Verified"     },
  { value: "partial_verified", label: "Partial Verified" },
  { value: "verified",         label: "Verified"         },
];

const EDITABLE_FIELDS = ["lastClass", "yearOfLastResult", "academicScore", "docVerificationStatus"];

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchDocVerify(params: {
  q: string; classApplying: string; verificationStatus: string; page: number;
}): Promise<DocVerifyPage> {
  const sp = new URLSearchParams();
  if (params.q)                                 sp.set("q", params.q);
  if (params.classApplying !== ALL_CLASSES)     sp.set("classApplying", params.classApplying);
  if (params.verificationStatus !== ALL_STATUS) sp.set("verificationStatus", params.verificationStatus);
  sp.set("page",     String(params.page));
  sp.set("pageSize", String(PAGE_SIZE));
  const res = await fetch(`/api/admin/applications/document-verification?${sp}`, {
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!res.ok) throw new Error("Failed to load document verification list");
  return res.json();
}

// ─── FilePreviewDialog ────────────────────────────────────────────────────────

function FilePreviewBody({ url, label }: { url: string; label: string }) {
  const [imgError, setImgError] = useState(false);
  const pathname = (() => { try { return new URL(url, window.location.origin).pathname; } catch { return url; } })();
  const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(pathname);
  const isPdf   = /\.pdf$/i.test(pathname);

  if (isImage && !imgError) {
    return (
      <img
        src={url}
        alt={label}
        className="max-w-full mx-auto rounded-lg border shadow-sm"
        onError={() => setImgError(true)}
      />
    );
  }

  if (isPdf || (isImage && imgError)) {
    return (
      <div className="flex flex-col gap-3 h-full">
        {isPdf && (
          <object
            data={url}
            type="application/pdf"
            className="w-full flex-1 rounded-lg border bg-white"
            style={{ minHeight: "55vh" }}
          >
            <FileUnavailable url={url} label={label} />
          </object>
        )}
        {isImage && imgError && <FileUnavailable url={url} label={label} />}
      </div>
    );
  }

  return <FileUnavailable url={url} label={label} />;
}

function FileUnavailable({ url, label }: { url: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-400" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-700">File cannot be displayed inline</p>
        <p className="text-xs text-muted-foreground">It may have been deleted or is stored on a remote server.</p>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" download>
        <button className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors">
          <Download className="h-4 w-4" />
          Download / Open directly
        </button>
      </a>
    </div>
  );
}

function FilePreviewDialog({
  url, label, open, onClose,
}: {
  url: string; label: string; open: boolean; onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate flex-1">{label}</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto shrink-0 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-indigo-600 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto p-4 bg-muted/20 min-h-[400px]">
          <FilePreviewBody url={url} label={label} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── AttachmentCell ───────────────────────────────────────────────────────────

function AttachmentCell({ url, label }: { url: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
        title={`View ${label}`}
      >
        <Paperclip className="h-3 w-3" />
        View
      </button>
      {open && (
        <FilePreviewDialog url={url} label={label} open={open} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

// ─── Status badge (view-mode) ─────────────────────────────────────────────────

const DOC_STATUS_STYLES: Record<DocVerifStatus, string> = {
  not_verified:     "border-amber-200 bg-amber-50 text-amber-700",
  partial_verified: "border-blue-200 bg-blue-50 text-blue-700",
  verified:         "border-emerald-200 bg-emerald-50 text-emerald-700",
};
const DOC_STATUS_ICONS: Record<DocVerifStatus, React.ReactNode> = {
  not_verified:     <XCircle className="h-3 w-3" />,
  partial_verified: <Minus className="h-3 w-3" />,
  verified:         <CheckCircle2 className="h-3 w-3" />,
};

function DocStatusBadge({ status }: { status: DocVerifStatus }) {
  const label = VERIFICATION_STATUS_OPTIONS.find((o) => o.value === status)?.label;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
      DOC_STATUS_STYLES[status],
    )}>
      {DOC_STATUS_ICONS[status]}
      {label}
    </span>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function DocumentVerificationTab() {
  const queryClient = useQueryClient();
  const { toast }   = useToast();

  const [q, setQ]                 = useState("");
  const [classFilter, setClass]   = useState(ALL_CLASSES);
  const [statusFilter, setStatus] = useState(ALL_STATUS);
  const [page, setPage]           = useState(1);

  const debouncedQ = useDebounce(q, 300);
  const queryKey   = ["doc-verify", debouncedQ, classFilter, statusFilter, page];

  const { data, isLoading, isError } = useQuery<DocVerifyPage>({
    queryKey,
    queryFn: () =>
      fetchDocVerify({ q: debouncedQ, classApplying: classFilter, verificationStatus: statusFilter, page }),
    placeholderData: keepPreviousData,
  });

  const { data: classes } = useListAdminClasses();
  const classOptions = (classes ?? []).map((c: any) => ({ value: c.code, label: c.name }));

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["doc-verify"] });
  }, [queryClient]);

  const records    = data?.data ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const COL_COUNT  = 11;

  // ── Grid edit mode ────────────────────────────────────────────────────────

  const [failedRefs, setFailedRefs] = useState<Set<string>>(new Set());

  const grid = useGridEdit(records);

  const saveMutation = useBulkUpdateDocVerification({
    mutation: {
      onSuccess: (result: any) => {
        const updatedCount = result.updated ?? 0;
        const failedCount  = result.failed  ?? 0;
        const failedIds: string[] = (result.results ?? [])
          .filter((r: any) => !r.success)
          .map((r: any) => r.referenceId as string);

        if (failedCount > 0) {
          setFailedRefs(new Set(failedIds));
          const preview = failedIds.slice(0, 5).join(", ");
          const extra   = failedIds.length > 5 ? ` +${failedIds.length - 5} more` : "";
          toast({
            variant: "destructive",
            title: `${updatedCount} updated, ${failedCount} failed`,
            description: `Failed: ${preview}${extra}`,
          });
        } else {
          setFailedRefs(new Set());
          toast({ title: `Saved — ${updatedCount} record${updatedCount !== 1 ? "s" : ""} updated` });
          grid.discardEdits();
        }
        refresh();
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Save failed", description: err?.message });
      },
    },
  });

  function parseAcademicScoreValue(raw: string): { invalid: boolean } {
    const trimmed = raw.trim();
    if (trimmed === "") return { invalid: false };
    const stripped = trimmed.replace(/%$/, "");
    if (!/^-?\d+(\.\d+)?$/.test(stripped)) return { invalid: true };
    const n = Number(stripped);
    if (n < 0 || n > 100) return { invalid: true };
    return { invalid: false };
  }

  function handleSave() {
    // Validate academic score cells before saving
    const invalidRows = records
      .filter((r) => r.status !== "enrolled")
      .filter((r) => {
        const raw = grid.getCellValue(r.referenceId, "academicScore", r.academicScore ?? "");
        return parseAcademicScoreValue(raw).invalid;
      });

    if (invalidRows.length > 0) {
      const names = invalidRows.map((r) => r.candidateName || r.referenceId).join(", ");
      toast({
        title: "Invalid Academic Score",
        description: `Score must be 0–100. Fix the highlighted row(s): ${names}`,
        variant: "destructive",
      });
      return;
    }

    const entries = records
      .filter((r) => r.status !== "enrolled")
      .map((r) => {
        const entry: Record<string, any> = { referenceId: r.referenceId };
        let dirty = false;

        if (grid.isCellDirty(r.referenceId, "lastClass", r.lastClass ?? "")) {
          entry.lastClass = grid.getCellValue(r.referenceId, "lastClass", r.lastClass ?? "") || null;
          dirty = true;
        }
        if (grid.isCellDirty(r.referenceId, "yearOfLastResult", r.yearOfLastResult ?? "")) {
          entry.yearOfLastResult =
            grid.getCellValue(r.referenceId, "yearOfLastResult", r.yearOfLastResult ?? "") || null;
          dirty = true;
        }
        if (grid.isCellDirty(r.referenceId, "academicScore", r.academicScore ?? "")) {
          entry.academicScore = grid.getCellValue(r.referenceId, "academicScore", r.academicScore ?? "");
          dirty = true;
        }
        if (grid.isCellDirty(r.referenceId, "docVerificationStatus", r.docVerificationStatus)) {
          entry.docVerificationStatus = grid.getCellValue(
            r.referenceId, "docVerificationStatus", r.docVerificationStatus,
          );
          dirty = true;
        }

        return dirty ? entry : null;
      })
      .filter(Boolean) as any[];

    if (entries.length === 0) {
      toast({ title: "No changes to save" });
      return;
    }
    saveMutation.mutate({ data: { entries } });
  }

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-1.5 rounded-lg border bg-slate-50 px-3 py-1.5">
          <FileText className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-700">{data?.total ?? "—"}</span>
          <span className="text-slate-500">total</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span className="font-semibold text-emerald-700">{data?.verifiedCount ?? "—"}</span>
          <span className="text-emerald-600">verified</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5">
          <Minus className="h-4 w-4 text-blue-600" />
          <span className="font-semibold text-blue-700">{data?.partialCount ?? "—"}</span>
          <span className="text-blue-600">partial</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5">
          <XCircle className="h-4 w-4 text-amber-600" />
          <span className="font-semibold text-amber-700">{data?.pendingCount ?? "—"}</span>
          <span className="text-amber-600">not verified</span>
        </div>
      </div>

      {/* Filter toolbar + edit controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or Applicant ID…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            className="pl-9 h-9"
            disabled={grid.editMode}
          />
        </div>

        <Select value={classFilter} onValueChange={(v) => { setClass(v); setPage(1); }} disabled={grid.editMode}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLASSES}>All Classes</SelectItem>
            {classOptions.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatus(v); setPage(1); }} disabled={grid.editMode}>
          <SelectTrigger className="h-9 w-[168px]">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Edit / Save & Update / Discard */}
        <div className="flex items-center gap-2 ml-auto">
          {!grid.editMode ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setFailedRefs(new Set()); grid.enterEditMode(); }}
              className="h-9 gap-1.5"
              disabled={isLoading || records.length === 0}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={grid.discardEdits}
                disabled={saveMutation.isPending}
                className="h-9 gap-1"
              >
                <XIcon className="h-3.5 w-3.5" />
                Discard
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saveMutation.isPending || !grid.hasChanges}
                className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {saveMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Check className="h-3.5 w-3.5" />}
                Save & Update
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Edit mode hint banner */}
      {grid.editMode && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800 flex items-center gap-2">
          <Pencil className="h-3.5 w-3.5 shrink-0" />
          <span>
            Excel-style editing active — <kbd className="font-semibold">Tab</kbd> /{" "}
            <kbd className="font-semibold">Shift+Tab</kbd> across columns &nbsp;·&nbsp;{" "}
            <kbd className="font-semibold">Enter</kbd> / <kbd className="font-semibold">↑↓</kbd> between rows.{" "}
            Yellow cells have unsaved changes.
          </span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {[
                  "Applicant ID",
                  "Candidate",
                  "Father",
                  "Class (Applied)",
                  "Last Class",
                  "Year of Last Result",
                  "Academic Score %",
                  "Degree / Cert.",
                  "B-Form",
                  "Verification Status",
                  "Action",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="bg-background">
                    {Array.from({ length: COL_COUNT }).map((__, j) => (
                      <td key={j} className="px-3 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={COL_COUNT} className="px-4 py-12 text-center text-destructive text-sm">
                    Failed to load records. Please try again.
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        No applications match the selected filters.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                records.map((r, rowIdx) => {
                  const verStatus = grid.getCellValue(
                    r.referenceId, "docVerificationStatus", r.docVerificationStatus,
                  ) as DocVerifStatus;
                  const rowHasChanges = EDITABLE_FIELDS.some((f) =>
                    grid.isCellDirty(r.referenceId, f, f === "docVerificationStatus" ? r.docVerificationStatus : (r[f as keyof DocVerifyRecord] as string) ?? ""),
                  );
                  const isEnrolled = r.status === "enrolled";

                  return (
                    <tr
                      key={r.referenceId}
                      className={cn(
                        "bg-background hover:bg-muted/30 transition-colors",
                        !grid.editMode && r.docVerificationStatus === "verified" && "bg-emerald-50/30 hover:bg-emerald-50/50",
                        !grid.editMode && r.docVerificationStatus === "partial_verified" && "bg-blue-50/20 hover:bg-blue-50/40",
                        grid.editMode && rowHasChanges && !isEnrolled && "bg-amber-50/30",
                        failedRefs.has(r.referenceId) && "bg-red-50 outline outline-1 outline-red-200",
                        isEnrolled && "opacity-60 bg-teal-50/20",
                      )}
                    >
                      {/* GR */}
                      <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {r.applicantId ?? "—"}
                      </td>

                      {/* Candidate */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-medium text-sm">{r.candidateName}</span>
                      </td>

                      {/* Father */}
                      <td className="px-3 py-2.5 text-sm text-muted-foreground whitespace-nowrap">
                        {r.fatherName}
                      </td>

                      {/* Class Applied */}
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                          {r.classApplying}
                        </span>
                      </td>

                      {/* Last Class */}
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ minWidth: 100 }}>
                        <GridTextCell
                          editMode={grid.editMode && !isEnrolled}
                          value={grid.getCellValue(r.referenceId, "lastClass", r.lastClass ?? "")}
                          onChange={(v) => grid.setCellValue(r.referenceId, "lastClass", v)}
                          dirty={grid.isCellDirty(r.referenceId, "lastClass", r.lastClass ?? "")}
                          onKeyDown={(e) =>
                            grid.handleCellKeyDown(e, rowIdx, 0, EDITABLE_FIELDS, records.length)
                          }
                          cellRef={(el) => grid.registerCellRef(r.referenceId, "lastClass", el)}
                          placeholder="e.g. Class 8"
                        />
                      </td>

                      {/* Year of Last Result */}
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ minWidth: 120 }}>
                        <GridTextCell
                          editMode={grid.editMode && !isEnrolled}
                          value={grid.getCellValue(r.referenceId, "yearOfLastResult", r.yearOfLastResult ?? "")}
                          onChange={(v) => grid.setCellValue(r.referenceId, "yearOfLastResult", v)}
                          dirty={grid.isCellDirty(r.referenceId, "yearOfLastResult", r.yearOfLastResult ?? "")}
                          onKeyDown={(e) =>
                            grid.handleCellKeyDown(e, rowIdx, 1, EDITABLE_FIELDS, records.length)
                          }
                          cellRef={(el) => grid.registerCellRef(r.referenceId, "yearOfLastResult", el)}
                          placeholder="e.g. 2024"
                        />
                      </td>

                      {/* Academic Score % */}
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ minWidth: 120 }}>
                        <GridTextCell
                          editMode={grid.editMode && !isEnrolled}
                          value={grid.getCellValue(r.referenceId, "academicScore", r.academicScore ?? "")}
                          onChange={(v) => grid.setCellValue(r.referenceId, "academicScore", v)}
                          dirty={grid.isCellDirty(r.referenceId, "academicScore", r.academicScore ?? "")}
                          invalid={parseAcademicScoreValue(
                            grid.getCellValue(r.referenceId, "academicScore", r.academicScore ?? "")
                          ).invalid}
                          onKeyDown={(e) =>
                            grid.handleCellKeyDown(e, rowIdx, 2, EDITABLE_FIELDS, records.length)
                          }
                          cellRef={(el) => grid.registerCellRef(r.referenceId, "academicScore", el)}
                          placeholder="e.g. 85%"
                        />
                      </td>

                      {/* Degree / Cert. */}
                      <td className="px-3 py-2.5">
                        <AttachmentCell url={r.degreeUrl} label={`Degree/Cert — ${r.candidateName}`} />
                      </td>

                      {/* B-Form */}
                      <td className="px-3 py-2.5">
                        <AttachmentCell url={r.bFormUrl} label={`B-Form — ${r.candidateName}`} />
                      </td>

                      {/* Verification Status */}
                      <td className="px-3 py-2.5" style={{ minWidth: 155 }}>
                        {grid.editMode && !isEnrolled ? (
                          <GridSelectCell
                            editMode={true}
                            value={verStatus}
                            onChange={(v) => grid.setCellValue(r.referenceId, "docVerificationStatus", v)}
                            dirty={grid.isCellDirty(
                              r.referenceId, "docVerificationStatus", r.docVerificationStatus,
                            )}
                            onKeyDown={(e) =>
                              grid.handleCellKeyDown(e, rowIdx, 3, EDITABLE_FIELDS, records.length)
                            }
                            cellRef={(el) => grid.registerCellRef(r.referenceId, "docVerificationStatus", el)}
                            options={VERIFICATION_STATUS_OPTIONS}
                          />
                        ) : (
                          <DocStatusBadge status={r.docVerificationStatus} />
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {isEnrolled && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                              <Lock className="h-2.5 w-2.5" />Enrolled
                            </span>
                          )}
                          <Link href={`/applications/${r.referenceId}`}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs gap-1.5 whitespace-nowrap"
                            >
                              <User className="h-3 w-3" />
                              View Profile
                            </Button>
                          </Link>
                        </div>
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {data?.total ?? 0} applications
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={page <= 1 || grid.editMode}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={page >= totalPages || grid.editMode}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
