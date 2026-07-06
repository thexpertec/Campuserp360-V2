import { useQuery } from "@tanstack/react-query";
import { User, CheckCircle2 } from "lucide-react";
import { getToken } from "@/lib/auth";
import { formatDate } from "@/lib/locale";

const API = (import.meta.env.VITE_API_BASE as string) || "";

export async function resolveNames(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const res = await fetch(
    `${API}/api/admin/admin-users/resolve-names?ids=${ids.join(",")}`,
    { headers: { Authorization: `Bearer ${getToken() ?? ""}` } },
  );
  if (!res.ok) return {};
  return res.json() as Promise<Record<string, string>>;
}

function fmtDate(iso?: string | null) {
  if (!iso) return null;
  return formatDate(iso);
}

interface AuditStampProps {
  preparedLabel?: string;
  preparedById?: string | null;
  preparedAt?: string | null;
  approvedLabel?: string;
  approvedById?: string | null;
  approvedAt?: string | null;
}

/** Resolves a list of admin user IDs to a name map in a single query. */
export function useAdminNames(ids: (string | null | undefined)[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean) as string[])];
  const { data = {} } = useQuery<Record<string, string>>({
    queryKey: ["admin-names", ...uniqueIds.sort()],
    queryFn: () => resolveNames(uniqueIds),
    enabled: uniqueIds.length > 0,
    staleTime: 300_000,
  });
  return data;
}

export function AuditStamp({
  preparedLabel = "Prepared by",
  preparedById,
  preparedAt,
  approvedLabel = "Approved by",
  approvedById,
  approvedAt,
}: AuditStampProps) {
  const ids = [preparedById, approvedById].filter(Boolean) as string[];

  const { data: names = {} } = useQuery<Record<string, string>>({
    queryKey: ["admin-names", ...ids.sort()],
    queryFn: () => resolveNames(ids),
    enabled: ids.length > 0,
    staleTime: 300_000,
  });

  if (!preparedById && !approvedById) return null;

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      {preparedById && (
        <span className="flex items-center gap-1.5">
          <User className="h-3 w-3 shrink-0" />
          <span className="font-medium text-foreground/70">{preparedLabel}:</span>
          <span>{names[preparedById] ?? <em>Unknown</em>}</span>
          {preparedAt && (
            <span className="opacity-60">· {fmtDate(preparedAt)}</span>
          )}
        </span>
      )}
      {approvedById && (
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
          <span className="font-medium text-foreground/70">{approvedLabel}:</span>
          <span>{names[approvedById] ?? <em>Unknown</em>}</span>
          {approvedAt && (
            <span className="opacity-60">· {fmtDate(approvedAt)}</span>
          )}
        </span>
      )}
    </div>
  );
}
