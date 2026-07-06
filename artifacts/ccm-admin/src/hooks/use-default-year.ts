import { useListAdminAcademicYears } from "@workspace/api-client-react";

/**
 * Returns the ID of the default academic year.
 * Falls back to the first year (lowest sortOrder) if none is explicitly flagged.
 */
export function useDefaultYear(): string {
  const { data: raw = [] } = useListAdminAcademicYears();
  const years = raw as any[];
  const def = years.find(y => y.isDefault) ?? years[0];
  return def?.id ?? "";
}
