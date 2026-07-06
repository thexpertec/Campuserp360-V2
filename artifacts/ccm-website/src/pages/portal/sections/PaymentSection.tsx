import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import Confetti from "@/components/Confetti";
import { CheckCircle2, Phone, Upload, FileText, Loader2 } from "lucide-react";
import type { PortalUser } from "../data";
import { portalSubmitFee } from "../api";
import PayOnlineButtons from "./PayOnlineButtons";

export default function PaymentSection({ user, onRefresh }: { user: PortalUser; onRefresh?: () => Promise<void> }) {
  const f = user.fee;
  const { toast } = useToast();
  const [receiptNo, setReceiptNo] = useState(f.bank_reference ?? "");
  const [paymentDate, setPaymentDate] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string>("");
  const [errors, setErrors] = useState<{ receipt?: string; file?: string }>({});
  const [confetti, setConfetti] = useState(0);
  const [loading, setLoading] = useState(false);

  function handleFile(file: File | null) {
    setProofFile(file);
    setProofPreview("");
    if (file && file.type.startsWith("image/")) {
      const r = new FileReader();
      r.onload = (e) => setProofPreview(String(e.target?.result ?? ""));
      r.readAsDataURL(file);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!receiptNo.trim()) errs.receipt = "Please enter the bank receipt / transaction number.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await portalSubmitFee(receiptNo.trim(), paymentDate, proofFile ?? undefined);
      toast({
        title: "🎉 Payment proof submitted!",
        description: "The admissions office will verify within 1 working day.",
      });
      setConfetti((c) => c + 1);
      await onRefresh?.();
    } catch (err) {
      toast({
        title: "Submission failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  if (f.status === "paid") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-5"
      >
        <div>
          <h1 className="text-3xl font-bold text-primary">💳 Payment Confirmation</h1>
          <p className="text-sm text-foreground/60 mt-1">
            Upload your bank payment receipt to confirm fee submission.
          </p>
        </div>

        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span>Your fee payment has already been confirmed and verified by the admissions office.</span>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-border">
                <td className="px-4 py-2.5 bg-muted/40 font-semibold w-1/3">Challan No.</td>
                <td className="px-4 py-2.5">{f.challan_no}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-2.5 bg-muted/40 font-semibold">Amount Paid</td>
                <td className="px-4 py-2.5">PKR {f.amount.toLocaleString()}</td>
              </tr>
              {f.bank_reference && (
                <tr className="border-b border-border">
                  <td className="px-4 py-2.5 bg-muted/40 font-semibold">Bank Reference</td>
                  <td className="px-4 py-2.5 font-mono text-sm">{f.bank_reference}</td>
                </tr>
              )}
              <tr>
                <td className="px-4 py-2.5 bg-muted/40 font-semibold">Status</td>
                <td className="px-4 py-2.5 font-bold text-emerald-700">✅ Verified</td>
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>
    );
  }

  // If bank reference already submitted (pending confirmation)
  if (f.bank_reference && f.status === "pending") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-5"
      >
        <div>
          <h1 className="text-3xl font-bold text-primary">💳 Payment Confirmation</h1>
        </div>
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Payment reference submitted — pending verification</p>
            <p className="text-sm mt-0.5">Reference: <span className="font-mono">{f.bank_reference}</span></p>
            <p className="text-sm mt-0.5">The admissions office will confirm within 1 working day.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground/70">Update bank reference if needed:</h3>
          <div className="space-y-1.5">
            <Label htmlFor="receipt">Bank Receipt / Transaction Number</Label>
            <Input id="receipt" value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="e.g. TXN-20260428-001234" />
            {errors.receipt && <p className="text-xs text-rose-600">{errors.receipt}</p>}
          </div>
          <Button type="submit" variant="outline" className="border-primary text-primary" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Update Reference
          </Button>
        </form>
      </motion.div>
    );
  }

  return (
    <>
      <Confetti trigger={confetti} count={120} />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-5"
      >
        <div>
          <h1 className="text-3xl font-bold text-primary">💳 Payment Confirmation</h1>
          <p className="text-sm text-foreground/60 mt-1">
            Upload your bank payment receipt to confirm fee submission.
          </p>
        </div>

        {(user.payment_methods?.enable_jazzcash !== false || user.payment_methods?.enable_payfast !== false) && (
          <PayOnlineButtons
            feeType="application"
            amount={f.amount}
            enableJazzcash={user.payment_methods?.enable_jazzcash !== false}
            enablePayfast={user.payment_methods?.enable_payfast !== false}
          />
        )}

        {user.payment_methods?.enable_bank_deposit !== false && (user.payment_methods?.enable_jazzcash !== false || user.payment_methods?.enable_payfast !== false) && (
          <div className="relative">
            <div className="h-px bg-border" />
            <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-background px-2 text-xs text-foreground/50">
              or pay at the bank and upload proof
            </span>
          </div>
        )}

        {user.payment_methods?.enable_bank_deposit !== false && <form
          onSubmit={handleSubmit}
          className="bg-card border border-border rounded-xl p-5 space-y-4"
          data-testid="payment-form"
        >
          <h3 className="text-lg font-bold">Upload Payment Proof</h3>

          <div className="space-y-1.5">
            <Label htmlFor="receipt">Bank Receipt / Transaction Number</Label>
            <Input
              id="receipt"
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value)}
              placeholder="e.g. TXN-20260428-001234"
              disabled={loading}
            />
            {errors.receipt && <p className="text-xs text-rose-600">{errors.receipt}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pdate">Payment Date</Label>
            <Input
              id="pdate"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Upload Receipt (JPG, PNG or PDF — optional but recommended)</Label>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-primary/40 text-sm text-primary cursor-pointer hover:bg-primary/5 transition-colors w-full justify-center">
              <Upload className="w-4 h-4" />
              <span>{proofFile ? "Replace file" : "Choose file"}</span>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {proofPreview && (
              <img src={proofPreview} alt="Receipt preview" className="mt-2 max-w-xs rounded-lg border border-border" />
            )}
            {proofFile && !proofPreview && (
              <div className="flex items-center gap-2 mt-2 text-sm text-foreground/70">
                <FileText className="w-4 h-4" />
                File selected: {proofFile.name}
              </div>
            )}
            {errors.file && <p className="text-xs text-rose-600">{errors.file}</p>}
          </div>

          <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Submit Payment Proof
          </Button>
        </form>}

        <div className="h-px bg-border" />

        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm">
          <Phone className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Payment issues? Call <strong>0304-1111024</strong> or WhatsApp during office hours (Mon–Sat, 9am–5pm).
          </span>
        </div>
      </motion.div>
    </>
  );
}
