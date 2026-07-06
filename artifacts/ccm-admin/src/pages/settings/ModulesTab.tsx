import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { NAV } from "@/components/layout/HeaderSidebar";
import { loadModuleVisibility, saveModuleVisibility, type ModuleVisibilityConfig } from "@/lib/module-visibility";

const PROTECTED = new Set(["Dashboard", "Settings"]);

const UI_GROUPS: { label: string; color: string; modules: string[] }[] = [
  { label: "Admissions",  color: "#7c3aed", modules: ["Admissions"]                                                        },
  { label: "Academics",   color: "#059669", modules: ["Academic Setup","Timetable","Exams & Results","Syllabus"]            },
  { label: "Students",    color: "#2563eb", modules: ["Students"]                                                          },
  { label: "Finance",     color: "#16a34a", modules: ["Finance"]                                                           },
  { label: "HRM",         color: "#db2777", modules: ["HRM"]                                                               },
  { label: "Inventory",   color: "#c2410c", modules: ["Inventory"]                                                         },
  { label: "Campus Life", color: "#f97316", modules: ["Hostel","Transport","Library","Sick Bay","Sports","Gate Security","Events"] },
  { label: "Additionals", color: "#9333ea", modules: ["Communication","Website","Media Library","Printing"]                      },
  { label: "Approvals",   color: "#d97706", modules: ["Approvals"]                                                               },
];

export function ModulesTab() {
  const { toast } = useToast();
  const [config, setConfig] = useState<ModuleVisibilityConfig>(loadModuleVisibility);
  const [expanded, setExpanded] = useState<string | null>(null);

  const isModuleHidden = (name: string) => config.hiddenModules.includes(name);
  const isTabHidden = (moduleName: string, key: string) =>
    config.hiddenTabs[moduleName]?.includes(key) ?? false;

  const persist = (next: ModuleVisibilityConfig) => {
    setConfig(next);
    saveModuleVisibility(next);
  };

  const toggleModule = (name: string) => {
    const wasHidden = isModuleHidden(name);
    persist({
      ...config,
      hiddenModules: wasHidden
        ? config.hiddenModules.filter(m => m !== name)
        : [...config.hiddenModules, name],
    });
    toast({ description: `${name} ${wasHidden ? "shown" : "hidden"} in navigation` });
  };

  const toggleTab = (moduleName: string, key: string) => {
    const current = config.hiddenTabs[moduleName] ?? [];
    const isHidden = current.includes(key);
    persist({
      ...config,
      hiddenTabs: {
        ...config.hiddenTabs,
        [moduleName]: isHidden ? current.filter(t => t !== key) : [...current, key],
      },
    });
  };

  const allToggleable = NAV.filter(n => !PROTECTED.has(n.name));
  const hiddenCount  = config.hiddenModules.length;
  const visibleCount = allToggleable.length - hiddenCount;

  return (
    <div className="space-y-5">

      {/* Summary bar */}
      <div className="flex items-center justify-between px-5 py-3.5 rounded-xl bg-slate-50 border border-border">
        <div>
          <p className="text-sm font-semibold">Module Visibility</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Show or hide modules and their sections in the navigation bar.
            Changes take effect immediately.
          </p>
        </div>
        <div className="flex gap-2 shrink-0 ml-4">
          <Badge variant="outline" className="text-xs font-semibold text-emerald-700 border-emerald-200 bg-emerald-50">
            {visibleCount} visible
          </Badge>
          {hiddenCount > 0 && (
            <Badge variant="outline" className="text-xs font-semibold text-slate-500 border-slate-200 bg-slate-50">
              {hiddenCount} hidden
            </Badge>
          )}
        </div>
      </div>

      {/* Module groups */}
      {UI_GROUPS.map(group => {
        const groupMods = group.modules
          .map(name => NAV.find(n => n.name === name))
          .filter((m): m is typeof NAV[0] => m !== undefined);

        return (
          <div key={group.label} className="rounded-xl border border-border overflow-hidden">
            {/* Group header */}
            <div className="flex items-center gap-2.5 px-4 py-2 bg-slate-50 border-b border-border">
              <div className="h-2 w-2 rounded-full shrink-0" style={{ background: group.color }} />
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </span>
            </div>

            {/* Module rows */}
            <div className="divide-y divide-border bg-card">
              {groupMods.map(mod => {
                const hidden   = isModuleHidden(mod.name);
                const hasTabs  = mod.subs.length > 0;
                const isOpen   = expanded === mod.name;
                const hiddenTc = config.hiddenTabs[mod.name]?.length ?? 0;

                return (
                  <div key={mod.name}>
                    {/* Module row */}
                    <div
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 transition-opacity",
                        hidden && "opacity-40"
                      )}
                    >
                      <div
                        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${mod.color}18` }}
                      >
                        <mod.icon className="h-4 w-4" style={{ color: mod.color }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium">{mod.name}</span>
                          {hiddenTc > 0 && !hidden && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-slate-500 border-slate-300">
                              {hiddenTc} section{hiddenTc > 1 ? "s" : ""} hidden
                            </Badge>
                          )}
                        </div>
                        {hasTabs && !hidden && (
                          <p className="text-[11px] text-muted-foreground">
                            {mod.subs.length} sections
                          </p>
                        )}
                      </div>

                      <Switch
                        checked={!hidden}
                        onCheckedChange={() => toggleModule(mod.name)}
                        className="shrink-0"
                      />

                      {hasTabs && !hidden ? (
                        <button
                          onClick={() => setExpanded(isOpen ? null : mod.name)}
                          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                          title="Toggle sections"
                        >
                          {isOpen
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      ) : (
                        <div className="h-6 w-6 shrink-0" />
                      )}
                    </div>

                    {/* Sub-tab panel */}
                    {isOpen && !hidden && (
                      <div className="px-4 pt-2 pb-3.5 bg-slate-50/70 border-t border-dashed border-border">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                          Sections
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {mod.subs.map(sub => {
                            const key = sub.tab ?? sub.href ?? sub.name;
                            const tabHidden = isTabHidden(mod.name, key);
                            return (
                              <div
                                key={key}
                                className={cn(
                                  "flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-background text-xs transition-opacity",
                                  tabHidden && "opacity-40"
                                )}
                              >
                                <span className="font-medium truncate">{sub.name}</span>
                                <Switch
                                  checked={!tabHidden}
                                  onCheckedChange={() => toggleTab(mod.name, key)}
                                  className="scale-[0.7] shrink-0 origin-right"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Core / always-on */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-2 bg-slate-50 border-b border-border">
          <div className="h-2 w-2 rounded-full shrink-0 bg-slate-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Core — Always Visible
          </span>
        </div>
        <div className="divide-y divide-border bg-card">
          {["Dashboard", "Settings"].map(name => {
            const mod = NAV.find(n => n.name === name);
            if (!mod) return null;
            return (
              <div key={name} className="flex items-center gap-3 px-4 py-3">
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${mod.color}18` }}
                >
                  <mod.icon className="h-4 w-4" style={{ color: mod.color }} />
                </div>
                <p className="flex-1 text-sm font-medium">{mod.name}</p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground pr-1">
                  <Lock className="h-3 w-3" />
                  <span>Always on</span>
                </div>
                <div className="h-6 w-6 shrink-0" />
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
