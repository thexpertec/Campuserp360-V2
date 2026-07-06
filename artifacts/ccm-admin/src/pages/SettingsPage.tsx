import { useSearch } from "wouter";
import { Building2, Users, Bell, Database, Hash, Printer, Layers, Sparkles, CreditCard, Receipt } from "lucide-react";
import { GeneralTab } from "./settings/GeneralTab";
import { UsersTab } from "./settings/UsersTab";
import { NotificationsTab } from "./settings/NotificationsTab";
import { BackupTab } from "./settings/BackupTab";
import { IdFormatTab } from "./settings/IdFormatTab";
import { PrintTab } from "./settings/PrintTab";
import { ModulesTab } from "./settings/ModulesTab";
import { SeedDataTab } from "./settings/SeedDataTab";
import { PaymentGatewayTab } from "./settings/PaymentGatewayTab";
import { ChallanTab } from "./settings/ChallanTab";
import { getUser } from "@/lib/auth";

const ALL_TABS = [
  { key: "general",         label: "General",          icon: Building2,  component: GeneralTab,        desc: "Institution identity, contact details, and system preferences.",   superAdminOnly: false },
  { key: "id-format",       label: "ID Format",        icon: Hash,       component: IdFormatTab,       desc: "Configure Applicant ID and Register ID formats for candidates and enrolled students.", superAdminOnly: false },
  { key: "users",           label: "Users & Roles",    icon: Users,      component: UsersTab,          desc: "Admin accounts, roles, and module-level access control.",          superAdminOnly: true },
  { key: "modules",         label: "Modules",          icon: Layers,     component: ModulesTab,        desc: "Show or hide navigation modules and their sections for all admin users.", superAdminOnly: false },
  { key: "notifications",   label: "Notifications",    icon: Bell,       component: NotificationsTab,  desc: "SMS and email channel configuration and per-event templates.",      superAdminOnly: false },
  { key: "payment-gateway", label: "Payment Gateway",  icon: CreditCard, component: PaymentGatewayTab, desc: "JazzCash and PayFast merchant credentials and sandbox/live mode toggle.", superAdminOnly: false },
  { key: "challan",         label: "Fee Challan",      icon: Receipt,    component: ChallanTab,        desc: "Institution contact info and display options printed on fee vouchers.", superAdminOnly: false },
  { key: "backup",          label: "Backup",           icon: Database,   component: BackupTab,         desc: "Scheduled and manual backups, history, and restore.",              superAdminOnly: false },
  { key: "print",           label: "Print & PDF",      icon: Printer,    component: PrintTab,          desc: "Background image and page layout for report and data-table prints (student lists, registers, etc.). Document templates such as vouchers, ID cards, and certificates are configured in the Template Builder.", superAdminOnly: false },
  { key: "seed",            label: "Demo Data",        icon: Sparkles,   component: SeedDataTab,       desc: "Load realistic sample data into all modules for testing and demonstration purposes.", superAdminOnly: false },
];

export default function SettingsPage() {
  const search = useSearch();
  const tab = new URLSearchParams(search).get("tab") ?? "general";

  const user = getUser();
  const isSuperAdmin = user?.isSuperAdmin ?? false;
  const isSettingsChecker = isSuperAdmin || (user?.roles?.some((r: { module: string; permission: string }) =>
    (r.module === "settings" || r.module === "*") && r.permission === "post"
  ) ?? false);
  const TABS = ALL_TABS.filter(t => {
    if (!t.superAdminOnly) return true;
    return isSettingsChecker;
  });

  const active = TABS.find((t) => t.key === tab) ?? TABS[0]!;
  const ActiveComponent = active.component;
  const Icon = active.icon;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-slate-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight">{active.label}</h1>
          <p className="text-xs text-muted-foreground">{active.desc}</p>
        </div>
      </div>

      <ActiveComponent />
    </div>
  );
}
