import { GraduationCap } from "lucide-react";
import type { PortalUser } from "../data";
import { STAGES, STATUS_IDX } from "../data";
import StatusBadge from "./StatusBadge";

export default function MobilePortalHeader({ user }: { user: PortalUser }) {
  const r = user.result_status;
  let badge: React.ReactNode;
  if (r === "selected") badge = <StatusBadge variant="selected">✅ Selected</StatusBadge>;
  else if (r === "wait_listed") badge = <StatusBadge variant="wait">⏳ Wait Listed</StatusBadge>;
  else if (r === "not_selected") badge = <StatusBadge variant="not">❌ Not Selected</StatusBadge>;
  else {
    const idx = STATUS_IDX[user.status] ?? 0;
    const title = STAGES[idx]?.title ?? "Application";
    badge = <StatusBadge variant="pending">📋 {title}</StatusBadge>;
  }

  return (
    <div className="lg:hidden mb-3 rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      <div
        className="px-4 py-3 text-white flex items-center gap-3"
        style={{ background: "linear-gradient(135deg, #064A1A, #0a5c20)" }}
      >
        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
          <GraduationCap className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15px] leading-tight">CCM Portal</div>
          <div className="text-[11px] text-white/75 leading-tight">Cadet College Murree</div>
        </div>
      </div>
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-sm text-primary truncate">{user.fullName}</div>
          <div className="text-[11px] text-foreground/60 truncate">{user.ref_id}</div>
        </div>
        <div className="flex-shrink-0">{badge}</div>
      </div>
    </div>
  );
}
