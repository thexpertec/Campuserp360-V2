import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { hashPassword } from "./admin-auth.js";

const BCRYPT_PREFIX = "$2";

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Hash a portal password for storage (bcrypt). */
export async function hashPortalPassword(password: string): Promise<string> {
  return hashPassword(password);
}

/**
 * Verify a portal password against the stored value.
 * Supports bcrypt hashes and legacy plaintext rows (re-hash on success).
 */
export async function verifyPortalPassword(
  password: string,
  stored: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (stored.startsWith(BCRYPT_PREFIX)) {
    const valid = await bcrypt.compare(password, stored);
    return { valid, needsRehash: false };
  }
  const valid = timingSafeEqualStr(password, stored);
  return { valid, needsRehash: valid };
}
