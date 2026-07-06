import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireRole, hasModuleRole } from "../lib/admin-auth";
import { insertJEWithinTransaction, coaById } from "../lib/je-factory";
import { getAdminTenantId } from "../lib/tenant";

const router = Router();

// ── DB bootstrap ──────────────────────────────────────────────────────────────

export async function migrateVouchers(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vouchers (
      id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id             UUID,
      voucher_type          TEXT          NOT NULL
                                          CHECK (voucher_type IN ('receipt','payment')),
      status                TEXT          NOT NULL DEFAULT 'draft'
                                          CHECK (status IN ('draft','posted')),
      voucher_no            TEXT          NOT NULL,
      date                  DATE          NOT NULL,
      cash_bank_account_id  UUID,
      narration             TEXT,
      journal_entry_id      UUID,
      posted_at             TIMESTAMPTZ,
      created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS voucher_rows (
      id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      voucher_id  UUID          NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
      account_id  UUID,
      ref         TEXT,
      amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
      sort_order  INTEGER       NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS vouchers_tenant_idx ON vouchers(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS vouchers_type_idx   ON vouchers(voucher_type)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS vouchers_status_idx ON vouchers(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS voucher_rows_voucher_idx ON voucher_rows(voucher_id)`);
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

type VoucherType = "receipt" | "payment";

interface RowInput { accountId: string | null; ref: string | null; amount: number; }

function cleanRows(raw: unknown): RowInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const accountId = typeof o.accountId === "string" && o.accountId ? o.accountId : null;
      const ref = typeof o.ref === "string" && o.ref.trim() ? o.ref.trim() : null;
      const amount = Number(o.amount);
      return { accountId, ref, amount: Number.isFinite(amount) ? amount : 0 };
    })
    // Keep only rows that have any content (account or amount) — blank trailing rows dropped.
    .filter((r) => r.accountId !== null || r.amount !== 0 || r.ref !== null);
}

/** Generate the next per-tenant, per-type voucher number e.g. RV-0001 / PV-0001. */
async function nextVoucherNo(tenantId: string, type: VoucherType): Promise<string> {
  const prefix = type === "receipt" ? "RV" : "PV";
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM vouchers WHERE tenant_id = $1::uuid AND voucher_type = $2`,
    [tenantId, type],
  );
  const n = Number((r.rows[0] as any)?.n ?? 0) + 1;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

async function loadVoucher(id: string, tenantId: string) {
  const head = await pool.query(`
    SELECT
      v.id, v.voucher_type, v.status, v.voucher_no, v.date,
      v.cash_bank_account_id, v.narration, v.journal_entry_id,
      v.posted_at, v.created_at, v.updated_at, v.created_by,
      ca.code AS cash_bank_code, ca.name AS cash_bank_name
    FROM vouchers v
    LEFT JOIN chart_of_accounts ca ON ca.id = v.cash_bank_account_id
    WHERE v.id = $1::uuid AND v.tenant_id = $2::uuid
    LIMIT 1
  `, [id, tenantId]);
  if (!head.rows.length) return null;

  const rows = await pool.query(`
    SELECT
      r.id, r.account_id, r.ref, r.amount, r.sort_order,
      ca.code AS account_code, ca.name AS account_name
    FROM voucher_rows r
    LEFT JOIN chart_of_accounts ca ON ca.id = r.account_id
    WHERE r.voucher_id = $1::uuid
    ORDER BY r.sort_order ASC, r.created_at ASC
  `, [id]);

  return { ...(head.rows[0] as any), rows: rows.rows };
}

async function replaceRows(voucherId: string, rows: RowInput[]): Promise<void> {
  await pool.query(`DELETE FROM voucher_rows WHERE voucher_id = $1::uuid`, [voucherId]);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    await pool.query(
      `INSERT INTO voucher_rows (voucher_id, account_id, ref, amount, sort_order)
       VALUES ($1::uuid, $2, $3, $4, $5)`,
      [voucherId, r.accountId, r.ref, r.amount, i],
    );
  }
}

// ── Account lookups ─────────────────────────────────────────────────────────────
// Lightweight dropdown sources so the frontend doesn't load the full COA tree.

router.get("/admin/accounts/cash-bank", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const r = await pool.query(`
      SELECT id, code, name, type, normal_balance, source_module
      FROM chart_of_accounts
      WHERE tenant_id = $1::uuid AND kind = 'ledger' AND is_active = true
        AND source_module = 'bank'
      ORDER BY code ASC
    `, [tenantId]);
    return res.json(r.rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list cash/bank accounts");
    return res.status(500).json({ error: "Failed to load cash/bank accounts" });
  }
});

async function ledgersByType(tenantId: string, type: "income" | "expense") {
  const r = await pool.query(`
    SELECT id, code, name, type, normal_balance
    FROM chart_of_accounts
    WHERE tenant_id = $1::uuid AND kind = 'ledger' AND is_active = true AND type = $2
    ORDER BY code ASC
  `, [tenantId, type]);
  return r.rows;
}

router.get("/admin/accounts/income", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    return res.json(await ledgersByType(tenantId, "income"));
  } catch (err) {
    req.log.error({ err }, "Failed to list income accounts");
    return res.status(500).json({ error: "Failed to load income accounts" });
  }
});

router.get("/admin/accounts/expense", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    return res.json(await ledgersByType(tenantId, "expense"));
  } catch (err) {
    req.log.error({ err }, "Failed to list expense accounts");
    return res.status(500).json({ error: "Failed to load expense accounts" });
  }
});

// ── List ────────────────────────────────────────────────────────────────────────
// GET /admin/vouchers?type=&status=&page=&pageSize=

router.get("/admin/vouchers", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const { type, status, page, pageSize } = req.query as Record<string, string>;
    const pg = Math.max(1, parseInt(page ?? "1", 10));
    const ps = Math.min(200, Math.max(1, parseInt(pageSize ?? "100", 10)));
    const offset = (pg - 1) * ps;

    const params: unknown[] = [tenantId];
    const conditions: string[] = [`v.tenant_id = $1::uuid`];
    if (type)   { params.push(type);   conditions.push(`v.voucher_type = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`v.status = $${params.length}`); }
    const where = `WHERE ${conditions.join(" AND ")}`;

    const countRes = await pool.query(`SELECT COUNT(*)::int AS n FROM vouchers v ${where}`, params);
    const total = Number((countRes.rows[0] as any)?.n ?? 0);

    const rowParams = [...params, ps, offset];
    const limitIdx  = rowParams.length - 1;
    const offsetIdx = rowParams.length;

    const rows = await pool.query(`
      SELECT
        v.id, v.voucher_type, v.status, v.voucher_no, v.date,
        v.cash_bank_account_id, v.narration, v.posted_at, v.created_at,
        ca.code AS cash_bank_code, ca.name AS cash_bank_name,
        COALESCE((SELECT SUM(amount) FROM voucher_rows r WHERE r.voucher_id = v.id), 0) AS total
      FROM vouchers v
      LEFT JOIN chart_of_accounts ca ON ca.id = v.cash_bank_account_id
      ${where}
      ORDER BY v.date DESC, v.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, rowParams);

    return res.json({ total, page: pg, pageSize: ps, rows: rows.rows });
  } catch (err) {
    req.log.error({ err }, "Failed to list vouchers");
    return res.status(500).json({ error: "Failed to load vouchers" });
  }
});

// ── Get one ──────────────────────────────────────────────────────────────────────
// GET /admin/vouchers/:id

router.get("/admin/vouchers/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const voucher = await loadVoucher(req.params.id as string, tenantId);
    if (!voucher) return res.status(404).json({ error: "Voucher not found" });
    return res.json(voucher);
  } catch (err) {
    req.log.error({ err }, "Failed to load voucher");
    return res.status(500).json({ error: "Failed to load voucher" });
  }
});

// ── Create draft ─────────────────────────────────────────────────────────────────
// POST /admin/vouchers/receipt  |  POST /admin/vouchers/payment

async function createDraft(type: VoucherType, req: Request, res: Response) {
  const tenantId = await requireTenantId(req, res);
  if (!tenantId) return;

  const { date, cashBankAccountId, narration, rows } = req.body ?? {};
  if (!date || typeof date !== "string") return res.status(400).json({ error: "date is required" });

  const cleanCashBank = typeof cashBankAccountId === "string" && cashBankAccountId ? cashBankAccountId : null;
  const cleanedRows = cleanRows(rows);
  const voucherNo = await nextVoucherNo(tenantId, type);

  const createdBy = (req as any).adminUser?.id ?? null;

  const ins = await pool.query(`
    INSERT INTO vouchers (tenant_id, voucher_type, status, voucher_no, date, cash_bank_account_id, narration, created_by)
    VALUES ($1::uuid, $2, 'draft', $3, $4::date, $5, $6, $7)
    RETURNING id
  `, [
    tenantId, type, voucherNo, date, cleanCashBank,
    typeof narration === "string" && narration.trim() ? narration.trim() : null,
    createdBy,
  ]);

  const id = (ins.rows[0] as any).id as string;
  await replaceRows(id, cleanedRows);

  const voucher = await loadVoucher(id, tenantId);
  return res.status(201).json(voucher);
}

router.post("/admin/vouchers/receipt", requireRole("finance", "draft"), async (req: Request, res: Response) => {
  try { return await createDraft("receipt", req, res); }
  catch (err: any) {
    req.log.error({ err }, "Failed to create receipt voucher");
    return res.status(400).json({ error: err?.message ?? "Failed to create voucher" });
  }
});

router.post("/admin/vouchers/payment", requireRole("finance", "draft"), async (req: Request, res: Response) => {
  try { return await createDraft("payment", req, res); }
  catch (err: any) {
    req.log.error({ err }, "Failed to create payment voucher");
    return res.status(400).json({ error: err?.message ?? "Failed to create voucher" });
  }
});

// ── Edit draft ───────────────────────────────────────────────────────────────────
// PUT /admin/vouchers/:id

router.put("/admin/vouchers/:id", requireRole("finance", "draft"), async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const id = req.params.id as string;
    const existing = await pool.query(
      `SELECT status FROM vouchers WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
      [id, tenantId],
    );
    if (!existing.rows.length) return res.status(404).json({ error: "Voucher not found" });
    if ((existing.rows[0] as any).status === "posted" && !hasModuleRole(req.adminUser!, "finance", "edit")) {
      return res.status(409).json({ error: "Posted vouchers are locked — only a Finance Director can edit them" });
    }

    const { date, cashBankAccountId, narration, rows } = req.body ?? {};
    const sets: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];
    function add(expr: string, val: unknown) { params.push(val); sets.push(`${expr} = $${params.length}`); }

    if (typeof date === "string" && date)            add("date", date);
    if ("cashBankAccountId" in (req.body ?? {}))     add("cash_bank_account_id", cashBankAccountId || null);
    if ("narration" in (req.body ?? {}))             add("narration", typeof narration === "string" && narration.trim() ? narration.trim() : null);

    params.push(id);
    params.push(tenantId);
    await pool.query(
      `UPDATE vouchers SET ${sets.join(", ")} WHERE id = $${params.length - 1}::uuid AND tenant_id = $${params.length}::uuid`,
      params,
    );

    if (Array.isArray(rows)) await replaceRows(id, cleanRows(rows));

    const voucher = await loadVoucher(id, tenantId);
    return res.json(voucher);
  } catch (err: any) {
    req.log.error({ err }, "Failed to update voucher");
    return res.status(400).json({ error: err?.message ?? "Failed to update voucher" });
  }
});

// ── Post JE ──────────────────────────────────────────────────────────────────────
// POST /admin/vouchers/:id/post
// Validates the draft, builds the double-entry, transitions to posted and locks it.

router.post("/admin/vouchers/:id/post", requireRole("finance", "post"), async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const id = req.params.id as string;
    const voucher = await loadVoucher(id, tenantId);
    if (!voucher) return res.status(404).json({ error: "Voucher not found" });
    if (voucher.status === "posted") {
      return res.status(409).json({ error: "Voucher is already posted" });
    }

    // Self-approval guard — maker cannot post their own voucher
    const checker = req.adminUser!;
    if (!checker.isSuperAdmin && voucher.created_by && voucher.created_by === checker.id) {
      return res.status(403).json({ error: "Self-approval not permitted — the person who created this voucher cannot post it" });
    }

    // ── Validation ────────────────────────────────────────────────────────────
    if (!voucher.cash_bank_account_id) {
      return res.status(400).json({ error: "Select a cash/bank account before posting" });
    }
    const rows = (voucher.rows as any[]).filter(
      (r) => r.account_id && Number(r.amount) > 0,
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: "Add at least one account row with a positive amount" });
    }
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    if (!(total > 0)) {
      return res.status(400).json({ error: "Voucher total must be greater than zero" });
    }

    const isReceipt = voucher.voucher_type === "receipt";

    // ── Build double-entry lines ──────────────────────────────────────────────
    // Receipt: Dr cash/bank (total), Cr each income row.
    // Payment: Dr each expense row, Cr cash/bank (total).
    const cashBankCoa = await coaById(voucher.cash_bank_account_id, tenantId);
    if (!cashBankCoa) {
      return res.status(400).json({
        error: "Cash/bank account not found in chart of accounts — configure the account in COA before posting",
      });
    }

    const lines: Array<{
      coaId: string; coaCode: string; coaName: string;
      debitAmount: number; creditAmount: number; narration?: string | null;
    }> = [];

    if (isReceipt) {
      lines.push({
        coaId: cashBankCoa.id, coaCode: cashBankCoa.code, coaName: cashBankCoa.name,
        debitAmount: total, creditAmount: 0, narration: voucher.narration,
      });
    }
    for (const r of rows) {
      const coa = await coaById(r.account_id as string, tenantId);
      if (!coa) continue;
      lines.push({
        coaId: coa.id, coaCode: coa.code, coaName: coa.name,
        debitAmount: isReceipt ? 0 : Number(r.amount),
        creditAmount: isReceipt ? Number(r.amount) : 0,
        narration: r.ref,
      });
    }
    if (!isReceipt) {
      lines.push({
        coaId: cashBankCoa.id, coaCode: cashBankCoa.code, coaName: cashBankCoa.name,
        debitAmount: 0, creditAmount: total, narration: voucher.narration,
      });
    }

    // ── Atomic: JE insert + voucher status update in one transaction ──────────
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let jeId: string | null = null;
      try {
        jeId = await insertJEWithinTransaction(client, {
          tenantId,
          date:         String(voucher.date).slice(0, 10),
          description:  `${isReceipt ? "Receipt" : "Payment"} Voucher ${voucher.voucher_no}`,
          reference:    voucher.voucher_no,
          sourceModule: isReceipt ? "receipt" : "payment",
          sourceRefId:  voucher.id,
          notes:        voucher.narration,
          lines,
        });
      } catch (jeErr: any) {
        if (jeErr?.code === "42P01") {
          // JE tables not yet migrated — tolerated on first boot; post without JE link
          req.log.warn("JE tables not available — posting voucher without JE link");
        } else {
          // Any other JE failure rolls back the transaction; voucher stays draft
          throw jeErr;
        }
      }

      await client.query(
        `UPDATE vouchers SET status = 'posted', posted_at = NOW(), updated_at = NOW(),
         journal_entry_id = $3
         WHERE id = $1::uuid AND tenant_id = $2::uuid`,
        [id, tenantId, jeId ?? null],
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const posted = await loadVoucher(id, tenantId);
    return res.json(posted);
  } catch (err: any) {
    req.log.error({ err }, "Failed to post voucher");
    return res.status(400).json({ error: err?.message ?? "Failed to post voucher" });
  }
});

// ── Unpost ───────────────────────────────────────────────────────────────────────
// POST /admin/vouchers/:id/unpost — reverses the post: voids the JE (if any) and
// returns the voucher to draft status so it can be edited or re-posted.

router.post("/admin/vouchers/:id/unpost", requireRole("finance", "post"), async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const id = req.params.id as string;

    const existing = await pool.query<{ status: string; journal_entry_id: string | null }>(
      `SELECT status, journal_entry_id FROM vouchers WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
      [id, tenantId],
    );
    if (!existing.rows.length) return res.status(404).json({ error: "Voucher not found" });

    const { status, journal_entry_id: jeId } = existing.rows[0];
    if (status !== "posted") {
      return res.status(409).json({ error: "Only posted vouchers can be unposted" });
    }

    // Void the linked JE if one exists
    if (jeId) {
      try {
        await pool.query(
          `UPDATE journal_entries SET is_voided = true, voided_at = NOW()
           WHERE id = $1::uuid AND tenant_id = $2::uuid`,
          [jeId, tenantId],
        );
      } catch (err: any) {
        if (err?.code !== "42P01") throw err;
        // JE table doesn't exist yet — nothing to void
      }
    }

    // Revert voucher to draft and clear linkage
    await pool.query(
      `UPDATE vouchers SET status = 'draft', posted_at = NULL, journal_entry_id = NULL, updated_at = NOW()
       WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [id, tenantId],
    );

    const reverted = await loadVoucher(id, tenantId);
    return res.json(reverted);
  } catch (err: any) {
    req.log.error({ err }, "Failed to unpost voucher");
    return res.status(400).json({ error: err?.message ?? "Failed to unpost voucher" });
  }
});

// ── Delete ────────────────────────────────────────────────────────────────────────
// DELETE /admin/vouchers/:id  (drafts only)

router.delete("/admin/vouchers/:id", requireRole("finance", "delete"), async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const existing = await pool.query(
      `SELECT status FROM vouchers WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
      [req.params.id as string, tenantId],
    );
    if (!existing.rows.length) return res.status(404).json({ error: "Voucher not found" });
    if ((existing.rows[0] as any).status === "posted" && !hasModuleRole(req.adminUser!, "finance", "edit")) {
      return res.status(409).json({ error: "Posted vouchers cannot be deleted — only a Finance Director can delete them" });
    }

    await pool.query(
      `DELETE FROM vouchers WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [req.params.id as string, tenantId],
    );
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete voucher");
    return res.status(500).json({ error: "Failed to delete voucher" });
  }
});

export default router;
