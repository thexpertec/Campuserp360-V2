import app from "./app";
import { logger } from "./lib/logger";
import { r2Configured } from "./lib/storage";
import { seedDemoApplication } from "./lib/seed";
import { seedAcademic } from "./lib/seed-academic";
import { seedBulkDemoData } from "./lib/seed-bulk";
import { seedAllData } from "./lib/seed-data";
import { autoSeedCoa } from "./routes/coa";
import { migrateVendorBills, migrateVendors } from "./routes/vendorBills";
import { migrateLibrary } from "./routes/library";
import { migrateMedical } from "./routes/medical";
import { migrateAccountPayments } from "./routes/accountPayments";
import { migrateVouchers } from "./routes/vouchers";
import { migrateGuardians } from "./routes/guardians";
import { migrateAdminSystem } from "./lib/migrate-admin";
import { migrateSaas } from "./lib/migrate-saas";
import { migrateExamScheduleYears } from "./lib/migrate-exam-years";
import { migrateStudentEnrollments } from "./lib/migrate-student-enrollments";
import { migrateTenants } from "./lib/migrate-tenants";
import { migrateTenantModulePermissions } from "./lib/migrate-tenant-modules";
import { migrateRateLimit } from "./lib/migrate-rate-limit";
import { migrateBForm } from "./lib/migrate-bform";
import { migrateFormConfig } from "./lib/migrate-form-config";
import { migratePaymentConfig } from "./lib/migrate-payment-config";
import { migrateGatewayCredentials } from "./lib/migrate-gateway-credentials";
import { migrateModuleTenants } from "./lib/migrate-module-tenants";
import { migrateUniqueConstraints } from "./lib/migrate-unique-constraints";
import { migrateJournalEntries } from "./lib/migrate-journal-entries";
import { migratePrintTemplates } from "./lib/migrate-print-templates";
import { migrateAttendanceModes } from "./lib/migrate-attendance-modes";
import { migrateSaasAdminAccount } from "./lib/migrate-saas-admin-account";
import { autoBackupIfStale } from "./routes/backup";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startup() {
  if (!r2Configured) {
    logger.warn(
      "⚠  R2 object storage is NOT configured — file uploads will be saved to local disk (ephemeral). " +
      "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL secrets to enable durable cloud storage.",
    );
  } else {
    logger.info("✓  Cloudflare R2 object storage configured — uploads will be stored in R2.");
  }

  // ── Phase 1: Open the port FIRST ─────────────────────────────────────────────
  // The deployment platform enforces a strict (~60s) window for the artifact to
  // open its port and pass the GET /api health-check. Schema migrations against
  // the live database (DDL + backfills, plus cross-region/cold-start latency)
  // can exceed that window and previously prevented the port from ever opening,
  // failing the deploy. Open the port immediately, then run migrations + seed in
  // the background. The migrations are idempotent (CREATE/ALTER … IF NOT EXISTS)
  // and the production database already has the full schema applied, so serving
  // requests before they finish is safe; a brand-new database simply returns
  // empty collections until migrations + seeds complete.
  await new Promise<void>((resolve, reject) => {
    app.listen(port, (err?: Error) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        reject(err);
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
      resolve();
    });
  });

  // ── Phase 2: Schema migrations + seed (background) ───────────────────────────
  // Fire-and-forget: a migration or seed failure must NOT take the server down.
  void (async () => {
    logger.info("Running schema migrations…");
    try {
      await Promise.all([
        migrateAdminSystem(),
        migrateSaas(),
        migrateSaasAdminAccount(),
        migrateVendorBills(),
        migrateRateLimit(),
        migrateBForm(),
        migrateAccountPayments(),
        migrateVouchers(),
      ]);

      // migrateGuardians must run after the core schema exists (it ALTERs the
      // students table which is created by the main Drizzle schema on first boot).
      await migrateGuardians();

      await migrateExamScheduleYears();
      await migrateStudentEnrollments();

      // Per-tenant website CMS: add tenant_id columns, backfill existing content to
      // CCM, rebuild site_settings PK, and ensure the GCCM tenant + admin exist.
      // Must run before seedAllData so its per-tenant settings loop sees all tenants.
      await migrateTenants();
      // Must run after migrateTenants() so the tenants table is guaranteed to exist
      // for the CROSS JOIN seed of per-tenant form-config rows.
      await migrateFormConfig();
      // Same dependency: tenants table must exist before payment config table is created.
      await migratePaymentConfig();
      // Same dependency: tenants table must exist before gateway credentials table is created.
      await migrateGatewayCredentials();
      // Must run after migrateTenants() so CCM tenant exists for backfill
      await migrateVendors();
      // Library + medical tenant_id columns + CCM backfill
      await migrateLibrary();
      await migrateMedical();
      // Tenant module permissions table + backfill all tenants with all module keys.
      // Must run after migrateTenants() (and migrateSaas()) so tenants table exists.
      await migrateTenantModulePermissions();
      // Adds tenant_id to module tables (timetable, exams, sports, store, transport,
      // syllabus, bank_accounts, events, calendar) and backfills existing rows to CCM.
      await migrateModuleTenants();
      // Replaces global unique constraints with composite (tenant_id, name/code) indexes
      // so uniqueness is enforced per-tenant rather than globally.
      await migrateUniqueConstraints();
      await migrateJournalEntries();
      await migratePrintTemplates();
      // Configurable staff attendance (Task 83): per-employee attendance mode +
      // scheduled hours, hr_attendance rollup columns + one-row-per-day unique
      // index, per-lecture attendance table, and teacher_employee_id backfill.
      // Runs after migrateModuleTenants() so timetable_slots.tenant_id exists.
      await migrateAttendanceModes();

      logger.info("Schema migrations complete.");
    } catch (err) {
      logger.error({ err }, "Schema migrations failed — server remains up but some features may be unavailable");
    }

    // Each fire-and-forget seed call below is individually guarded with .catch()
    // — without it, a rejection surfaces as an unhandled promise rejection AFTER
    // this try/catch has already returned (since the calls aren't awaited here),
    // and Node's default behavior for an unhandled rejection is to crash the
    // whole process. That previously caused an intermittent crash-loop in
    // production: the deploy would boot, serve real traffic fine, then die and
    // restart whenever one of these seeds hit a transient/race-y failure (e.g.
    // a unique-constraint conflict from concurrent per-tenant seeding).
    void seedDemoApplication().catch((err: unknown) => {
      logger.error({ err }, "seedDemoApplication failed — server remains up");
    });
    void seedAcademic().catch((err: unknown) => {
      logger.error({ err }, "seedAcademic failed — server remains up");
    });
    void seedBulkDemoData().catch((err: unknown) => {
      logger.error({ err }, "seedBulkDemoData failed — server remains up");
    });
    try {
      await seedAllData();
      await autoSeedCoa();
      logger.info("Startup seed complete.");
      void autoBackupIfStale().catch((err: unknown) => {
        logger.error({ err }, "autoBackupIfStale failed — server remains up");
      });
    } catch (err) {
      logger.error({ err }, "Startup seed failed — server remains up");
    }
  })();
}

void startup();
