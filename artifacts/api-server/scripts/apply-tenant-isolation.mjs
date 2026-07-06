/**
 * One-time migration: add tenant_id columns to HR/COA/fee tables,
 * backfill existing rows with the 'ccm' tenant, drop old global unique
 * indexes, and create composite (tenant_id, ...) unique indexes.
 *
 * Usage: node artifacts/api-server/scripts/apply-tenant-isolation.mjs
 */
import pg from "/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js";
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL });

const STATEMENTS = `
-- ─── Step 1: Add tenant_id columns (safe / idempotent) ───────────────────────
ALTER TABLE hr_departments      ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE hr_designations     ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE hr_salary_grades    ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE hr_incentive_types  ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE hr_deduction_types  ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE employees           ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE chart_of_accounts   ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE fee_types            ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- ─── Step 2: Backfill all existing rows with the 'ccm' tenant ─────────────────
UPDATE hr_departments     SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE hr_designations    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE hr_salary_grades   SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE hr_incentive_types SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE hr_deduction_types SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE employees          SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE chart_of_accounts  SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE fee_types           SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1) WHERE tenant_id IS NULL;

-- ─── Step 3: Drop old global unique constraints / indexes ─────────────────────
-- hr_departments.name
ALTER TABLE hr_departments  DROP CONSTRAINT IF EXISTS hr_departments_name_unique;
DROP INDEX IF EXISTS hr_departments_name_unique;

-- hr_designations.name
ALTER TABLE hr_designations DROP CONSTRAINT IF EXISTS hr_designations_name_unique;
DROP INDEX IF EXISTS hr_designations_name_unique;

-- hr_salary_grades.name
ALTER TABLE hr_salary_grades DROP CONSTRAINT IF EXISTS hr_salary_grades_name_unique;
DROP INDEX IF EXISTS hr_salary_grades_name_unique;

-- hr_incentive_types.name
ALTER TABLE hr_incentive_types DROP CONSTRAINT IF EXISTS hr_incentive_types_name_unique;
DROP INDEX IF EXISTS hr_incentive_types_name_unique;

-- hr_deduction_types.name
ALTER TABLE hr_deduction_types DROP CONSTRAINT IF EXISTS hr_deduction_types_name_unique;
DROP INDEX IF EXISTS hr_deduction_types_name_unique;

-- employees.staff_id (inline .unique() + explicit uniqueIndex)
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_staff_id_unique;
DROP INDEX IF EXISTS employees_staff_id_idx;

-- fee_types.fee_code (inline .unique() + explicit uniqueIndex)
ALTER TABLE fee_types DROP CONSTRAINT IF EXISTS fee_types_fee_code_unique;
DROP INDEX IF EXISTS fee_types_code_idx;

-- chart_of_accounts.code (explicit uniqueIndex)
DROP INDEX IF EXISTS coa_code_unique;

-- ─── Step 4: Create composite per-tenant unique indexes ───────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS hr_departments_tenant_name_idx
  ON hr_departments(tenant_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS hr_designations_tenant_name_idx
  ON hr_designations(tenant_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS hr_salary_grades_tenant_name_idx
  ON hr_salary_grades(tenant_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS hr_incentive_types_tenant_name_idx
  ON hr_incentive_types(tenant_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS hr_deduction_types_tenant_name_idx
  ON hr_deduction_types(tenant_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_staff_id_idx
  ON employees(tenant_id, staff_id);

CREATE UNIQUE INDEX IF NOT EXISTS fee_types_tenant_fee_code_idx
  ON fee_types(tenant_id, fee_code);

CREATE UNIQUE INDEX IF NOT EXISTS coa_tenant_code_unique
  ON chart_of_accounts(tenant_id, code);
`;

async function run() {
  const client = await pool.connect();
  try {
    const stmts = STATEMENTS
      .split(/\n/)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("--"))
      .join(" ")
      .split(";")
      .map(s => s.trim())
      .filter(Boolean);

    let ok = 0;
    let skip = 0;
    for (const stmt of stmts) {
      try {
        await client.query(stmt);
        ok++;
      } catch (e) {
        // 42P07 = relation already exists, 42710 = object already exists, 42P16 = bad CREATE UNIQUE INDEX (already a constraint)
        if (["42P07","42710","42P16","42704"].includes(e.code)) {
          skip++;
        } else {
          console.error(`FAIL [${e.code}]: ${e.message}\n  SQL: ${stmt.slice(0,120)}`);
        }
      }
    }
    console.log(`Done: ${ok} applied, ${skip} skipped (already existed).`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error("Migration failed:", err); process.exit(1); });
