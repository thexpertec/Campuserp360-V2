import {
  db,
  academicYearsTable,
  classesTable,
  sectionsTable,
  housesTable,
} from "@workspace/db";
import { and, eq, count } from "drizzle-orm";

export type AcademicSetupCheck = { complete: boolean; missing: string[] };

/**
 * Verifies that the mandatory Academic Setup master data exists before a student
 * can be enrolled. A tenant must have at least one active Academic Year, Class,
 * Section and House configured. Returns the list of missing configurations so the
 * caller can surface a clear, specific message.
 *
 * When `tenantId` is present, counts are scoped to that tenant (mirroring how the
 * config list endpoints scope), so the backend gate matches exactly what the
 * frontend dropdowns show.
 */
export async function checkAcademicSetup(
  tenantId: string | null | undefined,
): Promise<AcademicSetupCheck> {
  const tid = tenantId ?? null;

  async function activeCount(table: any, activeCol: any, tenantCol: any): Promise<number> {
    const conds: any[] = [eq(activeCol, true)];
    if (tid) conds.push(eq(tenantCol, tid));
    const [row] = await db.select({ n: count() }).from(table).where(and(...conds));
    return row?.n ?? 0;
  }

  const [years, classes, sections, houses] = await Promise.all([
    activeCount(academicYearsTable, academicYearsTable.active, academicYearsTable.tenantId),
    activeCount(classesTable, classesTable.active, classesTable.tenantId),
    activeCount(sectionsTable, sectionsTable.active, sectionsTable.tenantId),
    activeCount(housesTable, housesTable.active, housesTable.tenantId),
  ]);

  const missing: string[] = [];
  if (!years) missing.push("Academic Year");
  if (!classes) missing.push("Class");
  if (!sections) missing.push("Section");
  if (!houses) missing.push("House");

  return { complete: missing.length === 0, missing };
}

export function academicSetupErrorMessage(missing: string[]): string {
  return `Academic setup incomplete. Configure the following before enrolling students: ${missing.join(", ")}.`;
}
