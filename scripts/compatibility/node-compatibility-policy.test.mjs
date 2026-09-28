import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

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
  changed.lockfile = changed.lockfile.replaceAll(">=24.18.0 <25", ">=24.18.0 <27");
  for (const dependency of changed.compatibility.upstreamDependencies.foundation) {
    dependency.nodeEngine = ">=24.18.0 <27";
    dependency.node26StrictInstall = "SUPPORTED";
  }
  changed.compatibility.qualification.strictInstall = "READY_FOR_STRICT_INSTALL";
  changed.compatibility.qualification.status = "IMPLEMENTED_PENDING_QUALIFICATION";
  validatePolicyState(changed);
  const report = await createCompatibilityReport(changed);
  assert.equal(report.status, "NODE26_STRICT_INSTALL_READY");
  assert.equal(report.qualificationEvidence, "NOT_RECORDED");

  changed.compatibility.qualification.status = "QUALIFIED";
  await assert.rejects(createCompatibilityReport(changed), /Qualification status drift/u);
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
      "foundation.config.yaml",
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
