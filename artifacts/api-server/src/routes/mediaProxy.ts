import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getObjectForProxy, r2Configured } from "../lib/storage";

const router: IRouter = Router();

/**
 * Public key prefixes this proxy will serve without authentication.
 * All document/private asset prefixes (docs/, student-docs/, employee-docs/,
 * portal-docs/, application-docs/) are intentionally excluded — those require
 * auth and are served by their own signed-download endpoints.
 *
 * NOTE: any object stored under a prefix listed here is anonymously
 * retrievable by design. Only place public website/marketing assets under
 * these prefixes — never private or per-user documents.
 */
const PUBLIC_PREFIXES = [
  "photo-",       // application candidate photos (bare key, e.g. photo-uuid.jpg)
  "media/",       // media library images
  "print/",       // print background images
  "templates/",   // letter/template assets
  "employees/",   // employee profile photos
  "website/",     // public website CMS media (admin uploads + imported content)
  // Fee receipts are stored via putObject and their /api/media/ URLs are
  // rendered directly by the admin UI. Keys are unguessable (uuid/timestamp).
  "fee-receipts/", // apply-flow bank receipts (fee-receipts/<tenantId>/<ref>-<ts>.<ext>)
  "fee-receipt-",  // portal-flow bank receipts (bare key: fee-receipt-<appId>-<uuid>.<ext>)
];

function isPublicKey(key: string): boolean {
  return PUBLIC_PREFIXES.some(prefix => key.startsWith(prefix));
}

/**
 * GET /media/<key> — credentialed media proxy for public assets.
 *
 * Serves photos and public media stored in R2 through the API server using
 * SDK credentials, so the R2 bucket does NOT need public access enabled.
 *
 * Only keys under PUBLIC_PREFIXES are served; all others receive 403 to
 * prevent unauthenticated access to private documents stored in the same bucket.
 *
 * - R2 configured: fetches from bucket using S3 credentials, streams with
 *   correct Content-Type and a 1-day Cache-Control header.
 * - Fallback (no R2): 302 redirect to /uploads/${key} (local disk).
 *
 * Uses router.use so that req.path covers nested keys like "employees/xxx.jpg".
 */
router.use("/media", async (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  // req.path is relative to the /media mount point, e.g. "/photo-xxx.jpg" or "/employees/xxx.jpg"
  const key = req.path.replace(/^\//, "");
  if (!key) return res.status(400).json({ error: "Media key required" });

  if (!isPublicKey(key)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (r2Configured) {
    const result = await getObjectForProxy(key);
    if (!result) return res.status(404).json({ error: "Not found" });

    if (result.contentType) res.setHeader("Content-Type", result.contentType);
    if (result.contentLength != null) res.setHeader("Content-Length", String(result.contentLength));
    res.setHeader("Cache-Control", "public, max-age=86400");
    result.body.pipe(res);
    return;
  }

  return res.redirect(302, `/uploads/${key}`);
});

export default router;
