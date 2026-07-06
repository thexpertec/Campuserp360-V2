import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const BCRYPT_ROUNDS = 12;
const BCRYPT_PREFIX = "$2";

export function isPortalPasswordHashed(stored: string): boolean {
  return stored.startsWith(BCRYPT_PREFIX);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function hashPortalPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

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
