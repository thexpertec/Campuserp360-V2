import { useMemo, useRef, useState, useCallback } from "react";
import { formatDate as fmtLocaleDate } from "@/lib/locale";
import {
  useListAdminInterviewPerforma,
  getListAdminInterviewPerformaQueryKey,
  useBulkSaveInterviewPerforma,
  useBulkUpdateInterview,
  useListAdminClasses,
} from "@workspace/api-client-react";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { fetchPrintSettings, buildPrintHtml, printHtmlDocument } from "@/lib/print-utils";
import { Printer, Save, FileText, Loader2, Pencil, X as XIcon } from "lucide-react";
import { useGridEdit } from "@/hooks/use-grid-edit";
import { GridSelectCell, GridDateCell, GridTextCell, GridNumberCell } from "@/components/grid-cells";

// ── Criteria config ────────────────────────────────────────────────────────────

type CriterionKey =
  | "scoreAppearance"
  | "scorePhysical"
  | "scoreConfidence"
  | "scoreSpoken"
  | "scoreEnglish"
  | "scoreGenKnow";

const CRITERIA: { key: CriterionKey; label: string; abbr: string }[] = [
  { key: "scoreAppearance",  label: "Appearance",  abbr: "App."  },
  { key: "scorePhysical",    label: "Physical",    abbr: "Phys." },
  { key: "scoreConfidence",  label: "Confidence",  abbr: "Conf." },
  { key: "scoreSpoken",      label: "Spoken",      abbr: "Spkn." },
  { key: "scoreEnglish",     label: "English",     abbr: "Eng."  },
  { key: "scoreGenKnow",     label: "Gen. Know.",  abbr: "G.K."  },
];

const MAX_SCORE = 10;
const TOTAL_MAX = CRITERIA.length * MAX_SCORE; // 60

// ── Types ──────────────────────────────────────────────────────────────────────

type PerformaRow = {
  referenceId:    string;
  fullName:        string;
  fatherName?:    string | null;
  classApplying:  string;
  rollNumber?:    string | null;
  photoFilename?: string | null;
  occupation?:    string | null;
  status:         string;
  interviewDate?: string | null;
  interviewVenue?: string | null;
  scoreAppearance?:  number | null;
  scorePhysical?:    number | null;
  scoreConfidence?:  number | null;
  scoreSpoken?:      number | null;
  scoreEnglish?:     number | null;
  scoreGenKnow?:     number | null;
  interviewMarks?:   number | null;
  interviewResult?:  string | null;
};

type DraftScores = Partial<Record<CriterionKey, string>>;

// ── Constants ──────────────────────────────────────────────────────────────────

const IV_STATUS_OPTIONS = [
  { value: "interview_scheduled", label: "Scheduled" },
  { value: "interview_taken",     label: "Taken"     },
];

const META_FIELDS = ["status", "interviewDate", "interviewVenue", "interviewMarks", "interviewResult"] as const;
type MetaField = typeof META_FIELDS[number];

const IV_RESULT_OPTIONS = [
  { value: "pass",    label: "Pass"    },
  { value: "fail",    label: "Fail"    },
  { value: "pending", label: "Pending" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function getApiValue(row: PerformaRow, key: CriterionKey): string {
  const v = row[key];
  return v != null ? String(v) : "";
}

function computeTotal(row: PerformaRow, drafts: DraftScores): { total: number | null; isComplete: boolean } {
  let sum = 0;
  let allEntered = true;
  for (const c of CRITERIA) {
    const draft = drafts[c.key];
    const raw   = draft !== undefined ? draft : getApiValue(row, c.key);
    const n     = raw.trim() === "" ? null : parseInt(raw, 10);
    if (n == null || isNaN(n)) { allEntered = false; continue; }
    sum += n;
  }
  return { total: allEntered ? sum : null, isComplete: allEntered };
}

function totalFromDrafts(
  row: PerformaRow,
  allDrafts: Record<string, DraftScores>,
): { total: number | null; isComplete: boolean } {
  return computeTotal(row, allDrafts[row.referenceId] ?? {});
}

function hasError(val: string): boolean {
  if (val.trim() === "") return false;
  const n = parseInt(val, 10);
  return isNaN(n) || n < 0 || n > MAX_SCORE;
}

function fmtDate(iso: string | null | undefined): string {
  return fmtLocaleDate(iso ?? null);
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function metaOriginal(row: PerformaRow, field: MetaField): string {
  switch (field) {
    case "status":          return row.status ?? "";
    case "interviewDate":   return toDateInputValue(row.interviewDate);
    case "interviewVenue":  return row.interviewVenue ?? "";
    case "interviewMarks":  return row.interviewMarks != null ? String(row.interviewMarks) : "";
    case "interviewResult": return row.interviewResult ?? "";
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export function InterviewPerformaTab() {
  const { toast }   = useToast();
  const queryClient = useQueryClient();

  const { data: classData } = useListAdminClasses();
  const classOptions = useMemo(
    () => (classData ?? []).map((c: any) => ({ value: c.code, label: c.name })),
    [classData],
  );

  const [classFilter, setClassFilter] = useState("all");
  const [printing, setPrinting]       = useState(false);

  // Criteria drafts (always-on editing)
  const [drafts, setDrafts]       = useState<Record<string, DraftScores>>({});
  const [savingRow, setSavingRow] = useState<string | null>(null);

  const prevClassRef = useRef(classFilter);

  const qp = useMemo(() => ({
    classApplying: classFilter !== "all" ? classFilter : undefined,
    pageSize: 500,
    page: 1,
  }), [classFilter]);

  const { data, isLoading } = useListAdminInterviewPerforma(qp, {
    query: { queryKey: getListAdminInterviewPerformaQueryKey(qp), placeholderData: keepPreviousData },
  });
  const rows: PerformaRow[] = (data?.items ?? []) as PerformaRow[];

  // Meta edit grid (Status / Interview Date / Venue / Marks)
  const metaGrid = useGridEdit(rows);

  if (prevClassRef.current !== classFilter) {
    prevClassRef.current = classFilter;
    if (Object.keys(drafts).length > 0) setDrafts({});
    if (metaGrid.hasChanges || metaGrid.editMode) metaGrid.discardEdits();
  }

  const bulkSave       = useBulkSaveInterviewPerforma();
  const bulkUpdateMeta = useBulkUpdateInterview();
  const [ivFailedRefs, setIvFailedRefs] = useState<Set<string>>(new Set());

  // ── Criteria input refs ──────────────────────────────────────────────────────

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  function setInputRef(refId: string, key: CriterionKey, el: HTMLInputElement | null) {
    const k = `${refId}:${key}`;
    if (el) inputRefs.current.set(k, el);
    else    inputRefs.current.delete(k);
  }

  function focusCriteriaCell(rowIdx: number, colIdx: number) {
    const row = rows[rowIdx];
    if (!row) return;
    const c = CRITERIA[colIdx];
    if (!c) return;
    const el = inputRefs.current.get(`${row.referenceId}:${c.key}`);
    if (el) { el.focus(); el.select(); }
  }

  function handleKeyDown(e: React.KeyboardEvent, rowIdx: number, colIdx: number) {
    switch (e.key) {
      case "Enter":
      case "ArrowDown":
        e.preventDefault();
        focusCriteriaCell(rowIdx + 1, colIdx);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusCriteriaCell(rowIdx - 1, colIdx);
        break;
      case "ArrowLeft":
        if (colIdx > 0) { e.preventDefault(); focusCriteriaCell(rowIdx, colIdx - 1); }
        break;
      case "ArrowRight":
        if (colIdx < CRITERIA.length - 1) { e.preventDefault(); focusCriteriaCell(rowIdx, colIdx + 1); }
        break;
      case "Tab":
        e.preventDefault();
        if (e.shiftKey) {
          if (colIdx > 0) focusCriteriaCell(rowIdx, colIdx - 1);
          else            focusCriteriaCell(rowIdx - 1, CRITERIA.length - 1);
        } else {
          if (colIdx < CRITERIA.length - 1) focusCriteriaCell(rowIdx, colIdx + 1);
          else                              focusCriteriaCell(rowIdx + 1, 0);
        }
        break;
      case "Escape":
        e.preventDefault();
        (e.currentTarget as HTMLElement).blur();
        break;
    }
  }

  // ── Criteria draft management ────────────────────────────────────────────────

  function setValue(refId: string, key: CriterionKey, val: string) {
    setDrafts(prev => ({
      ...prev,
      [refId]: { ...(prev[refId] ?? {}), [key]: val },
    }));
  }

  function getDraftValue(row: PerformaRow, key: CriterionKey): string {
    const d = drafts[row.referenceId]?.[key];
    return d !== undefined ? d : getApiValue(row, key);
  }

  function isRowDirty(row: PerformaRow): boolean {
    const d = drafts[row.referenceId];
    if (!d) return false;
    return CRITERIA.some(c => {
      const draft = d[c.key];
      if (draft === undefined) return false;
      return draft !== getApiValue(row, c.key);
    });
  }

  const dirtyCount = useMemo(
    () => rows.filter(r => isRowDirty(r)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, drafts],
  );

  const metaDirtyCount = useMemo(
    () => rows.filter(row =>
      META_FIELDS.some(f => metaGrid.isCellDirty(row.referenceId, f, metaOriginal(row, f)))
    ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, metaGrid.pending],
  );

  // ── Auto-save criteria on row blur ───────────────────────────────────────────

  const saveTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const saveRow = useCallback(async (row: PerformaRow, rowDrafts: DraftScores) => {
    const entry: Record<string, any> = { referenceId: row.referenceId };
    let changed = false;
    for (const c of CRITERIA) {
      const d   = rowDrafts[c.key];
      if (d === undefined) continue;
      const api = getApiValue(row, c.key);
      if (d === api) continue;
      changed = true;
      entry[c.key] = d.trim() === "" ? null : parseInt(d, 10);
    }
    if (!changed) return;

    for (const c of CRITERIA) {
      const v = entry[c.key];
      if (v != null && (isNaN(v) || v < 0 || v > MAX_SCORE)) return;
    }

    setSavingRow(row.referenceId);
    try {
      await bulkSave.mutateAsync({ data: { entries: [entry as any] } });
      setDrafts(prev => {
        const next = { ...prev };
        delete next[row.referenceId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: getListAdminInterviewPerformaQueryKey(qp) });
    } catch {
      // silent — user can retry with Save All
    } finally {
      setSavingRow(null);
    }
  }, [bulkSave, queryClient, qp]);

  function handleBlur(row: PerformaRow, rowIdx: number, colIdx: number) {
    const refId = row.referenceId;
    const existing = saveTimeouts.current.get(refId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      saveTimeouts.current.delete(refId);
      const currentDrafts = drafts;
      const rowDrafts = currentDrafts[refId];
      if (!rowDrafts) return;
      const active = document.activeElement as HTMLElement | null;
      const isInRow = active && CRITERIA.some(c => {
        const el = inputRefs.current.get(`${refId}:${c.key}`);
        return el === active;
      });
      if (!isInRow) {
        saveRow(row, rowDrafts);
      }
    }, 150);
    saveTimeouts.current.set(refId, t);
    void rowIdx; void colIdx;
  }

  // ── Save All (criteria + meta) ───────────────────────────────────────────────

  async function handleSaveAll() {
    const criteriaEntries = rows
      .map(row => {
        const rowDrafts = drafts[row.referenceId];
        if (!rowDrafts) return null;
        const entry: Record<string, any> = { referenceId: row.referenceId };
        let changed = false;
        for (const c of CRITERIA) {
          const d = rowDrafts[c.key];
          if (d === undefined) continue;
          const api = getApiValue(row, c.key);
          if (d === api) continue;
          changed = true;
          entry[c.key] = d.trim() === "" ? null : parseInt(d, 10);
        }
        return changed ? entry : null;
      })
      .filter(Boolean);

    const metaEntries = metaGrid.editMode
      ? rows.flatMap(row => {
          const entry: Record<string, any> = { referenceId: row.referenceId };
          let changed = false;
          for (const f of META_FIELDS) {
            const orig = metaOriginal(row, f);
            if (!metaGrid.isCellDirty(row.referenceId, f, orig)) continue;
            const v = metaGrid.getCellValue(row.referenceId, f, orig);
            if (f === "interviewMarks") {
              const n = v.trim() === "" ? null : parseInt(v, 10);
              if (n === null || (!isNaN(n) && n >= 0 && n <= 60)) {
                entry.interviewMarks = n; changed = true;
              }
            } else if (f === "interviewDate") {
              entry.interviewDate = v || null; changed = true;
            } else if (f === "interviewResult") {
              entry.interviewResult = v || null; changed = true;
            } else {
              entry[f] = v; changed = true;
            }
          }
          return changed ? [entry] : [];
        })
      : [];

    if (criteriaEntries.length === 0 && metaEntries.length === 0) {
      toast({ title: "No changes to save" });
      return;
    }

    try {
      let criteriaUpdated = 0;
      let metaUpdated = 0;
      const newFailedRefs = new Set<string>();

      if (criteriaEntries.length > 0) {
        const r = await bulkSave.mutateAsync({ data: { entries: criteriaEntries as any, advanceStatus: true } }) as any;
        criteriaUpdated = r.updated ?? 0;
        (r.results ?? []).filter((x: any) => !x.success).forEach((x: any) => newFailedRefs.add(x.referenceId));
        // Clear criteria drafts only for successful rows
        if (newFailedRefs.size === 0) setDrafts({});
        else {
          setDrafts(prev => {
            const next = { ...prev };
            (r.results ?? []).filter((x: any) => x.success).forEach((x: any) => { delete next[x.referenceId]; });
            return next;
          });
        }
      }

      if (metaEntries.length > 0) {
        const r = await bulkUpdateMeta.mutateAsync({ data: { entries: metaEntries as any } }) as any;
        metaUpdated = r.updated ?? 0;
        (r.results ?? []).filter((x: any) => !x.success).forEach((x: any) => newFailedRefs.add(x.referenceId));
        if (newFailedRefs.size === 0) metaGrid.discardEdits();
      }

      const total = criteriaUpdated + metaUpdated;
      const failedCount = newFailedRefs.size;

      if (failedCount > 0) {
        setIvFailedRefs(newFailedRefs);
        const failedList = Array.from(newFailedRefs);
        const preview = failedList.slice(0, 5).join(", ");
        const extra   = failedList.length > 5 ? ` +${failedList.length - 5} more` : "";
        toast({
          variant: "destructive",
          title: `${total} updated, ${failedCount} failed`,
          description: `Failed: ${preview}${extra}`,
        });
      } else {
        setIvFailedRefs(new Set());
        toast({ title: `Saved — ${total} record${total !== 1 ? "s" : ""} updated` });
      }
      queryClient.invalidateQueries({ queryKey: getListAdminInterviewPerformaQueryKey(qp) });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
  }

  // ── Print ───────────────────────────────────────────────────────────────────

  async function handlePrint() {
    setPrinting(true);
    try {
      const settings = await fetchPrintSettings();
      const classLabel = classOptions.find(o => o.value === classFilter)?.label ?? "All Classes";

      const headerRow = `
        <tr>
          <th style="width:30px">#</th>
          <th>Roll No.</th>
          <th>Candidate Name</th>
          <th>Father's Name</th>
          ${CRITERIA.map(c => `<th style="text-align:center">${c.label}<br/><small style="font-weight:normal">/10</small></th>`).join("")}
          <th style="text-align:center">Total<br/><small style="font-weight:normal">/${TOTAL_MAX}</small></th>
          <th style="text-align:center">Remarks</th>
        </tr>`;

      const bodyRows = rows.map((row, i) => {
        const { total, isComplete } = totalFromDrafts(row, drafts);
        const displayTotal = isComplete
          ? total
          : row.interviewMarks != null ? row.interviewMarks : "—";

        return `
          <tr>
            <td style="text-align:center">${i + 1}</td>
            <td>${row.rollNumber ?? "—"}</td>
            <td>${row.fullName}</td>
            <td>${row.fatherName ?? "—"}</td>
            ${CRITERIA.map(c => {
              const v = getDraftValue(row, c.key);
              return `<td style="text-align:center">${v !== "" ? v : "—"}</td>`;
            }).join("")}
            <td style="text-align:center;font-weight:bold">${displayTotal}</td>
            <td></td>
          </tr>`;
      }).join("");

      const contentHtml = `
        <div style="text-align:center;margin-bottom:16px">
          <h2 style="font-size:15pt;font-weight:bold;margin:0">CADET COLLEGE MURREE</h2>
          <h3 style="font-size:12pt;font-weight:bold;margin:4px 0">INTERVIEW PERFORMA</h3>
          <p style="font-size:10pt;margin:2px 0">Rev No. 001</p>
          <p style="font-size:10pt;margin:2px 0">Class: <strong>${classLabel}</strong> &nbsp;&nbsp; Date: <strong>${fmtLocaleDate(new Date())}</strong></p>
        </div>
        <table style="border-collapse:collapse;width:100%;font-size:9pt">
          <thead style="background:#f5f5f5">${headerRow}</thead>
          <tbody>${bodyRows}</tbody>
        </table>
        <div style="margin-top:40px;display:flex;gap:60px;justify-content:flex-end">
          <div style="text-align:center">
            <div style="width:160px;border-top:1px solid #333;padding-top:4px">Interviewer Signature</div>
          </div>
          <div style="text-align:center">
            <div style="width:160px;border-top:1px solid #333;padding-top:4px">Commandant Signature</div>
          </div>
        </div>`;

      const html = buildPrintHtml(contentHtml, { ...settings, orientation: "landscape" }, "Interview Performa");
      printHtmlDocument(html, {
        onPopupBlocked: () => toast({ title: "Popup blocked. Allow popups to print.", variant: "destructive" }),
      });
    } catch {
      toast({ title: "Print failed", variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  }

  // ── Computed totals ──────────────────────────────────────────────────────────

  const totalDirtyCount = dirtyCount + metaDirtyCount;
  const isSavingAny = bulkSave.isPending || bulkUpdateMeta.isPending;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 148px)" }}>
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
            Interview Performa
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Score each criterion (0–10). Scores auto-save on row exit.{" "}
            <span className="font-medium text-slate-600">Tab / Shift+Tab / ←→</span> across columns &nbsp;·&nbsp;{" "}
            <span className="font-medium text-slate-600">Enter / ↑↓</span> between rows.
            {!metaGrid.editMode && (
              <> &nbsp;·&nbsp; Click <span className="font-medium text-slate-600">Edit Details</span> to update Status / Date / Venue / Marks.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {totalDirtyCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              {totalDirtyCount} unsaved row{totalDirtyCount !== 1 ? "s" : ""}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-slate-600"
            onClick={handlePrint}
            disabled={printing || rows.length === 0}
          >
            {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
            Print
          </Button>
          {/* Meta edit mode controls */}
          {!metaGrid.editMode ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-slate-600"
              onClick={() => { setIvFailedRefs(new Set()); metaGrid.enterEditMode(); }}
              disabled={rows.length === 0}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit Details
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-slate-600"
              onClick={metaGrid.discardEdits}
              disabled={isSavingAny}
            >
              <XIcon className="h-3.5 w-3.5" />
              Discard Details
            </Button>
          )}
          <Button
            onClick={handleSaveAll}
            disabled={isSavingAny || totalDirtyCount === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isSavingAny
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Save className="mr-2 h-4 w-4" />}
            Save & Update
          </Button>
        </div>
      </div>

      {/* Meta edit hint */}
      {metaGrid.editMode && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800 flex items-center gap-2 shrink-0">
          <Pencil className="h-3.5 w-3.5 shrink-0" />
          <span>
            Detail edit mode — Status, Interview Date, Venue and Marks cells are now editable. Yellow cells have unsaved changes.{" "}
            <span className="font-medium">Tab / Shift+Tab / ←→</span> to navigate. Click <strong>Save &amp; Update</strong> to commit.
          </span>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 mb-3 shrink-0">
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-[220px] h-9 text-sm">
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classOptions.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-400 select-none">
          {isLoading ? "Loading…" : `${rows.length} candidate${rows.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* ── Spreadsheet grid ── */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 shadow-sm bg-white min-h-0">
        <table className="w-full text-xs border-collapse" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 36  }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 140 }} />
            {CRITERIA.map(c => <col key={c.key} style={{ width: 76 }} />)}
            <col style={{ width: 72  }} />
            {/* Meta columns */}
            <col style={{ width: 120 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 80  }} />
            <col style={{ width: 90  }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b-2 border-slate-200">
              <th className="py-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wide">#</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide">Roll / Ref</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide">Candidate</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide">Father's Name</th>
              {CRITERIA.map(c => (
                <th key={c.key} className="px-1 py-1 text-center bg-violet-50 border-l border-slate-200">
                  <span className="block text-[9px] font-bold text-violet-500 uppercase tracking-widest">{c.abbr}</span>
                  <span className="text-[10px] font-semibold text-slate-500">/{MAX_SCORE}</span>
                </th>
              ))}
              <th className="px-1 py-1 text-center bg-indigo-50 border-l border-slate-200">
                <span className="block text-[9px] font-bold text-indigo-500 uppercase tracking-widest">Total</span>
                <span className="text-[10px] font-bold text-indigo-700">/{TOTAL_MAX}</span>
              </th>
              {/* Meta column headers */}
              <th className={cn("px-2 py-1 text-left text-[9px] font-bold uppercase tracking-wide border-l border-slate-200", metaGrid.editMode ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400")}>
                Status
              </th>
              <th className={cn("px-2 py-1 text-left text-[9px] font-bold uppercase tracking-wide border-l border-slate-200", metaGrid.editMode ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400")}>
                Int. Date
              </th>
              <th className={cn("px-2 py-1 text-left text-[9px] font-bold uppercase tracking-wide border-l border-slate-200", metaGrid.editMode ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400")}>
                Venue
              </th>
              <th className={cn("px-2 py-1 text-center text-[9px] font-bold uppercase tracking-wide border-l border-slate-200", metaGrid.editMode ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400")}>
                Marks
              </th>
              <th className={cn("px-2 py-1 text-center text-[9px] font-bold uppercase tracking-wide border-l border-slate-200", metaGrid.editMode ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400")}>
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100">
                  {Array.from({ length: 4 + CRITERIA.length + 1 + 5 }).map((_, j) => (
                    <td key={j} className="px-3 py-2">
                      <Skeleton className="h-5 rounded w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4 + CRITERIA.length + 1 + 5} className="text-center py-24 text-slate-400">
                  <FileText className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                  <p className="font-semibold text-slate-500">No candidates in interview pipeline</p>
                  <p className="text-[12px] mt-0.5">Candidates appear here once scheduled for an interview.</p>
                </td>
              </tr>
            ) : (
              rows.map((row, rowIdx) => {
                const rowDirty     = isRowDirty(row);
                const metaRowDirty = metaGrid.editMode && META_FIELDS.some(f => metaGrid.isCellDirty(row.referenceId, f, metaOriginal(row, f)));
                const isSaving     = savingRow === row.referenceId;
                const { total, isComplete } = totalFromDrafts(row, drafts);

                // Display total: prefer criteria sum if complete, else edited marks or stored marks
                const editedMarksStr = metaGrid.editMode
                  ? metaGrid.getCellValue(row.referenceId, "interviewMarks", metaOriginal(row, "interviewMarks"))
                  : null;
                const editedMarks = editedMarksStr && editedMarksStr !== "" ? parseInt(editedMarksStr, 10) : null;
                const displayTotal = isComplete ? total : (editedMarks != null && !isNaN(editedMarks) ? editedMarks : (row.interviewMarks ?? null));

                return (
                  <tr
                    key={row.referenceId}
                    className={cn(
                      "border-b border-slate-100 transition-colors",
                      isSaving       ? "opacity-60"
                      : (rowDirty || metaRowDirty) ? "bg-amber-50/40 hover:bg-amber-50/60"
                                    : "hover:bg-slate-50/60",
                      ivFailedRefs.has(row.referenceId) && "bg-red-50 outline outline-1 outline-red-200",
                    )}
                  >
                    {/* # */}
                    <td className="py-1.5 text-center text-[11px] text-slate-300 select-none">
                      {rowIdx + 1}
                    </td>
                    {/* Roll / Ref */}
                    <td className="px-3 py-1.5 overflow-hidden">
                      {row.rollNumber && (
                        <span className="font-mono text-[11px] font-bold text-indigo-600 block truncate">
                          {row.rollNumber}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 truncate block">{row.referenceId}</span>
                    </td>
                    {/* Candidate */}
                    <td className="px-3 py-1.5 overflow-hidden">
                      <p className="font-semibold text-[12px] text-slate-800 truncate">
                        {row.fullName}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{row.classApplying}</p>
                    </td>
                    {/* Father */}
                    <td className="px-3 py-1.5 overflow-hidden">
                      <span className="text-[11px] text-slate-600 truncate block">{row.fatherName ?? "—"}</span>
                      {row.occupation && (
                        <span className="text-[10px] text-slate-400 truncate block">{row.occupation}</span>
                      )}
                    </td>

                    {/* ── Score cells ── */}
                    {CRITERIA.map((c, colIdx) => {
                      const val     = getDraftValue(row, c.key);
                      const isDirty = drafts[row.referenceId]?.[c.key] !== undefined && drafts[row.referenceId]?.[c.key] !== getApiValue(row, c.key);
                      const err     = hasError(val);

                      return (
                        <td
                          key={c.key}
                          className={cn(
                            "px-1 py-1 border-l border-slate-200",
                            err      ? "bg-red-50/60"
                            : isDirty ? "bg-amber-100/50"
                                      : "bg-violet-50/30",
                          )}
                        >
                          <input
                            data-cell-id={`${row.referenceId}:${c.key}`}
                            ref={el => setInputRef(row.referenceId, c.key, el)}
                            type="number"
                            min={0}
                            max={MAX_SCORE}
                            disabled={isSaving}
                            className={cn(
                              "w-full h-7 rounded-md px-1 text-center text-[12px] font-semibold bg-white border transition-colors",
                              "focus:outline-none focus:ring-2 focus:ring-violet-400/50 focus:border-violet-400",
                              err
                                ? "border-red-400 bg-red-50"
                                : isDirty
                                ? "border-amber-400 bg-amber-50"
                                : "border-slate-200 hover:border-slate-300",
                              isSaving && "cursor-not-allowed",
                            )}
                            value={val}
                            placeholder="—"
                            onChange={e => setValue(row.referenceId, c.key, e.target.value)}
                            onKeyDown={e => handleKeyDown(e, rowIdx, colIdx)}
                            onBlur={() => handleBlur(row, rowIdx, colIdx)}
                          />
                        </td>
                      );
                    })}

                    {/* Total /60 */}
                    <td className="px-1 py-1 text-center bg-indigo-50/60 border-l border-slate-200 select-none">
                      <span className={cn(
                        "text-[13px] font-extrabold tabular-nums",
                        displayTotal != null
                          ? isComplete
                            ? displayTotal >= 36 ? "text-indigo-700" : "text-rose-500"
                            : "text-slate-400"
                          : "text-slate-300",
                      )}>
                        {displayTotal != null
                          ? (isComplete ? displayTotal : `~${displayTotal}`)
                          : "—"}
                      </span>
                    </td>

                    {/* ── Meta: Status ── */}
                    <td className="px-1 py-1 border-l border-slate-200">
                      <GridSelectCell
                        editMode={metaGrid.editMode}
                        value={metaGrid.getCellValue(row.referenceId, "status", metaOriginal(row, "status"))}
                        onChange={v => metaGrid.setCellValue(row.referenceId, "status", v)}
                        dirty={metaGrid.isCellDirty(row.referenceId, "status", metaOriginal(row, "status"))}
                        options={IV_STATUS_OPTIONS}
                        onKeyDown={e => metaGrid.handleCellKeyDown(e, rowIdx, 0, META_FIELDS as unknown as string[], rows.length)}
                        cellRef={el => metaGrid.registerCellRef(row.referenceId, "status", el)}
                        cellId={`${row.referenceId}:status`}
                      />
                    </td>

                    {/* ── Meta: Interview Date ── */}
                    <td className="px-1 py-1 border-l border-slate-200">
                      <GridDateCell
                        editMode={metaGrid.editMode}
                        value={metaGrid.getCellValue(row.referenceId, "interviewDate", metaOriginal(row, "interviewDate"))}
                        onChange={v => metaGrid.setCellValue(row.referenceId, "interviewDate", v)}
                        dirty={metaGrid.isCellDirty(row.referenceId, "interviewDate", metaOriginal(row, "interviewDate"))}
                        onKeyDown={e => metaGrid.handleCellKeyDown(e, rowIdx, 1, META_FIELDS as unknown as string[], rows.length)}
                        cellRef={el => metaGrid.registerCellRef(row.referenceId, "interviewDate", el)}
                        cellId={`${row.referenceId}:interviewDate`}
                      />
                    </td>

                    {/* ── Meta: Venue ── */}
                    <td className="px-1 py-1 border-l border-slate-200">
                      <GridTextCell
                        editMode={metaGrid.editMode}
                        value={metaGrid.getCellValue(row.referenceId, "interviewVenue", metaOriginal(row, "interviewVenue"))}
                        onChange={v => metaGrid.setCellValue(row.referenceId, "interviewVenue", v)}
                        dirty={metaGrid.isCellDirty(row.referenceId, "interviewVenue", metaOriginal(row, "interviewVenue"))}
                        placeholder="—"
                        onKeyDown={e => metaGrid.handleCellKeyDown(e, rowIdx, 2, META_FIELDS as unknown as string[], rows.length)}
                        cellRef={el => metaGrid.registerCellRef(row.referenceId, "interviewVenue", el)}
                        cellId={`${row.referenceId}:interviewVenue`}
                      />
                    </td>

                    {/* ── Meta: Marks (direct override) ── */}
                    <td className="px-1 py-1 border-l border-slate-200 text-center">
                      <GridNumberCell
                        editMode={metaGrid.editMode}
                        value={metaGrid.getCellValue(row.referenceId, "interviewMarks", metaOriginal(row, "interviewMarks"))}
                        onChange={v => metaGrid.setCellValue(row.referenceId, "interviewMarks", v)}
                        dirty={metaGrid.isCellDirty(row.referenceId, "interviewMarks", metaOriginal(row, "interviewMarks"))}
                        min={0}
                        max={60}
                        placeholder="—"
                        onKeyDown={e => metaGrid.handleCellKeyDown(e, rowIdx, 3, META_FIELDS as unknown as string[], rows.length)}
                        cellRef={el => metaGrid.registerCellRef(row.referenceId, "interviewMarks", el)}
                        cellId={`${row.referenceId}:interviewMarks`}
                      />
                    </td>

                    {/* ── Meta: Result (Pass / Fail / Pending) ── */}
                    <td className="px-1 py-1 border-l border-slate-200 text-center">
                      {metaGrid.editMode ? (
                        <GridSelectCell
                          editMode
                          value={metaGrid.getCellValue(row.referenceId, "interviewResult", metaOriginal(row, "interviewResult"))}
                          onChange={v => metaGrid.setCellValue(row.referenceId, "interviewResult", v)}
                          dirty={metaGrid.isCellDirty(row.referenceId, "interviewResult", metaOriginal(row, "interviewResult"))}
                          options={IV_RESULT_OPTIONS}
                          emptyLabel="—"
                          onKeyDown={e => metaGrid.handleCellKeyDown(e, rowIdx, 4, META_FIELDS as unknown as string[], rows.length)}
                          cellRef={el => metaGrid.registerCellRef(row.referenceId, "interviewResult", el)}
                          cellId={`${row.referenceId}:interviewResult`}
                        />
                      ) : (
                        <span className={cn(
                          "text-[11px] font-semibold",
                          row.interviewResult === "pass"    ? "text-emerald-600" :
                          row.interviewResult === "fail"    ? "text-rose-500" :
                          row.interviewResult === "pending" ? "text-amber-600" :
                          "text-slate-300",
                        )}>
                          {row.interviewResult
                            ? IV_RESULT_OPTIONS.find(o => o.value === row.interviewResult)?.label ?? row.interviewResult
                            : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
