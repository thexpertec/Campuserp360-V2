import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Stream a CSV export page-by-page so an unbounded result set never has to be
// fully materialised in memory. `fetchPage` is called with (limit, offset) and
// must return rows in stable order; iteration stops on a short final page.
export async function streamCsv(
  res: Response,
  filename: string,
  headers: string[],
  fetchPage: (limit: number, offset: number) => Promise<Record<string, unknown>[]>,
  mapRow: (r: Record<string, unknown>) => Record<string, unknown> = (r) => r,
  pageSize = 1000,
): Promise<void> {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.write(headers.join(",") + "\n");
  let offset = 0;
  for (;;) {
    const rows = await fetchPage(pageSize, offset);
    if (rows.length === 0) break;
    const chunk = rows
      .map(r => {
        const m = mapRow(r);
        return headers.map(h => csvEscape(m[h])).join(",");
      })
      .join("\n");
    res.write(chunk + "\n");
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  res.end();
}

// ── Report filter options ──────────────────────────────────────────────────────
// GET /admin/reports/options — tenant-scoped dropdown data for all three reports

router.get("/admin/reports/options", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const [ayRes, ftRes, deptRes, bankRes, classRes, coaRes, allCoaRes, srcModRes] = await Promise.all([
      pool.query(
        `SELECT id, name FROM academic_years WHERE tenant_id = $1 ORDER BY name DESC LIMIT 20`,
        [tenantId],
      ),
      pool.query(
        `SELECT id, name FROM fee_types WHERE tenant_id = $1 AND active = true ORDER BY sort_order, name`,
        [tenantId],
      ),
      pool.query(
        `SELECT id, name FROM hr_departments WHERE tenant_id = $1 AND active = true ORDER BY sort_order, name`,
        [tenantId],
      ),
      pool.query(
        `SELECT id, account_title, bank_name FROM bank_accounts WHERE is_active = true ORDER BY account_title`,
        [],
      ),
      pool.query(
        `SELECT DISTINCT class_code FROM students WHERE tenant_id = $1 ORDER BY class_code`,
        [tenantId],
      ),
      pool.query(
        `SELECT id, code, name, type FROM chart_of_accounts
         WHERE tenant_id = $1 AND is_active = true AND type IN ('income','expense')
         ORDER BY type, code LIMIT 200`,
        [tenantId],
      ),
      pool.query(
        `SELECT id, code, name, type FROM chart_of_accounts
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY type, code LIMIT 500`,
        [tenantId],
      ),
      pool.query(
        `SELECT DISTINCT source_module FROM journal_entries
         WHERE tenant_id = $1 AND source_module IS NOT NULL
         ORDER BY source_module`,
        [tenantId],
      ),
    ]);

    return res.json({
      academicYears: ayRes.rows,
      feeTypes:      ftRes.rows,
      departments:   deptRes.rows,
      bankAccounts:  bankRes.rows,
      classCodes:    (classRes.rows as any[]).map(r => r.class_code as string),
      coaAccounts:   coaRes.rows,
      allCoaAccounts: allCoaRes.rows,
      sourceModules: (srcModRes.rows as any[]).map(r => r.source_module as string),
    });
  } catch (err) {
    req.log.error({ err }, "GET /admin/reports/options failed");
    return res.status(500).json({ error: "Failed to load report options" });
  }
});

// ── Fee Collection Report ─────────────────────────────────────────────────────
// GET /admin/reports/fee-collection
// Columns: challan_number, applicant_id, roll_no, student_name, class_code, section_name,
//          fee_type_name, academic_year_name, month, issue_date, due_date,
//          amount, paid_amount, balance, status, paid_at, payment_method,
//          account_title, collected_by_name, remarks
// Note: fee_challans has no `discount` column in the schema — not included.
// Filters: dateFrom, dateTo, status, academicYearId, feeTypeId, month, classCode
// Summary: totalBilled, totalPaid, totalOutstanding

router.get("/admin/reports/fee-collection", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const {
      dateFrom, dateTo, status, academicYearId, feeTypeId, month, classCode,
      page = "1", pageSize = "50", format,
    } = req.query as Record<string, string>;

    const conditions: string[] = ["s.tenant_id = $1"];
    const params: unknown[] = [tenantId];

    function add(expr: string, val: unknown) {
      params.push(val);
      conditions.push(expr.replace("?", `$${params.length}`));
    }

    if (dateFrom)       add("fc.issue_date >= ?::date", dateFrom);
    if (dateTo)         add("fc.issue_date <= ?::date", dateTo);
    if (status)         add("fc.status = ?", status);
    if (academicYearId) add("fc.academic_year_id = ?::uuid", academicYearId);
    if (feeTypeId)      add("fc.fee_type_id = ?::uuid", feeTypeId);
    if (month)          add("fc.month = ?", month);
    if (classCode)      add("s.class_code = ?", classCode);

    const where = `WHERE ${conditions.join(" AND ")}`;

    const selectCols = `
      fc.id,
      fc.challan_number,
      fc.month,
      fc.issue_date,
      fc.due_date,
      fc.amount,
      fc.paid_amount,
      (fc.amount - COALESCE(fc.paid_amount, 0))       AS balance,
      fc.status,
      fc.paid_at,
      fc.payment_method,
      fc.account_title,
      fc.remarks,
      s.applicant_id,
      s.roll_no,
      s.full_name                                      AS student_name,
      s.class_code,
      sec.name                                         AS section_name,
      ft.name                                          AS fee_type_name,
      ay.name                                          AS academic_year_name,
      au.full_name                                     AS collected_by_name
    `;

    const joins = `
      FROM fee_challans fc
      JOIN students s ON s.id = fc.student_id
      LEFT JOIN sections sec ON sec.id = s.section_id
      JOIN fee_types ft ON ft.id = fc.fee_type_id
      JOIN academic_years ay ON ay.id = fc.academic_year_id
      LEFT JOIN admin_users au ON au.id::text = fc.collected_by::text
    `;

    const orderBy = `ORDER BY fc.issue_date DESC, fc.created_at DESC`;

    if (format === "csv") {
      const CSV_HEADERS = [
        "challan_number","applicant_id","roll_no","student_name","class_code","section_name",
        "fee_type_name","academic_year_name","month","issue_date","due_date",
        "amount","paid_amount","balance","status","paid_at","payment_method",
        "account_title","collected_by_name","remarks",
      ];
      return await streamCsv(res, "fee-collection-report.csv", CSV_HEADERS, async (limit, offset) => {
        const r = await pool.query(
          `SELECT ${selectCols} ${joins} ${where} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        );
        return r.rows as Record<string, unknown>[];
      });
    }

    const pg     = Math.max(1, parseInt(page, 10));
    const ps     = Math.min(500, Math.max(1, parseInt(pageSize, 10)));
    const offset = (pg - 1) * ps;

    const [countRes, rowsRes, summaryRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n ${joins} ${where}`, params),
      pool.query(
        `SELECT ${selectCols} ${joins} ${where} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, ps, offset],
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(fc.amount), 0)::bigint                              AS total_billed,
           COALESCE(SUM(fc.paid_amount), 0)::bigint                         AS total_paid,
           COALESCE(SUM(fc.amount - COALESCE(fc.paid_amount, 0)), 0)::bigint AS total_outstanding
         ${joins} ${where}`,
        params,
      ),
    ]);

    const total   = Number((countRes.rows[0] as any)?.n ?? 0);
    const summary = summaryRes.rows[0] as any ?? {};
    return res.json({
      total, page: pg, pageSize: ps, rows: rowsRes.rows,
      summary: {
        totalBilled:      Number(summary.total_billed      ?? 0),
        totalPaid:        Number(summary.total_paid        ?? 0),
        totalOutstanding: Number(summary.total_outstanding ?? 0),
      },
    });
  } catch (err) {
    req.log.error({ err }, "GET /admin/reports/fee-collection failed");
    return res.status(500).json({ error: "Failed to load fee collection report" });
  }
});

// ── Due Fee Report ─────────────────────────────────────────────────────────────
// GET /admin/reports/due-fees
// Columns: challan_number, applicant_id, roll_no, student_name, class_code, section_name,
//          academic_year_name, due_date, days_overdue, amount, paid_amount, balance
// Filters: classCode, academicYearId, dueDateFrom, dueDateTo
// Summary: studentsWithDues, totalOutstanding, overdueChallans

router.get("/admin/reports/due-fees", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const {
      dueDateFrom, dueDateTo, academicYearId, classCode,
      page = "1", pageSize = "50", format,
    } = req.query as Record<string, string>;

    const conditions: string[] = [
      "s.tenant_id = $1",
      "(fc.amount - COALESCE(fc.paid_amount, 0)) > 0",
    ];
    const params: unknown[] = [tenantId];

    function add(expr: string, val: unknown) {
      params.push(val);
      conditions.push(expr.replace("?", `$${params.length}`));
    }

    if (dueDateFrom)    add("fc.due_date >= ?::date", dueDateFrom);
    if (dueDateTo)      add("fc.due_date <= ?::date", dueDateTo);
    if (academicYearId) add("fc.academic_year_id = ?::uuid", academicYearId);
    if (classCode)      add("s.class_code = ?", classCode);

    const where = `WHERE ${conditions.join(" AND ")}`;

    const selectCols = `
      fc.id,
      fc.challan_number,
      fc.due_date,
      fc.amount,
      fc.paid_amount,
      (fc.amount - COALESCE(fc.paid_amount, 0))                   AS balance,
      GREATEST((CURRENT_DATE - fc.due_date::date), 0)::int        AS days_overdue,
      s.id                                                        AS student_id,
      s.applicant_id,
      s.roll_no,
      s.full_name                                                  AS student_name,
      s.class_code,
      sec.name                                                    AS section_name,
      ay.name                                                     AS academic_year_name
    `;

    const joins = `
      FROM fee_challans fc
      JOIN students s ON s.id = fc.student_id
      LEFT JOIN sections sec ON sec.id = s.section_id
      JOIN academic_years ay ON ay.id = fc.academic_year_id
    `;

    const orderBy = `ORDER BY fc.due_date ASC, fc.created_at ASC`;

    if (format === "csv") {
      const CSV_HEADERS = [
        "challan_number","applicant_id","roll_no","student_name","class_code","section_name",
        "academic_year_name","due_date","days_overdue","amount","paid_amount","balance",
      ];
      return await streamCsv(res, "due-fee-report.csv", CSV_HEADERS, async (limit, offset) => {
        const r = await pool.query(
          `SELECT ${selectCols} ${joins} ${where} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        );
        return r.rows as Record<string, unknown>[];
      });
    }

    const pg     = Math.max(1, parseInt(page, 10));
    const ps     = Math.min(500, Math.max(1, parseInt(pageSize, 10)));
    const offset = (pg - 1) * ps;

    const [countRes, rowsRes, summaryRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n ${joins} ${where}`, params),
      pool.query(
        `SELECT ${selectCols} ${joins} ${where} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, ps, offset],
      ),
      pool.query(
        `SELECT
           COUNT(DISTINCT s.id)::int                                             AS students_with_dues,
           COALESCE(SUM(fc.amount - COALESCE(fc.paid_amount, 0)), 0)::bigint     AS total_outstanding,
           COUNT(*) FILTER (WHERE fc.due_date::date < CURRENT_DATE)::int         AS overdue_challans
         ${joins} ${where}`,
        params,
      ),
    ]);

    const total   = Number((countRes.rows[0] as any)?.n ?? 0);
    const summary = summaryRes.rows[0] as any ?? {};
    return res.json({
      total, page: pg, pageSize: ps, rows: rowsRes.rows,
      summary: {
        studentsWithDues: Number(summary.students_with_dues ?? 0),
        totalOutstanding: Number(summary.total_outstanding ?? 0),
        overdueChallans:  Number(summary.overdue_challans  ?? 0),
      },
    });
  } catch (err) {
    req.log.error({ err }, "GET /admin/reports/due-fees failed");
    return res.status(500).json({ error: "Failed to load due fee report" });
  }
});

// ── Payroll Columns ───────────────────────────────────────────────────────────
// GET /admin/reports/payroll-columns
// Returns all distinct template item names for the tenant — used by the frontend
// to render dynamic allowance/deduction columns.

router.get("/admin/reports/payroll-columns", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const res2 = await pool.query(
      `SELECT DISTINCT ti.name, ti.item_type
       FROM employee_salary_template_items ti
       JOIN employee_salary_templates tpl ON tpl.id = ti.template_id
       JOIN employees e ON e.id = tpl.employee_id
       WHERE e.tenant_id = $1
       ORDER BY ti.item_type, ti.name`,
      [tenantId],
    );

    return res.json(res2.rows);
  } catch (err) {
    req.log.error({ err }, "GET /admin/reports/payroll-columns failed");
    return res.status(500).json({ error: "Failed to load payroll columns" });
  }
});

// ── Payroll Report ────────────────────────────────────────────────────────────
// GET /admin/reports/payroll
// Columns: month, staff_id, employee_name, role, department_name, designation_name,
//          contract_type, basic_salary, allowances (total), deductions (total),
//          net_salary, status, paid_at, prepared_by_name, remarks
//          + template_items JSON array for dynamic named columns in the UI
// Filters: month, monthFrom, monthTo, status, departmentId
// CSV: dynamic headers for each named allowance/deduction

router.get("/admin/reports/payroll", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const {
      month, monthFrom, monthTo, year, status, departmentId,
      page = "1", pageSize = "50", format,
    } = req.query as Record<string, string>;

    const conditions: string[] = ["e.tenant_id = $1"];
    const params: unknown[] = [tenantId];

    function add(expr: string, val: unknown) {
      params.push(val);
      conditions.push(expr.replace("?", `$${params.length}`));
    }

    if (month)        add("est.month = ?", month);
    if (monthFrom)    add("est.month >= ?", monthFrom);
    if (monthTo)      add("est.month <= ?", monthTo);
    if (year)         add("est.month LIKE ?", `${year}-%`);
    if (status)       add("est.status = ?", status);
    if (departmentId) add("e.department_id = ?::uuid", departmentId);

    const where = `WHERE ${conditions.join(" AND ")}`;

    // template_items: named allowances/deductions from the employee's current template
    const templateItemsSub = `(
      SELECT json_agg(
        json_build_object(
          'name',     ti.name,
          'type',     ti.item_type,
          'calcType', ti.calculation_type,
          'value',    ti.value
        ) ORDER BY ti.item_type DESC, ti.sort_order
      )
      FROM employee_salary_template_items ti
      JOIN employee_salary_templates tpl ON tpl.id = ti.template_id
      WHERE tpl.employee_id = e.id
    ) AS template_items`;

    const selectCols = `
      est.id,
      est.month,
      est.basic_salary,
      est.allowances,
      est.deductions,
      est.net_salary,
      est.status,
      est.paid_at,
      est.remarks,
      e.staff_id,
      e.full_name                            AS employee_name,
      e.role,
      e.contract_type,
      d.name                                 AS department_name,
      des.name                               AS designation_name,
      au.full_name                           AS prepared_by_name,
      ${templateItemsSub}
    `;

    const joins = `
      FROM employee_salary_transactions est
      JOIN employees e ON e.id = est.employee_id
      LEFT JOIN hr_departments d ON d.id = e.department_id
      LEFT JOIN hr_designations des ON des.id = e.designation_id
      LEFT JOIN admin_users au ON au.id::text = est.prepared_by::text
    `;

    const orderBy = `ORDER BY est.month DESC, e.full_name ASC`;

    if (format === "csv") {
      // Get dynamic column names for this tenant first
      const colsRes = await pool.query(
        `SELECT DISTINCT ti.name, ti.item_type
         FROM employee_salary_template_items ti
         JOIN employee_salary_templates tpl ON tpl.id = ti.template_id
         JOIN employees e ON e.id = tpl.employee_id
         WHERE e.tenant_id = $1
         ORDER BY ti.item_type, ti.name`,
        [tenantId],
      );
      const cols = colsRes.rows as { name: string; item_type: string }[];
      const allowanceCols  = cols.filter(c => c.item_type === "incentive").map(c => c.name);
      const deductionCols  = cols.filter(c => c.item_type === "deduction").map(c => c.name);

      const FIXED_BEFORE = ["month","staff_id","employee_name","role","contract_type","department_name","designation_name","basic_salary"];
      const FIXED_AFTER  = ["allowances","deductions","net_salary","status","paid_at","prepared_by_name","remarks"];
      const allHeaders   = [
        ...FIXED_BEFORE,
        ...allowanceCols.map(n => `allowance_${n.toLowerCase().replace(/\s+/g, "_")}`),
        ...deductionCols.map(n => `deduction_${n.toLowerCase().replace(/\s+/g, "_")}`),
        ...FIXED_AFTER,
      ];

      const mapRow = (r: Record<string, unknown>): Record<string, unknown> => {
        const items: { name: string; type: string; value: number }[] = (r as any).template_items ?? [];
        const itemMap: Record<string, number> = {};
        for (const it of items) itemMap[it.name] = it.value;

        const row: Record<string, unknown> = { ...r };
        for (const n of allowanceCols) {
          row[`allowance_${n.toLowerCase().replace(/\s+/g, "_")}`] = itemMap[n] ?? 0;
        }
        for (const n of deductionCols) {
          row[`deduction_${n.toLowerCase().replace(/\s+/g, "_")}`] = itemMap[n] ?? 0;
        }
        return row;
      };

      return await streamCsv(res, "payroll-report.csv", allHeaders, async (limit, offset) => {
        const r = await pool.query(
          `SELECT ${selectCols} ${joins} ${where} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        );
        return r.rows as Record<string, unknown>[];
      }, mapRow);
    }

    const pg     = Math.max(1, parseInt(page, 10));
    const ps     = Math.min(500, Math.max(1, parseInt(pageSize, 10)));
    const offset = (pg - 1) * ps;

    const [countRes, rowsRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n ${joins} ${where}`, params),
      pool.query(
        `SELECT ${selectCols} ${joins} ${where} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, ps, offset],
      ),
    ]);

    const total = Number((countRes.rows[0] as any)?.n ?? 0);
    return res.json({ total, page: pg, pageSize: ps, rows: rowsRes.rows });
  } catch (err) {
    req.log.error({ err }, "GET /admin/reports/payroll failed");
    return res.status(500).json({ error: "Failed to load payroll report" });
  }
});

// ── Income / Expense Report ───────────────────────────────────────────────────
// GET /admin/reports/income-expense
// Columns: date, voucher_number (Ref #), payee, description, amount, status,
//          is_void (boolean), coa_type (Type: income|expense), coa_code, coa_name,
//          bank_account_title, bank_name, created_at (recorded at)
// Filters: dateFrom, dateTo, status, type (income|expense, also accepts coaType for compat),
//          bankAccountId, coaId
// Summary: totalIncome, totalExpense, net (void rows excluded from summary)
// Note: account_payments has no tenant_id (matches existing accountPayments.ts pattern)
// Note: account_payments has no recorded_by/created_by column; created_at used instead.

router.get("/admin/reports/income-expense", requireAdmin, async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, string>;
    const {
      dateFrom, dateTo, status, bankAccountId, coaId,
      page = "1", pageSize = "50", format,
    } = q;
    // Accept both `type` (spec) and legacy `coaType` parameter
    const coaType = q.type || q.coaType || "";

    const conditions: string[] = [];
    const params: unknown[] = [];

    function add(expr: string, val: unknown) {
      params.push(val);
      conditions.push(expr.replace("?", `$${params.length}`));
    }

    if (dateFrom)              add("p.date >= ?::date", dateFrom);
    if (dateTo)                add("p.date <= ?::date", dateTo);
    if (status)                add("p.status = ?", status);
    if (bankAccountId)         add("p.bank_account_id = ?::uuid", bankAccountId);
    if (coaId)                 add("p.coa_account_id = ?::uuid", coaId);
    if (coaType && coaType !== "all") add("ca.type = ?", coaType);

    const where    = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const selectCols = `
      p.id,
      p.date,
      p.voucher_number,
      p.payee,
      p.description,
      p.amount,
      p.status,
      (p.status = 'void')       AS is_void,
      p.created_at              AS recorded_at,
      ba.account_title          AS bank_account_title,
      ba.bank_name,
      ba.type                   AS bank_account_type,
      ca.code                   AS coa_code,
      ca.name                   AS coa_name,
      ca.type                   AS coa_type
    `;

    const joins = `
      FROM account_payments p
      LEFT JOIN bank_accounts ba ON ba.id = p.bank_account_id
      LEFT JOIN chart_of_accounts ca ON ca.id = p.coa_account_id
    `;

    const orderBy = `ORDER BY p.date DESC, p.created_at DESC`;

    if (format === "csv") {
      const CSV_HEADERS = [
        "date","voucher_number","payee","description","amount","status","is_void",
        "coa_type","coa_code","coa_name","bank_account_title","bank_name","recorded_at",
      ];
      return await streamCsv(res, "income-expense-report.csv", CSV_HEADERS, async (limit, offset) => {
        const r = await pool.query(
          `SELECT ${selectCols} ${joins} ${where} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        );
        return r.rows as Record<string, unknown>[];
      });
    }

    const pg     = Math.max(1, parseInt(page, 10));
    const ps     = Math.min(500, Math.max(1, parseInt(pageSize, 10)));
    const offset = (pg - 1) * ps;

    // Summary excludes void rows
    const summaryParams = [...params, "void"];
    const summaryExtra  = `AND p.status != $${summaryParams.length}`;
    const summaryWhere  = conditions.length
      ? `WHERE ${conditions.join(" AND ")} ${summaryExtra}`
      : `WHERE p.status != $${summaryParams.length}`;

    const [countRes, rowsRes, summaryRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n ${joins} ${where}`, params),
      pool.query(
        `SELECT ${selectCols} ${joins} ${where} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, ps, offset],
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN ca.type = 'income'  THEN p.amount ELSE 0 END), 0) AS total_income,
           COALESCE(SUM(CASE WHEN ca.type = 'expense' THEN p.amount ELSE 0 END), 0) AS total_expense
         ${joins} ${summaryWhere}`,
        summaryParams,
      ),
    ]);

    const total = Number((countRes.rows[0] as any)?.n ?? 0);
    const sum   = summaryRes.rows[0] as any ?? {};
    const totalIncome  = Number(sum.total_income  ?? 0);
    const totalExpense = Number(sum.total_expense ?? 0);
    return res.json({
      total, page: pg, pageSize: ps, rows: rowsRes.rows,
      summary: { totalIncome, totalExpense, net: totalIncome - totalExpense },
    });
  } catch (err) {
    req.log.error({ err }, "GET /admin/reports/income-expense failed");
    return res.status(500).json({ error: "Failed to load income/expense report" });
  }
});

// ── All Transactions Report ───────────────────────────────────────────────────
// GET /admin/reports/all-transactions
// One row per journal_entry_lines row (every debit/credit that hit the ledger,
// regardless of originating module). Columns: date, account (code + name + type),
// debit amount, credit amount, narration, memo, source module, source ref
// (human-readable) + source_ref_id (uuid, for drill-down), status.
// Filters: dateFrom, dateTo, accountId, sourceModule, status (posted|draft|void)

router.get("/admin/reports/all-transactions", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const {
      dateFrom, dateTo, accountId, sourceModule, status,
      page = "1", pageSize = "50", format,
    } = req.query as Record<string, string>;

    const conditions: string[] = ["je.tenant_id = $1"];
    const params: unknown[] = [tenantId];

    function add(expr: string, val: unknown) {
      params.push(val);
      conditions.push(expr.replace("?", `$${params.length}`));
    }

    if (dateFrom)      add("je.date >= ?::date", dateFrom);
    if (dateTo)        add("je.date <= ?::date", dateTo);
    if (accountId)     add("jel.account_id = ?::uuid", accountId);
    if (sourceModule)  add("je.source_module = ?", sourceModule);
    if (status === "void") {
      conditions.push("je.is_voided = true");
    } else if (status === "posted") {
      conditions.push("je.is_voided = false AND je.posted_at IS NOT NULL");
    } else if (status === "draft") {
      conditions.push("je.is_voided = false AND je.posted_at IS NULL");
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const selectCols = `
      jel.id,
      je.date,
      je.narration,
      je.source_ref,
      je.source_module,
      je.source_ref_id,
      je.is_voided,
      je.posted_at,
      CASE WHEN je.is_voided THEN 'void'
           WHEN je.posted_at IS NULL THEN 'draft'
           ELSE 'posted' END          AS status,
      ca.code                          AS account_code,
      ca.name                          AS account_name,
      ca.type                          AS account_type,
      jel.dr_amount,
      jel.cr_amount,
      jel.memo
    `;

    const joins = `
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
    `;

    const orderBy = `ORDER BY je.date DESC, je.created_at DESC, jel.sort_order ASC`;

    if (format === "csv") {
      const CSV_HEADERS = [
        "date","account_code","account_name","account_type","dr_amount","cr_amount",
        "narration","memo","source_module","source_ref","source_ref_id","status",
      ];
      return await streamCsv(res, "all-transactions-report.csv", CSV_HEADERS, async (limit, offset) => {
        const r = await pool.query(
          `SELECT ${selectCols} ${joins} ${where} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        );
        return r.rows as Record<string, unknown>[];
      });
    }

    const pg     = Math.max(1, parseInt(page, 10));
    const ps     = Math.min(500, Math.max(1, parseInt(pageSize, 10)));
    const offset = (pg - 1) * ps;

    const [countRes, rowsRes, summaryRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n ${joins} ${where}`, params),
      pool.query(
        `SELECT ${selectCols} ${joins} ${where} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, ps, offset],
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(jel.dr_amount), 0) AS total_debit,
           COALESCE(SUM(jel.cr_amount), 0) AS total_credit
         ${joins} ${where}`,
        params,
      ),
    ]);

    const total   = Number((countRes.rows[0] as any)?.n ?? 0);
    const summary = summaryRes.rows[0] as any ?? {};
    return res.json({
      total, page: pg, pageSize: ps, rows: rowsRes.rows,
      summary: {
        totalDebit:  Number(summary.total_debit  ?? 0),
        totalCredit: Number(summary.total_credit ?? 0),
      },
    });
  } catch (err) {
    req.log.error({ err }, "GET /admin/reports/all-transactions failed");
    return res.status(500).json({ error: "Failed to load all transactions report" });
  }
});

// ── Receipt & Payment Summary Report ──────────────────────────────────────────
// GET /admin/reports/receipt-payment-summary
// For a date range: opening balance (net of all active cash/bank COA accounts as
// of the day before dateFrom), per-ledger receipt totals broken out by cash/bank
// account (cash was debited, some other account was credited in the same JE),
// per-ledger payment totals broken out by cash/bank account (cash was credited,
// some other account was debited), and the closing balance as of dateTo.
// Rows are NOT restricted to income/expense account types — any account on the
// "other side" of a cash movement is included — so that
// opening + totalReceipts - totalPayments == closing always reconciles exactly,
// even for cash flows that touch liability/asset ledgers (e.g. vendor bill
// payments settling Accounts Payable, not an expense account directly).
// Filters: dateFrom, dateTo (default: first day of current month → today)
// CSV: two stacked sections (Receipts, Payments) in one file.

interface CashAccountRow { id: string; type: string; account_title: string; bank_name: string | null; coa_id: string | null; }
interface LedgerPairRow {
  ledger_id: string; ledger_code: string; ledger_name: string; ledger_type: string;
  cash_account_coa_id: string; amount: string;
}

function defaultDateRange(dateFrom?: string, dateTo?: string): { from: string; to: string } {
  const today = new Date();
  const to = dateTo || today.toISOString().slice(0, 10);
  const from = dateFrom || new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  return { from, to };
}

async function loadCashAccounts(tenantId: string): Promise<CashAccountRow[]> {
  const r = await pool.query(
    `SELECT id, type, account_title, bank_name, coa_id
     FROM bank_accounts
     WHERE tenant_id = $1 AND is_active = true AND coa_id IS NOT NULL
     ORDER BY type, sort_order, account_title`,
    [tenantId],
  );
  return r.rows as CashAccountRow[];
}

function cashLabel(a: CashAccountRow): string {
  return a.bank_name ? `${a.bank_name} — ${a.account_title}` : a.account_title;
}

async function loadBalance(tenantId: string, cashCoaIds: string[], onOrBefore: string, strict: boolean): Promise<number> {
  if (cashCoaIds.length === 0) return 0;
  const cmp = strict ? "<" : "<=";
  const r = await pool.query(
    `SELECT COALESCE(SUM(jel.dr_amount - jel.cr_amount), 0)::text AS bal
     FROM journal_entry_lines jel
     JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE je.tenant_id = $1 AND je.is_voided = false
       AND jel.account_id = ANY($2::uuid[])
       AND je.date ${cmp} $3::date`,
    [tenantId, cashCoaIds, onOrBefore],
  );
  return Number((r.rows[0] as any)?.bal ?? 0);
}

// Ledger pairing note: a journal entry can legally contain more than one
// matching cash line (e.g. a single receipt entry split across two cash
// accounts) and/or more than one non-cash "other" line (e.g. one receipt
// crediting two different income accounts). A naive CROSS JOIN of cash
// lines x other lines would multiply each other-line amount once per
// matching cash line, breaking the required
// opening + totalReceipts - totalPayments == closing identity.
// Instead, each non-cash line's amount is allocated across the JE's
// matching cash lines in proportion to each cash line's own amount, so the
// per-JE sum of allocated amounts always equals the non-cash line's full
// amount (and the grand total always equals the true cash movement).
async function loadLedgerPairs(
  tenantId: string, cashCoaIds: string[], dateFrom: string, dateTo: string, direction: "receipt" | "payment",
): Promise<LedgerPairRow[]> {
  if (cashCoaIds.length === 0) return [];
  const amountExpr = direction === "receipt" ? "ol.cr_amount - ol.dr_amount" : "ol.dr_amount - ol.cr_amount";
  const cashAmountExpr = direction === "receipt" ? "cl.dr_amount" : "cl.cr_amount";
  const cashFilter  = direction === "receipt" ? "cl.dr_amount > 0" : "cl.cr_amount > 0";
  const r = await pool.query(
    `WITH cash_lines AS (
       SELECT cl.journal_entry_id AS je_id, cl.account_id AS cash_coa_id, cl.id AS cl_id,
              (${cashAmountExpr})::numeric AS cash_amt
       FROM journal_entry_lines cl
       JOIN journal_entries je ON je.id = cl.journal_entry_id
       WHERE je.tenant_id = $1 AND je.is_voided = false
         AND je.date >= $2::date AND je.date <= $3::date
         AND cl.account_id = ANY($4::uuid[])
         AND ${cashFilter}
     ),
     je_cash_totals AS (
       SELECT je_id, SUM(cash_amt) AS total_cash_amt
       FROM cash_lines
       GROUP BY je_id
     ),
     other_lines AS (
       SELECT ol.journal_entry_id AS je_id, ol.account_id AS ledger_coa_id,
              (${amountExpr})::numeric AS amt
       FROM journal_entry_lines ol
       JOIN journal_entries je ON je.id = ol.journal_entry_id
       WHERE je.tenant_id = $1 AND je.is_voided = false
         AND je.date >= $2::date AND je.date <= $3::date
         AND ol.account_id != ALL($4::uuid[])
         AND ol.journal_entry_id IN (SELECT je_id FROM cash_lines)
     )
     SELECT
       ca.id   AS ledger_id, ca.code AS ledger_code, ca.name AS ledger_name, ca.type AS ledger_type,
       cl.cash_coa_id AS cash_account_coa_id,
       SUM(ol.amt * cl.cash_amt / jct.total_cash_amt)::text AS amount
     FROM other_lines ol
     JOIN je_cash_totals jct ON jct.je_id = ol.je_id
     JOIN cash_lines cl ON cl.je_id = ol.je_id
     JOIN chart_of_accounts ca ON ca.id = ol.ledger_coa_id
     WHERE jct.total_cash_amt <> 0
     GROUP BY ca.id, ca.code, ca.name, ca.type, cl.cash_coa_id`,
    [tenantId, dateFrom, dateTo, cashCoaIds],
  );
  return r.rows as LedgerPairRow[];
}

interface LedgerRowOut {
  id: string; code: string; name: string; type: string;
  amounts: Record<string, number>; total: number;
}

// `pairs.cash_account_coa_id` is a chart_of_accounts id (from journal_entry_lines),
// while report columns are keyed by bank_accounts.id. `coaIdToBankAccountId` bridges
// the two id spaces so amounts land in the correct dynamic account column.
function buildLedgerRows(
  pairs: LedgerPairRow[], cashAccounts: CashAccountRow[], coaIdToBankAccountId: Map<string, string>,
): { rows: LedgerRowOut[]; total: number } {
  const byLedger = new Map<string, LedgerRowOut>();
  for (const p of pairs) {
    const bankAccountId = coaIdToBankAccountId.get(p.cash_account_coa_id);
    if (!bankAccountId) continue;
    let row = byLedger.get(p.ledger_id);
    if (!row) {
      row = {
        id: p.ledger_id, code: p.ledger_code, name: p.ledger_name, type: p.ledger_type,
        amounts: Object.fromEntries(cashAccounts.map(c => [c.id, 0])),
        total: 0,
      };
      byLedger.set(p.ledger_id, row);
    }
    const amt = Number(p.amount);
    row.amounts[bankAccountId] = (row.amounts[bankAccountId] ?? 0) + amt;
    row.total += amt;
  }
  const rows = Array.from(byLedger.values()).sort((a, b) => a.code.localeCompare(b.code));
  const total = rows.reduce((s, r) => s + r.total, 0);
  return { rows, total };
}

router.get("/admin/reports/receipt-payment-summary", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const { dateFrom: qFrom, dateTo: qTo, format } = req.query as Record<string, string>;
    const { from: dateFrom, to: dateTo } = defaultDateRange(qFrom, qTo);

    const cashAccounts = await loadCashAccounts(tenantId);
    const cashCoaIds   = cashAccounts.map(a => a.coa_id as string);
    const coaIdToBankAccountId = new Map(cashAccounts.map(a => [a.coa_id as string, a.id]));

    const [openingBalance, closingBalance, receiptPairs, paymentPairs] = await Promise.all([
      loadBalance(tenantId, cashCoaIds, dateFrom, true),
      loadBalance(tenantId, cashCoaIds, dateTo, false),
      loadLedgerPairs(tenantId, cashCoaIds, dateFrom, dateTo, "receipt"),
      loadLedgerPairs(tenantId, cashCoaIds, dateFrom, dateTo, "payment"),
    ]);

    const { rows: receiptRows, total: totalReceipts } = buildLedgerRows(receiptPairs, cashAccounts, coaIdToBankAccountId);
    const { rows: paymentRows, total: totalPayments }  = buildLedgerRows(paymentPairs, cashAccounts, coaIdToBankAccountId);
    const netChange = totalReceipts - totalPayments;

    const cashAccountsOut = cashAccounts.map(a => ({ id: a.id, coaId: a.coa_id, label: cashLabel(a), type: a.type }));

    if (format === "csv") {
      const lines: string[] = [];
      const q = (v: unknown) => csvEscape(v);
      lines.push(`Receipt & Payment Summary`);
      lines.push(`From,${q(dateFrom)},To,${q(dateTo)}`);
      lines.push("");
      lines.push(`Opening Balance,${openingBalance}`);
      lines.push(`Total Receipts,${totalReceipts}`);
      lines.push(`Total Payments,${totalPayments}`);
      lines.push(`Closing Balance,${closingBalance}`);
      lines.push(`Net Change,${netChange}`);
      lines.push("");

      const cashHeaders = cashAccountsOut.map(c => q(c.label));
      lines.push(["Receipts", ...cashHeaders, "Total"].join(","));
      lines.push(["Opening Balance", ...cashAccountsOut.map(() => ""), openingBalance].join(","));
      for (const row of receiptRows) {
        lines.push([q(`${row.code} · ${row.name}`), ...cashAccountsOut.map(c => row.amounts[c.id] ?? 0), row.total].join(","));
      }
      lines.push(["Total Receipts", ...cashAccountsOut.map(c => receiptRows.reduce((s, r) => s + (r.amounts[c.id] ?? 0), 0)), totalReceipts].join(","));
      lines.push("");

      lines.push(["Payments", ...cashHeaders, "Total"].join(","));
      for (const row of paymentRows) {
        lines.push([q(`${row.code} · ${row.name}`), ...cashAccountsOut.map(c => row.amounts[c.id] ?? 0), row.total].join(","));
      }
      lines.push(["Closing Balance", ...cashAccountsOut.map(() => ""), closingBalance].join(","));
      lines.push(["Total Payments", ...cashAccountsOut.map(c => paymentRows.reduce((s, r) => s + (r.amounts[c.id] ?? 0), 0)), totalPayments].join(","));

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="receipt-payment-summary.csv"`);
      return res.send(lines.join("\n"));
    }

    return res.json({
      dateFrom, dateTo,
      cashAccounts: cashAccountsOut,
      openingBalance, closingBalance, totalReceipts, totalPayments, netChange,
      receiptRows, paymentRows,
    });
  } catch (err) {
    req.log.error({ err }, "GET /admin/reports/receipt-payment-summary failed");
    return res.status(500).json({ error: "Failed to load receipt & payment summary" });
  }
});

export default router;
