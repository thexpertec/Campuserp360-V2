import { Router, type Request, type Response } from "express";
import { db, bankAccountsTable } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";
import { syncBankAccountCoa } from "../lib/coa-sync";

const router = Router();

// ── List ───────────────────────────────────────────────────────────────────────

router.get("/admin/bank-accounts", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const rows = await db
      .select()
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.tenantId, tenantId))
      .orderBy(asc(bankAccountsTable.sortOrder), asc(bankAccountsTable.type));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list bank accounts");
    return res.status(500).json({ error: "Failed to load bank accounts" });
  }
});

// ── Create ─────────────────────────────────────────────────────────────────────

router.post("/admin/bank-accounts", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { type, bankName, accountTitle, ibanNumber, notes, sortOrder } = req.body ?? {};

    if (type !== "cash" && type !== "bank") {
      return res.status(400).json({ error: "type must be 'cash' or 'bank'" });
    }
    if (!accountTitle || typeof accountTitle !== "string" || !accountTitle.trim()) {
      return res.status(400).json({ error: "accountTitle is required" });
    }

    const [created] = await db
      .insert(bankAccountsTable)
      .values({
        tenantId,
        type,
        bankName:     typeof bankName === "string"   && bankName.trim()   ? bankName.trim()   : null,
        accountTitle: accountTitle.trim(),
        ibanNumber:   typeof ibanNumber === "string" && ibanNumber.trim() ? ibanNumber.trim() : null,
        notes:        typeof notes === "string"      && notes.trim()      ? notes.trim()      : null,
        sortOrder:    typeof sortOrder === "number"  ? sortOrder          : 0,
      })
      .returning();

    void syncBankAccountCoa({
      id: created.id, type: created.type,
      accountTitle: created.accountTitle, bankName: created.bankName,
    }, tenantId);

    return res.status(201).json(created);
  } catch (err: any) {
    req.log.error({ err }, "Failed to create bank account");
    return res.status(400).json({ error: err?.message ?? "Failed to create account" });
  }
});

// ── Update ─────────────────────────────────────────────────────────────────────

router.patch("/admin/bank-accounts/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { type, bankName, accountTitle, ibanNumber, isActive, notes, sortOrder } = req.body ?? {};

    const patch: Record<string, any> = { updatedAt: new Date() };
    if (type === "cash" || type === "bank") patch.type = type;
    if (typeof bankName      === "string")  patch.bankName     = bankName.trim() || null;
    if (typeof accountTitle  === "string")  patch.accountTitle = accountTitle.trim();
    if (typeof ibanNumber    === "string")  patch.ibanNumber   = ibanNumber.trim() || null;
    if (typeof isActive      === "boolean") patch.isActive     = isActive;
    if (typeof notes         === "string")  patch.notes        = notes.trim() || null;
    if (typeof sortOrder     === "number")  patch.sortOrder    = sortOrder;

    const [updated] = await db
      .update(bankAccountsTable)
      .set(patch)
      .where(and(eq(bankAccountsTable.id, id), eq(bankAccountsTable.tenantId, tenantId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Account not found" });

    void syncBankAccountCoa({
      id: updated.id, type: updated.type,
      accountTitle: updated.accountTitle, bankName: updated.bankName,
    }, tenantId);

    return res.json(updated);
  } catch (err: any) {
    req.log.error({ err }, "Failed to update bank account");
    return res.status(400).json({ error: err?.message ?? "Failed to update account" });
  }
});

// ── Delete ─────────────────────────────────────────────────────────────────────

router.delete("/admin/bank-accounts/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const [deleted] = await db
      .delete(bankAccountsTable)
      .where(and(eq(bankAccountsTable.id, id), eq(bankAccountsTable.tenantId, tenantId)))
      .returning({ id: bankAccountsTable.id });

    if (!deleted) return res.status(404).json({ error: "Account not found" });
    return res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "23503") {
      return res.status(409).json({ error: "Cannot delete — this account has linked journal entries" });
    }
    req.log.error({ err }, "Failed to delete bank account");
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
