import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Phone } from "lucide-react";
import type { PortalUser } from "../data";
import { STAGES, STATUS_IDX } from "../data";
import { formatDate as fmtDate } from "@/lib/locale";

export default function StatusSection({ user }: { user: PortalUser }) {
  const idx = STATUS_IDX[user.status] ?? 0;
  const progress = Math.round(((idx + 1) / STAGES.length) * 100);

  // Map stage keys to the relevant date from the user object
  const stageDates: Record<string, string> = {
    received:            fmtDate(user.submitted_at),
    verified:            fmtDate(user.verified_at),
    test_scheduled:      fmtDate(user.test_date),
    test_taken:          fmtDate(user.test_date),
    result_announced:    fmtDate(user.result_announced_at),
    interview_scheduled: fmtDate(user.interview_date),
    interview_taken:     fmtDate(user.interview_date),
    decision:            fmtDate(user.offer_date),
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5"
    >
      <div>
        <h1 className="text-3xl font-bold text-primary">📋 Application Status</h1>
        <p className="text-sm text-foreground/60 mt-1">
          Applicant ID: <strong>{user.ref_id}</strong>
          {user.submitted_at && <> · Submitted: {fmtDate(user.submitted_at)}</>}
        </p>
      </div>

      <div>
        <Progress value={progress} className="h-2" />
        <p className="font-semibold mt-2 text-sm">
          Stage {idx + 1} of {STAGES.length} — {progress}% complete
        </p>
      </div>

      <div className="space-y-2">
        {STAGES.map((stage, i) => {
          const isDone = i < idx;
          const isCurrent = i === idx;
          const date = (isDone || isCurrent) ? (stageDates[stage.key] ?? "") : "";

          const baseClass = isDone
            ? "border-l-[#03CC0B] bg-emerald-50/60"
            : isCurrent
              ? "border-l-primary bg-emerald-50 font-semibold"
              : "border-l-gray-300 bg-gray-50 text-gray-500";

          const iconDisp = isDone ? "✅" : isCurrent ? stage.icon : "○";

          return (
            <div
              key={stage.key}
              className={`border-l-4 rounded-r-lg px-4 py-3 ${baseClass}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{iconDisp}</span>
                <div className="flex-1">
                  <strong className={isCurrent ? "text-primary" : ""}>{stage.title}</strong>
                  <div className="text-xs text-foreground/60 mt-0.5 font-normal">{stage.desc}</div>
                </div>
                <div className="text-right">
                  {isDone && (
                    <span className="text-xs text-emerald-700">Completed · {date}</span>
                  )}
                  {isCurrent && (
                    <>
                      <span className="bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                        Current
                      </span>
                      {date && <span className="text-xs text-foreground/60 ml-2">{date}</span>}
                    </>
                  )}
                  {!isDone && !isCurrent && (
                    <span className="text-xs text-gray-400">Pending</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm">
        <Phone className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          For any queries, contact the Admissions Office: <strong>0304-1111024</strong> (Mon–Sat, 9am–5pm)
        </span>
      </div>
    </motion.div>
  );
}
