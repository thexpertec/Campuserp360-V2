/**
 * Application-layer AES-256-GCM encryption for gateway credentials.
 *
 * Encryption key comes from CREDENTIAL_ENCRYPTION_KEY env var.
 * Accepted formats: 64-char hex string (32 bytes) or base64-encoded 32 bytes.
 * If the key is not set, values are stored/retrieved as plaintext with a warning.
 *
 * Ciphertext format (URL-safe, stored as a single text column value):
 *   enc:<base64-iv>:<base64-ciphertext>:<base64-auth-tag>
 *
 * A value that does NOT start with "enc:" is treated as legacy plaintext and
 * returned as-is (allows transparent migration of existing rows).
 */
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const PREFIX = "enc:";

function loadKey(): Buffer | null {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  // Accept 64-char hex
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  // Accept base64 (32-byte key = 44 base64 chars)
  const fromBase64 = Buffer.from(raw, "base64");
  if (fromBase64.length === 32) return fromBase64;
  return null;
}

/**
 * Returns true if CREDENTIAL_ENCRYPTION_KEY is present and well-formed.
 * Use this to gate secret-write operations.
 */
export function isEncryptionAvailable(): boolean {
  return loadKey() !== null;
}

/** Encrypt a plaintext string. Returns a "enc:..." encoded string. */
export function encryptCredential(plaintext: string): string {
  const key = loadKey();
  if (!key) return plaintext; // no key — store as-is

  const iv = crypto.randomBytes(12); // 96-bit IV (GCM standard)
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${enc.toString("base64")}:${tag.toString("base64")}`;
}

/**
 * Decrypt a stored credential value.
 * Legacy plaintext values (no "enc:" prefix) are returned as-is.
 * Returns null if decryption fails.
 */
export function decryptCredential(stored: string | null | undefined): string | undefined {
  if (!stored) return undefined;
  if (!stored.startsWith(PREFIX)) {
    // Legacy plaintext (or encryption not configured)
    return stored || undefined;
  }
  const key = loadKey();
  if (!key) {
    // Key removed after encryption — cannot decrypt, return undefined
    console.error("[credential-crypto] Cannot decrypt credential: CREDENTIAL_ENCRYPTION_KEY is not set");
    return undefined;
  }
  try {
    const parts = stored.slice(PREFIX.length).split(":");
    if (parts.length !== 3) return undefined;
    const [ivB64, encB64, tagB64] = parts as [string, string, string];
    const iv  = Buffer.from(ivB64,  "base64");
    const enc = Buffer.from(encB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
    return plain.toString("utf8") || undefined;
  } catch {
    console.error("[credential-crypto] Decryption failed — credential may be corrupted or key changed");
    return undefined;
  }
}

/** True if a stored value is an encrypted blob. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}
