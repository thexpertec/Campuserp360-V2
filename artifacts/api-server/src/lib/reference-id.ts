import { db, admissionsSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { DEFAULT_CANDIDATE_FORMAT } from "./prefix-pool.js";

const REF_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Load the tenant's configured applicant reference-ID prefix (falls back to CCM). */
export async function loadCandidateReferencePrefix(tenantId: string): Promise<string> {
  const [row] = await db
    .select({ value: admissionsSettingsTable.value })
    .from(admissionsSettingsTable)
    .where(eq(admissionsSettingsTable.key, `gr_format:${tenantId}`))
    .limit(1);

  if (row) {
    try {
      const parsed = JSON.parse(row.value) as { candidate?: { prefix?: string } };
      const prefix = String(parsed?.candidate?.prefix ?? DEFAULT_CANDIDATE_FORMAT.prefix)
        .trim()
        .toUpperCase();
      if (prefix) return prefix;
    } catch {
      // fall through to default
    }
  }

  return DEFAULT_CANDIDATE_FORMAT.prefix;
}

/** Build a random applicant reference ID using the tenant prefix. */
export function buildReferenceId(prefix: string, year = new Date().getFullYear()): string {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += REF_ID_ALPHABET[Math.floor(Math.random() * REF_ID_ALPHABET.length)];
  }
  return `${prefix}-${year}-${suffix}`;
}
