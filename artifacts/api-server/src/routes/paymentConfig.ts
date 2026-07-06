import { Router, type IRouter, type Request, type Response } from "express";
import { db, admissionPaymentConfigTable, PAYMENT_CONFIG_DEFAULTS } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth.js";
import { publicTenant, getAdminTenantId } from "../lib/tenant.js";
import {
  resolvePaymentConfig,
  invalidatePaymentConfigCache,
} from "../lib/payment-config-cache.js";

const router: IRouter = Router();

// ── GET /admin/admissions/payment-config ──────────────────────────────────────
router.get("/admin/admissions/payment-config", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
    const config = await resolvePaymentConfig(tenantId);
    return res.json(config);
  } catch (err) {
    req.log?.error?.({ err }, "Failed to load payment config");
    return res.status(500).json({ error: "Failed to load payment config" });
  }
});

// ── PUT /admin/admissions/payment-config ──────────────────────────────────────
router.put("/admin/admissions/payment-config", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const body = req.body as Record<string, unknown>;

    const appFee = body.applicationFeeAmount as number | undefined;
    const admFee = body.admissionFeeAmount  as number | undefined;

    if (appFee !== undefined && (!Number.isInteger(appFee) || appFee <= 0 || appFee > 9_999_999)) {
      return res.status(400).json({ error: "applicationFeeAmount must be a positive integer ≤ 9,999,999" });
    }
    if (admFee !== undefined && (!Number.isInteger(admFee) || admFee <= 0 || admFee > 9_999_999)) {
      return res.status(400).json({ error: "admissionFeeAmount must be a positive integer ≤ 9,999,999" });
    }

    const values = {
      tenantId,
      applicationFeeEnabled:  (body.applicationFeeEnabled  as boolean | undefined) ?? PAYMENT_CONFIG_DEFAULTS.applicationFeeEnabled,
      applicationFeeAmount:   appFee  ?? PAYMENT_CONFIG_DEFAULTS.applicationFeeAmount,
      admissionFeeAmount:     admFee  ?? PAYMENT_CONFIG_DEFAULTS.admissionFeeAmount,
      bankName:               (body.bankName               as string | undefined) ?? PAYMENT_CONFIG_DEFAULTS.bankName,
      bankBranch:             (body.bankBranch             as string | undefined) ?? PAYMENT_CONFIG_DEFAULTS.bankBranch,
      accountTitle:           (body.accountTitle           as string | undefined) ?? PAYMENT_CONFIG_DEFAULTS.accountTitle,
      accountNumber:          (body.accountNumber          as string | undefined) ?? PAYMENT_CONFIG_DEFAULTS.accountNumber,
      challanInstructions:    (body.challanInstructions    as string | undefined) ?? PAYMENT_CONFIG_DEFAULTS.challanInstructions,
      enableBankDeposit:      (body.enableBankDeposit      as boolean | undefined) ?? PAYMENT_CONFIG_DEFAULTS.enableBankDeposit,
      enableJazzcash:         (body.enableJazzcash         as boolean | undefined) ?? PAYMENT_CONFIG_DEFAULTS.enableJazzcash,
      enablePayfast:          (body.enablePayfast          as boolean | undefined) ?? PAYMENT_CONFIG_DEFAULTS.enablePayfast,
    };

    await db
      .insert(admissionPaymentConfigTable)
      .values(values)
      .onConflictDoUpdate({
        target: admissionPaymentConfigTable.tenantId,
        set: {
          applicationFeeEnabled:  values.applicationFeeEnabled,
          applicationFeeAmount:   values.applicationFeeAmount,
          admissionFeeAmount:     values.admissionFeeAmount,
          bankName:               values.bankName,
          bankBranch:             values.bankBranch,
          accountTitle:           values.accountTitle,
          accountNumber:          values.accountNumber,
          challanInstructions:    values.challanInstructions,
          enableBankDeposit:      values.enableBankDeposit,
          enableJazzcash:         values.enableJazzcash,
          enablePayfast:          values.enablePayfast,
          updatedAt:              new Date(),
        },
      });

    invalidatePaymentConfigCache(tenantId);
    const updated = await resolvePaymentConfig(tenantId);
    return res.json(updated);
  } catch (err) {
    req.log?.error?.({ err }, "Failed to update payment config");
    return res.status(500).json({ error: "Failed to update payment config" });
  }
});

// ── GET /website/admissions/payment-config ────────────────────────────────────
// Public — no auth required. Returns amounts + payment method flags.
// Cache-Control: 60 s so the CDN/browser can cache it briefly.
router.get("/website/admissions/payment-config", publicTenant, async (req: Request, res: Response) => {
  try {
    const tenantId: string | null = (req as any).tenantId ?? null;
    res.setHeader("Cache-Control", "public, max-age=60");

    if (!tenantId) {
      return res.json({ ...PAYMENT_CONFIG_DEFAULTS });
    }

    const config = await resolvePaymentConfig(tenantId);
    return res.json(config);
  } catch (err) {
    req.log?.error?.({ err }, "Failed to load public payment config");
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.json({ ...PAYMENT_CONFIG_DEFAULTS });
  }
});

export default router;
