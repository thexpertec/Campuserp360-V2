import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import Confetti from "@/components/Confetti";
import type { PortalUser } from "../data";

export default function ResultSection({ user }: { user: PortalUser }) {
  const [confetti, setConfetti] = useState(0);

  useEffect(() => {
    if (user.result_status === "selected") {
      setConfetti((c) => c + 1);
    }
  }, [user.result_status]);

  if (user.marks === null || user.marks === undefined) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-4"
      >
        <h1 className="text-3xl font-bold text-primary">🏆 Entry Test Result</h1>
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
          <Clock className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span>⏳ Results have not been announced yet. Check back after your entry test.</span>
        </div>
      </motion.div>
    );
  }

  const marks = user.marks;
  const total = user.total_marks;
  const pct = Math.round((marks / total) * 100);
  const subjects = user.subjects ?? {};

  let banner: React.ReactNode;
  if (user.result_status === "selected") {
    banner = (
      <div className="flex items-start gap-2 px-5 py-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
        <CheckCircle2 className="w-6 h-6 mt-0.5 flex-shrink-0" />
        <div>
          <strong>🎉 SELECTED</strong> — Congratulations! You have been selected for {user.class_applying}, Session{" "}
          {user.session}.
        </div>
      </div>
    );
  } else if (user.result_status === "wait_listed") {
    banner = (
      <div className="flex items-start gap-2 px-5 py-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
        <Clock className="w-6 h-6 mt-0.5 flex-shrink-0" />
        <div>
          <strong>⏳ WAIT LISTED</strong> — You are on the waiting list. You will be contacted if a seat becomes available.
        </div>
      </div>
    );
  } else {
    banner = (
      <div className="flex items-start gap-2 px-5 py-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
        <AlertCircle className="w-6 h-6 mt-0.5 flex-shrink-0" />
        <div>
          <strong>❌ NOT SELECTED</strong> — We regret to inform you that you were not selected in this session.
        </div>
      </div>
    );
  }

  return (
    <>
      <Confetti trigger={confetti} count={140} />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-5"
      >
        <h1 className="text-3xl font-bold text-primary">🏆 Entry Test Result</h1>

        {banner}

        <div className="h-px bg-border" />

        <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6">
          {/* Subject scores */}
          <div>
            <h3 className="text-lg font-bold mb-3">Subject-wise Scores</h3>
            <div className="space-y-2.5">
              {Object.entries(subjects).map(([subject, s]) => {
                const sp = (s.obtained / s.total) * 100;
                return (
                  <div key={subject} className="grid grid-cols-[1.5fr_2.5fr_60px] gap-3 items-center">
                    <p className="text-sm font-semibold m-0">{subject}</p>
                    <Progress value={sp} className="h-2" />
                    <p className="text-sm font-bold text-right m-0">
                      {s.obtained}/{s.total}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Overall score */}
          <div>
            <h3 className="text-lg font-bold mb-3">Overall Score</h3>
            <div className="bg-emerald-50 border-2 border-primary rounded-xl p-6 text-center mb-3">
              <div className="text-5xl font-black text-primary leading-none">{marks}</div>
              <div className="text-sm text-foreground/60 mt-1">out of {total}</div>
              <div className="text-2xl font-bold text-accent mt-1">{pct}%</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <div className="text-xs font-semibold uppercase tracking-wider text-foreground/60">Merit Rank</div>
              <div className="text-3xl font-black text-primary">#{user.merit ?? "—"}</div>
              <div className="text-xs text-foreground/60">{user.class_applying}</div>
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div>
          <h3 className="text-lg font-bold mb-3">Score Summary</h3>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Subject</th>
                  <th className="text-center px-4 py-2.5 font-semibold">Obtained</th>
                  <th className="text-center px-4 py-2.5 font-semibold">Total</th>
                  <th className="text-center px-4 py-2.5 font-semibold">Percentage</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(subjects).map(([s, d]) => (
                  <tr key={s} className="border-t border-border">
                    <td className="px-4 py-2">{s}</td>
                    <td className="px-4 py-2 text-center">{d.obtained}</td>
                    <td className="px-4 py-2 text-center">{d.total}</td>
                    <td className="px-4 py-2 text-center">{Math.round((d.obtained / d.total) * 100)}%</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-primary bg-emerald-50/60 font-bold">
                  <td className="px-4 py-2 text-primary">TOTAL</td>
                  <td className="px-4 py-2 text-center">{marks}</td>
                  <td className="px-4 py-2 text-center">{total}</td>
                  <td className="px-4 py-2 text-center">{pct}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </>
  );
}
