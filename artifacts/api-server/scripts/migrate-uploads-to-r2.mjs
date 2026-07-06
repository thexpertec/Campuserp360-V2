/**
 * migrate-uploads-to-r2.mjs
 *
 * One-time (but idempotent, safe to re-run) migration that moves legacy
 * local-disk uploads into the Cloudflare R2 bucket and rewrites DB file
 * references so records point at R2-backed keys.
 *
 * What it does, in order:
 *   1. Scans the local `uploads/` directory (recursively) and uploads every
 *      file to R2 under the same key (relative path). Files whose key already
 *      exists in R2 are skipped — never overwritten.
 *   2. Rewrites DB-stored file references:
 *        - PUBLIC columns (photos, media, receipts, print/template assets):
 *          bare filenames, `/uploads/<key>` paths, and old full R2 public
 *          URLs become `/api/media/<key>` proxy URLs.
 *        - PRIVATE columns (student/employee/application documents):
 *          bare filenames and `/uploads/<key>` paths become structured
 *          object keys (e.g. `student-docs/<file>`), which the API serves
 *          via short-lived signed URLs.
 *      A reference is only rewritten when the object actually exists in R2
 *      (uploaded in step 1 or already present). References whose object is
 *      missing from R2 are left untouched so the legacy local-disk
 *      resolution keeps working, and are reported at the end.
 *   3. Rewrites `/uploads/media/...` URLs embedded in site_page_blocks HTML
 *      content to `/api/media/media/...` (same existence guard).
 *
 * Usage:
 *   Dry run (report what would change, write nothing):
 *     node artifacts/api-server/scripts/migrate-uploads-to-r2.mjs --dry-run
 *   Real run:
 *     node artifacts/api-server/scripts/migrate-uploads-to-r2.mjs
 *   Custom uploads directory (defaults to <repo root>/uploads, falling back
 *   to artifacts/api-server/uploads if only that exists):
 *     node artifacts/api-server/scripts/migrate-uploads-to-r2.mjs --uploads-dir /path/to/uploads
 *
 * Running against PRODUCTION:
 *   The script talks to whatever database NEON_DATABASE_URL / DATABASE_URL
 *   points at, and whatever bucket the R2_* env vars point at. In the Replit
 *   production deployment both are already set, so run it from a production
 *   shell (or locally with the production DATABASE_URL exported) AFTER
 *   deploying with the R2 secrets in place:
 *     DATABASE_URL=<prod url> node artifacts/api-server/scripts/migrate-uploads-to-r2.mjs --dry-run
 *   Review the dry-run output, then re-run without --dry-run.
 *   If production still has files on its local disk (pre-R2 uploads), run the
 *   script on that machine so step 1 can see them; DB-reference rewriting
 *   (steps 2–3) works from anywhere.
 *
 * Requirements: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET_NAME, R2_PUBLIC_URL, and NEON_DATABASE_URL or DATABASE_URL.
 *
 * RLS note: the script uses SET ROLE ccm_migration (bypass policies) so it
 * can see and update rows across all tenants, matching apply-rls-force.mjs.
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

// Load .env fallback (same pattern as apply-rls-force.mjs)
if (!process.env.NEON_DATABASE_URL && !process.env.DATABASE_URL) {
  const envFile = path.join(repoRoot, ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const requireFromDb = createRequire(path.join(repoRoot, "lib/db/package.json"));
const pg = requireFromDb("pg");
const requireFromApi = createRequire(path.join(repoRoot, "artifacts/api-server/package.json"));
const { S3Client, PutObjectCommand, HeadObjectCommand } = requireFromApi("@aws-sdk/client-s3");

// ── Config ────────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const uploadsDirArgIdx = process.argv.indexOf("--uploads-dir");
const R2_ACCOUNT_ID        = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID     = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME       = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL        = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
const DB_URL               = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
  console.error("Missing R2 env vars (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL). Aborting.");
  process.exit(1);
}
if (!DB_URL) {
  console.error("Missing NEON_DATABASE_URL / DATABASE_URL. Aborting.");
  process.exit(1);
}

function resolveUploadsDir() {
  if (uploadsDirArgIdx !== -1 && process.argv[uploadsDirArgIdx + 1]) {
    return path.resolve(process.argv[uploadsDirArgIdx + 1]);
  }
  // api-server runs with cwd = artifacts/api-server, so its uploads dir is the
  // primary location; also check repo root for safety.
  const candidates = [
    path.join(repoRoot, "artifacts/api-server/uploads"),
    path.join(repoRoot, "uploads"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return candidates[0];
}
const UPLOADS_DIR = resolveUploadsDir();

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

// ── Content-type guess ────────────────────────────────────────────────────────
const MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".pdf": "application/pdf", ".txt": "text/plain", ".bin": "application/octet-stream",
};
const guessMime = (file) => MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";

// ── R2 helpers (with existence cache for idempotency + speed) ─────────────────
const existsCache = new Map();
async function objectExists(key) {
  if (existsCache.has(key)) return existsCache.get(key);
  let exists = false;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    exists = true;
  } catch (e) {
    if (e?.$metadata?.httpStatusCode && e.$metadata.httpStatusCode !== 404 && e.name !== "NotFound") {
      throw e; // real error (auth, network) — do not treat as "missing"
    }
  }
  existsCache.set(key, exists);
  return exists;
}
async function uploadFile(key, filePath) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: fs.readFileSync(filePath),
    ContentType: guessMime(filePath),
  }));
  existsCache.set(key, true);
}

// ── Key derivation (mirrors storage.ts urlToKey semantics) ────────────────────
function storedToKey(stored, legacyPrefix) {
  if (!stored) return null;
  if (stored.startsWith(R2_PUBLIC_URL + "/")) return stored.slice(R2_PUBLIC_URL.length + 1);
  if (stored.startsWith("/api/media/")) return stored.slice("/api/media/".length);
  if (stored.startsWith("/uploads/"))   return stored.slice("/uploads/".length);
  if (stored.startsWith("https://") || stored.startsWith("http://")) return null; // foreign URL — leave alone
  if (stored.includes("/")) return stored;       // already a structured key
  return legacyPrefix + stored;                  // bare legacy filename
}

// ── Column map ────────────────────────────────────────────────────────────────
// kind: "public"  → canonical stored value is `/api/media/<key>`
//       "private" → canonical stored value is the bare object key
const COLUMNS = [
  { table: "students",              id: "id", column: "photo_filename", legacyPrefix: "",               kind: "public"  },
  { table: "employees",             id: "id", column: "photo_filename", legacyPrefix: "",               kind: "public"  },
  { table: "applications",          id: "id", column: "photo_filename", legacyPrefix: "",               kind: "public"  },
  { table: "applications",          id: "id", column: "fee_receipt_url", legacyPrefix: "",              kind: "public"  },
  { table: "media_library",         id: "id", column: "url",            legacyPrefix: "media/",         kind: "public"  },
  { table: "site_announcements",    id: "id", column: "image_url",      legacyPrefix: "media/",         kind: "public"  },
  { table: "site_events",           id: "id", column: "image_url",      legacyPrefix: "media/",         kind: "public"  },
  { table: "site_gallery",          id: "id", column: "image_url",      legacyPrefix: "media/",         kind: "public"  },
  { table: "site_hero_headers",     id: "id", column: "image_url",      legacyPrefix: "media/",         kind: "public"  },
  { table: "site_downloads",        id: "id", column: "image_url",      legacyPrefix: "media/",         kind: "public"  },
  { table: "site_downloads",        id: "id", column: "file_url",       legacyPrefix: "media/",         kind: "public"  },
  { table: "site_faculty",          id: "id", column: "photo_url",      legacyPrefix: "media/",         kind: "public"  },
  { table: "site_testimonials",     id: "id", column: "photo_url",      legacyPrefix: "media/",         kind: "public"  },
  { table: "site_facilities",       id: "id", column: "image_url",      legacyPrefix: "media/",         kind: "public"  },
  { table: "site_alumni",           id: "id", column: "photo_url",      legacyPrefix: "media/",         kind: "public"  },
  { table: "print_templates",       id: "id", column: "bg_image_url",   legacyPrefix: "",               kind: "public"  },
  { table: "print_signatures",      id: "id", column: "url",            legacyPrefix: "",               kind: "public"  },
  { table: "print_settings",        id: "id", column: "bg_image_path",  legacyPrefix: "",               kind: "public"  },
  { table: "student_documents",     id: "id", column: "stored_name",    legacyPrefix: "student-docs/",  kind: "private" },
  { table: "employee_documents",    id: "id", column: "filename",       legacyPrefix: "employee-docs/", kind: "private" },
  { table: "application_documents", id: "id", column: "stored_name",    legacyPrefix: "",               kind: "private" },
  { table: "career_applications",   id: "id", column: "cv_url",         legacyPrefix: "",               kind: "private" },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Migrating local uploads + DB references to R2 bucket "${R2_BUCKET_NAME}"`);

  // Phase 1: upload local files
  let uploaded = 0, skippedExisting = 0;
  if (fs.existsSync(UPLOADS_DIR)) {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
    const files = walk(UPLOADS_DIR);
    console.log(`\nPhase 1: local uploads dir ${UPLOADS_DIR} — ${files.length} file(s)`);
    for (const filePath of files) {
      const key = path.relative(UPLOADS_DIR, filePath).split(path.sep).join("/");
      if (await objectExists(key)) {
        skippedExisting++;
        console.log(`  = already in R2: ${key}`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`  + would upload:  ${key}`);
      } else {
        await uploadFile(key, filePath);
        console.log(`  ↑ uploaded:      ${key}`);
      }
      uploaded++;
    }
  } else {
    console.log(`\nPhase 1: uploads dir ${UPLOADS_DIR} does not exist — nothing to upload.`);
  }

  // Phase 2 + 3: DB reference rewrite
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  await client.query("RESET ROLE");
  try {
    await client.query("SET ROLE ccm_migration"); // RLS bypass for cross-tenant migration
  } catch (e) {
    console.warn(`WARN: SET ROLE ccm_migration failed (${e.message}) — proceeding as current user.`);
  }

  let rewritten = 0, alreadyCanonical = 0, missingInR2 = 0;
  const missing = [];
  try {
    console.log("\nPhase 2: DB reference rewrite");
    for (const { table, id, column, legacyPrefix, kind } of COLUMNS) {
      // Tolerate schema drift (e.g. optional columns) — skip missing tables/columns.
      // Some newer tables (e.g. print_signatures, career_applications) predate
      // the ccm_migration grants; they are not RLS-forced, so fall back to the
      // connection owner for those.
      let rows;
      let asOwner = false;
      const selectSql = `SELECT ${id} AS id, ${column} AS val FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`;
      try {
        ({ rows } = await client.query(selectSql));
      } catch (e) {
        if (e.code === "42501") { // insufficient_privilege — retry as owner
          try {
            await client.query("RESET ROLE");
            ({ rows } = await client.query(selectSql));
            asOwner = true;
          } catch (e2) {
            console.warn(`  SKIP ${table}.${column}: ${e2.message}`);
            await client.query("SET ROLE ccm_migration").catch(() => {});
            continue;
          }
        } else {
          console.warn(`  SKIP ${table}.${column}: ${e.message}`);
          continue;
        }
      }
      for (const row of rows) {
        const stored = String(row.val);
        const key = storedToKey(stored, legacyPrefix);
        if (!key) continue; // foreign https URL — leave alone
        const canonical = kind === "public" ? `/api/media/${key}` : key;
        if (stored === canonical) { alreadyCanonical++; continue; }
        if (!(await objectExists(key))) {
          missingInR2++;
          missing.push(`${table}.${column} id=${row.id}: "${stored}" → key "${key}" not in R2 (left unchanged)`);
          continue;
        }
        if (DRY_RUN) {
          console.log(`  ~ would update ${table}.${column} id=${row.id}: "${stored}" → "${canonical}"`);
        } else {
          await client.query(`UPDATE ${table} SET ${column} = $1 WHERE ${id} = $2`, [canonical, row.id]);
          console.log(`  ✓ ${table}.${column} id=${row.id}: "${stored}" → "${canonical}"`);
        }
        rewritten++;
      }
      if (asOwner) await client.query("SET ROLE ccm_migration").catch(() => {});
    }

    console.log("\nPhase 3: site_page_blocks embedded /uploads/ URLs");
    let blocksRewritten = 0;
    try {
      const { rows: blocks } = await client.query(
        `SELECT id, content FROM site_page_blocks WHERE content LIKE '%/uploads/%'`,
      );
      for (const block of blocks) {
        let content = block.content;
        const keys = [...content.matchAll(/\/uploads\/([\w./-]+)/g)].map((m) => m[1]);
        let changed = false;
        for (const key of new Set(keys)) {
          if (await objectExists(key)) {
            content = content.split(`/uploads/${key}`).join(`/api/media/${key}`);
            changed = true;
          } else {
            missingInR2++;
            missing.push(`site_page_blocks id=${block.id}: embedded "/uploads/${key}" not in R2 (left unchanged)`);
          }
        }
        if (changed) {
          if (DRY_RUN) {
            console.log(`  ~ would rewrite embedded URLs in site_page_blocks id=${block.id}`);
          } else {
            await client.query(`UPDATE site_page_blocks SET content = $1 WHERE id = $2`, [content, block.id]);
            console.log(`  ✓ rewrote embedded URLs in site_page_blocks id=${block.id}`);
          }
          blocksRewritten++;
        }
      }
      if (blocks.length === 0) console.log("  (no blocks with /uploads/ references)");
    } catch (e) {
      console.warn(`  SKIP site_page_blocks: ${e.message}`);
    }

    console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}Summary:`);
    console.log(`  Files uploaded to R2:        ${uploaded}${skippedExisting ? ` (${skippedExisting} already present)` : ""}`);
    console.log(`  DB references rewritten:     ${rewritten}`);
    console.log(`  Page blocks rewritten:       ${blocksRewritten}`);
    console.log(`  Already canonical (skipped): ${alreadyCanonical}`);
    console.log(`  Missing in R2 (untouched):   ${missingInR2}`);
    if (missing.length) {
      console.log("\n  References left unchanged because their object is not in R2");
      console.log("  (these still resolve via the legacy local-disk fallback):");
      for (const m of missing) console.log(`    - ${m}`);
    }
    console.log(`\n${DRY_RUN ? "Dry run complete — nothing was written." : "✅ Migration complete."}`);
  } finally {
    await client.query("RESET ROLE").catch(() => {});
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
