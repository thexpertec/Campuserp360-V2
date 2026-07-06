// CCM front-door gateway.
//
// Single public entry point on $PORT. It routes by path prefix to the
// individual services. In development it reverse-proxies to the running Vite
// dev servers, the Streamlit candidate-portal and the api-server. In
// production it serves the three pre-built static frontends from disk and
// proxies the dynamic paths (/api, /uploads, /portal) to their backends.
//
// Zero external dependencies — pure Node http/net so it can run with a bare
// `node artifacts/gateway/gateway.mjs`.
//
// Path map:
//   /api, /uploads   -> api-server        (API_PORT)
//   /portal          -> Streamlit portal  (PORTAL_PORT, baseUrlPath=/portal)
//   /admin           -> ccm-admin         (ADMIN_PORT  / dist)
//   /saas            -> saas-admin        (SAAS_PORT   / dist)
//   /__mockup        -> mockup-sandbox    (MOCKUP_PORT, dev only)
//   everything else  -> ccm-website       (WEBSITE_PORT / dist)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT ?? 5000);
const API_PORT = Number(process.env.API_PORT ?? 8080);
const PORTAL_PORT = Number(process.env.PORTAL_PORT ?? 8000);
const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 25521);
const SAAS_PORT = Number(process.env.SAAS_PORT ?? 9000);
const WEBSITE_PORT = Number(process.env.WEBSITE_PORT ?? 21792);
const MOCKUP_PORT = Number(process.env.MOCKUP_PORT ?? 8081);
const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "ccm";
const TENANT_SLUGS = (process.env.TENANT_SLUGS ?? DEFAULT_TENANT_SLUG)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Reserved first-segment names that are NOT tenant slugs.
const RESERVED = new Set([
  "api", "uploads", "portal", "admin", "saas", "__mockup",
  "assets", "src", "node_modules", "about", "privacy", "terms",
  "admissions", "favicon.ico", "robots.txt",
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const DIST = {
  website: path.join(ROOT, "artifacts", "ccm-website", "dist", "public"),
  admin: path.join(ROOT, "artifacts", "ccm-admin", "dist", "public"),
  saas: path.join(ROOT, "artifacts", "saas-admin", "dist", "public"),
};

function log(...args) {
  console.log("[gateway]", ...args);
}

// Headers the gateway attaches when forwarding to the api-server so that
// multi-tenant resolution works behind the single front door.
//   - host       → set to loopback so the api trusts X-Tenant-Slug
//                  (tenant-resolve.ts only honours the header from loopback).
//   - x-forwarded-host → preserves the ORIGINAL client host so that
//                  production host/domain-based tenant matching (which runs
//                  BEFORE the header fallback) still wins for real tenant
//                  domains. Only when no stronger signal exists does the
//                  injected X-Tenant-Slug decide the tenant.
//   - x-tenant-slug → default tenant fallback for requests that carry no
//                  ?tenant= override and no matching host domain.
function apiHeaderOverrides(req) {
  const origHost = req.headers["x-forwarded-host"] || req.headers.host || "";
  return {
    host: `localhost:${API_PORT}`,
    "x-forwarded-host": origHost,
    "x-tenant-slug": DEFAULT_TENANT_SLUG,
  };
}

// ── Reverse proxy (HTTP) ─────────────────────────────────────────────────────
function proxyHttp(req, res, targetPort, headerOverrides) {
  const headers = { ...req.headers };
  if (headerOverrides) Object.assign(headers, headerOverrides);
  const options = {
    host: "127.0.0.1",
    port: targetPort,
    method: req.method,
    path: req.url,
    headers,
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
    }
    res.end(`Gateway: upstream :${targetPort} unavailable (${err.code ?? err.message})`);
  });
  req.pipe(proxyReq, { end: true });
}

// ── Reverse proxy (WebSocket / upgrade) ──────────────────────────────────────
function proxyUpgrade(req, clientSocket, head, targetPort) {
  const proxyReq = http.request({
    host: "127.0.0.1",
    port: targetPort,
    method: req.method,
    path: req.url,
    headers: { ...req.headers },
  });
  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    const headers = [
      `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}`,
    ];
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (Array.isArray(v)) v.forEach((vv) => headers.push(`${k}: ${vv}`));
      else headers.push(`${k}: ${v}`);
    }
    clientSocket.write(headers.join("\r\n") + "\r\n\r\n");
    if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);
    proxySocket.pipe(clientSocket);
    clientSocket.pipe(proxySocket);
    proxySocket.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => proxySocket.destroy());
  });
  proxyReq.on("error", () => clientSocket.destroy());
  if (head && head.length) proxyReq.write(head);
  proxyReq.end();
}

// ── Static file serving (production) ─────────────────────────────────────────
function serveStatic(res, distDir, relPath, { injectTenant } = {}) {
  let filePath = path.join(distDir, relPath);
  // Prevent path traversal.
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  let stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  const isFile = stat?.isFile();

  if (!isFile) {
    // SPA fallback to index.html.
    filePath = path.join(distDir, "index.html");
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";

  if (ext === ".html") {
    let html = fs.readFileSync(filePath, "utf-8");
    if (injectTenant) {
      const injection =
        `<script>window.__TENANT_SLUG__="${injectTenant}";</script>` +
        `<base href="/${injectTenant}/">`;
      html = html.replace("</head>", `${injection}</head>`);
    }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(html);
    return;
  }

  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  fs.createReadStream(filePath).pipe(res);
}

// ── Routing ──────────────────────────────────────────────────────────────────
function classify(urlPath) {
  if (urlPath === "/api" || urlPath.startsWith("/api/") ||
      urlPath === "/uploads" || urlPath.startsWith("/uploads/")) {
    return { kind: "proxy", port: API_PORT };
  }
  if (urlPath === "/portal" || urlPath.startsWith("/portal/")) {
    return { kind: "proxy", port: PORTAL_PORT };
  }
  if (urlPath === "/admin" || urlPath.startsWith("/admin/")) {
    return { kind: "admin", port: ADMIN_PORT };
  }
  if (urlPath === "/saas" || urlPath.startsWith("/saas/")) {
    return { kind: "saas", port: SAAS_PORT };
  }
  if (urlPath === "/__mockup" || urlPath.startsWith("/__mockup/")) {
    return { kind: "proxy", port: MOCKUP_PORT };
  }
  return { kind: "website", port: WEBSITE_PORT };
}

// Detect a leading tenant slug (e.g. /ccm/...) for the website.
function tenantSlugOf(urlPath) {
  const first = urlPath.split("/").filter(Boolean)[0] ?? "";
  if (!first || RESERVED.has(first)) return null;
  if (first.includes(".")) return null; // looks like a file
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(first)) return null;
  return first;
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url ?? "/").split("?")[0];
  const route = classify(urlPath);

  const apiOverrides = route.port === API_PORT ? apiHeaderOverrides(req) : undefined;

  // Development: always reverse-proxy to the live dev servers.
  if (!isProd) {
    proxyHttp(req, res, route.port, apiOverrides);
    return;
  }

  // Production: serve static builds, proxy dynamic backends.
  switch (route.kind) {
    case "proxy":
      proxyHttp(req, res, route.port, apiOverrides);
      return;
    case "admin": {
      const rel = urlPath.replace(/^\/admin\/?/, "") || "index.html";
      serveStatic(res, DIST.admin, rel);
      return;
    }
    case "saas": {
      const rel = urlPath.replace(/^\/saas\/?/, "") || "index.html";
      serveStatic(res, DIST.saas, rel);
      return;
    }
    case "website":
    default: {
      const slug = tenantSlugOf(urlPath);
      if (slug && !urlPath.includes(".")) {
        // Tenant-prefixed HTML route → serve website index with injection.
        serveStatic(res, DIST.website, "index.html", { injectTenant: slug });
        return;
      }
      const rel = urlPath.replace(/^\//, "") || "index.html";
      serveStatic(res, DIST.website, rel);
      return;
    }
  }
});

server.on("upgrade", (req, socket, head) => {
  const urlPath = (req.url ?? "/").split("?")[0];
  const route = classify(urlPath);
  // In production only /api, /portal, /__mockup have live upstreams; in dev all do.
  proxyUpgrade(req, socket, head, route.port);
});

server.on("clientError", (err, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(PORT, "0.0.0.0", () => {
  log(`listening on :${PORT} (${isProd ? "production" : "development"})`);
  log(`tenant default=${DEFAULT_TENANT_SLUG} slugs=[${TENANT_SLUGS.join(",")}]`);
  log(`api=:${API_PORT} portal=:${PORTAL_PORT} admin=:${ADMIN_PORT} saas=:${SAAS_PORT} website=:${WEBSITE_PORT}`);
});
