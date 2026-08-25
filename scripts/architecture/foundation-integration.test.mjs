import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import YAML from "yaml";

const repositoryRoot = new URL("../../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, repositoryRoot), "utf8"));
}

async function readYaml(path) {
  return YAML.parse(await readFile(new URL(path, repositoryRoot), "utf8"));
}

test("runs the authoritative full gate on merge-queue commits", async () => {
  const workflow = await readYaml(".github/workflows/architecture.yml");
  assert.deepEqual(workflow.on.merge_group, null);
  assert.ok(
    workflow.jobs.architecture.steps.some(({ run }) => run === "pnpm check"),
    "the merge_group job must execute the full repository gate",
  );
  assert.equal(workflow.jobs.architecture.if, undefined);
});

test("compares merge-queue qualification records to the exact merge-group base", async () => {
  const workflow = await readYaml(".github/workflows/architecture.yml");
  const mergeGroupProtection = workflow.jobs.architecture.steps.find(
    ({ name }) =>
      name === "Protect published qualification records in the merge queue",
  );
  assert.deepEqual(mergeGroupProtection, {
    name: "Protect published qualification records in the merge queue",
    if: "github.event_name == 'merge_group'",
    run: 'pnpm architecture:immutability -- --base "${{ github.event.merge_group.base_sha }}"',
  });
});

test("keeps the fast gate comprehensive but excludes clean-checkout qualification", async () => {
  const manifest = await readJson("package.json");
  const scripts = manifest.scripts;
  assert.match(scripts.check, /pnpm packages:check(?:\s|$)/u);
  assert.match(scripts["check:fast"], /pnpm packages:check:fast(?:\s|$)/u);
  assert.equal(
    scripts["packages:check"],
    "pnpm packages:check:fast && pnpm spec:clean-checkout",
  );
  for (const gate of [
    "foundation:check",
    "docs:protocol:check",
    "architecture:check",
    "architecture:test",
    "lint",
    "typecheck",
  ]) {
    assert.match(scripts["check:fast"], new RegExp(`pnpm ${gate}`));
  }
  for (const gate of [
    "spec:property",
    "spec:mutation",
    "spec:model",
    "spec:production-conformance",
  ]) {
    assert.match(scripts["packages:check:fast"], new RegExp(`pnpm ${gate}`));
  }
  assert.doesNotMatch(scripts["check:fast"], /spec:clean-checkout/u);
  assert.doesNotMatch(scripts["packages:check:fast"], /spec:clean-checkout/u);
});

test("bounds suppression governance to every owned source root", async () => {
  const policy = await readYaml(
    "architecture/foundation/suppression-governance.yaml",
  );
  assert.deepEqual(policy.governedRoots, [
    "packages",
    "scripts",
    "tooling/executable-specifications/scripts",
  ]);
});

test("forces full scans for policy, workflow, dependency, and spec inputs", async () => {
  const policy = await readYaml(
    "architecture/foundation/repository-agent-workflow.yaml",
  );
  const requiredPaths = [
    ".agents/skills/docs-authoring/SKILL.md",
    ".github/copilot-instructions.md",
    ".github/dependabot.yml",
    ".github/workflows",
    ".markdownlint-cli2.mjs",
    ".node-version",
    ".npmrc",
    ".oxlintrc.json",
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    "README.md",
    "architecture/decisions",
    "architecture/foundation",
    "architecture/package-catalog.yaml",
    "architecture/project-management",
    "architecture/scaffolding",
    "docs",
    "foundation.config.yaml",
    "package.json",
    "packages/contexts",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "scripts/architecture",
    "scripts/docs",
    "tooling/executable-specifications",
    "tsconfig.json",
  ];
  for (const path of requiredPaths) {
    assert.ok(policy.fullScanPaths.includes(path), `missing full scan path: ${path}`);
  }
});
