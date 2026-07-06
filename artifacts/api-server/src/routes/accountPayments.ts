import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/admin-auth";
import { tryCreateAndPostJE, coaById } from "../lib/je-factory";
import { getAdminTenantId } from "../lib/tenant";

const router = Router();

// ── DB bootstrap ──────────────────────────────────────────────────────────────

export async function migrateAccountPayments(): Promise<void> {
  // Create the table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_payments (
      id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID,
      date            DATE          NOT NULL,
      voucher_number  TEXT,
      payee           TEXT          NOT NULL,
      description     TEXT,
      amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
      status          TEXT          NOT NULL DEFAULT 'recorded'
                                    CHECK (status IN ('recorded','void')),
      bank_account_id UUID,
      coa_account_id  UUID,
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  // Add tenant_id column if missing (idempotent)
  await pool.query(`ALTER TABLE account_payments ADD COLUMN IF NOT EXISTS tenant_id UUID`);
  await pool.query(`CREATE INDEX IF NOT EXISTS account_payments_tenant_idx ON account_payments(tenant_id)`);

  // Backfill existing rows to the CCM tenant
  await pool.query(`
    UPDATE account_payments
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1)
    WHERE tenant_id IS NULL
  `);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fail-closed helper: returns tenantId or sends HTTP 400. */
async function requireTenantId(req: Request, res: Response): Promise<string | null> {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) {
    res.status(400).json({ error: "Tenant context required" });
    return null;
  }
  return tenantId;
}

// ── List ───────────────────────────────────────────────────────────────────────
// GET /admin/account-payments?dateFrom=&dateTo=&status=&bankAccountId=&page=&pageSize=

router.get("/admin/account-payments", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const { dateFrom, dateTo, status, bankAccountId, page, pageSize } = req.query as Record<string, string>;

    const pg = Math.max(1, parseInt(page ?? "1", 10));
    const ps = Math.min(200, Math.max(1, parseInt(pageSize ?? "50", 10)));
    const offset = (pg - 1) * ps;

    const params: unknown[] = [tenantId];
    const conditions: string[] = [`p.tenant_id = $1::uuid`];

    if (dateFrom)    { params.push(dateFrom);    conditions.push(`p.date >= $${params.length}::date`); }
    if (dateTo)      { params.push(dateTo);      conditions.push(`p.date <= $${params.length}::date`); }
    if (status)      { params.push(status);      conditions.push(`p.status = $${params.length}`); }
    if (bankAccountId) { params.push(bankAccountId); conditions.push(`p.bank_account_id = $${params.length}::uuid`); }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM account_payments p ${where}`,
      params,
    );
    const total = Number((countRes.rows[0] as any)?.n ?? 0);

    const rowParams = [...params, ps, offset];
    const limitIdx  = rowParams.length - 1;
    const offsetIdx = rowParams.length;

    const rows = await pool.query(`
      SELECT
        p.id, p.date, p.voucher_number, p.payee, p.description,
        p.amount, p.status, p.created_at,
        p.bank_account_id,
        ba.account_title  AS bank_account_title,
        ba.bank_name,
        ba.type           AS bank_account_type,
        p.coa_account_id,
        ca.code           AS coa_code,
        ca.name           AS coa_name
      FROM account_payments p
      LEFT JOIN bank_accounts     ba ON ba.id = p.bank_account_id
      LEFT JOIN chart_of_accounts ca ON ca.id = p.coa_account_id
      ${where}
      ORDER BY p.date DESC, p.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, rowParams);

    return res.json({ total, page: pg, pageSize: ps, rows: rows.rows });
  } catch (err) {
    req.log.error({ err }, "Failed to list account payments");
    return res.status(500).json({ error: "Failed to load payments" });
  }
});

// ── Summary ────────────────────────────────────────────────────────────────────
// GET /admin/account-payments/summary?month=YYYY-MM

router.get("/admin/account-payments/summary", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const { month } = req.query as Record<string, string>;

    const params: unknown[] = [tenantId];
    let where = `WHERE status = 'recorded' AND tenant_id = $1::uuid`;
    if (month) {
      params.push(month);
      where += ` AND TO_CHAR(date,'YYYY-MM') = $${params.length}`;
    }

    const res2 = await pool.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0) AS total FROM account_payments ${where}`,
      params,
    );
    const row = res2.rows[0] as any;
    return res.json({ count: Number(row?.count ?? 0), total: Number(row?.total ?? 0) });
  } catch (err) {
    req.log.error({ err }, "Failed to get payment summary");
    return res.status(500).json({ error: "Failed to load summary" });
  }
});

// ── Create ─────────────────────────────────────────────────────────────────────
// POST /admin/account-payments

router.post("/admin/account-payments", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const { date, voucherNumber, payee, description, amount, bankAccountId, coaAccountId } = req.body ?? {};

    if (!date || typeof date !== "string") return res.status(400).json({ error: "date is required" });
    if (!payee || typeof payee !== "string" || !payee.trim()) return res.status(400).json({ error: "payee is required" });
    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: "amount must be positive" });
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (date > todayUtc) return res.status(400).json({ error: "Payment date cannot be in the future", field: "date" });

    const cleanBankId = typeof bankAccountId === "string" && bankAccountId ? bankAccountId : null;
    const cleanCoaId  = typeof coaAccountId  === "string" && coaAccountId  ? coaAccountId  : null;

    const result = await pool.query(`
      INSERT INTO account_payments
        (tenant_id, date, voucher_number, payee, description, amount, bank_account_id, coa_account_id)
      VALUES ($1::uuid, $2::date, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      tenantId,
      date,
      typeof voucherNumber === "string" && voucherNumber.trim() ? voucherNumber.trim() : null,
      payee.trim(),
      typeof description === "string" && description.trim() ? description.trim() : null,
      amt,
      cleanBankId,
      cleanCoaId,
    ]);

    const payment = result.rows[0] as any;

    if (cleanBankId && cleanCoaId) {
      void (async () => {
        try {
          const bankCoaRow = await pool.query(
            `SELECT coa_id FROM bank_accounts WHERE id = $1::uuid LIMIT 1`,
            [cleanBankId],
          );
          const bankCoaId = (bankCoaRow.rows[0] as any)?.coa_id ?? null;
          if (!bankCoaId) return;

          const [debitCoa, creditCoa] = await Promise.all([coaById(cleanCoaId), coaById(bankCoaId)]);
          if (!debitCoa || !creditCoa) return;

          await tryCreateAndPostJE({
            date:         typeof date === "string" ? date.slice(0, 10) : new Date().toISOString().slice(0, 10),
            description:  `Payment — ${payee.trim()}${description ? `: ${description}` : ""}`,
            reference:    typeof voucherNumber === "string" && voucherNumber.trim() ? voucherNumber.trim() : payment.id,
            sourceModule: "vendor",
            sourceRefId:  payment.id,
            lines: [
              { coaId: debitCoa.id,  coaCode: debitCoa.code,  coaName: debitCoa.name,  debitAmount: amt, creditAmount: 0,   narration: `Payment to ${payee.trim()}` },
              { coaId: creditCoa.id, coaCode: creditCoa.code, coaName: creditCoa.name, debitAmount: 0,   creditAmount: amt, narration: `Bank disbursement` },
            ],
          }, req.log);
        } catch (err) {
          req.log.error({ err }, "[account-payment-je] failed for payment " + payment.id);
        }
      })();
    }

    return res.status(201).json(payment);
  } catch (err: any) {
    req.log.error({ err }, "Failed to create payment");
    return res.status(400).json({ error: err?.message ?? "Failed to create payment" });
  }
});

// ── Update ─────────────────────────────────────────────────────────────────────
// PATCH /admin/account-payments/:id

router.patch("/admin/account-payments/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const id = req.params.id as string;
    const { date, voucherNumber, payee, description, amount, bankAccountId, coaAccountId } = req.body ?? {};

    const sets: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];

    function add(expr: string, val: unknown) { params.push(val); sets.push(`${expr} = $${params.length}`); }

    if (typeof date          === "string")                       add("date",            date);
    if (typeof voucherNumber === "string")                       add("voucher_number",  voucherNumber.trim() || null);
    if (typeof payee         === "string" && payee.trim())       add("payee",           payee.trim());
    if (typeof description   === "string")                       add("description",     description.trim() || null);
    if (typeof amount        === "number" && amount > 0)         add("amount",          amount);
    if ("bankAccountId" in (req.body ?? {}))                     add("bank_account_id", bankAccountId || null);
    if ("coaAccountId"  in (req.body ?? {}))                     add("coa_account_id",  coaAccountId  || null);

    // Tenant-scoped update: both id AND tenant_id must match
    params.push(id);
    params.push(tenantId);
    const result = await pool.query(
      `UPDATE account_payments SET ${sets.join(", ")} WHERE id = $${params.length - 1}::uuid AND tenant_id = $${params.length}::uuid RETURNING *`,
      params,
    );

    if (!result.rows.length) return res.status(404).json({ error: "Payment not found" });
    return res.json(result.rows[0]);
  } catch (err: any) {
    req.log.error({ err }, "Failed to update payment");
    return res.status(400).json({ error: err?.message ?? "Failed to update" });
  }
});

// ── Void ──────────────────────────────────────────────────────────────────────
// POST /admin/account-payments/:id/void

router.post("/admin/account-payments/:id/void", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const result = await pool.query(
      `UPDATE account_payments SET status='void', updated_at=NOW() WHERE id=$1::uuid AND tenant_id=$2::uuid RETURNING *`,
      [req.params.id as string, tenantId],
    );
    if (!result.rows.length) return res.status(404).json({ error: "Payment not found" });
    return res.json(result.rows[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to void payment");
    return res.status(500).json({ error: "Failed to void payment" });
  }
});

// ── Delete ────────────────────────────────────────────────────────────────────
// DELETE /admin/account-payments/:id

router.delete("/admin/account-payments/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const result = await pool.query(
      `DELETE FROM account_payments WHERE id=$1::uuid AND tenant_id=$2::uuid RETURNING id`,
      [req.params.id as string, tenantId],
    );
    if (!result.rows.length) return res.status(404).json({ error: "Payment not found" });
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete payment");
    return res.status(500).json({ error: "Failed to delete payment" });
  }
});

export default router;
