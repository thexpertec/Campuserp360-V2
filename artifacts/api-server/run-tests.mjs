import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { build as esbuild } from "esbuild";

// Some plugins/deps resolve via `require`.
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(artifactDir, "src");
const outDir = path.resolve(artifactDir, "dist-test");

/** Recursively collect all *.test.ts files under src/. */
async function findTestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findTestFiles(full)));
    } else if (entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

async function run() {
  const testFiles = await findTestFiles(srcDir);
  if (testFiles.length === 0) {
    console.log("No test files found.");
    return;
  }

  await rm(outDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: testFiles,
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: outDir,
    outbase: srcDir,
    outExtension: { ".js": ".mjs" },
    // Keep node built-ins and installed packages (e.g. bcryptjs) external;
    // bundle only our own source so tests run without a DB connection.
    packages: "external",
    sourcemap: "inline",
    logLevel: "warning",
  });

  const builtFiles = (await findBuilt(outDir));
  const result = spawnSync(
    process.execPath,
    ["--test", "--enable-source-maps", ...builtFiles],
    { stdio: "inherit", cwd: artifactDir },
  );
  process.exit(result.status ?? 1);
}

async function findBuilt(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findBuilt(full)));
    } else if (entry.name.endsWith(".test.mjs")) {
      files.push(full);
    }
  }
  return files;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
