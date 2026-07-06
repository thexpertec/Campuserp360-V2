import { Router, type IRouter, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { mediaLibraryTable } from "@workspace/db";
import { eq, or, ilike, and, desc, asc, count, sql, inArray } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { putObject, deleteObject, getObjectBuffer, urlToKey, resolveUrl } from "../lib/storage";
import { convertToWebp } from "../lib/image";
import { getAdminTenantId } from "../lib/tenant";
import { rewriteMediaReferences, type UrlMapping } from "../lib/media-references";

const router: IRouter = Router();

/**
 * Resolve the admin's tenant, failing closed with a 400 if it cannot be
 * determined. Returns null after responding so callers can `if (!t) return;`.
 * This prevents any tenant-scoped media query from running unscoped.
 */
async function resolveAdminTenant(req: Request, res: Response): Promise<string | null> {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) { res.status(400).json({ error: "Tenant could not be resolved" }); return null; }
  return tenantId;
}

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const MEDIA_DIR   = path.join(UPLOADS_DIR, "media");
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ── GET /api/admin/media ──────────────────────────────────────────────────────
router.get("/admin/media", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
  const { q, tag, page = "1", limit = "24", sort = "newest" } = req.query as Record<string, string>;
  const pageNum   = Math.max(1, parseInt(page));
  const limitNum  = Math.min(100, Math.max(1, parseInt(limit)));
  const offset    = (pageNum - 1) * limitNum;

  const conditions: (ReturnType<typeof ilike> | ReturnType<typeof eq>)[] = [
    eq(mediaLibraryTable.tenantId, tenantId),
  ];
  if (q) {
    conditions.push(
      or(
        ilike(mediaLibraryTable.originalName, `%${q}%`),
        ilike(mediaLibraryTable.altText,      `%${q}%`),
        ilike(mediaLibraryTable.tags,         `%${q}%`),
      ) as ReturnType<typeof ilike>,
    );
  }
  if (tag) {
    conditions.push(ilike(mediaLibraryTable.tags, `%${tag}%`));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderBy =
    sort === "oldest" ? asc(mediaLibraryTable.uploadedAt)
    : sort === "name" ? asc(mediaLibraryTable.originalName)
    : sort === "size" ? desc(mediaLibraryTable.sizeBytes)
    : desc(mediaLibraryTable.uploadedAt);

  try {
    const [items, countRows] = await Promise.all([
      db.select().from(mediaLibraryTable).where(where).orderBy(orderBy).limit(limitNum).offset(offset),
      db.select({ total: count() }).from(mediaLibraryTable).where(where),
    ]);
    return res.json({
      items: items.map(item => ({ ...item, url: resolveUrl(item.url) ?? item.url })),
      total: Number(countRows[0]?.total ?? 0),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error("media list error:", err);
    return res.status(500).json({ error: "Failed to fetch media" });
  }
});

// ── GET /api/admin/media/tags ─────────────────────────────────────────────────
router.get("/admin/media/tags", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
  try {
    const rows = await db
      .select({ tags: mediaLibraryTable.tags })
      .from(mediaLibraryTable)
      .where(and(
        eq(mediaLibraryTable.tenantId, tenantId),
        sql`${mediaLibraryTable.tags} IS NOT NULL AND ${mediaLibraryTable.tags} != ''`,
      ));

    const all = new Set<string>();
    for (const row of rows) {
      if (row.tags) row.tags.split(",").map(t => t.trim()).filter(Boolean).forEach(t => all.add(t));
    }
    return res.json(Array.from(all).sort());
  } catch (err) {
    console.error("media tags error:", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/admin/media ─────────────────────────────────────────────────────
// Body: { dataUrl: string, filename: string, altText?: string, tags?: string }
router.post("/admin/media", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
  const { dataUrl, filename, altText, tags } = req.body as {
    dataUrl: string; filename: string; altText?: string; tags?: string;
  };
  if (!dataUrl || !filename) return res.status(400).json({ error: "dataUrl and filename required" });

  const mime  = dataUrl.match(/^data:(image\/[\w.+-]+);base64,/);
  const sourceMime = mime ? mime[1] : "image/png";
  const uuid  = randomUUID();

  try {
    const base64Data = dataUrl.replace(/^data:image\/[\w.+-]+;base64,/, "");
    const sourceBuffer = Buffer.from(base64Data, "base64");

    // Auto-convert images to WebP at upload time (best-effort). Images already
    // in WebP are stored as-is; on conversion failure we fall back to the
    // original bytes so the upload never breaks.
    let buffer: Buffer = sourceBuffer;
    let mimeType = sourceMime;
    let ext      = sourceMime.split("/")[1] ?? "png";
    if (ext === "jpeg") ext = "jpg";
    if (sourceMime !== "image/webp") {
      try {
        buffer   = await convertToWebp(sourceBuffer);
        mimeType = "image/webp";
        ext      = "webp";
      } catch (convErr) {
        console.warn("media upload webp conversion failed, storing original:", convErr);
      }
    } else {
      ext = "webp";
    }

    const storedFilename = `${uuid}.${ext}`;
    const resolvedUrl = await putObject(`media/${storedFilename}`, buffer, mimeType);

    const [item] = await db.insert(mediaLibraryTable).values({
      tenantId,
      filename:     storedFilename,
      originalName: filename,
      mimeType,
      sizeBytes:    buffer.length,
      altText:      altText ?? null,
      tags:         tags ?? null,
      url:          resolvedUrl,
    }).returning();

    return res.json(item);
  } catch (err) {
    console.error("media upload error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
});

// ── POST /api/admin/media/bulk-convert-webp ──────────────────────────────────
// Body: { ids: string[] } — convert the given media images to WebP in place.
// Registered BEFORE the /:id param routes so "bulk-convert-webp" is never
// captured as an :id value. Non-images and already-WebP items are skipped (not
// errored); the original object is deleted after a successful conversion.
router.post("/admin/media/bulk-convert-webp", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
  const { ids } = req.body as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids required" });

  try {
    const items = await db.select().from(mediaLibraryTable)
      .where(and(inArray(mediaLibraryTable.id, ids), eq(mediaLibraryTable.tenantId, tenantId)));

    let converted = 0;
    let skipped   = 0;
    let failed    = 0;
    const mappings: UrlMapping[] = [];

    for (const item of items) {
      // Skip non-images and images already in WebP.
      if (!item.mimeType.startsWith("image/") || item.mimeType === "image/webp") {
        skipped++;
        continue;
      }
      try {
        const oldKey = urlToKey(item.url) ?? `media/${item.filename}`;
        const source = await getObjectBuffer(oldKey);
        if (!source) { failed++; continue; }

        const webpBuf = await convertToWebp(source);
        const newFilename = `${randomUUID()}.webp`;
        const oldUrl = item.url;
        const newUrl = await putObject(`media/${newFilename}`, webpBuf, "image/webp");

        await db.update(mediaLibraryTable)
          .set({ filename: newFilename, mimeType: "image/webp", sizeBytes: webpBuf.length, url: newUrl })
          .where(and(eq(mediaLibraryTable.id, item.id), eq(mediaLibraryTable.tenantId, tenantId)));

        // Delete the original object only after the record points at the new one.
        if (oldKey !== `media/${newFilename}`) await deleteObject(oldKey);
        mappings.push({ oldUrl, newUrl });
        converted++;
      } catch (convErr) {
        console.error("media bulk-convert item error:", item.id, convErr);
        failed++;
      }
    }

    // Rewrite any website/CMS content that hardcoded the old image URLs so they
    // point at the new .webp object instead of 404ing. Best-effort: a rewrite
    // failure must not fail the conversion that already succeeded.
    let referencesRewritten = 0;
    let referenceLocations: { table: string; column: string; count: number }[] = [];
    if (mappings.length > 0) {
      try {
        const report = await rewriteMediaReferences(tenantId, mappings);
        referencesRewritten = report.total;
        referenceLocations  = report.locations;
      } catch (rewriteErr) {
        console.error("media bulk-convert reference rewrite error:", rewriteErr);
      }
    }

    return res.json({ converted, skipped, failed, referencesRewritten, referenceLocations });
  } catch (err) {
    console.error("media bulk-convert error:", err);
    return res.status(500).json({ error: "Bulk convert failed" });
  }
});

// ── PATCH /api/admin/media/:id ────────────────────────────────────────────────
router.patch("/admin/media/:id", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
  const id = String(req.params.id);
  const { altText, tags } = req.body as { altText?: string; tags?: string };
  try {
    const [item] = await db.update(mediaLibraryTable)
      .set({ altText: altText ?? null, tags: tags ?? null })
      .where(and(eq(mediaLibraryTable.id, id), eq(mediaLibraryTable.tenantId, tenantId)))
      .returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch (err) {
    console.error("media patch error:", err);
    return res.status(500).json({ error: "Update failed" });
  }
});

// ── DELETE /api/admin/media/:id ───────────────────────────────────────────────
router.delete("/admin/media/:id", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
  const id = String(req.params.id);
  try {
    const [item] = await db.select().from(mediaLibraryTable)
      .where(and(eq(mediaLibraryTable.id, id), eq(mediaLibraryTable.tenantId, tenantId)));
    if (!item) return res.status(404).json({ error: "Not found" });
    const key = urlToKey(item.url) ?? `media/${item.filename}`;
    const { deleteObject } = await import("../lib/storage");
    await deleteObject(key);
    await db.delete(mediaLibraryTable)
      .where(and(eq(mediaLibraryTable.id, id), eq(mediaLibraryTable.tenantId, tenantId)));
    return res.json({ ok: true });
  } catch (err) {
    console.error("media delete error:", err);
    return res.status(500).json({ error: "Delete failed" });
  }
});

// ── POST /api/admin/media/bulk-delete ────────────────────────────────────────
router.post("/admin/media/bulk-delete", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
  const { ids } = req.body as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids required" });
  try {
    const items = await db.select().from(mediaLibraryTable)
      .where(and(inArray(mediaLibraryTable.id, ids), eq(mediaLibraryTable.tenantId, tenantId)));
    const { deleteObject } = await import("../lib/storage");
    await Promise.all(
      items.map(item => deleteObject(urlToKey(item.url) ?? `media/${item.filename}`)),
    );
    const scopedIds = items.map(item => item.id);
    if (scopedIds.length > 0) {
      await db.delete(mediaLibraryTable)
        .where(and(inArray(mediaLibraryTable.id, scopedIds), eq(mediaLibraryTable.tenantId, tenantId)));
    }
    return res.json({ ok: true, deleted: items.length });
  } catch (err) {
    console.error("media bulk-delete error:", err);
    return res.status(500).json({ error: "Bulk delete failed" });
  }
});

export default router;
