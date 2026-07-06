import { db } from "@workspace/db";
import { admissionsSettingsTable, tenantsTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Global identifier pool: every tenant's slug, Applicant ID (candidate) prefix
// and Enrolled/Register ID (gr) prefix live in ONE case-insensitive pool.
// A code may belong to exactly one owner, with one exception: a tenant's own
// slug MAY equal its own prefixes (many existing tenants use slug "mirza" with
// prefix "MIRZA"), because same-tenant reuse is unambiguous. Within a tenant
// the gr and candidate prefixes must still differ from each other.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_GR_FORMAT = {
  prefix: "GR",
  separator: "-",
  includeYear: true,
  paddingDigits: "3",
  startingNumber: "1",
};

export const DEFAULT_CANDIDATE_FORMAT = {
  prefix: "CCM",
  separator: "-",
  includeYear: true,
  suffixStyle: "random",
  suffixLength: "6",
};

export type PrefixField = "gr" | "candidate" | "slug";

export type PrefixPoolEntry = {
  tenantId: string;
  tenantName: string | null;
  field: PrefixField;
  // Uppercased value for case-insensitive comparison.
  prefix: string;
};

export const PREFIX_FIELD_LABELS: Record<PrefixField, string> = {
  gr:        "Enrolled Student ID prefix",
  candidate: "Applicant ID prefix",
  slug:      "tenant slug",
};

// Loads the combined pool: all tenants' slugs + all saved ID-format prefixes.
export async function loadPrefixPool(): Promise<PrefixPoolEntry[]> {
  const [allRows, allTenants] = await Promise.all([
    db
      .select({ key: admissionsSettingsTable.key, value: admissionsSettingsTable.value })
      .from(admissionsSettingsTable)
      .where(sql`${admissionsSettingsTable.key} LIKE ${"gr_format:%"}`),
    db
      .select({ id: tenantsTable.id, name: tenantsTable.name, slug: tenantsTable.slug })
      .from(tenantsTable),
  ]);

  const nameById = new Map<string, string>();
  const pool: PrefixPoolEntry[] = [];

  for (const t of allTenants) {
    const id = String(t.id);
    nameById.set(id, t.name);
    const slug = String(t.slug ?? "").trim().toUpperCase();
    if (slug) pool.push({ tenantId: id, tenantName: t.name, field: "slug", prefix: slug });
  }

  for (const row of allRows) {
    const rowTenantId = row.key.replace("gr_format:", "");
    const tenantName = nameById.get(rowTenantId) ?? null;
    try {
      const fmt = JSON.parse(row.value);
      const grPrefix = String(fmt.prefix ?? "").trim().toUpperCase();
      if (grPrefix) pool.push({ tenantId: rowTenantId, tenantName, field: "gr", prefix: grPrefix });
      const candPrefix = String(fmt.candidate?.prefix ?? "").trim().toUpperCase();
      if (candPrefix) pool.push({ tenantId: rowTenantId, tenantName, field: "candidate", prefix: candPrefix });
    } catch {}
  }
  return pool;
}

// Finds a conflicting entry for `value` being saved as `field` by `tenantId`.
// Rules (all case-insensitive; `value` must already be uppercased):
//   - Any match owned by ANOTHER tenant conflicts, regardless of field.
//   - Within the SAME tenant: the same field never self-conflicts, and the
//     slug is allowed to equal the tenant's own prefixes (and vice versa) —
//     only the gr↔candidate sibling pair conflicts.
export function findPrefixConflict(
  pool: PrefixPoolEntry[],
  tenantId: string,
  field: PrefixField,
  value: string,
): PrefixPoolEntry | undefined {
  return pool.find((e) => {
    if (e.prefix !== value) return false;
    if (e.tenantId !== tenantId) return true;
    // Same tenant: only gr↔candidate collisions matter.
    return e.field !== field && e.field !== "slug" && field !== "slug";
  });
}

// Per-tenant saved prefixes (with defaults) for the SaaS Admin tenant list.
export async function loadTenantPrefixes(): Promise<
  Map<string, { applicantPrefix: string; enrolledPrefix: string }>
> {
  const rows = await db
    .select({ key: admissionsSettingsTable.key, value: admissionsSettingsTable.value })
    .from(admissionsSettingsTable)
    .where(sql`${admissionsSettingsTable.key} LIKE ${"gr_format:%"}`);

  const map = new Map<string, { applicantPrefix: string; enrolledPrefix: string }>();
  for (const row of rows) {
    const tenantId = row.key.replace("gr_format:", "");
    let enrolledPrefix = DEFAULT_GR_FORMAT.prefix;
    let applicantPrefix = DEFAULT_CANDIDATE_FORMAT.prefix;
    try {
      const fmt = JSON.parse(row.value);
      const gr = String(fmt.prefix ?? "").trim().toUpperCase();
      if (gr) enrolledPrefix = gr;
      const cand = String(fmt.candidate?.prefix ?? "").trim().toUpperCase();
      if (cand) applicantPrefix = cand;
    } catch {}
    map.set(tenantId, { applicantPrefix, enrolledPrefix });
  }
  return map;
}
