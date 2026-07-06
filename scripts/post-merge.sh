#!/bin/bash
# Post-merge schema sync — applies only missing DDL directly to Neon via SQL.
#
# WHY NOT drizzle-kit push:
#   drizzle-kit 0.31.10 pulls the full remote schema before pushing; against
#   Neon this takes 3+ minutes (well over the 20-second CI timeout). It also
#   issues interactive TTY prompts for unique constraints on non-empty tables
#   that --force does not suppress. Both issues make it unreliable in CI.
#
# APPROACH: each block is guarded by an existence check (IF NOT EXISTS or a
#   pg_constraint / pg_indexes lookup), so the script is safe to re-run.
set -e

pnpm install --frozen-lockfile

node -e "
const { Client } = require('/home/runner/workspace/node_modules/.pnpm/pg@8.22.0/node_modules/pg');
(async () => {
  const c = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await c.connect();

  // ── challan_settings (added Task #34) ────────────────────────────────────
  await c.query(\`
    CREATE TABLE IF NOT EXISTS challan_settings (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      phone              TEXT,
      address            TEXT,
      show_section       BOOLEAN NOT NULL DEFAULT true,
      show_fee_desc      BOOLEAN NOT NULL DEFAULT true,
      show_bank_accounts BOOLEAN NOT NULL DEFAULT false,
      show_instructions  BOOLEAN NOT NULL DEFAULT true,
      hide_zero_rows     BOOLEAN NOT NULL DEFAULT false,
      bank_account_ids   TEXT,
      updated_at         TIMESTAMPTZ
    )
  \`);

  // Unique index on tenant_id (one row per tenant)
  const { rows: csIdx } = await c.query(
    \`SELECT 1 FROM pg_indexes WHERE tablename='challan_settings' AND indexname='challan_settings_tenant_uniq'\`
  );
  if (!csIdx.length) {
    await c.query(\`CREATE UNIQUE INDEX challan_settings_tenant_uniq ON challan_settings(tenant_id)\`);
    console.log('  + challan_settings_tenant_uniq index created');
  }

  // ── challan_settings.active_template + institution_code (Task #42) ──────
  await c.query(\`
    ALTER TABLE challan_settings
      ADD COLUMN IF NOT EXISTS active_template TEXT NOT NULL DEFAULT 'standard'
  \`);
  await c.query(\`
    ALTER TABLE challan_settings
      ADD COLUMN IF NOT EXISTS institution_code TEXT
  \`);

  // ── print_signatures (Task #46) ───────────────────────────────────────────
  await c.query(\`
    CREATE TABLE IF NOT EXISTS print_signatures (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      label       TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'signature',
      storage_key TEXT NOT NULL,
      url         TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  \`);

  // ── Task #49: flatten fee-type COA sub-groups (4100–4560) under 4000 ────────
  // Re-parents existing fee-type ledgers from 4100–4560 → 4000, then removes
  // the now-empty sub-group rows.  Safe to re-run (idempotent).
  await c.query(\`
    UPDATE chart_of_accounts child
       SET parent_id = parent4000.id,
           updated_at = NOW()
      FROM chart_of_accounts parent4000
     WHERE parent4000.code      = '4000'
       AND parent4000.tenant_id = child.tenant_id
       AND child.parent_id IN (
             SELECT id FROM chart_of_accounts
             WHERE code IN ('4100','4200','4300','4400','4500',
                            '4510','4520','4530','4540','4550','4560')
               AND tenant_id = child.tenant_id
           )
  \`);
  await c.query(\`
    DELETE FROM chart_of_accounts coa
     WHERE coa.code IN ('4100','4200','4300','4400','4500',
                        '4510','4520','4530','4540','4550','4560')
       AND NOT EXISTS (
             SELECT 1 FROM chart_of_accounts child WHERE child.parent_id = coa.id
           )
       AND NOT EXISTS (
             SELECT 1 FROM journal_entry_lines jel WHERE jel.account_id = coa.id
           )
  \`);
  console.log('  + Task #49: fee income sub-groups flattened');

  // ── Task #51: remove legacy hardcoded standalone COA ledgers ───────────────
  // Deletes unused, unlinked reference ledgers (source_module IS NULL) that no
  // module writes to.  Guarded by no-JE + no-children so an account with
  // transactions, or a parent of a live account, is never removed.  Leaf codes
  // first, then now-empty group headers.  Safe to re-run (idempotent).
  const t51Leaf = await c.query(\`
    DELETE FROM chart_of_accounts coa
     WHERE coa.source_module IS NULL
       AND coa.code IN ('1210','1300','1310','1320','1510','1520','1530','1540','1550','1560','1570','1580',
                        '1810','1820','1830','1840','1850','2110','2210','2220','2230','2300','2310','2320',
                        '2400','2410','2420','2610','2620','2630','2640','3010','3100','3200','3300','3400',
                        '3500','3600','3700','4610','4620','4630','4710','4720','4730','4740','4750','4760',
                        '5020','5040','5060','5070','5080','5510','5520','5530','5560','5570','5620','5630',
                        '5710','5720','5730','5740','5750','5760','5810','5820','5830','5840','5845','5848',
                        '5855','5860','5865','5870','5910','5920','5930','5955','5960','5965','5970')
       AND NOT EXISTS (SELECT 1 FROM journal_entry_lines jel WHERE jel.account_id = coa.id)
       AND NOT EXISTS (SELECT 1 FROM chart_of_accounts child WHERE child.parent_id = coa.id)
  \`);
  const t51Group = await c.query(\`
    DELETE FROM chart_of_accounts coa
     WHERE coa.source_module IS NULL
       AND coa.code IN ('1500','1800','2600','3000','4600','4700','5700','5800','5850','5900','5950')
       AND NOT EXISTS (SELECT 1 FROM journal_entry_lines jel WHERE jel.account_id = coa.id)
       AND NOT EXISTS (SELECT 1 FROM chart_of_accounts child WHERE child.parent_id = coa.id)
  \`);
  console.log('  + Task #51: removed legacy standalone COA ledgers (' + t51Leaf.rowCount + ' leaf, ' + t51Group.rowCount + ' group)');

  // ── career_positions.department / description (schema drift fix) ──────────
  // Table was missing these two nullable columns present in the Drizzle
  // schema, causing \"Failed to create position\" 500s on insert.
  await c.query(\`
    ALTER TABLE career_positions
      ADD COLUMN IF NOT EXISTS department TEXT,
      ADD COLUMN IF NOT EXISTS description TEXT
  \`);
  console.log('  + career_positions.department/description added');

  // ── Task #32: employee_salary_transactions.amount_paid ────────────────────
  // Tracks the actual amount paid (may be less than net_salary for partial
  // payments); nullable so pre-existing paid rows remain valid (amount
  // implicitly equals net_salary when null).
  await c.query(\`
    ALTER TABLE employee_salary_transactions
      ADD COLUMN IF NOT EXISTS amount_paid INTEGER
  \`);
  console.log('  + Task #32: employee_salary_transactions.amount_paid added');

  // ── Task #46: teacher_subject_assignments unique index (schema drift fix) ─
  // Drizzle schema defines a composite unique index on
  // (employee_id, class_id, subject_id) but it was never applied to the real
  // DB, causing ON CONFLICT upserts (teacher-load \"By Teacher\" grid save) to
  // fail with \"no unique or exclusion constraint matching\". Dedupe any
  // pre-existing duplicate rows first (keep the most recent by ctid) so the
  // unique index can be created.
  await c.query(\`
    DELETE FROM teacher_subject_assignments a
      USING teacher_subject_assignments b
     WHERE a.employee_id = b.employee_id
       AND a.class_id = b.class_id
       AND a.subject_id = b.subject_id
       AND a.ctid < b.ctid
  \`);
  const { rows: tsaIdx } = await c.query(
    \`SELECT 1 FROM pg_indexes WHERE tablename='teacher_subject_assignments' AND indexname='teacher_subject_assignments_unique'\`
  );
  if (!tsaIdx.length) {
    await c.query(\`CREATE UNIQUE INDEX teacher_subject_assignments_unique ON teacher_subject_assignments (employee_id, class_id, subject_id)\`);
    console.log('  + teacher_subject_assignments_unique index created');
  }

  // ── Task #12: guardians.email column ─────────────────────────────────────
  await c.query(\`
    ALTER TABLE guardians
      ADD COLUMN IF NOT EXISTS email TEXT
  \`);
  console.log('  + guardians.email added');

  // ── Task #14: backfill gr_format for existing tenants ────────────────────
  // For every tenant that has no gr_format row in admissions_settings, insert
  // a seed row using the tenant slug (uppercased, max 10 chars) as the prefix.
  // Logs a WARNING for any slug-derived prefix collision so ops can resolve it.
  const { rows: tenants14 } = await c.query(\`
    SELECT t.id, t.slug
      FROM tenants t
     WHERE NOT EXISTS (
       SELECT 1 FROM admissions_settings a
        WHERE a.key = 'gr_format:' || t.id::text
     )
  \`);
  const seenPrefixes14 = new Map();
  for (const t of tenants14) {
    const prefix = t.slug.toUpperCase().slice(0, 10);
    if (seenPrefixes14.has(prefix)) {
      console.warn('  WARNING: gr_format prefix collision — slug \"' + t.slug + '\" and \"' + seenPrefixes14.get(prefix) + '\" both map to prefix \"' + prefix + '\". Skipping \"' + t.slug + '\" — resolve manually.');
      continue;
    }
    // Also check against already-saved rows in admissions_settings
    const { rows: existing14 } = await c.query(
      \`SELECT key FROM admissions_settings WHERE key LIKE 'gr_format:%' AND value::jsonb->>'prefix' = \$1\`,
      [prefix]
    );
    if (existing14.length > 0) {
      console.warn('  WARNING: gr_format prefix \"' + prefix + '\" (from slug \"' + t.slug + '\") already claimed by ' + existing14[0].key + '. Skipping — resolve manually.');
      continue;
    }
    seenPrefixes14.set(prefix, t.slug);
    await c.query(
      \`INSERT INTO admissions_settings (key, value) VALUES (\$1, \$2) ON CONFLICT (key) DO NOTHING\`,
      [
        'gr_format:' + t.id,
        JSON.stringify({ prefix, separator: '-', includeYear: true, paddingDigits: '3', startingNumber: '1' })
      ]
    );
    console.log('  + gr_format seeded for tenant \"' + t.slug + '\" with prefix \"' + prefix + '\"');
  }
  if (tenants14.length === 0) console.log('  + Task #14: all tenants already have gr_format rows');

  // ── Task #74: students full_name consolidation + gr_number → applicant_id ──
  // Apply the two 0013 migrations that were never run against Neon.
  // All blocks are idempotent (IF NOT EXISTS / existence checks before rename).

  // 1a. Add full_name to students (backfill from first_name + last_name)
  await c.query(\`ALTER TABLE students ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT ''\`);
  // Only backfill while the source columns still exist (idempotent on re-run)
  const { rows: stuFnCol } = await c.query(
    \`SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='first_name'\`
  );
  if (stuFnCol.length) {
    await c.query(\`
      UPDATE students
         SET full_name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
       WHERE full_name = ''
    \`);
    await c.query(\`ALTER TABLE students DROP COLUMN IF EXISTS first_name\`);
    await c.query(\`ALTER TABLE students DROP COLUMN IF EXISTS last_name\`);
    console.log('  + students.full_name consolidated from first_name/last_name');
  }

  // 1b. Rename gr_number → applicant_id on students (if still unrenamed).
  // Also handles the fallback case where neither column exists yet by adding it.
  const { rows: stuGr } = await c.query(
    \`SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='gr_number'\`
  );
  if (stuGr.length) {
    await c.query(\`ALTER TABLE students RENAME COLUMN gr_number TO applicant_id\`);
    console.log('  + students.gr_number renamed to applicant_id');
  }
  // Fallback: if applicant_id still doesn't exist (e.g. column was never created
  // under either name), add it and backfill from application_id or generate a
  // synthetic GR so the NOT NULL + unique constraints can be enforced.
  await c.query(\`ALTER TABLE students ADD COLUMN IF NOT EXISTS applicant_id TEXT\`);
  // Backfill any rows that ended up with a NULL applicant_id. Use a CTE with
  // ROW_NUMBER so each row gets a unique fallback value (window functions cannot
  // appear directly inside a subquery used in UPDATE SET).
  await c.query(\`
    WITH numbered AS (
      SELECT s.id,
             a.reference_id AS app_ref,
             ROW_NUMBER() OVER (ORDER BY s.created_at, s.id) AS rn
        FROM students s
        LEFT JOIN applications a ON a.id = s.application_id
       WHERE s.applicant_id IS NULL
    )
    UPDATE students s
       SET applicant_id = COALESCE(n.app_ref, 'GR-MIGRATED-' || n.rn::TEXT)
      FROM numbered n
     WHERE s.id = n.id
       AND s.applicant_id IS NULL
  \`);
  // Enforce NOT NULL — safe now that every row has a value
  await c.query(\`ALTER TABLE students ALTER COLUMN applicant_id SET NOT NULL\`);
  console.log('  + students.applicant_id NOT NULL enforced');

  // 1c. Fix students indexes — rename old index if still present, then guarantee
  //     the canonical unique index exists regardless of prior naming.
  const { rows: oldIdx } = await c.query(
    \`SELECT 1 FROM pg_indexes WHERE tablename='students' AND indexname='students_gr_number_idx'\`
  );
  if (oldIdx.length) {
    await c.query(\`ALTER INDEX students_gr_number_idx RENAME TO students_applicant_id_idx\`);
    console.log('  + students_gr_number_idx renamed to students_applicant_id_idx');
  }
  // Drop redundant unique constraint from old schema if still present
  // (it's a table constraint, not a plain index, so must use DROP CONSTRAINT)
  const { rows: dupCon } = await c.query(
    \`SELECT 1 FROM pg_constraint WHERE conname='students_gr_number_unique' AND conrelid='students'::regclass\`
  );
  if (dupCon.length) {
    await c.query(\`ALTER TABLE students DROP CONSTRAINT IF EXISTS students_gr_number_unique\`);
    console.log('  + students_gr_number_unique constraint (duplicate) dropped');
  }
  // Guarantee the canonical unique index exists (CREATE IF NOT EXISTS equivalent)
  const { rows: aidIdx } = await c.query(
    \`SELECT 1 FROM pg_indexes WHERE tablename='students' AND indexname='students_applicant_id_idx'\`
  );
  if (!aidIdx.length) {
    await c.query(\`CREATE UNIQUE INDEX students_applicant_id_idx ON students (applicant_id)\`);
    console.log('  + students_applicant_id_idx unique index created');
  }

  // 1d. Post-migration verification — log diagnostics so deploy logs confirm health
  const { rows: stuVerify } = await c.query(\`
    SELECT
      COUNT(*)                                           AS total_rows,
      COUNT(*) FILTER (WHERE applicant_id IS NULL)       AS null_applicant_id,
      COUNT(*) FILTER (WHERE full_name    IS NULL OR full_name = '') AS empty_full_name,
      COUNT(*) - COUNT(DISTINCT applicant_id)            AS duplicate_applicant_ids
    FROM students
  \`);
  const sv = stuVerify[0];
  if (Number(sv.null_applicant_id) > 0 || Number(sv.duplicate_applicant_ids) > 0) {
    throw new Error(
      'students post-migration check FAILED: ' +
      sv.null_applicant_id + ' null applicant_id, ' +
      sv.duplicate_applicant_ids + ' duplicate applicant_ids'
    );
  }
  console.log(
    '  ✓ students verified: ' + sv.total_rows + ' rows, ' +
    sv.empty_full_name + ' empty full_name, 0 null/duplicate applicant_id'
  );

  // 2. Rename gr_number → applicant_id on library_issues
  const { rows: libGr } = await c.query(
    \`SELECT 1 FROM information_schema.columns WHERE table_name='library_issues' AND column_name='gr_number'\`
  );
  if (libGr.length) {
    await c.query(\`ALTER TABLE library_issues RENAME COLUMN gr_number TO applicant_id\`);
    console.log('  + library_issues.gr_number renamed to applicant_id');
  }

  // 3. Rename gr_number → applicant_id on hostel_allocations
  const { rows: hosGr } = await c.query(
    \`SELECT 1 FROM information_schema.columns WHERE table_name='hostel_allocations' AND column_name='gr_number'\`
  );
  if (hosGr.length) {
    await c.query(\`ALTER TABLE hostel_allocations RENAME COLUMN gr_number TO applicant_id\`);
    console.log('  + hostel_allocations.gr_number renamed to applicant_id');
  }

  // 4. Rename gr_number → applicant_id on gate_outpass (+ index)
  const { rows: gateGr } = await c.query(
    \`SELECT 1 FROM information_schema.columns WHERE table_name='gate_outpass' AND column_name='gr_number'\`
  );
  if (gateGr.length) {
    await c.query(\`ALTER TABLE gate_outpass RENAME COLUMN gr_number TO applicant_id\`);
    console.log('  + gate_outpass.gr_number renamed to applicant_id');
  }
  const { rows: gateIdx } = await c.query(
    \`SELECT 1 FROM pg_indexes WHERE tablename='gate_outpass' AND indexname='gate_outpass_gr_idx'\`
  );
  if (gateIdx.length) {
    await c.query(\`ALTER INDEX gate_outpass_gr_idx RENAME TO gate_outpass_applicant_id_idx\`);
    console.log('  + gate_outpass_gr_idx renamed to gate_outpass_applicant_id_idx');
  }

  // 5. Rename gr_number → applicant_id on medical_visits
  const { rows: medGr } = await c.query(
    \`SELECT 1 FROM information_schema.columns WHERE table_name='medical_visits' AND column_name='gr_number'\`
  );
  if (medGr.length) {
    await c.query(\`ALTER TABLE medical_visits RENAME COLUMN gr_number TO applicant_id\`);
    console.log('  + medical_visits.gr_number renamed to applicant_id');
  }

  // 6. Add full_name to employees (backfill from first_name + last_name)
  await c.query(\`ALTER TABLE employees ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT ''\`);
  const { rows: empFnCol } = await c.query(
    \`SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='first_name'\`
  );
  if (empFnCol.length) {
    await c.query(\`
      UPDATE employees
         SET full_name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
       WHERE full_name = ''
    \`);
    await c.query(\`ALTER TABLE employees DROP COLUMN IF EXISTS first_name\`);
    await c.query(\`ALTER TABLE employees DROP COLUMN IF EXISTS last_name\`);
    console.log('  + employees.full_name consolidated from first_name/last_name');
  }

  // 7. Add full_name to applications (backfill from first_name + last_name)
  await c.query(\`ALTER TABLE applications ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT ''\`);
  const { rows: appFnCol } = await c.query(
    \`SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='first_name'\`
  );
  if (appFnCol.length) {
    await c.query(\`
      UPDATE applications
         SET full_name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
       WHERE full_name = ''
    \`);
    await c.query(\`ALTER TABLE applications DROP COLUMN IF EXISTS first_name\`);
    await c.query(\`ALTER TABLE applications DROP COLUMN IF EXISTS last_name\`);
    console.log('  + applications.full_name consolidated from first_name/last_name');
  }

  // ── Per-tenant unique indexes for applicant_id and reference_id ──────────
  // Drop old global constraints; replace with composite (tenant_id, col) so
  // each tenant has its own independent ID namespace.

  // students.applicant_id
  await c.query(\`ALTER TABLE students DROP CONSTRAINT IF EXISTS students_applicant_id_unique\`);
  const { rows: studGlobalIdx } = await c.query(
    \`SELECT indexdef FROM pg_indexes WHERE tablename='students' AND indexname='students_applicant_id_idx'\`
  );
  if (studGlobalIdx.length && !studGlobalIdx[0].indexdef.includes('tenant_id')) {
    await c.query(\`DROP INDEX IF EXISTS students_applicant_id_idx\`);
    await c.query(\`CREATE UNIQUE INDEX students_applicant_id_idx ON students(tenant_id, applicant_id)\`);
    console.log('  + students_applicant_id_idx changed to (tenant_id, applicant_id)');
  } else if (!studGlobalIdx.length) {
    await c.query(\`CREATE UNIQUE INDEX IF NOT EXISTS students_applicant_id_idx ON students(tenant_id, applicant_id)\`);
    console.log('  + students_applicant_id_idx created on (tenant_id, applicant_id)');
  }

  // applications.reference_id
  await c.query(\`ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_reference_id_unique\`);
  await c.query(\`DROP INDEX IF EXISTS applications_reference_idx\`);
  const { rows: appRefTenantIdx } = await c.query(
    \`SELECT 1 FROM pg_indexes WHERE tablename='applications' AND indexname='applications_reference_tenant_idx'\`
  );
  if (!appRefTenantIdx.length) {
    await c.query(\`CREATE UNIQUE INDEX applications_reference_tenant_idx ON applications(tenant_id, reference_id)\`);
    console.log('  + applications_reference_tenant_idx created on (tenant_id, reference_id)');
  }

  // ── Future schema changes: add new blocks above this line ─────────────────

  console.log('post-merge schema sync complete');
  await c.end();
})().catch(e => { console.error('SCHEMA SYNC FAILED:', e.message); process.exit(1); });
" 2>&1 | grep -v 'Warning\|SECURITY\|pg-connection\|libpq\|trace-warnings\|To prepare\|sslmode\|uselibpqcompat'
