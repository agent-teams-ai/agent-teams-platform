import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

test("candidate input digest changes with source, lockfile, and workflow", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "platform-node26-policy-"));
  const files = [
    ".github/workflows/node26-compatibility.yml", ".markdownlint-cli2.mjs",
    ".node-version", ".npmrc", ".oxlintrc.json", ".oxlintrc.type-aware.json",
    "foundation.config.yaml", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json",
    "architecture/runtime/policy.json", "packages/context/source.ts", "scripts/check.mjs", "tooling/helper.js",
  ];
  try {
    for (const file of files) {
      const target = path.join(root, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "initial\n");
    }
    const initial = await candidateInputDigest(root);
    for (const file of ["packages/context/source.ts", "pnpm-lock.yaml", ".github/workflows/node26-compatibility.yml", "tsconfig.json", "foundation.config.yaml"]) {
      await writeFile(path.join(root, file), "changed\n");
      assert.notEqual(await candidateInputDigest(root), initial, `${file} must affect candidate digest`);
      await writeFile(path.join(root, file), "initial\n");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
