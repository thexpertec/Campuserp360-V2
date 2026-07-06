import { useState } from "react";
import { Wand2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import GeneratePrintPage from "./printing/GeneratePrintPage";
import PrintHistoryTab   from "./printing/PrintHistoryTab";

type Tab = "generate" | "history";

export default function Printing() {
  const [tab, setTab] = useState<Tab>("generate");

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Tab bar ── */}
      <div className="shrink-0 border-b border-border bg-background px-5 flex items-end gap-1">
        {(
          [
            { id: "generate" as Tab, label: "Generate",      icon: Wand2  },
            { id: "history"  as Tab, label: "Print History", icon: Clock  },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "generate" ? <GeneratePrintPage /> : <PrintHistoryTab />}
      </div>
    </div>
  );
}
