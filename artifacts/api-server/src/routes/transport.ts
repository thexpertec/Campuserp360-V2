import { Router, type IRouter, type Request, type Response } from "express";
import { db, transportVehiclesTable, transportRoutesTable, transportDriversTable, transportTripsTable } from "@workspace/db";
import { canonicalizeCnic, canonicalizePhone } from "../lib/format-utils.js";
import { eq, asc, desc, and } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";

const router: IRouter = Router();

function catalogRoutes(path: string, table: any, orderCol?: any) {
  router.get(path, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
      const rows = await db.select().from(table)
        .where(eq(table.tenantId, tenantId))
        .orderBy(asc(table.sortOrder), asc(orderCol ?? table.name));
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
      if (err?.code === "23505") return res.status(409).json({ error: "Already exists" });
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
      if (err?.code === "23505") return res.status(409).json({ error: "Already exists" });
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

catalogRoutes("/admin/transport/vehicles", transportVehiclesTable, transportVehiclesTable.regNo);
catalogRoutes("/admin/transport/routes", transportRoutesTable);

// ── Drivers ────────────────────────────────────────────────────────────────────
router.get("/admin/transport/drivers", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { status } = req.query as Record<string, string>;
    const conds: any[] = [eq(transportDriversTable.tenantId, tenantId)];
    if (status && status !== "all") conds.push(eq(transportDriversTable.status, status));
    const rows = await db.select().from(transportDriversTable)
      .where(and(...conds))
      .orderBy(asc(transportDriversTable.name));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET transport drivers failed");
    return res.status(500).json({ error: "Failed to fetch drivers" });
  }
});
router.post("/admin/transport/drivers", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    if (data.cnic?.trim()) {
      const canon = canonicalizeCnic(data.cnic);
      if (!canon) return res.status(400).json({ error: "CNIC must be exactly 13 digits — format: XXXXX-XXXXXXX-X" });
      data.cnic = canon;
    }
    if (data.phone?.trim()) {
      const canon = canonicalizePhone(data.phone);
      if (!canon) return res.status(400).json({ error: "Phone must be exactly 11 digits — format: 0XXX-XXXXXXX" });
      data.phone = canon;
    }
    const row = ((await db.insert(transportDriversTable).values({ ...data, tenantId }).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err: any) {
    req.log.error({ err }, "POST transport driver failed");
    return res.status(500).json({ error: "Failed to create driver" });
  }
});
router.put("/admin/transport/drivers/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, ...driverBody } = req.body as any;
    if (driverBody.cnic?.trim()) {
      const canon = canonicalizeCnic(driverBody.cnic);
      if (!canon) return res.status(400).json({ error: "CNIC must be exactly 13 digits — format: XXXXX-XXXXXXX-X" });
      driverBody.cnic = canon;
    }
    if (driverBody.phone?.trim()) {
      const canon = canonicalizePhone(driverBody.phone);
      if (!canon) return res.status(400).json({ error: "Phone must be exactly 11 digits — format: 0XXX-XXXXXXX" });
      driverBody.phone = canon;
    }
    const [row] = await db.update(transportDriversTable).set({ ...driverBody, updatedAt: new Date() })
      .where(and(eq(transportDriversTable.id, String(req.params.id)), eq(transportDriversTable.tenantId, tenantId))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT transport driver failed");
    return res.status(500).json({ error: "Failed to update driver" });
  }
});
router.delete("/admin/transport/drivers/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(transportDriversTable)
      .where(and(eq(transportDriversTable.id, String(req.params.id)), eq(transportDriversTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE transport driver failed");
    return res.status(500).json({ error: "Failed to delete driver" });
  }
});

// ── Trips ──────────────────────────────────────────────────────────────────────
async function listTripsJoined(conds: any[]) {
  const r = transportRoutesTable;
  const v = transportVehiclesTable;
  const d = transportDriversTable;
  const t = transportTripsTable;

  return db
    .select({
      id: t.id,
      tripDate: t.tripDate,
      departureTime: t.departureTime,
      arrivalTime: t.arrivalTime,
      status: t.status,
      passengerCount: t.passengerCount,
      notes: t.notes,
      routeId: t.routeId,
      routeName: r.name,
      routeOrigin: r.origin,
      routeDestination: r.destination,
      vehicleId: t.vehicleId,
      vehicleRegNo: v.regNo,
      vehicleCapacity: v.capacity,
      vehicleMake: v.make,
      vehicleModel: v.model,
      driverId: t.driverId,
      driverName: d.name,
      driverPhone: d.phone,
      createdAt: t.createdAt,
    })
    .from(t)
    .leftJoin(r, eq(t.routeId, r.id))
    .leftJoin(v, eq(t.vehicleId, v.id))
    .leftJoin(d, eq(t.driverId, d.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(t.departureTime), desc(t.createdAt));
}

router.get("/admin/transport/trips", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { status, date } = req.query as Record<string, string>;
    const conds: any[] = [eq(transportTripsTable.tenantId, tenantId)];
    if (status && status !== "all") conds.push(eq(transportTripsTable.status, status));
    if (date) conds.push(eq(transportTripsTable.tripDate, date));
    const rows = await listTripsJoined(conds);
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET transport trips failed");
    return res.status(500).json({ error: "Failed to fetch trips" });
  }
});

router.post("/admin/transport/trips", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    const [raw] = await db.insert(transportTripsTable).values({ ...data, tenantId }).returning();
    const [enriched] = await listTripsJoined([eq(transportTripsTable.id, raw.id)]);
    return res.status(201).json(enriched ?? raw);
  } catch (err: any) {
    req.log.error({ err }, "POST transport trip failed");
    return res.status(500).json({ error: "Failed to create trip" });
  }
});

// Bulk create trips (clone yesterday → today)
router.post("/admin/transport/trips/bulk", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { trips: rawTrips } = req.body as { trips: any[] };
    if (!Array.isArray(rawTrips) || rawTrips.length === 0) return res.status(400).json({ error: "trips array required" });
    const trips = rawTrips.map(({ id: _id, createdAt: _ca, updatedAt: _ua, ...t }: any) => ({
      ...t,
      tenantId,
    }));
    const inserted = await db.insert(transportTripsTable).values(trips).returning();
    return res.status(201).json(inserted);
  } catch (err: any) {
    req.log.error({ err }, "POST transport trips/bulk failed");
    return res.status(500).json({ error: "Failed to bulk-create trips" });
  }
});

router.put("/admin/transport/trips/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, ...tripBody } = req.body as any;
    const [raw] = await db.update(transportTripsTable).set({ ...tripBody, updatedAt: new Date() })
      .where(and(eq(transportTripsTable.id, String(req.params.id)), eq(transportTripsTable.tenantId, tenantId))).returning();
    if (!raw) return res.status(404).json({ error: "Not found" });
    const [enriched] = await listTripsJoined([eq(transportTripsTable.id, raw.id)]);
    return res.json(enriched ?? raw);
  } catch (err) {
    req.log.error({ err }, "PUT transport trip failed");
    return res.status(500).json({ error: "Failed to update trip" });
  }
});

// Quick status patch
router.patch("/admin/transport/trips/:id/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { status } = req.body as { status: string };
    if (!status) return res.status(400).json({ error: "status required" });
    const [raw] = await db.update(transportTripsTable)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(transportTripsTable.id, String(req.params.id)), eq(transportTripsTable.tenantId, tenantId)))
      .returning();
    if (!raw) return res.status(404).json({ error: "Not found" });
    return res.json(raw);
  } catch (err) {
    req.log.error({ err }, "PATCH transport trip status failed");
    return res.status(500).json({ error: "Failed to update status" });
  }
});

router.delete("/admin/transport/trips/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(transportTripsTable)
      .where(and(eq(transportTripsTable.id, String(req.params.id)), eq(transportTripsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE transport trip failed");
    return res.status(500).json({ error: "Failed to delete trip" });
  }
});

export default router;
