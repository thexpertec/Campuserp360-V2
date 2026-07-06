import { useSearch } from "wouter";
import { lazy, Suspense } from "react";
import { LibraryDashboard } from "./library/LibraryDashboard";

const LibrarySetupTab = lazy(() =>
  import("./library/LibrarySetupTab").then(m => ({ default: m.LibrarySetupTab }))
);

const TAB_META: Record<string, { title: string; sub: string }> = {
  dashboard: { title: "Library",         sub: "Book catalog, issue tracking and overdue management." },
  catalog:   { title: "Book Catalog",    sub: "All books registered in the library." },
  issues:    { title: "Issue & Return",  sub: "Track book issues, returns, and fines." },
  setup:     { title: "Library — Setup", sub: "Configure categories and publishers." },
};

export default function Library() {
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
          <LibrarySetupTab />
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
        <LibraryDashboard tab={tab} />
      </div>
    );
  }

  return <LibraryDashboard tab={tab} />;
}
