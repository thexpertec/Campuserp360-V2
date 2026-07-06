import { LucideIcon, Construction } from "lucide-react";
import { cn } from "@/lib/utils";

interface Feature {
  name: string;
  description: string;
}

interface ModulePlaceholderProps {
  icon: LucideIcon;
  module: string;
  activeTab?: string;
  description: string;
  color?: string;
  features: Feature[];
}

export function ModulePlaceholder({
  icon: Icon,
  module,
  activeTab,
  description,
  color = "bg-primary/10 text-primary",
  features,
}: ModulePlaceholderProps) {
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">{module}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          <Construction className="h-3.5 w-3.5" />
          Under Development
        </span>
      </div>

      {activeTab && (
        <div className={cn("inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium", color)}>
          <Icon className="h-4 w-4" />
          {activeTab}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f) => (
          <div
            key={f.name}
            className="rounded-xl border border-border bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className={cn("mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg", color)}>
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-foreground text-sm">{f.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{f.description}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <Construction className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          This module is being built. Check back soon!
        </p>
      </div>
    </div>
  );
}
