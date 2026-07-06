import { Router, type IRouter, type Request, type Response } from "express";
import { db, gateLogTable, gateOutpassTable } from "@workspace/db";
import { canonicalizePhone } from "../lib/format-utils.js";
import { eq, desc, and, ilike, or, like, gte, lt, sql, isNull, isNotNull } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";

const router: IRouter = Router();

// inTime is stored as "YYYY-MM-DD HH:MM" — filter by date prefix for today's queries
const todayPrefix = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ── Gate Log ───────────────────────────────────────────────────────────────────
router.get("/admin/gate/log", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { personType, search, date } = req.query as Record<string, string>;
    const conds: any[] = [];
    const g = gateLogTable;

    if (personType && personType !== "all") conds.push(eq(g.personType, personType));
    // date filter: match inTime prefix "YYYY-MM-DD"
    if (date) conds.push(like(g.inTime, `${date}%`));
    if (search) conds.push(or(ilike(g.personName, `%${search}%`), ilike(g.phone, `%${search}%`), ilike(g.purpose, `%${search}%`), ilike(g.vehicleNo, `%${search}%`)));

    const rows = await db.select().from(g)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(g.inTime));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET gate log failed");
    return res.status(500).json({ error: "Failed to fetch gate log" });
  }
});

router.post("/admin/gate/log", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    if (data.phone?.trim()) {
      const canon = canonicalizePhone(data.phone);
      if (!canon) return res.status(400).json({ error: "Phone must be exactly 11 digits — format: 0XXX-XXXXXXX" });
      data.phone = canon;
    }
    const row = ((await db.insert(gateLogTable).values(data).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err: any) {
    req.log.error({ err }, "POST gate log failed");
    return res.status(500).json({ error: "Failed to create log entry" });
  }
});

router.put("/admin/gate/log/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id: _id, createdAt: _ca, ...gateLogBody } = req.body as any;
    if (gateLogBody.phone?.trim()) {
      const canon = canonicalizePhone(gateLogBody.phone);
      if (!canon) return res.status(400).json({ error: "Phone must be exactly 11 digits — format: 0XXX-XXXXXXX" });
      gateLogBody.phone = canon;
    }
    const [row] = await db.update(gateLogTable).set({ ...gateLogBody, updatedAt: new Date() }).where(eq(gateLogTable.id, String(req.params.id))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT gate log failed");
    return res.status(500).json({ error: "Failed to update log entry" });
  }
});

// Quick check-out: sets outTime to now
router.patch("/admin/gate/log/:id/checkout", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const now = new Date();
    const outTime = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;
    const [row] = await db.update(gateLogTable)
      .set({ outTime, updatedAt: now })
      .where(eq(gateLogTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PATCH gate checkout failed");
    return res.status(500).json({ error: "Failed to record checkout" });
  }
});

router.delete("/admin/gate/log/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await db.delete(gateLogTable).where(eq(gateLogTable.id, String(req.params.id)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE gate log failed");
    return res.status(500).json({ error: "Failed to delete log entry" });
  }
});

// ── Outpass ────────────────────────────────────────────────────────────────────
router.get("/admin/gate/outpass", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query as Record<string, string>;
    const today = todayPrefix();
    const conds: any[] = [];
    const o = gateOutpassTable;

    if (status === "active")  conds.push(eq(o.status, "active"));
    else if (status === "expiring") conds.push(and(eq(o.status, "active"), eq(o.validUntil, today)));
    else if (status && status !== "all") conds.push(eq(o.status, status));

    if (search) conds.push(or(ilike(o.studentName, `%${search}%`), ilike(gateOutpassTable.applicantId, `%${search}%`), ilike(o.purpose, `%${search}%`)));

    const rows = await db.select().from(o)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(o.createdAt));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET gate outpass failed");
    return res.status(500).json({ error: "Failed to fetch outpasses" });
  }
});

router.post("/admin/gate/outpass", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    const row = ((await db.insert(gateOutpassTable).values(data).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err: any) {
    req.log.error({ err }, "POST gate outpass failed");
    return res.status(500).json({ error: "Failed to create outpass" });
  }
});

router.put("/admin/gate/outpass/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id: _id, createdAt: _ca, ...outpassBody } = req.body as any;
    const [row] = await db.update(gateOutpassTable).set({ ...outpassBody, updatedAt: new Date() }).where(eq(gateOutpassTable.id, String(req.params.id))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT gate outpass failed");
    return res.status(500).json({ error: "Failed to update outpass" });
  }
});

// Quick status change for outpass
router.patch("/admin/gate/outpass/:id/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body as { status: string };
    const [row] = await db.update(gateOutpassTable).set({ status, updatedAt: new Date() }).where(eq(gateOutpassTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PATCH gate outpass status failed");
    return res.status(500).json({ error: "Failed to update outpass status" });
  }
});

router.delete("/admin/gate/outpass/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await db.delete(gateOutpassTable).where(eq(gateOutpassTable.id, String(req.params.id)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE gate outpass failed");
    return res.status(500).json({ error: "Failed to delete outpass" });
  }
});

// ── Dashboard stats ────────────────────────────────────────────────────────────
router.get("/admin/gate/stats", requireAdmin, async (req: Request, res: Response) => {
  try {
    const today = todayPrefix();
    const g = gateLogTable;
    const o = gateOutpassTable;

    const [todayEntries, onCampus, activeOutpasses, expiringToday, byType] = await Promise.all([
      // Total entries today
      db.select({ count: sql<number>`count(*)::int` }).from(g).where(like(g.inTime, `${today}%`)),
      // On campus = checked in today but not yet checked out
      db.select({ count: sql<number>`count(*)::int` }).from(g).where(and(like(g.inTime, `${today}%`), isNull(g.outTime))),
      // Active outpasses
      db.select({ count: sql<number>`count(*)::int` }).from(o).where(eq(o.status, "active")),
      // Active outpasses expiring today
      db.select({ count: sql<number>`count(*)::int` }).from(o).where(and(eq(o.status, "active"), eq(o.validUntil, today))),
      // Today's entries by type
      db.select({ personType: g.personType, count: sql<number>`count(*)::int` })
        .from(g)
        .where(like(g.inTime, `${today}%`))
        .groupBy(g.personType),
    ]);

    return res.json({
      todayEntries: todayEntries[0]?.count ?? 0,
      onCampus: onCampus[0]?.count ?? 0,
      activeOutpasses: activeOutpasses[0]?.count ?? 0,
      expiringToday: expiringToday[0]?.count ?? 0,
      byType: Object.fromEntries(byType.map(r => [r.personType, r.count])),
    });
  } catch (err) {
    req.log.error({ err }, "GET gate stats failed");
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
