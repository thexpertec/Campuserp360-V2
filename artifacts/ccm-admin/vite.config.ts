import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT ?? "8099";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig(async ({ mode }) => {
  // In Replit dev, the port-8099 proxy blocks PUT/PATCH/DELETE requests.
  // Route all API calls through the main domain (port 5000 / CCM Website proxy)
  // which forwards all HTTP methods correctly to the API server at port 8080.
  // In production builds or local dev without Replit, use same-origin ("").
  const apiBase =
    mode === "development" && process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "";

  return {
    base: basePath,
    define: {
      "import.meta.env.VITE_API_BASE": JSON.stringify(apiBase),
    },
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...(mode !== "production" && process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
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
          configure: (proxy) => {
            proxy.on("error", (_err, _req, res) => {
              (res as import("http").ServerResponse).writeHead(502, { "Content-Type": "application/json" });
              (res as import("http").ServerResponse).end(JSON.stringify({ error: "API server unavailable. Please try again." }));
            });
          },
        },
        "/uploads": {
          target: `http://localhost:${process.env.API_PORT ?? "8080"}`,
          changeOrigin: true,
        },
        "/applications": {
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
  };
});
