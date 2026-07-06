import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label: labelOverride, className }: StatusBadgeProps) {
  let label = status;
  let variantClass = "bg-muted text-muted-foreground";

  switch (status.toLowerCase()) {
    case "received":
      label = "Received";
      variantClass = "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      break;
    case "under_review":
    case "pending_verification":
      label = status.toLowerCase() === "under_review" ? "Under Review" : "Pending Verification";
      variantClass = "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
      break;
    case "test_scheduled":
      label = "Test Scheduled";
      variantClass = "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      break;
    case "test_taken":
      label = "Test Taken";
      variantClass = "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300";
      break;
    case "interview_scheduled":
      label = "Interview Scheduled";
      variantClass = "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      break;
    case "interview_taken":
      label = "Interview Completed";
      variantClass = "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";
      break;
    case "result_announced":
      label = "Result Announced";
      variantClass = "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300";
      break;
    case "admitted":
      label = "Qualified";
      variantClass = "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      break;
    case "enrolled":
      label = "Enrolled";
      variantClass = "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300";
      break;
    case "on_hold":
      label = "On Hold";
      variantClass = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      break;
    case "rejected":
      label = "Rejected";
      variantClass = "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      break;
    default:
      label = status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      break;
  }

  return (
    <Badge variant="outline" className={cn("font-medium border-transparent", variantClass, className)}>
      {labelOverride ?? label}
    </Badge>
  );
}
