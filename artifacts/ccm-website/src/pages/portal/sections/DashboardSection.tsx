import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import {
  ClipboardList,
  FolderOpen,
  Landmark,
  Ticket,
  Trophy,
  ScrollText,
  PlaneTakeoff,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import type { PortalUser, SectionKey } from "../data";
import { STAGES, STATUS_IDX } from "../data";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-foreground/55 font-semibold">{label}</div>
      <div className="text-xl font-bold text-primary mt-1">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border text-sm">
      <span className="text-foreground/60">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

export default function DashboardSection({
  user,
  onNavigate,
}: {
  user: PortalUser;
  onNavigate: (k: SectionKey) => void;
}) {
  const idx = STATUS_IDX[user.status] ?? 0;
  const progress = Math.round(((idx + 1) / STAGES.length) * 100);
  const stageTitle = STAGES[Math.min(idx, STAGES.length - 1)].title;
  const docsDone = Object.values(user.docs).filter((d) => d.uploaded).length;
  const docsTotal = Object.keys(user.docs).length;
  const feeStatus = user.fee.status.toUpperCase();

  const allActions: { Icon: LucideIcon; label: string; key: SectionKey; color: string; bg: string }[] = [
    { Icon: ClipboardList, label: "Status", key: "status", color: "text-sky-700", bg: "bg-sky-100" },
    { Icon: FolderOpen, label: "Documents", key: "documents", color: "text-amber-700", bg: "bg-amber-100" },
    { Icon: Landmark, label: "Fee Challan", key: "challan", color: "text-orange-700", bg: "bg-orange-100" },
    { Icon: Ticket, label: "Admit Card", key: "admit", color: "text-indigo-700", bg: "bg-indigo-100" },
    { Icon: Trophy, label: "Result", key: "result", color: "text-yellow-700", bg: "bg-yellow-100" },
    { Icon: ScrollText, label: "Offer Letter", key: "offer", color: "text-emerald-700", bg: "bg-emerald-100" },
    { Icon: PlaneTakeoff, label: "Joining", key: "joining", color: "text-purple-700", bg: "bg-purple-100" },
    { Icon: RotateCcw, label: "Re-apply", key: "reapply", color: "text-rose-700", bg: "bg-rose-100" },
  ];
  const actions = allActions.filter((a) => {
    if ((a.key === "challan" || a.key === "payment") && user.application_fee_enabled === false) return false;
    return true;
  });

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-6">
      {/* Welcome banner */}
      <div
        className="rounded-2xl px-6 py-5 text-white shadow-lg"
        style={{ background: "linear-gradient(135deg, #064A1A, #0a5c20)" }}
      >
        <h2 className="text-2xl font-bold m-0">Welcome back, {user.fullName}! 👋</h2>
        <p className="text-sm opacity-85 mt-1">
          Applicant ID: <strong>{user.ref_id}</strong> · Session: {user.session} · {user.class_applying}
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Class/Program" value={user.class_applying} />
        <Metric label="Current Stage" value={stageTitle.length > 18 ? stageTitle.slice(0, 18) + "…" : stageTitle} />
        <Metric label="Documents" value={`${docsDone} / ${docsTotal}`} />
        <Metric label="Fee Status" value={feeStatus} />
      </div>

      {/* Progress */}
      <div>
        <p className="font-semibold text-sm mb-2">Application Progress: {progress}%</p>
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-foreground/60 mt-2">
          Stage {idx + 1} of {STAGES.length}: <strong className="text-primary">{stageTitle}</strong>
        </p>
      </div>

      <div className="h-px bg-border" />

      {/* Quick actions — app-tile grid */}
      <div>
        <h3 className="text-lg font-bold text-primary mb-3">Quick Actions</h3>
        <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 lg:gap-3">
          {actions.map(({ Icon, label, key, color, bg }) => (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(key)}
              className="group flex flex-col items-center gap-1.5 p-2 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-sm active:scale-95 transition-all"
              data-testid={`action-${key}`}
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${bg}`}>
                <Icon className={`w-6 h-6 ${color}`} />
              </div>
              <span className="text-[11px] font-medium text-foreground text-center leading-tight">
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Application summary */}
      <div>
        <h3 className="text-lg font-bold text-primary mb-3">Application Summary</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="font-semibold mb-2">Student Details</p>
            <InfoRow label="Full Name" value={user.name} />
            <InfoRow label="Father's Name" value={user.father_name} />
            <InfoRow label="Date of Birth" value={user.date_of_birth} />
            <InfoRow label="Blood Group" value={user.blood_group} />
            <InfoRow label="Class/Program Applying" value={user.class_applying} />
          </div>
          <div>
            <p className="font-semibold mb-2">Contact & Test Details</p>
            <InfoRow label="Email" value={user.email} />
            <InfoRow label="Phone" value={user.phone} />
            <InfoRow label="City" value={user.city} />
            <InfoRow label="Exam Centre" value={user.exam_center} />
            <InfoRow label="Roll Number" value={user.roll_no ?? "—"} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
