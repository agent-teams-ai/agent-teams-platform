import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse } from "yaml";

const foundationManifestPath = fileURLToPath(
  import.meta.resolve("@agent-teams/engineering-foundation/package.json"),
);
const foundationManifest = JSON.parse(await readFile(foundationManifestPath, "utf8"));
const foundationCli = join(
  dirname(foundationManifestPath),
  foundationManifest.bin["agent-teams-foundation"],
);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const configPath = "architecture/foundation/source-dependencies.yaml";
const policy = parse(await readFile(join(repositoryRoot, configPath), "utf8"));

test("live source policy is schema v3 with root package and workspace package roots", () => {
  assert.equal(policy.schemaVersion, 3);
  assert.equal(policy.rootPackage, true);
  assert.equal(Object.hasOwn(policy, "includeRootPackage"), false);
  assert.deepEqual(policy.packageRoots, [
    "packages/contexts/project-management",
    "tooling/executable-specifications",
  ]);
  assert.ok(policy.governedRoots.includes("scripts/architecture"));
  assert.ok(policy.governedRoots.includes("scripts/docs"));
});

test("source v3 rejects includeRootPackage as an unknown public field", async () => {
  const root = await mkdtemp(join(tmpdir(), "platform-foundation-include-root-"));
  try {
    await mkdir(join(root, dirname(configPath)), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "@agent-teams/platform-repository",
        private: true,
        type: "module",
      }),
    );
    await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []\n");
    await writeFile(
      join(root, configPath),
      `${await readFile(join(repositoryRoot, configPath), "utf8")}\nincludeRootPackage: true\n`,
    );
    await writeFile(
      join(root, "foundation.config.yaml"),
      JSON.stringify({
        schemaVersion: 1,
        project: { id: "foundation-include-root-fixture" },
        capabilities: { "architecture.source-dependencies": { configPath } },
      }),
    );
    const result = spawnSync(
      process.execPath,
      [foundationCli, "check", "architecture.source-dependencies", "--consumer", root, "--json"],
      { encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert.equal(result.error, undefined, result.stderr);
    const envelope = JSON.parse(result.stdout);
    assert.notEqual(envelope.outcome, "passed", JSON.stringify(envelope));
    assert.match(
      JSON.stringify(envelope),
      /includeRootPackage|unknown property|invalid-input/iu,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source v3 rejects a filesystem builtin inside Project Management domain", async () => {
  const root = await mkdtemp(join(tmpdir(), "platform-foundation-domain-fs-"));
  const domainFile =
    "packages/contexts/project-management/src/features/managed-project-scope-admission/domain/value-objects.ts";
  try {
    await mkdir(join(root, dirname(configPath)), { recursive: true });
    await mkdir(join(root, dirname(domainFile)), { recursive: true });
    await cp(join(repositoryRoot, "package.json"), join(root, "package.json"));
    await cp(join(repositoryRoot, "pnpm-workspace.yaml"), join(root, "pnpm-workspace.yaml"));
    await cp(join(repositoryRoot, "foundation.config.yaml"), join(root, "foundation.config.yaml"));
    await cp(join(repositoryRoot, configPath), join(root, configPath));
    await cp(
      join(repositoryRoot, "packages/contexts/project-management"),
      join(root, "packages/contexts/project-management"),
      { recursive: true },
    );
    await cp(
      join(repositoryRoot, "tooling/executable-specifications"),
      join(root, "tooling/executable-specifications"),
      { recursive: true },
    );
    await cp(join(repositoryRoot, "scripts"), join(root, "scripts"), { recursive: true });
    const original = await readFile(join(root, domainFile), "utf8");
    await writeFile(join(root, domainFile), `import fs from "node:fs";\n${original}\nvoid fs;\n`);
    const result = spawnSync(
      process.execPath,
      [foundationCli, "check", "architecture.source-dependencies", "--consumer", root, "--json"],
      { encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert.equal(result.error, undefined, result.stderr);
    const envelope = JSON.parse(result.stdout);
    assert.notEqual(envelope.outcome, "passed", JSON.stringify(envelope));
    assert.match(
      JSON.stringify(envelope),
      /forbidden-builtin-dependency|node:fs|context\.project-management\.domain/iu,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
