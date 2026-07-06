import { Router, type IRouter, type Request, type Response } from "express";
import { db, pool, medicalMedicineCategoriesTable, medicalMedicinesTable, medicalConditionsTable, medicalVisitsTable, studentsTable } from "@workspace/db";
import { eq, asc, desc, ilike, and, or, gte, lt, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";

// ── Startup migration ─────────────────────────────────────────────────────────

export async function migrateMedical(): Promise<void> {
  // Add tenant_id to all medical tables
  for (const table of [
    "medical_medicine_categories",
    "medical_medicines",
    "medical_conditions",
    "medical_visits",
  ]) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id UUID`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${table}_tenant_idx ON ${table}(tenant_id)`);
  }

  // Drop old global unique constraints on name columns
  for (const table of ["medical_medicine_categories", "medical_medicines", "medical_conditions"]) {
    await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_name_key`);
  }

  // Backfill all unscoped rows to the CCM tenant
  for (const table of [
    "medical_medicine_categories",
    "medical_medicines",
    "medical_conditions",
    "medical_visits",
  ]) {
    await pool.query(`
      UPDATE ${table}
      SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1)
      WHERE tenant_id IS NULL
    `);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fail-closed helper: returns tenantId or sends 400 and returns null. */
async function requireTenantId(req: Request, res: Response): Promise<string | null> {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) {
    res.status(400).json({ error: "Tenant context required" });
    return null;
  }
  return tenantId;
}

const router: IRouter = Router();

/**
 * Generic CRUD for medical reference catalog tables (medicine categories,
 * medicines, conditions). All reads/writes are scoped to the admin's tenant.
 */
function catalogRoutes(path: string, table: any) {
  router.get(path, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await requireTenantId(req, res);
      if (!tenantId) return;
      const rows = await db.select().from(table)
        .where(eq(table.tenantId, tenantId))
        .orderBy(asc(table.sortOrder), asc(table.name));
      return res.json(rows);
    } catch (err) {
      req.log.error({ err }, `GET ${path} failed`);
      return res.status(500).json({ error: "Failed to fetch records" });
    }
  });
  router.post(path, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await requireTenantId(req, res);
      if (!tenantId) return;
      const { id: _id, createdAt: _ca, updatedAt: _ua, tenantId: _tid, ...data } = req.body as any;
      const row = ((await db.insert(table).values({ ...data, tenantId }).returning()) as any[])[0];
      return res.status(201).json(row);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ error: "Name already exists" });
      req.log.error({ err }, `POST ${path} failed`);
      return res.status(500).json({ error: "Failed to create record" });
    }
  });
  router.put(`${path}/:id`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await requireTenantId(req, res);
      if (!tenantId) return;
      const { id: _id, createdAt: _ca, tenantId: _tid, ...body } = req.body as any;
      const [row] = await db.update(table)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(table.id, String(req.params.id)), eq(table.tenantId, tenantId)))
        .returning();
      if (!row) return res.status(404).json({ error: "Not found" });
      return res.json(row);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ error: "Name already exists" });
      req.log.error({ err }, `PUT ${path}/:id failed`);
      return res.status(500).json({ error: "Failed to update record" });
    }
  });
  router.delete(`${path}/:id`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await requireTenantId(req, res);
      if (!tenantId) return;
      await db.delete(table).where(and(eq(table.id, String(req.params.id)), eq(table.tenantId, tenantId)));
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, `DELETE ${path}/:id failed`);
      return res.status(500).json({ error: "Failed to delete record" });
    }
  });
}

catalogRoutes("/admin/medical/medicine-categories", medicalMedicineCategoriesTable);
catalogRoutes("/admin/medical/medicines", medicalMedicinesTable);
catalogRoutes("/admin/medical/conditions", medicalConditionsTable);

// ── Visits (joined with conditionName) ────────────────────────────────────────
async function listVisitsJoined(conds: any[]) {
  const v = medicalVisitsTable;
  const c = medicalConditionsTable;
  return db
    .select({
      id: v.id,
      studentId: v.studentId, studentName: v.studentName, applicantId: v.applicantId, classCode: v.classCode,
      visitDate: v.visitDate,
      complaint: v.complaint,
      conditionId: v.conditionId, conditionName: c.name,
      diagnosis: v.diagnosis, treatmentGiven: v.treatmentGiven, medicinesGiven: v.medicinesGiven,
      status: v.status, referredTo: v.referredTo, notes: v.notes,
      createdAt: v.createdAt,
    })
    .from(v)
    .leftJoin(c, eq(v.conditionId, c.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(v.visitDate), desc(v.createdAt));
}

router.get("/admin/medical/visits", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const { status, search, date, dateFrom, dateTo } = req.query as Record<string, string>;
    const v = medicalVisitsTable;
    const conds: any[] = [eq(v.tenantId, tenantId)];
    if (status && status !== "all") conds.push(eq(v.status, status));
    if (date) conds.push(eq(v.visitDate, date));
    if (dateFrom) conds.push(gte(v.visitDate, dateFrom));
    if (dateTo) conds.push(lt(v.visitDate, dateTo));
    if (search) conds.push(or(ilike(v.studentName, `%${search}%`), ilike(v.applicantId, `%${search}%`), ilike(v.complaint, `%${search}%`)));
    const rows = await listVisitsJoined(conds);
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET medical visits failed");
    return res.status(500).json({ error: "Failed to fetch visits" });
  }
});

router.post("/admin/medical/visits", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const { id: _id, createdAt: _ca, updatedAt: _ua, tenantId: _tid, ...data } = req.body as any;

    // Verify student belongs to this tenant
    if (data.studentId) {
      const [stu] = await db.select({ id: studentsTable.id }).from(studentsTable)
        .where(and(eq(studentsTable.id, data.studentId), eq(studentsTable.tenantId, tenantId))).limit(1);
      if (!stu) return res.status(403).json({ error: "Student not found in this tenant" });
    }

    const row = ((await db.insert(medicalVisitsTable).values({ ...data, tenantId }).returning()) as any[])[0];
    const [enriched] = await listVisitsJoined([eq(medicalVisitsTable.id, row.id)]);
    return res.status(201).json(enriched ?? row);
  } catch (err: any) {
    req.log.error({ err }, "POST medical visit failed");
    return res.status(500).json({ error: "Failed to create visit" });
  }
});

router.put("/admin/medical/visits/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const id = String(req.params.id);
    const [existing] = await db.select({ id: medicalVisitsTable.id }).from(medicalVisitsTable)
      .where(and(eq(medicalVisitsTable.id, id), eq(medicalVisitsTable.tenantId, tenantId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Visit not found in this tenant" });

    const { id: _id, createdAt: _ca, tenantId: _tid, ...visitBody } = req.body as any;
    const [row] = await db.update(medicalVisitsTable)
      .set({ ...visitBody, updatedAt: new Date() })
      .where(and(eq(medicalVisitsTable.id, id), eq(medicalVisitsTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    const [enriched] = await listVisitsJoined([eq(medicalVisitsTable.id, row.id)]);
    return res.json(enriched ?? row);
  } catch (err) {
    req.log.error({ err }, "PUT medical visit failed");
    return res.status(500).json({ error: "Failed to update visit" });
  }
});

router.patch("/admin/medical/visits/:id/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const id = String(req.params.id);
    const [existing] = await db.select({ id: medicalVisitsTable.id }).from(medicalVisitsTable)
      .where(and(eq(medicalVisitsTable.id, id), eq(medicalVisitsTable.tenantId, tenantId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Visit not found in this tenant" });

    const { status, referredTo } = req.body as { status: string; referredTo?: string };
    const update: Record<string, any> = { status, updatedAt: new Date() };
    if (referredTo !== undefined) update.referredTo = referredTo;
    const [row] = await db.update(medicalVisitsTable)
      .set(update)
      .where(and(eq(medicalVisitsTable.id, id), eq(medicalVisitsTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    const [enriched] = await listVisitsJoined([eq(medicalVisitsTable.id, row.id)]);
    return res.json(enriched ?? row);
  } catch (err) {
    req.log.error({ err }, "PATCH medical visit status failed");
    return res.status(500).json({ error: "Failed to update status" });
  }
});

router.delete("/admin/medical/visits/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const id = String(req.params.id);
    const [existing] = await db.select({ id: medicalVisitsTable.id }).from(medicalVisitsTable)
      .where(and(eq(medicalVisitsTable.id, id), eq(medicalVisitsTable.tenantId, tenantId))).limit(1);
    if (!existing) return res.status(404).json({ error: "Visit not found in this tenant" });

    await db.delete(medicalVisitsTable)
      .where(and(eq(medicalVisitsTable.id, id), eq(medicalVisitsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE medical visit failed");
    return res.status(500).json({ error: "Failed to delete visit" });
  }
});

// ── Stock adjustment for a medicine ──────────────────────────────────────────
router.patch("/admin/medical/medicines/:id/stock", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const id = String(req.params.id);
    const { type, quantity } = req.body as { type: string; quantity: number };
    if (typeof quantity !== "number" || quantity < 0 || !Number.isInteger(quantity)) {
      return res.status(400).json({ error: "quantity must be a non-negative integer" });
    }
    const [current] = await db.select({ stockQuantity: medicalMedicinesTable.stockQuantity })
      .from(medicalMedicinesTable)
      .where(and(eq(medicalMedicinesTable.id, id), eq(medicalMedicinesTable.tenantId, tenantId)));
    if (!current) return res.status(404).json({ error: "Medicine not found" });

    let newStock: number;
    if (type === "set") {
      newStock = quantity;
    } else if (type === "receive" || type === "return") {
      newStock = current.stockQuantity + quantity;
    } else if (type === "dispense" || type === "write-off") {
      newStock = Math.max(0, current.stockQuantity - quantity);
    } else {
      return res.status(400).json({ error: "Invalid adjustment type" });
    }

    const [updated] = await db.update(medicalMedicinesTable)
      .set({ stockQuantity: newStock, updatedAt: new Date() })
      .where(and(eq(medicalMedicinesTable.id, id), eq(medicalMedicinesTable.tenantId, tenantId)))
      .returning();
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "PATCH medicine stock failed");
    return res.status(500).json({ error: "Failed to update stock" });
  }
});

// ── Dashboard summary stats (tenant-scoped) ───────────────────────────────────
router.get("/admin/medical/stats", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const v = medicalVisitsTable;
    const tenantFilter = eq(v.tenantId, tenantId);

    const [todayVisits, admitted, referred, weekVisits, conditionCounts] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(v).where(and(tenantFilter, eq(v.visitDate, today))),
      db.select({ count: sql<number>`count(*)::int` }).from(v).where(and(tenantFilter, eq(v.status, "inpatient"))),
      db.select({ count: sql<number>`count(*)::int` }).from(v).where(and(tenantFilter, eq(v.status, "referred"), gte(v.visitDate, weekAgo))),
      db.select({ count: sql<number>`count(*)::int` }).from(v).where(and(tenantFilter, gte(v.visitDate, weekAgo))),
      db.select({ conditionId: v.conditionId, conditionName: medicalConditionsTable.name, count: sql<number>`count(*)::int` })
        .from(v)
        .leftJoin(medicalConditionsTable, eq(v.conditionId, medicalConditionsTable.id))
        .where(and(tenantFilter, gte(v.visitDate, weekAgo)))
        .groupBy(v.conditionId, medicalConditionsTable.name)
        .orderBy(desc(sql`count(*)`))
        .limit(6),
    ]);

    return res.json({
      todayVisits: todayVisits[0]?.count ?? 0,
      admitted: admitted[0]?.count ?? 0,
      referredThisWeek: referred[0]?.count ?? 0,
      weeklyVisits: weekVisits[0]?.count ?? 0,
      topConditions: conditionCounts.map(r => ({ name: r.conditionName ?? "Unspecified", count: r.count })),
    });
  } catch (err) {
    req.log.error({ err }, "GET medical stats failed");
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
