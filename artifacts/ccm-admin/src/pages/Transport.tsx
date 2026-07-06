import { useSearch } from "wouter";
import { lazy, Suspense } from "react";
import { TransportDashboard } from "./transport/TransportDashboard";

const TransportSetupTab = lazy(() =>
  import("./transport/TransportSetupTab").then(m => ({ default: m.TransportSetupTab }))
);

const TAB_META: Record<string, { title: string; sub: string }> = {
  dashboard: { title: "Transport",         sub: "Fleet management, daily trips and route tracking." },
  trips:     { title: "Trips",             sub: "Log and manage daily trip records." },
  drivers:   { title: "Drivers",           sub: "Registered drivers with license details." },
  fleet:     { title: "Fleet",             sub: "Vehicle registry and today's assignment status." },
  setup:     { title: "Transport — Setup", sub: "Register vehicles and define transport routes." },
};

export default function Transport() {
  const search = useSearch();
  const tab = new URLSearchParams(search).get("tab") ?? "dashboard";
  const info = TAB_META[tab] ?? TAB_META.dashboard;

  if (tab === "setup") {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">{info.title}</h1>
          <p className="text-muted-foreground mt-1">{info.sub}</p>
        </div>
        <Suspense fallback={<div className="h-32 rounded-xl bg-slate-100 animate-pulse" />}>
          <TransportSetupTab />
        </Suspense>
      </div>
    );
  }

  if (tab !== "dashboard") {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">{info.title}</h1>
          <p className="text-muted-foreground mt-1">{info.sub}</p>
        </div>
        <TransportDashboard tab={tab} />
      </div>
    );
  }

  return <TransportDashboard tab={tab} />;
}
