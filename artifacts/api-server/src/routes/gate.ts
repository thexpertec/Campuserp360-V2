import { Router, type IRouter, type Request, type Response } from "express";
import { pool, db, gateLogTable, gateOutpassTable } from "@workspace/db";
import { canonicalizePhone } from "../lib/format-utils.js";
import { eq, desc, and, ilike, or, like, sql, isNull } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant.js";

const router: IRouter = Router();

const todayPrefix = () => new Date().toISOString().slice(0, 10);

async function requireGateTenant(req: Request, res: Response): Promise<string | null> {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) {
    res.status(400).json({ error: "Tenant context required — select a school before continuing." });
    return null;
  }
  return tenantId;
}

export async function migrateGate(): Promise<void> {
  await pool.query(`
    ALTER TABLE gate_log
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE
  `);
  await pool.query(`
    ALTER TABLE gate_outpass
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS gate_log_tenant_idx ON gate_log (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS gate_outpass_tenant_idx ON gate_outpass (tenant_id)`);

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1`,
  );
  const defaultTenantId = rows[0]?.id;
  if (!defaultTenantId) return;

  await pool.query(`UPDATE gate_log SET tenant_id = $1 WHERE tenant_id IS NULL`, [defaultTenantId]);
  await pool.query(`UPDATE gate_outpass SET tenant_id = $1 WHERE tenant_id IS NULL`, [defaultTenantId]);
}

router.get("/admin/gate/log", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireGateTenant(req, res);
    if (!tenantId) return;
    const { personType, search, date } = req.query as Record<string, string>;
    const conds: any[] = [eq(gateLogTable.tenantId, tenantId)];
    const g = gateLogTable;

    if (personType && personType !== "all") conds.push(eq(g.personType, personType));
    if (date) conds.push(like(g.inTime, `${date}%`));
    if (search) conds.push(or(ilike(g.personName, `%${search}%`), ilike(g.phone, `%${search}%`), ilike(g.purpose, `%${search}%`), ilike(g.vehicleNo, `%${search}%`)));

    const rows = await db.select().from(g)
      .where(and(...conds))
      .orderBy(desc(g.inTime));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET gate log failed");
    return res.status(500).json({ error: "Failed to fetch gate log" });
  }
});

router.post("/admin/gate/log", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireGateTenant(req, res);
    if (!tenantId) return;
    const { id: _id, createdAt: _ca, updatedAt: _ua, tenantId: _tid, ...data } = req.body as any;
    if (data.phone?.trim()) {
      const canon = canonicalizePhone(data.phone);
      if (!canon) return res.status(400).json({ error: "Phone must be exactly 11 digits — format: 0XXX-XXXXXXX" });
      data.phone = canon;
    }
    const row = ((await db.insert(gateLogTable).values({ ...data, tenantId }).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err: any) {
    req.log.error({ err }, "POST gate log failed");
    return res.status(500).json({ error: "Failed to create log entry" });
  }
});

router.put("/admin/gate/log/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireGateTenant(req, res);
    if (!tenantId) return;
    const { id: _id, createdAt: _ca, tenantId: _tid, ...gateLogBody } = req.body as any;
    if (gateLogBody.phone?.trim()) {
      const canon = canonicalizePhone(gateLogBody.phone);
      if (!canon) return res.status(400).json({ error: "Phone must be exactly 11 digits — format: 0XXX-XXXXXXX" });
      gateLogBody.phone = canon;
    }
    const [row] = await db.update(gateLogTable).set({ ...gateLogBody, updatedAt: new Date() })
      .where(and(eq(gateLogTable.id, String(req.params.id)), eq(gateLogTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT gate log failed");
    return res.status(500).json({ error: "Failed to update log entry" });
  }
});

router.patch("/admin/gate/log/:id/checkout", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireGateTenant(req, res);
    if (!tenantId) return;
    const id = String(req.params.id);
    const now = new Date();
    const outTime = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;
    const [row] = await db.update(gateLogTable)
      .set({ outTime, updatedAt: now })
      .where(and(eq(gateLogTable.id, id), eq(gateLogTable.tenantId, tenantId)))
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
    const tenantId = await requireGateTenant(req, res);
    if (!tenantId) return;
    await db.delete(gateLogTable).where(and(eq(gateLogTable.id, String(req.params.id)), eq(gateLogTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE gate log failed");
    return res.status(500).json({ error: "Failed to delete log entry" });
  }
});

router.get("/admin/gate/outpass", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireGateTenant(req, res);
    if (!tenantId) return;
    const { status, search } = req.query as Record<string, string>;
    const today = todayPrefix();
    const conds: any[] = [eq(gateOutpassTable.tenantId, tenantId)];
    const o = gateOutpassTable;

    if (status === "active")  conds.push(eq(o.status, "active"));
    else if (status === "expiring") conds.push(and(eq(o.status, "active"), eq(o.validUntil, today)));
    else if (status && status !== "all") conds.push(eq(o.status, status));

    if (search) conds.push(or(ilike(o.studentName, `%${search}%`), ilike(gateOutpassTable.applicantId, `%${search}%`), ilike(o.purpose, `%${search}%`)));

    const rows = await db.select().from(o)
      .where(and(...conds))
      .orderBy(desc(o.createdAt));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET gate outpass failed");
    return res.status(500).json({ error: "Failed to fetch outpasses" });
  }
});

router.post("/admin/gate/outpass", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireGateTenant(req, res);
    if (!tenantId) return;
    const { id: _id, createdAt: _ca, updatedAt: _ua, tenantId: _tid, ...data } = req.body as any;
    const row = ((await db.insert(gateOutpassTable).values({ ...data, tenantId }).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err: any) {
    req.log.error({ err }, "POST gate outpass failed");
    return res.status(500).json({ error: "Failed to create outpass" });
  }
});

router.put("/admin/gate/outpass/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireGateTenant(req, res);
    if (!tenantId) return;
    const { id: _id, createdAt: _ca, tenantId: _tid, ...outpassBody } = req.body as any;
    const [row] = await db.update(gateOutpassTable).set({ ...outpassBody, updatedAt: new Date() })
      .where(and(eq(gateOutpassTable.id, String(req.params.id)), eq(gateOutpassTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT gate outpass failed");
    return res.status(500).json({ error: "Failed to update outpass" });
  }
});

router.patch("/admin/gate/outpass/:id/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireGateTenant(req, res);
    if (!tenantId) return;
    const id = String(req.params.id);
    const { status } = req.body as { status: string };
    const [row] = await db.update(gateOutpassTable).set({ status, updatedAt: new Date() })
      .where(and(eq(gateOutpassTable.id, id), eq(gateOutpassTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PATCH gate outpass status failed");
    return res.status(500).json({ error: "Failed to update outpass status" });
  }
});

router.delete("/admin/gate/outpass/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireGateTenant(req, res);
    if (!tenantId) return;
    await db.delete(gateOutpassTable).where(and(eq(gateOutpassTable.id, String(req.params.id)), eq(gateOutpassTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE gate outpass failed");
    return res.status(500).json({ error: "Failed to delete outpass" });
  }
});

router.get("/admin/gate/stats", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireGateTenant(req, res);
    if (!tenantId) return;
    const today = todayPrefix();
    const g = gateLogTable;
    const o = gateOutpassTable;
    const tenantCond = eq(g.tenantId, tenantId);
    const outpassTenantCond = eq(o.tenantId, tenantId);

    const [todayEntries, onCampus, activeOutpasses, expiringToday, byType] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(g).where(and(tenantCond, like(g.inTime, `${today}%`))),
      db.select({ count: sql<number>`count(*)::int` }).from(g).where(and(tenantCond, like(g.inTime, `${today}%`), isNull(g.outTime))),
      db.select({ count: sql<number>`count(*)::int` }).from(o).where(and(outpassTenantCond, eq(o.status, "active"))),
      db.select({ count: sql<number>`count(*)::int` }).from(o).where(and(outpassTenantCond, eq(o.status, "active"), eq(o.validUntil, today))),
      db.select({ personType: g.personType, count: sql<number>`count(*)::int` })
        .from(g)
        .where(and(tenantCond, like(g.inTime, `${today}%`)))
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
