import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {parse as parseYaml} from "yaml";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const protocolPackage = fileURLToPath(
  import.meta.resolve("@agent-teams/docs-protocol/package.json")
);
const protocolCli = join(dirname(protocolPackage), "dist/cli.js");
const protocolProfile = "architecture/foundation/docs-protocol.yaml";
test("qualification authority is staged without mutating stable3 integration", async () => {
  const [qualification, integration, rollout] = await Promise.all([
    readFile(join(repositoryRoot, "architecture/foundation/docs-protocol-qualification.json"), "utf8").then(JSON.parse),
    readFile(join(repositoryRoot, "architecture/foundation/docs-consumer-integration.json"), "utf8").then(JSON.parse),
    readFile(join(repositoryRoot, "architecture/foundation/docs-protocol-rollout.yaml"), "utf8")
  ]);
  assert.equal(integration.schemaVersion, 1);
  assert.match(rollout, /^status: stable3-current-v2-staged$/mu);
  assert.match(rollout, /^  integrationSchemaVersion: 2$/mu);
  assert.match(rollout, /^  qualificationContractSchemaVersion: 2$/mu);
  assert.equal(qualification.schemaVersion, 2);
  assert.deepEqual(Object.keys(qualification).toSorted(), ["scenarios", "schemaVersion"]);
});

async function disposableRepository(run) {
  const root = await mkdtemp(join(tmpdir(), "atd-p-"));
  try {
    await cp(join(repositoryRoot, "docs"), join(root, "docs"), {recursive: true});
    await cp(join(repositoryRoot, "architecture"), join(root, "architecture"), {recursive: true});
    await mkdir(join(root, ".agents", "skills", "docs-authoring"), {recursive: true});
    await cp(
      join(repositoryRoot, ".agents", "skills", "docs-authoring", "SKILL.md"),
      join(root, ".agents", "skills", "docs-authoring", "SKILL.md")
    );
    await cp(join(repositoryRoot, "AGENTS.md"), join(root, "AGENTS.md"));
    await cp(join(repositoryRoot, "package.json"), join(root, "package.json"));
    await run(root);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
}

function docs(root, command, ...args) {
  const result = spawnSync(
    process.execPath,
    [
      protocolCli,
      command,
      "--consumer",
      root,
      "--profile",
      protocolProfile,
      "--json",
      ...args
    ],
    {encoding: "utf8"}
  );
  let envelope;
  try {
    envelope = JSON.parse(result.stdout);
  } catch {
    assert.fail(`Docs Protocol did not return JSON. stderr: ${result.stderr}`);
  }
  return {envelope, status: result.status, stderr: result.stderr};
}

test("keeps protocol and Platform semantics in every repository gate", async () => {
  const [manifest, protocol] = await Promise.all([
    readFile(join(repositoryRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(join(repositoryRoot, protocolProfile), "utf8").then(parseYaml)
  ]);
  assert.equal(
    manifest.scripts["docs:protocol:check"],
    "pnpm docs:check && pnpm docs:semantic && pnpm docs:validators && pnpm docs:qualification"
  );
  assert.equal(
    manifest.scripts["docs:semantic"],
    "markdownlint-cli2 README.md AGENTS.md 'docs/**/*.md'"
  );
  assert.equal(
    manifest.scripts["docs:validators"],
    "pnpm docs:validate:platform-architecture && pnpm docs:validate:domain-materialization"
  );
  assert.match(
    manifest.scripts["docs:validate:platform-architecture"],
    /validate-platform-orchestrator-review\.mjs/u
  );
  assert.match(
    manifest.scripts["docs:validate:domain-materialization"],
    /validate-platform-domain\.mjs/u
  );
  assert.deepEqual(protocol.semanticValidatorIds, [
    "platform.architecture",
    "platform.domain-materialization",
    "platform.documentation-markdown"
  ]);
  for (const gate of ["check", "check:fast"]) {
    assert.match(manifest.scripts[gate], /pnpm docs:protocol:check/u);
  }
  assert.equal(manifest.scripts["check:changed"], "agent-teams-foundation agent-workflow changed --consumer .");
});

test("stages every declared Platform authoring type as data-only scenarios", async () => {
  const [qualification, authoringProfile] = await Promise.all([
    readFile(
      join(repositoryRoot, "architecture/foundation/docs-protocol-qualification.json"),
      "utf8"
    ).then(JSON.parse),
    readFile(
      join(repositoryRoot, "architecture/foundation/rollouts/docs-protocol-v2/document-authoring.yaml"),
      "utf8"
    ).then(parseYaml)
  ]);
  assert.deepEqual(
    qualification.scenarios.map(({type}) => type).toSorted(),
    authoringProfile.authoring.artifactTypes.map(({type}) => type).toSorted()
  );
  assert.equal(authoringProfile.schemaVersion, 3);
});

test("fails closed for an unknown owner", async () => {
  await disposableRepository(async (root) => {
    const target = join(root, "docs", "architecture", "README.md");
    const source = await readFile(target, "utf8");
    await writeFile(target, source.replace(
      "owner: architecture",
      "owner: architecture/unknown"
    ));

    const result = docs(root, "check");
    assert.notEqual(result.status, 0);
    assert.equal(result.envelope.outcome, "violation");
    assert.ok(
      result.envelope.diagnostics.some(({ruleId}) =>
        ruleId === "document.catalog.owner-unknown"
      ),
      JSON.stringify(result.envelope.diagnostics)
    );
  });
});

test("fails closed for an unresolved relation", async () => {
  await disposableRepository(async (root) => {
    const target = join(root, "docs", "architecture", "README.md");
    const source = await readFile(target, "utf8");
    await writeFile(target, source.replace(
      "summary: Navigation for current and proposed Platform architecture.",
      "summary: Navigation for current and proposed Platform architecture.\nrelated:\n  - missing.document"
    ));

    const result = docs(root, "check");
    assert.notEqual(result.status, 0);
    assert.equal(result.envelope.outcome, "violation");
    assert.ok(
      result.envelope.diagnostics.some(({ruleId}) =>
        ruleId === "docs.metadata.common-semantics"
      ),
      JSON.stringify(result.envelope.diagnostics)
    );
  });
});

test("fails closed for an unresolved blocker reference", async () => {
  await disposableRepository(async (root) => {
    const target = join(root, "docs", "architecture", "README.md");
    const source = await readFile(target, "utf8");
    await writeFile(target, source.replace(
      "summary: Navigation for current and proposed Platform architecture.",
      "summary: Navigation for current and proposed Platform architecture.\nblocked_by:\n  - missing.blocker"
    ));

    const result = docs(root, "check");
    assert.notEqual(result.status, 0);
    assert.equal(result.envelope.outcome, "violation");
    assert.ok(
      result.envelope.diagnostics.some(({ruleId}) =>
        ruleId === "docs.metadata.common-semantics"
      ),
      JSON.stringify(result.envelope.diagnostics)
    );
  });
});

test("fails closed for a stale code anchor", async () => {
  await disposableRepository(async (root) => {
    const target = join(root, "docs", "architecture", "README.md");
    const source = await readFile(target, "utf8");
    await writeFile(target, source.replace(
      "summary: Navigation for current and proposed Platform architecture.",
      "summary: Navigation for current and proposed Platform architecture.\ncode_anchors:\n  - pattern: packages/missing.ts\n    enforcement: required"
    ));

    const result = docs(root, "check");
    assert.notEqual(result.status, 0);
    assert.equal(result.envelope.outcome, "violation");
    assert.ok(result.envelope.diagnostics.some(({ruleId}) =>
      ruleId.includes("anchor")
    ));
  });
});
