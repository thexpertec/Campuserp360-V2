import { motion } from "framer-motion";
import { LogOut, GraduationCap } from "lucide-react";
import type { PortalUser, SectionKey } from "../data";
import { STAGES, STATUS_IDX } from "../data";
import StatusBadge from "./StatusBadge";
import { cn } from "@/lib/utils";

const NAV: { key: SectionKey; emoji: string; label: string }[] = [
  { key: "dashboard", emoji: "🏠", label: "Dashboard" },
  { key: "status", emoji: "📋", label: "Application Status" },
  { key: "documents", emoji: "📂", label: "Documents" },
  { key: "challan", emoji: "🏦", label: "Fee Challan" },
  { key: "payment", emoji: "💳", label: "Payment Confirmation" },
  { key: "admit", emoji: "🎫", label: "Admit Card" },
  { key: "result", emoji: "🏆", label: "Entry Test Result" },
  { key: "interview", emoji: "🎙️", label: "Interview" },
  { key: "offer", emoji: "📜", label: "Offer Letter" },
  { key: "admission_fee", emoji: "🏦", label: "Admission Fee" },
  { key: "joining", emoji: "📋", label: "Joining Instructions" },
  { key: "reapply", emoji: "🔄", label: "Re-application" },
  { key: "settings", emoji: "⚙️", label: "Settings" },
];

export default function Sidebar({
  user,
  active,
  onSelect,
  onLogout,
}: {
  user: PortalUser;
  active: SectionKey;
  onSelect: (k: SectionKey) => void;
  onLogout: () => void;
}) {
  const r = user.result_status;
  let badge: React.ReactNode;
  if (r === "selected") badge = <StatusBadge variant="selected">✅ Selected</StatusBadge>;
  else if (r === "wait_listed") badge = <StatusBadge variant="wait">⏳ Wait Listed</StatusBadge>;
  else if (r === "not_selected") badge = <StatusBadge variant="not">❌ Not Selected</StatusBadge>;
  else {
    const idx = STATUS_IDX[user.status] ?? 0;
    const title = STAGES[idx]?.title ?? "Application";
    const short = title.length > 14 ? title.slice(0, 14) + "…" : title;
    badge = <StatusBadge variant="pending">📋 {short}</StatusBadge>;
  }

  return (
    <aside className="hidden lg:block lg:w-[260px] lg:flex-shrink-0">
      <div className="lg:sticky lg:top-20 bg-card border border-border rounded-2xl p-4 shadow-sm">
        {/* Header */}
        <div className="text-center pb-3">
          <div className="text-3xl">🎓</div>
          <div className="font-bold text-primary text-base mt-1 flex items-center justify-center gap-1.5">
            <GraduationCap className="w-4 h-4" />
            CCM Portal
          </div>
          <div className="text-xs text-foreground/60 mt-0.5">Cadet College Murree</div>
        </div>

        <div className="h-px bg-border my-2" />

        {/* User card */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 mb-3">
          <div className="font-bold text-sm text-primary">{user.fullName}</div>
          <div className="text-[11px] text-foreground/60 mt-0.5">{user.ref_id}</div>
          <div className="mt-1.5">{badge}</div>
        </div>

        {/* Nav */}
        <nav className="space-y-1">
          {NAV.filter((item) => {
            if ((item.key === "challan" || item.key === "payment") && user.application_fee_enabled === false) return false;
            return true;
          }).map((item) => {
            const isActive = active === item.key;
            return (
              <motion.button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border-l-4 text-left",
                  isActive
                    ? "bg-primary/10 border-l-primary text-primary"
                    : "border-l-transparent text-foreground/75 hover:bg-muted hover:text-primary",
                )}
                data-testid={`nav-${item.key}`}
              >
                <span className="text-base">{item.emoji}</span>
                <span className="truncate">{item.label}</span>
              </motion.button>
            );
          })}
        </nav>

        <div className="h-px bg-border my-3" />

        <button
          type="button"
          onClick={onLogout}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-muted hover:bg-rose-50 hover:text-rose-700 text-foreground/75 transition-colors"
          data-testid="logout-button"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>

        <p className="text-center text-[10px] text-foreground/45 mt-3">CCM Admissions Portal v2.0</p>
      </div>
    </aside>
  );
}
