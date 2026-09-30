import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";

import {
  candidateInputDigest,
  createCompatibilityReport,
  readCompatibilityState,
  validatePolicyState,
} from "./validate-node-compatibility.mjs";

const clone = (value) => structuredClone(value);

test("policy rejects unauthorized cutover, disabled LTS gate, and wrong target", async () => {
  const state = await readCompatibilityState();
  validatePolicyState(state);

  for (const [mutate, expected] of [
    [ (record) => { record.migration.cutover.status = "AUTHORIZED"; }, /Node compatibility schema violation/u ],
    [ (record) => { record.migration.cutover.requiresOfficialLts = false; }, /Node compatibility schema violation/u ],
    [ (record) => { record.qualification.targetVersion = "25.0.0"; }, /Qualification target must equal/u ],
  ]) {
    const changed = clone(state);
    mutate(changed.compatibility);
    assert.throws(() => validatePolicyState(changed), expected);
  }

  const disabledInstallPolicy = clone(state);
  disabledInstallPolicy.workspace = disabledInstallPolicy.workspace.replace("strictPeerDependencies: true", "strictPeerDependencies: false");
  assert.throws(() => validatePolicyState(disabledInstallPolicy), /Effective pnpm workspace setting drift: strictPeerDependencies/u);

  const duplicateSetting = clone(state);
  duplicateSetting.workspace += "\nstrictPeerDependencies: false\n";
  assert.throws(() => validatePolicyState(duplicateSetting), /Invalid pnpm workspace configuration/u);
});

test("upstream engine readiness cannot certify Node 26 qualification", async () => {
  const state = await readCompatibilityState();
  const changed = clone(state);
  const lock = YAML.parse(changed.lockfile);
  for (const dependency of changed.compatibility.upstreamDependencies.foundation) {
    dependency.nodeEngine = ">=24.18.0 <27";
    dependency.node26StrictInstall = "SUPPORTED";
    lock.packages[`${dependency.name}@${dependency.version}`].engines.node = dependency.nodeEngine;
  }
  changed.lockfile = YAML.stringify(lock);
  changed.compatibility.qualification.strictInstall = "READY_FOR_STRICT_INSTALL";
  changed.compatibility.qualification.status = "IMPLEMENTED_PENDING_QUALIFICATION";
  validatePolicyState(changed);
  const report = await createCompatibilityReport(changed);
  assert.equal(report.status, "NODE26_STRICT_INSTALL_READY");
  assert.equal(report.qualificationEvidence, "NOT_RECORDED");

  changed.compatibility.qualification.status = "QUALIFIED";
  await assert.rejects(createCompatibilityReport(changed), /Qualification status drift/u);
});

test("published caret engines and exact package evidence are checked from YAML", async () => {
  const state = await readCompatibilityState();
  const report = await createCompatibilityReport(state);
  assert.equal(report.status, "NODE26_STRICT_INSTALL_READY");
  assert.equal(report.upstreamDependencies.length, 5);
  assert.ok(report.upstreamDependencies.every(({ nodeEngine }) => nodeEngine === "^24.18.0 || ^26.0.0"));

  for (const nodeEngine of ["^24.18.0", "^26.11.0", "^0.26.0", "^0.0.26"]) {
    const changed = clone(state);
    const lock = YAML.parse(changed.lockfile);
    for (const dependency of changed.compatibility.upstreamDependencies.foundation) {
      lock.packages[`${dependency.name}@${dependency.version}`].engines.node = nodeEngine;
      dependency.nodeEngine = nodeEngine;
      dependency.node26StrictInstall = "BLOCKED_BY_UPSTREAM_ENGINE";
    }
    changed.lockfile = YAML.stringify(lock);
    changed.compatibility.qualification.status = "PENDING_UPSTREAM_ENGINE_COMPATIBILITY";
    changed.compatibility.qualification.strictInstall = "BLOCKED_BY_UPSTREAM_ENGINE";
    const blocked = await createCompatibilityReport(changed);
    assert.equal(blocked.status, "NODE26_STRICT_INSTALL_BLOCKED", nodeEngine);
    assert.equal(blocked.blockers.length, 5);
  }
});

test("missing, malformed or drifted published evidence fails closed", async () => {
  const state = await readCompatibilityState();
  const dependency = state.compatibility.upstreamDependencies.foundation[0];
  const identity = `${dependency.name}@${dependency.version}`;
  for (const [mutate, expected] of [
    [(changed, lock) => { delete lock.packages[identity].engines; }, /Missing published package engine/u],
    [(changed, lock) => { delete lock.packages[identity].resolution.integrity; }, /Missing published package engine or integrity/u],
    [(changed, lock) => { lock.packages[identity].resolution.integrity = "sha512-drift"; }, /Published integrity drift/u],
    [(changed, lock) => { lock.packages[identity].engines.node = "^24.18.0 || >=26.0.0 unknown"; changed.compatibility.upstreamDependencies.foundation[0].nodeEngine = lock.packages[identity].engines.node; }, /Unsupported engine comparator/u],
    [(changed, lock) => { lock.importers["."].devDependencies[dependency.name].specifier = "^1.7.0"; }, /exact root pin drift/u],
    [(changed) => { changed.packageManifest.devDependencies[dependency.name] = "^1.7.0"; }, /exact root pin drift/u],
    [(changed) => { changed.compatibility.upstreamDependencies.foundation[0].relationship = "TRANSITIVE"; }, /relationship or exact root pin drift/u],
    [(changed) => { changed.compatibility.upstreamDependencies.foundation[0].role = "MANAGED_DOCS_ADAPTER"; }, /Published dependency role drift/u],
    [(changed) => { changed.compatibility.upstreamDependencies.foundation.push(clone(dependency)); }, /Duplicate published dependency record/u],
  ]) {
    const changed = clone(state);
    const lock = YAML.parse(changed.lockfile);
    mutate(changed, lock);
    changed.lockfile = YAML.stringify(lock);
    await assert.rejects(createCompatibilityReport(changed), expected);
  }
  const duplicate = clone(state);
  duplicate.lockfile += "\npackages: {}\n";
  await assert.rejects(createCompatibilityReport(duplicate), /Invalid pnpm lockfile/u);
});

test("strict install readiness preserves central Cohort and Node 24 managed runtime authority", async () => {
  const state = await readCompatibilityState();
  const report = await createCompatibilityReport(state);
  assert.equal(report.managedDocsRuntime.authority, "CENTRAL_DOCS_COHORT");
  assert.equal(report.managedDocsRuntime.nodeEngine, ">=24.18.0 <25");
  assert.equal(report.managedDocsRuntime.node26Qualification, "NOT_QUALIFIED");
  assert.equal(report.managedDocsRuntime.cohortUpgrade, "NOT_AUTHORIZED_BY_PACKAGE_ENGINE");
  for (const [key, value] of [
    ["nodeEngine", "^24.18.0 || ^26.0.0"],
    ["node26Qualification", "QUALIFIED"],
    ["cohortUpgrade", "AUTHORIZED"],
  ]) {
    const changed = clone(state);
    changed.compatibility.managedDocsRuntime[key] = value;
    assert.throws(() => validatePolicyState(changed), /Node compatibility schema violation/u);
  }
});

test("candidate input digest binds every checked-in gate input family", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "platform-node26-policy-"));
  const files = [
    ".gitattributes", ".gitignore", ".markdownlint-cli2.mjs", ".node-version", ".npmrc",
    ".oxlintrc.json", ".oxlintrc.type-aware.json", "AGENTS.md", "CLAUDE.md", "GEMINI.md",
    "README.md", "foundation.config.yaml", "package.json", "pnpm-lock.yaml",
    "pnpm-workspace.yaml", "tsconfig.json", ".agents/skills/docs-authoring/SKILL.md",
    ".github/copilot-instructions.md", ".github/workflows/architecture.yml",
    ".github/workflows/node26-compatibility.yml", ".github/workflows/docs-protocol.yml",
    "architecture/runtime/policy.json", "docs/architecture/feature-module-standard-v1.md",
    "docs/architecture/feature-module-standard.md", "packages/context/source.ts",
    "scripts/check.mjs", "tooling/helper.js",
  ];
  try {
    for (const file of files) {
      const target = path.join(root, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "initial\n");
    }
    const initial = await candidateInputDigest(root);
    for (const file of [
      "packages/context/source.ts", "scripts/check.mjs", "tooling/helper.js",
      "architecture/runtime/policy.json", "docs/architecture/feature-module-standard-v1.md",
      ".github/workflows/architecture.yml", ".github/workflows/node26-compatibility.yml",
      ".github/workflows/docs-protocol.yml", ".agents/skills/docs-authoring/SKILL.md",
      "README.md", "AGENTS.md", ".gitignore", "pnpm-lock.yaml", "tsconfig.json",
      "foundation.config.yaml", "pnpm-workspace.yaml", ".oxlintrc.type-aware.json",
      "package.json", ".node-version", ".npmrc",
    ]) {
      await writeFile(path.join(root, file), "changed\n");
      assert.notEqual(await candidateInputDigest(root), initial, `${file} must affect candidate digest`);
      await writeFile(path.join(root, file), "initial\n");
    }
    const added = path.join(root, "docs/architecture/new-authority.md");
    await writeFile(added, "new\n");
    assert.notEqual(await candidateInputDigest(root), initial, "new gate input must affect candidate digest");
    await rm(added);
    assert.equal(await candidateInputDigest(root), initial);
    const relocated = await mkdtemp(path.join(tmpdir(), "platform-node26-digest-TEST-"));
    try {
      await cp(root, relocated, { recursive: true });
      assert.equal(await candidateInputDigest(relocated), initial, "checkout location must not affect digest");
      const regenerated = path.join(relocated, "tooling", "helper.js");
      await rm(regenerated);
      await writeFile(regenerated, "initial\n");
      assert.equal(await candidateInputDigest(relocated), initial, "creation order must not affect digest");
      await mkdir(path.join(relocated, "packages", "dist"));
      await writeFile(path.join(relocated, "packages", "dist", "build.js"), "generated\n");
      assert.equal(await candidateInputDigest(relocated), initial, "generated output must not affect digest");
    } finally {
      await rm(relocated, { recursive: true, force: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("candidate input digest rejects symlinked roots and entries", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "platform-node26-policy-link-"));
  const root = path.join(parent, "candidate");
  try {
    await mkdir(root);
    await symlink(root, path.join(parent, "linked-candidate"));
    await assert.rejects(candidateInputDigest(path.join(parent, "linked-candidate")), /Candidate input root must be a directory/u);
    for (const directory of ["packages", "scripts", "tooling", "architecture", "docs", ".github", ".agents"]) {
      await mkdir(path.join(root, directory));
    }
    await symlink(path.join(parent, "outside"), path.join(root, "docs", "escaped.md"));
    await assert.rejects(candidateInputDigest(root), /Unsupported candidate input entry/u);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
