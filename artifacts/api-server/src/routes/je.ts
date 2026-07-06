import { Router, type Request, type Response } from "express";
import { db, pool } from "@workspace/db";
import { chartOfAccountsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAdmin, requireRole, realAdminUserId } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";
import { type JELine } from "../lib/je-factory";
import { z } from "zod/v4";

const router = Router();

// ── List ───────────────────────────────────────────────────────────────────────

router.get("/admin/journal-entries", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    // `limit` is accepted as an alias for pageSize — some callers (e.g. the
    // per-record JEViewerButton) want a short flat list rather than a paged one.
    const pg   = Math.max(1,   parseInt((req.query.page     as string) ?? "1",  10));
    const ps   = Math.min(100, parseInt(((req.query.pageSize ?? req.query.limit) as string) ?? "20", 10));
    const from = req.query.from as string | undefined;
    const to   = req.query.to   as string | undefined;
    const status = req.query.status as string | undefined;
    const sourceModule = req.query.sourceModule as string | undefined;
    const sourceRefId  = req.query.sourceRefId  as string | undefined;
    const reference    = req.query.reference    as string | undefined; // free-text search over narration + source ref

    const params: unknown[] = [tenantId];
    const clauses: string[] = [];
    if (from)   { params.push(from);   clauses.push(`je.date >= $${params.length}::date`); }
    if (to)     { params.push(to);     clauses.push(`je.date <= $${params.length}::date`); }
    if (status) { params.push(status); clauses.push(`je.status = $${params.length}`); }
    if (sourceModule) {
      if (sourceModule === "manual") {
        clauses.push(`(je.source_module IS NULL OR je.source_module = 'manual')`);
      } else {
        params.push(sourceModule); clauses.push(`je.source_module = $${params.length}`);
      }
    }
    if (sourceRefId) { params.push(sourceRefId); clauses.push(`je.source_ref_id = $${params.length}::uuid`); }
    if (reference) {
      params.push(`%${reference}%`);
      clauses.push(`(je.source_ref ILIKE $${params.length} OR je.narration ILIKE $${params.length})`);
    }
    const where = clauses.length ? `AND ${clauses.join(" AND ")}` : "";

    const countRes = await pool.query<{ n: string }>(`
      SELECT COUNT(*)::text AS n FROM journal_entries je
      WHERE je.tenant_id = $1::uuid ${where}
    `, params);
    const total = Number(countRes.rows[0]?.n ?? 0);

    const offset = (pg - 1) * ps;
    const rows = await pool.query(`
      SELECT
        je.id,
        je.date::text,
        je.narration,
        je.source_ref,
        je.source_ref_id,
        je.source_module,
        je.is_voided,
        je.status,
        je.created_by,
        je.approved_by,
        je.created_at,
        COALESCE(SUM(jel.dr_amount), 0)::text AS total_dr
      FROM journal_entries je
      LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      WHERE je.tenant_id = $1::uuid ${where}
      GROUP BY je.id
      ORDER BY je.date DESC, je.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, ps, offset]);

    return res.json({
      total,
      page:     pg,
      pageSize: ps,
      entries:  (rows.rows as any[]).map((r) => ({
        id:           r.id,
        date:         r.date,
        narration:    r.narration,
        sourceRef:    r.source_ref,
        sourceRefId:  r.source_ref_id,
        sourceModule: r.source_module,
        isVoided:     r.is_voided,
        status:       r.status ?? "posted",
        createdBy:    r.created_by,
        approvedBy:   r.approved_by,
        createdAt:    r.created_at,
        totalAmount:  Number(r.total_dr),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list journal entries");
    return res.status(500).json({ error: "Failed to load journal entries" });
  }
});

// ── Reverse lookup — find the JE posted for a given source record ─────────────
// Lets any source screen (application, fee challan, vendor bill, payroll tx,
// voucher, store tx…) ask "is there a journal entry for me?" and link to it,
// without every module needing its own bespoke JE-link plumbing.

router.get("/admin/journal-entries/by-source", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const sourceModule = req.query.module as string | undefined;
    const sourceRefId  = req.query.refId  as string | undefined;
    if (!sourceModule || !sourceRefId) {
      return res.status(400).json({ error: "module and refId are required" });
    }

    const r = await pool.query<{ id: string; is_voided: boolean; status: string }>(`
      SELECT id, is_voided, status FROM journal_entries
      WHERE tenant_id = $1::uuid AND source_module = $2 AND source_ref_id = $3::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `, [tenantId, sourceModule, sourceRefId]);

    if (!r.rows.length) return res.json({ id: null });
    return res.json({ id: r.rows[0].id, isVoided: r.rows[0].is_voided, status: r.rows[0].status });
  } catch (err) {
    req.log.error({ err }, "Failed to look up journal entry by source");
    return res.status(500).json({ error: "Failed to look up journal entry" });
  }
});

// ── Resolve a source ref back to a navigable record ────────────────────────────
// Lets the JE list/detail drill-through link to the *actual* originating record
// (student, employee, vendor) instead of just showing a label. Only modules
// whose source table stores a genuinely resolvable, addressable record are
// covered here — ad-hoc account payments (sourceModule "vendor") have no
// vendor_id on file (free-text payee) and stay label-only, matching how they
// already behaved before this endpoint existed.
router.get("/admin/journal-entries/resolve-source", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const sourceModule = req.query.module as string | undefined;
    const sourceRefId  = req.query.refId  as string | undefined;
    if (!sourceModule || !sourceRefId) {
      return res.status(400).json({ error: "module and refId are required" });
    }

    if (sourceModule === "fee-billed" || sourceModule === "fee") {
      const r = await pool.query<{ applicant_id: string; first_name: string; last_name: string }>(`
        SELECT s.applicant_id, s.first_name, s.last_name
        FROM fee_challans fc
        JOIN students s ON s.id = fc.student_id
        WHERE fc.id = $1::uuid AND fc.tenant_id = $2::uuid
        LIMIT 1
      `, [sourceRefId, tenantId]);
      if (!r.rows.length) return res.json({ kind: null });
      const row = r.rows[0];
      return res.json({ kind: "student", applicantId: row.applicant_id, label: `${row.first_name} ${row.last_name}` });
    }

    if (sourceModule === "vendor-bill" || sourceModule === "vendor-bill-pay") {
      // sourceRefId is synthetic: "<billId>-post" or "<billId>-pay-<paymentId>"
      const billId = sourceRefId.split("-post")[0]!.split("-pay-")[0]!;
      const r = await pool.query<{ vendor_id: string | null; vendor_name: string; bill_number: string }>(`
        SELECT vendor_id, vendor_name, bill_number FROM vendor_bills
        WHERE id = $1::uuid AND tenant_id = $2::uuid
        LIMIT 1
      `, [billId, tenantId]);
      if (!r.rows.length || !r.rows[0].vendor_id) return res.json({ kind: null });
      const row = r.rows[0];
      return res.json({ kind: "vendor", vendorId: row.vendor_id, label: `${row.vendor_name} — ${row.bill_number}` });
    }

    if (sourceModule === "payroll-expense" || sourceModule === "payroll-payment") {
      const r = await pool.query<{ staff_id: string; full_name: string }>(`
        SELECT e.staff_id, e.full_name
        FROM employee_salary_transactions t
        JOIN employees e ON e.id = t.employee_id
        WHERE t.id = $1::uuid AND e.tenant_id = $2::uuid
        LIMIT 1
      `, [sourceRefId, tenantId]);
      if (!r.rows.length) return res.json({ kind: null });
      const row = r.rows[0];
      return res.json({ kind: "employee", staffId: row.staff_id, label: row.full_name });
    }

    return res.json({ kind: null });
  } catch (err) {
    req.log.error({ err }, "Failed to resolve journal entry source");
    return res.status(500).json({ error: "Failed to resolve source" });
  }
});

// ── Get single ─────────────────────────────────────────────────────────────────

router.get("/admin/journal-entries/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const id = req.params.id as string;

    const jeRes = await pool.query(`
      SELECT id, date::text, narration, source_ref, source_ref_id, source_module, is_voided, status, created_by, approved_by, created_at
      FROM journal_entries WHERE id = $1::uuid AND tenant_id = $2::uuid
    `, [id, tenantId]);
    if (!jeRes.rows.length) return res.status(404).json({ error: "Not found" });
    const je = jeRes.rows[0] as any;

    const linesRes = await pool.query(`
      SELECT
        jel.id,
        jel.account_id,
        jel.dr_amount::text,
        jel.cr_amount::text,
        jel.memo,
        jel.sort_order,
        coa.code AS account_code,
        coa.name AS account_name
      FROM journal_entry_lines jel
      JOIN chart_of_accounts coa ON coa.id = jel.account_id
      WHERE jel.journal_entry_id = $1::uuid
      ORDER BY jel.sort_order
    `, [id]);

    return res.json({
      id:           je.id,
      date:         je.date,
      narration:    je.narration,
      sourceRef:    je.source_ref,
      sourceRefId:  je.source_ref_id,
      sourceModule: je.source_module,
      isVoided:     je.is_voided,
      status:       je.status ?? "posted",
      createdBy:    je.created_by,
      approvedBy:   je.approved_by,
      createdAt:    je.created_at,
      lines: (linesRes.rows as any[]).map((l) => ({
        id:          l.id,
        accountId:   l.account_id,
        accountCode: l.account_code,
        accountName: l.account_name,
        drAmount:    Number(l.dr_amount),
        crAmount:    Number(l.cr_amount),
        memo:        l.memo,
        sortOrder:   l.sort_order,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get journal entry");
    return res.status(500).json({ error: "Failed to load journal entry" });
  }
});

// ── Create (maker — saves as draft) ────────────────────────────────────────────

const JELineInputSchema = z.object({
  accountId: z.string().min(1),
  drAmount:  z.number().min(0),
  crAmount:  z.number().min(0),
  memo:      z.string().optional().nullable(),
});

const JEInputSchema = z.object({
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  narration: z.string().min(1, "Narration is required"),
  sourceRef: z.string().optional().nullable(),
  lines:     z.array(JELineInputSchema).min(2, "At least 2 lines required"),
});

router.post("/admin/journal-entries", requireRole("finance", "draft"), async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const parsed = JEInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const { date, narration, sourceRef, lines } = parsed.data;

    // ── Validate balance ────────────────────────────────────────────────────────
    const totalDr = lines.reduce((s, l) => s + l.drAmount, 0);
    const totalCr = lines.reduce((s, l) => s + l.crAmount, 0);
    if (Math.abs(totalDr - totalCr) > 0.001) {
      return res.status(400).json({ error: `JE is unbalanced — DR ${totalDr} ≠ CR ${totalCr}` });
    }

    // ── Validate and resolve each account ──────────────────────────────────────
    // Fetch every referenced account in a single query, then validate in memory
    // instead of one round-trip per line.
    const accountIds = [...new Set(lines.map(l => l.accountId))];
    const accts = await db
      .select({
        id:       chartOfAccountsTable.id,
        code:     chartOfAccountsTable.code,
        name:     chartOfAccountsTable.name,
        kind:     chartOfAccountsTable.kind,
        isActive: chartOfAccountsTable.isActive,
      })
      .from(chartOfAccountsTable)
      .where(
        and(
          inArray(chartOfAccountsTable.id, accountIds),
          eq(chartOfAccountsTable.tenantId, tenantId),
        ),
      );
    const acctMap = new Map(accts.map(a => [a.id, a]));

    const resolvedLines: JELine[] = [];

    for (const l of lines) {
      const acct = acctMap.get(l.accountId);

      if (!acct) {
        return res.status(400).json({
          error: `Account ${l.accountId} not found in this tenant's chart of accounts`,
        });
      }
      if (acct.kind !== "ledger") {
        return res.status(400).json({
          error: `Account ${acct.code} — ${acct.name} is a group/header account and cannot receive postings. Only ledger accounts are allowed.`,
        });
      }
      if (!acct.isActive) {
        return res.status(400).json({
          error: `Account ${acct.code} — ${acct.name} is inactive and cannot receive new postings.`,
        });
      }

      resolvedLines.push({
        coaId:        acct.id,
        coaCode:      acct.code,
        coaName:      acct.name,
        debitAmount:  l.drAmount,
        creditAmount: l.crAmount,
        narration:    l.memo ?? null,
      });
    }

    // ── Insert as DRAFT (checker must approve before it posts) ─────────────────
    const createdBy = req.adminUser?.id ?? null;

    const jeRes = await pool.query(`
      INSERT INTO journal_entries
        (tenant_id, date, narration, source_ref, source_module, created_by, status)
      VALUES
        ($1::uuid, $2::date, $3, $4, 'manual', $5, 'draft')
      RETURNING id
    `, [tenantId, date, narration, sourceRef ?? null, createdBy]);

    const jeId = (jeRes.rows[0] as { id: string }).id;

    for (let i = 0; i < resolvedLines.length; i++) {
      const l = resolvedLines[i];
      if (!l.coaId) continue;
      await pool.query(`
        INSERT INTO journal_entry_lines (journal_entry_id, account_id, dr_amount, cr_amount, memo, sort_order)
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
      `, [jeId, l.coaId, l.debitAmount, l.creditAmount, l.narration ?? null, i]);
    }

    return res.status(201).json({ id: jeId, status: "draft" });
  } catch (err: any) {
    req.log.error({ err }, "Failed to create journal entry");
    return res.status(500).json({ error: "Failed to create journal entry" });
  }
});

// ── Post draft (checker — transitions draft → posted) ──────────────────────────

router.post("/admin/journal-entries/:id/post", requireRole("finance", "post"), async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const id = req.params.id as string;

    const jeRes = await pool.query(`
      SELECT id, status, created_by FROM journal_entries WHERE id = $1::uuid AND tenant_id = $2::uuid
    `, [id, tenantId]);
    if (!jeRes.rows.length) return res.status(404).json({ error: "Journal entry not found" });

    const je = jeRes.rows[0] as any;
    if (je.status === "posted") {
      return res.status(409).json({ error: "Journal entry is already posted" });
    }

    // Self-approval guard — maker cannot approve their own JE
    const checker = req.adminUser!;
    if (!checker.isSuperAdmin && je.created_by && je.created_by === checker.id) {
      return res.status(403).json({ error: "Self-approval not permitted — the person who created this entry cannot post it" });
    }

    await pool.query(`
      UPDATE journal_entries
      SET status = 'posted', approved_by = $3, approved_at = NOW(), posted_at = NOW()
      WHERE id = $1::uuid AND tenant_id = $2::uuid
    `, [id, tenantId, realAdminUserId(checker)]);

    return res.json({ id, status: "posted" });
  } catch (err) {
    req.log.error({ err }, "Failed to post journal entry");
    return res.status(500).json({ error: "Failed to post journal entry" });
  }
});

// ── Reject draft (checker — sends back to maker) ────────────────────────────────

router.post("/admin/journal-entries/:id/reject", requireRole("finance", "post"), async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const id = req.params.id as string;

    const jeRes = await pool.query(`
      SELECT id, status, created_by FROM journal_entries WHERE id = $1::uuid AND tenant_id = $2::uuid
    `, [id, tenantId]);
    if (!jeRes.rows.length) return res.status(404).json({ error: "Journal entry not found" });

    const je = jeRes.rows[0] as any;
    if (je.status !== "draft") {
      return res.status(409).json({ error: "Only draft entries can be rejected" });
    }

    // Mark as voided/deleted — we delete the draft since it was never posted
    await pool.query(`
      DELETE FROM journal_entries WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'draft'
    `, [id, tenantId]);

    return res.json({ id, rejected: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reject journal entry");
    return res.status(500).json({ error: "Failed to reject journal entry" });
  }
});

export default router;
