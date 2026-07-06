import { Router, type IRouter, type Request, type Response, json as expressJson } from "express";
import fs from "node:fs";
import path from "node:path";
import { db } from "@workspace/db";
import { tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin, requireSuperAdmin } from "../lib/admin-auth";
import { seedDummyData, clearAllData } from "../lib/seed-dummy-data";
import { putObject, deleteObject } from "../lib/storage";
import {
  loadPrintSettings,
  savePrintSettings,
  tenantPrintBgKey,
  toPrintSettingsResponse,
} from "../lib/print-settings";

const router: IRouter = Router();

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const PRINT_DIR = path.join(UPLOADS_DIR, "print");

// Ensure directory exists (still needed for fallback mode)
if (!fs.existsSync(PRINT_DIR)) fs.mkdirSync(PRINT_DIR, { recursive: true });

// ── GET /api/admin/print-settings ──────────────────────────────────────────────
router.get("/admin/print-settings", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).adminUser?.tenantId as string | undefined;
    const [row, tenantRows] = await Promise.all([
      loadPrintSettings(tenantId),
      tenantId
        ? db.select({ name: tenantsTable.name }).from(tenantsTable).where(eq(tenantsTable.id, tenantId))
        : Promise.resolve([] as { name: string }[]),
    ]);
    const instituteName = tenantRows[0]?.name ?? "";
    return res.json(toPrintSettingsResponse(row, instituteName));
  } catch (err) {
    console.error("print-settings GET error:", err);
    return res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// ── PUT /api/admin/print-settings ──────────────────────────────────────────────
router.put("/admin/print-settings", requireAdmin, async (req: Request, res: Response) => {
  const { marginTop, marginRight, marginBottom, marginLeft, pageSize, orientation, showInstituteName } = req.body as {
    marginTop: number; marginRight: number; marginBottom: number; marginLeft: number;
    pageSize: string; orientation: string; showInstituteName?: boolean;
  };
  try {
    const tenantId = (req as any).adminUser?.tenantId as string | undefined;
    const vals = {
      marginTop, marginRight, marginBottom, marginLeft, pageSize, orientation,
      ...(showInstituteName !== undefined ? { showInstituteName } : {}),
    };
    await savePrintSettings(tenantId, vals);
    return res.json({ ok: true });
  } catch (err) {
    console.error("print-settings PUT error:", err);
    return res.status(500).json({ error: "Failed to save settings" });
  }
});

// ── POST /api/admin/print-settings/bg ─────────────────────────────────────────
// Body: { dataUrl: string }  — accepts any image format; converts to WebP.
// Uses a 10 MB body limit because the image is sent as a base64 data-URL.
router.post("/admin/print-settings/bg", requireAdmin, expressJson({ limit: "10mb" }), async (req: Request, res: Response) => {
  const { dataUrl } = req.body as { dataUrl: string; ext?: string };
  if (!dataUrl) return res.status(400).json({ error: "dataUrl required" });

  try {
    const tenantId = (req as any).adminUser?.tenantId as string | undefined;
    const objectKey = tenantId ? tenantPrintBgKey(tenantId) : "print/bg.webp";

    const raw     = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const sharp   = (await import("sharp")).default;
    const webpBuf = await sharp(Buffer.from(raw, "base64")).webp({ quality: 85 }).toBuffer();
    const resolvedUrl = await putObject(objectKey, webpBuf, "image/webp");

    await savePrintSettings(tenantId, { bgImagePath: resolvedUrl });

    return res.json({ url: resolvedUrl });
  } catch (err) {
    console.error("print-settings bg upload error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
});

// ── DELETE /api/admin/print-settings/bg ───────────────────────────────────────
router.delete("/admin/print-settings/bg", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).adminUser?.tenantId as string | undefined;
    const objectKey = tenantId ? tenantPrintBgKey(tenantId) : "print/bg.webp";
    await deleteObject(objectKey);
    await savePrintSettings(tenantId, { bgImagePath: null });

    return res.json({ ok: true });
  } catch (err) {
    console.error("print-settings bg delete error:", err);
    return res.status(500).json({ error: "Delete failed" });
  }
});

// ── GET /api/admin/settings/column-widths ─────────────────────────────────────
const COL_WIDTHS_FILE = path.join(UPLOADS_DIR, "column-widths.json");

router.get("/admin/settings/column-widths", requireAdmin, async (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(COL_WIDTHS_FILE)) return res.json({});
    const raw = fs.readFileSync(COL_WIDTHS_FILE, "utf8");
    return res.json(JSON.parse(raw));
  } catch {
    return res.json({});
  }
});

// ── PUT /api/admin/settings/column-widths ─────────────────────────────────────
router.put("/admin/settings/column-widths", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { sheetKey, widths } = req.body as { sheetKey: string; widths: Record<string, number> };
    if (!sheetKey || typeof widths !== "object") return res.status(400).json({ error: "sheetKey and widths required" });
    let existing: Record<string, Record<string, number>> = {};
    if (fs.existsSync(COL_WIDTHS_FILE)) {
      try { existing = JSON.parse(fs.readFileSync(COL_WIDTHS_FILE, "utf8")); } catch { existing = {}; }
    }
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const updated = { ...existing, [sheetKey]: widths };
    fs.writeFileSync(COL_WIDTHS_FILE, JSON.stringify(updated, null, 2));
    return res.json({ ok: true });
  } catch (err) {
    console.error("column-widths PUT error:", err);
    return res.status(500).json({ error: "Failed to save column widths" });
  }
});

// ── POST /api/admin/settings/seed ─────────────────────────────────────────────
// Idempotent: skips tables that already have data. Super-admin only.
router.post("/admin/settings/seed", requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await seedDummyData();
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("seed error:", err);
    return res.status(500).json({ error: "Seed failed" });
  }
});

// ── POST /api/admin/settings/reseed ───────────────────────────────────────────
// Destructive: clears all data then seeds fresh. Super-admin only. Dev/staging only.
router.post("/admin/settings/reseed", requireSuperAdmin, async (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Reseed is disabled in production" });
  }
  try {
    await clearAllData();
    const result = await seedDummyData();
    return res.json({ ok: true, cleared: true, ...result });
  } catch (err) {
    console.error("reseed error:", err);
    return res.status(500).json({ error: "Reseed failed" });
  }
});

// ── POST /api/admin/dev/seed-all ──────────────────────────────────────────────
// Alias kept for backwards compatibility with BackupTab button. Super-admin only.
router.post("/admin/dev/seed-all", requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await seedDummyData();
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("seed-all error:", err);
    return res.status(500).json({ error: "Seed failed" });
  }
});

export default router;
