import { useSearch } from "wouter";
import { EventsDashboard } from "./EventsDashboard";
import { EventsListTab } from "./EventsListTab";
import { EventsCalendarTab } from "./EventsCalendarTab";
import { EventsSetupTab } from "./EventsSetupTab";
import { EventsBulkTab } from "./EventsBulkTab";

export default function Events() {
  const search = useSearch();
  const tab = new URLSearchParams(search).get("tab") ?? "dashboard";

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Events Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Schedule and track all college events</p>
      </div>

      {tab === "dashboard" && <EventsDashboard />}
      {tab === "list"      && <EventsListTab />}
      {tab === "bulk"      && <EventsBulkTab />}
      {tab === "calendar"  && <EventsCalendarTab />}
      {tab === "setup"     && <EventsSetupTab />}
    </div>
  );
}
