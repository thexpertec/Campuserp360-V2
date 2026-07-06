import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { tenantModulePermissionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";
import { MODULES } from "@workspace/db/moduleRegistry";

const router: IRouter = Router();

// ── GET /admin/tenant/modules ──────────────────────────────────────────────────
// Returns the enabled module list for the current admin's tenant.
// Absent rows default to enabled = true (no breaking change for existing tenants).
router.get(
  "/admin/tenant/modules",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) {
        res.status(400).json({ error: "No tenant context" });
        return;
      }
      const rows = await db
        .select()
        .from(tenantModulePermissionsTable)
        .where(eq(tenantModulePermissionsTable.tenantId, tenantId));
      const saved = new Map(rows.map((r) => [r.moduleKey, r]));
      const modules = MODULES.map((m) => {
        const row = saved.get(m.key);
        return {
          key:     m.key,
          label:   m.label,
          enabled: row ? row.enabled : true,
          config:  (row?.config as Record<string, unknown>) ?? {},
        };
      });
      res.json({ modules });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch tenant modules" });
    }
  },
);

export default router;
