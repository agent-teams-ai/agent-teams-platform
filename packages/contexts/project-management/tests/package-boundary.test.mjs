import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modelConformanceEntry =
  "dist/features/managed-project-scope-admission/testing/model-conformance/model-conformance-fixture.js";
const forbiddenPackagePath = /(?:^|\/)(?:__tests__|tests)(?:\/|$)|(?:^|\/)test-fixture\.|\.(?:test|spec)\./u;

async function productionFiles() {
  const files = await readdir(path.join(packageRoot, "dist"), {
    recursive: true,
    withFileTypes: true,
  });
  return files
    .filter((entry) => entry.isFile())
    .map((entry) => path.posix.join("dist", entry.parentPath
      .slice(path.join(packageRoot, "dist").length + 1)
      .split(path.sep).join("/"), entry.name));
}

async function packedFiles() {
  const pnpmCli = process.env.npm_execpath;
  assert.ok(pnpmCli, "pnpm must expose npm_execpath to package checks");
  const { stdout } = await execFileAsync(
    process.execPath,
    [pnpmCli, "pack", "--dry-run", "--json"],
    { cwd: packageRoot, maxBuffer: 4 * 1024 * 1024 },
  );
  const manifest = JSON.parse(stdout);
  const pack = Array.isArray(manifest) ? manifest[0] : manifest;
  return pack.files.map(({ path: filePath }) => filePath);
}

function assertProductionBoundary(files) {
  assert.ok(files.includes(modelConformanceEntry));
  assert.deepEqual(files.filter((file) => forbiddenPackagePath.test(file)), []);
}

test("production build excludes executable tests and test-only support", async () => {
  assertProductionBoundary(await productionFiles());
});

test("packed artifact retains the testing export without test-only files", async () => {
  assertProductionBoundary(await packedFiles());
});

test("rejects a compiled .spec file from the built dist inventory", () => {
  assert.throws(() => assertProductionBoundary([
    modelConformanceEntry,
    "dist/features/managed-project-scope-admission/production-leak.spec.js",
  ]));
});

test("rejects a .spec artifact from the dry-run pack inventory", () => {
  assert.throws(() => assertProductionBoundary([
    modelConformanceEntry,
    "dist/features/managed-project-scope-admission/packed-leak.spec.d.ts",
  ]));
});
