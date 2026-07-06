import { useSearch } from "wouter";
import { ExamsDashboard } from "./examinations/ExamsDashboard";
import { ExamsSetupTab } from "./examinations/ExamsSetupTab";
import { ExamsScheduleTab } from "./examinations/ExamsScheduleTab";
import { ExamsResultsTab } from "./examinations/ExamsResultsTab";
import { ExamsReportCardTab } from "./examinations/ExamsReportCardTab";
import { ExamsDateSheetTab } from "./examinations/ExamsDateSheetTab";
import { ExamsMasterDateSheetTab } from "./examinations/ExamsMasterDateSheetTab";
import {
  LayoutDashboard, CalendarDays, BarChart3, FileText, Settings2, CalendarRange, LayoutGrid,
} from "lucide-react";

const TABS = [
  { key: "dashboard",       label: "Dashboard",        icon: LayoutDashboard },
  { key: "schedule",        label: "Schedule",          icon: CalendarDays    },
  { key: "master-datesheet",label: "Master Datesheet",  icon: LayoutGrid      },
  { key: "date-sheet",      label: "Date Sheet",        icon: CalendarRange   },
  { key: "results",         label: "Results Entry",     icon: BarChart3       },
  { key: "report-cards",    label: "Report Cards",      icon: FileText        },
  { key: "setup",           label: "Setup",             icon: Settings2       },
] as const;

type TabKey = typeof TABS[number]["key"];

const TAB_SUBTITLE: Record<TabKey, string> = {
  dashboard:           "Overview of exam schedules, upcoming sittings and grade scale.",
  schedule:            "Create and manage exam sittings by class, subject and exam type.",
  "master-datesheet":  "Plan the whole datesheet on one grid — all classes, drag & drop subjects, shuffle combinations.",
  results:             "Select an exam and enter marks for each student in the class.",
  "report-cards":      "View class results, rankings and print individual report cards.",
  "date-sheet":        "Printable date sheet showing all exams grouped by date.",
  setup:               "Configure exam types, grading scales and grade bands.",
};

export default function Examinations() {
  const search = useSearch();
  const raw    = new URLSearchParams(search).get("tab") ?? "dashboard";
  const tab    = TABS.some(t => t.key === raw) ? (raw as TabKey) : "dashboard";

  return (
    <div className="space-y-0 max-w-7xl mx-auto">
      <div className="pb-6">
        <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">Examinations</h1>
        <p className="text-muted-foreground mt-1 text-sm">{TAB_SUBTITLE[tab]}</p>
      </div>

      {tab === "dashboard"        && <ExamsDashboard />}
      {tab === "schedule"         && <ExamsScheduleTab />}
      {tab === "master-datesheet" && <ExamsMasterDateSheetTab />}
      {tab === "results"          && <ExamsResultsTab />}
      {tab === "report-cards"     && <ExamsReportCardTab />}
      {tab === "date-sheet"       && <ExamsDateSheetTab />}
      {tab === "setup"            && <ExamsSetupTab />}
    </div>
  );
}
