import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/admin-auth";
import { createAndPostJE } from "../lib/je-factory";
import { getAdminTenantId } from "../lib/tenant";

const router = Router();

// ── DB bootstrap ─────────────────────────────────────────────────────────────

export async function migrateVendorBills(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_bills (
      id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID,
      bill_number     TEXT          NOT NULL,
      vendor_id       UUID,
      vendor_name     TEXT          NOT NULL,
      bill_ref        TEXT,
      bill_date       DATE          NOT NULL,
      due_date        DATE,
      description     TEXT,
      notes           TEXT,
      total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
      paid_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
      status          TEXT          NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft','unpaid','partially_paid','paid','void')),
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_bill_lines (
      id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      bill_id         UUID          NOT NULL REFERENCES vendor_bills(id) ON DELETE CASCADE,
      description     TEXT,
      quantity        NUMERIC(10,3) NOT NULL DEFAULT 1,
      unit_price      NUMERIC(14,2) NOT NULL DEFAULT 0,
      amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
      coa_id          UUID,
      coa_name        TEXT,
      sort_order      INT           NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_bill_payments (
      id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      bill_id           UUID          NOT NULL REFERENCES vendor_bills(id) ON DELETE CASCADE,
      payment_date      DATE          NOT NULL,
      amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
      bank_account_id   UUID,
      bank_account_name TEXT,
      reference         TEXT,
      notes             TEXT,
      je_id             UUID,
      created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  // Add tenant_id to existing vendor_bills table if missing
  await pool.query(`ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS tenant_id UUID`);
  await pool.query(`CREATE INDEX IF NOT EXISTS vendor_bills_tenant_idx ON vendor_bills(tenant_id)`);
}

/**
 * Idempotent migration for vendors tenant scoping.
 * Must run AFTER migrateTenants() so the CCM tenant row exists for backfill.
 */
export async function migrateVendors(): Promise<void> {
  // Add tenant_id column to vendors (no FK to avoid ordering issues)
  await pool.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tenant_id UUID`);
  await pool.query(`CREATE INDEX IF NOT EXISTS vendors_tenant_idx ON vendors(tenant_id)`);
  // Drop old single-column unique index if it exists
  await pool.query(`DROP INDEX IF EXISTS vendors_code_unique`);
  // Create compound unique index (tenant_id, vendor_code)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS vendors_tenant_code_unique ON vendors(tenant_id, vendor_code)
  `);
  // Backfill existing vendors + bills to the CCM tenant
  await pool.query(`
    UPDATE vendors
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1)
    WHERE tenant_id IS NULL
  `);
  await pool.query(`
    UPDATE vendor_bills
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1)
    WHERE tenant_id IS NULL
  `);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function nextBillNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear().toString();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM vendor_bills WHERE tenant_id = $1::uuid AND EXTRACT(YEAR FROM bill_date) = $2`,
    [tenantId, year],
  );
  const seq = Number((rows[0] as any)?.n ?? 0) + 1;
  return `VB-${year}-${String(seq).padStart(3, "0")}`;
}

async function hydrateBill(row: any): Promise<any> {
  const [lines, payments] = await Promise.all([
    pool.query(`SELECT * FROM vendor_bill_lines WHERE bill_id = $1 ORDER BY sort_order, id`, [row.id]),
    pool.query(`SELECT * FROM vendor_bill_payments WHERE bill_id = $1 ORDER BY payment_date, created_at`, [row.id]),
  ]);
  return { ...row, lines: lines.rows, payments: payments.rows };
}

// ── List ──────────────────────────────────────────────────────────────────────
// GET /admin/vendor-bills?status=&vendorId=&dateFrom=&dateTo=&page=&pageSize=

router.get("/admin/vendor-bills", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, vendorId, dateFrom, dateTo, page, pageSize } = req.query as Record<string, string>;

    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });

    const pg = Math.max(1, parseInt(page ?? "1", 10));
    const ps = Math.min(200, Math.max(1, parseInt(pageSize ?? "50", 10)));
    const offset = (pg - 1) * ps;

    const params: unknown[] = [tenantId];
    const conds: string[] = [`b.tenant_id = $1::uuid`];

    if (status)   { params.push(status);   conds.push(`b.status = $${params.length}`); }
    if (vendorId) { params.push(vendorId); conds.push(`b.vendor_id = $${params.length}::uuid`); }
    if (dateFrom) { params.push(dateFrom); conds.push(`b.bill_date >= $${params.length}::date`); }
    if (dateTo)   { params.push(dateTo);   conds.push(`b.bill_date <= $${params.length}::date`); }

    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM vendor_bills b ${where}`,
      params,
    );
    const total = Number((countRes.rows[0] as any)?.n ?? 0);

    const rowParams = [...params, ps, offset];
    const limitIdx  = rowParams.length - 1;
    const offsetIdx = rowParams.length;

    const rows = await pool.query(`
      SELECT b.*
      FROM vendor_bills b
      ${where}
      ORDER BY b.bill_date DESC, b.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, rowParams);

    return res.json({ total, page: pg, pageSize: ps, rows: rows.rows });
  } catch (err) {
    req.log.error({ err }, "Failed to list vendor bills");
    return res.status(500).json({ error: "Failed to load vendor bills" });
  }
});

// ── Get one ───────────────────────────────────────────────────────────────────
// GET /admin/vendor-bills/:id

router.get("/admin/vendor-bills/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
    const { rows } = await pool.query(
      `SELECT * FROM vendor_bills WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [req.params.id, tenantId],
    );
    if (!rows.length) return res.status(404).json({ error: "Bill not found" });
    return res.json(await hydrateBill(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to get vendor bill");
    return res.status(500).json({ error: "Failed to get vendor bill" });
  }
});

// ── Create (draft) ────────────────────────────────────────────────────────────
// POST /admin/vendor-bills

router.post("/admin/vendor-bills", requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      vendorId, vendorName, billRef, billDate, dueDate,
      description, notes, lines = [],
    } = req.body ?? {};

    if (!vendorName) return res.status(400).json({ error: "vendorName is required" });
    if (!billDate)   return res.status(400).json({ error: "billDate is required" });

    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
    const billNumber = await nextBillNumber(tenantId);
    const totalAmount = (lines as any[]).reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const bRes = await client.query(`
        INSERT INTO vendor_bills
          (tenant_id, bill_number, vendor_id, vendor_name, bill_ref, bill_date, due_date,
           description, notes, total_amount, status)
        VALUES ($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9,$10,'draft')
        RETURNING *
      `, [
        tenantId,
        billNumber,
        typeof vendorId === "string" && vendorId ? vendorId : null,
        String(vendorName).trim(),
        typeof billRef === "string" && billRef.trim() ? billRef.trim() : null,
        String(billDate).slice(0, 10),
        typeof dueDate === "string" && dueDate ? dueDate.slice(0, 10) : null,
        typeof description === "string" && description.trim() ? description.trim() : null,
        typeof notes === "string" && notes.trim() ? notes.trim() : null,
        totalAmount,
      ]);
      const bill = bRes.rows[0] as any;

      for (let i = 0; i < (lines as any[]).length; i++) {
        const l = (lines as any[])[i];
        const qty   = Number(l.quantity) || 1;
        const price = Number(l.unitPrice) || 0;
        const amt   = Number(l.amount) || qty * price;
        await client.query(`
          INSERT INTO vendor_bill_lines
            (bill_id, description, quantity, unit_price, amount, coa_id, coa_name, sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, [
          bill.id,
          typeof l.description === "string" ? l.description.trim() || null : null,
          qty, price, amt,
          typeof l.coaId === "string" && l.coaId ? l.coaId : null,
          typeof l.coaName === "string" ? l.coaName : null,
          i,
        ]);
      }

      await client.query("COMMIT");
      return res.status(201).json(await hydrateBill(bill));
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    req.log.error({ err }, "Failed to create vendor bill");
    return res.status(400).json({ error: err?.message ?? "Failed to create vendor bill" });
  }
});

// ── Update (draft only) ───────────────────────────────────────────────────────
// PATCH /admin/vendor-bills/:id

router.patch("/admin/vendor-bills/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
    const existing = await pool.query(
      `SELECT * FROM vendor_bills WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [id, tenantId],
    );
    if (!existing.rows.length) return res.status(404).json({ error: "Bill not found" });
    if ((existing.rows[0] as any).status !== "draft")
      return res.status(409).json({ error: "Only draft bills can be edited" });

    const {
      vendorId, vendorName, billRef, billDate, dueDate,
      description, notes, lines,
    } = req.body ?? {};

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const sets: string[] = ["updated_at = NOW()"];
      const params: unknown[] = [];
      function add(col: string, val: unknown) { params.push(val); sets.push(`${col} = $${params.length}`); }

      if (typeof vendorId      === "string") add("vendor_id",   vendorId || null);
      if (typeof vendorName    === "string") add("vendor_name", vendorName.trim());
      if (typeof billRef       === "string") add("bill_ref",    billRef.trim() || null);
      if (typeof billDate      === "string") add("bill_date",   billDate.slice(0, 10));
      if (typeof dueDate       === "string") add("due_date",    dueDate ? dueDate.slice(0, 10) : null);
      if (typeof description   === "string") add("description", description.trim() || null);
      if (typeof notes         === "string") add("notes",       notes.trim() || null);

      if (Array.isArray(lines)) {
        const totalAmount = lines.reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
        add("total_amount", totalAmount);
      }

      params.push(id);
      await client.query(
        `UPDATE vendor_bills SET ${sets.join(", ")} WHERE id = $${params.length}::uuid`,
        params,
      );

      if (Array.isArray(lines)) {
        await client.query(`DELETE FROM vendor_bill_lines WHERE bill_id = $1::uuid`, [id]);
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          const qty   = Number(l.quantity) || 1;
          const price = Number(l.unitPrice) || 0;
          const amt   = Number(l.amount) || qty * price;
          await client.query(`
            INSERT INTO vendor_bill_lines
              (bill_id, description, quantity, unit_price, amount, coa_id, coa_name, sort_order)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `, [
            id,
            typeof l.description === "string" ? l.description.trim() || null : null,
            qty, price, amt,
            typeof l.coaId === "string" && l.coaId ? l.coaId : null,
            typeof l.coaName === "string" ? l.coaName : null,
            i,
          ]);
        }
      }

      await client.query("COMMIT");
      const updated = await pool.query(`SELECT * FROM vendor_bills WHERE id = $1::uuid`, [id]);
      return res.json(await hydrateBill(updated.rows[0]));
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    req.log.error({ err }, "Failed to update vendor bill");
    return res.status(400).json({ error: err?.message ?? "Failed to update vendor bill" });
  }
});

// ── Post (draft → unpaid, creates JE) ────────────────────────────────────────
// POST /admin/vendor-bills/:id/post
//
// JE: Dr each expense line account  Cr vendor AP account

router.post("/admin/vendor-bills/:id/post", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
    const bRes = await pool.query(
      `SELECT * FROM vendor_bills WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [id, tenantId],
    );
    if (!bRes.rows.length) return res.status(404).json({ error: "Bill not found" });
    const bill = bRes.rows[0] as any;
    if (bill.status !== "draft") return res.status(409).json({ error: "Only draft bills can be posted" });

    const linesRes = await pool.query(
      `SELECT * FROM vendor_bill_lines WHERE bill_id = $1 ORDER BY sort_order`, [id],
    );
    const lines = linesRes.rows as any[];

    if (!lines.length) return res.status(400).json({ error: "At least one line item is required" });

    const totalAmount = lines.reduce((s: number, l: any) => s + Number(l.amount), 0);
    if (totalAmount <= 0) return res.status(400).json({ error: "Bill total must be positive" });

    // All lines must have a COA expense account
    for (const l of lines) {
      if (!l.coa_id) return res.status(400).json({ error: `Line "${l.description ?? "(no desc)"}" must have an account assigned` });
    }

    // Get vendor AP account
    let apCoaId: string | null = null;
    let apCoaCode = "AP";
    let apCoaName = bill.vendor_name;

    if (bill.vendor_id) {
      const vendorRes = await pool.query(
        `SELECT v.coa_id, ca.code, ca.name
         FROM vendors v
         LEFT JOIN chart_of_accounts ca ON ca.id = v.coa_id
         WHERE v.id = $1::uuid LIMIT 1`,
        [bill.vendor_id],
      );
      const v = vendorRes.rows[0] as any;
      if (v?.coa_id) {
        apCoaId   = v.coa_id;
        apCoaCode = v.code ?? "AP";
        apCoaName = v.name ?? bill.vendor_name;
      }
    }

    if (!apCoaId) {
      // Try to find a generic AP account in COA
      const apRes = await pool.query(
        `SELECT id, code, name FROM chart_of_accounts WHERE type = 'liability' AND LOWER(name) LIKE '%payable%' ORDER BY code LIMIT 1`,
      );
      if (apRes.rows.length) {
        const ap = apRes.rows[0] as any;
        apCoaId   = ap.id;
        apCoaCode = ap.code;
        apCoaName = ap.name;
      }
    }

    if (!apCoaId) {
      return res.status(400).json({
        error: "Vendor does not have an Accounts Payable account linked. Assign the vendor to a COA account first.",
      });
    }

    // Build JE lines: Dr expense per line, Cr AP total
    const debitLines = await Promise.all(lines.map(async (l) => {
      const coaRes = await pool.query(
        `SELECT id, code, name FROM chart_of_accounts WHERE id = $1::uuid`, [l.coa_id],
      );
      const coa = coaRes.rows[0] as any;
      return {
        coaId:        coa?.id   ?? l.coa_id,
        coaCode:      coa?.code ?? "???",
        coaName:      coa?.name ?? l.coa_name ?? "",
        debitAmount:  Number(l.amount),
        creditAmount: 0,
        narration:    l.description ?? undefined,
      };
    }));

    const creditLine = {
      coaId:        apCoaId,
      coaCode:      apCoaCode,
      coaName:      apCoaName,
      debitAmount:  0,
      creditAmount: totalAmount,
      narration:    `Bill ${bill.bill_number}`,
    };

    await createAndPostJE({
      date:         String(bill.bill_date).slice(0, 10),
      description:  `Vendor Bill — ${bill.bill_number} (${bill.vendor_name})`,
      reference:    bill.bill_ref ?? bill.bill_number,
      sourceModule: "vendor-bill",
      sourceRefId:  `${id}-post`,
      notes:        bill.description ?? null,
      lines:        [...debitLines, creditLine],
    });

    const updated = await pool.query(`
      UPDATE vendor_bills SET status = 'unpaid', updated_at = NOW()
      WHERE id = $1::uuid RETURNING *
    `, [id]);

    return res.json(await hydrateBill(updated.rows[0]));
  } catch (err: any) {
    req.log.error({ err }, "Failed to post vendor bill");
    return res.status(400).json({ error: err?.message ?? "Failed to post vendor bill" });
  }
});

// ── Pay ───────────────────────────────────────────────────────────────────────
// POST /admin/vendor-bills/:id/pay
// Body: { paymentDate, amount, bankAccountId, reference?, notes? }
//
// JE: Dr vendor AP  Cr bank/cash account

router.post("/admin/vendor-bills/:id/pay", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
    const bRes = await pool.query(
      `SELECT * FROM vendor_bills WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [id, tenantId],
    );
    if (!bRes.rows.length) return res.status(404).json({ error: "Bill not found" });
    const bill = bRes.rows[0] as any;

    if (!["unpaid", "partially_paid"].includes(bill.status))
      return res.status(409).json({ error: "Only unpaid or partially paid bills can be paid" });

    const { paymentDate, amount, bankAccountId, reference, notes } = req.body ?? {};
    if (!paymentDate) return res.status(400).json({ error: "paymentDate is required" });
    if (!bankAccountId) return res.status(400).json({ error: "bankAccountId is required" });

    const payAmt = Number(amount);
    if (!payAmt || payAmt <= 0) return res.status(400).json({ error: "amount must be a positive number" });

    const remaining = Number(bill.total_amount) - Number(bill.paid_amount);
    if (payAmt > remaining + 0.01)
      return res.status(400).json({ error: `Payment amount Rs ${payAmt} exceeds remaining balance Rs ${remaining.toFixed(2)}` });

    // Resolve bank account COA
    const baRes = await pool.query(
      `SELECT ba.account_title, ba.coa_id, ca.code, ca.name
       FROM bank_accounts ba
       LEFT JOIN chart_of_accounts ca ON ca.id = ba.coa_id
       WHERE ba.id = $1::uuid`,
      [bankAccountId],
    );
    if (!baRes.rows.length) return res.status(400).json({ error: "Bank account not found" });
    const ba = baRes.rows[0] as any;
    if (!ba.coa_id) return res.status(400).json({ error: `Bank account "${ba.account_title}" is not linked to a COA account` });

    // Resolve vendor AP account
    let apCoaId: string | null = null;
    let apCoaCode = "AP";
    let apCoaName = bill.vendor_name;

    if (bill.vendor_id) {
      const vendorRes = await pool.query(
        `SELECT v.coa_id, ca.code, ca.name
         FROM vendors v
         LEFT JOIN chart_of_accounts ca ON ca.id = v.coa_id
         WHERE v.id = $1::uuid LIMIT 1`,
        [bill.vendor_id],
      );
      const v = vendorRes.rows[0] as any;
      if (v?.coa_id) {
        apCoaId   = v.coa_id;
        apCoaCode = v.code ?? "AP";
        apCoaName = v.name ?? bill.vendor_name;
      }
    }

    if (!apCoaId) {
      const apRes = await pool.query(
        `SELECT id, code, name FROM chart_of_accounts WHERE type = 'liability' AND LOWER(name) LIKE '%payable%' ORDER BY code LIMIT 1`,
      );
      if (apRes.rows.length) {
        const ap = apRes.rows[0] as any;
        apCoaId = ap.id; apCoaCode = ap.code; apCoaName = ap.name;
      }
    }

    if (!apCoaId) {
      return res.status(400).json({ error: "Vendor AP account not found. Link vendor to a COA account first." });
    }

    const newPaid  = Number(bill.paid_amount) + payAmt;
    const newStatus = newPaid >= Number(bill.total_amount) - 0.01 ? "paid" : "partially_paid";
    const paymentId = (await pool.query(`SELECT gen_random_uuid() AS id`)).rows[0].id as string;

    const je = await createAndPostJE({
      date:         String(paymentDate).slice(0, 10),
      description:  `Bill Payment — ${bill.bill_number} (${bill.vendor_name})`,
      reference:    typeof reference === "string" && reference.trim() ? reference.trim() : bill.bill_number,
      sourceModule: "vendor-bill-pay",
      sourceRefId:  `${id}-pay-${paymentId}`,
      notes:        typeof notes === "string" && notes.trim() ? notes.trim() : null,
      lines: [
        {
          coaId:        apCoaId,
          coaCode:      apCoaCode,
          coaName:      apCoaName,
          debitAmount:  payAmt,
          creditAmount: 0,
          narration:    `Payment for ${bill.bill_number}`,
        },
        {
          coaId:        ba.coa_id,
          coaCode:      ba.code,
          coaName:      ba.name,
          debitAmount:  0,
          creditAmount: payAmt,
          narration:    typeof reference === "string" && reference.trim() ? reference.trim() : undefined,
        },
      ],
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(`
        INSERT INTO vendor_bill_payments
          (id, bill_id, payment_date, amount, bank_account_id, bank_account_name, reference, notes, je_id)
        VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9)
      `, [
        paymentId,
        id,
        String(paymentDate).slice(0, 10),
        payAmt,
        bankAccountId,
        ba.account_title,
        typeof reference === "string" && reference.trim() ? reference.trim() : null,
        typeof notes === "string" && notes.trim() ? notes.trim() : null,
        je ?? null,
      ]);

      await client.query(`
        UPDATE vendor_bills
        SET paid_amount = $1, status = $2, updated_at = NOW()
        WHERE id = $3::uuid
      `, [newPaid, newStatus, id]);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const updated = await pool.query(`SELECT * FROM vendor_bills WHERE id = $1::uuid`, [id]);
    return res.json(await hydrateBill(updated.rows[0]));
  } catch (err: any) {
    req.log.error({ err }, "Failed to record vendor bill payment");
    return res.status(400).json({ error: err?.message ?? "Failed to record payment" });
  }
});

// ── Void ──────────────────────────────────────────────────────────────────────
// POST /admin/vendor-bills/:id/void

router.post("/admin/vendor-bills/:id/void", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
    const { rows } = await pool.query(
      `UPDATE vendor_bills SET status = 'void', updated_at = NOW()
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND status NOT IN ('void') RETURNING *`,
      [req.params.id, tenantId],
    );
    if (!rows.length) return res.status(404).json({ error: "Bill not found or already voided" });
    return res.json(rows[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to void vendor bill");
    return res.status(500).json({ error: "Failed to void vendor bill" });
  }
});

// ── Delete (draft only) ───────────────────────────────────────────────────────
// DELETE /admin/vendor-bills/:id

router.delete("/admin/vendor-bills/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
    const check = await pool.query(
      `SELECT status FROM vendor_bills WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [id, tenantId],
    );
    if (!check.rows.length) return res.status(404).json({ error: "Bill not found" });
    if ((check.rows[0] as any).status !== "draft")
      return res.status(409).json({ error: "Only draft bills can be deleted" });
    await pool.query(`DELETE FROM vendor_bills WHERE id = $1::uuid`, [id]);
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete vendor bill");
    return res.status(500).json({ error: "Failed to delete vendor bill" });
  }
});

export default router;
