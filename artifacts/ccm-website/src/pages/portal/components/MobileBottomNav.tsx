import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Home,
  ClipboardList,
  FolderOpen,
  Ticket,
  Menu,
  Landmark,
  CreditCard,
  Trophy,
  ScrollText,
  PlaneTakeoff,
  RotateCcw,
  Settings,
  LogOut,
  X,
} from "lucide-react";
import type { PortalUser, SectionKey } from "../data";
import { cn } from "@/lib/utils";

type TabDef = { key: SectionKey | "more"; label: string; Icon: React.ComponentType<{ className?: string }> };

const PRIMARY: TabDef[] = [
  { key: "dashboard", label: "Home", Icon: Home },
  { key: "status", label: "Status", Icon: ClipboardList },
  { key: "documents", label: "Docs", Icon: FolderOpen },
  { key: "admit", label: "Card", Icon: Ticket },
  { key: "more", label: "More", Icon: Menu },
];

const MORE_ITEMS: { key: SectionKey; label: string; Icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { key: "challan", label: "Fee Challan", Icon: Landmark, color: "bg-amber-100 text-amber-700" },
  { key: "payment", label: "Payment", Icon: CreditCard, color: "bg-blue-100 text-blue-700" },
  { key: "result", label: "Result", Icon: Trophy, color: "bg-yellow-100 text-yellow-700" },
  { key: "offer", label: "Offer Letter", Icon: ScrollText, color: "bg-emerald-100 text-emerald-700" },
  { key: "admission_fee", label: "Admission Fee", Icon: Landmark, color: "bg-teal-100 text-teal-700" },
  { key: "joining", label: "Joining", Icon: PlaneTakeoff, color: "bg-purple-100 text-purple-700" },
  { key: "reapply", label: "Re-apply", Icon: RotateCcw, color: "bg-rose-100 text-rose-700" },
  { key: "settings", label: "Settings", Icon: Settings, color: "bg-slate-100 text-slate-700" },
];

export default function MobileBottomNav({
  user,
  active,
  onSelect,
  onLogout,
}: {
  user?: PortalUser;
  active: SectionKey;
  onSelect: (k: SectionKey) => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const visibleMore = MORE_ITEMS.filter((item) => {
    if ((item.key === "challan" || item.key === "payment") && user?.application_fee_enabled === false) return false;
    return true;
  });

  // Lock body scroll + handle Escape while sheet is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* Bottom tab bar (mobile only) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-border shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex items-stretch justify-around max-w-md mx-auto">
          {PRIMARY.map(({ key, label, Icon }) => {
            const isMore = key === "more";
            const isActive = isMore ? open : active === key;
            return (
              <li key={key} className="flex-1">
                <button
                  type="button"
                  onClick={() => {
                    if (isMore) setOpen((v) => !v);
                    else {
                      setOpen(false);
                      onSelect(key as SectionKey);
                    }
                  }}
                  className={cn(
                    "w-full flex flex-col items-center justify-center gap-0.5 py-2 px-1 transition-colors",
                    isActive ? "text-primary" : "text-foreground/55 hover:text-primary",
                  )}
                  data-testid={`mtab-${key}`}
                >
                  <Icon className={cn("w-[22px] h-[22px]", isActive && "stroke-[2.4]")} />
                  <span className={cn("text-[10.5px] font-medium leading-none", isActive && "font-semibold")}>
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* More slide-up sheet */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="lg:hidden fixed inset-0 bg-black/40 z-[55]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-more-title"
              className="lg:hidden fixed left-0 right-0 bottom-0 z-[60] bg-white rounded-t-3xl shadow-2xl max-h-[80vh] overflow-y-auto"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280 }}
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
            >
              {/* Grab handle */}
              <div className="pt-3 pb-1 flex justify-center">
                <div className="w-10 h-1.5 rounded-full bg-foreground/15" />
              </div>

              <div className="flex items-center justify-between px-5 pt-2 pb-3">
                <h3 id="mobile-more-title" className="text-lg font-bold text-primary">More</h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-foreground/60" />
                </button>
              </div>

              <div className="px-4 grid grid-cols-3 gap-3">
                {visibleMore.map(({ key, label, Icon, color }) => {
                  const isActive = active === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        onSelect(key);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border transition-all active:scale-95",
                        isActive
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:border-primary/40",
                      )}
                      data-testid={`more-${key}`}
                    >
                      <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center", color)}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[12px] font-medium text-foreground text-center leading-tight px-1">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="px-5 mt-5 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onLogout();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                  data-testid="mobile-logout"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
                <p className="text-center text-[10px] text-foreground/45 mt-3">CCM Admissions Portal v1.0</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
