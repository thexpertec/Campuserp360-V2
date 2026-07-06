import { Router, type IRouter, type Request, type Response } from "express";
import { db, hostelBlocksTable, hostelRoomTypesTable, hostelRoomsTable, hostelAllocationsTable, studentsTable } from "@workspace/db";
import { eq, asc, desc, and, ilike, or, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";

/** Verify an allocation's linked student belongs to the requesting admin's tenant. */
async function resolveAllocationTenant(req: Request, allocationId: string): Promise<boolean> {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return true;
  const [row] = await db.select({ studentId: hostelAllocationsTable.studentId })
    .from(hostelAllocationsTable).where(eq(hostelAllocationsTable.id, allocationId)).limit(1);
  if (!row?.studentId) return true;
  const [stu] = await db.select({ id: studentsTable.id }).from(studentsTable)
    .where(and(eq(studentsTable.id, row.studentId), eq(studentsTable.tenantId, tenantId))).limit(1);
  return !!stu;
}

const router: IRouter = Router();

// ── Hostel Blocks ──────────────────────────────────────────────────────────────

router.get("/admin/hostel/blocks", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const rows = await db.select().from(hostelBlocksTable)
      .where(eq(hostelBlocksTable.tenantId, tenantId))
      .orderBy(asc(hostelBlocksTable.sortOrder), asc(hostelBlocksTable.name));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET hostel blocks failed");
    return res.status(500).json({ error: "Failed to fetch records" });
  }
});

router.post("/admin/hostel/blocks", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, tenantId: _ti, ...data } = req.body as any;
    const row = ((await db.insert(hostelBlocksTable).values({ ...data, tenantId }).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Name already exists" });
    req.log.error({ err }, "POST hostel block failed");
    return res.status(500).json({ error: "Failed to create record" });
  }
});

router.put("/admin/hostel/blocks/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { id: _id, createdAt: _ca, tenantId: _ti, ...body } = req.body as any;
    const [row] = await db.update(hostelBlocksTable)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(hostelBlocksTable.id, String(req.params.id)), eq(hostelBlocksTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Name already exists" });
    req.log.error({ err }, "PUT hostel block failed");
    return res.status(500).json({ error: "Failed to update record" });
  }
});

router.delete("/admin/hostel/blocks/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    await db.delete(hostelBlocksTable)
      .where(and(eq(hostelBlocksTable.id, String(req.params.id)), eq(hostelBlocksTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE hostel block failed");
    return res.status(500).json({ error: "Failed to delete record" });
  }
});

// ── Room Types ─────────────────────────────────────────────────────────────────

router.get("/admin/hostel/room-types", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const rows = await db.select().from(hostelRoomTypesTable)
      .where(eq(hostelRoomTypesTable.tenantId, tenantId))
      .orderBy(asc(hostelRoomTypesTable.sortOrder), asc(hostelRoomTypesTable.name));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET hostel room-types failed");
    return res.status(500).json({ error: "Failed to fetch records" });
  }
});

router.post("/admin/hostel/room-types", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, tenantId: _ti, ...data } = req.body as any;
    const row = ((await db.insert(hostelRoomTypesTable).values({ ...data, tenantId }).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Name already exists" });
    req.log.error({ err }, "POST hostel room-type failed");
    return res.status(500).json({ error: "Failed to create record" });
  }
});

router.put("/admin/hostel/room-types/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { id: _id, createdAt: _ca, tenantId: _ti, ...body } = req.body as any;
    const [row] = await db.update(hostelRoomTypesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(hostelRoomTypesTable.id, String(req.params.id)), eq(hostelRoomTypesTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Name already exists" });
    req.log.error({ err }, "PUT hostel room-type failed");
    return res.status(500).json({ error: "Failed to update record" });
  }
});

router.delete("/admin/hostel/room-types/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    await db.delete(hostelRoomTypesTable)
      .where(and(eq(hostelRoomTypesTable.id, String(req.params.id)), eq(hostelRoomTypesTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE hostel room-type failed");
    return res.status(500).json({ error: "Failed to delete record" });
  }
});

// ── Rooms ──────────────────────────────────────────────────────────────────────
router.get("/admin/hostel/rooms", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { blockId, status } = req.query as Record<string, string>;
    const conds: any[] = [eq(hostelRoomsTable.tenantId, tenantId)];
    if (blockId) conds.push(eq(hostelRoomsTable.blockId, blockId));
    if (status && status !== "all") conds.push(eq(hostelRoomsTable.status, status));

    const rows = await db
      .select({
        id: hostelRoomsTable.id,
        blockId: hostelRoomsTable.blockId,
        blockName: hostelBlocksTable.name,
        roomNumber: hostelRoomsTable.roomNumber,
        roomTypeId: hostelRoomsTable.roomTypeId,
        roomTypeName: hostelRoomTypesTable.name,
        floor: hostelRoomsTable.floor,
        capacity: hostelRoomsTable.capacity,
        status: hostelRoomsTable.status,
        notes: hostelRoomsTable.notes,
        occupiedCount: sql<number>`cast(count(case when ${hostelAllocationsTable.status} = 'active' then 1 end) as int)`,
      })
      .from(hostelRoomsTable)
      .leftJoin(hostelBlocksTable, eq(hostelRoomsTable.blockId, hostelBlocksTable.id))
      .leftJoin(hostelRoomTypesTable, eq(hostelRoomsTable.roomTypeId, hostelRoomTypesTable.id))
      .leftJoin(hostelAllocationsTable, eq(hostelAllocationsTable.roomId, hostelRoomsTable.id))
      .where(and(...conds))
      .groupBy(hostelRoomsTable.id, hostelBlocksTable.name, hostelRoomTypesTable.name)
      .orderBy(asc(hostelRoomsTable.roomNumber));

    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET hostel rooms failed");
    return res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// Bulk create rooms
router.post("/admin/hostel/rooms/bulk", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { blockId, floor, capacity, prefix, fromNumber, count, status } = req.body as {
      blockId: string; floor: number; capacity: number;
      prefix: string; fromNumber: number; count: number; status?: string;
    };
    if (!blockId || !count || count < 1 || count > 200) {
      return res.status(400).json({ error: "blockId and count (1-200) are required" });
    }
    // Verify the block belongs to this tenant
    const [block] = await db.select({ id: hostelBlocksTable.id }).from(hostelBlocksTable)
      .where(and(eq(hostelBlocksTable.id, blockId), eq(hostelBlocksTable.tenantId, tenantId))).limit(1);
    if (!block) return res.status(403).json({ error: "Block not found in this tenant" });

    const rooms = Array.from({ length: count }, (_, i) => ({
      tenantId,
      blockId,
      roomNumber: `${prefix ?? ""}${fromNumber + i}`,
      floor: floor ?? 1,
      capacity: capacity ?? 2,
      status: status ?? "available",
    }));
    const inserted = await db.insert(hostelRoomsTable).values(rooms).returning();
    return res.status(201).json(inserted);
  } catch (err: any) {
    req.log.error({ err }, "POST hostel rooms/bulk failed");
    return res.status(500).json({ error: "Failed to bulk-create rooms" });
  }
});

router.post("/admin/hostel/rooms", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, tenantId: _ti, ...data } = req.body as any;
    const row = ((await db.insert(hostelRoomsTable).values({ ...data, tenantId }).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err: any) {
    req.log.error({ err }, "POST hostel room failed");
    return res.status(500).json({ error: "Failed to create room" });
  }
});

router.put("/admin/hostel/rooms/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { id: _id, createdAt: _ca, tenantId: _ti, ...roomBody } = req.body as any;
    const [row] = await db.update(hostelRoomsTable)
      .set({ ...roomBody, updatedAt: new Date() })
      .where(and(eq(hostelRoomsTable.id, String(req.params.id)), eq(hostelRoomsTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT hostel room failed");
    return res.status(500).json({ error: "Failed to update room" });
  }
});

router.delete("/admin/hostel/rooms/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    await db.delete(hostelRoomsTable)
      .where(and(eq(hostelRoomsTable.id, String(req.params.id)), eq(hostelRoomsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE hostel room failed");
    return res.status(500).json({ error: "Failed to delete room" });
  }
});

// ── Allocations ────────────────────────────────────────────────────────────────
router.get("/admin/hostel/allocations", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, search, studentId } = req.query as Record<string, string>;
    const tenantId = await getAdminTenantId(req);
    let q = db.select().from(hostelAllocationsTable).$dynamic();
    const conds: any[] = [];
    if (tenantId) conds.push(sql`${hostelAllocationsTable.studentId} IN (SELECT id FROM students WHERE tenant_id = ${tenantId}::uuid)`);
    if (studentId) conds.push(eq(hostelAllocationsTable.studentId, studentId));
    if (status && status !== "all") conds.push(eq(hostelAllocationsTable.status, status));
    if (search) conds.push(or(ilike(hostelAllocationsTable.studentName, `%${search}%`), ilike(hostelAllocationsTable.applicantId, `%${search}%`)));
    if (conds.length) q = q.where(and(...conds));
    const rows = await q.orderBy(desc(hostelAllocationsTable.fromDate));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET hostel allocations failed");
    return res.status(500).json({ error: "Failed to fetch allocations" });
  }
});

router.post("/admin/hostel/allocations", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    if (data.studentId) {
      const tenantId = await getAdminTenantId(req);
      if (tenantId) {
        const [stu] = await db.select({ id: studentsTable.id }).from(studentsTable)
          .where(and(eq(studentsTable.id, data.studentId), eq(studentsTable.tenantId, tenantId))).limit(1);
        if (!stu) return res.status(403).json({ error: "Student not found in this tenant" });
      }
    }
    const row = ((await db.insert(hostelAllocationsTable).values(data).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err: any) {
    req.log.error({ err }, "POST hostel allocation failed");
    return res.status(500).json({ error: "Failed to create allocation" });
  }
});

router.put("/admin/hostel/allocations/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const allocId = String(req.params.id);
    if (!await resolveAllocationTenant(req, allocId)) return res.status(403).json({ error: "Allocation not found in this tenant" });
    const { id: _id, createdAt: _ca, ...allocBody } = req.body as any;
    const [row] = await db.update(hostelAllocationsTable).set({ ...allocBody, updatedAt: new Date() }).where(eq(hostelAllocationsTable.id, allocId)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT hostel allocation failed");
    return res.status(500).json({ error: "Failed to update allocation" });
  }
});

router.delete("/admin/hostel/allocations/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const allocId = String(req.params.id);
    if (!await resolveAllocationTenant(req, allocId)) return res.status(403).json({ error: "Allocation not found in this tenant" });
    await db.delete(hostelAllocationsTable).where(eq(hostelAllocationsTable.id, allocId));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE hostel allocation failed");
    return res.status(500).json({ error: "Failed to delete allocation" });
  }
});

export default router;
