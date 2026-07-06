-- ============================================================================
-- Migration 001: Tenant Row Level Security Policies
-- Applied via: node artifacts/api-server/scripts/apply-rls-force.mjs
-- Safe to re-run: all operations in apply-rls-force.mjs are idempotent.
-- ============================================================================
--
-- Three-role model:
--   app_user      — restricted runtime role; subject to tenant isolation policies.
--                   Used by withTenantRead / withTenantCtx (SET LOCAL ROLE app_user).
--   neondb_owner  — application runtime user (table owner); has owner-scoped policy
--                   that requires app.current_tenant to be set. The request middleware
--                   sets this via set_config('app.current_tenant', tenantId, false).
--   ccm_migration — privileged migration/seed role; has USING (true) bypass.
--                   Only used in migration scripts (SET ROLE ccm_migration).
--
-- FORCE ROW LEVEL SECURITY is applied to all tables below, ensuring that even the
-- table owner (neondb_owner) is subject to the owner_scoped policy.
-- ============================================================================

-- Step 1: Enable FORCE RLS on all tenant-scoped tables
ALTER TABLE employees              ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees              FORCE ROW LEVEL SECURITY;
ALTER TABLE hr_departments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_departments         FORCE ROW LEVEL SECURITY;
ALTER TABLE hr_designations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_designations        FORCE ROW LEVEL SECURITY;
ALTER TABLE hr_salary_grades       ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_salary_grades       FORCE ROW LEVEL SECURITY;
ALTER TABLE hr_incentive_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_incentive_types     FORCE ROW LEVEL SECURITY;
ALTER TABLE hr_deduction_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_deduction_types     FORCE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts      FORCE ROW LEVEL SECURITY;
ALTER TABLE fee_types              ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_types              FORCE ROW LEVEL SECURITY;
ALTER TABLE fee_schedule           ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_schedule           FORCE ROW LEVEL SECURITY;
ALTER TABLE fee_challans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_challans           FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions   FORCE ROW LEVEL SECURITY;
ALTER TABLE academic_terms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_terms         FORCE ROW LEVEL SECURITY;
ALTER TABLE academic_years         ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years         FORCE ROW LEVEL SECURITY;
ALTER TABLE classes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes                FORCE ROW LEVEL SECURITY;
ALTER TABLE class_academic_years   ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_academic_years   FORCE ROW LEVEL SECURITY;
ALTER TABLE class_sections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sections         FORCE ROW LEVEL SECURITY;
ALTER TABLE class_subjects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subjects         FORCE ROW LEVEL SECURITY;
ALTER TABLE sections               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections               FORCE ROW LEVEL SECURITY;
ALTER TABLE section_allocations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_allocations    FORCE ROW LEVEL SECURITY;
ALTER TABLE subjects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects               FORCE ROW LEVEL SECURITY;
ALTER TABLE applications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications           FORCE ROW LEVEL SECURITY;
ALTER TABLE students               ENABLE ROW LEVEL SECURITY;
ALTER TABLE students               FORCE ROW LEVEL SECURITY;
ALTER TABLE admin_users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users            FORCE ROW LEVEL SECURITY;
ALTER TABLE media_library          ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_library          FORCE ROW LEVEL SECURITY;
ALTER TABLE site_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings          FORCE ROW LEVEL SECURITY;
ALTER TABLE site_announcements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_announcements     FORCE ROW LEVEL SECURITY;
ALTER TABLE site_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_events            FORCE ROW LEVEL SECURITY;
ALTER TABLE site_gallery           ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_gallery           FORCE ROW LEVEL SECURITY;
ALTER TABLE site_menu_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_menu_items        FORCE ROW LEVEL SECURITY;
ALTER TABLE site_page_blocks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_page_blocks       FORCE ROW LEVEL SECURITY;

-- Step 2: Create roles
CREATE ROLE app_user NOLOGIN;
CREATE ROLE ccm_migration NOLOGIN;
GRANT app_user TO neondb_owner;
GRANT ccm_migration TO neondb_owner;

-- Step 3: Grant table permissions
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA public TO ccm_migration;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ccm_migration;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ccm_migration;

-- Step 4: Enforce NOT NULL + FK on tenant_id columns
ALTER TABLE hr_departments  ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE hr_designations ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE hr_salary_grades ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE hr_incentive_types ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE hr_deduction_types ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE employees       ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE fee_types       ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE chart_of_accounts ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE hr_departments  ADD CONSTRAINT hr_departments_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE hr_designations ADD CONSTRAINT hr_designations_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE hr_salary_grades ADD CONSTRAINT hr_salary_grades_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE hr_incentive_types ADD CONSTRAINT hr_incentive_types_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE hr_deduction_types ADD CONSTRAINT hr_deduction_types_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE employees ADD CONSTRAINT employees_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE fee_types ADD CONSTRAINT fee_types_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE chart_of_accounts ADD CONSTRAINT chart_of_accounts_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

-- Step 5: Per-table RLS policies (representative examples shown;
--         full list applied dynamically by apply-rls-force.mjs for all 51 tables)

-- Pattern A: app_user — strict tenant isolation (used by withTenantRead/withTenantCtx)
CREATE POLICY employees_tenant_isolation
  ON employees TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

CREATE POLICY hr_departments_tenant_isolation
  ON hr_departments TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

CREATE POLICY fee_types_tenant_isolation
  ON fee_types TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

CREATE POLICY chart_of_accounts_tenant_isolation
  ON chart_of_accounts TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- Pattern B: neondb_owner (table owner) — scoped to app.current_tenant.
--            Middleware sets this at session level; withTenantCtx sets it LOCAL per tx.
--            Ensures that a missed WHERE clause cannot expose cross-tenant data.
CREATE POLICY employees_owner_scoped
  ON employees TO neondb_owner
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

CREATE POLICY hr_departments_owner_scoped
  ON hr_departments TO neondb_owner
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

CREATE POLICY fee_types_owner_scoped
  ON fee_types TO neondb_owner
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

CREATE POLICY chart_of_accounts_owner_scoped
  ON chart_of_accounts TO neondb_owner
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- Pattern C: ccm_migration — unrestricted bypass for migration/seed scripts only.
CREATE POLICY employees_migration_bypass
  ON employees TO ccm_migration USING (true) WITH CHECK (true);
CREATE POLICY hr_departments_migration_bypass
  ON hr_departments TO ccm_migration USING (true) WITH CHECK (true);
CREATE POLICY fee_types_migration_bypass
  ON fee_types TO ccm_migration USING (true) WITH CHECK (true);
CREATE POLICY chart_of_accounts_migration_bypass
  ON chart_of_accounts TO ccm_migration USING (true) WITH CHECK (true);

-- NOTE: The full set of 51 tables (plus all three policy patterns for each) is
-- applied dynamically by apply-rls-force.mjs which is idempotent and re-runnable.
-- Run: node artifacts/api-server/scripts/apply-rls-force.mjs
