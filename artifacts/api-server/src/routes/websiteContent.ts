import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  siteAnnouncementsTable, siteEventsTable, siteGalleryTable,
  siteHeroHeadersTable,
  siteDownloadsTable, siteFacultyTable, siteFeeStructureTable,
  sitePageBlocksTable, siteSettingsTable,
  siteTestimonialsTable, siteFeaturesTable, siteFacilitiesTable,
  siteQuickLinksTable, siteMenuItemsTable, siteResultsTable, siteAlumniTable, tenantsTable,
  mediaLibraryTable, siteContactSubmissionsTable,
} from "@workspace/db";
import { eq, asc, desc, and, inArray, type SQL } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { putObject } from "../lib/storage";
import { publicTenant, getAdminTenantId, clearTenantCache } from "../lib/tenant";
import { isRateLimited } from "../lib/rate-limit";
import { issueContactChallenge, verifyContactChallenge } from "../lib/contact-challenge";
import { normalizeMenuLocation } from "../lib/menu-location";

const router: IRouter = Router();

// Visual themes that may be applied to a tenant's public website.
const KNOWN_THEMES = ["ccm", "gccm", "pakmil"] as const;
type KnownTheme = (typeof KNOWN_THEMES)[number];

// ─── Tiny per-tenant TTL cache for the branding-critical public reads ─────────
// On a cold home-page load the website fetches settings + page-blocks first, and
// under load these were resolving in several seconds on the external Neon DB —
// long enough to trip the website's boot gate and flash CCM's fallback branding.
// A short per-tenant cache keeps repeat public reads off the DB. It is invalidated
// immediately on the matching admin write, so edits still appear promptly; the
// TTL only bounds staleness across server instances/restarts.
const PUBLIC_READ_TTL_MS = 30_000;
const publicReadCache = new Map<string, { value: unknown; expires: number }>();

function publicCacheGet(key: string): unknown | undefined {
  const e = publicReadCache.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expires) {
    publicReadCache.delete(key);
    return undefined;
  }
  return e.value;
}
function publicCacheSet(key: string, value: unknown): void {
  publicReadCache.set(key, { value, expires: Date.now() + PUBLIC_READ_TTL_MS });
}
function publicCacheInvalidate(prefix: string): void {
  for (const k of publicReadCache.keys()) {
    if (k.startsWith(prefix)) publicReadCache.delete(k);
  }
}

function pickFields(obj: any, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (obj && typeof obj === "object") {
    for (const k of keys) if (k in obj) out[k] = obj[k];
  }
  return out;
}

type OrderMode = "sortCreated" | "sort";

type ResourceConfig = {
  /** URL segment, e.g. "announcements". */
  path: string;
  /** Drizzle table. */
  table: any;
  /** Human label used in error messages (singular). */
  label: string;
  /** Whitelisted writable fields (tenant_id/id/timestamps are never client-set). */
  fields: readonly string[];
  /** Fields that must be truthy on create. */
  required: readonly string[];
  /** Validation message when a required field is missing. */
  requiredMsg: string;
  publicOrder: OrderMode;
  adminOrder: OrderMode;
  /** Optional extra public filter (e.g. page-blocks ?page=). */
  publicFilter?: (req: Request, table: any) => SQL | undefined;
  /**
   * When true, public list responses are served from the short per-tenant TTL
   * cache and invalidated on every admin write. Enable only for branding-critical,
   * read-heavy resources (page-blocks) where cold-load latency caused the flash.
   */
  cachePublic?: boolean;
};

function orderBy(table: any, mode: OrderMode) {
  return mode === "sortCreated"
    ? [asc(table.sortOrder), desc(table.createdAt)]
    : [asc(table.sortOrder)];
}

/** Build a tenant-scoped where clause for a single row by id. */
function rowWhere(table: any, id: string, tenantId: string): SQL {
  return and(eq(table.id, id), eq(table.tenantId, tenantId)) as SQL;
}

/**
 * Resolve the admin's tenant, failing closed with a 400 if it cannot be
 * determined. Returns null after responding so callers can `if (!t) return;`.
 * This prevents any tenant-scoped admin query from running unscoped.
 */
async function resolveAdminTenant(req: Request, res: Response): Promise<string | null> {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) { res.status(400).json({ error: "Tenant could not be resolved" }); return null; }
  return tenantId;
}

/**
 * Registers the standard 8-endpoint CRUD surface for a website content resource,
 * with tenant scoping applied uniformly:
 *   - public reads are filtered to the resolved tenant + isPublished
 *   - admin reads/writes are scoped to the admin's tenant (and cannot cross it)
 *   - creates stamp the tenant_id server-side
 *
 * Route registration order matters: /reorder is registered before /:id so the
 * literal "reorder" is never captured as an :id param.
 */
function registerResource(cfg: ResourceConfig): void {
  const { path, table, label, fields, required, requiredMsg } = cfg;

  // Drop this resource's cached public reads for a tenant after any write, so an
  // admin edit is reflected immediately rather than after the TTL.
  const invalidatePublic = (tenantId: string) => {
    if (cfg.cachePublic) publicCacheInvalidate(`${tenantId}|${path}|`);
  };

  // ── PUBLIC list ──────────────────────────────────────────────────────────
  router.get(`/website/${path}`, publicTenant, async (req: Request, res: Response) => {
    try {
      // Fail closed: never return content unscoped by tenant.
      if (!req.tenantId) return res.json([]);
      // The query (e.g. page-blocks ?page=) is part of the cache identity.
      const cacheKey = cfg.cachePublic
        ? `${req.tenantId}|${path}|${JSON.stringify(req.query)}`
        : "";
      if (cfg.cachePublic) {
        const hit = publicCacheGet(cacheKey);
        if (hit !== undefined) return res.json(hit);
      }
      const conds: SQL[] = [eq(table.isPublished, true), eq(table.tenantId, req.tenantId)];
      const extra = cfg.publicFilter?.(req, table);
      if (extra) conds.push(extra);
      const rows = await db.select().from(table)
        .where(and(...conds))
        .orderBy(...orderBy(table, cfg.publicOrder));
      if (cfg.cachePublic) publicCacheSet(cacheKey, rows);
      return res.json(rows);
    } catch { return res.status(500).json({ error: `Failed to fetch ${label}` }); }
  });

  // ── ADMIN list ───────────────────────────────────────────────────────────
  router.get(`/admin/website/${path}`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
      const rows = await db.select().from(table)
        .where(tenantId ? eq(table.tenantId, tenantId) : undefined)
        .orderBy(...orderBy(table, cfg.adminOrder));
      return res.json(rows);
    } catch { return res.status(500).json({ error: `Failed to fetch ${label}` }); }
  });

  // ── ADMIN reorder (before :id) ───────────────────────────────────────────
  router.patch(`/admin/website/${path}/reorder`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
      const { order } = req.body as { order: string[] };
      if (!Array.isArray(order)) return res.status(400).json({ error: "order must be an array" });
      await Promise.all(order.map((id, idx) =>
        db.update(table).set({ sortOrder: idx, updatedAt: new Date() }).where(rowWhere(table, id, tenantId))
      ));
      invalidatePublic(tenantId);
      return res.json({ ok: true });
    } catch { return res.status(500).json({ error: `Failed to reorder ${label}` }); }
  });

  // ── ADMIN get by id ──────────────────────────────────────────────────────
  router.get(`/admin/website/${path}/:id`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
      const [row] = await db.select().from(table).where(rowWhere(table, req.params.id as string, tenantId));
      if (!row) return res.status(404).json({ error: "Not found" });
      return res.json(row);
    } catch { return res.status(500).json({ error: `Failed to fetch ${label}` }); }
  });

  // ── ADMIN create ─────────────────────────────────────────────────────────
  router.post(`/admin/website/${path}`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
      const body = pickFields(req.body, fields);
      for (const r of required) if (!body[r]) return res.status(400).json({ error: requiredMsg });
      const rows = await db.insert(table as any).values({ ...body, tenantId } as any).returning() as any[];
      invalidatePublic(tenantId);
      return res.status(201).json(rows[0]);
    } catch { return res.status(500).json({ error: `Failed to create ${label}` }); }
  });

  // ── ADMIN publish toggle ─────────────────────────────────────────────────
  router.patch(`/admin/website/${path}/:id/publish`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
      const where = rowWhere(table, req.params.id as string, tenantId);
      const [cur] = await db.select().from(table).where(where);
      if (!cur) return res.status(404).json({ error: "Not found" });
      const [row] = await db.update(table)
        .set({ isPublished: !cur.isPublished, updatedAt: new Date() })
        .where(where).returning();
      invalidatePublic(tenantId);
      return res.json(row);
    } catch { return res.status(500).json({ error: "Failed to toggle publish" }); }
  });

  // ── ADMIN update ─────────────────────────────────────────────────────────
  router.patch(`/admin/website/${path}/:id`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
      const body = pickFields(req.body, fields);
      const [row] = await db.update(table)
        .set({ ...body, updatedAt: new Date() } as any)
        .where(rowWhere(table, req.params.id as string, tenantId)).returning();
      if (!row) return res.status(404).json({ error: "Not found" });
      invalidatePublic(tenantId);
      return res.json(row);
    } catch { return res.status(500).json({ error: `Failed to update ${label}` }); }
  });

  // ── ADMIN delete ─────────────────────────────────────────────────────────
  router.delete(`/admin/website/${path}/:id`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
      await db.delete(table).where(rowWhere(table, req.params.id as string, tenantId));
      invalidatePublic(tenantId);
      return res.json({ ok: true });
    } catch { return res.status(500).json({ error: `Failed to delete ${label}` }); }
  });
}

// ── Resource registrations ─────────────────────────────────────────────────────

registerResource({
  path: "announcements", table: siteAnnouncementsTable, label: "announcement",
  fields: ["title", "body", "imageUrl", "category", "isPublished", "publishedAt", "sortOrder"],
  required: ["title"], requiredMsg: "title required",
  publicOrder: "sortCreated", adminOrder: "sortCreated",
});

registerResource({
  path: "events", table: siteEventsTable, label: "event",
  fields: ["title", "description", "date", "category", "imageUrl", "imageAlt", "isPublished", "sortOrder"],
  required: ["title"], requiredMsg: "title required",
  publicOrder: "sortCreated", adminOrder: "sortCreated",
});

registerResource({
  path: "gallery", table: siteGalleryTable, label: "gallery item",
  fields: ["title", "category", "imageUrl", "imageAlt", "author", "isPublished", "sortOrder"],
  required: ["title", "imageUrl"], requiredMsg: "title and imageUrl required",
  publicOrder: "sortCreated", adminOrder: "sortCreated",
});

registerResource({
  path: "hero-headers", table: siteHeroHeadersTable, label: "hero header",
  fields: ["title", "subtitle", "imageUrl", "buttonLabel", "buttonLink", "isPublished", "sortOrder"],
  required: ["title", "imageUrl"], requiredMsg: "title and imageUrl required",
  publicOrder: "sort", adminOrder: "sort",
});

registerResource({
  path: "downloads", table: siteDownloadsTable, label: "download",
  fields: ["title", "subtitle", "description", "imageUrl", "fileUrl", "fileName", "category", "isPublished", "sortOrder"],
  required: ["title"], requiredMsg: "title required",
  publicOrder: "sortCreated", adminOrder: "sortCreated",
});

registerResource({
  path: "faculty", table: siteFacultyTable, label: "faculty member",
  fields: ["name", "department", "subject", "designation", "photoUrl", "isPublished", "sortOrder"],
  required: ["name"], requiredMsg: "name required",
  publicOrder: "sortCreated", adminOrder: "sortCreated",
});

registerResource({
  path: "fee-structure", table: siteFeeStructureTable, label: "fee item",
  fields: ["className", "feeType", "amount", "currency", "notes", "isPublished", "sortOrder"],
  required: ["className", "feeType"], requiredMsg: "className and feeType required",
  publicOrder: "sortCreated", adminOrder: "sortCreated",
});

registerResource({
  path: "page-blocks", table: sitePageBlocksTable, label: "page block",
  fields: ["page", "blockKey", "blockType", "content", "isPublished", "sortOrder"],
  required: ["page", "blockKey"], requiredMsg: "page and blockKey required",
  publicOrder: "sort", adminOrder: "sortCreated",
  // page-blocks carry the branding-critical hero copy; cache them to keep the
  // cold-load read off the DB and prevent the boot-gate-trip flash.
  cachePublic: true,
  publicFilter: (req, table) => {
    const page = req.query.page as string | undefined;
    return page ? eq(table.page, page) : undefined;
  },
});

registerResource({
  path: "testimonials", table: siteTestimonialsTable, label: "testimonial",
  fields: ["name", "role", "quote", "photoUrl", "isPublished", "sortOrder"],
  required: ["name", "quote"], requiredMsg: "name and quote required",
  publicOrder: "sort", adminOrder: "sort",
});

registerResource({
  path: "features", table: siteFeaturesTable, label: "feature",
  fields: ["iconName", "title", "description", "isPublished", "sortOrder"],
  required: ["title"], requiredMsg: "title required",
  publicOrder: "sort", adminOrder: "sort",
});

registerResource({
  path: "facilities", table: siteFacilitiesTable, label: "facility",
  fields: ["iconName", "title", "description", "imageUrl", "isPublished", "sortOrder"],
  required: ["title"], requiredMsg: "title required",
  publicOrder: "sort", adminOrder: "sort",
});

registerResource({
  path: "quick-links", table: siteQuickLinksTable, label: "quick link",
  fields: ["iconName", "title", "description", "cta", "href", "isExternal", "isPublished", "sortOrder"],
  required: ["title"], requiredMsg: "title required",
  publicOrder: "sort", adminOrder: "sort",
});

registerResource({
  path: "menu", table: siteMenuItemsTable, label: "menu item",
  fields: ["parentId", "location", "label", "linkType", "target", "openInNewTab", "isCta", "isPublished", "sortOrder"],
  required: ["label"], requiredMsg: "label required",
  publicOrder: "sort", adminOrder: "sort",
  // Public reads scope to a single location (?location=header|footer). The
  // Navbar requests "header" and the Footer requests "footer". When no
  // location is given we default to "header" so legacy navbar fetches never
  // pick up footer rows (and vice versa).
  publicFilter: (req, table) =>
    eq(table.location, normalizeMenuLocation(req.query.location as string | undefined)),
});

registerResource({
  path: "results", table: siteResultsTable, label: "result",
  fields: ["examName", "className", "academicYear", "resultDate", "downloadUrl", "notes", "isPublished", "sortOrder"],
  required: ["className"], requiredMsg: "className required",
  publicOrder: "sort", adminOrder: "sort",
});

registerResource({
  path: "alumni", table: siteAlumniTable, label: "alumnus",
  fields: ["name", "batch", "category", "role", "organization", "location", "quote", "story", "achievements", "badge", "photoUrl", "featured", "isPublished", "sortOrder"],
  required: ["name"], requiredMsg: "name is required",
  publicOrder: "sort", adminOrder: "sort",
});

// ─── FILE UPLOAD ──────────────────────────────────────────────────────────────
// Accepts: { fileData: base64string, fileName: string, mimeType: string }
// Returns: { url: string }

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"]);
const ALLOWED_DOC_TYPES   = new Set(["application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;  // 5 MB
const MAX_DOC_BYTES   = 20 * 1024 * 1024; // 20 MB

router.post("/admin/website/upload", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { fileData, fileName, mimeType } = req.body as { fileData?: string; fileName?: string; mimeType?: string };
    if (!fileData || !fileName || !mimeType) {
      return res.status(400).json({ error: "fileData, fileName, and mimeType are required" });
    }

    const isImage = ALLOWED_IMAGE_TYPES.has(mimeType);
    const isDoc   = ALLOWED_DOC_TYPES.has(mimeType);
    if (!isImage && !isDoc) {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    const buf = Buffer.from(fileData, "base64");
    const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
    if (buf.length > maxBytes) {
      return res.status(400).json({ error: `File too large (max ${maxBytes / 1024 / 1024} MB)` });
    }

    const safeBase = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const folder = isImage ? "website/images" : "website/files";
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeBase}`;
    const url = await putObject(key, buf, mimeType);

    // Register image uploads into the tenant's media library so they can be
    // reused later from the picker. Scoped by tenant so this never widens
    // cross-tenant exposure. Documents are not added (the library is image-only).
    if (isImage) {
      const tenantId = await getAdminTenantId(req);
      if (tenantId) {
        await db.insert(mediaLibraryTable).values({
          tenantId,
          filename:     key.split("/").pop() ?? safeBase,
          originalName: fileName,
          mimeType,
          sizeBytes:    buf.length,
          url,
        }).catch(() => { /* best-effort: never fail the upload over library bookkeeping */ });
      }
    }

    return res.json({ url });
  } catch {
    return res.status(500).json({ error: "Upload failed" });
  }
});

// ─── SITE SETTINGS (per-tenant) ───────────────────────────────────────────────

// Public: returns the resolved tenant's settings as a { key: value } map.
// site_theme falls back to the tenant's siteTheme column when not set explicitly.
router.get("/website/settings", publicTenant, async (req: Request, res: Response) => {
  try {
    // Settings is the first, branding-critical read on a cold load — cache it
    // per tenant so repeat loads skip the DB. Invalidated on PUT settings below.
    const cacheKey = req.tenantId ? `${req.tenantId}|settings` : "";
    if (req.tenantId) {
      const hit = publicCacheGet(cacheKey);
      if (hit !== undefined) return res.json(hit);
    }
    const rows = req.tenantId
      ? await db.select().from(siteSettingsTable)
          .where(eq(siteSettingsTable.tenantId, req.tenantId))
          .orderBy(asc(siteSettingsTable.sortOrder))
      : [];
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    if (!map["site_theme"] && req.tenant?.siteTheme) map["site_theme"] = req.tenant.siteTheme;
    if (req.tenantId) publicCacheSet(cacheKey, map);
    return res.json(map);
  } catch { return res.status(500).json({ error: "Failed to fetch settings" }); }
});

// Admin: returns full row metadata for the settings editor (tenant-scoped).
// site_theme is not a settings row — it lives on tenants.site_theme — so we
// surface it as a synthetic row so the editor's theme picker loads the saved value.
router.get("/admin/website/settings", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
    const rows = await db.select().from(siteSettingsTable)
      .where(tenantId ? eq(siteSettingsTable.tenantId, tenantId) : undefined)
      .orderBy(asc(siteSettingsTable.category), asc(siteSettingsTable.sortOrder));
    const [tenant] = await db.select({ siteTheme: tenantsTable.siteTheme })
      .from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
    const themeRow = {
      key: "site_theme",
      value: tenant?.siteTheme ?? "ccm",
      label: "Website Theme",
      category: "theme",
      inputType: "text",
      sortOrder: 0,
    };
    return res.json([themeRow, ...rows]);
  } catch { return res.status(500).json({ error: "Failed to fetch settings" }); }
});

// Admin: bulk upsert settings for the current tenant  { updates: { key, value }[] }
router.put("/admin/website/settings", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
    const { updates } = req.body as { updates?: { key: string; value: string }[] };
    if (!Array.isArray(updates)) return res.status(400).json({ error: "updates must be an array" });
    // site_theme lives on tenants.site_theme (not a settings row): persist it on
    // the resolved tenant instead of upserting it as an editable setting.
    const themeUpdate = updates.find(({ key }) => key === "site_theme");
    if (themeUpdate) {
      const theme = KNOWN_THEMES.includes(themeUpdate.value as KnownTheme) ? themeUpdate.value : "ccm";
      await db.update(tenantsTable)
        .set({ siteTheme: theme, updatedAt: new Date() })
        .where(eq(tenantsTable.id, tenantId));
      // The public tenant list is cached; invalidate so the new theme is served.
      clearTenantCache();
    }
    const editable = updates.filter(({ key }) => key !== "site_theme");
    await Promise.all(editable.map(({ key, value }) =>
      db.insert(siteSettingsTable)
        .values({ tenantId, key, value })
        .onConflictDoUpdate({
          target: [siteSettingsTable.tenantId, siteSettingsTable.key],
          set: { value, updatedAt: new Date() },
        })
    ));
    // Drop the cached public settings map so the edit (incl. theme) is served now.
    publicCacheInvalidate(`${tenantId}|settings`);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Failed to update settings" }); }
});

// ── Public: active tenant slugs ──────────────────────────────────────────────
// Used by the gateway on startup (and every 5 min) to discover which path
// prefixes correspond to known tenants, without hardcoding them in config.
router.get("/tenants/slugs", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({ slug: tenantsTable.slug })
      .from(tenantsTable)
      .where(eq(tenantsTable.isActive, true));
    return res.json({ slugs: rows.map((r) => r.slug) });
  } catch { return res.status(500).json({ error: "Failed to fetch tenant slugs" }); }
});

// ── Public: tenant locale settings (currency, date format, timezone) ──────────
// No auth required — both admin and public site read this to format values.
router.get("/tenants/locale", publicTenant, async (req: Request, res: Response) => {
  const defaults = { currency: "PKR", dateFormat: "DD/MM/YYYY", timezone: "Asia/Karachi" };
  try {
    if (!req.tenantId) return res.json(defaults);
    const rows = await db
      .select({ key: siteSettingsTable.key, value: siteSettingsTable.value })
      .from(siteSettingsTable)
      .where(and(
        eq(siteSettingsTable.tenantId, req.tenantId),
        inArray(siteSettingsTable.key, ["locale_currency", "locale_date_format", "locale_timezone"]),
      ));
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return res.json({
      currency:   map["locale_currency"]    ?? defaults.currency,
      dateFormat: map["locale_date_format"] ?? defaults.dateFormat,
      timezone:   map["locale_timezone"]    ?? defaults.timezone,
    });
  } catch { return res.status(500).json({ error: "Failed to fetch locale" }); }
});

// ── Public: active tenant domain → slug map ───────────────────────────────────
// Used by the gateway to resolve custom domains (Host header) to tenant slugs.
// Only tenants with a non-null domain are included.
router.get("/tenants/domains", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({ slug: tenantsTable.slug, domain: tenantsTable.domain })
      .from(tenantsTable)
      .where(eq(tenantsTable.isActive, true));
    const domains: Record<string, string> = {};
    for (const r of rows) {
      if (r.domain) domains[r.domain.toLowerCase()] = r.slug;
    }
    return res.json({ domains });
  } catch { return res.status(500).json({ error: "Failed to fetch tenant domains" }); }
});

// ─── GALLERY CATEGORIES ───────────────────────────────────────────────────────

const DEFAULT_GALLERY_CATEGORIES = ["National Days", "Official Visits", "College Functions", "Sports", "Academic"];
const GALLERY_CATEGORIES_KEY = "gallery_categories";

async function loadGalleryCategories(tenantId: string): Promise<string[]> {
  const [row] = await db.select({ value: siteSettingsTable.value })
    .from(siteSettingsTable)
    .where(and(eq(siteSettingsTable.tenantId, tenantId), eq(siteSettingsTable.key, GALLERY_CATEGORIES_KEY)));
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
    } catch { /* fall through */ }
  }
  return DEFAULT_GALLERY_CATEGORIES;
}

// Admin: get gallery categories for the current tenant.
router.get("/admin/website/gallery-categories", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
    return res.json({ categories: await loadGalleryCategories(tenantId) });
  } catch { return res.status(500).json({ error: "Failed to fetch gallery categories" }); }
});

// Admin: save gallery categories for the current tenant.
router.put("/admin/website/gallery-categories", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
    const { categories } = req.body as { categories?: unknown };
    if (!Array.isArray(categories) || !categories.every(c => typeof c === "string")) {
      return res.status(400).json({ error: "categories must be an array of strings" });
    }
    const clean = (categories as string[]).map(c => c.trim()).filter(Boolean);
    if (clean.length === 0) return res.status(400).json({ error: "At least one category is required" });
    await db.insert(siteSettingsTable)
      .values({ tenantId, key: GALLERY_CATEGORIES_KEY, value: JSON.stringify(clean) })
      .onConflictDoUpdate({
        target: [siteSettingsTable.tenantId, siteSettingsTable.key],
        set: { value: JSON.stringify(clean), updatedAt: new Date() },
      });
    return res.json({ ok: true, categories: clean });
  } catch { return res.status(500).json({ error: "Failed to save gallery categories" }); }
});

// Admin: list tenants the current admin may manage (super-admin: all; scoped: own).
router.get("/admin/website/tenants", requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await db.select({
      id: tenantsTable.id, name: tenantsTable.name, slug: tenantsTable.slug,
      domain: tenantsTable.domain, siteTheme: tenantsTable.siteTheme, isActive: tenantsTable.isActive,
    }).from(tenantsTable).orderBy(asc(tenantsTable.name));
    const user = req.adminUser;
    const scoped = user?.tenantId ? rows.filter((r) => r.id === user.tenantId) : rows;
    return res.json(scoped);
  } catch { return res.status(500).json({ error: "Failed to fetch tenants" }); }
});

// ─── CONTACT SUBMISSIONS ──────────────────────────────────────────────────────
// Public contact form submissions. Tenant-scoped: writes stamp tenant_id and
// fail closed when the tenant cannot be resolved; admin reads are scoped too.

const CONTACT_STATUSES = new Set(["unread", "read", "handled"]);

const CONTACT_LIMITS = {
  name:    { min: 2,  max: 120  },
  email:   { min: 5,  max: 200  },
  phone:   { min: 0,  max: 40   },
  subject: { min: 0,  max: 200  },
  message: { min: 20, max: 5000 },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Persistent, cross-instance rate limit: max submissions per IP per window.
// Backed by the rate_limit_counters DB table so it survives restarts and is
// shared across multiple server instances (see lib/rate-limit.ts).
const CONTACT_RATE_MAX = 5;
const CONTACT_RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// Public: issue a CAPTCHA-equivalent challenge token. The Contact form fetches
// this on load and submits it back; it proves the client actually loaded the
// form (and enforces a minimum fill time) without a third-party CAPTCHA.
router.get("/website/contact/challenge", publicTenant, (req: Request, res: Response) => {
  if (!req.tenantId) return res.status(400).json({ error: "Tenant could not be resolved" });
  return res.json({ token: issueContactChallenge(req.tenantId) });
});

// Public: submit a contact message.
router.post("/website/contact", publicTenant, async (req: Request, res: Response) => {
  try {
    // Honeypot: bots fill hidden fields. Silently accept to avoid tipping them
    // off, but never store the row.
    const honeypot = typeof req.body?.website === "string" ? req.body.website.trim() : "";
    if (honeypot) return res.status(201).json({ ok: true });

    // Fail closed: never write an unscoped row.
    if (!req.tenantId) return res.status(400).json({ error: "Tenant could not be resolved" });

    // CAPTCHA-equivalent: require a valid, tenant-bound challenge token that was
    // issued at least a few seconds ago. Blocks bots that POST without first
    // loading the form, and instant auto-fill submissions.
    const verdict = verifyContactChallenge(req.body?.token, req.tenantId);
    if (!verdict.ok) {
      if (verdict.reason === "too_fast") {
        return res.status(400).json({ error: "That was too quick — please take a moment and try again." });
      }
      if (verdict.reason === "expired") {
        return res.status(400).json({ error: "This form has expired. Please reload the page and try again." });
      }
      return res.status(400).json({ error: "Verification failed. Please reload the page and try again." });
    }

    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      || req.socket.remoteAddress || "unknown";
    if (await isRateLimited("contact", ip, CONTACT_RATE_MAX, CONTACT_RATE_WINDOW_MS)) {
      return res.status(429).json({ error: "Too many messages. Please try again later." });
    }

    const b = req.body ?? {};
    const name    = typeof b.name === "string"    ? b.name.trim()    : "";
    const email   = typeof b.email === "string"   ? b.email.trim()   : "";
    const phone   = typeof b.phone === "string"   ? b.phone.trim()   : "";
    const subject = typeof b.subject === "string" ? b.subject.trim() : "";
    const message = typeof b.message === "string" ? b.message.trim() : "";

    if (name.length < CONTACT_LIMITS.name.min || name.length > CONTACT_LIMITS.name.max) {
      return res.status(400).json({ error: "Please enter a valid name" });
    }
    if (!EMAIL_RE.test(email) || email.length > CONTACT_LIMITS.email.max) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }
    if (phone.length > CONTACT_LIMITS.phone.max) {
      return res.status(400).json({ error: "Phone number is too long" });
    }
    if (subject.length > CONTACT_LIMITS.subject.max) {
      return res.status(400).json({ error: "Subject is too long" });
    }
    if (message.length < CONTACT_LIMITS.message.min || message.length > CONTACT_LIMITS.message.max) {
      return res.status(400).json({ error: "Message must be between 20 and 5000 characters" });
    }

    const [row] = await db.insert(siteContactSubmissionsTable).values({
      tenantId: req.tenantId,
      name, email,
      phone:   phone   || null,
      subject: subject || null,
      message,
    }).returning();

    return res.status(201).json({ ok: true, id: row?.id });
  } catch { return res.status(500).json({ error: "Failed to submit message" }); }
});

// Admin: list contact submissions (tenant-scoped, newest first).
router.get("/admin/website/contact", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
    const rows = await db.select().from(siteContactSubmissionsTable)
      .where(eq(siteContactSubmissionsTable.tenantId, tenantId))
      .orderBy(desc(siteContactSubmissionsTable.createdAt));
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Failed to fetch contact submissions" }); }
});

// Admin: update a submission's status (unread | read | handled).
router.patch("/admin/website/contact/:id/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
    const status = typeof req.body?.status === "string" ? req.body.status : "";
    if (!CONTACT_STATUSES.has(status)) {
      return res.status(400).json({ error: "status must be one of unread, read, handled" });
    }
    const [row] = await db.update(siteContactSubmissionsTable)
      .set({ status, updatedAt: new Date() })
      .where(rowWhere(siteContactSubmissionsTable, req.params.id as string, tenantId))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch { return res.status(500).json({ error: "Failed to update submission" }); }
});

// ── SEO: per-tenant sitemap.xml ───────────────────────────────────────────────
// Generates a minimal XML sitemap scoped to the resolved tenant. The base URL
// is taken from the site_base_url setting (if set by the admin) or derived from
// the request host + X-Tenant-Slug header injected by the gateway.
router.get("/website/sitemap.xml", publicTenant, async (req: Request, res: Response) => {
  try {
    if (!req.tenantId) return res.status(400).send("Tenant not resolved");
    const [row] = await db.select({ value: siteSettingsTable.value })
      .from(siteSettingsTable)
      .where(and(eq(siteSettingsTable.tenantId, req.tenantId), eq(siteSettingsTable.key, "site_base_url")))
      .limit(1);
    // x-public-host/proto are injected by the gateway BEFORE it deletes
    // x-forwarded-host, giving us the real external origin rather than localhost.
    const proto = (req.headers["x-public-proto"] as string | undefined)?.split(",")[0]?.trim()
                  ?? (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim()
                  ?? "https";
    const host  = (req.headers["x-public-host"] as string | undefined)?.split(",")[0]?.trim()
                  || (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim()
                  || (req.headers.host as string | undefined) || "localhost";
    const slug  = req.headers["x-tenant-slug"] as string | undefined;
    const derivedBase = slug ? `${proto}://${host}/${slug}` : `${proto}://${host}`;
    const base = (row?.value ?? "").replace(/\/$/, "") || derivedBase;
    const pages = [
      { loc: `${base}/`,            priority: "1.0", changefreq: "daily"   },
      { loc: `${base}/about`,       priority: "0.8", changefreq: "monthly" },
      { loc: `${base}/admissions`,  priority: "0.9", changefreq: "weekly"  },
      { loc: `${base}/events`,      priority: "0.8", changefreq: "weekly"  },
      { loc: `${base}/gallery`,     priority: "0.7", changefreq: "weekly"  },
      { loc: `${base}/alumni`,      priority: "0.7", changefreq: "monthly" },
      { loc: `${base}/teachers`,    priority: "0.7", changefreq: "monthly" },
      { loc: `${base}/downloads`,   priority: "0.6", changefreq: "monthly" },
      { loc: `${base}/fee-structure`, priority: "0.8", changefreq: "monthly" },
      { loc: `${base}/contact`,     priority: "0.7", changefreq: "monthly" },
      { loc: `${base}/results`,     priority: "0.8", changefreq: "weekly"  },
      { loc: `${base}/status`,      priority: "0.6", changefreq: "weekly"  },
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p =>
      `  <url>\n    <loc>${p.loc}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
    ).join("\n")}\n</urlset>`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(xml);
  } catch { return res.status(500).send('<?xml version="1.0"?><error>Server error</error>'); }
});

// ── SEO: per-tenant robots.txt ────────────────────────────────────────────────
router.get("/website/robots.txt", publicTenant, async (req: Request, res: Response) => {
  try {
    if (!req.tenantId) return res.status(400).send("Tenant not resolved");
    const [row] = await db.select({ value: siteSettingsTable.value })
      .from(siteSettingsTable)
      .where(and(eq(siteSettingsTable.tenantId, req.tenantId), eq(siteSettingsTable.key, "site_base_url")))
      .limit(1);
    const proto = (req.headers["x-public-proto"] as string | undefined)?.split(",")[0]?.trim()
                  ?? (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim()
                  ?? "https";
    const host  = (req.headers["x-public-host"] as string | undefined)?.split(",")[0]?.trim()
                  || (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim()
                  || (req.headers.host as string | undefined) || "localhost";
    const slug  = req.headers["x-tenant-slug"] as string | undefined;
    const derivedBase = slug ? `${proto}://${host}/${slug}` : `${proto}://${host}`;
    const base = (row?.value ?? "").replace(/\/$/, "") || derivedBase;
    const txt = `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(txt);
  } catch { return res.status(500).send("User-agent: *\nAllow: /\n"); }
});

// ── SEO: per-tenant favicon redirect ─────────────────────────────────────────
// The gateway calls this for /<slug>/favicon.ico requests with X-Tenant-Slug
// set. Returns { url } so the gateway can redirect to the custom favicon, or
// null so the gateway falls back to the SPA's built-in favicon.ico.
router.get("/website/favicon", publicTenant, async (req: Request, res: Response) => {
  try {
    if (!req.tenantId) return res.json({ url: null });
    const [row] = await db.select({ value: siteSettingsTable.value })
      .from(siteSettingsTable)
      .where(and(eq(siteSettingsTable.tenantId, req.tenantId), eq(siteSettingsTable.key, "site_favicon")))
      .limit(1);
    return res.json({ url: row?.value || null });
  } catch { return res.json({ url: null }); }
});

export default router;
