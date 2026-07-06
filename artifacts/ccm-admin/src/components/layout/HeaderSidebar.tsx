import { useState, useMemo, useContext } from "react";
import { ModulesContext, type ModulesState } from "@/lib/modules-context";
import { useLocation, useSearch, Link } from "wouter";
import { useModuleVisibility } from "@/hooks/use-module-visibility";
import {
  LayoutDashboard, ClipboardList, GraduationCap, Users, Wallet,
  Building2, Briefcase, BookOpen, BarChart3, Settings2, Bell, LogOut,
  CalendarDays, Trophy, HeartPulse, Bus, Package, ChevronDown, Home,
  Library, Printer, ClipboardCheck, FileText, Award, Layers, BookMarked,
  UserCheck, Banknote, ArchiveX, Tent, Receipt, Images, ShieldCheck, Megaphone,
  CalendarRange, CheckCircle2, Globe,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getToken, getUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { clearAuth } from "@/lib/auth";
import { AdminUser } from "@workspace/api-client-react";
import { GlobalSearch } from "@/components/GlobalSearch";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubItem = { name: string; tab?: string; page?: string; href?: string; moduleKey?: string };
export type NavItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  color: string;
  subColor: string;
  matchPaths: string[];
  subs: SubItem[];
};

// ─── Module definitions ───────────────────────────────────────────────────────
// Each NavItem is one "module" with its own coloured sub-tab strip.

export const NAV: NavItem[] = [

  // ── Dashboard ──────────────────────────────────────────────────────────────
  {
    name: "Dashboard", href: "/", icon: LayoutDashboard,
    color: "#6366f1", subColor: "#4f46e5",
    matchPaths: ["/"], subs: [],
  },

  // ── ADMISSIONS ─────────────────────────────────────────────────────────────
  {
    name: "Admissions", href: "/applications", icon: ClipboardList,
    color: "#7c3aed", subColor: "#6d28d9",
    matchPaths: ["/admissions", "/applications", "/test-centres"],
    subs: [
      { name: "Dashboard",      tab: "dashboard"                 },
      { name: "Applications",         href: "/applications"            },
      { name: "Document Verification", tab: "doc-verify"               },
      { name: "Fee Verification",     tab: "fee-verify"                },
      { name: "Entry Test",           tab: "entry-test"                },
      { name: "Interview",      tab: "interview"                 },
      { name: "Merit List",     tab: "merit-list"                },
      { name: "Enrollment",     tab: "enrollment"                },
      { name: "Setup",          tab: "setup"                     },
    ],
  },

  // ── ACADEMICS ──────────────────────────────────────────────────────────────
  {
    name: "Academic Setup", href: "/academic", icon: GraduationCap,
    color: "#059669", subColor: "#047857",
    matchPaths: ["/academic"],
    subs: [
      { name: "Setup",              tab: "setup"          },
      { name: "Houses",             tab: "houses"         },
      { name: "Affiliations",       tab: "affiliations"   },
    ],
  },
  {
    name: "Timetable", href: "/timetable", icon: CalendarDays,
    color: "#0891b2", subColor: "#0e7490",
    matchPaths: ["/timetable"],
    subs: [
      { name: "Dashboard",               tab: "dashboard"      },
      { name: "Class/Program Subjects",  tab: "class-subjects" },
      { name: "Teacher Load",            tab: "teachers"       },
      { name: "Period Setup",            tab: "periods"        },
      { name: "Class/Program Timetable", tab: "schedule"       },
    ],
  },
  {
    name: "Exams & Results", href: "/examinations", icon: ClipboardCheck,
    color: "#9333ea", subColor: "#7e22ce",
    matchPaths: ["/examinations"],
    subs: [
      { name: "Dashboard",       tab: "dashboard"     },
      { name: "Schedule Exams",  tab: "schedule"      },
      { name: "Results Entry",   tab: "results"       },
      { name: "Report Cards",    tab: "report-cards"  },
      { name: "Setup",           tab: "setup"         },
    ],
  },
  {
    name: "Syllabus", href: "/syllabus", icon: BookMarked,
    color: "#0d9488", subColor: "#0f766e",
    matchPaths: ["/syllabus"],
    subs: [
      { name: "Dashboard",      tab: "dashboard"     },
      { name: "Lesson Plans",   tab: "lesson-plans"  },
      { name: "Setup",          tab: "setup"         },
    ],
  },

  // ── STUDENTS ───────────────────────────────────────────────────────────────
  {
    name: "Students", href: "/students", icon: Users,
    color: "#2563eb", subColor: "#1d4ed8",
    matchPaths: ["/students", "/guardians"],
    subs: [
      { name: "Dashboard",      tab: "dashboard"  },
      { name: "Student Roster", tab: "roster"     },
      { name: "Attendance",     tab: "attendance" },
      { name: "Guardians",      href: "/guardians" },
    ],
  },

  // ── FINANCE ────────────────────────────────────────────────────────────────
  {
    name: "Finance", href: "/fee-master", icon: Wallet,
    color: "#16a34a", subColor: "#15803d",
    matchPaths: ["/finance", "/fee-master", "/fee-reports", "/fine-setup", "/accounts", "/vendors"],
    subs: [
      { name: "Fee Master",          href: "/fee-master",          moduleKey: "fees"    },
      { name: "Fine Setup",          href: "/fine-setup",          moduleKey: "fees"    },
      { name: "Fee Reports",         href: "/fee-reports",         moduleKey: "fees"    },
      { name: "Accounts",            href: "/accounts",            moduleKey: "finance" },
      { name: "Vendors",             href: "/vendors",             moduleKey: "finance" },
      { name: "Reports",             href: "/finance?tab=reports", moduleKey: "finance" },
    ],
  },

  // ── HRM ────────────────────────────────────────────────────────────────────
  {
    name: "HRM", href: "/hr", icon: Briefcase,
    color: "#db2777", subColor: "#be185d",
    matchPaths: ["/hr", "/employees"],
    subs: [
      { name: "Dashboard",       tab: "dashboard",  moduleKey: "hr"      },
      { name: "Staff Directory", href: "/employees",moduleKey: "hr"      },
      { name: "Attendance",      tab: "attendance", moduleKey: "hr"      },
      { name: "Payroll",         tab: "payroll",    moduleKey: "payroll" },
      { name: "Leave Management",tab: "leave",      moduleKey: "hr"      },
      { name: "Careers",         tab: "careers",    moduleKey: "hr"      },
      { name: "Setup",           tab: "setup",      moduleKey: "hr"      },
    ],
  },

  // ── INVENTORY & STORE ──────────────────────────────────────────────────────
  {
    name: "Inventory", href: "/store", icon: Package,
    color: "#c2410c", subColor: "#9a3412",
    matchPaths: ["/inventory", "/store"],
    subs: [
      { name: "Dashboard",     tab: "dashboard"      },
      { name: "Items List",    tab: "items"          },
      { name: "Categorization",tab: "categorization" },
      { name: "Units",         tab: "units"          },
    ],
  },

  // ── CAMPUS LIFE ────────────────────────────────────────────────────────────
  {
    name: "Hostel", href: "/hostel", icon: Building2,
    color: "#ea580c", subColor: "#c2410c",
    matchPaths: ["/hostel"],
    subs: [
      { name: "Dashboard",      tab: "dashboard"   },
      { name: "Dormitories",    tab: "dormitories" },
      { name: "Bed Allocation", tab: "beds"        },
      { name: "Mess / Dining",  tab: "mess"        },
      { name: "Visitor Log",    tab: "visitors"    },
      { name: "Setup",          tab: "setup"       },
    ],
  },
  {
    name: "Transport", href: "/transport", icon: Bus,
    color: "#0284c7", subColor: "#0369a1",
    matchPaths: ["/transport"],
    subs: [
      { name: "Dashboard",  tab: "dashboard" },
      { name: "Fleet",      tab: "fleet"     },
      { name: "Trips",      tab: "trips"     },
      { name: "Drivers",    tab: "drivers"   },
      { name: "Setup",      tab: "setup"     },
    ],
  },
  {
    name: "Library", href: "/library", icon: Library,
    color: "#7c3aed", subColor: "#6d28d9",
    matchPaths: ["/library"],
    subs: [
      { name: "Dashboard",      tab: "dashboard" },
      { name: "Book Catalog",   tab: "catalog"   },
      { name: "Issue & Return", tab: "issues"    },
      { name: "Fines",          tab: "fines"     },
      { name: "Setup",          tab: "setup"     },
    ],
  },
  {
    name: "Sick Bay", href: "/medical", icon: HeartPulse,
    color: "#dc2626", subColor: "#b91c1c",
    matchPaths: ["/medical"],
    subs: [
      { name: "Dashboard",       tab: "dashboard"   },
      { name: "Patient Records", tab: "patients"    },
      { name: "Sick Bay Log",    tab: "sick-bay"    },
      { name: "Medications",     tab: "medications" },
      { name: "Setup",           tab: "setup"       },
    ],
  },
  {
    name: "Sports", href: "/sports", icon: Trophy,
    color: "#ca8a04", subColor: "#a16207",
    matchPaths: ["/sports"],
    subs: [
      { name: "Dashboard",      tab: "dashboard"    },
      { name: "Teams & Squads", tab: "teams"        },
      { name: "Fixtures",       tab: "fixtures"     },
      { name: "Co-curricular",  tab: "cocurricular" },
      { name: "Setup",          tab: "setup"        },
    ],
  },
  {
    name: "Gate Security", href: "/gate", icon: ShieldCheck,
    color: "#b45309", subColor: "#92400e",
    matchPaths: ["/gate"],
    subs: [
      { name: "Entry / Exit Log",    tab: "log"        },
      { name: "Cadet Out-Pass",      tab: "outpass"    },
      { name: "Visitor Management",  tab: "visitors"   },
      { name: "Staff Gate Pass",     tab: "staff-pass" },
    ],
  },
  {
    name: "Events", href: "/events", icon: CalendarRange,
    color: "#0ea5e9", subColor: "#0284c7",
    matchPaths: ["/events"],
    subs: [
      { name: "Dashboard",  tab: "dashboard" },
      { name: "All Events", tab: "list"      },
      { name: "Bulk Add",   tab: "bulk"      },
      { name: "Calendar",   tab: "calendar"  },
      { name: "Setup",      tab: "setup"     },
    ],
  },

  // ── SCHOOL CALENDAR ─────────────────────────────────────────────────────────
  {
    name: "School Calendar", href: "/calendar", icon: CalendarDays,
    color: "#059669", subColor: "#047857",
    matchPaths: ["/calendar"],
    subs: [],
  },

  // ── COMMUNICATION ──────────────────────────────────────────────────────────
  {
    name: "Communication", href: "/communication", icon: Megaphone,
    color: "#9333ea", subColor: "#7e22ce",
    matchPaths: ["/communication"],
    subs: [
      { name: "Announcements",    tab: "announcements" },
      { name: "SMS Alerts",       tab: "sms"           },
      { name: "Email Broadcast",  tab: "email"         },
      { name: "Notice Board",     tab: "noticeboard"   },
      { name: "Parent Messaging", tab: "parents"       },
    ],
  },

  // ── WEBSITE CONTENT ────────────────────────────────────────────────────────
  {
    name: "Website", href: "/website", icon: Globe,
    color: "#0ea5e9", subColor: "#0284c7",
    matchPaths: ["/website"],
    subs: [
      { name: "Home",         page: "home"          },
      { name: "About",        page: "about"         },
      { name: "Admissions",   page: "admissions"    },
      { name: "Gallery",      page: "gallery"       },
      { name: "Events",       page: "events"        },
      { name: "Faculty",      page: "teachers"      },
      { name: "Alumni",       page: "alumni"        },
      { name: "Downloads",    page: "downloads"     },
      { name: "Fee Structure",page: "fee-structure" },
      { name: "Results",      page: "results"       },
      { name: "Contact",      page: "contact"       },
      { name: "Settings",     page: "site-settings" },
      { name: "SEO",          page: "seo-visitors"  },
    ],
  },

  // ── MEDIA ──────────────────────────────────────────────────────────────────
  {
    name: "Media Library", href: "/media", icon: Images,
    color: "#7c3aed", subColor: "#6d28d9",
    matchPaths: ["/media"],
    subs: [],
  },

  // ── PRINTING ───────────────────────────────────────────────────────────────
  {
    name: "Printing", href: "/printing", icon: Printer,
    color: "#475569", subColor: "#334155",
    matchPaths: ["/printing", "/printing/templates"],
    subs: [
      { name: "Generate & Print", href: "/printing" },
      { name: "Template Editor",  href: "/printing/templates" },
    ],
  },

  // ── APPROVALS ──────────────────────────────────────────────────────────────
  {
    name: "Approvals", href: "/approvals", icon: CheckCircle2,
    color: "#d97706", subColor: "#b45309",
    matchPaths: ["/approvals"], subs: [],
  },

  // ── REPORTS & SETTINGS ─────────────────────────────────────────────────────
  {
    name: "Reports", href: "/reports", icon: BarChart3,
    color: "#1d4ed8", subColor: "#1e40af",
    matchPaths: ["/reports"], subs: [],
  },
  {
    name: "Settings", href: "/settings", icon: Settings2,
    color: "#64748b", subColor: "#475569",
    matchPaths: ["/settings"],
    subs: [
      { name: "General",         tab: "general"          },
      { name: "ID Format",       tab: "id-format"        },
      { name: "Users & Roles",   tab: "users"            },
      { name: "Modules",         tab: "modules"          },
      { name: "Notifications",   tab: "notifications"    },
      { name: "Payment Gateway", tab: "payment-gateway"  },
      { name: "Fee Challan",     tab: "challan"          },
      { name: "Backup",          tab: "backup"           },
      { name: "Print & PDF",     tab: "print"            },
    ],
  },
];

// ─── Module → group map ───────────────────────────────────────────────────────

const MODULE_GROUP: Record<string, string> = {
  "Dashboard":       "dashboard",
  "Admissions":      "admissions",
  "Academic Setup":  "academics",
  "Timetable":       "academics",
  "Exams & Results": "academics",
  "Syllabus":        "academics",
  "School Calendar": "academics",
  "Students":        "students",
  "Finance":         "finance",
  "HRM":             "hrm",
  "Inventory":       "additionals",
  "Hostel":          "campus",
  "Transport":       "campus",
  "Library":         "campus",
  "Sick Bay":        "campus",
  "Sports":          "campus",
  "Gate Security":   "campus",
  "Events":          "campus",
  "Communication":   "additionals",
  "Website":         "additionals",
  "Media Library":   "additionals",
  "Printing":        "printing",
  "Approvals":       "approvals",
  "Reports":         "reports",
  "Settings":        "settings",
};

// ─── Mega-menu group definitions ──────────────────────────────────────────────

type MenuGroup = {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  /** Navigate directly (no dropdown) when set */
  direct?: string;
  /** For direct items — the NAV module name this group corresponds to (used for visibility filtering) */
  navName?: string;
  /** Module names that belong to this group (shows dropdown) */
  moduleNames: string[];
};

const MENU_GROUPS: MenuGroup[] = [
  { id: "dashboard",   label: "Dashboard",   icon: Home,          color: "#6366f1", direct: "/",             moduleNames: []                                                                              },
  { id: "admissions",  label: "Admissions",  icon: ClipboardList, color: "#7c3aed", direct: "/applications", navName: "Admissions",  moduleNames: []                                                    },
  { id: "students",    label: "Students",    icon: Users,         color: "#2563eb", direct: "/students",     navName: "Students",    moduleNames: []                                                    },
  { id: "academics",   label: "Academics",   icon: GraduationCap, color: "#059669",                          moduleNames: ["Academic Setup","Timetable","Exams & Results","Syllabus","School Calendar"]  },
  { id: "hrm",         label: "HRM",         icon: Briefcase,     color: "#db2777", direct: "/hr",           navName: "HRM",         moduleNames: []                                                    },
  { id: "finance",     label: "Finance",     icon: Wallet,        color: "#16a34a", direct: "/fee-master",   navName: "Finance",     moduleNames: []                                                    },
  { id: "printing",    label: "Printing",    icon: Printer,       color: "#475569", direct: "/printing",     navName: "Printing",    moduleNames: []                                                    },
  { id: "campus",      label: "Campus Life", icon: Building2,     color: "#f97316",                          moduleNames: ["Hostel","Transport","Library","Sick Bay","Sports","Gate Security","Events"]  },
  { id: "additionals", label: "Additionals", icon: Layers,        color: "#9333ea",                          moduleNames: ["Communication","Website","Media Library","Inventory"]                       },
  { id: "approvals",   label: "Approvals",   icon: CheckCircle2,  color: "#d97706", direct: "/approvals",    navName: "Approvals",   moduleNames: []                                                    },
  { id: "settings",    label: "Settings",    icon: Settings2,     color: "#64748b", direct: "/settings",     moduleNames: []                                                                            },
];

// ─── Nav-item → module-registry key ──────────────────────────────────────────
// Maps each nav item name to its module-registry key so that server-side
// permissions set in the SaaS Admin are reflected in the nav. Items without
// an entry here are always visible regardless of tenant module state.

const NAV_MODULE_KEY: Record<string, string> = {
  "Admissions":      "admissions",
  "Academic Setup":  "academics",
  "Timetable":       "timetable",
  "Exams & Results": "exams",
  "Syllabus":        "syllabus",
  "Students":        "academics",
  "Finance":         "fees",
  "HRM":             "hr",
  "Inventory":       "inventory",
  "Hostel":          "hostel",
  "Transport":       "transport",
  "Library":         "library",
  "Sick Bay":        "health",
  "Sports":          "sports",
  "Gate Security":   "gate_security",
  "Events":          "events",
  "Communication":   "communication",
  "Website":         "website",
  "Media Library":   "media_library",
  "Printing":        "batch_print",
  "Approvals":       "approvals",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function useActiveNav() {
  const [location] = useLocation();
  return (
    NAV.find((n) =>
      n.matchPaths.some((p) =>
        p === "/" ? location === "/" : location.startsWith(p)
      )
    ) ?? NAV[0]
  );
}

function getActiveGroupId(activeNavName: string): string {
  return MODULE_GROUP[activeNavName] ?? "dashboard";
}

function getSubHref(sub: SubItem, active: NavItem) {
  if (sub.href) return sub.href;
  if (sub.page) return `${active.href}?page=${sub.page}`;
  return `${active.href}?tab=${sub.tab}`;
}

function isSubActive(sub: SubItem, location: string, tab: string, page: string) {
  if (sub.href) {
    const base = sub.href.split("?")[0];
    return location === base || (base !== "/" && location.startsWith(base));
  }
  if (sub.page) return page === sub.page;
  return tab === sub.tab;
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

export function TopBar({ user }: { user?: AdminUser }) {
  const [, setLocation] = useLocation();
  const active = useActiveNav();
  const handleSignOut = () => { clearAuth(); setLocation("/login"); };

  const { data: settingsRows = [] } = useQuery<{ key: string; value: string }[]>({
    queryKey: ["admin-website-settings"],
    queryFn: async () => [],
    enabled: false,
    staleTime: Infinity,
  });
  const institutionName = settingsRows.find(r => r.key === "institution_name")?.value || "Admin";
  const logoSrc = settingsRows.find(r => r.key === "site_logo")?.value || "/logo.png";

  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between gap-4 px-5 z-40 border-b border-white/10"
      style={{ background: "linear-gradient(135deg,#0f172a 0%,#1a1040 60%,#0f172a 100%)" }}
    >
      {/* Logo */}
      <Link href="/">
        <div className="flex items-center gap-3 cursor-pointer select-none shrink-0">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-emerald-500/30 blur-md" />
            <img src={logoSrc} alt="Logo" className="relative h-9 w-9 object-contain rounded-xl" />
          </div>
          <div className="flex flex-col leading-none">
            <span
              className="text-[15px] font-extrabold tracking-tight text-white whitespace-nowrap"
              style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}
            >
              {institutionName}
            </span>
            <span
              className="text-[9px] font-bold tracking-[0.2em] uppercase"
              style={{
                background: "linear-gradient(90deg,#818cf8,#34d399)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              ERP System
            </span>
          </div>
        </div>
      </Link>

      {/* Global search */}
      <div className="flex-1 flex justify-center">
        <GlobalSearch />
      </div>

      {/* Right: active module badge + bell + user */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="hidden lg:flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-bold text-white/80 border border-white/10"
          style={{ background: `${active.color}25` }}
        >
          <active.icon className="h-3.5 w-3.5" style={{ color: active.color }} />
          {active.name}
        </span>

        <button className="relative h-8 w-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 ring-1 ring-slate-900" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10 transition-colors">
              <Avatar className="h-7 w-7 ring-2 ring-indigo-500/40">
                <AvatarFallback
                  className="text-xs font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
                >
                  {user?.name?.charAt(0) ?? "A"}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:block text-[13px] font-semibold text-white">
                {user?.name ?? "Admin"}
              </span>
              <ChevronDown className="h-3 w-3 text-white/50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48" align="end">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-semibold">{user?.name ?? "Admin"}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role ?? "administrator"}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive cursor-pointer font-medium"
            >
              <LogOut className="mr-2 h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

// ─── MainMenu ─────────────────────────────────────────────────────────────────

function useApprovalsCount(): number {
  const API = (import.meta.env.VITE_API_BASE as string) || "";
  const { data } = useQuery<{ count: number }>({
    queryKey: ["approvals-count"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/admin/approvals/count`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) return { count: 0 };
      try { return await res.json(); } catch { return { count: 0 }; }
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  return data?.count ?? 0;
}

export function MainMenu() {
  const [, setLocation] = useLocation();
  const active = useActiveNav();
  const activeGroupId = getActiveGroupId(active.name);
  const [openId, setOpenId] = useState<string | null>(null);
  const { hiddenModules } = useModuleVisibility();
  const { modules: serverModules, loading: modulesLoading } = useContext(ModulesContext);
  const approvalsCount = useApprovalsCount();

  const currentUser = getUser();
  const isCheckerOrSuperAdmin = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.isSuperAdmin) return true;
    return Array.isArray(currentUser.roles) && currentUser.roles.some(
      (r: { module: string; permission: string }) => r.permission === "post",
    );
  }, [currentUser?.isSuperAdmin, currentUser?.roles]);

  const visibleGroups = useMemo(() => {
    const isModEnabled = (navName: string) => {
      if (modulesLoading || serverModules.length === 0) return true;
      const key = NAV_MODULE_KEY[navName];
      if (!key) return true;
      const mod = serverModules.find(s => s.key === key);
      return mod ? mod.enabled : true;
    };
    return MENU_GROUPS
      .filter(group => {
        if (group.id === "dashboard" || group.id === "settings") return true;
        if (group.id === "approvals") return isCheckerOrSuperAdmin && isModEnabled("Approvals");
        if (group.navName) return !hiddenModules.includes(group.navName) && isModEnabled(group.navName);
        return group.moduleNames.some(m => !hiddenModules.includes(m) && isModEnabled(m));
      })
      .map(group => ({
        ...group,
        moduleNames: group.moduleNames.filter(m => !hiddenModules.includes(m) && isModEnabled(m)),
      }));
  }, [hiddenModules, isCheckerOrSuperAdmin, serverModules, modulesLoading]);

  return (
    <nav className="flex h-11 shrink-0 items-center gap-0.5 border-b border-border bg-white px-3 overflow-x-auto scrollbar-none shadow-sm z-30">
      {visibleGroups.map((group) => {
        const isActive = group.id === activeGroupId;
        const groupModules = NAV.filter((n) => group.moduleNames.includes(n.name));

        /* ── Direct-navigate item ── */
        if (group.direct) {
          const showBadge = group.id === "approvals" && approvalsCount > 0;
          return (
            <Link key={group.id} href={group.direct}>
              <div
                className={cn(
                  "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150",
                  isActive ? "text-white shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                )}
                style={isActive ? { background: group.color } : {}}
              >
                <group.icon className="h-3.5 w-3.5 shrink-0" />
                {group.label}
                {showBadge && (
                  <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-4 px-1 leading-none">
                    {approvalsCount > 99 ? "99+" : approvalsCount}
                  </span>
                )}
              </div>
            </Link>
          );
        }

        /* ── Dropdown group item ── */
        return (
          <Popover
            key={group.id}
            open={openId === group.id}
            onOpenChange={(o) => setOpenId(o ? group.id : null)}
          >
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150",
                  isActive ? "text-white shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                )}
                style={isActive ? { background: group.color } : {}}
              >
                <group.icon className="h-3.5 w-3.5 shrink-0" />
                {group.label}
                <ChevronDown
                  className={cn(
                    "h-3 w-3 shrink-0 transition-transform duration-200",
                    openId === group.id && "rotate-180",
                    isActive ? "text-white/70" : "text-slate-400"
                  )}
                />
              </button>
            </PopoverTrigger>

            <PopoverContent
              align="start"
              sideOffset={6}
              className="p-2 w-64 shadow-xl rounded-2xl border border-border"
            >
              {/* Group header */}
              <div className="flex items-center gap-2 px-2 pb-2 mb-1 border-b border-border">
                <div
                  className="h-6 w-6 rounded-lg flex items-center justify-center"
                  style={{ background: `${group.color}20` }}
                >
                  <group.icon className="h-3.5 w-3.5" style={{ color: group.color }} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  {group.label}
                </span>
              </div>

              {/* Module list */}
              <div className="space-y-0.5">
                {groupModules.map((mod) => {
                  const isModActive = mod.name === active.name;
                  const dest =
                    mod.subs.length > 0
                      ? mod.subs[0].href ?? `${mod.href}?tab=${mod.subs[0].tab}`
                      : mod.href;

                  return (
                    <button
                      key={mod.name}
                      className={cn(
                        "flex items-center gap-3 w-full rounded-xl px-2.5 py-2.5 text-left cursor-pointer transition-colors",
                        isModActive ? "text-foreground" : "hover:bg-slate-50 text-slate-700"
                      )}
                      style={isModActive ? { background: `${mod.color}12` } : {}}
                      onClick={() => { setOpenId(null); setLocation(dest); }}
                    >
                      <div
                        className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                        style={{ background: `${mod.color}18` }}
                      >
                        <mod.icon className="h-4 w-4" style={{ color: mod.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold leading-none" style={isModActive ? { color: mod.color } : {}}>
                          {mod.name}
                        </p>
                        {mod.subs.length > 0 && (
                          <p className="text-[10.5px] text-muted-foreground mt-0.5">{mod.subs.length} sections</p>
                        )}
                      </div>
                      {isModActive && (
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ background: mod.color }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
    </nav>
  );
}

// ─── SubMenu ──────────────────────────────────────────────────────────────────

export function SubMenu() {
  const [location] = useLocation();
  const active = useActiveNav();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const { hiddenTabs } = useModuleVisibility();
  const { modules: serverModules, loading: modulesLoading } = useContext(ModulesContext);

  const visibleSubs = active.subs.filter(sub => {
    const key = sub.tab ?? sub.page ?? sub.href ?? sub.name;
    if ((hiddenTabs[active.name] ?? []).includes(key)) return false;
    // If the sub-link belongs to a specific module, hide it when that module is
    // disabled. While loading, show all subs (route gating handles access control).
    if (sub.moduleKey && !modulesLoading && serverModules.length > 0) {
      const mod = serverModules.find(m => m.key === sub.moduleKey);
      if (mod && !mod.enabled) return false;
    }
    return true;
  });

  const currentTab  = params.get("tab")  ?? visibleSubs[0]?.tab  ?? "";
  const currentPage = params.get("page") ?? visibleSubs[0]?.page ?? "";

  if (visibleSubs.length === 0) return null;

  return (
    <div
      className="flex h-9 shrink-0 items-center px-4 gap-1 border-b overflow-x-auto scrollbar-none z-20"
      style={{ background: `${active.color}0c`, borderColor: `${active.color}22` }}
    >
      {visibleSubs.map((sub) => {
        const isActive = isSubActive(sub, location, currentTab, currentPage);
        return (
          <Link key={sub.name} href={getSubHref(sub, active)}>
            <div
              className={cn(
                "flex items-center rounded-md px-3 py-1 text-[12px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150",
                isActive ? "text-white shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-black/5"
              )}
              style={isActive ? { background: active.color } : {}}
            >
              {sub.name}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
