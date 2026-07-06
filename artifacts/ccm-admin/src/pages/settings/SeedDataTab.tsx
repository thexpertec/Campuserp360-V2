import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, Loader2, RotateCcw, CheckCircle2, AlertTriangle,
  Users, GraduationCap, BookOpen, Banknote, BedDouble,
  Bus, Dumbbell, Stethoscope, Clock, Package, Trophy,
  FlaskConical, ChevronDown, ChevronUp, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TOKEN_KEY = "ccm_admin_token";

type TableLog = { table: string; rows: number; skipped: boolean };

type SeedResponse = {
  ok: boolean;
  cleared?: boolean;
  tables: TableLog[];
  totalRows: number;
  totalSkipped: number;
  error?: string;
};

type RunState = "idle" | "seeding" | "reseeding" | "done" | "error";

const MODULE_ICONS: Record<string, typeof Sparkles> = {
  "Academic":     GraduationCap,
  "Test Centres": FlaskConical,
  "HR / Staff":   Users,
  "Applications": FileText,
  "Students":     GraduationCap,
  "Finance":      Banknote,
  "Hostel":       BedDouble,
  "Transport":    Bus,
  "Library":      BookOpen,
  "Store":        Package,
  "Exams":        FlaskConical,
  "Timetable":    Clock,
  "Sports":       Trophy,
  "Medical":      Stethoscope,
  "Gate":         FileText,
  "Syllabus":     BookOpen,
  "Events & Comms": Sparkles,
};

const MODULE_TABLE_PREFIXES: Array<{ module: string; prefixes: string[] }> = [
  { module: "Academic",     prefixes: ["academic_years","class_categories","classes","sections","houses","subjects","class_sections","class_subjects","class_academic_years","academic_terms","affiliations","terms_conditions","merit_config"] },
  { module: "Test Centres", prefixes: ["test_centres"] },
  { module: "HR / Staff",   prefixes: ["hr_departments","hr_designations","hr_salary_grades","hr_incentive_types","hr_deduction_types","employees","employee_bank_accounts","employee_salary_templates","employee_salary_template_items","employee_salary_transactions","hr_attendance","hr_leave_requests"] },
  { module: "Applications", prefixes: ["applications","application_events"] },
  { module: "Students",     prefixes: ["guardians","students","section_allocations","student_attendance","student_disciplinary"] },
  { module: "Finance",      prefixes: ["bank_accounts","chart_of_accounts","fee_types","fee_schedule","fee_challans","vendors","journal_entries","journal_lines"] },
  { module: "Hostel",       prefixes: ["hostel_blocks","hostel_room_types","hostel_rooms","hostel_allocations"] },
  { module: "Transport",    prefixes: ["transport_vehicles","transport_routes","transport_drivers","transport_trips"] },
  { module: "Library",      prefixes: ["library_categories","library_publishers","library_books","library_issues"] },
  { module: "Store",        prefixes: ["store_item_categories","store_units","store_items","store_transactions"] },
  { module: "Exams",        prefixes: ["exam_types","exam_grading_scales","exam_grade_bands","exam_schedules","exam_results"] },
  { module: "Timetable",    prefixes: ["timetable_periods","timetable_slots","teacher_subject_assignments"] },
  { module: "Sports",       prefixes: ["sports_categories","sports_venues","sports_teams","sports_fixtures"] },
  { module: "Medical",      prefixes: ["medical_medicine_categories","medical_medicines","medical_conditions","medical_visits"] },
  { module: "Gate",         prefixes: ["gate_log","gate_outpass"] },
  { module: "Syllabus",     prefixes: ["syllabus_units","syllabus_topics"] },
  { module: "Events & Comms", prefixes: ["events","announcements","noticeboard_items"] },
];

function groupByModule(tables: TableLog[]) {
  return MODULE_TABLE_PREFIXES.map(({ module, prefixes }) => {
    const matched = tables.filter(t => prefixes.includes(t.table));
    const rows    = matched.reduce((s, t) => s + t.rows, 0);
    const skipped = matched.every(t => t.skipped);
    return { module, rows, skipped, tables: matched };
  }).filter(m => m.tables.length > 0);
}

export function SeedDataTab() {
  const { toast } = useToast();
  const [state, setState]     = useState<RunState>("idle");
  const [result, setResult]   = useState<SeedResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(module: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(module) ? next.delete(module) : next.add(module);
      return next;
    });
  }

  async function callApi(endpoint: string, runState: "seeding" | "reseeding") {
    setState(runState);
    setResult(null);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch(`/api/admin/settings/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data: SeedResponse = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Request failed");
      setResult(data);
      setState("done");
      toast({
        title: runState === "reseeding" ? "Database reloaded" : "Demo data loaded",
        description: `${data.totalRows.toLocaleString()} rows inserted across ${data.tables.filter(t => !t.skipped).length} tables.`,
      });
    } catch (err: any) {
      setState("error");
      toast({
        title: runState === "reseeding" ? "Reload failed" : "Seed failed",
        description: err?.message ?? "Could not reach the API server.",
        variant: "destructive",
      });
    }
  }

  const isRunning = state === "seeding" || state === "reseeding";
  const modules   = result ? groupByModule(result.tables) : null;

  return (
    <div className="space-y-8">
      {/* Intro banner */}
      <div className="rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900 shrink-0 mt-0.5">
            <Sparkles className="h-4 w-4 text-violet-700 dark:text-violet-400" />
          </div>
          <div>
            <p className="font-semibold text-sm">Demo / Development Data</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Populates all database tables with realistic Cadet College Murree data — students,
              staff, fee records, hostel allocations, exam results, and more. Use{" "}
              <span className="font-medium text-foreground">Load Demo Data</span> to fill only empty
              tables, or{" "}
              <span className="font-medium text-foreground">Clear &amp; Reload</span> to wipe
              everything and start fresh.
            </p>
          </div>
        </div>
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Safe seed */}
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900 shrink-0">
              <Sparkles className="h-4 w-4 text-green-700 dark:text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-sm">Load Demo Data</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inserts sample data into every empty table. Tables that already have data are
                skipped — nothing is overwritten.
              </p>
            </div>
          </div>
          <Button
            onClick={() => callApi("seed", "seeding")}
            disabled={isRunning}
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white w-full"
          >
            {state === "seeding"
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Seeding…</>
              : <><Sparkles className="mr-2 h-4 w-4" /> Load Demo Data</>}
          </Button>
        </div>

        {/* Destructive reseed */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900 shrink-0">
              <RotateCcw className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-sm">Clear &amp; Reload</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="text-amber-700 dark:text-amber-400 font-medium">Destructive.</span>{" "}
                Deletes all existing data from every table, then seeds a fresh dataset. This
                cannot be undone.
              </p>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={isRunning}
                size="sm"
                variant="outline"
                className="border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900 w-full"
              >
                {state === "reseeding"
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reloading…</>
                  : <><RotateCcw className="mr-2 h-4 w-4 text-amber-600" /> Clear &amp; Reload</>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" /> Clear all data?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>all records</strong> from every database
                  table — students, staff, fee history, applications, and everything else — then
                  insert a fresh set of demo data. There is no undo. Make sure you have a backup
                  if this is a production environment.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-amber-600 text-white hover:bg-amber-700"
                  onClick={() => callApi("reseed", "reseeding")}
                >
                  Yes, clear &amp; reload
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Error state */}
      {state === "error" && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Operation failed. Check the API server console for details.
        </div>
      )}

      {/* Results */}
      {result && modules && state === "done" && (
        <>
          <Separator />

          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total Rows</p>
              <p className="text-2xl font-bold text-green-600 mt-0.5">{result.totalRows.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Tables Seeded</p>
              <p className="text-2xl font-bold mt-0.5">{result.tables.filter(t => !t.skipped).length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Tables Skipped</p>
              <p className="text-2xl font-bold text-muted-foreground mt-0.5">{result.totalSkipped}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Mode</p>
              <p className="text-sm font-semibold mt-1">
                {result.cleared
                  ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Fresh reload</Badge>
                  : <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Incremental</Badge>}
              </p>
            </div>
          </div>

          {/* Module breakdown */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Module Breakdown</p>
            <div className="rounded-xl border border-border overflow-hidden">
              {modules.map((mod, mi) => {
                const Icon = MODULE_ICONS[mod.module] ?? Sparkles;
                const open = expanded.has(mod.module);
                return (
                  <div key={mod.module} className={cn("bg-card", mi > 0 && "border-t border-border")}>
                    <button
                      onClick={() => toggleExpand(mod.module)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                    >
                      <div className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-md shrink-0",
                        mod.skipped ? "bg-muted" : "bg-primary/10"
                      )}>
                        <Icon className={cn("h-3.5 w-3.5", mod.skipped ? "text-muted-foreground" : "text-primary")} />
                      </div>
                      <span className="flex-1 text-sm font-medium">{mod.module}</span>
                      {mod.skipped
                        ? <Badge variant="outline" className="text-muted-foreground text-xs">Skipped</Badge>
                        : <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">{mod.rows.toLocaleString()} rows</Badge>}
                      {open
                        ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    </button>
                    {open && (
                      <div className="px-4 pb-3 pt-0 border-t border-border/50 bg-muted/20">
                        <table className="w-full text-xs">
                          <tbody className="divide-y divide-border/40">
                            {mod.tables.map(tbl => (
                              <tr key={tbl.table}>
                                <td className="py-1.5 font-mono text-muted-foreground">{tbl.table}</td>
                                <td className="py-1.5 text-right">
                                  {tbl.skipped
                                    ? <span className="text-muted-foreground">skipped</span>
                                    : <span className="font-semibold text-green-700">+{tbl.rows.toLocaleString()}</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Done banner */}
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold text-green-800 dark:text-green-300">Done!</span>{" "}
              <span className="text-green-700 dark:text-green-400">
                {result.cleared
                  ? `Database cleared and reloaded with ${result.totalRows.toLocaleString()} demo rows.`
                  : `${result.totalRows.toLocaleString()} demo rows added. Reload any module page to see the data.`}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Preview of what gets seeded */}
      {state === "idle" && (
        <>
          <Separator />
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">What gets seeded</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { icon: GraduationCap, label: "Academic structure",  detail: "3 years · 6 classes · 4 sections · 4 houses · 10 subjects" },
                { icon: FileText,      label: "Admission pipeline",   detail: "150 applications at various stages + events log" },
                { icon: Users,         label: "Staff & HR",           detail: "30 employees · 6 months payroll · attendance · leaves" },
                { icon: GraduationCap, label: "Students",             detail: "120 cadets (20/class) · guardians · attendance · discipline" },
                { icon: Banknote,      label: "Finance",              detail: "Fee schedule · challans · COA · journal entries · vendors" },
                { icon: BedDouble,     label: "Hostel",               detail: "3 blocks · 30 rooms · 60 cadet allocations" },
                { icon: Bus,           label: "Transport",            detail: "4 vehicles · 3 routes · 4 drivers · 60 trip logs" },
                { icon: BookOpen,      label: "Library",              detail: "40 books · 6 categories · 5 publishers · 30 issues" },
                { icon: Package,       label: "Store / Inventory",    detail: "30 items · 8 categories · inbound & outbound transactions" },
                { icon: FlaskConical,  label: "Exams",                detail: "4 exam types · grading scale · schedules · results" },
                { icon: Trophy,        label: "Sports",               detail: "5 sports · 4 venues · 8 teams · 20 fixtures" },
                { icon: Stethoscope,   label: "Medical",              detail: "Medicines · sick-bay visits · conditions log" },
                { icon: Clock,         label: "Timetable",            detail: "9 periods · weekly slots for all 6 classes" },
                { icon: Sparkles,      label: "Events & Comms",       detail: "8 events · 5 announcements · 5 noticeboard items" },
              ].map(({ icon: Icon, label, detail }) => (
                <div key={label} className="flex items-start gap-2.5 rounded-lg border border-border bg-card/50 px-3 py-2.5">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 shrink-0 mt-0.5">
                    <Icon className="h-3 w-3 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold">{label}</p>
                    <p className="text-xs text-muted-foreground">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
