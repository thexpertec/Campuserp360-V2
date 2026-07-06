import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT ?? "9000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

// Derive the ccm-admin URL from REPLIT_DEV_DOMAIN.
// The primary dev domain points to port 5000; Replit exposes other ports at
// {subdomain}--{PORT}.{rest}, e.g. "abc.picard.replit.dev" → "abc--8099.picard.replit.dev"
const adminUrl = (() => {
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (!devDomain) return process.env.ADMIN_URL ?? "";
  const dotIdx = devDomain.indexOf(".");
  if (dotIdx < 0) return process.env.ADMIN_URL ?? "";
  return `https://${devDomain.slice(0, dotIdx)}--8099${devDomain.slice(dotIdx)}`;
})();

export default defineConfig({
  base: basePath,
  define: {
    "import.meta.env.VITE_ADMIN_URL": JSON.stringify(adminUrl),
  },
  plugins: [
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
