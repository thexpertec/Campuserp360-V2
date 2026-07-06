import { Router, type Request, type Response } from "express";
import { db, vendorsTable, chartOfAccountsTable } from "@workspace/db";
import { canonicalizePhone } from "../lib/format-utils.js";
import { eq, asc, sql, and } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { syncVendorCoa } from "../lib/coa-sync";
import { getAdminTenantId } from "../lib/tenant";

const router = Router();

// ── List ────────────────────────────────────────────────────────────────────────

router.get("/admin/vendors", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
    const where = eq(vendorsTable.tenantId, tenantId);
    const rows = await db
      .select({
        id:            vendorsTable.id,
        tenantId:      vendorsTable.tenantId,
        vendorCode:    vendorsTable.vendorCode,
        name:          vendorsTable.name,
        contactPerson: vendorsTable.contactPerson,
        phone:         vendorsTable.phone,
        email:         vendorsTable.email,
        address:       vendorsTable.address,
        taxNo:         vendorsTable.taxNo,
        bankName:      vendorsTable.bankName,
        accountNumber: vendorsTable.accountNumber,
        notes:         vendorsTable.notes,
        sortOrder:     vendorsTable.sortOrder,
        active:        vendorsTable.active,
        coaId:         vendorsTable.coaId,
        createdAt:     vendorsTable.createdAt,
        updatedAt:     vendorsTable.updatedAt,
        coaCode:       chartOfAccountsTable.code,
        coaName:       chartOfAccountsTable.name,
      })
      .from(vendorsTable)
      .leftJoin(chartOfAccountsTable, eq(vendorsTable.coaId, chartOfAccountsTable.id))
      .where(where)
      .orderBy(asc(vendorsTable.sortOrder), asc(vendorsTable.name));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list vendors");
    return res.status(500).json({ error: "Failed to load vendors" });
  }
});

// ── Next vendor code helper (per-tenant) ────────────────────────────────────

async function nextVendorCode(tenantId: string): Promise<string> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(vendorsTable)
    .where(eq(vendorsTable.tenantId, tenantId));
  const seq = Number(row?.n ?? 0) + 1;
  return `VND-${String(seq).padStart(3, "0")}`;
}

// ── Create ──────────────────────────────────────────────────────────────────────

router.post("/admin/vendors", requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      name, contactPerson, phone, email, address, taxNo,
      bankName, accountNumber, notes, sortOrder,
    } = req.body ?? {};

    if (!name?.trim()) return res.status(400).json({ error: "name is required" });
    let canonPhone: string | null = null;
    if (phone?.trim()) {
      canonPhone = canonicalizePhone(phone.trim());
      if (!canonPhone) return res.status(400).json({ error: "phone must be exactly 11 digits — format: 0XXX-XXXXXXX" });
    }

    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
    const vendorCode = await nextVendorCode(tenantId);

    const [created] = await db
      .insert(vendorsTable)
      .values({
        tenantId,
        vendorCode,
        name:          name.trim(),
        contactPerson: contactPerson?.trim() || null,
        phone:         canonPhone,
        email:         email?.trim() || null,
        address:       address?.trim() || null,
        taxNo:         taxNo?.trim() || null,
        bankName:      bankName?.trim() || null,
        accountNumber: accountNumber?.trim() || null,
        notes:         notes?.trim() || null,
        sortOrder:     typeof sortOrder === "number" ? sortOrder : 0,
      })
      .returning();

    if (tenantId) {
      void syncVendorCoa({ id: created.id, name: created.name, vendorCode: created.vendorCode }, tenantId);
    }

    return res.status(201).json(created);
  } catch (err: any) {
    req.log.error({ err }, "Failed to create vendor");
    return res.status(500).json({ error: err?.message ?? "Failed to create vendor" });
  }
});

// ── Update ──────────────────────────────────────────────────────────────────────

router.patch("/admin/vendors/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const {
      name, contactPerson, phone, email, address, taxNo,
      bankName, accountNumber, notes, sortOrder, active,
    } = req.body ?? {};

    const patch: Record<string, any> = { updatedAt: new Date() };
    if (name          !== undefined) patch.name          = name.trim();
    if (contactPerson !== undefined) patch.contactPerson = contactPerson?.trim() || null;
    if (phone !== undefined) {
      if (phone?.trim()) {
        const canonical = canonicalizePhone(phone.trim());
        if (!canonical) return res.status(400).json({ error: "phone must be exactly 11 digits — format: 0XXX-XXXXXXX" });
        patch.phone = canonical;
      } else { patch.phone = null; }
    }
    if (email         !== undefined) patch.email         = email?.trim() || null;
    if (address       !== undefined) patch.address       = address?.trim() || null;
    if (taxNo         !== undefined) patch.taxNo         = taxNo?.trim() || null;
    if (bankName      !== undefined) patch.bankName      = bankName?.trim() || null;
    if (accountNumber !== undefined) patch.accountNumber = accountNumber?.trim() || null;
    if (notes         !== undefined) patch.notes         = notes?.trim() || null;
    if (sortOrder     !== undefined) patch.sortOrder     = Number(sortOrder) || 0;
    if (active        !== undefined) patch.active        = Boolean(active);

    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
    const where = and(eq(vendorsTable.id, id), eq(vendorsTable.tenantId, tenantId));

    const [updated] = await db
      .update(vendorsTable)
      .set(patch)
      .where(where)
      .returning();

    if (!updated) return res.status(404).json({ error: "Vendor not found" });

    if (name !== undefined) {
      void syncVendorCoa({ id: updated.id, name: updated.name, vendorCode: updated.vendorCode }, tenantId);
    }

    return res.json(updated);
  } catch (err: any) {
    req.log.error({ err }, "Failed to update vendor");
    return res.status(500).json({ error: err?.message ?? "Failed to update vendor" });
  }
});

// ── Delete ──────────────────────────────────────────────────────────────────────

router.delete("/admin/vendors/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
    const where = and(eq(vendorsTable.id, id), eq(vendorsTable.tenantId, tenantId));

    // Fetch vendor (scoped to tenant) to get linked COA account
    const [vendor] = await db
      .select({ id: vendorsTable.id, coaId: vendorsTable.coaId })
      .from(vendorsTable)
      .where(where)
      .limit(1);

    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    if (vendor.coaId) {
      // Soft-deactivate the linked COA sub-account before removing the vendor
      await db
        .update(chartOfAccountsTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(chartOfAccountsTable.id, vendor.coaId));
    }

    await db.delete(vendorsTable).where(where);
    return res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "23503") {
      return res.status(409).json({ error: "Cannot delete — this vendor has linked transactions" });
    }
    req.log.error({ err }, "Failed to delete vendor");
    return res.status(500).json({ error: "Failed to delete vendor" });
  }
});

export default router;
