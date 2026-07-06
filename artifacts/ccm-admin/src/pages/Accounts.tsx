import { useSearch, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { BankAccounts } from "./accounts/BankAccounts";
import { SetupCOA } from "./accounts/SetupCOA";
import { VouchersList } from "./accounts/VouchersList";
import { JournalEntries } from "./finance/JournalEntries";
import { Settings2, Network, Receipt, BookOpen } from "lucide-react";

const TABS = [
  {
    key:   "setup",
    label: "Setup",
    icon:  Settings2,
    desc:  "Configure cash and bank accounts used for payments and receipts.",
  },
  {
    key:   "coa",
    label: "COA",
    icon:  Network,
    desc:  "Chart of Accounts — account hierarchy for income and expense tracking.",
  },
  {
    key:   "vouchers",
    label: "Vouchers",
    icon:  Receipt,
    desc:  "Receipt & Payment vouchers — draft, then post the journal entry.",
  },
  {
    key:   "journal-entries",
    label: "Journal Entries",
    icon:  BookOpen,
    desc:  "View, create and manage manual double-entry journal postings.",
  },
] as const;

type TabKey = typeof TABS[number]["key"];

const TAB_ACTIVE: Record<TabKey, string> = {
  setup:             "border-slate-900   text-slate-900",
  coa:               "border-indigo-600  text-indigo-700",
  vouchers:          "border-emerald-600 text-emerald-700",
  "journal-entries": "border-violet-600  text-violet-700",
};

const TAB_ICON_BG: Record<TabKey, string> = {
  setup:             "bg-slate-100   text-slate-600",
  coa:               "bg-indigo-100  text-indigo-600",
  vouchers:          "bg-emerald-100 text-emerald-600",
  "journal-entries": "bg-violet-100  text-violet-600",
};

export default function Accounts() {
  const search  = useSearch();
  const [, nav] = useLocation();

  const raw = new URLSearchParams(search).get("tab") ?? "setup";
  const legacyMap: Record<string, TabKey> = {
    "bank-accounts":   "setup",
    "setup-coa":       "coa",
    "overview":        "setup",
    "journal":         "coa",
    "ledger":          "coa",
    "trial":           "coa",
    "payment":         "vouchers",
  };
  const tab = (legacyMap[raw] ?? (TABS.some(t => t.key === raw) ? raw : "setup")) as TabKey;
  const activeTab = TABS.find(t => t.key === tab)!;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0", TAB_ICON_BG[tab])}>
          <activeTab.icon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Accounts &mdash; {activeTab.label}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{activeTab.desc}</p>
        </div>
      </div>

      <div className="flex gap-0 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => nav(`/accounts?tab=${t.key}`, { replace: true })}
            className={cn(
              "flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap -mb-px",
              tab === t.key
                ? TAB_ACTIVE[t.key]
                : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300",
            )}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "setup"            && <BankAccounts />}
        {tab === "coa"              && <SetupCOA />}
        {tab === "vouchers"         && <VouchersList />}
        {tab === "journal-entries"  && <JournalEntries />}
      </div>
    </div>
  );
}
