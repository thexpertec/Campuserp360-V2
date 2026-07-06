import { Router, type IRouter, type Request, type Response, json as expressJson } from "express";
import { db } from "@workspace/db";
import { printSignaturesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";
import { putObject, deleteObject } from "../lib/storage";

const router: IRouter = Router();

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "sig";
}

async function uniqueName(tenantId: string, base: string): Promise<string> {
  const rows = await db
    .select({ name: printSignaturesTable.name })
    .from(printSignaturesTable)
    .where(eq(printSignaturesTable.tenantId, tenantId));
  const taken = new Set(rows.map(r => r.name));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

// ── GET /api/admin/print-signatures ──────────────────────────────────────────
router.get("/admin/print-signatures", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "No tenant" });
  try {
    const rows = await db
      .select()
      .from(printSignaturesTable)
      .where(eq(printSignaturesTable.tenantId, tenantId))
      .orderBy(printSignaturesTable.createdAt);
    return res.json(rows);
  } catch (err) {
    console.error("print-signatures list error:", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// ── POST /api/admin/print-signatures ─────────────────────────────────────────
router.post("/admin/print-signatures", requireAdmin, expressJson({ limit: "8mb" }), async (req: Request, res: Response) => {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "No tenant" });
  const { label, type: rawType, dataUrl } = req.body as { label?: string; type?: string; dataUrl?: string };
  const cleanLabel = String(label ?? "").trim();
  if (!cleanLabel) return res.status(400).json({ error: "Label is required" });
  if (!dataUrl) return res.status(400).json({ error: "dataUrl is required" });
  const sigType = rawType === "stamp" ? "stamp" : "signature";
  try {
    const raw     = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const sharp   = (await import("sharp")).default;
    const webpBuf = await sharp(Buffer.from(raw, "base64")).webp({ quality: 90 }).toBuffer();

    const baseName = slugify(cleanLabel);
    const name     = await uniqueName(tenantId, baseName);
    const key      = `signatures/${tenantId}/${sigType}_${name}.webp`;
    const url      = await putObject(key, webpBuf, "image/webp");

    const [row] = await db.insert(printSignaturesTable).values({
      tenantId, name, label: cleanLabel, type: sigType, storageKey: key, url,
    }).returning();
    return res.status(201).json(row);
  } catch (err) {
    console.error("print-signatures upload error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
});

// ── DELETE /api/admin/print-signatures/:id ────────────────────────────────────
router.delete("/admin/print-signatures/:id", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "No tenant" });
  const id = String(req.params.id);
  try {
    const [row] = await db
      .select()
      .from(printSignaturesTable)
      .where(and(eq(printSignaturesTable.id, id), eq(printSignaturesTable.tenantId, tenantId)));
    if (!row) return res.status(404).json({ error: "Not found" });
    await deleteObject(row.storageKey);
    await db.delete(printSignaturesTable).where(eq(printSignaturesTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    console.error("print-signatures delete error:", err);
    return res.status(500).json({ error: "Failed" });
  }
});

export default router;
