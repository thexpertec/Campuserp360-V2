import { Router, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { db } from "@workspace/db";
import { requireAdmin } from "../lib/admin-auth";
import { logger } from "../lib/logger";
import { sql } from "drizzle-orm";

const router = Router();

const BACKUPS_DIR = path.resolve(process.cwd(), "backups");

function ensureDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Tables to export in every backup (in dependency order — parents before children)
const BACKUP_TABLES = [
  "tenants",
  "tenant_admin_users",
  "admin_users",
  "admin_user_roles",
  "applications",
  "application_events",
  "application_documents",
  "students",
  "student_documents",
  "student_disciplinary",
  "academic_years",
  "class_categories",
  "classes",
  "sections",
  "class_sections",
  "subjects",
  "class_subjects",
  "class_academic_years",
  "houses",
  "affiliations",
  "academic_terms",
  "section_allocations",
  "fee_types",
  "fee_schedule",
  "fee_challans",
  "test_centres",
  "test_schedules",
  "interviewers",
  "hr_departments",
  "hr_salary_grades",
  "hr_designations",
  "hr_incentive_types",
  "hr_deduction_types",
  "employees",
  "employee_salary_transactions",
  "employee_attendances",
  "bank_accounts",
  "chart_of_accounts",
  "journal_entries",
  "journal_entry_lines",
  "hostel_rooms",
  "hostel_allocations",
  "library_books",
  "library_issues",
  "print_settings",
  "admissions_settings",
  "announcements",
  "noticeboard_items",
  "events",
  "vendors",
  "vendor_bills",
  "vendor_bill_items",
];

async function dumpAllTables(): Promise<Record<string, unknown[]>> {
  const result: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    try {
      const rows = await db.execute(sql.raw(`SELECT * FROM "${table}"`));
      result[table] = rows.rows;
    } catch {
      // Table may not exist yet (optional modules) — skip silently
      result[table] = [];
    }
  }
  return result;
}

function listBackups() {
  ensureDir();
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((filename) => {
      const fp = path.join(BACKUPS_DIR, filename);
      const stat = fs.statSync(fp);
      return {
        filename,
        createdAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        sizeMb: (stat.size / 1024 / 1024).toFixed(2),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pruneOldBackups(keepCount = 7) {
  const all = listBackups();
  if (all.length > keepCount) {
    const toDelete = all.slice(keepCount);
    for (const b of toDelete) {
      try { fs.unlinkSync(path.join(BACKUPS_DIR, b.filename)); } catch {}
    }
  }
}

// ── POST /api/admin/backup/run ─────────────────────────────────────────────────
router.post("/admin/backup/run", requireAdmin, async (_req: Request, res: Response) => {
  try {
    ensureDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `ccm-backup-${timestamp}.json`;
    const filepath = path.join(BACKUPS_DIR, filename);

    const tables = await dumpAllTables();
    const totalRows = Object.values(tables).reduce((s, t) => s + t.length, 0);

    const payload = {
      meta: {
        version: 1,
        createdAt: new Date().toISOString(),
        tables: Object.keys(tables),
        totalRows,
      },
      data: tables,
    };

    // Compact JSON + async write: pretty-printing a full-DB dump doubles the
    // CPU/memory cost, and a sync write blocks the event loop for the whole file.
    await fs.promises.writeFile(filepath, JSON.stringify(payload), "utf8");

    const stat = fs.statSync(filepath);
    pruneOldBackups(7);

    logger.info({ filename, totalRows, sizeBytes: stat.size }, "Backup created");
    return res.json({
      filename,
      createdAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      sizeMb: (stat.size / 1024 / 1024).toFixed(2),
      totalRows,
    });
  } catch (err) {
    logger.error({ err }, "Backup failed");
    return res.status(500).json({ error: "Backup failed" });
  }
});

// ── GET /api/admin/backup/list ─────────────────────────────────────────────────
router.get("/admin/backup/list", requireAdmin, (_req: Request, res: Response) => {
  try {
    return res.json(listBackups());
  } catch (err) {
    logger.error({ err }, "Failed to list backups");
    return res.status(500).json({ error: "Failed to list backups" });
  }
});

// ── GET /api/admin/backup/download/:filename ───────────────────────────────────
router.get("/admin/backup/download/:filename", requireAdmin, (req: Request, res: Response) => {
  try {
    const { filename } = req.params as Record<string, string>;
    if (!filename || !/^ccm-backup-[\w-]+\.json$/.test(filename)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const filepath = path.join(BACKUPS_DIR, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: "Backup not found" });
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    return res.sendFile(filepath);
  } catch (err) {
    logger.error({ err }, "Backup download failed");
    return res.status(500).json({ error: "Download failed" });
  }
});

// ── DELETE /api/admin/backup/:filename ─────────────────────────────────────────
router.delete("/admin/backup/:filename", requireAdmin, (req: Request, res: Response) => {
  try {
    const { filename } = req.params as Record<string, string>;
    if (!filename || !/^ccm-backup-[\w-]+\.json$/.test(filename)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const filepath = path.join(BACKUPS_DIR, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: "Backup not found" });
    fs.unlinkSync(filepath);
    logger.info({ filename }, "Backup deleted");
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Backup delete failed");
    return res.status(500).json({ error: "Delete failed" });
  }
});

// ── Exported helper: auto-backup at startup if last backup > 20h old ──────────
export async function autoBackupIfStale() {
  try {
    ensureDir();
    const existing = listBackups();
    if (existing.length > 0) {
      const latest = new Date(existing[0].createdAt).getTime();
      const ageHours = (Date.now() - latest) / 3_600_000;
      if (ageHours < 20) {
        logger.info({ ageHours: ageHours.toFixed(1) }, "Auto-backup skipped — recent backup exists");
        return;
      }
    }

    logger.info("Auto-backup: creating startup backup…");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `ccm-backup-${timestamp}.json`;
    const filepath = path.join(BACKUPS_DIR, filename);

    const tables = await dumpAllTables();
    const totalRows = Object.values(tables).reduce((s, t) => s + t.length, 0);
    const payload = {
      meta: { version: 1, createdAt: new Date().toISOString(), tables: Object.keys(tables), totalRows },
      data: tables,
    };
    await fs.promises.writeFile(filepath, JSON.stringify(payload), "utf8");
    pruneOldBackups(7);

    const stat = fs.statSync(filepath);
    logger.info({ filename, totalRows, sizeMb: (stat.size / 1024 / 1024).toFixed(2) }, "Auto-backup complete");
  } catch (err) {
    logger.error({ err }, "Auto-backup failed — continuing startup");
  }
}

export default router;
