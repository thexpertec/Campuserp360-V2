import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "node:fs";
import path from "node:path";

const R2_ACCOUNT_ID        = process.env["R2_ACCOUNT_ID"];
const R2_ACCESS_KEY_ID     = process.env["R2_ACCESS_KEY_ID"];
const R2_SECRET_ACCESS_KEY = process.env["R2_SECRET_ACCESS_KEY"];
const R2_BUCKET_NAME       = process.env["R2_BUCKET_NAME"];
const R2_PUBLIC_URL        = process.env["R2_PUBLIC_URL"];

export const r2Configured = Boolean(
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_PUBLIC_URL,
);

export let s3: S3Client | null = null;
if (r2Configured) {
  s3 = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
    },
  });
}

export const bucketName = R2_BUCKET_NAME;

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

/**
 * Upload a **public** file (photos, media, print backgrounds, template backgrounds).
 * - R2 configured: uploads to bucket, returns `/api/media/${key}` (served via API proxy)
 * - Fallback: writes to `uploads/${key}` on local disk, returns `/uploads/${key}`
 *
 * @param key  Object key (path relative to bucket root)
 */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  if (s3 && r2Configured) {
    await s3.send(
      new PutObjectCommand({
        Bucket:      R2_BUCKET_NAME!,
        Key:         key,
        Body:        body,
        ContentType: contentType,
      }),
    );
    return `/api/media/${key}`;
  }

  const localPath = path.join(UPLOADS_DIR, key);
  const dir = path.dirname(localPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(localPath, body);
  return `/uploads/${key}`;
}

/**
 * Upload a **private** file (documents that require authentication to access).
 * Always stores the object key — never a public URL — so callers must use
 * `getSignedUrl(key)` or an auth-gated API endpoint to serve the file.
 *
 * - R2 configured: uploads to bucket, returns the key
 * - Fallback: writes to `uploads/${key}` on local disk, returns the key
 *
 * @param key  Object key (e.g. `docs/adoc-<id>-<uuid>.pdf`)
 */
export async function putPrivateObject(key: string, body: Buffer, contentType: string): Promise<string> {
  if (s3 && r2Configured) {
    await s3.send(
      new PutObjectCommand({
        Bucket:      R2_BUCKET_NAME!,
        Key:         key,
        Body:        body,
        ContentType: contentType,
      }),
    );
    return key;
  }

  const localPath = path.join(UPLOADS_DIR, key);
  const dir = path.dirname(localPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(localPath, body);
  return key;
}

/**
 * Delete a file (best-effort; never throws).
 * @param key Object key (same key used in putObject)
 */
export async function deleteObject(key: string): Promise<void> {
  if (s3 && r2Configured) {
    try { await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME!, Key: key })); } catch { /* ignore */ }
    return;
  }
  try {
    const localPath = path.join(UPLOADS_DIR, key);
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  } catch { /* ignore */ }
}

/**
 * Generate a short-lived signed URL for a private object.
 * Falls back to `/uploads/${key}` when R2 is not configured.
 */
export async function getSignedUrl(key: string, expiresIn = 300): Promise<string> {
  if (s3 && r2Configured) {
    return awsGetSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: R2_BUCKET_NAME!, Key: key }),
      { expiresIn },
    );
  }
  return `/uploads/${key}`;
}

/**
 * Fetch a public object from R2 and return its metadata + streamable body.
 * Returns null when R2 is not configured — caller should redirect to /uploads/${key}.
 */
export async function getObjectForProxy(key: string): Promise<{
  contentType: string | undefined;
  contentLength: number | undefined;
  body: NodeJS.ReadableStream;
} | null> {
  if (!s3 || !r2Configured) return null;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME!, Key: key }));
    return {
      contentType: obj.ContentType,
      contentLength: obj.ContentLength,
      body: obj.Body as unknown as NodeJS.ReadableStream,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch a stored public object as a Buffer (works in both R2 and local modes).
 * Returns null when the object cannot be found.
 *
 * @param key Object key (same key used in putObject)
 */
export async function getObjectBuffer(key: string): Promise<Buffer | null> {
  if (s3 && r2Configured) {
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME!, Key: key }));
      const bytes = await obj.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }
  try {
    const localPath = path.join(UPLOADS_DIR, key);
    if (!fs.existsSync(localPath)) return null;
    return fs.readFileSync(localPath);
  } catch {
    return null;
  }
}

/**
 * Resolve a download URL for a private/sensitive document stored in DB.
 *
 * Decision logic:
 *   - Full R2 URL (https://…) or structured key (contains "/") → R2 signed URL when configured,
 *     else /uploads/<key>
 *   - Legacy bare filename (no "/" and not "http…") → /uploads/<legacyPrefix><filename>
 *     (these files are only on local disk; do NOT attempt R2 signing)
 *   - /uploads/… path → local disk path served by express.static
 *
 * This ensures old disk-only files continue to work even when R2 is enabled.
 *
 * @param stored       DB-stored value (bare filename, key, /uploads/ path, or full URL)
 * @param legacyPrefix Directory prefix for bare filenames (e.g. "employee-docs/")
 * @param expiresIn    Signed URL TTL in seconds (default 300)
 */
export async function resolvePrivateDownloadUrl(
  stored: string | null | undefined,
  legacyPrefix = "",
  expiresIn = 300,
): Promise<string | null> {
  if (!stored) return null;

  // Full R2 public URL — extract key and sign
  if (R2_PUBLIC_URL && stored.startsWith(R2_PUBLIC_URL)) {
    const key = stored.slice(R2_PUBLIC_URL.replace(/\/$/, "").length + 1);
    return getSignedUrl(key, expiresIn);
  }

  // Already a /uploads/ path (old-style absolute path stored in DB)
  if (stored.startsWith("/uploads/")) {
    return stored; // served by express.static (already auth-protected for sensitive dirs)
  }

  // Legacy bare filename (no "/" — lives only on local disk)
  if (!stored.includes("/")) {
    return `/uploads/${legacyPrefix}${stored}`;
  }

  // Structured key with "/" (new uploads via putPrivateObject)
  return getSignedUrl(stored, expiresIn);
}

/**
 * Convert a stored value to a displayable URL.
 * Handles new proxy URLs, old full R2 URLs, /uploads/ paths, and legacy bare filenames.
 *
 * Resolution order:
 *   1. null/empty → null
 *   2. /api/media/… or /uploads/… → return as-is (already a relative URL)
 *   3. https://… full URL (old-style R2 public URL) → extract path key → /api/media/<key>
 *      so old records display through the auth-transparent proxy
 *   4. bare filename (no "/") → /uploads/<legacyPrefix><filename>
 *
 * @param stored   The value stored in DB
 * @param legacyPrefix  Prefix to add before the stored value when constructing a legacy /uploads/ URL
 */
export function resolveUrl(stored: string | null | undefined, legacyPrefix = ""): string | null {
  if (!stored) return null;
  // Already a relative proxy or uploads path
  if (stored.startsWith("/")) return stored;
  // Old full R2 public URL — route through API proxy instead of direct bucket URL
  if (stored.startsWith("https://") || stored.startsWith("http://")) {
    try {
      const url = new URL(stored);
      const key = url.pathname.slice(1); // strip leading /
      return `/api/media/${key}`;
    } catch {
      return stored;
    }
  }
  return `/uploads/${legacyPrefix}${stored}`;
}

/**
 * Extract the object key from a stored value.
 *
 * Handles four cases:
 *   1. Full R2 public URL  — `https://<R2_PUBLIC_URL>/key`      → strips prefix → `key`
 *   2. Legacy /uploads/ path — `/uploads/some/path.pdf`          → strips "/uploads/" → `some/path.pdf`
 *   3. Already a key with slash — `student-docs/foo.pdf`         → returned as-is (no prefix added)
 *   4. Bare filename (no slash) — `foo.pdf`                      → returns `legacyPrefix + foo.pdf`
 *
 * Rule 3 prevents double-prefixing when new uploads store keys directly (e.g. `student-docs/<file>`).
 *
 * @param stored       The value stored in DB
 * @param legacyPrefix Prefix for bare filenames that predate structured keys (e.g. "employee-docs/")
 */
export function urlToKey(stored: string | null | undefined, legacyPrefix = ""): string | null {
  if (!stored) return null;
  // Case 1: full R2 public URL
  if (R2_PUBLIC_URL && stored.startsWith(R2_PUBLIC_URL)) {
    return stored.slice(R2_PUBLIC_URL.replace(/\/$/, "").length + 1);
  }
  // Case 1b: /api/media/ proxy URL — strip prefix to get key
  if (stored.startsWith("/api/media/")) return stored.slice("/api/media/".length);
  // Case 2: legacy /uploads/… path
  if (stored.startsWith("/uploads/")) return stored.slice("/uploads/".length);
  // Case 3: already a structured key (contains a slash) — return as-is to avoid double-prefix
  if (stored.includes("/")) return stored;
  // Case 4: bare legacy filename — apply prefix
  return legacyPrefix + stored;
}
