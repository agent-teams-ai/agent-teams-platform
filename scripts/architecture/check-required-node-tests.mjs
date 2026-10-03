import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const files = [
  "scripts/architecture/source-dependencies-v3.test.mjs",
  "scripts/architecture/foundation-upgrade.test.mjs",
  "scripts/architecture/required-node-tests.test.mjs",
];
const manifest = JSON.parse(await readFile("package.json", "utf8"));
const contractPath = "architecture/foundation/required-node-tests.json";
const contractBytes = await readFile(contractPath);
const command = `node scripts/architecture/check-required-node-tests.mjs && agent-teams-node-test --contract ${contractPath} -- ${files.join(" ")}`;
assert.equal(manifest.scripts["architecture:test:required"], command,
  "Mandatory Node entry file selection must match the reviewed consumer scope.");
// Bind reviewed bytes, including identity names, kinds and exceptions.
// Intentional contract changes must update this SHA-256 with reviewed evidence.
assert.equal(createHash("sha256").update(contractBytes).digest("hex"),
  "c022a79b36ea40d44b7b75da7288dded2f5ec313dbc21104a213f0cc1ba0699a",
  "Mandatory Node identity contract must match the reviewed consumer scope.");
const contract = JSON.parse(contractBytes.toString("utf8"));
assert.deepEqual([...new Set(contract.required.map(({ file }) => file))].toSorted(), files.toSorted(),
  "Every selected critical entry file must have required identities.");
assert.deepEqual(contract.exceptions, [], "This portable critical scope has no OS exceptions.");
assert.equal(manifest.scripts["architecture:test"],
  "pnpm architecture:test:required && node --test --test-concurrency=1 scripts/architecture/*.test.mjs");
for (const gate of ["check:fast", "check"]) {
  assert.ok(manifest.scripts[gate].split(" && ").includes("pnpm architecture:test"), `${gate} must reach mandatory execution`);
}
