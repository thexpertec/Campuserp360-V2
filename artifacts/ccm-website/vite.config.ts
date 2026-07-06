import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT ?? "5001";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

const KNOWN_PAGE_ROUTES = new Set([
  "about", "admissions", "events", "gallery", "alumni", "teachers",
  "downloads", "fee-structure", "contact", "results", "status",
  "privacy", "terms", "admin", "saas", "portal", "api", "uploads",
  "assets", "src", "node_modules",
]);

/**
 * Dev-only plugin: replicates what the production gateway does for tenant-prefixed
 * paths (e.g. /gccm/ or /ccm/).  It detects a leading /<slug>/ segment, then:
 *   1. Reads index.html from disk
 *   2. Runs it through Vite's own transformIndexHtml pipeline (adds HMR etc.)
 *   3. Injects `window.__TENANT_SLUG__` + `<base href="/<slug>/">` before </head>
 *   4. Sends the result directly, bypassing any further routing
 * Non-HTML assets (JS/CSS/images) keep their original path so Vite resolves them.
 */
function tenantPrefixDevPlugin(): Plugin {
  return {
    name: "tenant-prefix-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "/";
        // Strip the query string before checking for file extensions so that
        // JWT tokens in ?token= (which contain dots) don't bypass this plugin.
        const urlPath = url.split("?")[0];

        // Pass through Vite internals and known API/asset paths
        if (
          urlPath.startsWith("/@") ||
          urlPath.startsWith("/node_modules") ||
          urlPath.startsWith("/api") ||
          urlPath.includes(".")  // has an extension in PATH → static asset, not HTML
        ) {
          return next();
        }

        const firstSegment = urlPath.split("/").filter(Boolean)[0] ?? "";
        if (
          !firstSegment ||
          KNOWN_PAGE_ROUTES.has(firstSegment) ||
          !/^[a-z][a-z0-9-]{1,30}$/.test(firstSegment)
        ) {
          return next();
        }

        const slug = firstSegment;

        try {
          const indexPath = path.resolve(import.meta.dirname, "index.html");
          const rawHtml = fs.readFileSync(indexPath, "utf-8");

          // Let Vite transform the HTML (injects HMR client script, etc.)
          const transformed = await server.transformIndexHtml(url, rawHtml, url);

          // Inject tenant slug and base path right before </head>
          const injection =
            `<script>window.__TENANT_SLUG__="${slug}";</script>` +
            `<base href="/${slug}/">`;
          const html = transformed.replace("</head>", `${injection}</head>`);

          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.statusCode = 200;
          res.end(html);
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    tenantPrefixDevPlugin(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT ?? "8080"}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
