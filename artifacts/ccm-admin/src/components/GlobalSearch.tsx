import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  Search, ArrowRight, Loader2,
  LayoutDashboard, ClipboardList, GraduationCap, Users, ClipboardCheck,
  Wallet, Building2, Briefcase, BookOpen, BarChart3, Settings2,
  CalendarDays, Trophy, HeartPulse, Bus, Package, Megaphone,
  ShieldCheck, Tags, FileText,
} from "lucide-react";
import { useListAdminApplications, getListAdminApplicationsQueryKey } from "@workspace/api-client-react";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

// ─── Status colours ───────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  received:             { label: "Received",         className: "bg-slate-100 text-slate-600"     },
  under_review:         { label: "Under Review",      className: "bg-amber-100 text-amber-700"     },
  pending_verification: { label: "Pending Verify",   className: "bg-orange-100 text-orange-700"   },
  verified:             { label: "Verified",          className: "bg-blue-100 text-blue-700"       },
  test_scheduled:       { label: "Test Scheduled",   className: "bg-violet-100 text-violet-700"   },
  test_taken:           { label: "Test Taken",        className: "bg-cyan-100 text-cyan-700"       },
  result_announced:     { label: "Result Out",       className: "bg-emerald-100 text-emerald-700" },
  admitted:             { label: "Qualified",         className: "bg-green-100 text-green-800"     },
  on_hold:              { label: "On Hold",           className: "bg-slate-100 text-slate-500"     },
  rejected:             { label: "Rejected",          className: "bg-red-100 text-red-600"         },
};

// ─── Module shortcuts ─────────────────────────────────────────────────────────

const MODULES = [
  { name: "Dashboard",      href: "/",             icon: LayoutDashboard, color: "#6366f1" },
  { name: "Applications",   href: "/applications", icon: ClipboardList,   color: "#7c3aed" },
  { name: "Examinations",   href: "/examinations", icon: ClipboardCheck,  color: "#9333ea" },
  { name: "Fee Master",          href: "/fee-master",       icon: Tags,   color: "#d97706" },
  { name: "Concessions Report", href: "/fee-concessions",  icon: Tags,   color: "#059669" },
  { name: "Accounts",       href: "/accounts",     icon: Wallet,          color: "#16a34a" },
  { name: "Academic",       href: "/academic",     icon: GraduationCap,   color: "#059669" },
  { name: "Timetable",      href: "/timetable",    icon: CalendarDays,    color: "#0891b2" },
  { name: "Students",       href: "/students",     icon: Users,           color: "#2563eb" },
  { name: "Finance",        href: "/finance",      icon: Wallet,          color: "#16a34a" },
  { name: "Store",          href: "/store",        icon: Package,         color: "#c2410c" },
  { name: "Hostel",         href: "/hostel",       icon: Building2,       color: "#ea580c" },
  { name: "Sports",         href: "/sports",       icon: Trophy,          color: "#ca8a04" },
  { name: "Medical",        href: "/medical",      icon: HeartPulse,      color: "#dc2626" },
  { name: "Library",        href: "/library",      icon: BookOpen,        color: "#0d9488" },
  { name: "Transport",      href: "/transport",    icon: Bus,             color: "#0284c7" },
  { name: "HR & Staff",     href: "/hr",           icon: Briefcase,       color: "#db2777" },
  { name: "Communication",  href: "/communication",icon: Megaphone,       color: "#a21caf" },
  { name: "Gate Security",  href: "/gate",         icon: ShieldCheck,     color: "#475569" },
  { name: "Reports",        href: "/reports",      icon: BarChart3,       color: "#1d4ed8" },
  { name: "Settings",       href: "/settings",     icon: Settings2,       color: "#64748b" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classLabel(c: string) {
  const map: Record<string, string> = {
    "class-7": "Class VII", "class-8": "Class VIII", "class-9": "Class IX",
    "class-11-premedical": "XI Pre-Med", "class-11-preengineering": "XI Pre-Eng",
    "class-11-ics": "XI ICS",
  };
  return map[c] ?? c;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [, setLocation] = useLocation();

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Live application search (only when query present)
  const appQp = { q: debouncedQuery, pageSize: 8 };
  const { data: results, isFetching } = useListAdminApplications(appQp, {
    query: {
      queryKey: getListAdminApplicationsQueryKey(appQp),
      enabled: open && debouncedQuery.trim().length > 0,
      staleTime: 30_000,
    },
  });

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      setLocation(href);
    },
    [setLocation]
  );

  // Filter modules by query (client-side)
  const filteredModules = query.trim()
    ? MODULES.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
    : MODULES;

  const apps = results?.items ?? [];
  const showApps = debouncedQuery.trim().length > 0;

  return (
    <>
      {/* ── Visible trigger bar ───────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/8",
          "px-3.5 h-9 text-left transition-all hover:bg-white/14 hover:border-white/25",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500/50",
          "w-[260px] xl:w-[380px]"
        )}
      >
        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="flex-1 text-[12.5px] text-slate-400 font-medium truncate">
          Search applications, cadets, modules…
        </span>
        <kbd className="hidden sm:flex items-center gap-0.5 rounded-md border border-white/15 bg-white/8 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 font-mono">
          ⌘K
        </kbd>
      </button>

      {/* ── Command palette dialog ────────────────────────────────────── */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <div className="flex items-center border-b border-border px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, Applicant ID, roll number…"
            className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          {isFetching && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          )}
        </div>

        <CommandList className="max-h-[520px]">

          {/* ── Application results ──────────────────────────────── */}
          {showApps && (
            <>
              <CommandGroup
                heading={
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3" />
                    Applications
                    {apps.length > 0 && (
                      <span className="ml-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5">
                        {results?.total ?? apps.length}
                      </span>
                    )}
                  </span>
                }
              >
                {apps.length === 0 && !isFetching && (
                  <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                    No applications found for "{debouncedQuery}"
                  </div>
                )}
                {apps.map((app) => {
                  const st = STATUS_STYLE[app.status] ?? { label: app.status, className: "bg-slate-100 text-slate-600" };
                  return (
                    <CommandItem
                      key={app.referenceId}
                      value={`${app.fullName ?? ""} ${app.referenceId}`}
                      onSelect={() => navigate(`/applications/${app.referenceId}`)}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                    >
                      {/* Avatar letter */}
                      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(app.fullName ?? "?").charAt(0).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-foreground truncate">{app.fullName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {app.referenceId}
                          {app.classApplying && ` · ${classLabel(app.classApplying)}`}
                          {(app as any).testCentre && ` · ${(app as any).testCentre}`}
                        </p>
                      </div>

                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0", st.className)}>
                        {st.label}
                      </span>

                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-40" />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {/* ── Module navigation ─────────────────────────────────── */}
          <CommandGroup
            heading={
              <span className="flex items-center gap-1.5">
                <LayoutDashboard className="h-3 w-3" />
                {showApps ? "Jump to Module" : "Navigate to Module"}
              </span>
            }
          >
            {filteredModules.map((mod) => (
              <CommandItem
                key={mod.name}
                value={`module ${mod.name}`}
                onSelect={() => navigate(mod.href)}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer"
              >
                <div
                  className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${mod.color}18` }}
                >
                  <mod.icon className="h-4 w-4" style={{ color: mod.color }} />
                </div>
                <span className="text-[13px] font-semibold flex-1">{mod.name}</span>
                <kbd className="text-[10px] text-muted-foreground font-mono opacity-50">↵</kbd>
              </CommandItem>
            ))}

            {filteredModules.length === 0 && (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No module matches "{query}"
              </div>
            )}
          </CommandGroup>

          {/* ── Empty state ───────────────────────────────────────── */}
          {showApps && apps.length === 0 && filteredModules.length === 0 && !isFetching && (
            <CommandEmpty>Nothing found for "{query}"</CommandEmpty>
          )}

        </CommandList>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 bg-muted/40">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-medium">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">↵</kbd>
              Open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">Esc</kbd>
              Close
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">CCM Admin Search</span>
        </div>
      </CommandDialog>
    </>
  );
}
