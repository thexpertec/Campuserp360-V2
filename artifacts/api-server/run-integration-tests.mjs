#!/usr/bin/env node
/**
 * Run integration tests against a live API server on :8080.
 *
 * Usage:
 *   DATABASE_URL=... node run-integration-tests.mjs
 *
 * Starts the API server if not already reachable, waits for /api/health,
 * runs the full test suite, then stops the server it started.
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8080";
const PORT = process.env.PORT ?? "8080";

async function healthOk(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await healthOk()) return;
    await sleep(1000);
  }
  throw new Error(`API server not healthy at ${BASE_URL} after ${timeoutMs}ms`);
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.NEON_DATABASE_URL) {
    console.error("DATABASE_URL or NEON_DATABASE_URL is required for integration tests.");
    process.exit(1);
  }

  const alreadyUp = await healthOk();
  let child: ReturnType<typeof spawn> | undefined;

  if (!alreadyUp) {
    console.log(`Starting API server on port ${PORT}…`);
    const build = spawnSync("pnpm", ["run", "build"], {
      cwd: artifactDir,
      stdio: "inherit",
      env: { ...process.env, PORT, NODE_ENV: "development" },
    });
    if (build.status !== 0) process.exit(build.status ?? 1);

    child = spawn("node", ["--enable-source-maps", "./dist/index.mjs"], {
      cwd: artifactDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT, NODE_ENV: "development" },
    });
    child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr?.on("data", (chunk) => process.stderr.write(chunk));

    await waitForHealth();
    console.log("API server is up.");
  } else {
    console.log(`API already reachable at ${BASE_URL} — reusing.`);
  }

  const test = spawnSync("pnpm", ["test"], {
    cwd: artifactDir,
    stdio: "inherit",
    env: { ...process.env, API_BASE_URL: BASE_URL, PORT },
  });

  if (child) {
    child.kill("SIGTERM");
    await sleep(500);
    if (!child.killed) child.kill("SIGKILL");
  }

  process.exit(test.status ?? 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
