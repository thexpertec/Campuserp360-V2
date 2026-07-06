import { Router, type IRouter, type Request, type Response } from "express";
import { db, syllabusUnitsTable, syllabusTopicsTable } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";

const router: IRouter = Router();

// ── Units ─────────────────────────────────────────────────────────────────────
router.get("/admin/syllabus/units", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const rows = await db.select().from(syllabusUnitsTable)
      .where(eq(syllabusUnitsTable.tenantId, tenantId))
      .orderBy(asc(syllabusUnitsTable.classCode), asc(syllabusUnitsTable.subjectCode), asc(syllabusUnitsTable.sortOrder));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET syllabus units failed");
    return res.status(500).json({ error: "Failed to fetch units" });
  }
});

router.post("/admin/syllabus/units", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    const row = ((await db.insert(syllabusUnitsTable).values({ ...data, tenantId }).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "POST syllabus unit failed");
    return res.status(500).json({ error: "Failed to create unit" });
  }
});

router.put("/admin/syllabus/units/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, ...unitBody } = req.body as any;
    const [row] = await db.update(syllabusUnitsTable).set({ ...unitBody, updatedAt: new Date() })
      .where(and(eq(syllabusUnitsTable.id, String(req.params.id)), eq(syllabusUnitsTable.tenantId, tenantId))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT syllabus unit failed");
    return res.status(500).json({ error: "Failed to update unit" });
  }
});

router.delete("/admin/syllabus/units/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(syllabusUnitsTable)
      .where(and(eq(syllabusUnitsTable.id, String(req.params.id)), eq(syllabusUnitsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE syllabus unit failed");
    return res.status(500).json({ error: "Failed to delete unit" });
  }
});

// ── Bulk insert units ─────────────────────────────────────────────────────────
router.post("/admin/syllabus/units/bulk", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const rawRows: unknown[] = Array.isArray(req.body) ? req.body : [];
    if (!rawRows.length) return res.status(400).json({ error: "No rows provided" });
    const rows = rawRows.map(({ id: _id, createdAt: _ca, updatedAt: _ua, ...r }: any) => ({
      ...r,
      tenantId,
    }));
    const inserted = await db.insert(syllabusUnitsTable).values(rows as any).returning();
    return res.status(201).json({ saved: inserted.length, items: inserted });
  } catch (err) {
    req.log.error({ err }, "POST syllabus units/bulk failed");
    return res.status(500).json({ error: "Failed to bulk-create units" });
  }
});

// ── Topics ────────────────────────────────────────────────────────────────────
router.get("/admin/syllabus/topics", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const rows = await db.select().from(syllabusTopicsTable)
      .where(eq(syllabusTopicsTable.tenantId, tenantId))
      .orderBy(asc(syllabusTopicsTable.unitId), asc(syllabusTopicsTable.sortOrder));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET syllabus topics failed");
    return res.status(500).json({ error: "Failed to fetch topics" });
  }
});

router.post("/admin/syllabus/topics", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    const row = ((await db.insert(syllabusTopicsTable).values({ ...data, tenantId }).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "POST syllabus topic failed");
    return res.status(500).json({ error: "Failed to create topic" });
  }
});

// ── Bulk insert topics ────────────────────────────────────────────────────────
router.post("/admin/syllabus/topics/bulk", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const rawRows: unknown[] = Array.isArray(req.body) ? req.body : [];
    if (!rawRows.length) return res.status(400).json({ error: "No rows provided" });
    const rows = rawRows.map(({ id: _id, createdAt: _ca, updatedAt: _ua, ...r }: any) => ({
      ...r,
      tenantId,
    }));
    const inserted = await db.insert(syllabusTopicsTable).values(rows as any).returning();
    return res.status(201).json({ saved: inserted.length, items: inserted });
  } catch (err) {
    req.log.error({ err }, "POST syllabus topics/bulk failed");
    return res.status(500).json({ error: "Failed to bulk-create topics" });
  }
});

router.put("/admin/syllabus/topics/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, ...topicBody } = req.body as any;
    const [row] = await db.update(syllabusTopicsTable).set({ ...topicBody, updatedAt: new Date() })
      .where(and(eq(syllabusTopicsTable.id, String(req.params.id)), eq(syllabusTopicsTable.tenantId, tenantId))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT syllabus topic failed");
    return res.status(500).json({ error: "Failed to update topic" });
  }
});

router.delete("/admin/syllabus/topics/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(syllabusTopicsTable)
      .where(and(eq(syllabusTopicsTable.id, String(req.params.id)), eq(syllabusTopicsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE syllabus topic failed");
    return res.status(500).json({ error: "Failed to delete topic" });
  }
});

export default router;
