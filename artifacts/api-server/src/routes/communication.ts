import { Router, type IRouter, type Request, type Response } from "express";
import { db, announcementsTable, noticeboardItemsTable } from "@workspace/db";
import { eq, desc, and, ilike } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";

const router: IRouter = Router();

// ── Announcements ──────────────────────────────────────────────────────────────
router.get("/admin/communication/announcements", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { targetAudience, priority, search } = req.query as Record<string, string>;
    let q = db.select().from(announcementsTable).$dynamic();
    const conds: any[] = [eq(announcementsTable.tenantId, tenantId)];
    if (targetAudience && targetAudience !== "all") conds.push(eq(announcementsTable.targetAudience, targetAudience));
    if (priority) conds.push(eq(announcementsTable.priority, priority));
    if (search) conds.push(ilike(announcementsTable.title, `%${search}%`));
    q = q.where(and(...conds));
    const rows = await q.orderBy(desc(announcementsTable.createdAt));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET announcements failed");
    return res.status(500).json({ error: "Failed to fetch announcements" });
  }
});

router.post("/admin/communication/announcements", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, tenantId: _ti, ...data } = req.body as any;
    const row = ((await db.insert(announcementsTable).values({ ...data, tenantId }).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Slug already exists" });
    req.log.error({ err }, "POST announcement failed");
    return res.status(500).json({ error: "Failed to create announcement" });
  }
});

router.put("/admin/communication/announcements/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { id: _id, createdAt: _ca, tenantId: _ti, ...annBody } = req.body as any;
    const [row] = await db.update(announcementsTable)
      .set({ ...annBody, updatedAt: new Date() })
      .where(and(eq(announcementsTable.id, String(req.params.id)), eq(announcementsTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT announcement failed");
    return res.status(500).json({ error: "Failed to update announcement" });
  }
});

router.delete("/admin/communication/announcements/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    await db.delete(announcementsTable)
      .where(and(eq(announcementsTable.id, String(req.params.id)), eq(announcementsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE announcement failed");
    return res.status(500).json({ error: "Failed to delete announcement" });
  }
});

// ── Noticeboard ────────────────────────────────────────────────────────────────
router.get("/admin/communication/noticeboard", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const rows = await db.select().from(noticeboardItemsTable)
      .where(eq(noticeboardItemsTable.tenantId, tenantId))
      .orderBy(desc(noticeboardItemsTable.createdAt));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET noticeboard failed");
    return res.status(500).json({ error: "Failed to fetch noticeboard items" });
  }
});

router.post("/admin/communication/noticeboard", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, tenantId: _ti, ...data } = req.body as any;
    const row = ((await db.insert(noticeboardItemsTable).values({ ...data, tenantId }).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Slug already exists" });
    req.log.error({ err }, "POST noticeboard failed");
    return res.status(500).json({ error: "Failed to create noticeboard item" });
  }
});

router.put("/admin/communication/noticeboard/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { id: _id, createdAt: _ca, tenantId: _ti, ...noticeBody } = req.body as any;
    const [row] = await db.update(noticeboardItemsTable)
      .set({ ...noticeBody, updatedAt: new Date() })
      .where(and(eq(noticeboardItemsTable.id, String(req.params.id)), eq(noticeboardItemsTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT noticeboard failed");
    return res.status(500).json({ error: "Failed to update noticeboard item" });
  }
});

router.delete("/admin/communication/noticeboard/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    await db.delete(noticeboardItemsTable)
      .where(and(eq(noticeboardItemsTable.id, String(req.params.id)), eq(noticeboardItemsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE noticeboard failed");
    return res.status(500).json({ error: "Failed to delete noticeboard item" });
  }
});

export default router;
