import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Clock, AlertCircle, CheckCircle2, Printer, Loader2, PartyPopper, FileClock } from "lucide-react";
import type { PortalUser } from "../data";
import { printHtml } from "../printable/offerLetterHtml";
import { portalAcceptOffer } from "../api";
import { fetchActiveTemplateByPurpose, buildTemplateHtml, type ActiveTemplate } from "../api";
import { useToast } from "@/hooks/use-toast";
import { formatDateLong } from "@/lib/locale";

export default function OfferLetterSection({ user, onRefresh }: { user: PortalUser; onRefresh?: () => Promise<void> }) {
  const { toast } = useToast();
  const [accepting, setAccepting] = useState(false);
  const [customTemplate, setCustomTemplate] = useState<ActiveTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoadingTemplate(true);
    fetchActiveTemplateByPurpose("offer-letter-applicants")
      .then(tpl => { if (alive) setCustomTemplate(tpl); })
      .finally(() => { if (alive) setLoadingTemplate(false); });
    return () => { alive = false; };
  }, []);

  async function handleAccept() {
    if (!confirm("Are you sure you want to accept the offer of admission? This action cannot be undone.")) return;
    setAccepting(true);
    try {
      await portalAcceptOffer();
      toast({ title: "🎉 Offer accepted!", description: "Congratulations! The admissions office has been notified. Admission fee details will follow." });
      await onRefresh?.();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to accept offer.", variant: "destructive" });
    } finally {
      setAccepting(false);
    }
  }

  if (user.result_status !== "selected") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-4"
      >
        <h1 className="text-3xl font-bold text-primary">📜 Offer Letter</h1>
        {user.result_status === null ? (
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
            <Clock className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>⏳ Offer letter will be available after the result is announced and you are selected.</span>
          </div>
        ) : (
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>The offer letter is only available for selected candidates.</span>
          </div>
        )}
      </motion.div>
    );
  }

  const upperName   = user.name.toUpperCase();
  const upperFather = user.father_name.toUpperCase();
  const upperCenter = (user.exam_center || "").toUpperCase();
  const classLabel  = user.class_applying.replace(/^Class\s+/i, "");

  function templateValues(): Record<string, string> {
    const issueDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    return {
      student_name:      upperName,
      father_name:       upperFather,
      applicant_id:         "",
      class:             classLabel,
      section:           "",
      session:           user.session ?? "",
      reporting_date:    user.joining_date ?? "",
      hostel_block:      "",
      fee_amount:        user.admission_fee?.amount ? user.admission_fee.amount.toLocaleString() : "",
      issue_date:        issueDate,
      exam_date:         user.test_date ? formatDateLong(user.test_date) : "",
      test_center_name:  upperCenter,
      test_city:         upperCenter,
    };
  }

  function handlePrint() {
    if (!customTemplate) return;
    printHtml(buildTemplateHtml(customTemplate, templateValues()));
  }

  const previewHtml = customTemplate ? buildTemplateHtml(customTemplate, templateValues()) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      <h1 className="text-3xl font-bold text-primary">📜 Offer Letter</h1>

      {user.candidate_accepted ? (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
          <PartyPopper className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">🎉 Offer accepted — congratulations!</p>
            <p className="text-sm mt-0.5">The admissions office has been notified. Please pay the admission fee and submit the required documents by the deadline.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span>You have been issued a provisional offer letter. Review it below and confirm your acceptance.</span>
        </div>
      )}

      {loadingTemplate ? (
        <div className="flex items-center justify-center gap-2 px-4 py-12 rounded-2xl border border-border bg-white text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading your offer letter…</span>
        </div>
      ) : previewHtml ? (
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <iframe
            title="Offer Letter Preview"
            srcDoc={previewHtml}
            className="w-full"
            style={{ height: "1123px", border: "none" }}
            data-testid="offer-letter-preview"
          />
        </div>
      ) : (
        <div
          className="flex flex-col items-center gap-2 px-4 py-12 rounded-2xl border border-dashed border-border bg-muted/20 text-center"
          data-testid="offer-letter-unavailable"
        >
          <FileClock className="w-8 h-8 text-muted-foreground" />
          <p className="font-semibold text-foreground">Offer letter not available yet</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Your offer letter has not been published by the admissions office yet. Please check back soon.
          </p>
        </div>
      )}

      <div className="h-px bg-border" />

      <div className="flex flex-wrap gap-3">
        {previewHtml && (
          <Button
            onClick={handlePrint}
            variant="outline"
            className="border-primary text-primary"
            data-testid="download-offer"
          >
            <Printer className="w-4 h-4 mr-1.5" /> Print / Save as PDF
          </Button>
        )}

        {!user.candidate_accepted && (
          <Button
            onClick={handleAccept}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={accepting}
            data-testid="accept-offer"
          >
            {accepting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
            {accepting ? "Confirming…" : "✅ Accept Offer of Admission"}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
