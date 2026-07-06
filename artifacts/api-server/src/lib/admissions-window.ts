import { db, admissionsSettingsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

export type AdmissionsWindow = {
  open: boolean;
  deadline: string | null;
  session: string | null;
};

function tenantKeys(tenantId: string) {
  return {
    open: `admissions_open:${tenantId}`,
    deadline: `admissions_deadline:${tenantId}`,
    session: `admissions_session:${tenantId}`,
  };
}

const LEGACY_KEYS = ["admissions_open", "admissions_deadline", "admissions_session"] as const;

/** Read per-tenant admissions window, falling back to legacy global keys once. */
export async function loadAdmissionsWindow(tenantId: string): Promise<AdmissionsWindow> {
  const keys = tenantKeys(tenantId);
  const allKeys = [...Object.values(keys), ...LEGACY_KEYS];

  const rows = await db
    .select()
    .from(admissionsSettingsTable)
    .where(inArray(admissionsSettingsTable.key, allKeys));

  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  const open =
    map[keys.open] !== undefined
      ? map[keys.open] === "true"
      : map["admissions_open"] !== undefined
        ? map["admissions_open"] === "true"
        : true;

  const deadline = map[keys.deadline] ?? map["admissions_deadline"] ?? null;
  const session = map[keys.session] ?? map["admissions_session"] ?? null;

  return { open, deadline, session };
}

/** Returns an error message when submissions are closed, or null when allowed. */
export function admissionsWindowBlockReason(window: AdmissionsWindow): string | null {
  if (!window.open) {
    return "Admissions are currently closed. Please check back later or contact the admissions office.";
  }
  if (window.deadline) {
    const deadlineEnd = new Date(`${window.deadline}T23:59:59.999Z`);
    if (!Number.isNaN(deadlineEnd.getTime()) && Date.now() > deadlineEnd.getTime()) {
      return "The admissions deadline has passed. New applications are no longer being accepted.";
    }
  }
  return null;
}

export async function upsertAdmissionsWindow(
  tenantId: string,
  patch: { open?: boolean; deadline?: string; session?: string },
): Promise<void> {
  const keys = tenantKeys(tenantId);
  const upsert = async (key: string, value: string) => {
    await db
      .insert(admissionsSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({
        target: admissionsSettingsTable.key,
        set: { value, updatedAt: new Date() },
      });
  };
  if (patch.open !== undefined) await upsert(keys.open, patch.open ? "true" : "false");
  if (patch.deadline !== undefined) await upsert(keys.deadline, patch.deadline);
  if (patch.session !== undefined) await upsert(keys.session, patch.session);
}
