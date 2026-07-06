import { useSearch } from "wouter";
import { GateDashboard } from "./gate/GateDashboard";

const TAB_META: Record<string, { title: string; sub: string }> = {
  dashboard: { title: "Gate Security",        sub: "Campus entry/exit log and cadet out-passes." },
  log:       { title: "Entry / Exit Log",     sub: "Daily gate log for all persons entering or leaving campus." },
  outpass:   { title: "Cadet Out-Passes",     sub: "Leave passes issued to cadets for going off campus." },
};

export default function GateSecurity() {
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
      <GateDashboard tab={tab} />
    </div>
  );
}
