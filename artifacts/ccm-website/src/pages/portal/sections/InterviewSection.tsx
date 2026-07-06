import { motion } from "framer-motion";
import { Clock, MapPin, Calendar, CheckCircle2, AlertCircle } from "lucide-react";
import type { PortalUser } from "../data";
import { formatDateLong } from "@/lib/locale";

function fmt(iso: string | null | undefined): string {
  return formatDateLong(iso ?? null);
}

export default function InterviewSection({ user }: { user: PortalUser }) {
  const hasInterview =
    user.status === "interview_scheduled" ||
    user.status === "interview_taken" ||
    user.status === "admitted";

  if (!hasInterview || !user.interview_date) {
    const pending =
      user.status === "received" ||
      user.status === "verified" ||
      user.status === "test_scheduled" ||
      user.status === "test_taken";

    const notSelected = user.result_status === "not_selected";
    const waitListed = user.result_status === "wait_listed";

    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-4"
      >
        <h1 className="text-3xl font-bold text-primary">🎙️ Interview</h1>
        {pending && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
            <Clock className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>⏳ Interview details will be shared after your entry test result is announced and you are shortlisted.</span>
          </div>
        )}
        {notSelected && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>You were not shortlisted for the interview based on the entry test merit list.</span>
          </div>
        )}
        {waitListed && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
            <Clock className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>You are on the waitlist. Interview details will be shared if a vacancy arises.</span>
          </div>
        )}
        {!pending && !notSelected && !waitListed && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
            <Clock className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>Interview details will be communicated by the admissions office.</span>
          </div>
        )}
      </motion.div>
    );
  }

  const isDone = user.status === "interview_taken" || user.status === "admitted";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      <h1 className="text-3xl font-bold text-primary">🎙️ Interview</h1>

      {isDone ? (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span>✅ Interview completed. The final decision will be communicated shortly.</span>
        </div>
      ) : (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
          <Calendar className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span>Your interview has been scheduled. Please report at least 30 minutes before the scheduled time.</span>
        </div>
      )}

      {/* Interview details card */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="bg-primary/5 border-b border-border px-4 py-2.5">
          <h3 className="font-bold text-primary">Interview Details</h3>
        </div>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border">
              <td className="px-4 py-2.5 bg-muted/40 font-semibold w-2/5 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Date
              </td>
              <td className="px-4 py-2.5">{fmt(user.interview_date)}</td>
            </tr>
            {user.interview_time && (
              <tr className="border-b border-border">
                <td className="px-4 py-2.5 bg-muted/40 font-semibold">
                  <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> Time</span>
                </td>
                <td className="px-4 py-2.5">{user.interview_time}</td>
              </tr>
            )}
            {user.interview_venue && (
              <tr className="border-b border-border">
                <td className="px-4 py-2.5 bg-muted/40 font-semibold">
                  <span className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Venue</span>
                </td>
                <td className="px-4 py-2.5">{user.interview_venue}</td>
              </tr>
            )}
            {user.interview_marks !== null && user.interview_marks !== undefined && (
              <tr>
                <td className="px-4 py-2.5 bg-muted/40 font-semibold">Marks Obtained</td>
                <td className="px-4 py-2.5 font-bold">{user.interview_marks} / 30</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* What to bring */}
      {!isDone && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h4 className="font-bold text-amber-900 mb-2">📋 What to Bring</h4>
          <ul className="text-sm text-amber-800 space-y-1 list-disc pl-5">
            <li>This admit card (printed or on phone)</li>
            <li>Original documents + 2 sets of photocopies</li>
            <li>2 recent passport-size photographs (white background)</li>
            <li>Parent/guardian must accompany the candidate</li>
          </ul>
        </div>
      )}
    </motion.div>
  );
}
