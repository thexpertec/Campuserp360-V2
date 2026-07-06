import { z } from "zod";
import { Router, type Request, type Response } from "express";
import { db, pool } from "@workspace/db";
import { withTenantCtx } from "../lib/tenant";
import {
  feeTypesTable,
  feeScheduleTable,
  feeChallansTable,
  studentFeeOverridesTable,
  fineRulesTable,
  studentsTable,
  studentEnrollmentsTable,
  studentAttendanceTable,
  guardiansTable,
  academicYearsTable,
  classesTable,
} from "@workspace/db";
import { eq, and, asc, desc, inArray, sql, or, count as drizzleCount, isNull } from "drizzle-orm";
import { DURATION_MONTH_COUNT } from "@workspace/db";
import { requireAdmin, requireRole, realAdminUserId } from "../lib/admin-auth";
import { getAdminTenantId, withTenantRead } from "../lib/tenant";
import { syncFeeTypeCoa, syncStudentCoa } from "../lib/coa-sync";
import { tryCreateAndPostJE, coaById, coaByCode } from "../lib/je-factory";
import { ensureFineFeeTypes, isSystemFeeCode, FINE_FEE_CODES } from "../lib/fine-fee-types";
import { streamCsv } from "./reports";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** All accepted duration values (new + legacy). */
const VALID_DURATIONS = new Set([
  "once", "single", "bi-monthly", "tri-monthly", "tetra-monthly", "six-monthly", "annual",
  "monthly", "optional-months", // legacy
]);

/**
 * Given a YYYY-MM periodStart and a duration string, compute the YYYY-MM periodEnd.
 * Returns null for single-month durations (monthCount === 1) or unknown durations.
 */
function computePeriodEnd(periodStart: string, duration: string): string | null {
  const monthCount = DURATION_MONTH_COUNT[duration] ?? 1;
  if (monthCount <= 1) return null;
  const [y, m] = periodStart.split("-").map(Number);
  const totalMonths = y * 12 + (m - 1) + (monthCount - 1);
  const endYear  = Math.floor(totalMonths / 12);
  const endMonth = (totalMonths % 12) + 1;
  return `${endYear}-${String(endMonth).padStart(2, "0")}`;
}

// ── Fee challan billing JE ────────────────────────────────────────────────────
// Posts DR student-receivable / CR fee-income for each challan (accrual billing).
// Called fire-and-forget after challans are inserted.

async function postChallanBilledJEs(
  challans: Array<{ id: string; studentId: string; feeTypeId: string; amount: number; challanNumber?: string | null }>,
  tenantId: string,
  logger?: any,
): Promise<void> {
  if (!challans.length) return;
  try {
    const studentIds = [...new Set(challans.map(c => c.studentId))];
    const { rows: sRows } = await pool.query<{
      id: string; coa_id: string | null; full_name: string; applicant_id: string;
    }>(
      `SELECT id, coa_id, full_name, applicant_id FROM students WHERE id = ANY($1::uuid[]) AND tenant_id = $2::uuid`,
      [studentIds, tenantId],
    );
    const studentCoaMap = new Map(sRows.map(r => [r.id, r.coa_id]));

    // Lazy sub-ledger creation: if a student still has no coa_id, create it now
    // so billing JEs aren't silently skipped for newly-enrolled students.
    const missing = sRows.filter(r => !r.coa_id);
    for (const s of missing) {
      const newCoaId = await syncStudentCoa(
        { id: s.id, fullName: s.full_name, applicantId: s.applicant_id },
        tenantId,
      );
      if (newCoaId) studentCoaMap.set(s.id, newCoaId);
    }

    const feeTypeIds = [...new Set(challans.map(c => c.feeTypeId))];
    const ftRows = await db
      .select({ id: feeTypesTable.id, coaId: feeTypesTable.coaId })
      .from(feeTypesTable)
      .where(and(inArray(feeTypesTable.id, feeTypeIds), eq(feeTypesTable.tenantId, tenantId)));
    const feeTypeCoaMap = new Map(ftRows.map(r => [r.id, r.coaId]));

    // Batch-resolve every COA (student receivable + fee income) in a single query
    // instead of two coaById round-trips per challan.
    const neededCoaIds = [...new Set([
      ...[...studentCoaMap.values()].filter((x): x is string => !!x),
      ...ftRows.map(r => r.coaId).filter((x): x is string => !!x),
    ])];
    const { rows: coaRows } = neededCoaIds.length
      ? await pool.query<{ id: string; code: string; name: string }>(
          `SELECT id, code, name FROM chart_of_accounts WHERE id = ANY($1::uuid[]) AND tenant_id = $2::uuid`,
          [neededCoaIds, tenantId],
        )
      : { rows: [] as { id: string; code: string; name: string }[] };
    const coaMap = new Map(coaRows.map(r => [r.id, r]));

    const today = new Date().toISOString().slice(0, 10);
    await Promise.allSettled(challans.map(async (challan) => {
      if (!challan.amount) return;
      const studentCoaId = studentCoaMap.get(challan.studentId);
      const feeTypeCoaId = feeTypeCoaMap.get(challan.feeTypeId);
      if (!studentCoaId || !feeTypeCoaId) return;
      const studentCoa = coaMap.get(studentCoaId);
      const feeCoa     = coaMap.get(feeTypeCoaId);
      if (!studentCoa || !feeCoa) return;
      await tryCreateAndPostJE({
        tenantId,
        date:         today,
        description:  `Fee billed — ${challan.challanNumber ?? challan.id}`,
        reference:    challan.challanNumber ?? null,
        sourceModule: "fee-billed",
        sourceRefId:  challan.id,
        lines: [
          { coaId: studentCoaId, coaCode: studentCoa.code, coaName: studentCoa.name, debitAmount: challan.amount, creditAmount: 0,              narration: `Challan ${challan.challanNumber ?? challan.id}` },
          { coaId: feeTypeCoaId, coaCode: feeCoa.code,     coaName: feeCoa.name,     debitAmount: 0,              creditAmount: challan.amount, narration: `Fee income recognised` },
        ],
      }, logger);
    }));
  } catch (err) {
    if (logger) logger.error({ err }, "[fee-billing-je] postChallanBilledJEs failed");
    else console.error("[fee-billing-je] postChallanBilledJEs failed", err);
  }
}

/** Verify a challan belongs to the requesting tenant (via its student). Returns tenantId or null. */
async function resolveChallanTenant(req: Request, challanId: string): Promise<string | null> {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return null;
  const [row] = await db.select({ id: feeChallansTable.id }).from(feeChallansTable)
    .innerJoin(studentsTable, and(eq(feeChallansTable.studentId, studentsTable.id), eq(studentsTable.tenantId, tenantId)))
    .where(eq(feeChallansTable.id, challanId)).limit(1);
  return row ? tenantId : null;
}

/** Generate the next challan number for a given YYYY-MM period (inside a tx), scoped to a tenant.
 *  Uses MAX(sequence suffix) instead of COUNT so deletions never cause collisions.
 *  The surrounding DB transaction provides SERIALIZABLE-level protection against concurrent
 *  double-issue; FOR UPDATE cannot be used on an aggregate query in PostgreSQL.
 */
async function nextChallanNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ym: string,
  tenantId: string,
): Promise<string> {
  // challan_number format: "CCM-YYYYMM-NNNN" — SPLIT_PART(..., '-', 3) extracts the 4-digit suffix
  const ymCompact = ym.replace("-", "");       // "YYYYMM"
  const prefix    = `CCM-${ymCompact}-`;       // "CCM-YYYYMM-"
  const result = await tx.execute(sql`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(fc.challan_number, '-', 3) AS INTEGER)), 0) AS max_seq
    FROM   fee_challans fc
    JOIN   students s ON s.id = fc.student_id AND s.tenant_id = ${tenantId}::uuid
    WHERE  fc.challan_number LIKE ${prefix + "%"}
  `);
  const seq = Number((result.rows[0] as any)?.max_seq ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

// ── Fee Types ─────────────────────────────────────────────────────────────────

router.get("/admin/fee-types", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    // withTenantRead sets SET LOCAL ROLE app_user + app.current_tenant so RLS
    // fires as a second safety net in addition to the WHERE tenant_id clause.
    const rows = await withTenantRead(tenantId, (tx) =>
      tx
        .select()
        .from(feeTypesTable)
        .where(eq(feeTypesTable.tenantId, tenantId))
        .orderBy(asc(feeTypesTable.sortOrder), asc(feeTypesTable.name))
    );
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list fee types");
    return res.status(500).json({ error: "Failed to load fee types" });
  }
});

router.post("/admin/fee-types", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { name, feeCategory, feeCode, duration, months, description, sortOrder } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: "name is required" });
    if (!feeCode?.trim()) return res.status(400).json({ error: "feeCode is required" });
    if (!["tuition", "non-tuition"].includes(feeCategory)) return res.status(400).json({ error: "feeCategory must be tuition or non-tuition" });
    if (!VALID_DURATIONS.has(duration)) return res.status(400).json({ error: "Invalid duration" });

    const [created] = await db.insert(feeTypesTable).values({
      tenantId,
      name: name.trim(),
      feeCategory,
      feeCode: feeCode.trim().toLowerCase().replace(/\s+/g, "-"),
      duration,
      months: Array.isArray(months) ? JSON.stringify(months) : null,
      description: description?.trim() || null,
      sortOrder: Number(sortOrder) || 0,
    }).returning();

    void syncFeeTypeCoa({ id: created.id, name: created.name, feeCategory: created.feeCategory, feeCode: created.feeCode }, tenantId);

    return res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "A fee type with this code already exists" });
    req.log.error({ err }, "Failed to create fee type");
    return res.status(500).json({ error: "Failed to create fee type" });
  }
});

router.patch("/admin/fee-types/reorder", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const order = req.body?.order;
    if (!Array.isArray(order) || order.some((id) => typeof id !== "string")) {
      return res.status(400).json({ error: "order must be an array of ids" });
    }
    if (order.length > 0) {
      // Single bulk UPDATE … CASE instead of one round-trip per id.
      const cases = sql.join(
        order.map((id: string, idx: number) => sql`WHEN ${id}::uuid THEN ${idx}`),
        sql` `,
      );
      const ids = sql.join(order.map((id: string) => sql`${id}::uuid`), sql`, `);
      await db.execute(sql`
        UPDATE fee_types
        SET sort_order = CASE id ${cases} ELSE sort_order END
        WHERE tenant_id = ${tenantId}::uuid AND id IN (${ids})
      `);
    }
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder fee types");
    return res.status(500).json({ error: "Failed to reorder fee types" });
  }
});

router.put("/admin/fee-types/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const id = String(req.params.id);
    const { name, feeCategory, feeCode, duration, months, description, active, sortOrder } = req.body ?? {};

    const existing = await db.select().from(feeTypesTable)
      .where(and(eq(feeTypesTable.id, id), eq(feeTypesTable.tenantId, tenantId))).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Fee type not found" });

    // Guard: the code of a system fine fee type must never change, or the COA/fine
    // wiring (which looks these up by fixed code) would orphan and a duplicate would
    // be re-seeded. Editing the name/other fields stays allowed.
    if (isSystemFeeCode(existing[0].feeCode)) {
      const nextCode = feeCode !== undefined
        ? String(feeCode).trim().toLowerCase().replace(/\s+/g, "-")
        : undefined;
      if (nextCode !== undefined && nextCode !== existing[0].feeCode) {
        return res.status(403).json({ error: "The code of a system fee type cannot be changed" });
      }
    }

    const updates: Record<string, any> = {};
    if (name !== undefined)        updates.name = name.trim();
    if (feeCategory !== undefined) updates.feeCategory = feeCategory;
    if (feeCode !== undefined)     updates.feeCode = feeCode.trim().toLowerCase().replace(/\s+/g, "-");
    if (duration !== undefined)    updates.duration = duration;
    if (months !== undefined)      updates.months = Array.isArray(months) ? JSON.stringify(months) : null;
    if (description !== undefined) updates.description = description?.trim() || null;
    if (active !== undefined)      updates.active = Boolean(active);
    if (sortOrder !== undefined)   updates.sortOrder = Number(sortOrder) || 0;

    const [updated] = await db.update(feeTypesTable).set(updates)
      .where(and(eq(feeTypesTable.id, id), eq(feeTypesTable.tenantId, tenantId))).returning();

    if (name !== undefined || feeCategory !== undefined || feeCode !== undefined) {
      void syncFeeTypeCoa({ id: updated.id, name: updated.name, feeCategory: updated.feeCategory, feeCode: updated.feeCode }, tenantId);
    }

    return res.json(updated);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "A fee type with this code already exists" });
    req.log.error({ err }, "Failed to update fee type");
    return res.status(500).json({ error: "Failed to update fee type" });
  }
});

router.delete("/admin/fee-types/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const id = String(req.params.id);
    const existing = await db.select().from(feeTypesTable)
      .where(and(eq(feeTypesTable.id, id), eq(feeTypesTable.tenantId, tenantId))).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Fee type not found" });

    if (isSystemFeeCode(existing[0].feeCode)) {
      return res.status(403).json({ error: "This is a system fee type and cannot be deleted" });
    }

    await db.delete(feeTypesTable).where(and(eq(feeTypesTable.id, id), eq(feeTypesTable.tenantId, tenantId)));
    return res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "23503") return res.status(409).json({ error: "Cannot delete — this fee type is used in a fee schedule or challan" });
    req.log.error({ err }, "Failed to delete fee type");
    return res.status(500).json({ error: "Failed to delete fee type" });
  }
});

// ── Fee Schedule ──────────────────────────────────────────────────────────────

router.get("/admin/fee-schedule", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { academicYearId } = req.query as Record<string, string>;
    if (!academicYearId) return res.status(400).json({ error: "academicYearId is required" });

    const [feeTypes, classes, scheduleRows] = await Promise.all([
      db.select().from(feeTypesTable).where(and(eq(feeTypesTable.active, true), eq(feeTypesTable.tenantId, tenantId))).orderBy(asc(feeTypesTable.sortOrder)),
      db.select().from(classesTable).where(and(eq(classesTable.active, true), eq(classesTable.tenantId, tenantId))).orderBy(asc(classesTable.sortOrder)),
      db.select({ classCode: feeScheduleTable.classCode, feeTypeId: feeScheduleTable.feeTypeId, amount: feeScheduleTable.amount })
        .from(feeScheduleTable)
        .innerJoin(feeTypesTable, and(eq(feeScheduleTable.feeTypeId, feeTypesTable.id), eq(feeTypesTable.tenantId, tenantId)))
        .where(eq(feeScheduleTable.academicYearId, academicYearId)),
    ]);

    const amounts: Record<string, Record<string, number>> = {};
    for (const row of scheduleRows) {
      if (!amounts[row.classCode]) amounts[row.classCode] = {};
      amounts[row.classCode][row.feeTypeId] = row.amount;
    }

    return res.json({ feeTypes, classes, amounts });
  } catch (err) {
    req.log.error({ err }, "Failed to load fee schedule");
    return res.status(500).json({ error: "Failed to load fee schedule" });
  }
});

router.put("/admin/fee-schedule", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { academicYearId, entries } = req.body ?? {};
    if (!academicYearId) return res.status(400).json({ error: "academicYearId is required" });
    if (!Array.isArray(entries) || !entries.length) return res.status(400).json({ error: "entries must be a non-empty array" });

    const allowedFeeTypeIds = new Set(
      (await db.select({ id: feeTypesTable.id }).from(feeTypesTable).where(eq(feeTypesTable.tenantId, tenantId))).map(r => r.id)
    );

    await db.transaction(async (tx) => {
      for (const entry of entries) {
        const { classCode, feeTypeId, amount } = entry;
        if (!classCode || !feeTypeId || amount === undefined) continue;
        if (!allowedFeeTypeIds.has(feeTypeId)) continue;

        const existing = await tx
          .select({ id: feeScheduleTable.id })
          .from(feeScheduleTable)
          .where(and(
            eq(feeScheduleTable.academicYearId, academicYearId),
            eq(feeScheduleTable.classCode, classCode),
            eq(feeScheduleTable.feeTypeId, feeTypeId),
          ))
          .limit(1);

        if (existing.length) {
          await tx.update(feeScheduleTable).set({ amount: Number(amount) })
            .where(eq(feeScheduleTable.id, existing[0].id));
        } else {
          await tx.insert(feeScheduleTable).values({ academicYearId, classCode, feeTypeId, amount: Number(amount) });
        }
      }
    });

    return res.json({ ok: true, saved: entries.length });
  } catch (err) {
    req.log.error({ err }, "Failed to save fee schedule");
    return res.status(500).json({ error: "Failed to save fee schedule" });
  }
});

// ── Fee Challans ──────────────────────────────────────────────────────────────

// GET /admin/fee-challans?studentId=...
router.get("/admin/fee-challans", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { studentId } = req.query as Record<string, string>;
    if (!studentId) return res.status(400).json({ error: "studentId is required" });

    const challans = await db
      .select({
        id: feeChallansTable.id,
        studentId: feeChallansTable.studentId,
        feeTypeId: feeChallansTable.feeTypeId,
        feeTypeName: feeTypesTable.name,
        feeCode: feeTypesTable.feeCode,
        feeTypeDescription: feeTypesTable.description,
        academicYearId: feeChallansTable.academicYearId,
        academicYearName: academicYearsTable.name,
        amount: feeChallansTable.amount,
        grossAmount: feeChallansTable.grossAmount,
        discountAmount: feeChallansTable.discountAmount,
        month: feeChallansTable.month,
        periodMonthStart: feeChallansTable.periodMonthStart,
        periodMonthEnd: feeChallansTable.periodMonthEnd,
        challanNumber: feeChallansTable.challanNumber,
        issueDate: feeChallansTable.issueDate,
        dueDate: feeChallansTable.dueDate,
        status: feeChallansTable.status,
        paidAt: feeChallansTable.paidAt,
        remarks: feeChallansTable.remarks,
        createdAt: feeChallansTable.createdAt,
      })
      .from(feeChallansTable)
      .innerJoin(feeTypesTable, and(eq(feeChallansTable.feeTypeId, feeTypesTable.id), eq(feeTypesTable.tenantId, tenantId)))
      .innerJoin(academicYearsTable, eq(feeChallansTable.academicYearId, academicYearsTable.id))
      .innerJoin(studentsTable, and(eq(feeChallansTable.studentId, studentsTable.id), eq(studentsTable.tenantId, tenantId)))
      .where(eq(feeChallansTable.studentId, studentId))
      .orderBy(desc(feeChallansTable.issueDate));

    return res.json(challans.map(c => ({
      ...c,
      paidAt: c.paidAt ? c.paidAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list fee challans");
    return res.status(500).json({ error: "Failed to load challans" });
  }
});

// POST /admin/fee-challans/generate — single student
router.post("/admin/fee-challans/generate", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { studentId, academicYearId, feeTypeIds, month, periodStart, issueDate, dueDate } = req.body ?? {};
    if (!studentId)                              return res.status(400).json({ error: "studentId is required" });
    if (!academicYearId)                         return res.status(400).json({ error: "academicYearId is required" });
    if (!Array.isArray(feeTypeIds) || !feeTypeIds.length) return res.status(400).json({ error: "feeTypeIds must be a non-empty array" });
    if (!issueDate)                              return res.status(400).json({ error: "issueDate is required" });
    if (!dueDate)                                return res.status(400).json({ error: "dueDate is required" });

    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const student = await db.select({ classCode: studentsTable.classCode })
      .from(studentsTable).where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId))).limit(1);
    if (!student.length) return res.status(404).json({ error: "Student not found" });

    const classCode = student[0].classCode;
    const ym = issueDate.slice(0, 7);
    const effectivePeriodStart = periodStart ?? month ?? null;

    // Fetch fee type details for duration-based period computation
    const feeTypeDetails = await db
      .select({ id: feeTypesTable.id, duration: feeTypesTable.duration })
      .from(feeTypesTable)
      .where(and(inArray(feeTypesTable.id, feeTypeIds), eq(feeTypesTable.tenantId, tenantId)));
    const feeTypeDurationMap = new Map(feeTypeDetails.map(ft => [ft.id, ft.duration]));

    // Validate: periodic fee types require periodStart
    const needsPeriod = feeTypeIds.some((id: string) => {
      const d = feeTypeDurationMap.get(id) ?? "single";
      return d !== "once";
    });
    if (needsPeriod && !effectivePeriodStart) {
      return res.status(400).json({ error: "periodStart is required for periodic fee types" });
    }

    const scheduleRows = await db
      .select({ feeTypeId: feeScheduleTable.feeTypeId, amount: feeScheduleTable.amount })
      .from(feeScheduleTable)
      .where(and(
        eq(feeScheduleTable.academicYearId, academicYearId),
        eq(feeScheduleTable.classCode, classCode),
        inArray(feeScheduleTable.feeTypeId, feeTypeIds),
      ));

    const scheduleAmountMap: Record<string, number> = {};
    for (const r of scheduleRows) scheduleAmountMap[r.feeTypeId] = r.amount;

    // Fetch student-level overrides (if any)
    const overrideRows = await db
      .select({ feeTypeId: studentFeeOverridesTable.feeTypeId, amount: studentFeeOverridesTable.amount })
      .from(studentFeeOverridesTable)
      .where(and(
        eq(studentFeeOverridesTable.studentId, studentId),
        eq(studentFeeOverridesTable.academicYearId, academicYearId),
        inArray(studentFeeOverridesTable.feeTypeId, feeTypeIds),
      ));
    const overrideAmountMap: Record<string, number> = {};
    for (const r of overrideRows) overrideAmountMap[r.feeTypeId] = Number(r.amount);

    // Pre-compute fine amounts (outside tx — read-only queries)
    const [attFineAmt, lateFineInfo, fineFeeTypeMap] = await Promise.all([
      effectivePeriodStart
        ? calcAttendanceFine(studentId, classCode, effectivePeriodStart, academicYearId, tenantId)
        : Promise.resolve(0),
      calcLateFine(studentId, classCode, academicYearId, tenantId),
      ensureFineFeeTypes(tenantId),
    ]);

    // Guard: reject if all line items (base fees + fines) would total Rs 0.
    // attFineAmt and lateFineInfo are already computed above; fines are only non-zero when applicable.
    const baseFeesTotal = feeTypeIds.reduce((sum: number, feeTypeId: string) => {
      const grossAmount = scheduleAmountMap[feeTypeId] ?? 0;
      const hasOverride = feeTypeId in overrideAmountMap;
      const netAmount   = hasOverride ? overrideAmountMap[feeTypeId] : grossAmount;
      return sum + netAmount;
    }, 0);
    const grandTotal = baseFeesTotal + attFineAmt + lateFineInfo.amount;
    if (grandTotal === 0) {
      return res.status(400).json({ error: "Cannot generate challan: total payable amount is Rs 0. Ensure a fee schedule exists for this student's class and selected fee types." });
    }

    // withTenantCtx sets app.current_tenant for the duration of this transaction
    // so the RLS policy on fee_types / students / fee_challans is active.
    const created = await withTenantCtx(tenantId, async (tx) => {
      const challanNumber = await nextChallanNumber(tx, ym, tenantId);
      const rows = feeTypeIds.map((feeTypeId: string) => {
        const duration    = feeTypeDurationMap.get(feeTypeId) ?? "single";
        const pStart      = duration === "once" ? null : effectivePeriodStart;
        const pEnd        = pStart ? computePeriodEnd(pStart, duration) : null;
        const grossAmount = scheduleAmountMap[feeTypeId] ?? 0;
        const hasOverride = feeTypeId in overrideAmountMap;
        const netAmount   = hasOverride ? overrideAmountMap[feeTypeId] : grossAmount;
        const discountAmount = Math.max(0, grossAmount - netAmount);
        return {
          tenantId,
          studentId,
          feeTypeId,
          academicYearId,
          challanNumber,
          amount: netAmount,
          grossAmount,
          discountAmount,
          month: pStart,
          periodMonthStart: pStart,
          periodMonthEnd: pEnd,
          issueDate,
          dueDate,
          status: "pending" as const,
        };
      });

      // Add fine line items to the same challan batch
      const attFeeTypeId = fineFeeTypeMap.get("attendance-fine");
      if (attFineAmt > 0 && attFeeTypeId && effectivePeriodStart) {
        rows.push({
          tenantId,
          studentId,
          feeTypeId: attFeeTypeId,
          academicYearId,
          challanNumber,
          amount: attFineAmt,
          month: effectivePeriodStart,
          periodMonthStart: effectivePeriodStart,
          periodMonthEnd: null,
          issueDate,
          dueDate,
          status: "pending" as const,
        } as any);
      }

      const lateFeeTypeId = fineFeeTypeMap.get("late-fee-fine");
      if (lateFineInfo.amount > 0 && lateFeeTypeId) {
        rows.push({
          tenantId,
          studentId,
          feeTypeId: lateFeeTypeId,
          academicYearId,
          challanNumber,
          amount: lateFineInfo.amount,
          month: effectivePeriodStart ?? null,
          periodMonthStart: effectivePeriodStart ?? null,
          periodMonthEnd: null,
          issueDate,
          dueDate,
          status: "pending" as const,
        } as any);
        // Mark covered overdue challans so late fine isn't double-charged
        if (lateFineInfo.overdueChallanIds.length) {
          await tx.execute(sql`
            UPDATE fee_challans SET late_fine_applied = true
            WHERE id = ANY(${lateFineInfo.overdueChallanIds}::uuid[])
          `);
        }
      }

      return tx.insert(feeChallansTable).values(rows).returning();
    });

    void postChallanBilledJEs(created as any[], tenantId);
    return res.status(201).json({ created: created.length, challans: created });
  } catch (err) {
    req.log.error({ err }, "Failed to generate challans");
    return res.status(500).json({ error: "Failed to generate challans" });
  }
});

// POST /admin/fee-challans/generate-bulk — all students in a class/section, or explicit studentIds
router.post("/admin/fee-challans/generate-bulk", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const { academicYearId, classCode, sectionId, studentIds: studentIdsParam, feeTypeIds, month, periodStart, issueDate, dueDate, skipDuplicates = true } = req.body ?? {};
    if (!academicYearId)  return res.status(400).json({ error: "academicYearId is required" });
    if (!Array.isArray(feeTypeIds) || !feeTypeIds.length) return res.status(400).json({ error: "feeTypeIds must be a non-empty array" });
    if (!issueDate)       return res.status(400).json({ error: "issueDate is required" });
    if (!dueDate)         return res.status(400).json({ error: "dueDate is required" });

    const effectivePeriodStart = periodStart ?? month ?? null;

    // Verify all requested feeTypeIds belong to this tenant and get their durations
    const validFeeTypes = await db
      .select({ id: feeTypesTable.id, duration: feeTypesTable.duration })
      .from(feeTypesTable)
      .where(and(inArray(feeTypesTable.id, feeTypeIds), eq(feeTypesTable.tenantId, tenantId)));
    const validFeeTypeSet = new Set(validFeeTypes.map(f => f.id));
    const feeTypeDurationMap = new Map(validFeeTypes.map(ft => [ft.id, ft.duration]));
    const safeFeeTypeIds: string[] = feeTypeIds.filter((id: string) => validFeeTypeSet.has(id));
    if (!safeFeeTypeIds.length) return res.status(403).json({ error: "None of the requested fee types belong to this tenant" });

    // Validate: periodic fee types require periodStart
    const bulkNeedsPeriod = safeFeeTypeIds.some(id => (feeTypeDurationMap.get(id) ?? "single") !== "once");
    if (bulkNeedsPeriod && !effectivePeriodStart) {
      return res.status(400).json({ error: "periodStart is required for periodic fee types" });
    }

    let students: Array<{ id: string; classCode: string }>;

    if (Array.isArray(studentIdsParam) && studentIdsParam.length > 0) {
      // New path: explicit student IDs — always scoped to tenant
      students = await db
        .select({ id: studentsTable.id, classCode: studentsTable.classCode })
        .from(studentsTable)
        .where(and(
          inArray(studentsTable.id, studentIdsParam),
          eq(studentsTable.tenantId, tenantId),
        ));
    } else {
      // Legacy path: filter by classCode/sectionId — always scoped to tenant
      if (!classCode) return res.status(400).json({ error: "classCode is required when studentIds is not provided" });
      const studentFilter: any[] = [
        eq(studentsTable.classCode, classCode),
        eq(studentsTable.status, "active"),
        eq(studentsTable.tenantId, tenantId),
      ];
      if (sectionId) studentFilter.push(eq(studentsTable.sectionId, sectionId));
      students = await db
        .select({ id: studentsTable.id, classCode: studentsTable.classCode })
        .from(studentsTable)
        .where(and(...studentFilter));
    }

    if (!students.length) return res.json({ generated: 0, skipped: 0, zeroed: 0, students: 0 });

    const studentIds = students.map(s => s.id);

    // Build per-class fee schedule amount map (supports multi-class selections)
    const uniqueClassCodes = [...new Set(students.map(s => s.classCode))];
    const scheduleRows = await db
      .select({ feeTypeId: feeScheduleTable.feeTypeId, amount: feeScheduleTable.amount, classCode: feeScheduleTable.classCode })
      .from(feeScheduleTable)
      .where(and(
        eq(feeScheduleTable.academicYearId, academicYearId),
        inArray(feeScheduleTable.classCode, uniqueClassCodes),
        inArray(feeScheduleTable.feeTypeId, safeFeeTypeIds),
      ));

    // classCode -> feeTypeId -> schedule amount
    const scheduleAmountMap: Record<string, Record<string, number>> = {};
    for (const r of scheduleRows) {
      if (!scheduleAmountMap[r.classCode]) scheduleAmountMap[r.classCode] = {};
      scheduleAmountMap[r.classCode][r.feeTypeId] = r.amount;
    }

    // Fetch student-level overrides for all selected students
    const bulkOverrideRows = await db
      .select({
        studentId: studentFeeOverridesTable.studentId,
        feeTypeId: studentFeeOverridesTable.feeTypeId,
        amount:    studentFeeOverridesTable.amount,
      })
      .from(studentFeeOverridesTable)
      .where(and(
        inArray(studentFeeOverridesTable.studentId, studentIds),
        eq(studentFeeOverridesTable.academicYearId, academicYearId),
        inArray(studentFeeOverridesTable.feeTypeId, safeFeeTypeIds),
      ));
    // studentId -> feeTypeId -> override amount
    const overrideMap: Record<string, Record<string, number>> = {};
    for (const r of bulkOverrideRows) {
      if (!overrideMap[r.studentId]) overrideMap[r.studentId] = {};
      overrideMap[r.studentId][r.feeTypeId] = Number(r.amount);
    }

    const ym = issueDate.slice(0, 7);

    // Duration-aware duplicate detection:
    // - "once" fee types: no period filter (only one challan per student+feeType+academicYear)
    // - periodic fee types: match on periodMonthStart to allow re-billing in different periods
    const onceFeeTypeIds = safeFeeTypeIds.filter(id => (feeTypeDurationMap.get(id) ?? "single") === "once");
    const periodicFeeTypeIds = safeFeeTypeIds.filter(id => (feeTypeDurationMap.get(id) ?? "single") !== "once");

    let existingPairs: Array<{ studentId: string; feeTypeId: string }> = [];
    if (skipDuplicates) {
      const baseWhere = [
        inArray(feeChallansTable.studentId, studentIds),
        eq(feeChallansTable.academicYearId, academicYearId),
      ];

      const queryParts: Array<Promise<typeof existingPairs>> = [];

      if (onceFeeTypeIds.length) {
        queryParts.push(db
          .select({ studentId: feeChallansTable.studentId, feeTypeId: feeChallansTable.feeTypeId })
          .from(feeChallansTable)
          .where(and(...baseWhere, inArray(feeChallansTable.feeTypeId, onceFeeTypeIds))));
      }

      if (periodicFeeTypeIds.length && effectivePeriodStart) {
        // Match both newly-created challans (period_month_start set) and legacy
        // challans that only have the old `month` column (period_month_start = null)
        queryParts.push(db
          .select({ studentId: feeChallansTable.studentId, feeTypeId: feeChallansTable.feeTypeId })
          .from(feeChallansTable)
          .where(and(...baseWhere,
            inArray(feeChallansTable.feeTypeId, periodicFeeTypeIds),
            or(
              eq(feeChallansTable.periodMonthStart, effectivePeriodStart),
              and(isNull(feeChallansTable.periodMonthStart), eq(feeChallansTable.month, effectivePeriodStart))
            ))));
      }

      const results = await Promise.all(queryParts);
      existingPairs = results.flat();
    }

    const existingSet = new Set(existingPairs.map(e => `${e.studentId}::${e.feeTypeId}`));

    // Pre-resolve fine fee types once for the whole batch
    const bulkFineFeeTypeMap = await ensureFineFeeTypes(tenantId);

    let generated = 0;
    let skipped = 0;
    let zeroed = 0;
    const allBulkInserted: any[] = [];

    // withTenantCtx sets app.current_tenant for the duration of the transaction,
    // enabling the RLS policy on fee_challans / fee_types / students.
    await withTenantCtx(tenantId, async (tx) => {
      for (const student of students) {
        const classSchedule  = scheduleAmountMap[student.classCode] ?? {};
        const studentOverride = overrideMap[student.id] ?? {};
        const rows = safeFeeTypeIds
          .filter((feeTypeId: string) => !existingSet.has(`${student.id}::${feeTypeId}`))
          .map((feeTypeId: string) => {
            const duration    = feeTypeDurationMap.get(feeTypeId) ?? "single";
            const pStart      = duration === "once" ? null : effectivePeriodStart;
            const pEnd        = pStart ? computePeriodEnd(pStart, duration) : null;
            const grossAmount = classSchedule[feeTypeId] ?? 0;
            const hasOverride = feeTypeId in studentOverride;
            const netAmount   = hasOverride ? studentOverride[feeTypeId] : grossAmount;
            // discountAmount is stored as 0 when netAmount > grossAmount (surcharge case).
            // The actual surcharge is inferred at render time from amount > grossAmount.
            // This mirrors the single-challan path and correctly handles surcharges.
            const discountAmount = Math.max(0, grossAmount - netAmount);
            return {
              tenantId,
              studentId: student.id,
              feeTypeId,
              academicYearId,
              amount: netAmount,
              grossAmount,
              discountAmount,
              month: pStart,
              periodMonthStart: pStart,
              periodMonthEnd: pEnd,
              issueDate,
              dueDate,
              status: "pending" as const,
            };
          });

        const toSkip = safeFeeTypeIds.length - rows.length;
        skipped += toSkip;

        if (!rows.length) continue;

        // Compute fine amounts for this student (outside-tx reads, inside loop)
        const [studentAttFine, studentLateFine] = await Promise.all([
          effectivePeriodStart
            ? calcAttendanceFine(student.id, student.classCode, effectivePeriodStart, academicYearId, tenantId)
            : Promise.resolve(0),
          calcLateFine(student.id, student.classCode, academicYearId, tenantId),
        ]);

        const attFeeTypeId = bulkFineFeeTypeMap.get("attendance-fine");
        if (studentAttFine > 0 && attFeeTypeId && effectivePeriodStart) {
          rows.push({
            tenantId,
            studentId: student.id,
            feeTypeId: attFeeTypeId,
            academicYearId,
            amount: studentAttFine,
            month: effectivePeriodStart,
            periodMonthStart: effectivePeriodStart,
            periodMonthEnd: null,
            issueDate,
            dueDate,
            status: "pending" as const,
          } as any);
        }

        const lateFeeTypeId = bulkFineFeeTypeMap.get("late-fee-fine");
        if (studentLateFine.amount > 0 && lateFeeTypeId) {
          rows.push({
            tenantId,
            studentId: student.id,
            feeTypeId: lateFeeTypeId,
            academicYearId,
            amount: studentLateFine.amount,
            month: effectivePeriodStart ?? null,
            periodMonthStart: effectivePeriodStart ?? null,
            periodMonthEnd: null,
            issueDate,
            dueDate,
            status: "pending" as const,
          } as any);
          if (studentLateFine.overdueChallanIds.length) {
            await tx.execute(sql`
              UPDATE fee_challans SET late_fine_applied = true
              WHERE id = ANY(${studentLateFine.overdueChallanIds}::uuid[])
            `);
          }
        }

        // Guard: skip this student if all assembled line items (base + fines) total Rs 0
        const totalPayable = rows.reduce((sum, r) => sum + ((r as any).amount ?? 0), 0);
        if (totalPayable === 0) {
          zeroed++;
          skipped += rows.length;
          continue;
        }

        const challanNumber = await nextChallanNumber(tx, ym, tenantId);
        const rowsWithNum = rows.map((r: any) => ({ ...r, challanNumber }));
        const bIns = await tx.insert(feeChallansTable).values(rowsWithNum).returning();
        allBulkInserted.push(...(bIns as any[]));
        generated += rows.length;
      }
    });

    void postChallanBilledJEs(allBulkInserted, tenantId);
    return res.json({ generated, skipped, zeroed, students: students.length });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk generate challans");
    return res.status(500).json({ error: "Failed to bulk generate challans" });
  }
});

// GET /admin/fee-challans/collect
// Returns every matching student with their challan summary.
// Params: academicYearId (req), classCodes (csv), classCode (legacy single),
//         sectionIds (csv), sectionId (legacy), month (YYYY-MM), feeTypeIds (csv)
router.get("/admin/fee-challans/collect", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { academicYearId, classCode, classCodes, sectionId, sectionIds, month, feeTypeIds } =
      req.query as Record<string, string>;
    if (!academicYearId) return res.status(400).json({ error: "academicYearId is required" });

    // Resolve multi-value params (csv takes priority over single)
    const classCodesArr  = classCodes  ? classCodes.split(",").map(s => s.trim()).filter(Boolean)
                         : classCode   ? [classCode]
                         : [];
    const sectionIdsArr  = sectionIds  ? sectionIds.split(",").map(s => s.trim()).filter(Boolean)
                         : sectionId   ? [sectionId]
                         : [];
    const feeTypeIdsArr  = feeTypeIds  ? feeTypeIds.split(",").map(s => s.trim()).filter(Boolean) : [];

    // Build student filter — always restrict to active students and tenant
    const studentFilter: any[] = [eq(studentsTable.status, "active"), eq(studentsTable.tenantId, tenantId)];
    if (classCodesArr.length === 1)     studentFilter.push(eq(studentsTable.classCode, classCodesArr[0]));
    else if (classCodesArr.length > 1)  studentFilter.push(inArray(studentsTable.classCode, classCodesArr));
    if (sectionIdsArr.length === 1)     studentFilter.push(eq(studentsTable.sectionId, sectionIdsArr[0] as any));
    else if (sectionIdsArr.length > 1)  studentFilter.push(inArray(studentsTable.sectionId, sectionIdsArr as any[]));

    const students = await db
      .select({
        id:               studentsTable.id,
        fullName:         studentsTable.fullName,
        applicantId:         studentsTable.applicantId,
        fatherName:       studentsTable.fatherName,
        guardianName:     studentsTable.guardianName,
        guardianMobile:   studentsTable.guardianMobile,
        classCode:        studentsTable.classCode,
        sectionId:        studentsTable.sectionId,
        guardianFamilyId: sql<string | null>`CASE WHEN ${guardiansTable.familySeq} IS NOT NULL THEN 'FAM-' || LPAD(${guardiansTable.familySeq}::text, 4, '0') ELSE NULL END`,
        guardianPhone:    guardiansTable.phone,
      })
      .from(studentsTable)
      .leftJoin(guardiansTable, eq(studentsTable.guardianId, guardiansTable.id))
      .where(and(...studentFilter))
      .orderBy(asc(studentsTable.classCode), asc(studentsTable.fullName));

    if (!students.length) return res.json([]);

    const studentIds = students.map(s => s.id);

    // Challans for these students
    const challansFilter: any[] = [
      inArray(feeChallansTable.studentId, studentIds),
      eq(feeChallansTable.academicYearId, academicYearId),
    ];
    if (month)              challansFilter.push(eq(feeChallansTable.month, month));
    if (feeTypeIdsArr.length === 1)    challansFilter.push(eq(feeChallansTable.feeTypeId, feeTypeIdsArr[0]));
    else if (feeTypeIdsArr.length > 1) challansFilter.push(inArray(feeChallansTable.feeTypeId, feeTypeIdsArr));

    const challans = await db
      .select({
        id: feeChallansTable.id,
        studentId: feeChallansTable.studentId,
        feeTypeId: feeChallansTable.feeTypeId,
        feeTypeName: feeTypesTable.name,
        feeCode: feeTypesTable.feeCode,
        feeTypeDescription: feeTypesTable.description,
        academicYearId: feeChallansTable.academicYearId,
        academicYearName: academicYearsTable.name,
        amount: feeChallansTable.amount,
        grossAmount: feeChallansTable.grossAmount,
        discountAmount: feeChallansTable.discountAmount,
        month: feeChallansTable.month,
        periodMonthStart: feeChallansTable.periodMonthStart,
        periodMonthEnd: feeChallansTable.periodMonthEnd,
        challanNumber: feeChallansTable.challanNumber,
        issueDate: feeChallansTable.issueDate,
        dueDate: feeChallansTable.dueDate,
        status: feeChallansTable.status,
        paidAt: feeChallansTable.paidAt,
        remarks: feeChallansTable.remarks,
        createdAt: feeChallansTable.createdAt,
      })
      .from(feeChallansTable)
      .innerJoin(feeTypesTable, eq(feeChallansTable.feeTypeId, feeTypesTable.id))
      .innerJoin(academicYearsTable, eq(feeChallansTable.academicYearId, academicYearsTable.id))
      .where(and(...challansFilter))
      .orderBy(desc(feeChallansTable.issueDate));

    // Group by student
    const byStudent: Record<string, typeof challans> = {};
    for (const c of challans) {
      if (!byStudent[c.studentId]) byStudent[c.studentId] = [];
      byStudent[c.studentId].push(c);
    }

    const rows = students.map(s => {
      const sc = byStudent[s.id] ?? [];
      const totalAmount   = sc.reduce((sum, c) => sum + c.amount, 0);
      const paidAmount    = sc.filter(c => c.status === "paid").reduce((sum, c) => sum + c.amount, 0);
      const pendingAmount = totalAmount - paidAmount;

      let status: string;
      if (sc.length === 0)             status = "not_generated";
      else if (paidAmount === totalAmount && totalAmount > 0) status = "paid";
      else if (paidAmount > 0)         status = "partial";
      else                             status = "pending";

      const challanNumbers = [...new Set(sc.map(c => c.challanNumber).filter(Boolean))];
      const challansOut = sc.map(c => ({
        ...c,
        paidAt: c.paidAt ? c.paidAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
      }));

      return {
        studentId:        s.id,
        fullName:         s.fullName,
        applicantId:         s.applicantId,
        fatherName:       s.fatherName,
        guardianName:     s.guardianName,
        guardianMobile:   s.guardianMobile ?? s.guardianPhone ?? null,
        guardianFamilyId: s.guardianFamilyId ?? null,
        classCode:        s.classCode,
        sectionId:        s.sectionId,
        totalAmount,
        paidAmount,
        pendingAmount,
        status,
        challanNumbers,
        challans: challansOut,
      };
    });

    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to get collect fee data");
    return res.status(500).json({ error: "Failed to load collect fee data" });
  }
});

// POST /admin/fee-challans/:id/collect — Maker records a payment (moves to pending_approval for named users, or directly to paid for super-admin/env-admin)
router.post("/admin/fee-challans/:id/collect", requireRole("fees", "draft"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tenantId = await resolveChallanTenant(req, id);
    if (!tenantId) return res.status(403).json({ error: "Challan not found in this tenant" });
    const { remarks, paidAmount, paymentMethod, accountTitle, bankAccountId, paidAt: paidAtRaw } = req.body ?? {};

    const existing = await db.select().from(feeChallansTable).where(eq(feeChallansTable.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Challan not found" });
    const challan = existing[0];
    if (challan.status === "paid") return res.status(409).json({ error: "Challan is already paid" });

    const user = req.adminUser!;
    const namedUserId = realAdminUserId(user);

    // For named users, move to pending_approval. For env-admin/super-admin, skip to mark-paid flow.
    if (namedUserId) {
      let resolvedMethod  = paymentMethod?.trim() || null;
      let resolvedTitle   = accountTitle?.trim() || null;
      let resolvedAcctId  = bankAccountId?.trim() || null;
      if (resolvedAcctId) {
        const acctRows = await db.execute(
          sql`SELECT type, account_title, bank_name FROM bank_accounts WHERE id = ${resolvedAcctId}::uuid LIMIT 1`
        );
        if (acctRows.rows.length) {
          const acct = acctRows.rows[0] as any;
          resolvedMethod = acct.type;
          resolvedTitle  = acct.bank_name ? `${acct.bank_name} — ${acct.account_title}` : acct.account_title;
        }
      }
      await db.execute(sql`
        UPDATE fee_challans SET
          status          = 'pending_approval',
          payment_method  = ${resolvedMethod},
          account_title   = ${resolvedTitle},
          paid_amount     = ${typeof paidAmount === "number" ? paidAmount : challan.amount},
          remarks         = ${remarks?.trim() || null},
          collected_by    = ${namedUserId}::uuid
        WHERE id = ${id}::uuid
      `);
      const [updated] = await db.select().from(feeChallansTable).where(eq(feeChallansTable.id, id)).limit(1);
      return res.json({ ...updated, paidAt: updated.paidAt?.toISOString() ?? null, pendingApproval: true });
    }

    // env-admin path: direct payment (same as mark-paid) — tenantId scopes COA resolution
    return applyMarkPaid(id, challan, req, res, null, tenantId);
  } catch (err) {
    req.log.error({ err }, "Failed to collect challan");
    return res.status(500).json({ error: "Failed to collect challan" });
  }
});

// POST /admin/fee-challans/:id/approve — Checker confirms payment
router.post("/admin/fee-challans/:id/approve", requireRole("fees", "post"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tenantId = await resolveChallanTenant(req, id);
    if (!tenantId) return res.status(403).json({ error: "Challan not found in this tenant" });
    const existing = await db.select().from(feeChallansTable).where(eq(feeChallansTable.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Challan not found" });
    const challan = existing[0];

    if (challan.status !== "pending_approval") {
      return res.status(400).json({ error: "Challan is not in pending_approval state" });
    }

    const user = req.adminUser!;
    const approverId = realAdminUserId(user);
    if (approverId && challan.collectedBy && challan.collectedBy === approverId) {
      return res.status(403).json({ error: "Self-approval not permitted — the collector cannot approve their own payment" });
    }

    // tenantId scopes COA resolution so JE lines reference this tenant's accounts only
    return applyMarkPaid(id, challan, req, res, approverId, tenantId);
  } catch (err) {
    req.log.error({ err }, "Failed to approve challan");
    return res.status(500).json({ error: "Failed to approve challan" });
  }
});

// POST /admin/fee-challans/:id/reject — Checker rejects a pending-approval challan
router.post("/admin/fee-challans/:id/reject", requireRole("fees", "post"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!await resolveChallanTenant(req, id)) return res.status(403).json({ error: "Challan not found in this tenant" });
    const existing = await db.select().from(feeChallansTable).where(eq(feeChallansTable.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Challan not found" });
    const challan = existing[0];
    if (challan.status !== "pending_approval") {
      return res.status(400).json({ error: "Challan is not in pending_approval state" });
    }
    const { reason } = req.body ?? {};
    await db.execute(sql`
      UPDATE fee_challans SET
        status       = 'pending',
        collected_by = NULL,
        paid_amount  = NULL,
        remarks      = ${reason ? `[REJECTED: ${String(reason).trim()}]` : "[REJECTED by checker]"}
      WHERE id = ${id}::uuid
    `);
    const [updated] = await db.select().from(feeChallansTable).where(eq(feeChallansTable.id, id)).limit(1);
    return res.json({ ...updated, paidAt: updated.paidAt?.toISOString() ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to reject challan");
    return res.status(500).json({ error: "Failed to reject challan" });
  }
});

async function applyMarkPaid(
  id: string,
  challan: any,
  req: Request,
  res: Response,
  approvedById: string | null = null,
  tenantId: string | null = null,
) {
  try {
    const { remarks, paidAmount, paymentMethod, accountTitle, bankAccountId, paidAt: paidAtRaw } = req.body ?? {};

    const instalmentDelta   = typeof paidAmount === "number" && paidAmount > 0 ? paidAmount : (challan.paidAmount ?? challan.amount);
    const previouslyPaid    = typeof challan.paidAmount === "number" ? challan.paidAmount : 0;
    const amountPaid = challan.status === "partial" ? previouslyPaid + instalmentDelta : instalmentDelta;
    const newStatus  = amountPaid >= challan.amount ? "paid" : "partial";

    let resolvedMethod  = paymentMethod?.trim() || challan.paymentMethod || null;
    let resolvedTitle   = accountTitle?.trim() || challan.accountTitle || null;
    let resolvedAcctId  = bankAccountId?.trim() || null;
    let bankCoaId: string | null = null;
    if (resolvedAcctId) {
      const acctRows = await db.execute(
        sql`SELECT type, account_title, bank_name, coa_id FROM bank_accounts WHERE id = ${resolvedAcctId}::uuid LIMIT 1`
      );
      if (acctRows.rows.length) {
        const acct = acctRows.rows[0] as any;
        resolvedMethod = acct.type;
        resolvedTitle  = acct.bank_name ? `${acct.bank_name} — ${acct.account_title}` : acct.account_title;
        bankCoaId = acct.coa_id ?? null;
      }
    }

    // Tenant-scoped fee type lookup — prevents cross-tenant COA reference
    const ftFilter = tenantId
      ? and(eq(feeTypesTable.id, challan.feeTypeId), eq(feeTypesTable.tenantId, tenantId))
      : eq(feeTypesTable.id, challan.feeTypeId);
    const [ftRow] = await db
      .select({ coaId: feeTypesTable.coaId })
      .from(feeTypesTable)
      .where(ftFilter)
      .limit(1);
    const feeTypeCoaId = ftRow?.coaId ?? null;

    const todayUtc = new Date().toISOString().slice(0, 10);
    if (paidAtRaw && /^\d{4}-\d{2}-\d{2}$/.test(String(paidAtRaw)) && String(paidAtRaw) > todayUtc) {
      return res.status(400).json({ error: "Payment date cannot be in the future", field: "paidAt" });
    }

    const paidAtDate = paidAtRaw && /^\d{4}-\d{2}-\d{2}$/.test(String(paidAtRaw))
      ? new Date(`${paidAtRaw}T12:00:00Z`)
      : new Date();

    const approvedAtClause = approvedById ? sql`, approved_by = ${approvedById}::uuid, approved_at = NOW()` : sql``;

    await db.execute(sql`
      UPDATE fee_challans SET
        status         = ${newStatus},
        paid_at        = ${paidAtDate.toISOString()},
        paid_amount    = ${amountPaid},
        payment_method = ${resolvedMethod},
        account_title  = ${resolvedTitle},
        remarks        = ${remarks?.trim() || challan.remarks || null}
      WHERE id = ${id}::uuid
    `);

    if (approvedById) {
      await db.execute(sql`
        UPDATE fee_challans SET approved_by = ${approvedById}::uuid, approved_at = NOW()
        WHERE id = ${id}::uuid
      `);
    }

    const [updated] = await db.select().from(feeChallansTable).where(eq(feeChallansTable.id, id)).limit(1);

    // Tenant-scoped COA fallback — ensures cash account belongs to this tenant's COA
    if (!bankCoaId) {
      const cashCoa = await coaByCode("1110", tenantId) ?? await coaByCode("1100", tenantId);
      if (cashCoa) bankCoaId = cashCoa.id;
    }

    // Payment JE: DR bank, CR student receivable (or fee income if sub-ledger not yet synced)
    let studentCoaIdForPayment: string | null = null;
    if (challan.studentId && tenantId) {
      const { rows: sr } = await pool.query<{ coa_id: string | null }>(
        `SELECT coa_id FROM students WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
        [challan.studentId, tenantId],
      );
      studentCoaIdForPayment = sr[0]?.coa_id ?? null;
    }
    const paymentCreditCoaId = studentCoaIdForPayment ?? feeTypeCoaId;

    if (bankCoaId && paymentCreditCoaId) {
      const paidDate = new Date().toISOString().slice(0, 10);
      const [bankCoa, creditCoa] = await Promise.all([
        coaById(bankCoaId, tenantId),
        coaById(paymentCreditCoaId, tenantId),
      ]);
      if (bankCoa && creditCoa) {
        void tryCreateAndPostJE({
          tenantId,
          date:         paidDate,
          description:  `Fee payment — ${challan.challanNumber ?? id}`,
          reference:    challan.challanNumber ?? null,
          sourceModule: "fee",
          sourceRefId:  id,
          lines: [
            { coaId: bankCoaId,          coaCode: bankCoa.code,   coaName: bankCoa.name,   debitAmount: instalmentDelta, creditAmount: 0,               narration: resolvedTitle ?? resolvedMethod ?? null },
            { coaId: paymentCreditCoaId, coaCode: creditCoa.code, coaName: creditCoa.name, debitAmount: 0,               creditAmount: instalmentDelta, narration: `Challan ${challan.challanNumber ?? id}` },
          ],
        }, req.log);
      }
    }

    return res.json({ ...updated, paidAt: updated.paidAt?.toISOString() ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to apply mark paid");
    return res.status(500).json({ error: "Failed to process payment" });
  }
}

// PUT /admin/fee-challans/:id/mark-paid
// Named users must use the collect → approve flow unless they hold "edit" permission
// (or higher) in the fees module — that permission level is what unlocks direct
// mark-paid, bypassing collect→approve.
router.put("/admin/fee-challans/:id/mark-paid", requireRole("fees", "edit"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tenantId = await resolveChallanTenant(req, id);
    if (!tenantId) return res.status(403).json({ error: "Challan not found in this tenant" });
    const { remarks, paidAmount, paymentMethod, accountTitle, bankAccountId, paidAt: paidAtRaw } = req.body ?? {};

    const existing = await db.select().from(feeChallansTable).where(eq(feeChallansTable.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Challan not found" });

    const challan = existing[0];
    // paidAmount = instalment delta from the client; add to existing cumulative total
    const instalmentDelta   = typeof paidAmount === "number" && paidAmount > 0 ? paidAmount : challan.amount;
    const previouslyPaid    = typeof challan.paidAmount === "number" ? challan.paidAmount : 0;
    // If challan is already partial, accumulate; otherwise treat as fresh payment
    const amountPaid = challan.status === "partial" ? previouslyPaid + instalmentDelta : instalmentDelta;
    const newStatus  = amountPaid >= challan.amount ? "paid" : "partial";

    // Resolve account details from bank_accounts if bankAccountId provided
    let resolvedMethod  = paymentMethod?.trim() || null;
    let resolvedTitle   = accountTitle?.trim() || null;
    let resolvedAcctId  = bankAccountId?.trim() || null;
    let bankCoaId: string | null = null;
    if (resolvedAcctId) {
      const acctRows = await db.execute(
        sql`SELECT type, account_title, bank_name, coa_id FROM bank_accounts WHERE id = ${resolvedAcctId}::uuid LIMIT 1`
      );
      if (acctRows.rows.length) {
        const acct = acctRows.rows[0] as any;
        resolvedMethod = acct.type;
        resolvedTitle  = acct.bank_name ? `${acct.bank_name} — ${acct.account_title}` : acct.account_title;
        bankCoaId = acct.coa_id ?? null;
      }
    }

    // Tenant-scoped fee type lookup — prevents cross-tenant COA reference
    const [ftRow] = await db
      .select({ coaId: feeTypesTable.coaId })
      .from(feeTypesTable)
      .where(and(eq(feeTypesTable.id, challan.feeTypeId), eq(feeTypesTable.tenantId, tenantId)))
      .limit(1);
    const feeTypeCoaId = ftRow?.coaId ?? null;

    const todayUtc = new Date().toISOString().slice(0, 10);
    if (paidAtRaw && /^\d{4}-\d{2}-\d{2}$/.test(String(paidAtRaw)) && String(paidAtRaw) > todayUtc) {
      return res.status(400).json({ error: "Payment date cannot be in the future", field: "paidAt" });
    }

    const paidAtDate = paidAtRaw && /^\d{4}-\d{2}-\d{2}$/.test(String(paidAtRaw))
      ? new Date(`${paidAtRaw}T12:00:00Z`)
      : new Date();

    await db.execute(sql`
      UPDATE fee_challans SET
        status         = ${newStatus},
        paid_at        = ${paidAtDate.toISOString()},
        paid_amount    = ${amountPaid},
        payment_method = ${resolvedMethod},
        account_title  = ${resolvedTitle},
        remarks        = ${remarks?.trim() || null}
      WHERE id = ${id}::uuid
    `);

    const [updated] = await db.select().from(feeChallansTable).where(eq(feeChallansTable.id, id)).limit(1);

    // Tenant-scoped COA resolution — ensures cash account belongs to this tenant's COA
    if (!bankCoaId) {
      const cashCoa = await coaByCode("1110", tenantId) ?? await coaByCode("1100", tenantId);
      if (cashCoa) bankCoaId = cashCoa.id;
    }

    // Payment JE: DR bank, CR student receivable (or fee income if sub-ledger not yet synced)
    let markPaidStudentCoaId: string | null = null;
    if (challan.studentId && tenantId) {
      const { rows: sr2 } = await pool.query<{ coa_id: string | null }>(
        `SELECT coa_id FROM students WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
        [challan.studentId, tenantId],
      );
      markPaidStudentCoaId = sr2[0]?.coa_id ?? null;
    }
    const markPaidCreditCoaId = markPaidStudentCoaId ?? feeTypeCoaId;

    if (bankCoaId && markPaidCreditCoaId) {
      const paidDate = new Date().toISOString().slice(0, 10);
      const [bankCoa, creditCoa2] = await Promise.all([
        coaById(bankCoaId, tenantId),
        coaById(markPaidCreditCoaId, tenantId),
      ]);
      if (bankCoa && creditCoa2) {
        void tryCreateAndPostJE({
          tenantId,
          date:         paidDate,
          description:  `Fee payment — ${challan.challanNumber ?? id}`,
          reference:    challan.challanNumber ?? null,
          sourceModule: "fee",
          sourceRefId:  id,
          lines: [
            { coaId: bankCoaId,           coaCode: bankCoa.code,    coaName: bankCoa.name,    debitAmount: instalmentDelta, creditAmount: 0,               narration: resolvedTitle ?? paymentMethod ?? null },
            { coaId: markPaidCreditCoaId, coaCode: creditCoa2.code, coaName: creditCoa2.name, debitAmount: 0,               creditAmount: instalmentDelta, narration: `Challan ${challan.challanNumber ?? id}` },
          ],
        }, req.log);
      }
    }

    return res.json({ ...updated, paidAt: updated.paidAt?.toISOString() ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to mark challan as paid");
    return res.status(500).json({ error: "Failed to mark challan as paid" });
  }
});

// DELETE /admin/fee-challans/:id
router.delete("/admin/fee-challans/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!await resolveChallanTenant(req, id)) return res.status(403).json({ error: "Challan not found in this tenant" });
    const existing = await db.select().from(feeChallansTable).where(eq(feeChallansTable.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Challan not found" });
    if (existing[0].status === "paid") return res.status(409).json({ error: "Cannot delete a paid challan" });

    await db.delete(feeChallansTable).where(eq(feeChallansTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete challan");
    return res.status(500).json({ error: "Failed to delete challan" });
  }
});

// POST /admin/fee-challans/bulk-collect
// Mark multiple challans as paid in one bulk request.
// Body: { date: string, bankAccountId?: string, entries: [{ challanIds: string[], paidAmount?: number, remarks?: string }] }
// paidAmount is the total collected from the student — distributed across challans in order.
// If paidAmount is omitted, all challans are marked fully paid.
router.post("/admin/fee-challans/bulk-collect", requireRole("fees", "draft"), async (req: Request, res: Response) => {
  try {
    const { date, bankAccountId, entries } = req.body ?? {};
    const collectorUser = req.adminUser;
    const collectedBy = realAdminUserId(collectorUser);
    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "date is required" });
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: "entries must be a non-empty array" });
    }

    // Resolve admin tenant — required for ownership-scoped challan selection
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const paidAtDate = new Date(`${date}T12:00:00Z`);

    // Resolve bank account once for all entries
    let resolvedMethod:  string | null = null;
    let resolvedTitle:   string | null = null;
    let bankCoaId:       string | null = null;

    if (bankAccountId?.trim()) {
      const acctRows = await db.execute(
        sql`SELECT type, account_title, bank_name, coa_id
            FROM bank_accounts WHERE id = ${bankAccountId}::uuid LIMIT 1`
      );
      if (acctRows.rows.length) {
        const acct = acctRows.rows[0] as any;
        resolvedMethod = acct.type;
        resolvedTitle  = acct.bank_name
          ? `${acct.bank_name} — ${acct.account_title}`
          : acct.account_title;
        bankCoaId = acct.coa_id ?? null;
      }
    }

    // Tenant-scoped COA fallback — ensures cash account belongs to this tenant's COA
    if (!bankCoaId) {
      const cashCoa = await coaByCode("1110", tenantId) ?? await coaByCode("1100", tenantId);
      if (cashCoa) bankCoaId = cashCoa.id;
    }

    let totalUpdated = 0;

    const entryResults: {
      entryIndex: number;
      success: boolean;
      updated: number;
      error?: string;
    }[] = [];

    for (let ei = 0; ei < entries.length; ei++) {
      const { challanIds, paidAmount: entryPaid, remarks } = entries[ei] as {
        challanIds: string[];
        paidAmount?: number;
        remarks?: string;
      };

      if (!Array.isArray(challanIds) || challanIds.length === 0) {
        entryResults.push({ entryIndex: ei, success: true, updated: 0 });
        continue;
      }

      try {
        // Load challan rows — ownership-scoped via inner-join to students tenant filter
        // This prevents a tenant-A admin from processing tenant-B challans even if IDs leak
        const challanRows = await db
          .select({
            id:            feeChallansTable.id,
            studentId:     feeChallansTable.studentId,
            feeTypeId:     feeChallansTable.feeTypeId,
            amount:        feeChallansTable.amount,
            challanNumber: feeChallansTable.challanNumber,
            status:        feeChallansTable.status,
            academicYearId: feeChallansTable.academicYearId,
          })
          .from(feeChallansTable)
          .innerJoin(
            studentsTable,
            and(
              eq(feeChallansTable.studentId, studentsTable.id),
              eq(studentsTable.tenantId, tenantId),
            ),
          )
          .where(
            and(
              inArray(feeChallansTable.id, challanIds),
              eq(feeChallansTable.status, "pending"),
            )
          );

        const challanMap = new Map(challanRows.map(c => [c.id, c]));
        const orderedChallans = challanIds
          .map(id => challanMap.get(id))
          .filter((c): c is typeof challanRows[number] => !!c);

        // Distribute paid amount across challans in input order.
        // remaining === null means "mark everything fully paid".
        let remaining: number | null =
          typeof entryPaid === "number" && entryPaid > 0 ? entryPaid : null;
        let entryUpdated = 0;

        for (const challan of orderedChallans) {
          if (remaining !== null && remaining <= 0) break;

          const amountForThis =
            remaining === null
              ? challan.amount
              : Math.min(challan.amount, remaining);

          // Maker submits for approval — status transitions to pending_approval.
          // Payment details are persisted so the checker approve step can use them.
          // JEs are created only when the checker approves (via applyMarkPaid).
          if (collectedBy) {
            await db.execute(sql`
              UPDATE fee_challans SET
                status         = 'pending_approval',
                paid_amount    = ${amountForThis},
                payment_method = ${resolvedMethod},
                account_title  = ${resolvedTitle},
                remarks        = ${remarks?.trim() || null},
                collected_by   = ${collectedBy}::uuid,
                updated_at     = NOW()
              WHERE id = ${challan.id}::uuid
            `);
          } else {
            // env-admin (no DB user) — bypass maker-checker and mark paid directly
            await db.execute(sql`
              UPDATE fee_challans SET
                status         = 'paid',
                paid_at        = ${paidAtDate.toISOString()},
                paid_amount    = ${amountForThis},
                payment_method = ${resolvedMethod},
                account_title  = ${resolvedTitle},
                remarks        = ${remarks?.trim() || null},
                updated_at     = NOW()
              WHERE id = ${challan.id}::uuid
            `);
          }

          if (remaining !== null) remaining -= amountForThis;
          entryUpdated++;
          totalUpdated++;

          // JEs are only created for env-admin (direct pay) path; named-user collections
          // go through the checker approve endpoint which calls applyMarkPaid.
          if (!collectedBy && bankCoaId) {
            // Fetch student coa_id for receivable-based payment JE
            const { rows: bsSr } = await pool.query<{ coa_id: string | null }>(
              `SELECT coa_id FROM students WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
              [challan.studentId, tenantId],
            );
            const bsStudentCoaId = bsSr[0]?.coa_id ?? null;

            // Tenant-scoped fee type lookup — prevents cross-tenant COA reference
            const [ftRow] = await db
              .select({ coaId: feeTypesTable.coaId })
              .from(feeTypesTable)
              .where(and(eq(feeTypesTable.id, challan.feeTypeId), eq(feeTypesTable.tenantId, tenantId)))
              .limit(1);
            const feeTypeCoaId = ftRow?.coaId ?? null;

            const bulkCreditCoaId = bsStudentCoaId ?? feeTypeCoaId;
            if (bulkCreditCoaId) {
              const [bankCoa, creditCoa3] = await Promise.all([
                coaById(bankCoaId, tenantId),
                coaById(bulkCreditCoaId, tenantId),
              ]);
              if (bankCoa && creditCoa3) {
                void tryCreateAndPostJE(
                  {
                    tenantId,
                    date,
                    description:  `Bulk fee payment — ${challan.challanNumber ?? challan.id}`,
                    reference:    challan.challanNumber ?? null,
                    sourceModule: "fee",
                    sourceRefId:  challan.id,
                    lines: [
                      {
                        coaId: bankCoaId,      coaCode: bankCoa.code,    coaName: bankCoa.name,
                        debitAmount: amountForThis, creditAmount: 0,
                        narration: resolvedTitle ?? resolvedMethod ?? null,
                      },
                      {
                        coaId: bulkCreditCoaId, coaCode: creditCoa3.code, coaName: creditCoa3.name,
                        debitAmount: 0, creditAmount: amountForThis,
                        narration: `Challan ${challan.challanNumber ?? challan.id}`,
                      },
                    ],
                  },
                  req.log,
                );
              }
            }
          }
        }

        entryResults.push({ entryIndex: ei, success: true, updated: entryUpdated });
      } catch (entryErr: any) {
        req.log.warn({ err: entryErr, entryIndex: ei }, "bulk-collect: entry failed");
        entryResults.push({
          entryIndex: ei,
          success: false,
          updated: 0,
          error: entryErr?.message ?? "Failed to process entry",
        });
      }
    }

    return res.json({ ok: true, updated: totalUpdated, results: entryResults });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk collect");
    return res.status(500).json({ error: "Failed to record payments" });
  }
});

// GET /admin/fee-challans/pending-by-student?studentId=
// Returns pending challan ids + amounts for a student (lightweight version)
router.get("/admin/fee-challans/pending-by-student", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { studentId } = req.query as Record<string, string>;
    if (!studentId) return res.status(400).json({ error: "studentId required" });

    const challans = await db
      .select({
        id: feeChallansTable.id,
        amount: feeChallansTable.amount,
        month: feeChallansTable.month,
        dueDate: feeChallansTable.dueDate,
        feeTypeName: feeTypesTable.name,
        status: feeChallansTable.status,
      })
      .from(feeChallansTable)
      .innerJoin(feeTypesTable, and(eq(feeChallansTable.feeTypeId, feeTypesTable.id), eq(feeTypesTable.tenantId, tenantId)))
      .innerJoin(studentsTable, and(eq(feeChallansTable.studentId, studentsTable.id), eq(studentsTable.tenantId, tenantId)))
      .where(and(
        eq(feeChallansTable.studentId, studentId),
        eq(feeChallansTable.status, "pending"),
      ))
      .orderBy(asc(feeChallansTable.dueDate));

    return res.json(challans);
  } catch (err) {
    req.log.error({ err }, "Failed to get pending challans");
    return res.status(500).json({ error: "Failed to load pending challans" });
  }
});

// ── Fee Reports ───────────────────────────────────────────────────────────────

// GET /admin/fee-reports/collection-summary
// Aggregate totals by fee type for a given year+class+month filter
router.get("/admin/fee-reports/collection-summary", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { academicYearId, classCode, month, sectionId } = req.query as Record<string, string>;
    if (!academicYearId) return res.status(400).json({ error: "academicYearId is required" });

    const studentFilter: any[] = [eq(studentsTable.tenantId, tenantId)];
    if (classCode) studentFilter.push(eq(studentsTable.classCode, classCode));
    if (sectionId) studentFilter.push(eq(studentsTable.sectionId, sectionId));

    // Get student ids matching filter
    let studentIds: string[];
    if (studentFilter.length) {
      const students = await db.select({ id: studentsTable.id }).from(studentsTable).where(and(...studentFilter));
      studentIds = students.map(s => s.id);
      if (!studentIds.length) return res.json({ totalBilled: 0, totalPaid: 0, totalPending: 0, byFeeType: [], byStatus: [], byClass: [] });
    } else {
      studentIds = [];
    }

    const challanFilter: any[] = [eq(feeChallansTable.academicYearId, academicYearId)];
    if (studentIds.length) challanFilter.push(inArray(feeChallansTable.studentId, studentIds));
    if (month) challanFilter.push(eq(feeChallansTable.month, month));

    const challans = await db
      .select({
        feeTypeId: feeChallansTable.feeTypeId,
        feeTypeName: feeTypesTable.name,
        amount: feeChallansTable.amount,
        status: feeChallansTable.status,
        studentId: feeChallansTable.studentId,
        studentClass: studentsTable.classCode,
      })
      .from(feeChallansTable)
      .innerJoin(feeTypesTable, and(eq(feeChallansTable.feeTypeId, feeTypesTable.id), eq(feeTypesTable.tenantId, tenantId)))
      .innerJoin(studentsTable, and(eq(feeChallansTable.studentId, studentsTable.id), eq(studentsTable.tenantId, tenantId)))
      .where(and(...challanFilter));

    // Aggregate by fee type
    const byFeeType: Record<string, { feeTypeName: string; billed: number; paid: number; pending: number; count: number }> = {};
    // Aggregate by class
    const byClass: Record<string, { classCode: string; billed: number; paid: number; pending: number }> = {};
    // Aggregate by status
    const byStatus: Record<string, number> = { pending: 0, paid: 0, overdue: 0 };

    let totalBilled = 0;
    let totalPaid   = 0;

    for (const c of challans) {
      totalBilled += c.amount;
      if (c.status === "paid") totalPaid += c.amount;
      byStatus[c.status] = (byStatus[c.status] ?? 0) + c.amount;

      if (!byFeeType[c.feeTypeId]) byFeeType[c.feeTypeId] = { feeTypeName: c.feeTypeName, billed: 0, paid: 0, pending: 0, count: 0 };
      byFeeType[c.feeTypeId].billed += c.amount;
      if (c.status === "paid") byFeeType[c.feeTypeId].paid += c.amount;
      else byFeeType[c.feeTypeId].pending += c.amount;
      byFeeType[c.feeTypeId].count++;

      const cls = c.studentClass;
      if (!byClass[cls]) byClass[cls] = { classCode: cls, billed: 0, paid: 0, pending: 0 };
      byClass[cls].billed += c.amount;
      if (c.status === "paid") byClass[cls].paid += c.amount;
      else byClass[cls].pending += c.amount;
    }

    return res.json({
      totalBilled,
      totalPaid,
      totalPending: totalBilled - totalPaid,
      byFeeType: Object.values(byFeeType).sort((a, b) => b.billed - a.billed),
      byClass: Object.values(byClass).sort((a, b) => a.classCode.localeCompare(b.classCode)),
      byStatus: Object.entries(byStatus).map(([status, amount]) => ({ status, amount })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get collection summary");
    return res.status(500).json({ error: "Failed to load collection summary" });
  }
});

// GET /admin/fee-reports/challan-ledger
// Paginated list of all challans with filters
router.get("/admin/fee-reports/challan-ledger", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { academicYearId, classCode, sectionId, month, status, page = "1", pageSize = "50" } = req.query as Record<string, string>;
    if (!academicYearId) return res.status(400).json({ error: "academicYearId is required" });

    const pg   = Math.max(1, parseInt(page) || 1);
    const ps   = Math.min(2000, Math.max(10, parseInt(pageSize) || 50));
    const offset = (pg - 1) * ps;

    const studentFilter: any[] = [eq(studentsTable.tenantId, tenantId)];
    if (classCode) studentFilter.push(eq(studentsTable.classCode, classCode));
    if (sectionId) studentFilter.push(eq(studentsTable.sectionId, sectionId));

    let studentIds: string[] = [];
    if (studentFilter.length) {
      const students = await db.select({ id: studentsTable.id }).from(studentsTable).where(and(...studentFilter));
      studentIds = students.map(s => s.id);
      if (!studentIds.length) return res.json({ total: 0, page: pg, pageSize: ps, rows: [] });
    }

    const challanFilter: any[] = [eq(feeChallansTable.academicYearId, academicYearId)];
    if (studentIds.length) challanFilter.push(inArray(feeChallansTable.studentId, studentIds));
    if (month)  challanFilter.push(eq(feeChallansTable.month, month));
    if (status) challanFilter.push(eq(feeChallansTable.status, status));

    const [countRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(feeChallansTable)
      .innerJoin(studentsTable, and(eq(feeChallansTable.studentId, studentsTable.id), eq(studentsTable.tenantId, tenantId)))
      .where(and(...challanFilter));

    const rows = await db
      .select({
        id: feeChallansTable.id,
        challanNumber: feeChallansTable.challanNumber,
        studentId: feeChallansTable.studentId,
        applicantId: studentsTable.applicantId,
        fullName: studentsTable.fullName,
        fatherName: studentsTable.fatherName,
        classCode: studentsTable.classCode,
        feeTypeName: feeTypesTable.name,
        feeCode: feeTypesTable.feeCode,
        amount: feeChallansTable.amount,
        month: feeChallansTable.month,
        issueDate: feeChallansTable.issueDate,
        dueDate: feeChallansTable.dueDate,
        status: feeChallansTable.status,
        paidAt: feeChallansTable.paidAt,
        remarks: feeChallansTable.remarks,
      })
      .from(feeChallansTable)
      .innerJoin(feeTypesTable, and(eq(feeChallansTable.feeTypeId, feeTypesTable.id), eq(feeTypesTable.tenantId, tenantId)))
      .innerJoin(studentsTable, and(eq(feeChallansTable.studentId, studentsTable.id), eq(studentsTable.tenantId, tenantId)))
      .where(and(...challanFilter))
      .orderBy(desc(feeChallansTable.issueDate), asc(studentsTable.fullName))
      .limit(ps)
      .offset(offset);

    return res.json({
      total: Number(countRow?.n ?? 0),
      page: pg,
      pageSize: ps,
      rows: rows.map(r => ({ ...r, paidAt: r.paidAt ? r.paidAt.toISOString() : null })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get challan ledger");
    return res.status(500).json({ error: "Failed to load challan ledger" });
  }
});

// GET /admin/fee-reports/class-wise
// Per-class breakdown: for each class → per fee type totals
router.get("/admin/fee-reports/class-wise", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { academicYearId, month } = req.query as Record<string, string>;
    if (!academicYearId) return res.status(400).json({ error: "academicYearId is required" });

    const challanFilter: any[] = [eq(feeChallansTable.academicYearId, academicYearId)];
    if (month) challanFilter.push(eq(feeChallansTable.month, month));

    const [feeTypes, classes, challans] = await Promise.all([
      db.select().from(feeTypesTable).where(and(eq(feeTypesTable.active, true), eq(feeTypesTable.tenantId, tenantId))).orderBy(asc(feeTypesTable.sortOrder)),
      db.select().from(classesTable).where(and(eq(classesTable.active, true), eq(classesTable.tenantId, tenantId))).orderBy(asc(classesTable.sortOrder)),
      db.select({
        classCode: studentsTable.classCode,
        feeTypeId: feeChallansTable.feeTypeId,
        amount: feeChallansTable.amount,
        status: feeChallansTable.status,
      })
        .from(feeChallansTable)
        .innerJoin(studentsTable, and(eq(feeChallansTable.studentId, studentsTable.id), eq(studentsTable.tenantId, tenantId)))
        .innerJoin(feeTypesTable, and(eq(feeChallansTable.feeTypeId, feeTypesTable.id), eq(feeTypesTable.tenantId, tenantId)))
        .where(and(...challanFilter)),
    ]);

    // Build pivot: classCode -> feeTypeId -> { billed, paid }
    type Cell = { billed: number; paid: number };
    const pivot: Record<string, Record<string, Cell>> = {};
    for (const c of challans) {
      if (!pivot[c.classCode]) pivot[c.classCode] = {};
      if (!pivot[c.classCode][c.feeTypeId]) pivot[c.classCode][c.feeTypeId] = { billed: 0, paid: 0 };
      pivot[c.classCode][c.feeTypeId].billed += c.amount;
      if (c.status === "paid") pivot[c.classCode][c.feeTypeId].paid += c.amount;
    }

    return res.json({ feeTypes, classes, pivot });
  } catch (err) {
    req.log.error({ err }, "Failed to get class-wise report");
    return res.status(500).json({ error: "Failed to load class-wise report" });
  }
});

// GET /admin/fee-reports/fee-status
// Per-challan comparison of Standard (schedule) vs Decided (billed) fee, discount,
// fine, amount paid, balance, and normalised Paid/Unpaid/Partial status.
// Filters: academicYearId (required), classCode, feeTypeId, status, studentSearch,
//          dateFrom/dateTo (issue date range)
// Summary: totalStandard, totalDecided, totalDiscount, totalFine, totalPaid, totalOutstanding
router.get("/admin/fee-reports/fee-status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const {
      academicYearId, classCode, feeTypeId, status, studentSearch,
      dateFrom, dateTo, page = "1", pageSize = "50", format,
    } = req.query as Record<string, string>;
    if (!academicYearId) return res.status(400).json({ error: "academicYearId is required" });

    // Scope by fee_challans.tenant_id (not students.tenant_id, which is null
    // for some legacy student rows) — fee_challans always carries its own
    // authoritative tenant_id and is the RLS-scoped column for this table.
    const conditions: string[] = ["fc.tenant_id = $1", "fc.academic_year_id = $2::uuid"];
    const params: unknown[] = [tenantId, academicYearId];

    function add(expr: string, val: unknown) {
      params.push(val);
      conditions.push(expr.replace("?", `$${params.length}`));
    }

    // Class filter matches against the student's enrollment for this academic
    // year (falling back to the students table's own class_code when no
    // enrollment row exists yet) — the enrollment is the authoritative
    // per-year class, since students.class_code can go stale after promotions.
    if (classCode) add("COALESCE(se.class_code, s.class_code) = ?", classCode);
    if (feeTypeId) add("fc.fee_type_id = ?::uuid", feeTypeId);
    // fee_challans.issue_date is stored as text (YYYY-MM-DD), so compare
    // lexically rather than casting to ::date (fails: "text >= date").
    if (dateFrom)  add("fc.issue_date >= ?", dateFrom);
    if (dateTo)    add("fc.issue_date <= ?", dateTo);
    if (studentSearch?.trim()) {
      const pattern = `%${studentSearch.trim().toLowerCase()}%`;
      params.push(pattern, pattern, pattern);
      const [p1, p2, p3] = [params.length - 2, params.length - 1, params.length];
      conditions.push(
        `(LOWER(s.full_name) LIKE $${p1} OR LOWER(s.applicant_id) LIKE $${p2} OR LOWER(COALESCE(s.roll_no, '')) LIKE $${p3})`,
      );
    }
    if (status === "paid")        conditions.push("fc.status = 'paid'");
    else if (status === "partial") conditions.push("fc.status = 'partial'");
    else if (status === "unpaid")  conditions.push("fc.status IN ('pending', 'pending_approval', 'overdue')");

    const where = `WHERE ${conditions.join(" AND ")}`;

    const selectCols = `
      fc.id,
      fc.challan_number,
      fc.issue_date,
      fc.due_date,
      fc.gross_amount                                          AS standard_fee,
      fc.amount                                                AS decided_fee,
      fc.discount_amount                                       AS discount,
      CASE WHEN ft.fee_code IN ('attendance-fine', 'late-fee-fine') THEN fc.amount ELSE 0 END AS fine,
      COALESCE(fc.paid_amount, 0)                              AS paid_amount,
      (fc.amount - COALESCE(fc.paid_amount, 0))                AS balance,
      CASE
        WHEN fc.status = 'paid'    THEN 'paid'
        WHEN fc.status = 'partial' THEN 'partial'
        ELSE 'unpaid'
      END                                                       AS payment_status,
      fc.status                                                AS raw_status,
      s.applicant_id,
      s.roll_no,
      s.full_name                                               AS student_name,
      COALESCE(se.class_code, s.class_code)                    AS class_code,
      sec.name                                                 AS section_name,
      ft.name                                                  AS fee_type_name,
      ay.name                                                  AS academic_year_name
    `;

    const joins = `
      FROM fee_challans fc
      JOIN students s ON s.id = fc.student_id
      LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.academic_year_id = fc.academic_year_id
      LEFT JOIN sections sec ON sec.id = s.section_id
      JOIN fee_types ft ON ft.id = fc.fee_type_id
      JOIN academic_years ay ON ay.id = fc.academic_year_id
    `;

    const orderBy = `ORDER BY fc.issue_date DESC, s.full_name ASC`;

    if (format === "csv") {
      const CSV_HEADERS = [
        "challan_number", "student_name", "applicant_id", "roll_no", "class_code", "section_name",
        "fee_type_name", "academic_year_name", "issue_date", "due_date",
        "standard_fee", "decided_fee", "discount", "fine", "paid_amount", "balance", "payment_status",
      ];
      return await streamCsv(res, "fee-status-report.csv", CSV_HEADERS, async (limit, offset) => {
        const r = await pool.query(
          `SELECT ${selectCols} ${joins} ${where} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        );
        return r.rows as Record<string, unknown>[];
      });
    }

    const pg     = Math.max(1, parseInt(page, 10) || 1);
    const ps     = Math.min(500, Math.max(1, parseInt(pageSize, 10) || 50));
    const offset = (pg - 1) * ps;

    const [countRes, rowsRes, summaryRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n ${joins} ${where}`, params),
      pool.query(
        `SELECT ${selectCols} ${joins} ${where} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, ps, offset],
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(fc.gross_amount), 0)::bigint                          AS total_standard,
           COALESCE(SUM(fc.amount), 0)::bigint                                AS total_decided,
           COALESCE(SUM(fc.discount_amount), 0)::bigint                       AS total_discount,
           COALESCE(SUM(CASE WHEN ft.fee_code IN ('attendance-fine', 'late-fee-fine') THEN fc.amount ELSE 0 END), 0)::bigint AS total_fine,
           COALESCE(SUM(COALESCE(fc.paid_amount, 0)), 0)::bigint              AS total_paid,
           COALESCE(SUM(fc.amount - COALESCE(fc.paid_amount, 0)), 0)::bigint  AS total_outstanding
         ${joins} ${where}`,
        params,
      ),
    ]);

    const total   = Number((countRes.rows[0] as any)?.n ?? 0);
    const summary = summaryRes.rows[0] as any ?? {};
    // The FeeStatusReportRow OpenAPI schema is camelCase; the raw pg driver
    // returns the snake_case column aliases from selectCols verbatim, so map
    // explicitly rather than shipping snake_case keys the client can't read.
    const rows = (rowsRes.rows as any[]).map((r) => ({
      id: r.id,
      challanNumber: r.challan_number,
      studentName: r.student_name,
      applicantId: r.applicant_id,
      rollNo: r.roll_no,
      classCode: r.class_code,
      sectionName: r.section_name,
      feeTypeName: r.fee_type_name,
      academicYearName: r.academic_year_name,
      issueDate: r.issue_date,
      dueDate: r.due_date,
      standardFee: Number(r.standard_fee ?? 0),
      decidedFee: Number(r.decided_fee ?? 0),
      discount: Number(r.discount ?? 0),
      fine: Number(r.fine ?? 0),
      paidAmount: Number(r.paid_amount ?? 0),
      balance: Number(r.balance ?? 0),
      paymentStatus: r.payment_status,
    }));
    return res.json({
      total, page: pg, pageSize: ps, rows,
      summary: {
        totalStandard:     Number(summary.total_standard     ?? 0),
        totalDecided:      Number(summary.total_decided      ?? 0),
        totalDiscount:     Number(summary.total_discount     ?? 0),
        totalFine:         Number(summary.total_fine         ?? 0),
        totalPaid:         Number(summary.total_paid         ?? 0),
        totalOutstanding:  Number(summary.total_outstanding  ?? 0),
      },
    });
  } catch (err) {
    req.log.error({ err }, "GET /admin/fee-reports/fee-status failed");
    return res.status(500).json({ error: "Failed to load fee status report" });
  }
});

// ── Student-wise Fee Customisation ────────────────────────────────────────────

// GET /admin/student-fee-grid?academicYearId=&q=&classCode=&guardian=&page=&pageSize=
router.get("/admin/student-fee-grid", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { academicYearId, q, classCode, guardian, page, pageSize } = req.query as Record<string, string>;
    if (!academicYearId) return res.status(400).json({ error: "academicYearId is required" });

    const pg = Math.max(1, parseInt(page ?? "1", 10));
    const ps = Math.min(2000, Math.max(1, parseInt(pageSize ?? "40", 10)));
    const offset = (pg - 1) * ps;

    // 1. Active fee types ordered by sortOrder — scoped to tenant
    const feeTypes = await db.select().from(feeTypesTable)
      .where(and(eq(feeTypesTable.active, true), eq(feeTypesTable.tenantId, tenantId))).orderBy(asc(feeTypesTable.sortOrder));

    // 2. Students (dynamic filter + pagination) — join via student_enrollments
    //    so the academic year filter uses the authoritative enrollment record,
    //    not the potentially stale academicYearId stamped on the students row.
    const whereClauses: ReturnType<typeof eq>[] = [
      eq(studentsTable.tenantId, tenantId) as any,
      eq(studentEnrollmentsTable.academicYearId, academicYearId) as any,
    ];
    if (classCode?.trim()) {
      whereClauses.push(eq(studentEnrollmentsTable.classCode, classCode.trim()) as any);
    }
    if (q?.trim()) {
      const pattern = `%${q.trim().toLowerCase()}%`;
      whereClauses.push(or(
        sql`LOWER(${studentsTable.fullName}) LIKE ${pattern}`,
        sql`LOWER(${studentsTable.applicantId}) LIKE ${pattern}`,
      ) as any);
    }
    if (guardian?.trim()) {
      const gPattern = `%${guardian.trim().toLowerCase()}%`;
      whereClauses.push(or(
        sql`LOWER(COALESCE(${studentsTable.fatherName}, '')) LIKE ${gPattern}`,
        sql`LOWER(COALESCE(${studentsTable.guardianName}, '')) LIKE ${gPattern}`,
      ) as any);
    }
    const whereClause = whereClauses.length ? and(...whereClauses) : undefined;

    // Count + paginated students in parallel — both use the enrollment join
    const enrollmentJoin = and(
      eq(studentEnrollmentsTable.studentId, studentsTable.id),
      eq(studentEnrollmentsTable.academicYearId, academicYearId),
    );
    const [countRows, studentRows] = await Promise.all([
      db.select({ n: drizzleCount() })
        .from(studentsTable)
        .innerJoin(studentEnrollmentsTable, enrollmentJoin)
        .where(whereClause),
      db.select({
        id:           studentsTable.id,
        fullName:     studentsTable.fullName,
        applicantId:     studentsTable.applicantId,
        classCode:    studentEnrollmentsTable.classCode,
        className:    classesTable.name,
        fatherName:   studentsTable.fatherName,
        guardianName: studentsTable.guardianName,
      })
        .from(studentsTable)
        .innerJoin(studentEnrollmentsTable, enrollmentJoin)
        .leftJoin(classesTable, and(eq(classesTable.code, studentEnrollmentsTable.classCode), eq(classesTable.tenantId, tenantId)))
        .where(whereClause)
        .orderBy(asc(studentEnrollmentsTable.classCode), asc(studentsTable.fullName))
        .limit(ps)
        .offset(offset),
    ]);

    const total = Number(countRows[0]?.n ?? 0);
    const students = studentRows;

    if (!students.length) return res.json({ feeTypes, students: [], total, page: pg, pageSize: ps });

    const studentIds = students.map(s => s.id);
    const classCodes = [...new Set(students.map(s => s.classCode))];

    // 3. Class schedule amounts for classes appearing in this page
    const scheduleRows = await db.select({
      classCode: feeScheduleTable.classCode,
      feeTypeId: feeScheduleTable.feeTypeId,
      amount:    feeScheduleTable.amount,
    }).from(feeScheduleTable).where(and(
      eq(feeScheduleTable.academicYearId, academicYearId),
      inArray(feeScheduleTable.classCode, classCodes),
    ));
    const scheduleMap: Record<string, Record<string, number>> = {};
    for (const r of scheduleRows) {
      if (!scheduleMap[r.classCode]) scheduleMap[r.classCode] = {};
      scheduleMap[r.classCode][r.feeTypeId] = r.amount;
    }

    // 4. Student-level overrides for this year
    const idList = studentIds.map(id => sql`${id}::uuid`);
    const overrideRes = await db.execute(sql`
      SELECT student_id, fee_type_id, amount
      FROM student_fee_overrides
      WHERE academic_year_id = ${academicYearId}::uuid
        AND student_id = ANY(ARRAY[${sql.join(idList, sql`, `)}])
    `);
    const overrideMap: Record<string, Record<string, number>> = {};
    for (const r of overrideRes.rows as any[]) {
      if (!overrideMap[r.student_id]) overrideMap[r.student_id] = {};
      overrideMap[r.student_id][r.fee_type_id] = Number(r.amount);
    }

    // 5. Locked fee types per student (has a paid challan in this year)
    const lockedRes = await db.execute(sql`
      SELECT DISTINCT student_id, fee_type_id
      FROM fee_challans
      WHERE academic_year_id = ${academicYearId}::uuid
        AND status = 'paid'
        AND student_id = ANY(ARRAY[${sql.join(idList, sql`, `)}])
    `);
    const lockedMap: Record<string, string[]> = {};
    for (const r of lockedRes.rows as any[]) {
      if (!lockedMap[r.student_id]) lockedMap[r.student_id] = [];
      lockedMap[r.student_id].push(r.fee_type_id);
    }

    return res.json({
      feeTypes,
      students: students.map(s => ({
        id:               s.id,
        fullName:         s.fullName,
        applicantId:         s.applicantId,
        classCode:        s.classCode,
        className:        s.className,
        fatherName:       s.fatherName   ?? null,
        guardianName:     s.guardianName ?? null,
        classAmounts:     scheduleMap[s.classCode] ?? {},
        overrides:        overrideMap[s.id]        ?? {},
        lockedFeeTypeIds: lockedMap[s.id]          ?? [],
      })),
      total, page: pg, pageSize: ps,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load student fee grid");
    return res.status(500).json({ error: "Failed to load student fee grid" });
  }
});

// POST /admin/student-fee-grid/save — bulk upsert / delete student overrides
router.post("/admin/student-fee-grid/save", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { academicYearId, entries } = req.body ?? {};
    if (!academicYearId || typeof academicYearId !== "string") {
      return res.status(400).json({ error: "academicYearId is required" });
    }
    if (!Array.isArray(entries) || !entries.length) {
      return res.status(400).json({ error: "entries must be a non-empty array" });
    }

    // Pre-verify all studentIds and feeTypeIds belong to tenant
    const studentIds = [...new Set(entries.map((e: any) => e.studentId).filter(Boolean))];
    const feeTypeIds = [...new Set(entries.map((e: any) => e.feeTypeId).filter(Boolean))];
    if (studentIds.length) {
      const owned = await db.select({ id: studentsTable.id }).from(studentsTable)
        .where(and(inArray(studentsTable.id, studentIds), eq(studentsTable.tenantId, tenantId)));
      const ownedSet = new Set(owned.map(s => s.id));
      if (studentIds.some(id => !ownedSet.has(id))) return res.status(403).json({ error: "One or more students not in this tenant" });
    }
    if (feeTypeIds.length) {
      const owned = await db.select({ id: feeTypesTable.id }).from(feeTypesTable)
        .where(and(inArray(feeTypesTable.id, feeTypeIds), eq(feeTypesTable.tenantId, tenantId)));
      const ownedSet = new Set(owned.map(f => f.id));
      if (feeTypeIds.some(id => !ownedSet.has(id))) return res.status(403).json({ error: "One or more fee types not in this tenant" });
    }

    let saved = 0;
    let deleted = 0;

    for (const entry of entries) {
      const { studentId, feeTypeId, amount } = entry as { studentId: string; feeTypeId: string; amount: number | null };
      if (!studentId || !feeTypeId) continue;

      // Enforce lock: skip if student has a paid challan for this fee type this year
      const lockCheck = await db.execute(sql`
        SELECT 1 FROM fee_challans
        WHERE academic_year_id = ${academicYearId}::uuid
          AND student_id       = ${studentId}::uuid
          AND fee_type_id      = ${feeTypeId}::uuid
          AND status = 'paid'
        LIMIT 1
      `);
      if (lockCheck.rows.length > 0) continue;

      if (amount === null || amount === undefined) {
        await db.execute(sql`
          DELETE FROM student_fee_overrides
          WHERE student_id       = ${studentId}::uuid
            AND fee_type_id      = ${feeTypeId}::uuid
            AND academic_year_id = ${academicYearId}::uuid
        `);
        deleted++;
      } else {
        await db.execute(sql`
          INSERT INTO student_fee_overrides (student_id, fee_type_id, academic_year_id, amount)
          VALUES (${studentId}::uuid, ${feeTypeId}::uuid, ${academicYearId}::uuid, ${Number(amount)})
          ON CONFLICT (student_id, fee_type_id, academic_year_id)
          DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW()
        `);
        saved++;
      }
    }

    return res.json({ ok: true, saved, deleted });
  } catch (err) {
    req.log.error({ err }, "Failed to save student fee overrides");
    return res.status(500).json({ error: "Failed to save student fees" });
  }
});

// POST /admin/fee-schedule/apply-to-students
// Copies class fee_schedule amounts into student_fee_overrides for every active student.
// mode "fill"      — only inserts where no override exists yet (safe default)
// mode "overwrite" — replaces all overrides (except rows locked by a paid challan)
router.post("/admin/fee-schedule/apply-to-students", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { academicYearId, mode = "fill" } = req.body ?? {};
    if (!academicYearId || typeof academicYearId !== "string") {
      return res.status(400).json({ error: "academicYearId is required" });
    }

    let result: { rowCount?: number | null };

    if (mode === "overwrite") {
      result = await db.execute(sql`
        INSERT INTO student_fee_overrides (student_id, fee_type_id, academic_year_id, amount)
        SELECT s.id, fs.fee_type_id, fs.academic_year_id, fs.amount
        FROM students s
        JOIN student_enrollments se
          ON  se.student_id       = s.id
          AND se.academic_year_id = ${academicYearId}::uuid
        JOIN fee_schedule fs
          ON  fs.class_code       = se.class_code
          AND fs.academic_year_id = ${academicYearId}::uuid
        JOIN fee_types ft ON ft.id = fs.fee_type_id AND ft.tenant_id = ${tenantId}::uuid
        WHERE s.tenant_id = ${tenantId}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM fee_challans fc
            WHERE fc.student_id       = s.id
              AND fc.fee_type_id      = fs.fee_type_id
              AND fc.academic_year_id = ${academicYearId}::uuid
              AND fc.status = 'paid'
          )
        ON CONFLICT (student_id, fee_type_id, academic_year_id)
        DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW()
      `);
    } else {
      result = await db.execute(sql`
        INSERT INTO student_fee_overrides (student_id, fee_type_id, academic_year_id, amount)
        SELECT s.id, fs.fee_type_id, fs.academic_year_id, fs.amount
        FROM students s
        JOIN student_enrollments se
          ON  se.student_id       = s.id
          AND se.academic_year_id = ${academicYearId}::uuid
        JOIN fee_schedule fs
          ON  fs.class_code       = se.class_code
          AND fs.academic_year_id = ${academicYearId}::uuid
        JOIN fee_types ft ON ft.id = fs.fee_type_id AND ft.tenant_id = ${tenantId}::uuid
        WHERE s.tenant_id = ${tenantId}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM student_fee_overrides sfo
            WHERE sfo.student_id       = s.id
              AND sfo.fee_type_id      = fs.fee_type_id
              AND sfo.academic_year_id = ${academicYearId}::uuid
          )
          AND NOT EXISTS (
            SELECT 1 FROM fee_challans fc
            WHERE fc.student_id       = s.id
              AND fc.fee_type_id      = fs.fee_type_id
              AND fc.academic_year_id = ${academicYearId}::uuid
              AND fc.status = 'paid'
          )
        ON CONFLICT DO NOTHING
      `);
    }

    return res.json({ ok: true, applied: Number(result.rowCount ?? 0) });
  } catch (err) {
    req.log.error({ err }, "Failed to apply fee schedule to students");
    return res.status(500).json({ error: "Failed to apply fee schedule to students" });
  }
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /admin/fee-challans/bulk-history
// Returns paginated list of past bulk collection sessions grouped by date + account + method.
router.get("/admin/fee-challans/bulk-history", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const page     = Math.max(1, Number(req.query.page)     || 1);
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 20));
    const offset   = (page - 1) * pageSize;
    const dateFrom = String(req.query.dateFrom ?? "").trim();
    const dateTo   = String(req.query.dateTo ?? "").trim();

    if (dateFrom && !DATE_RE.test(dateFrom)) return res.status(400).json({ error: "dateFrom must be YYYY-MM-DD" });
    if (dateTo   && !DATE_RE.test(dateTo))   return res.status(400).json({ error: "dateTo must be YYYY-MM-DD" });

    // Build parameterized WHERE fragment (sql`` tag — values are $N placeholders, never interpolated)
    let baseWhere = sql`fc.status IN ('paid', 'partial') AND fc.paid_at IS NOT NULL AND ft.tenant_id = ${tenantId}::uuid`;
    if (dateFrom) baseWhere = sql`${baseWhere} AND DATE(fc.paid_at AT TIME ZONE 'UTC') >= ${dateFrom}::date`;
    if (dateTo)   baseWhere = sql`${baseWhere} AND DATE(fc.paid_at AT TIME ZONE 'UTC') <= ${dateTo}::date`;

    // Count distinct (date, account_title, payment_method) tuples — same grouping as list query
    const countResult = await db.execute(sql`
      SELECT COUNT(*) AS total FROM (
        SELECT 1
        FROM fee_challans fc
        JOIN fee_types ft ON ft.id = fc.fee_type_id
        WHERE ${baseWhere}
        GROUP BY DATE(fc.paid_at AT TIME ZONE 'UTC'),
                 COALESCE(fc.account_title, 'Cash'),
                 COALESCE(fc.payment_method, 'cash')
      ) sub
    `);
    const total = Number((countResult.rows[0] as any)?.total ?? 0);

    const rows = await db.execute(sql`
      SELECT
        DATE(fc.paid_at AT TIME ZONE 'UTC')                AS collection_date,
        COALESCE(fc.account_title, 'Cash')                 AS account_title,
        COALESCE(fc.payment_method, 'cash')                AS payment_method,
        COUNT(*)::int                                      AS challan_count,
        COUNT(DISTINCT fc.student_id)::int                 AS student_count,
        SUM(COALESCE(fc.paid_amount, fc.amount))::bigint   AS total_amount
      FROM fee_challans fc
      JOIN fee_types ft ON ft.id = fc.fee_type_id
      WHERE ${baseWhere}
      GROUP BY collection_date, account_title, payment_method
      ORDER BY collection_date DESC, account_title, payment_method
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    return res.json({
      sessions: rows.rows,
      total,
      page,
      pageSize,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load bulk collection history");
    return res.status(500).json({ error: "Failed to load bulk collection history" });
  }
});

// GET /admin/fee-challans/bulk-history/detail?date=YYYY-MM-DD&accountTitle=...&paymentMethod=...
// Returns per-student challan breakdown for a specific collection session.
// Grouping key matches bulk-history list exactly: date + accountTitle + paymentMethod.
router.get("/admin/fee-challans/bulk-history/detail", requireAdmin, async (req: Request, res: Response) => {
  try {
    const date          = String(req.query.date          ?? "").trim();
    const accountTitle  = String(req.query.accountTitle  ?? "").trim();
    const paymentMethod = String(req.query.paymentMethod ?? "").trim();

    if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    if (!accountTitle)  return res.status(400).json({ error: "accountTitle is required" });
    if (!paymentMethod) return res.status(400).json({ error: "paymentMethod is required" });

    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    // All user-supplied values are parameterized — never interpolated into SQL text
    const rows = await db.execute(sql`
      SELECT
        fc.id,
        fc.student_id,
        fc.paid_amount,
        fc.amount,
        fc.month,
        ft.name  AS fee_type_name,
        applicantId:  row.applicant_id,
        fullName:     row.full_name,
        s.class_code
      FROM fee_challans fc
      JOIN fee_types ft ON ft.id = fc.fee_type_id AND ft.tenant_id = ${tenantId}::uuid
      JOIN students s   ON s.id  = fc.student_id
      WHERE fc.status IN ('paid', 'partial')
        AND fc.paid_at IS NOT NULL
        AND DATE(fc.paid_at AT TIME ZONE 'UTC') = ${date}::date
        AND COALESCE(fc.account_title,  'Cash') = ${accountTitle}
        AND COALESCE(fc.payment_method, 'cash') = ${paymentMethod}
      ORDER BY s.applicant_id, ft.sort_order, ft.name
    `);

    // Group by student
    const studentMap = new Map<string, {
      studentId: string;
      applicantId: string;
      fullName: string;
      classCode: string;
      paidAmount: number;
      challans: { id: string; feeTypeName: string; amount: number; paidAmount: number; month: string | null }[];
    }>();

    for (const row of rows.rows as any[]) {
      let student = studentMap.get(row.student_id);
      if (!student) {
        student = {
          studentId:  row.student_id,
          applicantId:   row.applicant_id,
          fullName:   row.full_name,
          classCode:  row.class_code,
          paidAmount: 0,
          challans:   [],
        };
        studentMap.set(row.student_id, student);
      }
      const paid = Number(row.paid_amount ?? row.amount ?? 0);
      student.paidAmount += paid;
      student.challans.push({
        id:          row.id,
        feeTypeName: row.fee_type_name,
        amount:      Number(row.amount ?? 0),
        paidAmount:  paid,
        month:       row.month ?? null,
      });
    }

    return res.json({ students: Array.from(studentMap.values()) });
  } catch (err) {
    req.log.error({ err }, "Failed to load bulk collection history detail");
    return res.status(500).json({ error: "Failed to load bulk collection history detail" });
  }
});

// ── Fee Adjustments Report ────────────────────────────────────────────────────

// GET /admin/fee-concessions-report?academicYearId=&classCode=
// Returns students whose active override differs from the class schedule rate
// (either a concession where override < class rate, or a surcharge where override > class rate).
router.get("/admin/fee-concessions-report", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { academicYearId, classCode } = req.query as Record<string, string>;
    if (!academicYearId) return res.status(400).json({ error: "academicYearId is required" });

    // Join overrides ↔ schedule ↔ students ↔ fee_types; include both concessions and surcharges
    const classFilter = classCode ? `AND s.class_code = $3` : "";
    const params: any[] = [academicYearId, tenantId];
    if (classCode) params.push(classCode);

    const { rows } = await pool.query<{
      student_id:        string;
      student_name:      string;
      applicant_id:      string;
      class_code:        string;
      fee_type_id:       string;
      fee_type_name:     string;
      schedule_amount:   string;
      override_amount:   string;
      concession_amount: string;
      adjustment_type:   string;
    }>(`
      SELECT
        s.id              AS student_id,
        s.full_name       AS student_name,
        s.applicant_id,
        s.class_code,
        ft.id             AS fee_type_id,
        ft.name           AS fee_type_name,
        fs.amount::int    AS schedule_amount,
        sfo.amount::int   AS override_amount,
        ABS(fs.amount - sfo.amount)::int AS concession_amount,
        CASE WHEN sfo.amount < fs.amount THEN 'concession' ELSE 'surcharge' END AS adjustment_type
      FROM student_fee_overrides sfo
      JOIN students          s   ON s.id = sfo.student_id  AND s.tenant_id = $2::uuid
      JOIN fee_types         ft  ON ft.id = sfo.fee_type_id AND ft.tenant_id = $2::uuid
      JOIN fee_schedule      fs  ON fs.fee_type_id = sfo.fee_type_id
                                 AND fs.academic_year_id = sfo.academic_year_id
                                 AND fs.class_code = s.class_code
      WHERE sfo.academic_year_id = $1::uuid
        AND sfo.amount <> fs.amount
        ${classFilter}
      ORDER BY s.class_code, s.full_name, ft.sort_order
    `, params);

    return res.json(rows.map(r => ({
      studentId:        r.student_id,
      studentName:      r.student_name,
      applicantId:      r.applicant_id,
      classCode:        r.class_code,
      feeTypeId:        r.fee_type_id,
      feeTypeName:      r.fee_type_name,
      scheduleAmount:   Number(r.schedule_amount),
      overrideAmount:   Number(r.override_amount),
      concessionAmount: Number(r.concession_amount),
      adjustmentType:   r.adjustment_type as "concession" | "surcharge",
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to load fee adjustments report");
    return res.status(500).json({ error: "Failed to load fee adjustments report" });
  }
});

// ── Fine Rules CRUD ───────────────────────────────────────────────────────────

// GET /admin/fine-rules?academicYearId=...
router.get("/admin/fine-rules", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { academicYearId } = req.query as Record<string, string>;
    if (!academicYearId) return res.status(400).json({ error: "academicYearId is required" });
    const rows = await db
      .select()
      .from(fineRulesTable)
      .where(and(eq(fineRulesTable.tenantId, tenantId), eq(fineRulesTable.academicYearId, academicYearId)))
      .orderBy(asc(fineRulesTable.fineType));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list fine rules");
    return res.status(500).json({ error: "Failed to load fine rules" });
  }
});

const fineRuleBodySchema = z.object({
  academicYearId: z.string().uuid(),
  fineType:       z.enum(["attendance", "late_fee"]),
  classCode:      z.string().optional().nullable(),
  threshold:      z.number().int().min(0),
  fineAmount:     z.number().int().min(0),
  fineMode:       z.enum(["flat", "per_day", "per_absent_day"]).default("flat"),
  active:         z.boolean().default(true),
});

// PUT /admin/fine-rules — upsert by (tenantId, academicYearId, fineType, classCode)
router.put("/admin/fine-rules", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const parsed = fineRuleBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" });
    }
    const { academicYearId, fineType, classCode, threshold, fineAmount, fineMode, active } = parsed.data;

    const resolvedClassCode = classCode?.trim() || null;

    // Find existing rule matching this key
    const existing = await db.select({ id: fineRulesTable.id })
      .from(fineRulesTable)
      .where(and(
        eq(fineRulesTable.tenantId, tenantId),
        eq(fineRulesTable.academicYearId, academicYearId),
        eq(fineRulesTable.fineType, fineType),
        resolvedClassCode
          ? eq(fineRulesTable.classCode, resolvedClassCode)
          : isNull(fineRulesTable.classCode),
      ))
      .limit(1);

    let result;
    if (existing.length) {
      [result] = await db.update(fineRulesTable)
        .set({ threshold, fineAmount, fineMode, active })
        .where(eq(fineRulesTable.id, existing[0].id))
        .returning();
    } else {
      [result] = await db.insert(fineRulesTable).values({
        tenantId,
        academicYearId,
        fineType,
        classCode: resolvedClassCode,
        threshold,
        fineAmount,
        fineMode,
        active,
      }).returning();
    }

    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to save fine rule");
    return res.status(500).json({ error: "Failed to save fine rule" });
  }
});

// ── Fine calculation helpers ───────────────────────────────────────────────────

/**
 * Calculate attendance fine for a student given the configured rules.
 * Returns amount (0 if no fine applies).
 */
async function calcAttendanceFine(
  studentId: string,
  classCode: string,
  periodStart: string, // YYYY-MM
  academicYearId: string,
  tenantId: string,
): Promise<number> {
  const yearRules = await db.select()
    .from(fineRulesTable)
    .where(and(
      eq(fineRulesTable.tenantId, tenantId),
      eq(fineRulesTable.academicYearId, academicYearId),
      eq(fineRulesTable.fineType, "attendance"),
      eq(fineRulesTable.active, true),
    ));

  if (!yearRules.length) return 0;

  const rule = yearRules.find(r => r.classCode === classCode)
    ?? yearRules.find(r => !r.classCode);
  if (!rule) return 0;

  const [y, m] = periodStart.split("-").map(Number);
  const startDate = `${periodStart}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${periodStart}-${String(lastDay).padStart(2, "0")}`;

  const attRows = await db.select({ status: studentAttendanceTable.status })
    .from(studentAttendanceTable)
    .where(and(
      eq(studentAttendanceTable.studentId, studentId),
      sql`${studentAttendanceTable.attendanceDate} >= ${startDate}`,
      sql`${studentAttendanceTable.attendanceDate} <= ${endDate}`,
    ));

  if (!attRows.length) return 0;

  const schoolDays = attRows.filter(r => ["present", "absent", "late"].includes(r.status)).length;
  if (!schoolDays) return 0;

  const absentDays = attRows.filter(r => r.status === "absent").length;
  const pct = Math.round(((schoolDays - absentDays) / schoolDays) * 100);

  if (pct >= rule.threshold) return 0;
  if (rule.fineMode === "flat") return rule.fineAmount;
  if (rule.fineMode === "per_absent_day") return absentDays * rule.fineAmount;
  return 0;
}

/**
 * Calculate late fee fine for a student.
 * Captures both unpaid overdue challans AND challans paid after their due date.
 * Returns { amount, overdueChallanIds }.
 */
async function calcLateFine(
  studentId: string,
  classCode: string,
  academicYearId: string,
  tenantId: string,
): Promise<{ amount: number; overdueChallanIds: string[] }> {
  const yearRules = await db.select()
    .from(fineRulesTable)
    .where(and(
      eq(fineRulesTable.tenantId, tenantId),
      eq(fineRulesTable.academicYearId, academicYearId),
      eq(fineRulesTable.fineType, "late_fee"),
      eq(fineRulesTable.active, true),
    ));

  if (!yearRules.length) return { amount: 0, overdueChallanIds: [] };

  const rule = yearRules.find(r => r.classCode === classCode)
    ?? yearRules.find(r => !r.classCode);
  if (!rule) return { amount: 0, overdueChallanIds: [] };

  const today = new Date().toISOString().slice(0, 10);

  // Both unpaid-overdue challans AND challans paid after their due date
  const eligible = await db.execute(sql`
    SELECT id,
           due_date,
           CASE
             WHEN status IN ('pending', 'partial', 'overdue')
               THEN ${today}::date
             ELSE paid_at::date
           END AS reference_date
    FROM fee_challans
    WHERE student_id        = ${studentId}::uuid
      AND academic_year_id  = ${academicYearId}::uuid
      AND late_fine_applied = false
      AND (
        (status IN ('pending', 'partial', 'overdue') AND due_date < ${today}::date)
        OR
        (status = 'paid' AND paid_at IS NOT NULL AND paid_at::date > due_date)
      )
  `);

  const overdueChallanIds: string[] = [];
  let totalAmount = 0;

  for (const row of eligible.rows as any[]) {
    const dueDate  = row.due_date      as string;
    const refDate  = row.reference_date as string;
    const daysLate = Math.floor(
      (new Date(refDate).getTime() - new Date(dueDate).getTime()) / 86400000,
    );

    if (daysLate <= rule.threshold) continue; // within grace period

    overdueChallanIds.push(row.id as string);
    if (rule.fineMode === "flat") {
      totalAmount += rule.fineAmount;
    } else if (rule.fineMode === "per_day") {
      totalAmount += (daysLate - rule.threshold) * rule.fineAmount;
    }
  }

  return { amount: totalAmount, overdueChallanIds };
}

export default router;

