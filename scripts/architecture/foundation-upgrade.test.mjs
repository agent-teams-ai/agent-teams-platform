import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse, stringify } from "yaml";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const manifestPath = fileURLToPath(import.meta.resolve("@agent-teams/engineering-foundation/package.json"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const cli = join(dirname(manifestPath), manifest.bin["agent-teams-foundation"]);
const sourcePolicy = "architecture/foundation/source-dependencies.yaml";
// Use the actual installed store, including an explicitly selected external cache.
const modules = parse(await readFile(join(repository, "node_modules/.modules.yaml"), "utf8"));
assert.equal(typeof modules.storeDir, "string");
const storeDirectory = dirname(modules.storeDir);

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "platform-foundation-upgrade-"));
  try {
    for (const file of ["architecture", "docs", "packages", "scripts", "tooling", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "foundation.config.yaml", ".oxlintrc.json", ".oxlintrc.type-aware.json", "tsconfig.json"]) {
      await cp(join(repository, file), join(root, file), { recursive: true,
        filter: (path) => !/[\\/](?:node_modules|dist|\.cache)(?:[\\/]|$)/u.test(path) });
    }
    const installation = spawnSync("pnpm", ["install", "--offline", "--frozen-lockfile", "--store-dir", storeDirectory],
      { cwd: root, encoding: "utf8", timeout: 60_000 });
    assert.equal(installation.error, undefined);
    assert.equal(installation.status, 0, installation.stderr + installation.stdout);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
function check(root, ...args) {
  const result = spawnSync(process.execPath, [cli, ...args, "--consumer", root, "--json"],
    { encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.error, undefined, result.stderr);
  const report = JSON.parse(result.stdout);
  return { report, status: result.status };
}

test("installed quality gate rejects an unadmitted unknown assertion", async () => {
  await fixture(async (root) => {
    const path = "packages/contexts/project-management/src/features/managed-project-scope-admission/application/evaluate-creation-authority.ts";
    const original = await readFile(join(root, path), "utf8");
    await writeFile(join(root, path), `${original}\nexport const bridgeProbe = ({} as unknown) as CreationAuthorityEvaluation;\n`);
    const { report, status } = check(root, "quality", "check");
    assert.notEqual(status, 0);
    assert.ok(report.capabilities.flatMap(({ diagnostics }) => diagnostics).some(({ ruleId, location }) =>
      ruleId === "quality.source-coverage.explicit-unknown" && location.path === path), JSON.stringify(report));
  });
});

test("installed source gate rejects a missing declared governed root", async () => {
  await fixture(async (root) => {
    const policy = parse(await readFile(join(root, sourcePolicy), "utf8"));
    policy.governedRoots.push("scripts/missing-declared-input");
    policy.boundaries.push({ id: "scripts.missing-declared-input", roots: ["scripts/missing-declared-input"], entrypoints: [], allow: { boundaries: [], packages: [], builtins: [], runtimeReferences: [] } });
    await writeFile(join(root, sourcePolicy), stringify(policy));
    const { report, status } = check(root, "check", "architecture.source-dependencies");
    assert.notEqual(status, 0);
    assert.notEqual(report.outcome, "passed");
    assert.ok(report.capabilities.some(({ problem }) => problem?.code === "SOURCE_DIRECTORY_UNAVAILABLE" &&
      problem.message.includes("scripts/missing-declared-input")), JSON.stringify(report));
  });
});

test("installed quality gate rejects an unreadable declared compiler input", async () => {
  await fixture(async (root) => {
    const project = "packages/contexts/project-management/tsconfig.json";
    await rm(join(root, project));
    await mkdir(join(root, project));
    const { report, status } = check(root, "quality", "check", "--scope-only");
    assert.notEqual(status, 0);
    assert.notEqual(report.outcome, "passed");
    assert.ok(report.capabilities.some(({ problem }) => problem?.code === "QUALITY_PROFILE_INVALID" &&
      problem.message.includes(project)), JSON.stringify(report));
  });
});

test("installed quality gate rejects governed dist hidden by lint exclusions", async () => {
  await fixture(async (root) => {
    const dist = "packages/contexts/project-management/dist/upgrade-probe.ts";
    await mkdir(join(root, dirname(dist)), { recursive: true });
    await writeFile(join(root, dist), "export const governedDist = 1;\n");
    const policy = parse(await readFile(join(root, sourcePolicy), "utf8"));
    policy.governedRoots.push(dist);
    policy.boundaries.push({ id: "context.project-management.governed-dist", roots: [dist], entrypoints: [dist], allow: { boundaries: [], packages: [], builtins: [], runtimeReferences: [] } });
    await writeFile(join(root, sourcePolicy), stringify(policy));
    const { report, status } = check(root, "quality", "check", "--scope-only");
    assert.notEqual(status, 0);
    assert.notEqual(report.outcome, "passed");
    assert.ok(report.capabilities.flatMap(({ diagnostics }) => diagnostics).some(({ ruleId, location }) =>
      ruleId === "quality.source-coverage.selection-mismatch" && location.path === dist), JSON.stringify(report));
  });
});
