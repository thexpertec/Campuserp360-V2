import { cn } from "@/lib/utils";

export type StatusVariant = "selected" | "wait" | "not" | "pending" | "paid";

const STYLES: Record<StatusVariant, string> = {
  selected: "bg-emerald-100 text-emerald-800 border-emerald-300",
  wait: "bg-amber-100 text-amber-800 border-amber-300",
  not: "bg-rose-100 text-rose-800 border-rose-300",
  pending: "bg-indigo-100 text-indigo-800 border-indigo-300",
  paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

export default function StatusBadge({
  variant,
  children,
  className,
}: {
  variant: StatusVariant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-bold border",
        STYLES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
