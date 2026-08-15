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

import {runDocsProtocolQualification} from "@agent-teams/docs-protocol/qualification";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const protocolPackage = fileURLToPath(
  import.meta.resolve("@agent-teams/docs-protocol/package.json")
);
const protocolCli = join(dirname(protocolPackage), "dist/cli.js");
const protocolProfile = "architecture/foundation/docs-protocol.yaml";

async function disposableRepository(run) {
  const root = await mkdtemp(join(tmpdir(), "platform-docs-protocol-"));
  try {
    await cp(join(repositoryRoot, "docs"), join(root, "docs"), {recursive: true});
    await mkdir(join(root, "architecture", "foundation"), {recursive: true});
    await cp(
      join(repositoryRoot, "architecture", "foundation", "document-authoring.yaml"),
      join(root, "architecture", "foundation", "document-authoring.yaml")
    );
    await cp(
      join(repositoryRoot, "architecture", "foundation", "docs-protocol.yaml"),
      join(root, "architecture", "foundation", "docs-protocol.yaml")
    );
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
  const manifest = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  assert.equal(manifest.scripts["docs:protocol:check"], "pnpm docs:check && pnpm docs:semantic");
  assert.equal(
    manifest.scripts["docs:semantic"],
    "markdownlint-cli2 README.md AGENTS.md 'docs/**/*.md'"
  );
  for (const gate of ["check", "check:fast", "check:changed"]) {
    assert.match(manifest.scripts[gate], /pnpm docs:protocol:check/u);
  }
});

test("qualifies Platform authoring through the shared disposable runner", async () => {
  await disposableRepository(async (root) => {
    const receipt = await runDocsProtocolQualification({
      fixtureRoot: root,
      scenario: {
        find: {
          query: {id: "ADR-0001"},
          expectedIds: ["ADR-0001"]
        },
        newDocument: {
          intent: {
            type: "adr",
            id: "ADR-9998",
            title: "Disposable Protocol Qualification",
            owner: "project-management",
            summary: "Qualifies Platform ADR authoring without touching a real repository."
          },
          related: ["ADR-0001"]
        }
      }
    });
    assert.equal(receipt.projectId, "agent-teams-platform");
    assert.equal(
      receipt.appliedDocumentPath,
      "docs/decisions/9998-disposable-protocol-qualification.md"
    );
  });
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
        ruleId === "document.catalog.metadata-invalid"
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

test("keeps non-authorable Platform document types unavailable", async () => {
  await disposableRepository(async (root) => {
    const disabled = docs(root, "new",
      "--type", "bounded-context",
      "--id", "domain.contexts.disposable",
      "--title", "Disposable Context",
      "--owner", "product/project-management",
      "--summary", "Must remain unavailable to the generic writer.",
      "--destination", "docs/domain/contexts/disposable/README.md",
      "--dry-run");
    assert.notEqual(disabled.status, 0);
    assert.equal(disabled.envelope.outcome, "invalid-input");
  });
});
