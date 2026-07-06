import { pool } from "@workspace/db";
import { hashPasswordSync } from "./admin-auth.js";
import { isPortalPasswordHashed } from "./portal-password.js";
import { logger } from "./logger";

/**
 * One-time (idempotent) migration: re-hash any legacy plaintext portal_password
 * values to bcrypt. Safe on every boot — already-hashed rows are skipped.
 */
export async function migratePortalPasswords(): Promise<void> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ id: string; portal_password: string }>(`
      SELECT id, portal_password
      FROM applications
      WHERE portal_password IS NOT NULL
        AND portal_password <> ''
    `);

    const plaintext = rows.filter((r) => !isPortalPasswordHashed(r.portal_password));
    if (plaintext.length === 0) return;

    let updated = 0;
    for (const row of plaintext) {
      const hashed = hashPasswordSync(row.portal_password);
      await client.query(
        `UPDATE applications SET portal_password = $1 WHERE id = $2`,
        [hashed, row.id],
      );
      updated += 1;
    }

    logger.info(
      { updated, scanned: rows.length },
      "migratePortalPasswords: re-hashed legacy plaintext portal passwords",
    );
  } catch (err) {
    logger.error({ err }, "migratePortalPasswords failed — continuing");
  } finally {
    client.release();
  }
}
