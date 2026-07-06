import { useState, useEffect, useMemo, useRef } from "react";
import { formatDate as fmtLocDate } from "@/lib/locale";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useLookupApplication, type ApplicationDetail, type ApplicationEvent } from "@workspace/api-client-react";
import { ApiError } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSiteBaseUrl } from "@/lib/site-settings";
import PageHero from "@/components/PageHero";
import { usePageBlocks } from "@/lib/usePageBlocks";
import EditableText from "@/components/cms/EditableText";
import { openPrintWindow } from "@/lib/print-window";
import {
  Search,
  CheckCircle2,
  Clock,
  FileCheck2,
  CalendarClock,
  ClipboardCheck,
  Trophy,
  GraduationCap,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Printer,
  Download,
  MessageCircle,
  RotateCcw,
  Sparkles,
  User,
  MapPin,
  Hash,
  Copy,
  ArrowRight,
  CreditCard,
  Banknote,
  BadgeCheck,
} from "lucide-react";

type StageKey =
  | "received"
  | "verified"
  | "test_scheduled"
  | "test_taken"
  | "result_announced"
  | "decision";

const STAGES: { key: StageKey; title: string; desc: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "received", title: "Application Received", desc: "Your application has reached our admissions office.", Icon: FileCheck2 },
  { key: "verified", title: "Documents Verified", desc: "Documents reviewed by the admissions team.", Icon: ShieldCheck },
  { key: "test_scheduled", title: "Entry Test Scheduled", desc: "Roll number, test date and centre confirmed.", Icon: CalendarClock },
  { key: "test_taken", title: "Entry Test Conducted", desc: "Test paper attempted at the exam centre.", Icon: ClipboardCheck },
  { key: "result_announced", title: "Result Announced", desc: "Marks and merit position published.", Icon: Trophy },
  { key: "decision", title: "Final Decision", desc: "Admission outcome.", Icon: GraduationCap },
];

const STATUS_TO_STAGE_INDEX: Record<string, number> = {
  received: 0,
  verified: 1,
  test_scheduled: 2,
  test_taken: 3,
  result_announced: 4,
  admitted: 5,
  rejected: 5,
  on_hold: 5,
};

const STATUS_LABEL: Record<string, string> = {
  received: "Application Received",
  verified: "Documents Verified",
  test_scheduled: "Entry Test Scheduled",
  test_taken: "Entry Test Conducted",
  result_announced: "Result Announced",
  admitted: "Qualified",
  rejected: "Not Selected",
  on_hold: "On Hold",
};

const STATUS_TONE: Record<string, { chip: string; ring: string; glow: string }> = {
  received:        { chip: "bg-blue-100 text-blue-800 border-blue-200",       ring: "ring-blue-300",   glow: "from-blue-400/30" },
  verified:        { chip: "bg-indigo-100 text-indigo-800 border-indigo-200", ring: "ring-indigo-300", glow: "from-indigo-400/30" },
  test_scheduled:  { chip: "bg-amber-100 text-amber-900 border-amber-200",    ring: "ring-amber-300",  glow: "from-amber-400/40" },
  test_taken:      { chip: "bg-purple-100 text-purple-800 border-purple-200", ring: "ring-purple-300", glow: "from-purple-400/30" },
  result_announced:{ chip: "bg-orange-100 text-orange-900 border-orange-200", ring: "ring-orange-300", glow: "from-orange-400/40" },
  admitted:        { chip: "bg-emerald-100 text-emerald-800 border-emerald-200", ring: "ring-emerald-400", glow: "from-emerald-400/40" },
  rejected:        { chip: "bg-rose-100 text-rose-800 border-rose-200",       ring: "ring-rose-300",   glow: "from-rose-400/30" },
  on_hold:         { chip: "bg-slate-100 text-slate-800 border-slate-200",    ring: "ring-slate-300",  glow: "from-slate-400/30" },
};

const CLASS_LABEL: Record<string, string> = {
  "class-6": "Class VI",
  "class-7": "Class VII",
  "class-8": "Class VIII",
  "class-9": "Class IX",
  "class-11-premedical": "Class XI (Pre-Medical)",
  "class-11-preengineering": "Class XI (Pre-Engineering)",
  "class-11-ics": "Class XI (ICS)",
};

function formatDate(input: Date | string | null | undefined): string {
  return fmtLocDate(input ?? null);
}

function formatDateTime(input: Date | string | null | undefined): string {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  const date = fmtLocDate(d);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${date}, ${hh}:${mm}`;
}

function classNames(...arr: (string | false | null | undefined)[]) {
  return arr.filter(Boolean).join(" ");
}

export default function StatusTracker() {
  const baseUrl = useSiteBaseUrl();
  const blocks = usePageBlocks("status");
  const { toast } = useToast();
  const [location] = useLocation();
  const [referenceId, setReferenceId] = useState("");
  const [cnicLast4, setCnicLast4] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplicationDetail | null>(null);
  const lookupMutation = useLookupApplication();
  const autoTriedRef = useRef(false);

  // Read ?ref=XXX from URL for prefill (from admission success screen).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && !referenceId) {
      setReferenceId(ref.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  async function submitLookup(e?: React.FormEvent) {
    e?.preventDefault();
    setFormError(null);
    const ref = referenceId.trim().toUpperCase();
    const last4 = cnicLast4.replace(/\D/g, "").slice(-4);
    if (!ref) {
      setFormError("Please enter your Applicant ID.");
      return;
    }
    if (last4.length !== 4) {
      setFormError("Please enter the last 4 digits of the parent's CNIC.");
      return;
    }
    try {
      const data = await lookupMutation.mutateAsync({
        data: { referenceId: ref, cnicLast4: last4 },
      });
      setResult(data);
      // Trigger confetti if admitted
      if (data.status === "admitted") {
        void launchConfetti();
      }
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 404
          ? "No application matches that Applicant ID and CNIC."
          : "Could not look up your application. Please try again.";
      setFormError(message);
      setResult(null);
      toast({ title: "Lookup failed", description: message, variant: "destructive" });
    }
  }

  function resetLookup() {
    setResult(null);
    setReferenceId("");
    setCnicLast4("");
    setFormError(null);
  }

  function fillDemo() {
    setReferenceId("CCM-2026-DEMO01");
    setCnicLast4("1234");
    setFormError(null);
  }

  // Mark auto-try as resolved on mount — we intentionally do not auto-submit
  // with credentials from URL params (would leak CNIC to history/referrer).
  useEffect(() => {
    autoTriedRef.current = true;
  }, []);

  return (
    <>
      <Helmet>
        <title>Application Status Tracker | Cadet College Murree</title>
        <meta
          name="description"
          content="Track your Cadet College Murree admission application status by Applicant ID. See verification, test schedule, result and admission decision in real time."
        />
        <link rel="canonical" href={`${baseUrl}/status`} />
      </Helmet>

      <PageHero title={<EditableText page="status" blockKey="hero_title" value={blocks.hero_title || "Application Status Tracker"} />} breadcrumb="Application Status" />

      <section className="py-12 md:py-16 px-4 max-w-7xl mx-auto" data-testid="status-page">
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div
              key="lookup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <LookupForm
                referenceId={referenceId}
                cnicLast4={cnicLast4}
                onReferenceChange={(v) => setReferenceId(v.toUpperCase())}
                onCnicChange={(v) => setCnicLast4(v.replace(/\D/g, "").slice(0, 4))}
                onSubmit={submitLookup}
                onFillDemo={fillDemo}
                error={formError}
                loading={lookupMutation.isPending}
              />
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="space-y-8"
            >
              <ResultHeader application={result} onReset={resetLookup} />
              <TimelinePanel application={result} />
              <SummaryPanel application={result} />
              <ActionsRow application={result} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </>
  );
}

// ───────────────────────── Lookup form ─────────────────────────

function LookupForm({
  referenceId,
  cnicLast4,
  onReferenceChange,
  onCnicChange,
  onSubmit,
  onFillDemo,
  error,
  loading,
}: {
  referenceId: string;
  cnicLast4: string;
  onReferenceChange: (v: string) => void;
  onCnicChange: (v: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onFillDemo: () => void;
  error: string | null;
  loading: boolean;
}) {
  const blocks = usePageBlocks("status");
  return (
    <div className="grid lg:grid-cols-5 gap-8 items-start">
      {/* Form card */}
      <form
        onSubmit={onSubmit}
        className="lg:col-span-3 bg-card border border-border rounded-3xl p-8 md:p-10 shadow-sm"
        data-testid="status-lookup-form"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-4">
          <Search className="w-3.5 h-3.5" /> Track Your Application
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-primary mb-2"><EditableText as="span" page="status" blockKey="check_heading" value={blocks.check_heading || "Check your admission status"} /></h2>
        <p className="text-foreground/75 mb-8">
          <EditableText as="span" multiline page="status" blockKey="check_subheading" value={blocks.check_subheading || "Enter your Applicant ID (from the confirmation email/SMS) and the last 4 digits of the parent's CNIC."} />
        </p>

        <div className="space-y-5">
          <div>
            <label className="text-sm font-semibold text-foreground/85 mb-1.5 block"><EditableText as="span" page="status" blockKey="label_reference_id" value={blocks.label_reference_id || "Applicant ID *"} /></label>
            <Input
              value={referenceId}
              onChange={(e) => onReferenceChange(e.target.value)}
              placeholder="CCM-2026-XXXXXX"
              autoComplete="off"
              spellCheck={false}
              className="font-mono tracking-wider h-12 text-base"
              data-testid="input-reference-id"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground/85 mb-1.5 block"><EditableText as="span" page="status" blockKey="label_cnic" value={blocks.label_cnic || "Last 4 digits of Parent CNIC *"} /></label>
            <Input
              value={cnicLast4}
              onChange={(e) => onCnicChange(e.target.value)}
              placeholder="1234"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              className="font-mono tracking-[0.4em] h-12 text-base"
              data-testid="input-cnic-last4"
            />
            <p className="text-xs text-foreground/55 mt-1.5">
              <EditableText as="span" multiline page="status" blockKey="cnic_hint" value={blocks.cnic_hint || "Only the last 4 digits — we use this to verify your identity."} />
            </p>
          </div>

          {error && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive"
              role="alert"
              data-testid="lookup-error"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              type="submit"
              size="lg"
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground gap-2 h-12 text-base font-semibold"
              disabled={loading}
              data-testid="button-check-status"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking…
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" /> <EditableText as="span" page="status" blockKey="btn_check_status" value={blocks.btn_check_status || "Check Status"} />
                </>
              )}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={onFillDemo}
              className="border-dashed border-2 gap-2 h-12 font-semibold"
              data-testid="button-fill-demo"
            >
              <Sparkles className="w-4 h-4 text-accent" /> <EditableText as="span" page="status" blockKey="btn_try_demo" value={blocks.btn_try_demo || "Try demo"} />
            </Button>
          </div>
        </div>
      </form>

      {/* Side info card */}
      <aside className="lg:col-span-2 space-y-4">
        <div className="bg-gradient-to-br from-primary to-[#042c0e] text-white rounded-3xl p-6 shadow-lg">
          <div className="w-11 h-11 rounded-xl bg-accent/30 backdrop-blur flex items-center justify-center mb-4">
            <ShieldCheck className="w-5 h-5 text-accent" />
          </div>
          <h3 className="font-bold text-lg mb-2"><EditableText as="span" page="status" blockKey="why_fields_heading" value={blocks.why_fields_heading || "Why both fields?"} /></h3>
          <p className="text-white/80 text-sm leading-relaxed">
            <EditableText as="span" multiline page="status" blockKey="why_fields_body" value={blocks.why_fields_body || "Your Applicant ID alone is enough to look up your application — but pairing it with the parent CNIC's last 4 digits keeps personal information secure and prevents anyone else from peeking at your status."} />
          </p>
        </div>

        <div className="bg-card border border-border rounded-3xl p-6">
          <h3 className="font-bold text-primary mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent" /> <EditableText as="span" page="status" blockKey="see_heading" value={blocks.see_heading || "What you'll see"} />
          </h3>
          <ul className="space-y-2 text-sm text-foreground/80">
            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" /> <EditableText as="span" multiline page="status" blockKey="see_item_0" value={blocks.see_item_0 || "Live stage in a 6-step admission journey"} /></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" /> <EditableText as="span" multiline page="status" blockKey="see_item_1" value={blocks.see_item_1 || "Entry test date, roll number and exam centre"} /></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" /> <EditableText as="span" multiline page="status" blockKey="see_item_2" value={blocks.see_item_2 || "Printable admit card when test is scheduled"} /></li>
            <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" /> <EditableText as="span" multiline page="status" blockKey="see_item_3" value={blocks.see_item_3 || "Final result and merit position"} /></li>
          </ul>
        </div>

        <div className="bg-accent/10 border border-accent/20 rounded-2xl p-5 text-sm text-foreground/80">
          <p className="font-semibold text-primary mb-1"><EditableText as="span" page="status" blockKey="lost_id_heading" value={blocks.lost_id_heading || "Lost your Applicant ID?"} /></p>
          <p>
            <EditableText as="span" multiline page="status" blockKey="lost_id_body_before" value={blocks.lost_id_body_before || "Call the admissions office at"} /> <a href="tel:03041111024" className="font-bold text-primary hover:text-accent">0304-1111024</a> <EditableText as="span" multiline page="status" blockKey="lost_id_body_after" value={blocks.lost_id_body_after || "with the student's full name and date of birth."} />
          </p>
        </div>
      </aside>
    </div>
  );
}

// ───────────────────────── Payment badge ─────────────────────────

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bank_deposit: "Bank Deposit",
  jazzcash: "JazzCash",
  payfast: "PayFast",
  simulate: "Online Payment",
  free: "Free",
};

function PaymentBadge({ feeStatus, paymentMethod }: { feeStatus?: string | null; paymentMethod?: string | null }) {
  if (!feeStatus || feeStatus === "pending") return null;

  const methodLabel = paymentMethod ? (PAYMENT_METHOD_LABEL[paymentMethod] ?? paymentMethod) : null;

  if (feeStatus === "paid") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200"
        data-testid="payment-badge"
      >
        <BadgeCheck className="w-3.5 h-3.5" />
        Payment: Paid{methodLabel ? ` · ${methodLabel}` : ""}
      </span>
    );
  }

  if (feeStatus === "bank_pending") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold bg-amber-50 text-amber-700 border-amber-200"
        data-testid="payment-badge"
      >
        <Banknote className="w-3.5 h-3.5" />
        Payment: Bank Pending
      </span>
    );
  }

  if (feeStatus === "free") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold bg-slate-100 text-slate-600 border-slate-200"
        data-testid="payment-badge"
      >
        <CreditCard className="w-3.5 h-3.5" />
        Payment: Free
      </span>
    );
  }

  return null;
}

// ───────────────────────── Result header ─────────────────────────

function ResultHeader({ application, onReset }: { application: ApplicationDetail; onReset: () => void }) {
  const tone = STATUS_TONE[application.status] ?? STATUS_TONE.received;
  const stageIdx = STATUS_TO_STAGE_INDEX[application.status] ?? 0;
  const progress = Math.round(((stageIdx + 1) / STAGES.length) * 100);
  const statusLabel = STATUS_LABEL[application.status] ?? application.status;
  const fullName = application.fullName ?? "";
  const classLabel = CLASS_LABEL[application.classApplying] ?? application.classApplying;

  const { toast } = useToast();
  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(application.referenceId);
      toast({ title: "Copied", description: "Applicant ID copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card to-muted/30 p-6 md:p-8 shadow-sm">
      <div className={classNames("absolute -top-32 -right-32 w-80 h-80 rounded-full blur-3xl bg-gradient-to-br pointer-events-none", tone.glow, "to-transparent")} />

      <div className="relative flex flex-col md:flex-row md:items-start gap-5 md:gap-8">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge className={classNames("border font-semibold gap-1.5", tone.chip)} data-testid="status-badge">
              <span className="relative flex w-2 h-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-40" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
              </span>
              {statusLabel}
            </Badge>
            <PaymentBadge feeStatus={application.feeStatus} paymentMethod={application.paymentMethod} />
            <span className="text-xs text-foreground/60">Submitted {formatDate(application.createdAt)}</span>
          </div>
          {application.feeStatus === "bank_pending" && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800" data-testid="bank-pending-notice">
              <Banknote className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
              <span>Your bank deposit is being verified — typically within 1–2 business days.</span>
            </div>
          )}

          <h2 className="text-2xl md:text-3xl font-bold text-primary">{fullName}</h2>
          <p className="text-foreground/75 mt-1">
            Applying for <span className="font-semibold text-foreground">{classLabel}</span> · Session {application.session}
          </p>

          <div className="mt-4 inline-flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2">
            <Hash className="w-4 h-4 text-accent" />
            <span className="font-mono text-sm font-bold tracking-wider" data-testid="result-reference-id">
              {application.referenceId}
            </span>
            <button
              type="button"
              onClick={copyRef}
              className="ml-1 text-foreground/60 hover:text-primary transition-colors"
              aria-label="Copy Applicant ID"
              data-testid="copy-ref-button"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="md:w-72 lg:w-80 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-foreground/65">Progress</span>
            <span className="text-xs font-bold text-primary">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary via-secondary to-accent"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="mt-4 text-foreground/70 hover:text-primary gap-1.5"
            data-testid="button-check-another"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Check another application
          </Button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Timeline ─────────────────────────

function TimelinePanel({ application }: { application: ApplicationDetail }) {
  const currentIdx = STATUS_TO_STAGE_INDEX[application.status] ?? 0;
  const isRejected = application.status === "rejected";

  // Map events to stage indices for date lookup.
  const eventByStage = useMemo(() => {
    const map = new Map<number, ApplicationEvent>();
    for (const ev of application.events) {
      const idx = STATUS_TO_STAGE_INDEX[ev.eventType];
      if (idx !== undefined) {
        const existing = map.get(idx);
        if (!existing || new Date(ev.occurredAt).getTime() > new Date(existing.occurredAt).getTime()) {
          map.set(idx, ev);
        }
      }
    }
    return map;
  }, [application.events]);

  return (
    <div className="bg-card border border-border rounded-3xl p-6 md:p-10 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-8 flex-wrap">
        <h3 className="text-xl md:text-2xl font-bold text-primary">Admission Journey</h3>
        <span className="text-xs uppercase tracking-wider text-foreground/60 font-semibold">
          Stage {Math.min(currentIdx + 1, STAGES.length)} of {STAGES.length}
        </span>
      </div>

      <ol className="relative">
        {STAGES.map((stage, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isFinal = idx === STAGES.length - 1 && (application.status === "admitted" || application.status === "rejected");
          const Icon = stage.Icon;
          const event = eventByStage.get(idx);
          const dateLabel = event ? formatDateTime(event.occurredAt) : null;
          const failedFinal = isFinal && isRejected;
          const successFinal = isFinal && application.status === "admitted";

          return (
            <motion.li
              key={stage.key}
              className="relative pl-14 md:pl-16 pb-8 last:pb-0"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * idx, duration: 0.4 }}
              data-testid={`timeline-stage-${idx}`}
            >
              {/* Connector line */}
              {idx !== STAGES.length - 1 && (
                <span
                  className={classNames(
                    "absolute left-[19px] md:left-[23px] top-10 bottom-0 w-[2px] rounded",
                    isDone || isCurrent ? "bg-gradient-to-b from-accent to-accent/30" : "bg-border",
                  )}
                  aria-hidden="true"
                />
              )}

              {/* Icon bubble */}
              <span
                className={classNames(
                  "absolute left-0 top-0 w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center shadow-sm transition-all",
                  isDone && "bg-accent text-accent-foreground",
                  isCurrent && !failedFinal && !successFinal && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  isCurrent && successFinal && "bg-emerald-500 text-white ring-4 ring-emerald-200",
                  isCurrent && failedFinal && "bg-rose-500 text-white ring-4 ring-rose-200",
                  !isDone && !isCurrent && "bg-muted text-foreground/40 border border-border",
                )}
              >
                {isDone || successFinal ? (
                  <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6" />
                ) : failedFinal ? (
                  <AlertCircle className="w-5 h-5 md:w-6 md:h-6" />
                ) : (
                  <Icon className="w-5 h-5 md:w-6 md:h-6" />
                )}
              </span>

              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h4
                  className={classNames(
                    "font-bold text-base md:text-lg",
                    isCurrent ? "text-primary" : isDone ? "text-foreground" : "text-foreground/55",
                  )}
                >
                  {isFinal
                    ? application.status === "admitted"
                      ? "Qualified — Congratulations!"
                      : application.status === "rejected"
                      ? "Not Selected"
                      : stage.title
                    : stage.title}
                </h4>
                {dateLabel && (
                  <span className="text-xs text-foreground/55 font-medium" data-testid={`timeline-date-${idx}`}>
                    {dateLabel}
                  </span>
                )}
                {isCurrent && (
                  <Badge className="bg-primary/10 text-primary border border-primary/20 text-[10px] uppercase tracking-wider font-bold">
                    Current
                  </Badge>
                )}
              </div>
              <p className={classNames("text-sm mt-1 leading-relaxed", isDone || isCurrent ? "text-foreground/75" : "text-foreground/50")}>
                {event?.description || stage.desc}
              </p>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

// ───────────────────────── Summary ─────────────────────────

function SummaryPanel({ application }: { application: ApplicationDetail }) {
  const classLabel = CLASS_LABEL[application.classApplying] ?? application.classApplying;
  const items: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[] = [
    { icon: User, label: "Candidate", value: application.fullName ?? "" },
    { icon: GraduationCap, label: "Class/Program", value: classLabel },
    { icon: CalendarClock, label: "Session", value: application.session },
    { icon: MapPin, label: "Exam Centre", value: application.examCenter },
    ...(application.rollNumber ? [{ icon: Hash, label: "Roll Number", value: application.rollNumber }] : []),
    ...(application.testDate ? [{ icon: CalendarClock, label: "Test Date", value: formatDateTime(application.testDate) }] : []),
    ...(application.resultMarks !== null && application.resultMarks !== undefined
      ? [{ icon: Trophy, label: "Marks Obtained", value: `${application.resultMarks} / 100` }]
      : []),
  ];

  return (
    <div className="grid md:grid-cols-2 gap-3 bg-card border border-border rounded-3xl p-6 md:p-8">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div key={it.label} className="flex items-start gap-3 p-3 rounded-xl hover:bg-muted/40 transition-colors">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-foreground/55">{it.label}</div>
              <div className="font-semibold text-foreground truncate">{it.value}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────── Actions ─────────────────────────

function ActionsRow({ application }: { application: ApplicationDetail }) {
  const canDownloadAdmit = ["test_scheduled", "test_taken", "result_announced", "admitted"].includes(application.status) && !!application.rollNumber;

  function openAdmitCard() {
    const html = renderAdmitCardHtml(application);
    openPrintWindow(html, { features: "width=820,height=900" });
  }

  function printPage() {
    window.print();
  }

  const whatsappMessage = encodeURIComponent(
    `Hi, I'd like to ask about my admission application. Applicant ID: ${application.referenceId}.`,
  );

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {canDownloadAdmit && (
        <Button
          onClick={openAdmitCard}
          className="h-auto py-4 bg-primary hover:bg-primary/90 text-primary-foreground gap-2 flex-col"
          data-testid="button-admit-card"
        >
          <Download className="w-5 h-5" />
          <span className="font-semibold">Download Admit Card</span>
        </Button>
      )}
      <Button
        onClick={printPage}
        variant="outline"
        className="h-auto py-4 gap-2 flex-col border-2"
        data-testid="button-print-status"
      >
        <Printer className="w-5 h-5 text-primary" />
        <span className="font-semibold">Print Status</span>
      </Button>
      <Button asChild variant="outline" className="h-auto py-4 gap-2 flex-col border-2">
        <a
          href={`https://wa.me/923041111024?text=${whatsappMessage}`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="button-whatsapp-status"
        >
          <MessageCircle className="w-5 h-5 text-[#25D366]" />
          <span className="font-semibold">WhatsApp Office</span>
        </a>
      </Button>
      <Button asChild variant="outline" className="h-auto py-4 gap-2 flex-col border-2">
        <a href="/contact" data-testid="button-contact">
          <ArrowRight className="w-5 h-5 text-primary" />
          <span className="font-semibold">Contact Admissions</span>
        </a>
      </Button>
    </div>
  );
}

// ───────────────────────── Admit card HTML ─────────────────────────

function renderAdmitCardHtml(app: ApplicationDetail): string {
  const classLabel = CLASS_LABEL[app.classApplying] ?? app.classApplying;
  const testDate = app.testDate ? formatDateTime(app.testDate) : "To be announced";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Admit Card — ${escapeHtml(app.referenceId)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #1a1a1a; background: #f6f7f4; }
    .card { max-width: 780px; margin: 0 auto; background: white; border: 1px solid #e3e6df; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(6, 74, 26, .08); }
    .head { background: linear-gradient(135deg, #064A1A, #042c0e); color: white; padding: 28px 32px; display: flex; justify-content: space-between; align-items: center; }
    .head h1 { margin: 0; font-size: 22px; letter-spacing: .5px; }
    .head .tag { font-size: 11px; letter-spacing: .2em; text-transform: uppercase; opacity: .8; }
    .body { padding: 28px 32px; }
    .ref { display: inline-block; padding: 6px 12px; border-radius: 999px; background: #03CC0B22; color: #064A1A; font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 24px; margin-top: 18px; }
    .cell .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .15em; color: #6b7170; font-weight: 700; }
    .cell .val { font-size: 15px; font-weight: 700; color: #1a1a1a; margin-top: 2px; }
    .test { margin-top: 22px; padding: 16px 18px; border: 1px dashed #064A1A55; background: #064A1A0a; border-radius: 12px; }
    .test .h { font-size: 11px; font-weight: 800; color: #064A1A; letter-spacing: .15em; text-transform: uppercase; }
    .test .v { font-size: 18px; font-weight: 800; color: #064A1A; margin-top: 4px; }
    .rules { margin-top: 22px; font-size: 12px; color: #4a504a; line-height: 1.6; }
    .rules h4 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .15em; color: #064A1A; }
    .sig { margin-top: 28px; display: flex; justify-content: space-between; gap: 24px; }
    .sig div { flex: 1; border-top: 1px solid #c3c8c1; padding-top: 6px; font-size: 11px; color: #4a504a; text-transform: uppercase; letter-spacing: .12em; text-align: center; }
    .foot { padding: 14px 32px; background: #f1f3ec; font-size: 11px; color: #4a504a; text-align: center; }
    .btn { display: inline-block; margin-top: 18px; padding: 10px 18px; background: #064A1A; color: white; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 13px; }
    @media print { body { background: white; padding: 0; } .card { box-shadow: none; border: none; } .btn { display: none; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div>
        <div class="tag">Cadet College Murree</div>
        <h1>Entry Test Admit Card</h1>
      </div>
      <span class="ref">${escapeHtml(app.referenceId)}</span>
    </div>
    <div class="body">
      <div class="grid">
        <div class="cell"><div class="lbl">Candidate Name</div><div class="val">${escapeHtml(app.fullName ?? "")}</div></div>
        <div class="cell"><div class="lbl">Date of Birth</div><div class="val">${escapeHtml(formatDate(app.dateOfBirth))}</div></div>
        <div class="cell"><div class="lbl">Class/Program Applied</div><div class="val">${escapeHtml(classLabel)}</div></div>
        <div class="cell"><div class="lbl">Session</div><div class="val">${escapeHtml(app.session)}</div></div>
        <div class="cell"><div class="lbl">Roll Number</div><div class="val">${escapeHtml(app.rollNumber ?? "—")}</div></div>
        <div class="cell"><div class="lbl">Exam Centre</div><div class="val">${escapeHtml(app.examCenter)}</div></div>
      </div>
      <div class="test">
        <div class="h">Test Date &amp; Time</div>
        <div class="v">${escapeHtml(testDate)}</div>
        <div style="font-size:12px; color:#4a504a; margin-top:4px;">Reporting time: 30 minutes before the test.</div>
      </div>
      <div class="rules">
        <h4>Instructions</h4>
        <ul style="margin:0; padding-left:18px;">
          <li>Bring a printed copy of this admit card and a valid ID (B-Form / passport).</li>
          <li>Carry two pencils, an eraser, a sharpener and a blue ballpoint pen.</li>
          <li>Mobile phones, smart watches and electronic devices are not allowed.</li>
          <li>Candidates arriving late will not be allowed to sit the test.</li>
        </ul>
      </div>
      <div class="sig">
        <div>Candidate Signature</div>
        <div>Invigilator</div>
        <div>Principal</div>
      </div>
      <a href="#" class="btn" onclick="window.print(); return false;">Print / Save as PDF</a>
    </div>
    <div class="foot">This is a computer-generated admit card. No physical signature is required for verification.</div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ───────────────────────── Confetti ─────────────────────────

async function launchConfetti(): Promise<void> {
  if (typeof window === "undefined") return;
  const colors = ["#064A1A", "#198754", "#03CC0B", "#FFD166", "#FFFFFF"];
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:9999";
  document.body.appendChild(container);

  for (let i = 0; i < 120; i += 1) {
    const piece = document.createElement("div");
    const size = 6 + Math.random() * 8;
    piece.style.cssText = `
      position:absolute;
      top:-20px;
      left:${Math.random() * 100}%;
      width:${size}px;
      height:${size * 0.4}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      transform:rotate(${Math.random() * 360}deg);
      opacity:${0.7 + Math.random() * 0.3};
      border-radius:1px;
    `;
    container.appendChild(piece);
    const duration = 2500 + Math.random() * 2500;
    const drift = (Math.random() - 0.5) * 200;
    piece.animate(
      [
        { transform: piece.style.transform, top: "-20px" },
        { transform: `translateX(${drift}px) rotate(${720 + Math.random() * 360}deg)`, top: "110vh" },
      ],
      { duration, easing: "cubic-bezier(.2,.6,.4,1)", fill: "forwards" },
    );
  }

  window.setTimeout(() => container.remove(), 5500);
}
