import { useSearch } from "wouter";
import { HRDashboard } from "./hr/HRDashboard";
import { HRSetupTab } from "./hr/HRSetupTab";
import { HRCareersTab } from "./hr/HRCareersTab";

const VALID_TABS = ["dashboard", "attendance", "leave", "payroll", "setup", "careers"] as const;
type TabKey = typeof VALID_TABS[number];

export default function HR() {
  const search = useSearch();
  const raw    = new URLSearchParams(search).get("tab") ?? "dashboard";
  const tab    = (VALID_TABS as readonly string[]).includes(raw) ? (raw as TabKey) : "dashboard";

  return (
    <div className="space-y-0 max-w-7xl mx-auto">
      <div className="pb-6">
        <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">
          {tab === "setup"   ? "HR — Setup"
          : tab === "careers" ? "HR — Careers"
          : "Human Resources"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {tab === "setup"
            ? "Configure departments, designations and salary grades."
            : tab === "careers"
            ? "Manage open positions and review career applications."
            : "Manage staff, attendance, leave and payroll."}
        </p>
      </div>

      {tab === "setup"    ? <HRSetupTab />
      : tab === "careers" ? <HRCareersTab />
      : <HRDashboard tab={tab} />}
    </div>
  );
}
