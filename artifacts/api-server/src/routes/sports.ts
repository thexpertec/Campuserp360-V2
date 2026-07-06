import { Router, type IRouter, type Request, type Response } from "express";
import { db, sportsCategoriesTable, sportsVenuesTable, sportsTeamsTable, sportsFixturesTable } from "@workspace/db";
import { eq, asc, desc, and, gte, lt, ilike, or } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";

const router: IRouter = Router();

function catalogRoutes(path: string, table: any) {
  router.get(path, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
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
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
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
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
      const { id: _id, createdAt: _ca, ...body } = req.body as any;
      const [row] = await db.update(table).set({ ...body, updatedAt: new Date() })
        .where(and(eq(table.id, String(req.params.id)), eq(table.tenantId, tenantId))).returning();
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
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
      await db.delete(table).where(and(eq(table.id, String(req.params.id)), eq(table.tenantId, tenantId)));
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, `DELETE ${path}/:id failed`);
      return res.status(500).json({ error: "Failed to delete record" });
    }
  });
}

catalogRoutes("/admin/sports/categories", sportsCategoriesTable);
catalogRoutes("/admin/sports/venues", sportsVenuesTable);

// ── Teams (joined with sportCategoryName) ─────────────────────────────────────
router.get("/admin/sports/teams", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const rows = await db
      .select({
        id: sportsTeamsTable.id,
        name: sportsTeamsTable.name,
        sportCategoryId: sportsTeamsTable.sportCategoryId,
        sportCategoryName: sportsCategoriesTable.name,
        house: sportsTeamsTable.house,
        coachName: sportsTeamsTable.coachName,
        notes: sportsTeamsTable.notes,
        active: sportsTeamsTable.active,
        createdAt: sportsTeamsTable.createdAt,
      })
      .from(sportsTeamsTable)
      .leftJoin(sportsCategoriesTable, eq(sportsTeamsTable.sportCategoryId, sportsCategoriesTable.id))
      .where(eq(sportsTeamsTable.tenantId, tenantId))
      .orderBy(asc(sportsTeamsTable.name));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET sports teams failed");
    return res.status(500).json({ error: "Failed to fetch teams" });
  }
});

router.post("/admin/sports/teams", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    const row = ((await db.insert(sportsTeamsTable).values({ ...data, tenantId }).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Team name already exists" });
    req.log.error({ err }, "POST sports team failed");
    return res.status(500).json({ error: "Failed to create team" });
  }
});

router.put("/admin/sports/teams/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, ...teamBody } = req.body as any;
    const [row] = await db.update(sportsTeamsTable).set({ ...teamBody, updatedAt: new Date() })
      .where(and(eq(sportsTeamsTable.id, String(req.params.id)), eq(sportsTeamsTable.tenantId, tenantId))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Team name already exists" });
    req.log.error({ err }, "PUT sports team failed");
    return res.status(500).json({ error: "Failed to update team" });
  }
});

router.delete("/admin/sports/teams/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(sportsTeamsTable)
      .where(and(eq(sportsTeamsTable.id, String(req.params.id)), eq(sportsTeamsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE sports team failed");
    return res.status(500).json({ error: "Failed to delete team" });
  }
});

// ── Fixtures (joined with venueName) ──────────────────────────────────────────
async function listFixturesJoined(conds: any[]) {
  return db
    .select({
      id: sportsFixturesTable.id,
      homeTeam: sportsFixturesTable.homeTeam,
      awayTeam: sportsFixturesTable.awayTeam,
      sport: sportsFixturesTable.sport,
      venueId: sportsFixturesTable.venueId,
      venueName: sportsVenuesTable.name,
      scheduledDate: sportsFixturesTable.scheduledDate,
      scheduledTime: sportsFixturesTable.scheduledTime,
      status: sportsFixturesTable.status,
      homeScore: sportsFixturesTable.homeScore,
      awayScore: sportsFixturesTable.awayScore,
      result: sportsFixturesTable.result,
      notes: sportsFixturesTable.notes,
      createdAt: sportsFixturesTable.createdAt,
    })
    .from(sportsFixturesTable)
    .leftJoin(sportsVenuesTable, eq(sportsFixturesTable.venueId, sportsVenuesTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(sportsFixturesTable.scheduledDate), desc(sportsFixturesTable.createdAt));
}

router.get("/admin/sports/fixtures", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { status, date, upcoming, search } = req.query as Record<string, string>;
    const today = new Date().toISOString().slice(0, 10);
    const f = sportsFixturesTable;
    const conds: any[] = [eq(f.tenantId, tenantId)];

    if (status && status !== "all") conds.push(eq(f.status, status));
    if (date) conds.push(eq(f.scheduledDate, date));
    if (upcoming === "true") conds.push(gte(f.scheduledDate, today));
    if (upcoming === "false") conds.push(lt(f.scheduledDate, today));
    if (search) conds.push(or(ilike(f.homeTeam, `%${search}%`), ilike(f.awayTeam, `%${search}%`), ilike(f.sport, `%${search}%`)));

    const rows = await listFixturesJoined(conds);
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET sports fixtures failed");
    return res.status(500).json({ error: "Failed to fetch fixtures" });
  }
});

router.post("/admin/sports/fixtures", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    const row = ((await db.insert(sportsFixturesTable).values({ ...data, tenantId }).returning()) as any[])[0];
    const [enriched] = await listFixturesJoined([eq(sportsFixturesTable.id, row.id)]);
    return res.status(201).json(enriched ?? row);
  } catch (err: any) {
    req.log.error({ err }, "POST sports fixture failed");
    return res.status(500).json({ error: "Failed to create fixture" });
  }
});

router.put("/admin/sports/fixtures/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, ...fixtureBody } = req.body as any;
    const [row] = await db.update(sportsFixturesTable).set({ ...fixtureBody, updatedAt: new Date() })
      .where(and(eq(sportsFixturesTable.id, id), eq(sportsFixturesTable.tenantId, tenantId))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    const [enriched] = await listFixturesJoined([eq(sportsFixturesTable.id, row.id)]);
    return res.json(enriched ?? row);
  } catch (err) {
    req.log.error({ err }, "PUT sports fixture failed");
    return res.status(500).json({ error: "Failed to update fixture" });
  }
});

// Quick result entry — PATCH /fixtures/:id/result
router.patch("/admin/sports/fixtures/:id/result", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { homeScore, awayScore, result, notes } = req.body;
    const [row] = await db
      .update(sportsFixturesTable)
      .set({ homeScore, awayScore, result: result ?? null, notes: notes ?? null, status: "completed", updatedAt: new Date() })
      .where(and(eq(sportsFixturesTable.id, id), eq(sportsFixturesTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    const [enriched] = await listFixturesJoined([eq(sportsFixturesTable.id, row.id)]);
    return res.json(enriched ?? row);
  } catch (err) {
    req.log.error({ err }, "PATCH sports fixture result failed");
    return res.status(500).json({ error: "Failed to record result" });
  }
});

// Quick status change — PATCH /fixtures/:id/status
router.patch("/admin/sports/fixtures/:id/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { status } = req.body as { status: string };
    const [row] = await db.update(sportsFixturesTable).set({ status, updatedAt: new Date() })
      .where(and(eq(sportsFixturesTable.id, id), eq(sportsFixturesTable.tenantId, tenantId))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    const [enriched] = await listFixturesJoined([eq(sportsFixturesTable.id, row.id)]);
    return res.json(enriched ?? row);
  } catch (err) {
    req.log.error({ err }, "PATCH sports fixture status failed");
    return res.status(500).json({ error: "Failed to update status" });
  }
});

router.delete("/admin/sports/fixtures/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(sportsFixturesTable)
      .where(and(eq(sportsFixturesTable.id, String(req.params.id)), eq(sportsFixturesTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE sports fixture failed");
    return res.status(500).json({ error: "Failed to delete fixture" });
  }
});

export default router;
