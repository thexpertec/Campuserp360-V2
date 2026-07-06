import { useSearch } from "wouter";
import { SportsDashboard } from "./sports/SportsDashboard";

const TAB_META: Record<string, { title: string; sub: string }> = {
  dashboard: { title: "Sports",                sub: "Teams, fixtures and co-curricular activities." },
  teams:     { title: "Teams & Squads",         sub: "All registered sports teams." },
  fixtures:  { title: "Fixtures",               sub: "Upcoming and completed match fixtures." },
  setup:     { title: "Sports — Setup",         sub: "Configure sport categories and venues." },
};

export default function Sports() {
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
      <SportsDashboard tab={tab} />
    </div>
  );
}
