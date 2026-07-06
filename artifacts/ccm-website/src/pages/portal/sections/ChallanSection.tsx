import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Printer, Mail } from "lucide-react";
import type { PortalUser } from "../data";
import StatusBadge from "../components/StatusBadge";
import { challanHtml } from "../printable/challanHtml";
import { printHtml } from "../printable/offerLetterHtml";

export default function ChallanSection({ user }: { user: PortalUser }) {
  const f = user.fee;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      <div>
        <h1 className="text-3xl font-bold text-primary">🏦 Fee Challan</h1>
        <p className="text-sm text-foreground/60 mt-1">
          Entry test application processing fee. Pay at any {f.bank} branch or via internet banking.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Payment Status:</span>
        {f.status === "paid" ? (
          <StatusBadge variant="paid">✅ PAID</StatusBadge>
        ) : (
          <StatusBadge variant="not">⚠️ UNPAID</StatusBadge>
        )}
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
        {/* Challan card */}
        <div className="border-2 border-gray-800 rounded-md font-mono bg-white overflow-hidden">
          <div className="bg-primary text-primary-foreground px-5 py-3 text-center">
            <strong className="text-base">🏛️ CADET COLLEGE MURREE</strong>
            <div className="text-xs opacity-85">Fee Challan — Entry Test Application 2026-27</div>
          </div>
          <div className="px-5 py-4 space-y-1 text-sm">
            {(
              [
                ["Challan No.", f.challan_no],
                ["Applicant", user.name],
                ["Father's Name", user.father_name],
                ["Class/Program", user.class_applying],
                ["Applicant ID", user.ref_id],
                ["Bank", f.bank + (f.bank_branch ? ` — ${f.bank_branch}` : "")],
                f.account_title ? ["Account Title", f.account_title] : null,
                ["Account No.", f.account],
              ] as ([string, string] | null)[]
            ).filter((row): row is [string, string] => row !== null).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-dotted border-gray-300 py-1">
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
            <div className="flex justify-between border-b border-dotted border-gray-300 py-1">
              <span>Due Date</span>
              <strong className="text-rose-600">{f.due_date}</strong>
            </div>
            <div className="text-center bg-emerald-50 border border-primary text-primary rounded p-3 mt-3 font-black text-xl">
              PKR {f.amount.toLocaleString()} /-
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-3">
          <h3 className="font-bold">📌 Payment Instructions</h3>
          <ol className="space-y-1.5 text-sm list-decimal list-inside text-foreground/80">
            <li>Visit any <strong>{f.bank}</strong> branch</li>
            <li>Present this challan to the cashier</li>
            <li>Pay <strong>PKR {f.amount.toLocaleString()}</strong> in cash or via debit card</li>
            <li>Collect the stamped bank copy</li>
            <li>Upload payment proof on the <strong>Payment Confirmation</strong> page</li>
            <li>Keep the original challan for college records</li>
          </ol>
          {f.challan_instructions && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
              {f.challan_instructions}
            </div>
          )}
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm">
            <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>A copy has been sent to your registered email address.</span>
          </div>
        </div>
      </div>

      <div className="h-px bg-border" />

      <Button
        onClick={() => printHtml(challanHtml(user))}
        className="bg-primary hover:bg-primary/90"
        data-testid="download-challan"
      >
        <Printer className="w-4 h-4 mr-1.5" /> Print / Save as PDF
      </Button>
    </motion.div>
  );
}
