import { Router, type IRouter, type Request, type Response, json as expressJson } from "express";
import fs from "node:fs";
import path from "node:path";
import { db } from "@workspace/db";
import { printTemplatesTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { publicTenant } from "../lib/tenant";
import { putObject, deleteObject } from "../lib/storage";

const router: IRouter = Router();

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const TMPL_DIR    = path.join(UPLOADS_DIR, "templates");
if (!fs.existsSync(TMPL_DIR)) fs.mkdirSync(TMPL_DIR, { recursive: true });

const VALID_TYPES = ["salary-slip","certificate","dmc","admit-card","offer-letter","offer-letter-applicant","offer-letter-student","offer-letter-student-ix-xi","id-card","report-card"] as const;
type DocType = typeof VALID_TYPES[number];
const VALID_SET = new Set<string>(VALID_TYPES);

const VALID_PURPOSES = new Set([
  "admit-card-entry-test",
  "offer-letter-applicants",
  "salary-slip",
  "offer-letter-hr",
  "certificate",
  "report-card",
  "dmc",
  "id-card",
]);

/** Maps built-in doc type IDs to the purpose slug they naturally cover by default.
 *  Mirrors ccm-admin's `PURPOSE_BY_DOC_TYPE` — kept in sync manually since the two
 *  packages don't share a lib for print-template metadata. */
const DEFAULT_PURPOSE_BY_TYPE: Partial<Record<DocType, string>> = {
  "salary-slip":            "salary-slip",
  "certificate":            "certificate",
  "dmc":                    "dmc",
  "report-card":            "report-card",
  "id-card":                "id-card",
  "offer-letter":           "offer-letter-hr",
  "admit-card":             "admit-card-entry-test",
  "offer-letter-applicant": "offer-letter-applicants",
};

const DEFAULT_NAMES: Record<DocType, string> = {
  "salary-slip":               "Salary Slip",
  "certificate":               "Certificate",
  "dmc":                       "Detailed Marks Certificate",
  "admit-card":                "Admit Card",
  "offer-letter":              "Offer Letter (HR)",
  "offer-letter-applicant":    "Offer Letter (Applicant)",
  "offer-letter-student":      "Offer Letter (Student)",
  "offer-letter-student-ix-xi":"Offer Letter (IX-XI)",
  "id-card":                   "ID Card",
  "report-card":               "Student Report Card",
};

function defaultName(type: string): string {
  return (DEFAULT_NAMES as Record<string, string>)[type] ?? type;
}

/**
 * Resolve the caller's tenant, set fail-closed by the admin router middleware.
 * Every admin print-template route MUST reject when this is absent so one
 * college can never read or overwrite another college's templates. The runtime
 * DB role bypasses RLS, so this explicit scope is the PRIMARY isolation guard.
 */
function reqTenantId(req: Request): string | null {
  return req.adminTenantId ?? (req as { adminUser?: { tenantId?: string } }).adminUser?.tenantId ?? null;
}

function defaultRow(type: string) {
  return {
    id: null, type, name: defaultName(type), content: "",
    pageSize: "A4", orientation: "portrait",
    marginTop: 20, marginRight: 15, marginBottom: 20, marginLeft: 15,
    bgImageUrl: null, isCustom: false, category: "builtin",
    purpose: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Computes the purpose to DISPLAY for a template type, given the raw stored
 * purpose of every type/row in this tenant (`storedPurposeMap`, keyed by type,
 * value = the persisted `purpose` column or null).
 *
 * A row's own explicit non-null purpose always wins. Otherwise, if this is a
 * built-in type with a code-mapped default purpose (DEFAULT_PURPOSE_BY_TYPE),
 * that default is shown UNLESS some other type currently explicitly holds it
 * — in which case this type shows no purpose. This lets a built-in's implicit
 * default purpose move to whatever template purpose was explicitly reassigned
 * to, without needing to write a placeholder row for the type it left behind.
 */
function computeDisplayPurpose(type: string, storedPurposeMap: Record<string, string | null>): string | null {
  const stored = storedPurposeMap[type] ?? null;
  if (stored) return stored;
  const def = (DEFAULT_PURPOSE_BY_TYPE as Record<string, string | undefined>)[type];
  if (!def) return null;
  const takenByOther = Object.entries(storedPurposeMap).some(([t, p]) => t !== type && p === def);
  return takenByOther ? null : def;
}

/** A type is writable if it is a built-in doc type or an existing custom row for this tenant. */
async function isAllowedType(type: string, tenantId: string): Promise<boolean> {
  if (VALID_SET.has(type)) return true;
  const [row] = await db.select().from(printTemplatesTable)
    .where(and(eq(printTemplatesTable.type, type), eq(printTemplatesTable.tenantId, tenantId)));
  return !!row?.isCustom;
}

function slugify(s: string): string {
  return (
    s.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "template"
  );
}

/** Produce a slug that does not collide with built-in types or existing rows in this tenant. */
async function uniqueType(base: string, tenantId: string): Promise<string> {
  const rows = await db.select({ type: printTemplatesTable.type }).from(printTemplatesTable)
    .where(eq(printTemplatesTable.tenantId, tenantId));
  const taken = new Set<string>([...VALID_TYPES, ...rows.map(r => r.type)]);
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/**
 * Transfer a purpose to a new template type within a college, clearing it from
 * any previous holder in the SAME college. Scoped by tenantId so assigning a
 * purpose in one college never touches another's templates.
 *
 * Built-in types that default to this purpose (via DEFAULT_PURPOSE_BY_TYPE) but
 * have never had a row persisted are also "materialized" with purpose: null,
 * so their implicit default fallback (see defaultRow) stops claiming the
 * purpose once it has been explicitly moved elsewhere.
 */
async function transferPurpose(purpose: string, toType: string, tenantId: string): Promise<void> {
  // Clear from previous holder in this tenant (excluding the target type itself).
  // Built-in types whose implicit default (DEFAULT_PURPOSE_BY_TYPE) matches this
  // purpose don't need a row written here — computeDisplayPurpose() already stops
  // showing their default once another type explicitly holds the same purpose.
  await db
    .update(printTemplatesTable)
    .set({ purpose: null, updatedAt: new Date() })
    .where(and(
      eq(printTemplatesTable.tenantId, tenantId),
      eq(printTemplatesTable.purpose, purpose),
      ne(printTemplatesTable.type, toType),
    ));
}

// ── Public: active template by purpose (used by candidate portal) ─────────────
// Resolves the requesting college via the shared public tenant middleware and
// filters by BOTH purpose and college. Returns "none" (never another college's
// row) when the college cannot be resolved.
router.get("/print-templates/active-by-purpose/:purpose", publicTenant, async (req: Request, res: Response) => {
  const purpose = String(req.params.purpose);
  if (!VALID_PURPOSES.has(purpose)) return res.status(400).json({ error: "Invalid purpose" });
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(404).json({ error: "No template assigned to this purpose" });
  try {
    const [row] = await db
      .select()
      .from(printTemplatesTable)
      .where(and(
        eq(printTemplatesTable.tenantId, tenantId),
        eq(printTemplatesTable.purpose, purpose),
      ))
      .limit(1);
    if (!row) return res.status(404).json({ error: "No template assigned to this purpose" });
    return res.json(row);
  } catch (err) {
    console.error("active-by-purpose error:", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// ── GET /api/admin/print-templates ───────────────────────────────────────────
router.get("/admin/print-templates", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = reqTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Tenant could not be resolved" });
  try {
    const rows = await db.select().from(printTemplatesTable)
      .where(eq(printTemplatesTable.tenantId, tenantId));
    const map  = Object.fromEntries(rows.map(r => [r.type, r]));
    const storedPurposeMap: Record<string, string | null> = {};
    for (const t of VALID_TYPES) storedPurposeMap[t] = map[t]?.purpose ?? null;
    for (const r of rows) if (!(r.type in storedPurposeMap)) storedPurposeMap[r.type] = r.purpose ?? null;

    const builtin = VALID_TYPES.map(t => ({
      ...(map[t] ?? defaultRow(t)),
      purpose: computeDisplayPurpose(t, storedPurposeMap),
    }));
    const custom = rows
      .filter(r => r.isCustom)
      .map(r => ({ ...r, purpose: computeDisplayPurpose(r.type, storedPurposeMap) }));
    return res.json([...builtin, ...custom]);
  } catch (err) {
    console.error("print-templates list error:", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/admin/print-templates ──────────────────────────────────────────
router.post("/admin/print-templates", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = reqTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Tenant could not be resolved" });
  const { name, category, purpose: rawPurpose } = req.body as { name?: string; category?: string; purpose?: string };
  const cleanName = String(name ?? "").trim();
  if (!cleanName) return res.status(400).json({ error: "Name is required" });
  const cat =
    category === "employee"  ? "employee"  :
    category === "applicant" ? "applicant" :
    category === "student"   ? "student"   : null;
  if (!cat) return res.status(400).json({ error: "Category must be 'student', 'employee', or 'applicant'" });
  const purposeVal = rawPurpose && VALID_PURPOSES.has(rawPurpose) ? rawPurpose : null;
  try {
    const type = await uniqueType(slugify(cleanName), tenantId);
    if (purposeVal) await transferPurpose(purposeVal, type, tenantId);
    const [row] = await db.insert(printTemplatesTable).values({
      tenantId, type, name: cleanName, content: "",
      isCustom: true, category: cat,
      purpose: purposeVal,
      updatedAt: new Date(),
    }).returning();
    return res.status(201).json(row);
  } catch (err) {
    console.error("print-templates create error:", err);
    return res.status(500).json({ error: "Failed to create" });
  }
});

// ── GET /api/admin/print-templates/:type ─────────────────────────────────────
router.get("/admin/print-templates/:type", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = reqTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Tenant could not be resolved" });
  const type = String(req.params.type);
  if (!(await isAllowedType(type, tenantId))) return res.status(400).json({ error: "Invalid type" });
  try {
    const rows = await db.select().from(printTemplatesTable)
      .where(eq(printTemplatesTable.tenantId, tenantId));
    const row = rows.find(r => r.type === type);
    const storedPurposeMap: Record<string, string | null> = {};
    for (const t of VALID_TYPES) storedPurposeMap[t] = null;
    for (const r of rows) storedPurposeMap[r.type] = r.purpose ?? null;
    return res.json({
      ...(row ?? defaultRow(type)),
      purpose: computeDisplayPurpose(type, storedPurposeMap),
    });
  } catch (err) {
    console.error("print-templates get error:", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// ── PUT /api/admin/print-templates/:type ─────────────────────────────────────
router.put("/admin/print-templates/:type", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = reqTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Tenant could not be resolved" });
  const type = String(req.params.type);
  if (!(await isAllowedType(type, tenantId))) return res.status(400).json({ error: "Invalid type" });
  const { name, content, pageSize, orientation, marginTop, marginRight, marginBottom, marginLeft, purpose: rawPurpose } =
    req.body as Record<string, string | number | null | undefined>;
  const purposeVal = rawPurpose && typeof rawPurpose === "string" && VALID_PURPOSES.has(rawPurpose)
    ? rawPurpose
    : rawPurpose === null || rawPurpose === ""
      ? null
      : undefined; // undefined = don't touch purpose
  try {
    // Transfer purpose if being set (scoped to this tenant)
    if (purposeVal !== undefined && purposeVal !== null) {
      await transferPurpose(purposeVal, type, tenantId);
    }
    const insertPayload: typeof printTemplatesTable.$inferInsert = {
      tenantId,
      type,
      name: String(name ?? defaultName(type)),
      content: String(content ?? ""),
      pageSize: String(pageSize ?? "A4"),
      orientation: String(orientation ?? "portrait"),
      marginTop: Number(marginTop ?? 20),
      marginRight: Number(marginRight ?? 15),
      marginBottom: Number(marginBottom ?? 20),
      marginLeft: Number(marginLeft ?? 15),
      updatedAt: new Date(),
    };
    if (purposeVal !== undefined) {
      insertPayload.purpose = purposeVal;
    }
    const { type: _type, tenantId: _tid, ...updateSet } = insertPayload;
    void _type; void _tid;
    const [row] = await db.insert(printTemplatesTable)
      .values(insertPayload)
      .onConflictDoUpdate({
        target: [printTemplatesTable.tenantId, printTemplatesTable.type],
        set: updateSet,
      })
      .returning();
    return res.json(row);
  } catch (err) {
    console.error("print-templates put error:", err);
    return res.status(500).json({ error: "Failed to save" });
  }
});

// ── PATCH /api/admin/print-templates/:type ───────────────────────────────────
// Renames/re-tags either a custom template (existing row required) or a
// built-in template (row created on first edit, since built-ins otherwise
// have no DB row until customized). Never touches `type`/content — only
// display name and purpose assignment.
router.patch("/admin/print-templates/:type", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = reqTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Tenant could not be resolved" });
  const type = String(req.params.type);
  const isBuiltin = VALID_SET.has(type);
  try {
    const [existing] = await db.select().from(printTemplatesTable)
      .where(and(eq(printTemplatesTable.type, type), eq(printTemplatesTable.tenantId, tenantId)));
    if (!isBuiltin && !existing?.isCustom) return res.status(404).json({ error: "Custom template not found" });

    const { name: rawName, purpose: rawPurpose } = req.body as { name?: string; purpose?: string | null };

    let cleanName: string | undefined;
    if (rawName !== undefined) {
      cleanName = String(rawName).trim();
      if (!cleanName) return res.status(400).json({ error: "Name cannot be empty" });
    }

    let purposeVal: string | null | undefined;
    if (rawPurpose !== undefined) {
      purposeVal = rawPurpose && VALID_PURPOSES.has(rawPurpose) ? rawPurpose : null;
      if (purposeVal) await transferPurpose(purposeVal, type, tenantId);
    }

    if (existing) {
      const updateSet: Record<string, unknown> = { updatedAt: new Date() };
      if (cleanName !== undefined) updateSet.name = cleanName;
      if (purposeVal !== undefined) updateSet.purpose = purposeVal;
      const [row] = await db
        .update(printTemplatesTable)
        .set(updateSet)
        .where(and(eq(printTemplatesTable.type, type), eq(printTemplatesTable.tenantId, tenantId)))
        .returning();
      return res.json(row);
    }

    // Built-in type with no row yet — create one, keeping default content/layout.
    const [row] = await db.insert(printTemplatesTable).values({
      tenantId,
      type,
      name: cleanName ?? defaultName(type),
      content: "",
      pageSize: "A4",
      orientation: "portrait",
      marginTop: 20,
      marginRight: 15,
      marginBottom: 20,
      marginLeft: 15,
      isCustom: false,
      category: "builtin",
      purpose: purposeVal ?? null,
      updatedAt: new Date(),
    }).returning();
    return res.json(row);
  } catch (err) {
    console.error("print-templates patch error:", err);
    return res.status(500).json({ error: "Failed to update" });
  }
});

// ── DELETE /api/admin/print-templates/:type ──────────────────────────────────
router.delete("/admin/print-templates/:type", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = reqTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Tenant could not be resolved" });
  const type = String(req.params.type);
  if (VALID_SET.has(type)) return res.status(400).json({ error: "Built-in templates cannot be deleted" });
  try {
    const [row] = await db.select().from(printTemplatesTable)
      .where(and(eq(printTemplatesTable.type, type), eq(printTemplatesTable.tenantId, tenantId)));
    if (!row || !row.isCustom) return res.status(404).json({ error: "Custom template not found" });
    await db.delete(printTemplatesTable)
      .where(and(eq(printTemplatesTable.type, type), eq(printTemplatesTable.tenantId, tenantId)));
    return res.json({ ok: true });
  } catch (err) {
    console.error("print-templates delete error:", err);
    return res.status(500).json({ error: "Failed to delete" });
  }
});

// ── POST /api/admin/print-templates/:type/bg ─────────────────────────────────
router.post("/admin/print-templates/:type/bg", requireAdmin, expressJson({ limit: "10mb" }), async (req: Request, res: Response) => {
  const tenantId = reqTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Tenant could not be resolved" });
  const type = String(req.params.type);
  if (!(await isAllowedType(type, tenantId))) return res.status(400).json({ error: "Invalid type" });
  const { dataUrl } = req.body as { dataUrl: string };
  if (!dataUrl) return res.status(400).json({ error: "dataUrl required" });
  try {
    const raw     = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const sharp   = (await import("sharp")).default;
    const webpBuf = await sharp(Buffer.from(raw, "base64")).webp({ quality: 85 }).toBuffer();

    const resolvedUrl = await putObject(`templates/${tenantId}/${type}/bg.webp`, webpBuf, "image/webp");

    await db.insert(printTemplatesTable)
      .values({ tenantId, type, name: defaultName(type), content: "", bgImageUrl: resolvedUrl, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [printTemplatesTable.tenantId, printTemplatesTable.type],
        set: { bgImageUrl: resolvedUrl, updatedAt: new Date() },
      });
    return res.json({ url: resolvedUrl });
  } catch (err) {
    console.error("print-templates bg upload error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
});

// ── GET /api/admin/print-templates/:type/layout ──────────────────────────────
router.get("/admin/print-templates/:type/layout", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = reqTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Tenant could not be resolved" });
  const type = String(req.params.type);
  if (!(await isAllowedType(type, tenantId))) return res.status(400).json({ error: "Invalid type" });
  try {
    const [row] = await db.select().from(printTemplatesTable)
      .where(and(eq(printTemplatesTable.type, type), eq(printTemplatesTable.tenantId, tenantId)));
    const src = row ?? defaultRow(type);
    return res.json({
      type:         src.type,
      pageSize:     src.pageSize,
      orientation:  src.orientation,
      marginTop:    src.marginTop,
      marginRight:  src.marginRight,
      marginBottom: src.marginBottom,
      marginLeft:   src.marginLeft,
    });
  } catch (err) {
    console.error("print-templates layout get error:", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// ── PATCH /api/admin/print-templates/:type/layout ────────────────────────────
router.patch("/admin/print-templates/:type/layout", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = reqTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Tenant could not be resolved" });
  const type = String(req.params.type);
  if (!(await isAllowedType(type, tenantId))) return res.status(400).json({ error: "Invalid type" });
  const { pageSize, orientation, marginTop, marginRight, marginBottom, marginLeft } =
    req.body as Record<string, string | number>;
  try {
    const layoutSet = {
      pageSize:     String(pageSize     ?? "A4"),
      orientation:  String(orientation  ?? "portrait"),
      marginTop:    Number(marginTop    ?? 20),
      marginRight:  Number(marginRight  ?? 15),
      marginBottom: Number(marginBottom ?? 20),
      marginLeft:   Number(marginLeft   ?? 15),
      updatedAt:    new Date(),
    };
    const [row] = await db.insert(printTemplatesTable)
      .values({ tenantId, type, name: defaultName(type), content: "", ...layoutSet })
      .onConflictDoUpdate({
        target: [printTemplatesTable.tenantId, printTemplatesTable.type],
        set: layoutSet,
      })
      .returning();
    return res.json(row);
  } catch (err) {
    console.error("print-templates layout patch error:", err);
    return res.status(500).json({ error: "Failed to save layout" });
  }
});

// ── DELETE /api/admin/print-templates/:type/bg ───────────────────────────────
router.delete("/admin/print-templates/:type/bg", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = reqTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Tenant could not be resolved" });
  const type = String(req.params.type);
  if (!(await isAllowedType(type, tenantId))) return res.status(400).json({ error: "Invalid type" });
  try {
    await deleteObject(`templates/${tenantId}/${type}/bg.webp`);
    await db.update(printTemplatesTable)
      .set({ bgImageUrl: null, updatedAt: new Date() })
      .where(and(eq(printTemplatesTable.type, type), eq(printTemplatesTable.tenantId, tenantId)));
    return res.json({ ok: true });
  } catch (err) {
    console.error("print-templates bg delete error:", err);
    return res.status(500).json({ error: "Failed" });
  }
});

export default router;
