import { Router, type IRouter, type Request, type Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { db, eventsTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, desc, count, or } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";

const CONFIG_PATH = path.join(process.cwd(), "uploads", "event-config.json");

function readEventConfig(): { venues: string[]; organizers: string[] } {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); }
  catch { return { venues: [], organizers: [] }; }
}
function writeEventConfig(cfg: { venues: string[]; organizers: string[] }) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

const router: IRouter = Router();

const todayStr = () => new Date().toISOString().slice(0, 10);

const VALID_TYPES     = ["academic","cultural","sports","ceremony","meeting","holiday","other"];
const VALID_AUDIENCES = ["all","cadets","staff","parents"];
const VALID_STATUSES  = ["draft","published","cancelled","completed"];

function validateEventBody(body: Record<string, unknown>, requireAll = true) {
  const errors: string[] = [];
  if (requireAll || body.title     !== undefined) { if (!body.title || typeof body.title !== "string") errors.push("title required"); }
  if (requireAll || body.startDate !== undefined) { if (!body.startDate || typeof body.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate as string)) errors.push("startDate must be YYYY-MM-DD"); }
  if (body.eventType  !== undefined && !VALID_TYPES.includes(body.eventType as string))     errors.push("invalid eventType");
  if (body.targetAudience !== undefined && !VALID_AUDIENCES.includes(body.targetAudience as string)) errors.push("invalid targetAudience");
  if (body.status     !== undefined && !VALID_STATUSES.includes(body.status as string))     errors.push("invalid status");
  if (body.endDate    !== undefined && body.endDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate as string)) errors.push("endDate must be YYYY-MM-DD");
  return errors;
}

// ── Dashboard stats ───────────────────────────────────────────────────────────

router.get("/admin/events/stats", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const today = todayStr();
    const monthStart = today.slice(0, 7) + "-01";
    const monthEnd   = today.slice(0, 7) + "-31";

    const base = and(eq(eventsTable.status, "published"), eq(eventsTable.tenantId, tenantId));

    const [totalRow]     = await db.select({ count: count() }).from(eventsTable).where(base);
    const [upcomingRow]  = await db.select({ count: count() }).from(eventsTable).where(and(base, gte(eventsTable.startDate, today)));
    const [todayRow]     = await db.select({ count: count() }).from(eventsTable).where(and(base, eq(eventsTable.startDate, today)));
    const [thisMonthRow] = await db.select({ count: count() }).from(eventsTable).where(and(
      base,
      gte(eventsTable.startDate, monthStart),
      lte(eventsTable.startDate, monthEnd),
    ));

    const byType = await db
      .select({ eventType: eventsTable.eventType, count: count() })
      .from(eventsTable)
      .where(base)
      .groupBy(eventsTable.eventType);

    const nextEvents = await db
      .select()
      .from(eventsTable)
      .where(and(base, gte(eventsTable.startDate, today)))
      .orderBy(eventsTable.startDate, eventsTable.startTime)
      .limit(5);

    return res.json({
      total:     Number(totalRow.count),
      upcoming:  Number(upcomingRow.count),
      today:     Number(todayRow.count),
      thisMonth: Number(thisMonthRow.count),
      byType,
      nextEvents,
    });
  } catch {
    return res.status(500).json({ error: "Failed to load stats" });
  }
});

// ── List ──────────────────────────────────────────────────────────────────────

router.get("/admin/events", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { status, type, upcoming, search } = req.query as Record<string, string>;
    const today = todayStr();

    const conditions: any[] = [eq(eventsTable.tenantId, tenantId)];
    if (status)               conditions.push(eq(eventsTable.status, status));
    if (type)                 conditions.push(eq(eventsTable.eventType, type));
    if (upcoming === "true")  conditions.push(gte(eventsTable.startDate, today));
    if (search) {
      conditions.push(or(
        ilike(eventsTable.title,    `%${search}%`),
        ilike(eventsTable.venue,    `%${search}%`),
        ilike(eventsTable.organizer,`%${search}%`),
      ));
    }

    const rows = await db
      .select()
      .from(eventsTable)
      .where(and(...conditions))
      .orderBy(desc(eventsTable.startDate), eventsTable.startTime);

    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to list events" });
  }
});

// ── Create ────────────────────────────────────────────────────────────────────

router.post("/admin/events", requireAdmin, async (req: Request, res: Response) => {
  const errors = validateEventBody(req.body, true);
  if (errors.length) return res.status(400).json({ error: errors.join("; ") });

  const { title, description, eventType = "other", startDate, startTime, endDate, endTime,
          venue, organizer, targetAudience = "all", status = "draft", isPublic = false, notes } = req.body;
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [row] = await db.insert(eventsTable).values({
      tenantId,
      title, description: description || null,
      eventType, startDate, startTime: startTime || null,
      endDate: endDate || null, endTime: endTime || null,
      venue: venue || null, organizer: organizer || null,
      targetAudience, status, isPublic: !!isPublic,
      notes: notes || null,
    }).returning();
    return res.status(201).json(row);
  } catch {
    return res.status(500).json({ error: "Failed to create event" });
  }
});

// ── Update ────────────────────────────────────────────────────────────────────

router.patch("/admin/events/:id", requireAdmin, async (req: Request, res: Response) => {
  const errors = validateEventBody(req.body, false);
  if (errors.length) return res.status(400).json({ error: errors.join("; ") });

  const { title, description, eventType, startDate, startTime, endDate, endTime,
          venue, organizer, targetAudience, status, isPublic, notes } = req.body;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (title           !== undefined) patch.title           = title;
  if (description     !== undefined) patch.description     = description || null;
  if (eventType       !== undefined) patch.eventType       = eventType;
  if (startDate       !== undefined) patch.startDate       = startDate;
  if (startTime       !== undefined) patch.startTime       = startTime || null;
  if (endDate         !== undefined) patch.endDate         = endDate || null;
  if (endTime         !== undefined) patch.endTime         = endTime || null;
  if (venue           !== undefined) patch.venue           = venue || null;
  if (organizer       !== undefined) patch.organizer       = organizer || null;
  if (targetAudience  !== undefined) patch.targetAudience  = targetAudience;
  if (status          !== undefined) patch.status          = status;
  if (isPublic        !== undefined) patch.isPublic        = !!isPublic;
  if (notes           !== undefined) patch.notes           = notes || null;

  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [row] = await db.update(eventsTable).set(patch as any)
      .where(and(eq(eventsTable.id, req.params.id as string), eq(eventsTable.tenantId, tenantId))).returning();
    if (!row) return res.status(404).json({ error: "Event not found" });
    return res.json(row);
  } catch {
    return res.status(500).json({ error: "Failed to update event" });
  }
});

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete("/admin/events/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [row] = await db.delete(eventsTable)
      .where(and(eq(eventsTable.id, req.params.id as string), eq(eventsTable.tenantId, tenantId))).returning();
    if (!row) return res.status(404).json({ error: "Event not found" });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to delete event" });
  }
});

// ── Setup config (venues / organizers) ────────────────────────────────────────

router.get("/admin/events/config", requireAdmin, (_req: Request, res: Response) => {
  return res.json(readEventConfig());
});

router.post("/admin/events/config", requireAdmin, (req: Request, res: Response) => {
  const { venues, organizers } = req.body ?? {};
  if (!Array.isArray(venues) || !Array.isArray(organizers)) {
    return res.status(400).json({ error: "venues and organizers must be arrays" });
  }
  const cfg = {
    venues:     [...new Set((venues     as string[]).map(v => String(v).trim()).filter(Boolean))],
    organizers: [...new Set((organizers as string[]).map(o => String(o).trim()).filter(Boolean))],
  };
  writeEventConfig(cfg);
  return res.json(cfg);
});

// ── Bulk create ───────────────────────────────────────────────────────────────

router.post("/admin/events/bulk", requireAdmin, async (req: Request, res: Response) => {
  const { events } = req.body ?? {};
  if (!Array.isArray(events) || !events.length) {
    return res.status(400).json({ error: "events[] is required" });
  }
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

  const rows: Record<string, unknown>[] = [];
  const errs: string[] = [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const errors = validateEventBody(e, true);
    if (errors.length) { errs.push(`Row ${i + 1}: ${errors.join(", ")}`); continue; }
    rows.push({
      tenantId,
      title:          e.title,
      description:    e.description    || null,
      eventType:      e.eventType      || "other",
      startDate:      e.startDate,
      startTime:      e.startTime      || null,
      endDate:        e.endDate        || null,
      endTime:        e.endTime        || null,
      venue:          e.venue          || null,
      organizer:      e.organizer      || null,
      targetAudience: e.targetAudience || "all",
      status:         e.status         || "draft",
      isPublic:       !!e.isPublic,
      notes:          e.notes          || null,
    });
  }

  if (!rows.length) return res.status(400).json({ error: errs.join("; ") });

  try {
    const inserted = await db.insert(eventsTable).values(rows as any).returning();
    return res.status(201).json({ created: inserted.length, errors: errs });
  } catch {
    return res.status(500).json({ error: "Failed to bulk create events" });
  }
});

export default router;
