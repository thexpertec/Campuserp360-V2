import { Router, type IRouter, type Request, type Response } from "express";
import { db, admissionFormConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth.js";
import { publicTenant, getAdminTenantId } from "../lib/tenant.js";
import { CONFIGURABLE_FORM_FIELDS } from "@workspace/db";
import type { ConfigurableFormField } from "@workspace/db";

const router: IRouter = Router();

// Field metadata — label, required-toggle flag, and which form step the field lives on.
// step: 1 = Academic, 2 = Student Personal, 3 = Contact, 4 = Guardian
const FIELD_META: Record<ConfigurableFormField, { label: string; canToggleRequired: boolean; step: number }> = {
  // Step 2 — Student Personal
  gender:        { label: "Gender",              canToggleRequired: true,  step: 2 },
  bloodGroup:    { label: "Blood Group",         canToggleRequired: true,  step: 2 },
  religion:      { label: "Religion",            canToggleRequired: true, step: 2 },
  photo:         { label: "Student Photo",       canToggleRequired: true,  step: 2 },
  studentBForm:  { label: "B-Form / CNIC",       canToggleRequired: true,  step: 2 },
  nationality:   { label: "Nationality",         canToggleRequired: true,  step: 2 },
  domicile:      { label: "Domicile Province",   canToggleRequired: true,  step: 2 },
  // Step 3 — Contact
  studentMobile: { label: "Student Mobile",      canToggleRequired: true, step: 3 },
  studentEmail:  { label: "Student Email",       canToggleRequired: true, step: 3 },
  state:         { label: "State / Province",    canToggleRequired: true,  step: 3 },
  city:          { label: "City",                canToggleRequired: true,  step: 3 },
  examCenter:    { label: "Exam Centre",         canToggleRequired: true,  step: 3 },
  // Step 4 — Guardian
  relation:      { label: "Relation to Guardian", canToggleRequired: true, step: 4 },
  occupation:    { label: "Occupation",           canToggleRequired: true, step: 4 },
  motherName:    { label: "Mother's Name",        canToggleRequired: true,  step: 4 },
  guardianEmail: { label: "Guardian Email",       canToggleRequired: true,  step: 4 },
  alternatePhone: { label: "Alternate Phone",    canToggleRequired: true,  step: 4 },
};

// ── In-process cache for the public endpoint ──────────────────────────────────
// Keyed by tenant ID. Cleared on admin save so the next public request re-reads.
const publicConfigCache = new Map<string, { data: unknown; expiresAt: number }>();
const PUBLIC_CACHE_TTL_MS = 60 * 1000; // 60 seconds

function invalidatePublicCache(tenantId: string) {
  publicConfigCache.delete(tenantId);
}

// Resolve the effective config for a tenant: DB rows merged with defaults for
// any fields that have no row yet (treat missing rows as enabled + required=true).
async function resolveConfig(tenantId: string) {
  const rows = await db
    .select()
    .from(admissionFormConfigTable)
    .where(eq(admissionFormConfigTable.tenantId, tenantId));

  const byKey = new Map(rows.map((r) => [r.fieldKey, r]));

  return CONFIGURABLE_FORM_FIELDS.map((fieldKey) => {
    const row = byKey.get(fieldKey);
    const meta = FIELD_META[fieldKey];
    return {
      fieldKey,
      label: meta.label,
      canToggleRequired: meta.canToggleRequired,
      step: meta.step,
      enabled: row ? row.enabled : true,
      required: row ? row.required : true,
    };
  });
}

// ── GET /admin/admissions/form-config ─────────────────────────────────────────
router.get("/admin/admissions/form-config", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context required" });
    }
    const config = await resolveConfig(tenantId);
    return res.json(config);
  } catch (err) {
    req.log?.error?.({ err }, "Failed to load admission form config");
    return res.status(500).json({ error: "Failed to load form config" });
  }
});

// ── PUT /admin/admissions/form-config ─────────────────────────────────────────
// Body: array of { fieldKey, enabled, required }
router.put("/admin/admissions/form-config", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context required" });
    }

    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Request body must be an array" });
    }

    const validFields = new Set<string>(CONFIGURABLE_FORM_FIELDS);
    for (const item of items) {
      if (typeof item.fieldKey !== "string" || !validFields.has(item.fieldKey)) {
        return res.status(400).json({ error: `Invalid fieldKey: ${item.fieldKey}` });
      }
      if (typeof item.enabled !== "boolean") {
        return res.status(400).json({ error: `enabled must be boolean for field: ${item.fieldKey}` });
      }
      if (typeof item.required !== "boolean") {
        return res.status(400).json({ error: `required must be boolean for field: ${item.fieldKey}` });
      }
    }

    // Batch upsert using ON CONFLICT
    for (const item of items) {
      await db
        .insert(admissionFormConfigTable)
        .values({
          tenantId,
          fieldKey: item.fieldKey as ConfigurableFormField,
          enabled: item.enabled,
          required: item.required,
        })
        .onConflictDoUpdate({
          target: [admissionFormConfigTable.tenantId, admissionFormConfigTable.fieldKey],
          set: {
            enabled: item.enabled,
            required: item.required,
            updatedAt: new Date(),
          },
        });
    }

    invalidatePublicCache(tenantId);

    const config = await resolveConfig(tenantId);
    return res.json(config);
  } catch (err) {
    req.log?.error?.({ err }, "Failed to update admission form config");
    return res.status(500).json({ error: "Failed to update form config" });
  }
});

// ── GET /website/admissions/form-config ───────────────────────────────────────
// Public endpoint — no auth required. Returns a compact map of { fieldKey → { enabled, required } }.
router.get("/website/admissions/form-config", publicTenant, async (req: Request, res: Response) => {
  try {
    const tenantId: string | null = (req as any).tenantId ?? null;
    if (!tenantId) {
      // No tenant context — return all fields enabled
      const fallback: Record<string, { enabled: boolean; required: boolean }> = {};
      for (const f of CONFIGURABLE_FORM_FIELDS) {
        fallback[f] = { enabled: true, required: true };
      }
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.json(fallback);
    }

    const now = Date.now();
    const cached = publicConfigCache.get(tenantId);
    if (cached && cached.expiresAt > now) {
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.json(cached.data);
    }

    const rows = await db
      .select()
      .from(admissionFormConfigTable)
      .where(eq(admissionFormConfigTable.tenantId, tenantId));

    const byKey = new Map(rows.map((r) => [r.fieldKey, r]));
    const result: Record<string, { enabled: boolean; required: boolean }> = {};
    for (const f of CONFIGURABLE_FORM_FIELDS) {
      const row = byKey.get(f);
      result[f] = {
        enabled: row ? row.enabled : true,
        required: row ? row.required : true,
      };
    }

    publicConfigCache.set(tenantId, { data: result, expiresAt: now + PUBLIC_CACHE_TTL_MS });
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.json(result);
  } catch (err) {
    req.log?.error?.({ err }, "Failed to load public admission form config");
    // On error return all-enabled fallback
    const fallback: Record<string, { enabled: boolean; required: boolean }> = {};
    for (const f of CONFIGURABLE_FORM_FIELDS) {
      fallback[f] = { enabled: true, required: true };
    }
    return res.json(fallback);
  }
});

export default router;
