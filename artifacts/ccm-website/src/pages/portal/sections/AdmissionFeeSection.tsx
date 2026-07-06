import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";
import type { PortalUser } from "../data";
import { portalSubmitAdmissionFee } from "../api";
import { useToast } from "@/hooks/use-toast";
import PayOnlineButtons from "./PayOnlineButtons";
import { useGetWebsiteAdmissionPaymentConfig } from "@workspace/api-client-react";

export default function AdmissionFeeSection({
  user,
  onRefresh,
}: {
  user: PortalUser;
  onRefresh?: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [bankRef, setBankRef] = useState("");
  const [payDate, setPayDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: payConfig } = useGetWebsiteAdmissionPaymentConfig();
  const bankName    = payConfig?.bankName    ?? "—";
  const bankBranch  = payConfig?.bankBranch  ?? "";
  const accountTitle = payConfig?.accountTitle ?? "—";
  const accountNumber = payConfig?.accountNumber ?? "—";

  const enableBankDeposit = user.payment_methods?.enable_bank_deposit !== false;
  const enableJazzcash    = user.payment_methods?.enable_jazzcash !== false;
  const enablePayfast     = user.payment_methods?.enable_payfast !== false;

  const fee = user.admission_fee;
  const accepted = user.candidate_accepted;

  if (!accepted || user.result_status !== "selected") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-4"
      >
        <h1 className="text-3xl font-bold text-primary">🏦 Admission Fee</h1>
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
          <Clock className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span>⏳ Admission fee challan will be available once you receive and accept your offer letter.</span>
        </div>
      </motion.div>
    );
  }

  const isPaid = fee?.status === "paid";
  const isPending = !isPaid && fee?.bank_reference;
  const amount = fee?.amount ?? 15000;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bankRef.trim()) return;
    setSubmitting(true);
    try {
      await portalSubmitAdmissionFee(bankRef.trim(), payDate);
      toast({
        title: "✅ Reference submitted",
        description: "Your bank reference has been recorded. The admissions office will verify and confirm shortly.",
      });
      await onRefresh?.();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to submit.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      <h1 className="text-3xl font-bold text-primary">🏦 Admission Fee</h1>

      {isPaid && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">✅ Admission fee confirmed!</p>
            <p className="text-sm mt-0.5">Payment of <strong>Rs. {amount.toLocaleString()}/-</strong> has been verified. Proceed to your joining instructions.</p>
            {fee?.bank_reference && (
              <p className="text-xs mt-1 text-emerald-700">Bank Reference: <strong>{fee.bank_reference}</strong></p>
            )}
          </div>
        </div>
      )}

      {isPending && !isPaid && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          <Clock className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">⏳ Awaiting verification</p>
            <p className="text-sm mt-0.5">Reference <strong>{fee?.bank_reference}</strong> submitted. The admissions office will confirm within 1–2 working days.</p>
          </div>
        </div>
      )}

      {user.fee_deadline && !isPaid && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span>⚠️ Deadline: Pay and submit your reference by <strong>{user.fee_deadline}</strong> to secure your seat.</span>
        </div>
      )}

      {/* Challan card */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="bg-primary/5 border-b border-border px-4 py-3">
          <h3 className="font-bold text-primary">Admission Fee Challan</h3>
          <p className="text-xs text-foreground/60 mt-0.5">Deposit via cash or online transfer to the following account</p>
        </div>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border">
              <td className="px-4 py-2.5 bg-muted/40 font-semibold w-2/5">Amount</td>
              <td className="px-4 py-2.5 font-bold text-primary text-base">Rs. {amount.toLocaleString()}/-</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-4 py-2.5 bg-muted/40 font-semibold">Bank</td>
              <td className="px-4 py-2.5">{bankName}{bankBranch ? ` — ${bankBranch}` : ""}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-4 py-2.5 bg-muted/40 font-semibold">Account Title</td>
              <td className="px-4 py-2.5">{accountTitle}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-4 py-2.5 bg-muted/40 font-semibold">Account Number</td>
              <td className="px-4 py-2.5 font-mono font-semibold">{accountNumber}</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 bg-muted/40 font-semibold">Deadline</td>
              <td className="px-4 py-2.5 font-semibold text-rose-700">{user.fee_deadline ?? "As notified"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Instructions */}
      {enableBankDeposit && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 space-y-1.5">
          <p className="font-bold mb-1">📋 Payment Instructions</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Visit any <strong>{bankName}</strong> branch OR use online banking.</li>
            <li>Deposit <strong>Rs. {amount.toLocaleString()}/-</strong> to the account above. Use your <strong>Applicant ID ({user.ref_id})</strong> as the narration/remarks.</li>
            <li>Note the <strong>Transaction Reference Number</strong> from your receipt.</li>
            <li>Submit the reference number in the form below.</li>
          </ol>
        </div>
      )}

      {/* Online payment */}
      {!isPaid && (enableJazzcash || enablePayfast) && (
        <PayOnlineButtons
          feeType="admission"
          amount={amount}
          enableJazzcash={enableJazzcash}
          enablePayfast={enablePayfast}
        />
      )}

      {!isPaid && enableBankDeposit && (enableJazzcash || enablePayfast) && (
        <div className="relative">
          <div className="h-px bg-border" />
          <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-background px-2 text-xs text-foreground/50">
            or pay at the bank and submit the reference
          </span>
        </div>
      )}

      {/* Submission form */}
      {!isPaid && enableBankDeposit && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h4 className="font-bold text-base">Submit Payment Reference</h4>
          <div className="space-y-1.5">
            <Label htmlFor="adm-bank-ref">Bank Transaction Reference Number <span className="text-rose-500">*</span></Label>
            <Input
              id="adm-bank-ref"
              placeholder="e.g. TXN-20260610-012345"
              value={bankRef}
              onChange={(e) => setBankRef(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adm-pay-date">Payment Date</Label>
            <Input
              id="adm-pay-date"
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            disabled={submitting || !bankRef.trim()}
            className="bg-primary hover:bg-primary/90 w-full sm:w-auto"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
            {submitting ? "Submitting…" : isPending ? "Update Reference" : "Submit Payment Reference"}
          </Button>
        </form>
      )}
    </motion.div>
  );
}
