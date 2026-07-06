import { Router, type Request, type Response } from "express";
import { db, challanSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";
import { putObject } from "../lib/storage";
import { randomUUID } from "node:crypto";

const router = Router();

const DEFAULTS = {
  phone:            "",
  address:          "",
  institutionCode:  "",
  showSection:      true,
  showFeeDesc:      true,
  showBankAccounts: false,
  showInstructions: true,
  hideZeroRows:     false,
  bankAccountIds:   [] as string[],
  activeTemplate:   "standard" as string,
};

function rowToJson(row: typeof challanSettingsTable.$inferSelect) {
  return {
    phone:            row.phone ?? "",
    address:          row.address ?? "",
    institutionCode:  row.institutionCode ?? "",
    showSection:      row.showSection,
    showFeeDesc:      row.showFeeDesc,
    showBankAccounts: row.showBankAccounts,
    showInstructions: row.showInstructions,
    hideZeroRows:     row.hideZeroRows,
    bankAccountIds:   row.bankAccountIds
      ? row.bankAccountIds.split(",").map(s => s.trim()).filter(Boolean)
      : [],
    activeTemplate:   row.activeTemplate ?? "standard",
    logoUrl:          (row as any).logo_url ?? null,
    logoUrlRight:     (row as any).logo_url_right ?? null,
  };
}

// ── GET /api/admin/settings/challan ───────────────────────────────────────────

router.get("/admin/settings/challan", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const rows = await db
      .select()
      .from(challanSettingsTable)
      .where(eq(challanSettingsTable.tenantId, tenantId));
    if (!rows.length) return res.json(DEFAULTS);
    return res.json(rowToJson(rows[0]));
  } catch (err) {
    req.log?.error({ err }, "challan-settings GET error");
    return res.status(500).json({ error: "Failed to fetch challan settings" });
  }
});

// ── PATCH /api/admin/settings/challan ─────────────────────────────────────────

router.patch("/admin/settings/challan", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const {
      phone, address, institutionCode,
      showSection, showFeeDesc, showBankAccounts, showInstructions, hideZeroRows,
      bankAccountIds, activeTemplate,
    } = req.body as {
      phone?: string; address?: string; institutionCode?: string;
      showSection?: boolean; showFeeDesc?: boolean;
      showBankAccounts?: boolean; showInstructions?: boolean; hideZeroRows?: boolean;
      bankAccountIds?: string[];
      activeTemplate?: string;
    };

    const set: Record<string, unknown> = {};
    if (phone            !== undefined) set.phone            = phone?.trim() || null;
    if (address          !== undefined) set.address          = address?.trim() || null;
    if (institutionCode  !== undefined) set.institutionCode  = institutionCode?.trim() || null;
    if (showSection      !== undefined) set.showSection      = Boolean(showSection);
    if (showFeeDesc      !== undefined) set.showFeeDesc      = Boolean(showFeeDesc);
    if (showBankAccounts !== undefined) set.showBankAccounts = Boolean(showBankAccounts);
    if (showInstructions !== undefined) set.showInstructions = Boolean(showInstructions);
    if (hideZeroRows     !== undefined) set.hideZeroRows     = Boolean(hideZeroRows);
    if (bankAccountIds   !== undefined) {
      set.bankAccountIds = Array.isArray(bankAccountIds) && bankAccountIds.length
        ? bankAccountIds.join(",")
        : null;
    }
    if (activeTemplate !== undefined) {
      set.activeTemplate = activeTemplate === "bank-challan" ? "bank-challan" : "standard";
    }
    const { logoUrl } = req.body as { logoUrl?: string | null };
    if (logoUrl !== undefined) set.logo_url = logoUrl ?? null;

    const existing = await db
      .select({ id: challanSettingsTable.id })
      .from(challanSettingsTable)
      .where(eq(challanSettingsTable.tenantId, tenantId));

    if (existing.length) {
      await db
        .update(challanSettingsTable)
        .set(set as any)
        .where(eq(challanSettingsTable.tenantId, tenantId));
    } else {
      await db.insert(challanSettingsTable).values({
        tenantId,
        phone:            (set.phone as string | null) ?? null,
        address:          (set.address as string | null) ?? null,
        institutionCode:  (set.institutionCode as string | null) ?? null,
        showSection:      (set.showSection as boolean) ?? true,
        showFeeDesc:      (set.showFeeDesc as boolean) ?? true,
        showBankAccounts: (set.showBankAccounts as boolean) ?? false,
        showInstructions: (set.showInstructions as boolean) ?? true,
        hideZeroRows:     (set.hideZeroRows as boolean) ?? false,
        bankAccountIds:   (set.bankAccountIds as string | null) ?? null,
        activeTemplate:   (set.activeTemplate as string) ?? "standard",
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "challan-settings PATCH error");
    return res.status(500).json({ error: "Failed to save challan settings" });
  }
});

// ── POST /api/admin/settings/challan/logo ─────────────────────────────────────
// Body: { dataUrl: string, filename: string }
// Uploads to R2/disk and saves the resulting URL into challan_settings.logo_url.

router.post("/admin/settings/challan/logo", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const { dataUrl, filename } = req.body as { dataUrl?: string; filename?: string };
    if (!dataUrl || !filename) return res.status(400).json({ error: "dataUrl and filename required" });

    const mimeMatch = dataUrl.match(/^data:(image\/[\w.+-]+);base64,/);
    if (!mimeMatch) return res.status(400).json({ error: "dataUrl must be a base64 image" });
    const mimeType = mimeMatch[1];
    const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "png";

    const base64Data = dataUrl.replace(/^data:image\/[\w.+-]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const key = `challan-logos/${randomUUID()}.${ext}`;
    const url = await putObject(key, buffer, mimeType);

    const existing = await db
      .select({ id: challanSettingsTable.id })
      .from(challanSettingsTable)
      .where(eq(challanSettingsTable.tenantId, tenantId));

    if (existing.length) {
      await db
        .update(challanSettingsTable)
        .set({ logo_url: url } as any)
        .where(eq(challanSettingsTable.tenantId, tenantId));
    } else {
      await db.insert(challanSettingsTable).values({
        tenantId,
        logo_url: url,
      } as any);
    }

    return res.json({ url });
  } catch (err) {
    req.log?.error({ err }, "challan-logo upload error");
    return res.status(500).json({ error: "Upload failed" });
  }
});

// ── DELETE /api/admin/settings/challan/logo ───────────────────────────────────

router.delete("/admin/settings/challan/logo", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db
      .update(challanSettingsTable)
      .set({ logo_url: null } as any)
      .where(eq(challanSettingsTable.tenantId, tenantId));
    return res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "challan-logo delete error");
    return res.status(500).json({ error: "Failed to remove logo" });
  }
});

// ── POST /api/admin/settings/challan/logo-right ───────────────────────────────
// Body: { dataUrl: string, filename: string }

router.post("/admin/settings/challan/logo-right", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const { dataUrl, filename } = req.body as { dataUrl?: string; filename?: string };
    if (!dataUrl || !filename) return res.status(400).json({ error: "dataUrl and filename required" });

    const mimeMatch = dataUrl.match(/^data:(image\/[\w.+-]+);base64,/);
    if (!mimeMatch) return res.status(400).json({ error: "dataUrl must be a base64 image" });
    const mimeType = mimeMatch[1];
    const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "png";

    const base64Data = dataUrl.replace(/^data:image\/[\w.+-]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const key = `challan-logos/${randomUUID()}.${ext}`;
    const url = await putObject(key, buffer, mimeType);

    const existing = await db
      .select({ id: challanSettingsTable.id })
      .from(challanSettingsTable)
      .where(eq(challanSettingsTable.tenantId, tenantId));

    if (existing.length) {
      await db
        .update(challanSettingsTable)
        .set({ logo_url_right: url } as any)
        .where(eq(challanSettingsTable.tenantId, tenantId));
    } else {
      await db.insert(challanSettingsTable).values({
        tenantId,
        logo_url_right: url,
      } as any);
    }

    return res.json({ url });
  } catch (err) {
    req.log?.error({ err }, "challan-logo-right upload error");
    return res.status(500).json({ error: "Upload failed" });
  }
});

// ── DELETE /api/admin/settings/challan/logo-right ────────────────────────────

router.delete("/admin/settings/challan/logo-right", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db
      .update(challanSettingsTable)
      .set({ logo_url_right: null } as any)
      .where(eq(challanSettingsTable.tenantId, tenantId));
    return res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "challan-logo-right delete error");
    return res.status(500).json({ error: "Failed to remove right logo" });
  }
});

export default router;
