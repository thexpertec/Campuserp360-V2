import { useSearch } from "wouter";
import { MedicalDashboard } from "./medical/MedicalDashboard";

const TAB_META: Record<string, { title: string; sub: string }> = {
  dashboard: { title: "Sick Bay & Medical",         sub: "Patient visits, admissions and health tracking." },
  "sick-bay": { title: "Sick Bay Log",              sub: "Daily log of patient visits and admissions." },
  patients:   { title: "Patient Visits",            sub: "All sick bay patient records." },
  setup:      { title: "Medical — Setup",           sub: "Configure ailment types, medications and conditions." },
};

export default function Medical() {
  const search = useSearch();
  const tab = new URLSearchParams(search).get("tab") ?? "dashboard";
  const info = TAB_META[tab] ?? TAB_META.dashboard;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {tab !== "dashboard" && (
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">{info.title}</h1>
          <p className="text-muted-foreground mt-1">{info.sub}</p>
        </div>
      )}
      <MedicalDashboard tab={tab} />
    </div>
  );
}
