import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { sitePageViewsTable, tenantsTable } from "@workspace/db";
import { and, eq, gte, lte, desc, sql, count } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { publicTenant, getAdminTenantId } from "../lib/tenant";
import { isRateLimited } from "../lib/rate-limit";

const router: IRouter = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve the admin tenant or fail closed with a 400. */
async function resolveAdminTenant(req: Request, res: Response): Promise<string | null> {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) { res.status(400).json({ error: "Tenant could not be resolved" }); return null; }
  return tenantId;
}

/** Best-effort client IP from common proxy headers (Replit / generic). */
function clientIp(req: Request): string {
  const xf = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return xf || req.socket.remoteAddress || "0.0.0.0";
}

/** Coarse device class from a User-Agent string. */
function deviceFromUA(ua: string): string {
  const s = ua.toLowerCase();
  if (!s) return "unknown";
  if (/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|whatsapp/.test(s)) return "bot";
  if (/tablet|ipad|playbook|silk|(android(?!.*mobile))/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini/.test(s)) return "mobile";
  return "desktop";
}

/** Coarse browser family from a User-Agent string. */
function browserFromUA(ua: string): string {
  const s = ua.toLowerCase();
  if (!s) return "Unknown";
  if (/edg\//.test(s)) return "Edge";
  if (/opr\/|opera/.test(s)) return "Opera";
  if (/samsungbrowser/.test(s)) return "Samsung Internet";
  if (/firefox\/|fxios/.test(s)) return "Firefox";
  if (/chrome\/|crios/.test(s) && !/edg\//.test(s)) return "Chrome";
  if (/safari\//.test(s) && !/chrome|crios|android/.test(s)) return "Safari";
  if (/bot|crawl|spider/.test(s)) return "Bot";
  return "Other";
}

/** Hostname of a referrer URL, or null when same-origin/empty/invalid. */
function hostOf(url: string | undefined, selfHost: string): string | null {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (!h || h === selfHost.replace(/^www\./, "").toLowerCase()) return null;
    return h;
  } catch { return null; }
}

/**
 * Coarse country signal without a GeoIP database or storing the raw IP:
 *  1. CDN/proxy country headers when present (Cloudflare etc.)
 *  2. Region subtag of the top Accept-Language locale (e.g. en-PK → PK)
 * Returns null when nothing usable is available.
 */
function countryFromReq(req: Request): string | null {
  const hdr =
    (req.headers["cf-ipcountry"] as string | undefined) ||
    (req.headers["x-vercel-ip-country"] as string | undefined) ||
    (req.headers["x-country-code"] as string | undefined);
  if (hdr && /^[A-Za-z]{2}$/.test(hdr) && hdr.toUpperCase() !== "XX") return hdr.toUpperCase();

  const al = (req.headers["accept-language"] as string | undefined) ?? "";
  const m = /[a-z]{2,3}-([A-Z]{2})/.exec(al);
  if (m) return m[1]!.toUpperCase();
  return null;
}

// Daily-rotating server secret for visitor hashing. Regenerated per process
// start AND mixed with the calendar day, so a hash cannot be linked back to an
// IP and rotates daily.
const HASH_SECRET = process.env.ANALYTICS_HASH_SECRET || crypto.randomBytes(16).toString("hex");
function visitorHashFor(ip: string, ua: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHash("sha256").update(`${day}|${HASH_SECRET}|${ip}|${ua}`).digest("hex").slice(0, 32);
}

// ─── PUBLIC: page-view capture beacon ──────────────────────────────────────────
// POST /api/website/track  { path, referrer? }
// Records a single page view for the resolved tenant. Privacy-light and
// fail-soft: it never blocks the visitor and never persists a raw IP.

router.post("/website/track", publicTenant, async (req: Request, res: Response) => {
  // Always answer 204 quickly — tracking must never affect the visitor's page.
  const ok = () => { if (!res.headersSent) res.status(204).end(); };
  try {
    if (!req.tenantId) return ok();

    const ua = (req.headers["user-agent"] as string | undefined) ?? "";
    const dnt =
      req.headers["dnt"] === "1" ||
      (req.headers["sec-gpc"] as string | undefined) === "1" ||
      req.body?.dnt === true;

    let rawPath = typeof req.body?.path === "string" ? req.body.path : "";
    if (!rawPath) return ok();
    // Keep only the path portion, capped, no query/hash to avoid unbounded keys.
    rawPath = rawPath.split("?")[0]!.split("#")[0]!.slice(0, 512) || "/";

    // Ignore obvious bots entirely so they don't pollute human visitor stats.
    const device = deviceFromUA(ua);
    if (device === "bot") return ok();

    // Light per-IP rate limit so a single client can't flood the table.
    const ip = clientIp(req);
    const limited = await isRateLimited("site_track", `${req.tenantId}:${ip}`, 240, 60 * 1000);
    if (limited) return ok();

    const selfHost = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim()
      || req.headers.host || "";
    const referrer = typeof req.body?.referrer === "string" ? req.body.referrer.slice(0, 1024) : null;

    await db.insert(sitePageViewsTable).values({
      tenantId:     req.tenantId,
      path:         rawPath,
      referrer:     referrer || null,
      referrerHost: hostOf(referrer ?? undefined, selfHost),
      deviceType:   device,
      browser:      browserFromUA(ua),
      country:      countryFromReq(req),
      visitorHash:  dnt ? null : visitorHashFor(ip, ua),
      dnt,
    });
    return ok();
  } catch {
    return ok();
  }
});

// ─── ADMIN: date-range helpers ─────────────────────────────────────────────────

function parseRange(req: Request): { from: Date; to: Date } {
  const now = new Date();
  const defFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const parse = (v: unknown, fallback: Date): Date => {
    if (typeof v === "string" && v) {
      const d = new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v);
      if (!isNaN(d.getTime())) return d;
    }
    return fallback;
  };
  const from = parse(req.query.from, defFrom);
  // `to` is inclusive of the whole day when a date-only value is given.
  let to = parse(req.query.to, now);
  if (typeof req.query.to === "string" && req.query.to.length === 10) {
    to = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);
  }
  return { from, to };
}

// ─── ADMIN: visitor summary ────────────────────────────────────────────────────
// GET /admin/website/analytics/summary?from=&to=

router.get("/admin/website/analytics/summary", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
    const { from, to } = parseRange(req);
    const scope = and(
      eq(sitePageViewsTable.tenantId, tenantId),
      gte(sitePageViewsTable.createdAt, from),
      lte(sitePageViewsTable.createdAt, to),
    );

    const [totals] = await db.select({
      views: count(),
      visitors: sql<number>`COUNT(DISTINCT ${sitePageViewsTable.visitorHash})`,
    }).from(sitePageViewsTable).where(scope);

    const trend = await db.select({
      day: sql<string>`to_char(${sitePageViewsTable.createdAt}, 'YYYY-MM-DD')`,
      views: count(),
      visitors: sql<number>`COUNT(DISTINCT ${sitePageViewsTable.visitorHash})`,
    }).from(sitePageViewsTable).where(scope)
      .groupBy(sql`1`).orderBy(sql`1`);

    const topPages = await db.select({
      path: sitePageViewsTable.path,
      views: count(),
    }).from(sitePageViewsTable).where(scope)
      .groupBy(sitePageViewsTable.path).orderBy(desc(count())).limit(15);

    const referrers = await db.select({
      host: sql<string>`COALESCE(${sitePageViewsTable.referrerHost}, 'Direct / none')`,
      views: count(),
    }).from(sitePageViewsTable).where(scope)
      .groupBy(sql`1`).orderBy(desc(count())).limit(15);

    const countries = await db.select({
      country: sql<string>`COALESCE(${sitePageViewsTable.country}, 'Unknown')`,
      views: count(),
    }).from(sitePageViewsTable).where(scope)
      .groupBy(sql`1`).orderBy(desc(count())).limit(15);

    const devices = await db.select({
      device: sitePageViewsTable.deviceType,
      views: count(),
    }).from(sitePageViewsTable).where(scope)
      .groupBy(sitePageViewsTable.deviceType).orderBy(desc(count()));

    return res.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: { views: Number(totals?.views ?? 0), visitors: Number(totals?.visitors ?? 0) },
      trend: trend.map(r => ({ day: r.day, views: Number(r.views), visitors: Number(r.visitors) })),
      topPages: topPages.map(r => ({ path: r.path, views: Number(r.views) })),
      referrers: referrers.map(r => ({ host: r.host, views: Number(r.views) })),
      countries: countries.map(r => ({ country: r.country, views: Number(r.views) })),
      devices: devices.map(r => ({ device: r.device, views: Number(r.views) })),
    });
  } catch {
    return res.status(500).json({ error: "Failed to load visitor summary" });
  }
});

// ─── ADMIN: paginated raw page-view list ───────────────────────────────────────
// GET /admin/website/analytics/events?from=&to=&page=&pageSize=

router.get("/admin/website/analytics/events", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
    const { from, to } = parseRange(req);
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "25"), 10) || 25));
    const scope = and(
      eq(sitePageViewsTable.tenantId, tenantId),
      gte(sitePageViewsTable.createdAt, from),
      lte(sitePageViewsTable.createdAt, to),
    );

    const [tot] = await db.select({ n: count() }).from(sitePageViewsTable).where(scope);
    const total = Number(tot?.n ?? 0);

    const rows = await db.select({
      id: sitePageViewsTable.id,
      path: sitePageViewsTable.path,
      referrerHost: sitePageViewsTable.referrerHost,
      deviceType: sitePageViewsTable.deviceType,
      browser: sitePageViewsTable.browser,
      country: sitePageViewsTable.country,
      createdAt: sitePageViewsTable.createdAt,
    }).from(sitePageViewsTable).where(scope)
      .orderBy(desc(sitePageViewsTable.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);

    return res.json({ total, page, pageSize, rows });
  } catch {
    return res.status(500).json({ error: "Failed to load visitor events" });
  }
});

// ─── ADMIN: self-contained SEO health check ────────────────────────────────────
// GET /admin/website/seo/check
// Fetches the tenant's public site (initial HTML, i.e. what crawlers see before
// running JS) and runs on-page + site-wide checks. Self-contained — needs no
// external account.

const SEO_ROUTES = ["/", "/about", "/admissions", "/gallery", "/events", "/contact",
  "/teachers", "/downloads", "/results", "/fee-structure", "/alumni"];

type Check = { id: string; label: string; status: "pass" | "warn" | "fail"; detail: string };

async function fetchText(url: string, timeoutMs = 8000): Promise<{ ok: boolean; status: number; text: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow",
      headers: { "user-agent": "CCM-SEO-Checker/1.0" } });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text };
  } catch {
    return { ok: false, status: 0, text: "" };
  } finally {
    clearTimeout(t);
  }
}

function attr(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m ? (m[1] ?? "").trim() : null;
}

function analyzePage(path: string, status: number, html: string): { path: string; status: number; score: number; checks: Check[] } {
  const checks: Check[] = [];
  const head = (html.match(/<head[\s\S]*?<\/head>/i)?.[0]) ?? html;

  if (status === 200) checks.push({ id: "reachable", label: "Page reachable (HTTP 200)", status: "pass", detail: `HTTP ${status}` });
  else checks.push({ id: "reachable", label: "Page reachable", status: "fail", detail: status ? `HTTP ${status}` : "No response" });

  const title = attr(head, /<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!title) checks.push({ id: "title", label: "Title tag present", status: "fail", detail: "No <title> found" });
  else if (title.length < 10 || title.length > 65) checks.push({ id: "title", label: "Title length 10–65 chars", status: "warn", detail: `${title.length} chars` });
  else checks.push({ id: "title", label: "Title tag present & sized", status: "pass", detail: `${title.length} chars` });

  const desc = attr(head, /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i);
  if (!desc) checks.push({ id: "description", label: "Meta description present", status: "fail", detail: "Missing" });
  else if (desc.length < 50 || desc.length > 160) checks.push({ id: "description", label: "Meta description 50–160 chars", status: "warn", detail: `${desc.length} chars` });
  else checks.push({ id: "description", label: "Meta description present & sized", status: "pass", detail: `${desc.length} chars` });

  const ogTitle = /property=["']og:title["']/i.test(head);
  const ogDesc = /property=["']og:description["']/i.test(head);
  const ogImage = /property=["']og:image["']/i.test(head);
  const ogCount = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
  checks.push({
    id: "og",
    label: "Open Graph tags",
    status: ogCount === 3 ? "pass" : ogCount > 0 ? "warn" : "fail",
    detail: `${ogCount}/3 (title, description, image)`,
  });

  const viewport = /name=["']viewport["']/i.test(head);
  checks.push({ id: "viewport", label: "Mobile viewport meta", status: viewport ? "pass" : "fail", detail: viewport ? "Present" : "Missing" });

  const canonical = attr(head, /<link[^>]+rel=["']canonical["'][^>]+href=["']([\s\S]*?)["']/i);
  if (!canonical) checks.push({ id: "canonical", label: "Canonical URL", status: "warn", detail: "Missing" });
  else checks.push({ id: "canonical", label: "Canonical URL", status: canonical.startsWith("https://") ? "pass" : "warn", detail: canonical });

  const robotsMeta = attr(head, /<meta[^>]+name=["']robots["'][^>]+content=["']([\s\S]*?)["']/i);
  if (robotsMeta && /noindex/i.test(robotsMeta)) checks.push({ id: "robotsmeta", label: "Indexable (robots meta)", status: "fail", detail: robotsMeta });
  else checks.push({ id: "robotsmeta", label: "Indexable (robots meta)", status: "pass", detail: robotsMeta || "No noindex" });

  const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
  const hCount = (html.match(/<h[1-6][\s>]/gi) ?? []).length;
  if (h1Count === 0) checks.push({ id: "headings", label: "Heading structure (H1)", status: "warn", detail: `No H1 in initial HTML (${hCount} headings total)` });
  else if (h1Count === 1) checks.push({ id: "headings", label: "Heading structure (one H1)", status: "pass", detail: `1 H1, ${hCount} headings total` });
  else checks.push({ id: "headings", label: "Heading structure", status: "warn", detail: `${h1Count} H1 tags (prefer one)` });

  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const withAlt = imgs.filter(t => /\balt=/.test(t)).length;
  if (imgs.length === 0) checks.push({ id: "alt", label: "Image alt-text coverage", status: "warn", detail: "No images in initial HTML" });
  else {
    const pct = Math.round((withAlt / imgs.length) * 100);
    checks.push({ id: "alt", label: "Image alt-text coverage", status: pct === 100 ? "pass" : pct >= 60 ? "warn" : "fail", detail: `${withAlt}/${imgs.length} (${pct}%)` });
  }

  const scored = checks.filter(c => c.id !== "reachable" || status !== 200);
  const passW = scored.reduce((s, c) => s + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0);
  const score = scored.length ? Math.round((passW / scored.length) * 100) : 0;
  return { path, status, score, checks };
}

router.get("/admin/website/seo/check", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;

    const [tenant] = await db.select({ slug: tenantsTable.slug, domain: tenantsTable.domain })
      .from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);

    // Determine where the public site lives. Prefer the tenant's own domain in
    // production; otherwise derive from the request, falling back to the dev
    // website port. The ?tenant= slug ensures the right site resolves.
    const fwdProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
    const fwdHost = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() || req.headers.host;
    const candidates: string[] = [];
    if (process.env.PUBLIC_SITE_URL) candidates.push(process.env.PUBLIC_SITE_URL.replace(/\/$/, ""));
    if (tenant?.domain) candidates.push(`https://${tenant.domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`);
    if (fwdHost) candidates.push(`${fwdProto || "https"}://${fwdHost}`);
    candidates.push("http://localhost:5000");

    const tenantQ = tenant?.slug ? `?tenant=${encodeURIComponent(tenant.slug)}` : "";

    // Find the first base that serves the homepage.
    let base = "";
    let homeHtml = "";
    let homeStatus = 0;
    for (const c of candidates) {
      const r = await fetchText(`${c}/${tenantQ}`);
      if (r.status === 200 && /<html/i.test(r.text)) { base = c; homeHtml = r.text; homeStatus = 200; break; }
      if (!base && r.status > 0) { base = c; homeHtml = r.text; homeStatus = r.status; }
    }

    const siteWide: Check[] = [];

    if (!base) {
      siteWide.push({ id: "reach", label: "Public website reachable", status: "fail", detail: "Could not reach the public site from the server" });
      return res.json({
        baseUrl: null,
        generatedAt: new Date().toISOString(),
        summary: { pass: 0, warn: 0, fail: 1, avgScore: 0 },
        siteWide,
        pages: [],
        note: "The server could not reach the public website to run checks.",
      });
    }

    // sitemap.xml
    const sm = await fetchText(`${base}/sitemap.xml`);
    let sitemapUrls = 0;
    if (sm.status === 200 && /<urlset|<sitemapindex/i.test(sm.text)) {
      sitemapUrls = (sm.text.match(/<loc>/gi) ?? []).length;
      siteWide.push({ id: "sitemap", label: "sitemap.xml reachable & valid", status: "pass", detail: `${sitemapUrls} URLs listed` });
    } else {
      siteWide.push({ id: "sitemap", label: "sitemap.xml reachable & valid", status: "fail", detail: sm.status ? `HTTP ${sm.status}` : "Not found" });
    }

    // robots.txt
    const rb = await fetchText(`${base}/robots.txt`);
    if (rb.status === 200 && /user-agent/i.test(rb.text)) {
      const blocksAll = /disallow:\s*\/\s*(\n|$)/i.test(rb.text) && !/allow:\s*\//i.test(rb.text);
      const hasSitemap = /sitemap:/i.test(rb.text);
      siteWide.push({
        id: "robots",
        label: "robots.txt present & not blocking",
        status: blocksAll ? "fail" : "pass",
        detail: blocksAll ? "Disallows all crawling!" : hasSitemap ? "Present; references sitemap" : "Present",
      });
    } else {
      siteWide.push({ id: "robots", label: "robots.txt present", status: "warn", detail: rb.status ? `HTTP ${rb.status}` : "Not found" });
    }

    // HTTPS
    siteWide.push({
      id: "https",
      label: "Served over HTTPS",
      status: base.startsWith("https://") ? "pass" : "warn",
      detail: base.startsWith("https://") ? "Yes" : "Checked over HTTP (dev)",
    });

    // lang attribute
    const hasLang = /<html[^>]+\blang=/i.test(homeHtml);
    siteWide.push({ id: "lang", label: "HTML lang attribute", status: hasLang ? "pass" : "warn", detail: hasLang ? "Present" : "Missing" });

    // structured data
    const hasLd = /application\/ld\+json/i.test(homeHtml);
    siteWide.push({ id: "structured", label: "Structured data (JSON-LD)", status: hasLd ? "pass" : "warn", detail: hasLd ? "Present" : "None found" });

    // Per-page analysis. Prefer routes from the sitemap, else the known set.
    let routes = SEO_ROUTES;
    if (sm.status === 200) {
      const locs = [...sm.text.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(m => {
        try { return new URL(m[1]!.trim()).pathname || "/"; } catch { return null; }
      }).filter((p): p is string => !!p);
      if (locs.length) routes = Array.from(new Set(locs));
    }
    routes = routes.slice(0, 20);

    const pages = [];
    for (const route of routes) {
      const r = await fetchText(`${base}${route}${tenantQ}`);
      pages.push(analyzePage(route, r.status, r.text));
    }

    // Roll-up summary across site-wide + per-page checks.
    const allChecks = [...siteWide, ...pages.flatMap(p => p.checks)];
    const pass = allChecks.filter(c => c.status === "pass").length;
    const warn = allChecks.filter(c => c.status === "warn").length;
    const fail = allChecks.filter(c => c.status === "fail").length;
    const avgScore = pages.length ? Math.round(pages.reduce((s, p) => s + p.score, 0) / pages.length) : 0;

    return res.json({
      baseUrl: base,
      homeStatus,
      generatedAt: new Date().toISOString(),
      summary: { pass, warn, fail, avgScore },
      siteWide,
      pages,
      note: "Checks run against the initial HTML the server receives (what crawlers see before running JavaScript).",
    });
  } catch {
    return res.status(500).json({ error: "Failed to run SEO checks" });
  }
});

// ─── ADMIN: Google connection status (Phase B placeholder) ─────────────────────
// Returns a clear "not connected" state so the UI can show graceful empty
// states for Search Console, PageSpeed and Analytics until Google is linked.

router.get("/admin/website/google-status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await resolveAdminTenant(req, res); if (!tenantId) return;
    return res.json({
      searchConsole: { connected: false },
      analytics: { connected: false },
      pageSpeed: { connected: false },
    });
  } catch {
    return res.status(500).json({ error: "Failed to load Google connection status" });
  }
});

export default router;
