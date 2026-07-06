import { Router, type IRouter, type Request, type Response } from "express";
import { db, testCentresTable } from "@workspace/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import {
  CreateAdminTestCentreBody,
  UpdateAdminTestCentreBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/admin-auth";
import { resolveTenant } from "../lib/tenant";
import { canonicalizePhone } from "../lib/format-utils.js";

const router: IRouter = Router();

/**
 * Fail-closed admin tenant guard. Returns the resolved tenant id, or sends a 400
 * and returns null when no tenant context could be established (super-admin with
 * no override on a multi-tenant host). Callers MUST `return` when null.
 */
function requireTenant(req: Request, res: Response): string | null {
  const tenantId = req.adminTenantId ?? null;
  if (!tenantId) {
    res.status(400).json({ error: "Tenant context required" });
    return null;
  }
  return tenantId;
}

function isUniqueViolation(err: unknown): boolean {
  const codes: unknown[] = [];
  let cur: any = err;
  for (let i = 0; i < 4 && cur; i++) {
    codes.push(cur.code);
    cur = cur.cause;
  }
  if (codes.includes("23505")) return true;
  return err instanceof Error && /unique|duplicate/i.test(err.message);
}

function serializeCentre(c: typeof testCentresTable.$inferSelect) {
  return {
    id: c.id,
    centreCode: c.centreCode ?? null,
    name: c.name,
    city: c.city,
    address: c.address ?? null,
    focalPerson: c.focalPerson ?? null,
    phone: c.phone ?? null,
    email: c.email ?? null,
    contact: c.contact ?? null,
    venueType: (c.venueType ?? "test") as "test" | "interview" | "both",
    active: c.active,
    sortOrder: c.sortOrder,
  };
}

// ── Public: active centres for the application form ──────────────────────────
router.get("/test-centres", async (req: Request, res: Response) => {
  try {
    // Fail-closed: resolve the tenant from the request host/override. If no
    // tenant can be determined, return nothing rather than leaking every
    // tenant's centres on a shared host.
    const { tenant } = await resolveTenant(req);
    if (!tenant) return res.json([]);
    const rows = await db
      .select()
      .from(testCentresTable)
      .where(
        and(
          eq(testCentresTable.active, true),
          eq(testCentresTable.tenantId, tenant.id),
          inArray(testCentresTable.venueType, ["test", "both"]),
        ),
      )
      .orderBy(asc(testCentresTable.sortOrder), asc(testCentresTable.name));
    return res.json(rows.map(serializeCentre));
  } catch (err) {
    req.log.error({ err }, "Failed to list active test centres");
    return res.status(500).json({ error: "Failed to load test centres" });
  }
});

// ── Admin: list all centres ──────────────────────────────────────────────────
router.get(
  "/admin/test-centres",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const rows = await db
        .select()
        .from(testCentresTable)
        .where(eq(testCentresTable.tenantId, tenantId))
        .orderBy(asc(testCentresTable.sortOrder), asc(testCentresTable.name));
      return res.json(rows.map(serializeCentre));
    } catch (err) {
      req.log.error({ err }, "Failed to list admin test centres");
      return res.status(500).json({ error: "Failed to load test centres" });
    }
  },
);

// ── Admin: create a centre ───────────────────────────────────────────────────
router.post(
  "/admin/test-centres",
  requireAdmin,
  async (req: Request, res: Response) => {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const parsed = CreateAdminTestCentreBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid venue" });
    }
    const { centreCode, name, city, address, focalPerson, phone, email, contact, venueType, active, sortOrder } = parsed.data;
    let canonPhone: string | null = null;
    if (phone?.trim()) {
      canonPhone = canonicalizePhone(phone.trim());
      if (!canonPhone) return res.status(400).json({ error: "phone must be exactly 11 digits — format: 0XXX-XXXXXXX" });
    }
    try {
      const [created] = await db
        .insert(testCentresTable)
        .values({
          tenantId,
          centreCode: centreCode?.trim() || null,
          name: name.trim(),
          city: city.trim(),
          address: address?.trim() || null,
          focalPerson: focalPerson?.trim() || null,
          phone: canonPhone,
          email: email?.trim() || null,
          contact: contact?.trim() || null,
          venueType: venueType ?? "both",
          active: active ?? true,
          sortOrder: sortOrder ?? 0,
        })
        .returning();
      return res.status(201).json(serializeCentre(created));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res
          .status(400)
          .json({ error: "A venue with that name already exists" });
      }
      req.log.error({ err }, "Failed to create venue");
      return res.status(500).json({ error: "Failed to create venue" });
    }
  },
);

// ── Admin: update a centre ───────────────────────────────────────────────────
router.patch(
  "/admin/test-centres/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const parsed = UpdateAdminTestCentreBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid venue" });
    }
    const { centreCode, name, city, address, focalPerson, phone, email, contact, venueType, active, sortOrder } = parsed.data;
    const updates: Partial<typeof testCentresTable.$inferInsert> = {};
    if (centreCode !== undefined) updates.centreCode = centreCode.trim() || null;
    if (name !== undefined) updates.name = name.trim();
    if (city !== undefined) updates.city = city.trim();
    if (address !== undefined) updates.address = address.trim() || null;
    if (focalPerson !== undefined) updates.focalPerson = focalPerson.trim() || null;
    if (phone !== undefined) {
      if (phone?.trim()) {
        const canonical = canonicalizePhone(phone.trim());
        if (!canonical) return res.status(400).json({ error: "phone must be exactly 11 digits — format: 0XXX-XXXXXXX" });
        updates.phone = canonical;
      } else { updates.phone = null; }
    }
    if (email !== undefined) updates.email = email.trim() || null;
    if (contact !== undefined) updates.contact = contact.trim() || null;
    if (venueType !== undefined) updates.venueType = venueType;
    if (active !== undefined) updates.active = active;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    try {
      const [updated] = await db
        .update(testCentresTable)
        .set(updates)
        .where(and(eq(testCentresTable.id, String(req.params.id)), eq(testCentresTable.tenantId, tenantId)))
        .returning();
      if (!updated) {
        return res.status(404).json({ error: "Venue not found" });
      }
      return res.json(serializeCentre(updated));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res
          .status(400)
          .json({ error: "A venue with that name already exists" });
      }
      req.log.error({ err }, "Failed to update venue");
      return res.status(500).json({ error: "Failed to update venue" });
    }
  },
);

// ── Admin: delete a centre ───────────────────────────────────────────────────
router.delete(
  "/admin/test-centres/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = requireTenant(req, res);
      if (!tenantId) return;
      const [deleted] = await db
        .delete(testCentresTable)
        .where(and(eq(testCentresTable.id, String(req.params.id)), eq(testCentresTable.tenantId, tenantId)))
        .returning();
      if (!deleted) {
        return res.status(404).json({ error: "Venue not found" });
      }
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, "Failed to delete venue");
      return res.status(500).json({ error: "Failed to delete venue" });
    }
  },
);

export default router;
