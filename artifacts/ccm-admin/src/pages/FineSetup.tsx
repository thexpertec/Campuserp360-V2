import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminAcademicYears,
  useListAdminFineRules,
  getListAdminFineRulesQueryKey,
  useUpsertAdminFineRule,
  type FineRule,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, ShieldAlert, Clock } from "lucide-react";
import { useDefaultYear } from "@/hooks/use-default-year";

// ── Types & helpers ────────────────────────────────────────────────────────────

type FineType = "attendance" | "late_fee";

const FINE_MODE_LABELS: Record<string, string> = {
  flat:           "Flat amount (PKR)",
  per_day:        "Per day overdue (PKR)",
  per_absent_day: "Per absent day (PKR)",
};

function findRule(rules: FineRule[], fineType: FineType): FineRule | undefined {
  return rules.find(r => r.fineType === fineType && !r.classCode);
}

// ── Attendance Fine Card ───────────────────────────────────────────────────────

interface AttendanceCardProps {
  rule: FineRule | undefined;
  academicYearId: string;
  onSaved: () => void;
}

function AttendanceFineCard({ rule, academicYearId, onSaved }: AttendanceCardProps) {
  const { toast } = useToast();
  const mutation = useUpsertAdminFineRule();

  const [amount,    setAmount]    = useState(String(rule?.fineAmount ?? 0));
  const [mode,      setMode]      = useState<string>(rule?.fineMode ?? "flat");
  const [active,    setActive]    = useState(rule?.active ?? true);

  function handleSave() {
    const a = parseInt(amount, 10);
    if (isNaN(a) || a < 0) {
      toast({ title: "Amount must be ≥ 0", variant: "destructive" }); return;
    }
    mutation.mutate(
      { data: { academicYearId, fineType: "attendance", threshold: 75, fineAmount: a, fineMode: mode as any, active } },
      {
        onSuccess: () => { toast({ title: "Attendance fine saved" }); onSaved(); },
        onError: (err: any) => toast({ title: "Save failed", description: err?.message ?? "Unknown error", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
        <div>
          <h3 className="font-semibold text-amber-900">Attendance Fine</h3>
          <p className="text-xs text-amber-700 mt-0.5">
            Charged when a student's attendance falls below 75%.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">{active ? "Active" : "Inactive"}</span>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-700">Fine Mode</Label>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flat">Flat amount</SelectItem>
              <SelectItem value="per_absent_day">Per absent day</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">How the fine is calculated</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-700">
            Fine Amount <span className="text-slate-400">(PKR)</span>
          </Label>
          <Input
            type="number" min={0}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="bg-white"
          />
          <p className="text-xs text-slate-500">
            {mode === "flat" ? "Fixed amount per breach" : "Per absent day after threshold"}
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Attendance Fine
        </Button>
      </div>
    </div>
  );
}

// ── Late Fee Fine Card ─────────────────────────────────────────────────────────

interface LateFeeCardProps {
  rule: FineRule | undefined;
  academicYearId: string;
  onSaved: () => void;
}

function LateFeeFineCard({ rule, academicYearId, onSaved }: LateFeeCardProps) {
  const { toast } = useToast();
  const mutation = useUpsertAdminFineRule();

  const [graceDays, setGraceDays] = useState(String(rule?.threshold ?? 0));
  const [amount,    setAmount]    = useState(String(rule?.fineAmount ?? 0));
  const [mode,      setMode]      = useState<string>(rule?.fineMode ?? "flat");
  const [active,    setActive]    = useState(rule?.active ?? true);

  function handleSave() {
    const t = parseInt(graceDays, 10);
    const a = parseInt(amount, 10);
    if (isNaN(t) || t < 0) {
      toast({ title: "Grace days must be ≥ 0", variant: "destructive" }); return;
    }
    if (isNaN(a) || a < 0) {
      toast({ title: "Amount must be ≥ 0", variant: "destructive" }); return;
    }
    mutation.mutate(
      { data: { academicYearId, fineType: "late_fee", threshold: t, fineAmount: a, fineMode: mode as any, active } },
      {
        onSuccess: () => { toast({ title: "Late fee fine saved" }); onSaved(); },
        onError: (err: any) => toast({ title: "Save failed", description: err?.message ?? "Unknown error", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-rose-600 shrink-0" />
        <div>
          <h3 className="font-semibold text-rose-900">Late Fee Submission Fine</h3>
          <p className="text-xs text-rose-700 mt-0.5">
            Charged when a student pays their challan after the due date (beyond the grace period).
            The fine is added as a line item on the student's <em>next</em> challan.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">{active ? "Active" : "Inactive"}</span>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-700">
            Grace Period <span className="text-slate-400">(days)</span>
          </Label>
          <Input
            type="number" min={0}
            value={graceDays}
            onChange={e => setGraceDays(e.target.value)}
            className="bg-white"
          />
          <p className="text-xs text-slate-500">Days after due date before fine kicks in (0 = no grace)</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-700">Fine Mode</Label>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flat">Flat amount</SelectItem>
              <SelectItem value="per_day">Per day overdue</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">How the fine is calculated</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-700">
            Fine Amount <span className="text-slate-400">(PKR)</span>
          </Label>
          <Input
            type="number" min={0}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="bg-white"
          />
          <p className="text-xs text-slate-500">
            {mode === "flat" ? "Fixed amount per overdue challan" : "Per day after grace period"}
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="bg-rose-600 hover:bg-rose-700 text-white"
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Late Fee Fine
        </Button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FineSetup() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: years = [], isLoading: yearsLoading } = useListAdminAcademicYears();
  const defaultYearId = useDefaultYear();
  const [selectedYearId, setSelectedYearId] = useState<string>("");

  const yearId = selectedYearId || defaultYearId || "";

  const { data: rules = [], isLoading: rulesLoading } = useListAdminFineRules(
    { academicYearId: yearId },
    { query: { enabled: !!yearId, queryKey: getListAdminFineRulesQueryKey({ academicYearId: yearId }) } },
  );

  const attRule  = findRule(rules, "attendance");
  const lateRule = findRule(rules, "late_fee");

  function handleSaved() {
    void queryClient.invalidateQueries({ queryKey: getListAdminFineRulesQueryKey({ academicYearId: yearId }) });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-7 w-7 text-slate-600 shrink-0" />
        <div>
          <h1 className="text-xl font-bold text-slate-800">Fine Setup</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure automatic fine line items added to student challans at generation time.
          </p>
        </div>
      </div>

      {/* Academic Year selector */}
      <div className="flex items-center gap-3">
        <Label className="text-sm font-medium text-slate-700 shrink-0">Academic Year</Label>
        {yearsLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        ) : (
          <Select
            value={yearId}
            onValueChange={setSelectedYearId}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select year…" />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!yearId && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-8 text-center text-slate-500 text-sm">
          Select an academic year to configure fine rules.
        </div>
      )}

      {yearId && rulesLoading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading fine rules…
        </div>
      )}

      {yearId && !rulesLoading && (
        <div className="space-y-4">
          <AttendanceFineCard
            rule={attRule}
            academicYearId={yearId}
            onSaved={handleSaved}
          />
          <LateFeeFineCard
            rule={lateRule}
            academicYearId={yearId}
            onSaved={handleSaved}
          />

          <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500 space-y-1">
            <p className="font-medium text-slate-700">How fines appear on challans</p>
            <p>
              When a challan is generated for a student, the system checks both fine rules for that student's
              class and academic year. If any fine applies, it is automatically added as a separate line item
              (using fee types <code className="bg-slate-100 px-1 rounded">attendance-fine</code> and{" "}
              <code className="bg-slate-100 px-1 rounded">late-fee-fine</code>) with the same challan number.
              Fine line items appear alongside regular fee rows in both the admin printing station and the
              student portal challan.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
