import { Router, type IRouter, type Request, type Response } from "express";
import { db, schoolCalendarWeekendsTable, schoolHolidaysTable } from "@workspace/db";
import { eq, and, gte, lte, or } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";

const router: IRouter = Router();

const VALID_AUDIENCES  = ["students", "staff", "both"];
const VALID_CATEGORIES = ["national", "religious", "event", "institutional", "other"];
const DAY_COLS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// ── Weekend config ────────────────────────────────────────────────────────────

router.get("/admin/calendar/weekends", requireAdmin, async (req: Request, res: Response) => {
  const { yearId, audience } = req.query as Record<string, string>;
  if (!yearId || !audience) return res.status(400).json({ error: "yearId and audience required" });
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const conds: any[] = [
      eq(schoolCalendarWeekendsTable.yearId, yearId),
      eq(schoolCalendarWeekendsTable.audience, audience),
      eq(schoolCalendarWeekendsTable.tenantId, tenantId),
    ];
    const rows = await db.select().from(schoolCalendarWeekendsTable).where(and(...conds));
    if (rows.length > 0) return res.json(rows[0]);
    return res.json({ yearId, audience, mon: false, tue: false, wed: false, thu: false, fri: false, sat: true, sun: true, notes: null });
  } catch {
    return res.status(500).json({ error: "Failed to load weekend config" });
  }
});

router.put("/admin/calendar/weekends", requireAdmin, async (req: Request, res: Response) => {
  const { yearId, audience, mon, tue, wed, thu, fri, sat, sun, notes } = req.body ?? {};
  if (!yearId || !audience) return res.status(400).json({ error: "yearId and audience required" });
  if (!VALID_AUDIENCES.includes(audience)) return res.status(400).json({ error: "invalid audience" });
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const vals = { tenantId, yearId, audience, mon: !!mon, tue: !!tue, wed: !!wed, thu: !!thu, fri: !!fri, sat: !!sat, sun: !!sun, notes: notes || null };
    const [row] = await db.insert(schoolCalendarWeekendsTable).values(vals)
      .onConflictDoUpdate({
        target: [schoolCalendarWeekendsTable.yearId, schoolCalendarWeekendsTable.audience, schoolCalendarWeekendsTable.tenantId],
        set: { ...vals, updatedAt: new Date() },
      })
      .returning();
    return res.json(row);
  } catch {
    return res.status(500).json({ error: "Failed to save weekend config" });
  }
});

// ── Holidays ──────────────────────────────────────────────────────────────────

router.get("/admin/calendar/holidays", requireAdmin, async (req: Request, res: Response) => {
  const { yearId, audience } = req.query as Record<string, string>;
  if (!yearId) return res.status(400).json({ error: "yearId required" });
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const conditions: any[] = [
      eq(schoolHolidaysTable.yearId, yearId),
      eq(schoolHolidaysTable.tenantId, tenantId),
    ];
    if (audience) conditions.push(or(eq(schoolHolidaysTable.audience, audience), eq(schoolHolidaysTable.audience, "both")));
    const rows = await db.select().from(schoolHolidaysTable)
      .where(and(...conditions))
      .orderBy(schoolHolidaysTable.date);
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to load holidays" });
  }
});

router.post("/admin/calendar/holidays", requireAdmin, async (req: Request, res: Response) => {
  const { yearId, audience, date, name, category = "other", notes } = req.body ?? {};
  if (!yearId || !audience || !date || !name) return res.status(400).json({ error: "yearId, audience, date, name required" });
  if (!VALID_AUDIENCES.includes(audience)) return res.status(400).json({ error: "invalid audience" });
  if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: "invalid category" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [row] = await db.insert(schoolHolidaysTable)
      .values({ tenantId, yearId, audience, date, name: String(name).trim(), category, notes: notes || null })
      .returning();
    return res.status(201).json(row);
  } catch {
    return res.status(500).json({ error: "Failed to create holiday" });
  }
});

router.put("/admin/calendar/holidays/:id", requireAdmin, async (req: Request, res: Response) => {
  const { date, name, category, audience, notes } = req.body ?? {};
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (date !== undefined)     { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" }); patch.date = date; }
  if (name !== undefined)     patch.name     = String(name).trim();
  if (category !== undefined) { if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: "invalid category" }); patch.category = category; }
  if (audience !== undefined) { if (!VALID_AUDIENCES.includes(audience)) return res.status(400).json({ error: "invalid audience" }); patch.audience = audience; }
  if (notes !== undefined)    patch.notes    = notes || null;
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [row] = await db.update(schoolHolidaysTable).set(patch as any)
      .where(and(eq(schoolHolidaysTable.id, req.params.id as string), eq(schoolHolidaysTable.tenantId, tenantId))).returning();
    if (!row) return res.status(404).json({ error: "Holiday not found" });
    return res.json(row);
  } catch {
    return res.status(500).json({ error: "Failed to update holiday" });
  }
});

router.delete("/admin/calendar/holidays/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [row] = await db.delete(schoolHolidaysTable)
      .where(and(eq(schoolHolidaysTable.id, req.params.id as string), eq(schoolHolidaysTable.tenantId, tenantId))).returning();
    if (!row) return res.status(404).json({ error: "Holiday not found" });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to delete holiday" });
  }
});

// ── Off-day lookup (used by attendance registers) ─────────────────────────────

router.get("/admin/calendar/off-days", requireAdmin, async (req: Request, res: Response) => {
  const { date, audience, yearId } = req.query as Record<string, string>;
  if (!date || !audience) return res.status(400).json({ error: "date and audience required" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });

  const dow     = new Date(date + "T00:00:00").getDay();
  const dayCol  = DAY_COLS[dow];

  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const wkndConds: any[] = [
      or(eq(schoolCalendarWeekendsTable.audience, audience), eq(schoolCalendarWeekendsTable.audience, "both")),
      eq(schoolCalendarWeekendsTable.tenantId, tenantId),
    ];
    if (yearId) wkndConds.push(eq(schoolCalendarWeekendsTable.yearId, yearId));

    const weekendRows = await db.select().from(schoolCalendarWeekendsTable).where(and(...wkndConds));
    const isWeekend   = weekendRows.some((w: any) => w[dayCol] === true);
    if (isWeekend) return res.json({ isOff: true, type: "weekend", reason: "Weekend" });

    const holConds: any[] = [
      eq(schoolHolidaysTable.date, date),
      or(eq(schoolHolidaysTable.audience, audience), eq(schoolHolidaysTable.audience, "both")),
      eq(schoolHolidaysTable.tenantId, tenantId),
    ];
    if (yearId) holConds.push(eq(schoolHolidaysTable.yearId, yearId));
    const holidays = await db.select().from(schoolHolidaysTable).where(and(...holConds));
    if (holidays.length > 0) return res.json({ isOff: true, type: "holiday", reason: holidays[0].name });

    return res.json({ isOff: false, type: null, reason: null });
  } catch {
    return res.status(500).json({ error: "Failed to check off-day" });
  }
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get("/admin/calendar/stats", requireAdmin, async (req: Request, res: Response) => {
  const { yearId, audience, fromDate, toDate } = req.query as Record<string, string>;
  if (!yearId || !audience) return res.status(400).json({ error: "yearId and audience required" });

  const curYear = new Date().getFullYear();
  const from    = fromDate || `${curYear}-01-01`;
  const to      = toDate   || `${curYear}-12-31`;

  const addDay = (s: string) => {
    const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10);
  };

  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const wkndConds: any[] = [
      eq(schoolCalendarWeekendsTable.yearId, yearId),
      or(eq(schoolCalendarWeekendsTable.audience, audience), eq(schoolCalendarWeekendsTable.audience, "both")),
      eq(schoolCalendarWeekendsTable.tenantId, tenantId),
    ];

    const wkndRows = await db.select().from(schoolCalendarWeekendsTable).where(and(...wkndConds));
    const wknd: any = wkndRows[0] ?? { mon: false, tue: false, wed: false, thu: false, fri: false, sat: true, sun: true };

    const holConds: any[] = [
      eq(schoolHolidaysTable.yearId, yearId),
      or(eq(schoolHolidaysTable.audience, audience), eq(schoolHolidaysTable.audience, "both")) as any,
      gte(schoolHolidaysTable.date, from),
      lte(schoolHolidaysTable.date, to),
      eq(schoolHolidaysTable.tenantId, tenantId),
    ];

    const holidays = await db.select().from(schoolHolidaysTable).where(and(...holConds));
    const holDates = new Set(holidays.map(h => h.date));

    let totalDays = 0, weekendDays = 0, holidayDays = 0;
    const byMonth: Record<string, { month: string; working: number; weekend: number; holiday: number }> = {};

    let cur = from;
    while (cur <= to) {
      totalDays++;
      const dow     = new Date(cur + "T00:00:00").getDay();
      const dayName = DAY_COLS[dow];
      const mk      = cur.slice(0, 7);
      if (!byMonth[mk]) byMonth[mk] = { month: mk, working: 0, weekend: 0, holiday: 0 };

      if (wknd[dayName]) {
        weekendDays++;
        byMonth[mk].weekend++;
      } else if (holDates.has(cur)) {
        holidayDays++;
        byMonth[mk].holiday++;
      } else {
        byMonth[mk].working++;
      }
      cur = addDay(cur);
    }

    return res.json({
      totalDays,
      weekendDays,
      holidayDays,
      workingDays: totalDays - weekendDays - holidayDays,
      byMonth: Object.values(byMonth),
    });
  } catch {
    return res.status(500).json({ error: "Failed to compute stats" });
  }
});

export default router;
