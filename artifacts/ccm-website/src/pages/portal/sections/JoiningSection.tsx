import { useState } from "react";
import { motion } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, CheckCircle2 } from "lucide-react";
import type { PortalUser } from "../data";

const ITEMS: [string, string, string][] = [
  ["📄", "Offer Letter", "This offer letter (printed)"],
  ["📋", "Application Form", "Printed copy of your online application form"],
  ["🪪", "Original Documents", "Birth Certificate, B-Form, School Leaving Cert, Medical Fitness Cert"],
  ["📸", "Photographs", "6 recent passport-size photographs (white background)"],
  ["🏦", "Fee Deposit Slip", "Original bank challan stamped by NBP"],
  ["📚", "School Character Certificate", "Good character certificate from previous school"],
  ["🏥", "Medical Fitness Certificate", "Certificate from a registered MBBS doctor"],
  ["👔", "Civilian Clothes", "For the first day (uniform issued on joining)"],
  ["🧳", "Personal Belongings", "Allowed list will be communicated separately"],
];

const NOTES = [
  "Students must report with their parent / guardian on the joining date.",
  "Late arrivals (without prior written permission) may lose the seat.",
  "Bring original documents — photocopies are NOT accepted for verification.",
  "Fee must be paid before the deadline via NBP challan only.",
  "Mobile phones are NOT permitted inside the college campus for students.",
  "For any queries, contact the Admissions Office at 0304-1111024.",
];

const CHECKLIST = [
  "Fee paid and deposit slip obtained",
  "Original documents collected",
  "Photographs taken (6 copies)",
  "Medical fitness certificate obtained",
  "Character certificate obtained from previous school",
  "Travel arrangements confirmed",
  "Emergency contact numbers saved",
];

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 text-center">
      <div className="text-xs uppercase tracking-wider text-foreground/55 font-semibold">{label}</div>
      <div className="text-lg font-bold text-primary mt-1">{value}</div>
    </div>
  );
}

export default function JoiningSection({ user }: { user: PortalUser }) {
  const [checked, setChecked] = useState<boolean[]>(CHECKLIST.map(() => false));

  if (user.result_status !== "selected") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-4"
      >
        <h1 className="text-3xl font-bold text-primary">📋 Joining Instructions</h1>
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
          <Clock className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span>⏳ Joining instructions will be available once you are selected and issued an offer letter.</span>
        </div>
      </motion.div>
    );
  }

  const allDone = checked.every(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <h1 className="text-3xl font-bold text-primary">📋 Joining Instructions</h1>

      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
        <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <span>
          ✅ <strong>Reporting Date: {user.joining_date ?? "15 June 2026"}</strong> · Fee Deadline:{" "}
          {user.fee_deadline ?? "10 June 2026"}
        </span>
      </div>

      <div>
        <h2 className="text-xl font-bold text-primary mb-3">📦 Items to Bring on Joining Day</h2>
        <div className="space-y-2">
          {ITEMS.map(([emoji, title, desc]) => (
            <div key={title} className="flex gap-3 items-start">
              <div className="text-2xl leading-none flex-shrink-0">{emoji}</div>
              <div className="text-sm">
                <strong>{title}</strong> — <span className="text-foreground/75">{desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="h-px bg-border" />

      <div>
        <h2 className="text-xl font-bold text-primary mb-3">📅 Important Dates & Deadlines</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <MetricCard label="Fee Deadline" value={user.fee_deadline ?? "10 June 2026"} />
          <MetricCard label="Reporting Date" value={user.joining_date ?? "15 June 2026"} />
          <MetricCard label="Session Start" value="1 August 2026" />
        </div>
      </div>

      <div className="h-px bg-border" />

      <div>
        <h2 className="text-xl font-bold text-primary mb-3">⚠️ Important Notes</h2>
        <ul className="space-y-1.5 text-sm">
          {NOTES.map((n) => (
            <li key={n} className="flex gap-2">
              <span className="text-primary">•</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="h-px bg-border" />

      <div>
        <h2 className="text-xl font-bold text-primary mb-3">✅ Pre-Joining Checklist</h2>
        <div className="space-y-2">
          {CHECKLIST.map((item, i) => (
            <label key={item} className="flex items-center gap-2.5 text-sm cursor-pointer">
              <Checkbox
                checked={checked[i]}
                onCheckedChange={(v) => {
                  const next = [...checked];
                  next[i] = Boolean(v);
                  setChecked(next);
                }}
                data-testid={`check-${i}`}
              />
              <span>{item}</span>
            </label>
          ))}
        </div>
        {allDone && (
          <div className="mt-3 flex items-start gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
            <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>🎉 All items checked! You are ready for joining day.</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
