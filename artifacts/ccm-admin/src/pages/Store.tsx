import { useSearch } from "wouter";
import { StoreItemsTab } from "./store/StoreItemsTab";
import { StoreCategoryTab } from "./store/StoreCategoryTab";
import { StoreUnitsTab } from "./store/StoreUnitsTab";
import { StoreDashboard } from "./store/StoreDashboard";

type Tab = "dashboard" | "items" | "categorization" | "units";

export default function Store() {
  const search = useSearch();
  const tab = (new URLSearchParams(search).get("tab") ?? "dashboard") as Tab;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">Store &amp; Inventory</h1>
        <p className="text-muted-foreground mt-1">Manage inventory items, categories and units of measure.</p>
      </div>

      {tab === "dashboard"      && <StoreDashboard />}
      {tab === "items"          && <StoreItemsTab />}
      {tab === "categorization" && <StoreCategoryTab />}
      {tab === "units"          && <StoreUnitsTab />}
    </div>
  );
}
