import { db, studentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

/** True when a tenant-scoped student row exists for this application. */
export async function hasStudentRecord(
  applicationId: string,
  tenantId: string | null,
): Promise<boolean> {
  const conditions = [eq(studentsTable.applicationId, applicationId)];
  if (tenantId) {
    conditions.push(eq(studentsTable.tenantId, tenantId));
  }
  const [row] = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(and(...conditions))
    .limit(1);
  return !!row;
}

/** Authoritative enrolled check — student record OR legacy status flag. */
export function isApplicationEnrolled(status: string, hasStudent: boolean): boolean {
  return hasStudent || status === "enrolled";
}

/** Returns true when pipeline mutations must be blocked for this application. */
export async function isApplicationLocked(
  applicationId: string,
  status: string,
  tenantId: string | null,
): Promise<boolean> {
  if (status === "enrolled") return true;
  return hasStudentRecord(applicationId, tenantId);
}
