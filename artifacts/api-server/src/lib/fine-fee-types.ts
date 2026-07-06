import { db } from "@workspace/db";
import { feeTypesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { syncFeeTypeCoa } from "./coa-sync";

/**
 * The two built-in "system" fine fee types.
 *
 * These are wired into the Chart of Accounts (income accounts under 4000) and
 * the fine-calculation logic, which look them up by their fixed fee codes.
 * They must exist in every tenant and must never be deleted, so this list is the
 * single source of truth referenced by the seeding, the delete/update guards and
 * the ensure-fine-fee-types helper.
 */
export const FINE_FEE_TYPES = [
  { code: "attendance-fine", name: "Attendance Fine", category: "non-tuition" },
  { code: "late-fee-fine",   name: "Late Fee Fine",   category: "non-tuition" },
] as const;

/** Set of protected fee codes for O(1) membership checks in guards. */
export const FINE_FEE_CODES: ReadonlySet<string> = new Set(FINE_FEE_TYPES.map((f) => f.code));

/** True if the given fee code identifies a non-deletable system fine fee type. */
export function isSystemFeeCode(feeCode: string | null | undefined): boolean {
  return !!feeCode && FINE_FEE_CODES.has(feeCode);
}

/**
 * Ensure the two built-in fine fee types exist for a tenant, each linked to its
 * COA income account under 4000 (Fee Income). Idempotent — safe to call on both
 * new-tenant provisioning and as a startup backfill for existing tenants.
 *
 * Returns a map: feeCode → feeTypeId
 */
export async function ensureFineFeeTypes(tenantId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  for (const ft of FINE_FEE_TYPES) {
    const existing = await db
      .select({ id: feeTypesTable.id, coaId: feeTypesTable.coaId })
      .from(feeTypesTable)
      .where(and(eq(feeTypesTable.tenantId, tenantId), eq(feeTypesTable.feeCode, ft.code)))
      .limit(1);

    if (existing.length) {
      map.set(ft.code, existing[0].id);
      // Backfill the COA income account if a legacy row was created before COA sync.
      if (!existing[0].coaId) {
        await syncFeeTypeCoa(
          { id: existing[0].id, name: ft.name, feeCategory: ft.category, feeCode: ft.code },
          tenantId,
        );
      }
    } else {
      const [created] = await db
        .insert(feeTypesTable)
        .values({
          tenantId,
          name: ft.name,
          feeCategory: ft.category,
          feeCode: ft.code,
          duration: "single",
          active: true,
          sortOrder: 999,
        })
        .returning({ id: feeTypesTable.id });
      map.set(ft.code, created.id);
      await syncFeeTypeCoa(
        { id: created.id, name: ft.name, feeCategory: ft.category, feeCode: ft.code },
        tenantId,
      );
    }
  }

  return map;
}
