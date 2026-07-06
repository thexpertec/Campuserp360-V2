import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getObjectForProxy, r2Configured } from "../lib/storage";
import { verifyToken } from "../lib/admin-auth.js";

const router: IRouter = Router();

const PUBLIC_PREFIXES = [
  "photo-",
  "media/",
  "print/",
  "templates/",
  "employees/",
  "website/",
];

const PRIVATE_PREFIXES = [
  "fee-receipts/",
  "fee-receipt-",
];

function isPublicKey(key: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function isPrivateFeeReceipt(key: string): boolean {
  return PRIVATE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function extractAdminToken(req: Request): string | null {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? (req.query["token"] as string | undefined) ?? null;
}

async function streamKey(key: string, res: Response): Promise<void> {
  if (r2Configured) {
    const result = await getObjectForProxy(key);
    if (!result) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.contentType) res.setHeader("Content-Type", result.contentType);
    if (result.contentLength != null) res.setHeader("Content-Length", String(result.contentLength));
    res.setHeader("Cache-Control", "private, no-store");
    result.body.pipe(res);
    return;
  }
  res.redirect(302, `/uploads/${key}`);
}

router.use("/media", async (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  const key = req.path.replace(/^\//, "");
  if (!key) return res.status(400).json({ error: "Media key required" });

  if (isPrivateFeeReceipt(key)) {
    const token = extractAdminToken(req);
    if (!token || !verifyToken(token)) {
      return res.status(403).json({ error: "Authentication required" });
    }
    return streamKey(key, res);
  }

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
