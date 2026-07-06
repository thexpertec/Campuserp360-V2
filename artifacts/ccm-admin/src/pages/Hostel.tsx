import { useSearch } from "wouter";
import { HostelDashboard } from "./hostel/HostelDashboard";
import { HostelSetupTab } from "./hostel/HostelSetupTab";

export default function Hostel() {
  const search = useSearch();
  const tab = new URLSearchParams(search).get("tab") ?? "dashboard";

  if (tab === "setup") {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">Hostel — Setup</h1>
          <p className="text-muted-foreground mt-1">Configure dormitory blocks and room types.</p>
        </div>
        <HostelSetupTab />
      </div>
    );
  }

  return <HostelDashboard tab={tab} />;
}
