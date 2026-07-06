import { useSearch, useLocation } from "wouter";
import { useEffect } from "react";
import { FinanceDashboard } from "./finance/FinanceDashboard";
import { FinanceReports } from "./finance/FinanceReports";

const VALID_TABS = ["dashboard", "reports", "collection"] as const;
type TabKey = typeof VALID_TABS[number];

export default function Finance() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const raw = new URLSearchParams(search).get("tab") ?? "dashboard";
  const tab = (VALID_TABS as readonly string[]).includes(raw) ? (raw as TabKey) : "dashboard";

  useEffect(() => {
    if (tab === "collection") {
      navigate("/fee-master?tab=collect");
    }
  }, [tab, navigate]);

  if (tab === "collection") return null;

  return (
    <div className="space-y-0">
      <div className="flex gap-1 border-b border-border mb-6">
        {([
          { key: "dashboard", label: "Dashboard" },
          { key: "reports",   label: "Financial Reports" },
        ] as { key: TabKey; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => navigate(`/finance?tab=${key}`)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <FinanceDashboard tab={tab} />}
      {tab === "reports"   && <FinanceReports />}
    </div>
  );
}
